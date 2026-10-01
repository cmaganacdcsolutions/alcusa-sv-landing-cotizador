// App-level rate limiting in the `rate_limits` table (ADR-012 §4, ADR-013 §2.6):
// survives restarts, shared by every process. Fixed windows keyed by (bucket, window_start).
import { createHmac } from 'node:crypto';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export interface HitResult {
  allowed: boolean;
  hits: number;
  retryAfterSec: number;
}

function windowOf(now: Date, windowSec: number): { start: string; retryAfterSec: number } {
  const ms = windowSec * 1000;
  const startMs = Math.floor(now.getTime() / ms) * ms;
  return {
    start: new Date(startMs).toISOString().slice(0, 19).replace('T', ' '),
    retryAfterSec: Math.max(1, Math.ceil((startMs + ms - now.getTime()) / 1000)),
  };
}

export class DbRateLimiter {
  constructor(
    private readonly pool: Pool,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Counts one hit and reports whether it is within `limit` for the current window. */
  async hit(bucket: string, windowSec: number, limit: number): Promise<HitResult> {
    const w = windowOf(this.now(), windowSec);
    // LAST_INSERT_ID(expr) makes the new counter value come back as insertId (atomic, no race).
    const [res] = await this.pool.execute<ResultSetHeader>(
      'INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE hits = LAST_INSERT_ID(hits + 1)',
      [bucket, w.start],
    );
    const hits = res.insertId || 1;
    return { allowed: hits <= limit, hits, retryAfterSec: w.retryAfterSec };
  }

  /** Current count without incrementing; `allowed` = still below `limit`. */
  async peek(bucket: string, windowSec: number, limit: number): Promise<HitResult> {
    const w = windowOf(this.now(), windowSec);
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT hits FROM rate_limits WHERE bucket = ? AND window_start = ?',
      [bucket, w.start],
    );
    const hits = Number(rows[0]?.['hits'] ?? 0);
    return { allowed: hits < limit, hits, retryAfterSec: w.retryAfterSec };
  }
}

/** HMAC-SHA256(value, pepper) hex: IPs and WhatsApp numbers are never stored in clear in buckets. */
export function hmacHex(pepper: string, value: string): string {
  return createHmac('sha256', pepper).update(value).digest('hex');
}
