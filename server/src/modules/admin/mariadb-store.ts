// MariaDB adapter for AdminRepo + PromoRepo (ADMIN_STORE=mariadb). Runs as alcusa_app (DML only, see db/grants.sql).
// Parameterized statements only (pool.execute / conn.execute). DATETIME is UTC with second precision.
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { PromoRecord } from '../promotions/schema.ts';
import type { AdminRepo, AdminUser, AuditEntry, PromoRepo, SessionRow, StoredPromo } from './store.ts';

const toSql = (d: Date): string => d.toISOString().slice(0, 19).replace('T', ' ');
const fromSql = (s: string): Date => new Date(`${s.replace(' ', 'T')}Z`);
const fromSqlOrNull = (s: string | null): Date | null => (s ? fromSql(s) : null);
const isoOf = (s: string): string => fromSql(s).toISOString();
const PUBLISH_LOCK = 'alcusa_promo_publish';
const LOCK_TIMEOUT_S = 10;

type Row = RowDataPacket;

const userOf = (r: Row): AdminUser => ({
  id: Number(r['id']),
  username: String(r['username']),
  passwordHash: String(r['password_hash']),
  mustChangePassword: Boolean(r['must_change_password']),
  failedAttempts: Number(r['failed_attempts']),
  lockedUntil: fromSqlOrNull(r['locked_until'] as string | null),
  lastLoginAt: fromSqlOrNull(r['last_login_at'] as string | null),
  isActive: Boolean(r['is_active']),
  mfaMethod: r['mfa_method'] === 'totp' ? 'totp' : null,
  totpEnabledAt: fromSqlOrNull(r['totp_enabled_at'] as string | null),
});
export class MariaDbAdminStore implements AdminRepo, PromoRepo {
  constructor(private readonly pool: Pool) {}

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async tx<T>(fn: (c: PoolConnection) => Promise<T>): Promise<T> {
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      const out = await fn(c);
      await c.commit();
      return out;
    } catch (err) {
      await c.rollback().catch(() => undefined);
      throw err;
    } finally {
      c.release();
    }
  }

  // ---- AdminRepo ----
  async findUserByUsername(username: string): Promise<AdminUser | null> {
    const [rows] = await this.pool.execute<Row[]>('SELECT id, username, password_hash, must_change_password, failed_attempts, locked_until, last_login_at, is_active, mfa_method, totp_enabled_at FROM admin_users WHERE username = ? LIMIT 1', [username]);
    return rows[0] ? userOf(rows[0]) : null;
  }
  async findUserById(id: number): Promise<AdminUser | null> {
    const [rows] = await this.pool.execute<Row[]>('SELECT id, username, password_hash, must_change_password, failed_attempts, locked_until, last_login_at, is_active, mfa_method, totp_enabled_at FROM admin_users WHERE id = ? LIMIT 1', [id]);
    return rows[0] ? userOf(rows[0]) : null;
  }
  async countUsers(): Promise<number> {
    const [rows] = await this.pool.execute<Row[]>('SELECT COUNT(*) AS n FROM admin_users');
    return Number(rows[0]?.['n'] ?? 0);
  }
  async saveUser(user: Omit<AdminUser, 'id'> & { id?: number }): Promise<AdminUser> {
    const v = [
      user.username,
      user.passwordHash,
      user.mustChangePassword ? 1 : 0,
      user.failedAttempts,
      user.lockedUntil ? toSql(user.lockedUntil) : null,
      user.lastLoginAt ? toSql(user.lastLoginAt) : null,
      user.isActive ? 1 : 0,
      user.mfaMethod,
      user.totpEnabledAt ? toSql(user.totpEnabledAt) : null,
    ];
    if (user.id !== undefined) {
      await this.pool.execute(
        'UPDATE admin_users SET username = ?, password_hash = ?, must_change_password = ?, failed_attempts = ?, locked_until = ?, last_login_at = ?, is_active = ?, mfa_method = ?, totp_enabled_at = ? WHERE id = ?',
        [...v, user.id],
      );
      return { ...user, id: user.id };
    }
    const [res] = await this.pool.execute<ResultSetHeader>(
      'INSERT INTO admin_users (username, password_hash, must_change_password, failed_attempts, locked_until, last_login_at, is_active, mfa_method, totp_enabled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      v,
    );
    return { ...user, id: res.insertId };
  }
  incrementFailedAttempts(id: number): Promise<number> {
    return this.tx(async (c) => {
      const [rows] = await c.execute<Row[]>('SELECT failed_attempts FROM admin_users WHERE id = ? FOR UPDATE', [id]);
      if (!rows[0]) return 0;
      const next = Number(rows[0]['failed_attempts']) + 1;
      await c.execute('UPDATE admin_users SET failed_attempts = ? WHERE id = ?', [next, id]);
      return next;
    });
  }
  async createSession(s: SessionRow): Promise<void> {
    await this.pool.execute(
      'INSERT INTO admin_sessions (id_hash, admin_id, csrf_token, stage, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [s.idHash, s.adminId, s.csrfToken, s.stage, toSql(s.createdAt), toSql(s.lastSeenAt), toSql(s.expiresAt)],
    );
  }
  async findSession(idHash: string): Promise<SessionRow | null> {
    const [rows] = await this.pool.execute<Row[]>(
      'SELECT id_hash, admin_id, csrf_token, stage, created_at, last_seen_at, expires_at FROM admin_sessions WHERE id_hash = ? LIMIT 1',
      [idHash],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      idHash: String(r['id_hash']),
      adminId: Number(r['admin_id']),
      csrfToken: String(r['csrf_token']),
      stage: r['stage'] as SessionRow['stage'],
      createdAt: fromSql(r['created_at'] as string),
      lastSeenAt: fromSql(r['last_seen_at'] as string),
      expiresAt: fromSql(r['expires_at'] as string),
    };
  }
  async touchSession(idHash: string, lastSeenAt: Date): Promise<void> {
    await this.pool.execute('UPDATE admin_sessions SET last_seen_at = ? WHERE id_hash = ?', [toSql(lastSeenAt), idHash]);
  }
  async deleteSession(idHash: string): Promise<void> {
    await this.pool.execute('DELETE FROM admin_sessions WHERE id_hash = ?', [idHash]);
  }
  async deleteUserSessions(adminId: number): Promise<void> {
    await this.pool.execute('DELETE FROM admin_sessions WHERE admin_id = ?', [adminId]);
  }
  async audit(e: AuditEntry): Promise<void> {
    const actorType = e.actor === 'cli' ? 'cli' : e.actor === 'system' ? 'system' : e.actor === 'anon' ? 'public' : 'admin';
    const detail = e.detail ?? {};
    const entityId = typeof detail['id'] === 'string' ? detail['id'].slice(0, 40) : null;
    const entityType = e.action.startsWith('promo.') ? 'promotion' : e.action.startsWith('admin.') ? 'admin' : null;
    // actor_id is resolved from the username; the name itself is also kept in diff (history survives user changes).
    await this.pool.execute(
      `INSERT INTO audit_log (at, actor_type, actor_id, action, entity_type, entity_id, diff)
       VALUES (?, ?, (SELECT id FROM admin_users WHERE username = ? LIMIT 1), ?, ?, ?, ?)`,
      [toSql(e.at), actorType, actorType === 'admin' ? e.actor : null, e.action.slice(0, 60), entityType, entityId, JSON.stringify({ actor: e.actor, ...detail })],
    );
  }

  // ---- PromoRepo ----
  private async hydrate(rows: Row[]): Promise<StoredPromo[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => Number(r['id']));
    const [ruleRows] = await this.pool.query<Row[]>(
      "SELECT promotion_id, params FROM promotion_rules WHERE rule_type = 'terms' AND enabled = 1 AND promotion_id IN (?) ORDER BY promotion_id, position, id",
      [ids],
    );
    const rules = new Map<number, string[]>();
    for (const r of ruleRows) {
      const raw: unknown = r['params'];
      // LONGTEXT+JSON_VALID returns a string on most servers; the driver may already have parsed it.
      const text = (typeof raw === 'string' ? (JSON.parse(raw) as { text?: unknown }) : (raw as { text?: unknown })).text;
      const key = Number(r['promotion_id']);
      if (typeof text === 'string') rules.set(key, [...(rules.get(key) ?? []), text]);
    }
    return rows.map((r) => {
      const rec: PromoRecord = {
        id: String(r['public_id']),
        placeholder: false,
        title: String(r['title']),
        description: String(r['description']),
        image: String(r['image_path'] ?? ''),
        image_alt: String(r['image_alt'] ?? ''),
        price_before: r['price_before'] === null ? null : Number(r['price_before']),
        price_promo: Number(r['price_promo']),
        product_slug: String(r['product_slug'] ?? ''),
        ...(r['cotizador_vidrio'] ? { cotizador_params: { vidrio: String(r['cotizador_vidrio']) } } : {}),
        starts_on: String(r['starts_on']),
        ends_on: String(r['ends_on']),
        rules: rules.get(Number(r['id'])) ?? [],
      };
      return {
        ...rec,
        status: r['status'] as StoredPromo['status'],
        sort_order: Number(r['sort_order']),
        created_at: isoOf(String(r['created_at'])),
        updated_at: isoOf(String(r['updated_at'])),
      };
    });
  }

  async list(): Promise<StoredPromo[]> {
    const [rows] = await this.pool.execute<Row[]>('SELECT id, public_id, title, description, price_before, price_promo, image_path, image_alt, product_slug, cotizador_vidrio, starts_on, ends_on, status, sort_order, created_at, updated_at FROM promotions WHERE public_id IS NOT NULL ORDER BY sort_order, starts_on, id');
    return this.hydrate(rows);
  }
  async get(id: string): Promise<StoredPromo | null> {
    const [rows] = await this.pool.execute<Row[]>('SELECT id, public_id, title, description, price_before, price_promo, image_path, image_alt, product_slug, cotizador_vidrio, starts_on, ends_on, status, sort_order, created_at, updated_at FROM promotions WHERE public_id = ? LIMIT 1', [id]);
    return (await this.hydrate(rows))[0] ?? null;
  }
  save(p: StoredPromo): Promise<void> {
    return this.tx(async (c) => {
      const values = [
        p.title, p.description, p.price_before, p.price_promo, p.image, p.image_alt, p.product_slug, p.cotizador_params?.vidrio ?? null,
        p.starts_on, p.ends_on, p.status, p.sort_order, toSql(new Date(p.updated_at)), p.id, toSql(new Date(p.created_at)),
      ];
      await c.execute(
        `INSERT INTO promotions (title, description, price_before, price_promo, image_path, image_alt, product_slug, cotizador_vidrio, starts_on, ends_on, status, sort_order, updated_at, public_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), price_before = VALUES(price_before), price_promo = VALUES(price_promo),
           image_path = VALUES(image_path), image_alt = VALUES(image_alt), product_slug = VALUES(product_slug), cotizador_vidrio = VALUES(cotizador_vidrio),
           starts_on = VALUES(starts_on), ends_on = VALUES(ends_on), status = VALUES(status), sort_order = VALUES(sort_order), updated_at = VALUES(updated_at)`,
        values,
      );
      const [rows] = await c.execute<Row[]>('SELECT id FROM promotions WHERE public_id = ?', [p.id]);
      const pk = Number(rows[0]?.['id']);
      await c.execute('DELETE FROM promotion_rules WHERE promotion_id = ?', [pk]);
      for (const [i, text] of p.rules.entries()) {
        await c.execute("INSERT INTO promotion_rules (promotion_id, rule_type, params, position) VALUES (?, 'terms', ?, ?)", [pk, JSON.stringify({ text }), i + 1]);
      }
    });
  }
  async withPublishLock<T>(fn: () => Promise<T>): Promise<T> {
    const c = await this.pool.getConnection(); // GET_LOCK is per connection: hold this one for the whole section
    try {
      const [rows] = await c.execute<Row[]>('SELECT GET_LOCK(?, ?) AS got', [PUBLISH_LOCK, LOCK_TIMEOUT_S]);
      if (Number(rows[0]?.['got']) !== 1) throw new Error('No se pudo obtener el bloqueo de publicación; intenta de nuevo.');
      try {
        return await fn();
      } finally {
        await c.execute('SELECT RELEASE_LOCK(?)', [PUBLISH_LOCK]).catch(() => undefined);
      }
    } finally {
      c.release();
    }
  }
}
