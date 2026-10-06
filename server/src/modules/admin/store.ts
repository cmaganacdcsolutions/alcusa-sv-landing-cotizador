// Data access for the admin, behind interfaces. Local/tests use MemoryAdminStore (optionally persisted to a
// JSON file for `npm run admin:dev`). MariaDbAdminStore (mariadb-store.ts, ADMIN_STORE=mariadb) implements the
// same interfaces; test/admin/repo-contract.ts runs one contract suite against both.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { PromoRecord } from '../promotions/schema.ts';
import type { Stage } from './stage.ts';

export interface AdminUser {
  id: number;
  username: string;
  passwordHash: string;
  mustChangePassword: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  isActive: boolean;
  mfaMethod: 'totp' | null;
  totpEnabledAt: Date | null;
}

export interface SessionRow {
  idHash: string;
  adminId: number;
  csrfToken: string;
  stage: Stage;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

export interface AuditEntry {
  at: Date;
  actor: string;
  action: string;
  detail?: Record<string, unknown>;
}

export type PromoStatus = 'draft' | 'published' | 'archived';
export interface StoredPromo extends PromoRecord {
  status: PromoStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AdminRepo {
  findUserByUsername(username: string): Promise<AdminUser | null>;
  findUserById(id: number): Promise<AdminUser | null>;
  /** Single account in v1.0 (the CLI refuses a second one unless --rotate). */
  countUsers(): Promise<number>;
  saveUser(user: Omit<AdminUser, 'id'> & { id?: number }): Promise<AdminUser>;
  /** Atomically adds 1 to failed_attempts (no lost updates under concurrent bad logins) and returns the new count. */
  incrementFailedAttempts(id: number): Promise<number>;
  createSession(s: SessionRow): Promise<void>;
  findSession(idHash: string): Promise<SessionRow | null>;
  touchSession(idHash: string, lastSeenAt: Date): Promise<void>;
  deleteSession(idHash: string): Promise<void>;
  deleteUserSessions(adminId: number): Promise<void>;
  audit(e: AuditEntry): Promise<void>;
}

export interface PromoRepo {
  list(): Promise<StoredPromo[]>;
  get(id: string): Promise<StoredPromo | null>;
  /** Upsert by id. There is deliberately no hard delete: promos are archived (status 'archived'). */
  save(p: StoredPromo): Promise<void>;
  /** Serializes check-then-publish sections (the 3-active cap). MariaDB: GET_LOCK; memory: in-process mutex. */
  withPublishLock<T>(fn: () => Promise<T>): Promise<T>;
}

export type AdminStore = AdminRepo & PromoRepo;

interface Persisted {
  users: unknown[];
  promos: StoredPromo[];
  audit: unknown[];
  nextUserId: number;
}

const reviveUser = (u: Record<string, unknown>): AdminUser => ({
  ...(u as unknown as AdminUser),
  lockedUntil: u['lockedUntil'] ? new Date(u['lockedUntil'] as string) : null,
  lastLoginAt: u['lastLoginAt'] ? new Date(u['lastLoginAt'] as string) : null,
  totpEnabledAt: u['totpEnabledAt'] ? new Date(u['totpEnabledAt'] as string) : null,
});

export class MemoryAdminStore implements AdminRepo, PromoRepo {
  private users = new Map<number, AdminUser>();
  private sessions = new Map<string, SessionRow>();
  private promos = new Map<string, StoredPromo>();
  readonly auditLog: AuditEntry[] = [];
  private nextUserId = 1;

  /** `file` = persist users/promos/audit (never sessions) after every mutation. Local dev only. */
  constructor(private readonly file?: string) {
    if (file && existsSync(file)) {
      const data = JSON.parse(readFileSync(file, 'utf8')) as Persisted;
      for (const u of data.users) {
        const user = reviveUser(u as Record<string, unknown>);
        this.users.set(user.id, user);
      }
      for (const p of data.promos) this.promos.set(p.id, p);
      this.nextUserId = data.nextUserId;
    }
  }

  private persist(): void {
    if (!this.file) return;
    const data: Persisted = { users: [...this.users.values()], promos: [...this.promos.values()], audit: this.auditLog.slice(-500), nextUserId: this.nextUserId };
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  findUserByUsername(username: string): Promise<AdminUser | null> {
    return Promise.resolve([...this.users.values()].find((u) => u.username.toLowerCase() === username.toLowerCase()) ?? null);
  }
  findUserById(id: number): Promise<AdminUser | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }
  countUsers(): Promise<number> {
    return Promise.resolve(this.users.size);
  }
  saveUser(user: Omit<AdminUser, 'id'> & { id?: number }): Promise<AdminUser> {
    const id = user.id ?? this.nextUserId++;
    const saved = { ...user, id };
    this.users.set(id, saved);
    this.persist();
    return Promise.resolve(saved);
  }
  incrementFailedAttempts(id: number): Promise<number> {
    const u = this.users.get(id);
    if (!u) return Promise.resolve(0);
    u.failedAttempts += 1;
    this.persist();
    return Promise.resolve(u.failedAttempts);
  }
  createSession(s: SessionRow): Promise<void> {
    this.sessions.set(s.idHash, s);
    return Promise.resolve();
  }
  findSession(idHash: string): Promise<SessionRow | null> {
    return Promise.resolve(this.sessions.get(idHash) ?? null);
  }
  touchSession(idHash: string, lastSeenAt: Date): Promise<void> {
    const s = this.sessions.get(idHash);
    if (s) s.lastSeenAt = lastSeenAt;
    return Promise.resolve();
  }
  deleteSession(idHash: string): Promise<void> {
    this.sessions.delete(idHash);
    return Promise.resolve();
  }
  deleteUserSessions(adminId: number): Promise<void> {
    for (const [k, s] of this.sessions) if (s.adminId === adminId) this.sessions.delete(k);
    return Promise.resolve();
  }
  audit(e: AuditEntry): Promise<void> {
    this.auditLog.push(e);
    this.persist();
    return Promise.resolve();
  }

  list(): Promise<StoredPromo[]> {
    return Promise.resolve([...this.promos.values()].sort((a, b) => a.sort_order - b.sort_order || a.starts_on.localeCompare(b.starts_on)));
  }
  get(id: string): Promise<StoredPromo | null> {
    return Promise.resolve(this.promos.get(id) ?? null);
  }
  save(p: StoredPromo): Promise<void> {
    this.promos.set(p.id, p);
    this.persist();
    return Promise.resolve();
  }
  private lock: Promise<unknown> = Promise.resolve();
  withPublishLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run;
  }
}
