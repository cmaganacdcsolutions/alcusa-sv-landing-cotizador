import { describe, expect, it } from 'vitest';
import { AuthService, ABSOLUTE_MS, csrfValid, IDLE_MS, sameOrigin } from '../../src/modules/admin/auth-service.ts';
import { parseCreateAdminArgs } from '../../src/cli/create-admin-args.ts';
import { LoginThrottle } from '../../src/modules/admin/login-throttle.ts';
import { hashPassword, passwordProblems, verifyPassword } from '../../src/modules/admin/password.ts';
import { nextStage } from '../../src/modules/admin/stage.ts';
import { MemoryAdminStore } from '../../src/modules/admin/store.ts';

const FAST = { memory: 64, passes: 1, parallelism: 1 };
const PW = 'correct horse battery staple';

async function setup(mode: 'off' | 'optional' | 'required' = 'off') {
  const t = { v: new Date('2026-10-06T12:00:00Z') };
  const store = new MemoryAdminStore();
  const auth = new AuthService({ repo: store, now: () => t.v, params: FAST, mfaMode: mode });
  await auth.createAdmin('carlos', PW, false);
  return { t, store, auth };
}

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one (argon2id PHC)', async () => {
    const h = await hashPassword(PW, FAST);
    expect(h.startsWith('$argon2id$v=19$m=64,t=1,p=1$')).toBe(true);
    expect(await verifyPassword(PW, h)).toBe(true);
    expect(await verifyPassword(`${PW}x`, h)).toBe(false);
    expect(await verifyPassword(PW, 'garbage')).toBe(false);
  });
  it('enforces the policy (>=14, not the username, not trivially common)', () => {
    expect(passwordProblems('short', 'carlos')).not.toEqual([]);
    expect(passwordProblems('xxcarlosxxxxxxxxxx', 'carlos')).not.toEqual([]);
    expect(passwordProblems('aaaaaaaaaaaaaaaa', 'carlos')).not.toEqual([]);
    expect(passwordProblems(PW, 'carlos')).toEqual([]);
  });
});

describe('login throttle (per IP + user, SEC-007)', () => {
  it('backs off every 5th failure with 1/5/15/60 min steps, and never verifies a blocked pair', async () => {
    expect([1, 4, 5, 9, 10, 15, 20, 25].map((n) => LoginThrottle.backoffMinutes(n))).toEqual([null, null, 1, null, 5, 15, 60, 60]);
    const { t, auth, store } = await setup();
    for (let i = 0; i < 5; i++) expect((await auth.login('carlos', 'nope-nope-nope-1', '203.0.113.9')).kind).toBe('invalid');
    // the right password from the throttled pair is refused with the same generic result
    expect((await auth.login('carlos', PW, '203.0.113.9')).kind).toBe('invalid');
    t.v = new Date(t.v.getTime() + 61_000);
    expect((await auth.login('carlos', PW, '203.0.113.9')).kind).toBe('ok');
    expect(store.auditLog.some((e) => e.action === 'admin.locked')).toBe(true);
  });
  it('an attacker cannot lock the admin out: another IP still logs in, and the account is never hard-locked', async () => {
    const { auth, store } = await setup();
    for (let i = 0; i < 30; i++) await auth.login('carlos', 'nope-nope-nope-1', '203.0.113.9');
    expect((await auth.login('carlos', PW, '198.51.100.7')).kind).toBe('ok');
    expect((await store.findUserByUsername('carlos'))?.lockedUntil).toBeNull();
  });
  it('unknown users are throttled exactly like existing ones (same result kind)', async () => {
    const { auth } = await setup();
    const known: string[] = [];
    const unknown: string[] = [];
    for (let i = 0; i < 7; i++) {
      known.push((await auth.login('carlos', 'nope-nope-nope-1', '203.0.113.9')).kind);
      unknown.push((await auth.login('ghost', 'nope-nope-nope-1', '203.0.113.9')).kind);
    }
    expect(unknown).toEqual(known);
  });
});

describe('password rotation (SEC-010)', () => {
  it('replaces the hash, forces a change, kills every session and audits', async () => {
    const { auth, store } = await setup();
    const r = await auth.login('carlos', PW);
    if (r.kind !== 'ok') throw new Error('login');
    const NEW = 'a brand new long passphrase';
    await auth.rotatePassword('carlos', NEW);
    expect(await auth.resolve(r.sessionId)).toBeNull();
    expect((await auth.login('carlos', PW, 'x')).kind).toBe('invalid');
    const ok = await auth.login('carlos', NEW, 'y');
    expect(ok.kind === 'ok' && ok.mustChange).toBe(true);
    const e = store.auditLog.find((x) => x.action === 'admin.password_rotated');
    expect(e).toMatchObject({ actor: 'cli', detail: { username: 'carlos' } });
    expect(JSON.stringify(store.auditLog)).not.toContain(NEW);
  });
  it('enforces the password policy and requires an existing user', async () => {
    const { auth } = await setup();
    await expect(auth.rotatePassword('carlos', 'short')).rejects.toThrow();
    await expect(auth.rotatePassword('ghost', PW)).rejects.toThrow();
  });
  it('CLI args carry only the username and a mode flag (never a password)', () => {
    expect(parseCreateAdminArgs(['alcusa', '--rotate'])).toEqual({ username: 'alcusa', mode: 'rotate' });
    expect(parseCreateAdminArgs(['alcusa', '--prompt'])).toEqual({ username: 'alcusa', mode: 'create' });
    expect(() => parseCreateAdminArgs(['alcusa', '--rotate', 'hunter2hunter2hunter2'])).toThrow();
    expect(() => parseCreateAdminArgs(['alcusa'])).toThrow();
  });
});

