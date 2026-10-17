import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hashPassword, passwordProblems, verifyPassword, type Argon2Params, DEFAULT_PARAMS } from './password.ts';
import { LoginThrottle } from './login-throttle.ts';
import { type MfaMode, nextStage, type Stage } from './stage.ts';
import type { AdminRepo, AdminUser, SessionRow } from './store.ts';

export const IDLE_MS = 30 * 60_000;
export const ABSOLUTE_MS = 8 * 60 * 60_000;
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export type LoginResult =
  | { kind: 'ok'; sessionId: string; csrf: string; stage: Stage; mustChange: boolean }
  | { kind: 'invalid' };

export interface SessionInfo {
  session: SessionRow;
  user: AdminUser;
}

export interface AuthOptions {
  repo: AdminRepo;
  mfaMode?: MfaMode;
  now?: () => Date;
  params?: Argon2Params;
}

export class AuthService {
  private readonly repo: AdminRepo;
  private readonly mfaMode: MfaMode;
  private readonly now: () => Date;
  private readonly params: Argon2Params;
  private dummy: Promise<string> | null = null;
  private readonly throttle = new LoginThrottle();

  constructor(o: AuthOptions) {
    this.repo = o.repo;
    this.mfaMode = o.mfaMode ?? 'off';
    this.now = o.now ?? (() => new Date());
    this.params = o.params ?? DEFAULT_PARAMS;
  }

  async createAdmin(username: string, password: string, mustChange = true): Promise<AdminUser> {
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) throw new Error('Usuario invalido (3-40 caracteres: letras, numeros, . _ -)');
    const problems = passwordProblems(password, username);
    if (problems.length) throw new Error(problems.join(' '));
    const user = await this.repo.saveUser({
      username, passwordHash: await hashPassword(password, this.params), mustChangePassword: mustChange, failedAttempts: 0,
      lockedUntil: null, lastLoginAt: null, isActive: true, mfaMethod: null, totpEnabledAt: null,
    });
    await this.repo.audit({ at: this.now(), actor: 'cli', action: 'admin.created', detail: { username } });
    return user;
  }

  /**
   * Throttled and unknown-user attempts are indistinguishable from a wrong password (same result, same cost, SEC-007).
   * `ip` is the client address the HTTP edge resolved; the throttle key is (ip, username).
   */
  async login(username: string, password: string, ip = 'unknown'): Promise<LoginResult> {
    const now = this.now();
    const user = await this.repo.findUserByUsername(username);
    const blocked = this.throttle.isBlocked(ip, username, now);
    // Always pay one argon2 verification (dummy hash for unknown/inactive/throttled) so timing does not leak the state.
    const target = user && user.isActive && !blocked ? user.passwordHash : await (this.dummy ??= hashPassword('dummy-password-for-timing', this.params));
    const good = await verifyPassword(password, target);
    if (!user || !user.isActive || blocked || !good) {
      const started = blocked ? false : this.throttle.fail(ip, username, now);
      await this.repo.audit({ at: now, actor: user && user.isActive ? user.username : 'anon', action: started ? 'admin.locked' : 'admin.login_failed' });
      return { kind: 'invalid' };
    }
    this.throttle.success(ip, username);
    await this.repo.saveUser({ ...user, failedAttempts: 0, lockedUntil: null, lastLoginAt: now });
    await this.repo.audit({ at: now, actor: user.username, action: 'admin.login_ok' });
    const stage = nextStage(user, this.mfaMode);
    return { kind: 'ok', ...(await this.openSession(user.id, stage)), stage, mustChange: user.mustChangePassword };
  }

  /** CLI rotation (SEC-010): new hash, must_change_password, every session of that admin killed, audit row. */
  async rotatePassword(username: string, password: string): Promise<AdminUser> {
    const user = await this.repo.findUserByUsername(username);
    if (!user) throw new Error('No existe ese usuario admin.');
    const problems = passwordProblems(password, user.username);
    if (problems.length) throw new Error(problems.join(' '));
    const saved = await this.repo.saveUser({ ...user, passwordHash: await hashPassword(password, this.params), mustChangePassword: true, failedAttempts: 0, lockedUntil: null, isActive: true });
    await this.repo.deleteUserSessions(user.id);
    await this.repo.audit({ at: this.now(), actor: 'cli', action: 'admin.password_rotated', detail: { username: user.username } });
    return saved;
  }

  private async openSession(adminId: number, stage: Stage): Promise<{ sessionId: string; csrf: string }> {
    const now = this.now();
    const sessionId = randomBytes(32).toString('hex');
    const csrf = randomBytes(32).toString('hex');
    await this.repo.createSession({
      idHash: sha256(sessionId), adminId, csrfToken: csrf, stage, createdAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + ABSOLUTE_MS),
    });
    return { sessionId, csrf };
  }

  /** Returns the session only if it exists, is within idle/absolute limits AND stage is 'active'. */
  async resolve(sessionId: string | undefined): Promise<SessionInfo | null> {
    if (!sessionId || !/^[0-9a-f]{64}$/.test(sessionId)) return null;
    const idHash = sha256(sessionId);
    const session = await this.repo.findSession(idHash);
    if (!session) return null;
    const now = this.now();
    if (now >= session.expiresAt || now.getTime() - session.lastSeenAt.getTime() > IDLE_MS) {
      await this.repo.deleteSession(idHash);
      return null;
    }
    if (session.stage !== 'active') return null;
    const user = await this.repo.findUserById(session.adminId);
    if (!user || !user.isActive) return null;
    await this.repo.touchSession(idHash, now);
    return { session, user };
  }

  async logout(sessionId: string | undefined): Promise<void> {
    if (sessionId) await this.repo.deleteSession(sha256(sessionId));
  }

  /** Changes the password, kills every session of the user and opens a fresh one (id rotation). */
  async changePassword(info: SessionInfo, current: string, next: string, confirm: string): Promise<{ ok: true; sessionId: string; csrf: string } | { ok: false; problems: string[] }> {
    if (!(await verifyPassword(current, info.user.passwordHash))) return { ok: false, problems: ['La contraseña actual no es correcta.'] };
    const problems = passwordProblems(next, info.user.username);
    if (next !== confirm) problems.push('Las contraseñas nuevas no coinciden.');
    if (next === current) problems.push('Debe ser distinta de la actual.');
    if (problems.length) return { ok: false, problems };
    await this.repo.saveUser({ ...info.user, passwordHash: await hashPassword(next, this.params), mustChangePassword: false });
    await this.repo.deleteUserSessions(info.user.id);
    await this.repo.audit({ at: this.now(), actor: info.user.username, action: 'admin.password_changed' });
    return { ok: true, ...(await this.openSession(info.user.id, 'active')) };
  }
}

/** Constant-time CSRF token comparison. */
export function csrfValid(expected: string, given: unknown): boolean {
  if (typeof given !== 'string' || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

/**
 * Origin / Sec-Fetch-Site check for state-changing requests (SEC-008). Browsers always send at least one of the two on a
 * POST, so a request with neither is not a browser and is refused; `Origin: null` (sandboxed/no-referrer contexts) is
 * refused too. The admin pages set `Referrer-Policy: same-origin` so legitimate form posts carry the real Origin.
 */
export function sameOrigin(headers: Record<string, string | string[] | undefined>, host: string | undefined): boolean {
  const site = headers['sec-fetch-site'];
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') return false;
  const origin = headers['origin'];
  if (typeof origin === 'string') {
    if (origin === 'null') return false;
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  return typeof site === 'string';
}
