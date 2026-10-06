import { describe, expect, it } from 'vitest';
import { AuthService, ABSOLUTE_MS, csrfValid, IDLE_MS, sameOrigin } from '../../src/modules/admin/auth-service.ts';
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

describe('login lockout', () => {
  it('locks after 5 failures with 1/5/15/60 min steps, and never verifies while locked', async () => {
    expect([1, 4, 5, 9, 10, 15, 20, 25].map((n) => AuthService.lockMinutes(n))).toEqual([null, null, 1, null, 5, 15, 60, 60]);
    const { t, auth, store } = await setup();
    for (let i = 0; i < 4; i++) expect((await auth.login('carlos', 'nope-nope-nope-1')).kind).toBe('invalid');
    expect((await auth.login('carlos', 'nope-nope-nope-1')).kind).toBe('locked');
    // correct password during the lock is refused
    expect((await auth.login('carlos', PW)).kind).toBe('locked');
    t.v = new Date(t.v.getTime() + 61_000);
    const ok = await auth.login('carlos', PW);
    expect(ok.kind).toBe('ok');
    expect((await store.findUserByUsername('carlos'))?.failedAttempts).toBe(0);
    expect(store.auditLog.some((e) => e.action === 'admin.locked')).toBe(true);
  });
  it('unknown user is the same generic failure', async () => {
    const { auth } = await setup();
    expect((await auth.login('ghost', PW)).kind).toBe('invalid');
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
    expect(sameOrigin({}, 'localhost:4500')).toBe(true);
  });
});