describe('sessions', () => {
  it('stores only the SHA-256 of the id and resolves an active session', async () => {
    const { auth, store } = await setup();
    const r = await auth.login('carlos', PW);
    if (r.kind !== 'ok') throw new Error('login');
    expect(await store.findSession(r.sessionId)).toBeNull(); // raw id is not a key
    expect((await auth.resolve(r.sessionId))?.user.username).toBe('carlos');
  });
  it('expires on idle (30 min) and on absolute (8 h) limits', async () => {
    const { t, auth } = await setup();
    const a = await auth.login('carlos', PW);
    if (a.kind !== 'ok') throw new Error('login');
    t.v = new Date(t.v.getTime() + IDLE_MS + 1000);
    expect(await auth.resolve(a.sessionId)).toBeNull();
    const b = await auth.login('carlos', PW);
    if (b.kind !== 'ok') throw new Error('login');
    // keep it alive with activity every 20 min until past 8 h
    let alive = true;
    for (let i = 0; i < Math.ceil(ABSOLUTE_MS / (20 * 60_000)) + 1; i++) {
      t.v = new Date(t.v.getTime() + 20 * 60_000);
      alive = (await auth.resolve(b.sessionId)) !== null;
      if (!alive) break;
    }
    expect(alive).toBe(false);
  });
  it('logout deletes the session; password change rotates it and kills the old one', async () => {
    const { auth } = await setup();
    const a = await auth.login('carlos', PW);
    if (a.kind !== 'ok') throw new Error('login');
    const info = await auth.resolve(a.sessionId);
    const res = await auth.changePassword(info!, PW, 'another long passphrase 99', 'another long passphrase 99');
    expect(res.ok).toBe(true);
    expect(await auth.resolve(a.sessionId)).toBeNull();
    if (res.ok) {
      expect(await auth.resolve(res.sessionId)).not.toBeNull();
      await auth.logout(res.sessionId);
      expect(await auth.resolve(res.sessionId)).toBeNull();
    }
  });
});

describe('2FA seam (mode off in v1.0)', () => {
  const u = { mfaMethod: null, totpEnabledAt: null } as const;
  it('nextStage: off -> active; required -> mfa_pending; optional depends on enrolment', () => {
    expect(nextStage(u, 'off')).toBe('active');
    expect(nextStage(u, 'required')).toBe('mfa_pending');
    expect(nextStage(u, 'optional')).toBe('active');
    expect(nextStage({ mfaMethod: 'totp', totpEnabledAt: new Date() }, 'optional')).toBe('mfa_pending');
  });
  it('a session in mfa_pending never resolves for the panel', async () => {
    const { auth } = await setup('required');
    const r = await auth.login('carlos', PW);
    if (r.kind !== 'ok') throw new Error('login');
    expect(r.stage).toBe('mfa_pending');
    expect(await auth.resolve(r.sessionId)).toBeNull();
  });
});

describe('CSRF / origin helpers', () => {
  it('rejects wrong, missing and different-length tokens', () => {
    expect(csrfValid('a'.repeat(64), 'a'.repeat(64))).toBe(true);
    expect(csrfValid('a'.repeat(64), 'b'.repeat(64))).toBe(false);
    expect(csrfValid('a'.repeat(64), 'a')).toBe(false);
    expect(csrfValid('a'.repeat(64), undefined)).toBe(false);
  });
  it('rejects cross-site and foreign-origin requests', () => {
    expect(sameOrigin({ 'sec-fetch-site': 'cross-site' }, 'localhost:4500')).toBe(false);
    expect(sameOrigin({ origin: 'https://evil.example' }, 'localhost:4500')).toBe(false);
    expect(sameOrigin({ origin: 'http://localhost:4500' }, 'localhost:4500')).toBe(true);
    expect(sameOrigin({ 'sec-fetch-site': 'same-origin' }, 'localhost:4500')).toBe(true);
    // SEC-008: neither header -> not a browser; Origin: null is refused even when Sec-Fetch-Site says same-origin
    expect(sameOrigin({}, 'localhost:4500')).toBe(false);
    expect(sameOrigin({ origin: 'null', 'sec-fetch-site': 'same-origin' }, 'localhost:4500')).toBe(false);
    expect(sameOrigin({ origin: 'null' }, 'localhost:4500')).toBe(false);
    expect(sameOrigin({ origin: 'null', 'sec-fetch-site': 'cross-site' }, 'localhost:4500')).toBe(false);
  });
});
