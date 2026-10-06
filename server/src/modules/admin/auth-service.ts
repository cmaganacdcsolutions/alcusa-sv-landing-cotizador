import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hashPassword, passwordProblems, verifyPassword, type Argon2Params, DEFAULT_PARAMS } from './password.ts';
import { type MfaMode, nextStage, type Stage } from './stage.ts';
import type { AdminRepo, AdminUser, SessionRow } from './store.ts';

export const IDLE_MS = 30 * 60_000;
export const ABSOLUTE_MS = 8 * 60 * 60_000;
const LOCK_MINUTES = [1, 5, 15, 60];
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export type LoginResult =
  | { kind: 'ok'; sessionId: string; csrf: string; stage: Stage; mustChange: boolean }
  | { kind: 'invalid' }
  | { kind: 'locked'; until: Date };

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

  constructor(o: AuthOptions) {
    this.repo = o.repo;
    this.mfaMode = o.mfaMode ?? 'off';
    this.now = o.now ?? (() => new Date());
    this.params = o.params ?? DEFAULT_PARAMS;
  }

  /** Lock duration after the Nth failure: every 5th failure locks 1, 5, 15, then 60 min. */
  static lockMinutes(failedAttempts: number): number | null {
    if (failedAttempts === 0 || failedAttempts % 5 !== 0) return null;
    return LOCK_MINUTES[Math.min(failedAttempts / 5, LOCK_MINUTES.length) - 1] ?? 60;
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

  async login(username: string, password: string): Promise<LoginResult> {
    const now = this.now();
    const user = await this.repo.findUserByUsername(username);
    if (!user || !user.isActive) {
      // Dummy verification so unknown users cost the same as wrong passwords.
      this.dummy ??= hashPassword('dummy-password-for-timing', this.params);
      await verifyPassword(password, await this.dummy);
      await this.repo.audit({ at: now, actor: 'anon', action: 'admin.login_failed' });
      return { kind: 'invalid' };
    }
    if (user.lockedUntil && user.lockedUntil > now) return { kind: 'locked', until: user.lockedUntil };
    if (!(await verifyPassword(password, user.passwordHash))) {
      const failed = user.failedAttempts + 1;
      const mins = AuthService.lockMinutes(failed);
      const lockedUntil = mins ? new Date(now.getTime() + mins * 60_000) : null;
      await this.repo.saveUser({ ...user, failedAttempts: failed, lockedUntil });
      await this.repo.audit({ at: now, actor: user.username, action: lockedUntil ? 'admin.locked' : 'admin.login_failed' });
      return lockedUntil ? { kind: 'locked', until: lockedUntil } : { kind: 'invalid' };
    }
    await this.repo.saveUser({ ...user, failedAttempts: 0, lockedUntil: null, lastLoginAt: now });
    await this.repo.audit({ at: now, actor: user.username, action: 'admin.login_ok' });
    const stage = nextStage(user, this.mfaMode);
    return { kind: 'ok', ...(await this.openSession(user.id, stage)), stage, mustChange: user.mustChangePassword };
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

/** Origin / Sec-Fetch-Site check for state-changing requests. */
export function sameOrigin(headers: Record<string, string | string[] | undefined>, host: string | undefined): boolean {
  const site = headers['sec-fetch-site'];
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') return false;
  const origin = headers['origin'];
  if (typeof origin === 'string') {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  return true;
}
