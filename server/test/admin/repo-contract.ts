// Repository contract: the SAME assertions run against every AdminStore implementation (memory, MariaDB).
import { beforeEach, describe, expect, it } from 'vitest';
import type { AdminStore, AdminUser, SessionRow, StoredPromo } from '../../src/modules/admin/store.ts';

const T0 = new Date('2026-10-06T12:00:00Z');
const user = (over: Partial<Omit<AdminUser, 'id'>> = {}): Omit<AdminUser, 'id'> => ({
  username: 'carlos', passwordHash: '$argon2id$v=19$m=64,t=1,p=1$c2FsdA$aGFzaA', mustChangePassword: true, failedAttempts: 0, lockedUntil: null,
  lastLoginAt: null, isActive: true, mfaMethod: null, totpEnabledAt: null, ...over,
});
const promo = (id: string, over: Partial<StoredPromo> = {}): StoredPromo => ({
  id, placeholder: false, title: `Promo ${id}`, description: 'Descripcion', image: '/images/promos/promo-abc-900.webp', image_alt: 'alt'.repeat(60),
  price_before: 300.5, price_promo: 222, product_slug: 'recta', cotizador_params: { vidrio: 'claro' }, starts_on: '2026-10-01', ends_on: '2026-10-31',
  rules: ['Instalada', 'Entrega en 5 días ñandú'], status: 'draft', sort_order: 0, created_at: '2026-10-06T12:00:00.000Z', updated_at: '2026-10-06T12:00:00.000Z', ...over,
});

export function repoContract(name: string, make: () => Promise<{ store: AdminStore; reset: () => Promise<void> }>): void {
  describe(`repository contract: ${name}`, () => {
    let store: AdminStore;
    beforeEach(async () => {
      const m = await make();
      await m.reset();
      store = m.store;
    });

    it('users: insert assigns an id; find by username (case-insensitive) and by id; count', async () => {
      expect(await store.countUsers()).toBe(0);
      const u = await store.saveUser(user());
      expect(u.id).toBeGreaterThan(0);
      expect(await store.countUsers()).toBe(1);
      expect(await store.findUserByUsername('CARLOS')).toMatchObject({ id: u.id, username: 'carlos', mustChangePassword: true, isActive: true, lockedUntil: null, mfaMethod: null });
      expect(await store.findUserById(u.id)).toMatchObject({ username: 'carlos' });
      expect(await store.findUserByUsername('nadie')).toBeNull();
      expect(await store.findUserById(999_999)).toBeNull();
    });
    it('users: update round-trips dates and flags', async () => {
      const u = await store.saveUser(user());
      const until = new Date('2026-10-06T12:05:00Z');
      await store.saveUser({ ...u, failedAttempts: 5, lockedUntil: until, lastLoginAt: T0, mustChangePassword: false, mfaMethod: 'totp', totpEnabledAt: T0 });
      const back = await store.findUserById(u.id);
      expect(back).toMatchObject({ failedAttempts: 5, mustChangePassword: false, mfaMethod: 'totp' });
      expect(back?.lockedUntil?.toISOString()).toBe(until.toISOString());
      expect(back?.lastLoginAt?.toISOString()).toBe(T0.toISOString());
      expect(await store.countUsers()).toBe(1);
    });
    it('incrementFailedAttempts is atomic under concurrency', async () => {
      const u = await store.saveUser(user());
      const counts = await Promise.all(Array.from({ length: 8 }, () => store.incrementFailedAttempts(u.id)));
      expect([...counts].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect((await store.findUserById(u.id))?.failedAttempts).toBe(8);
      expect(await store.incrementFailedAttempts(424_242)).toBe(0);
    });
    it('sessions: create, find, touch, delete, delete all of a user', async () => {
      const u = await store.saveUser(user());
      const exp = new Date(T0.getTime() + 8 * 3600_000);
      const s = (idHash: string): SessionRow => ({ idHash, adminId: u.id, csrfToken: 'c'.repeat(64), stage: 'active', createdAt: T0, lastSeenAt: T0, expiresAt: exp });
      await store.createSession(s('a'.repeat(64)));
      await store.createSession(s('b'.repeat(64)));
      const found = await store.findSession('a'.repeat(64));
      expect(found).toMatchObject({ adminId: u.id, stage: 'active', csrfToken: 'c'.repeat(64) });
      expect(found?.expiresAt.toISOString()).toBe(exp.toISOString());
      const later = new Date('2026-10-06T12:10:00Z');
      await store.touchSession('a'.repeat(64), later);
      expect((await store.findSession('a'.repeat(64)))?.lastSeenAt.toISOString()).toBe(later.toISOString());
      await store.deleteSession('a'.repeat(64));
      expect(await store.findSession('a'.repeat(64))).toBeNull();
      await store.deleteUserSessions(u.id);
      expect(await store.findSession('b'.repeat(64))).toBeNull();
      expect(await store.findSession('z'.repeat(64))).toBeNull();
    });
    it('promos: upsert round-trip (decimals, rules order, vidrio, unicode) and list order', async () => {
      await store.save(promo('promo-b', { sort_order: 2, starts_on: '2026-10-05' }));
      await store.save(promo('promo-a', { sort_order: 1 }));
      const noGlass = promo('promo-c', { sort_order: 1, starts_on: '2026-09-01', price_before: null });
      delete noGlass.cotizador_params;
      await store.save(noGlass);
      expect((await store.list()).map((p) => p.id)).toEqual(['promo-c', 'promo-a', 'promo-b']);
      expect(await store.get('promo-a')).toEqual(promo('promo-a', { sort_order: 1 }));
      const c = await store.get('promo-c');
      expect(c?.price_before).toBeNull();
      expect(c?.cotizador_params).toBeUndefined();
      expect(await store.get('nope')).toBeNull();
    });
    it('promos: save again updates in place (rules replaced), keeps created_at; archived status persists', async () => {
      await store.save(promo('promo-a'));
      await store.save(promo('promo-a', { title: 'Nuevo', rules: ['solo una'], status: 'published', updated_at: '2026-10-07T00:00:00.000Z' }));
      expect((await store.list()).length).toBe(1);
      expect(await store.get('promo-a')).toMatchObject({ title: 'Nuevo', rules: ['solo una'], status: 'published', created_at: '2026-10-06T12:00:00.000Z', updated_at: '2026-10-07T00:00:00.000Z' });
      await store.save(promo('promo-a', { status: 'archived' }));
      expect((await store.get('promo-a'))?.status).toBe('archived');
    });
    it('promos: a hostile string is stored as data (parameterized)', async () => {
      const evil = "x'); DROP TABLE promotions; --";
      await store.save(promo('promo-evil', { title: evil, rules: [evil] }));
      expect(await store.get('promo-evil')).toMatchObject({ title: evil, rules: [evil] });
      expect(await store.findUserByUsername("' OR 1=1 --")).toBeNull();
    });
    it('withPublishLock serializes critical sections and releases on error', async () => {
      const order: string[] = [];
      const run = (tag: string): Promise<void> =>
        store.withPublishLock(async () => {
          order.push(`${tag}-in`);
          await new Promise((r) => setTimeout(r, 40));
          order.push(`${tag}-out`);
        });
      await Promise.all([run('1'), run('2')]);
      expect(order[0]?.slice(0, 1)).toBe(order[1]?.slice(0, 1));
      expect(order[2]?.slice(0, 1)).toBe(order[3]?.slice(0, 1));
      await expect(store.withPublishLock(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
      await expect(store.withPublishLock(() => Promise.resolve(7))).resolves.toBe(7);
    });
    it('audit appends entries without throwing (anon, cli, admin actors)', async () => {
      await store.saveUser(user());
      await store.audit({ at: T0, actor: 'anon', action: 'admin.login_failed' });
      await store.audit({ at: T0, actor: 'cli', action: 'admin.created', detail: { username: 'carlos' } });
      await store.audit({ at: T0, actor: 'carlos', action: 'promo.created', detail: { id: 'promo-a', status: 'draft' } });
    });
  });
}
