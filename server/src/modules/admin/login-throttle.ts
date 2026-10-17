// Per-(client IP, username) login throttle with progressive backoff (SEC-007).
//
// Why not a hard per-account lock: with a single admin account an attacker could keep the only admin locked out
// forever (availability), and a distinct "locked" answer confirms the username exists. Here the key includes the
// client IP, so an attacker's failures only throttle the attacker's own (IP, user) pair: the real admin, from another
// IP, is never affected. The answer while throttled is the same generic failure as a wrong password, and unknown
// usernames are tracked exactly like existing ones, so nothing distinguishes them.
//
// State is process-local (single admin service instance) and resets on restart; nginx limit_req (5/min/IP) stays the
// outer gate. The map is bounded so a flood of random usernames cannot exhaust memory.
export const BACKOFF_MINUTES = [1, 5, 15, 60];
const FAILS_PER_STEP = 5;
const MAX_KEYS = 5000;
const FORGET_MS = 24 * 60 * 60_000;

interface Entry {
  fails: number;
  blockedUntil: number;
  touched: number;
}

export class LoginThrottle {
  private readonly map = new Map<string, Entry>();

  private static key(ip: string, username: string): string {
    return `${ip}|${username.toLowerCase()}`;
  }

  /** Backoff in minutes after the Nth consecutive failure: every 5th failure blocks 1, 5, 15, then 60 min. */
  static backoffMinutes(fails: number): number | null {
    if (fails === 0 || fails % FAILS_PER_STEP !== 0) return null;
    return BACKOFF_MINUTES[Math.min(fails / FAILS_PER_STEP, BACKOFF_MINUTES.length) - 1] ?? 60;
  }

  isBlocked(ip: string, username: string, now: Date): boolean {
    const e = this.map.get(LoginThrottle.key(ip, username));
    return !!e && e.blockedUntil > now.getTime();
  }

  /** Records a failure; returns true when this failure starts a backoff window. */
  fail(ip: string, username: string, now: Date): boolean {
    this.prune(now);
    const k = LoginThrottle.key(ip, username);
    const e = this.map.get(k) ?? { fails: 0, blockedUntil: 0, touched: 0 };
    e.fails += 1;
    e.touched = now.getTime();
    const mins = LoginThrottle.backoffMinutes(e.fails);
    if (mins) e.blockedUntil = now.getTime() + mins * 60_000;
    this.map.set(k, e);
    return mins !== null;
  }

  success(ip: string, username: string): void {
    this.map.delete(LoginThrottle.key(ip, username));
  }

  private prune(now: Date): void {
    if (this.map.size < MAX_KEYS) return;
    for (const [k, e] of this.map) if (e.blockedUntil <= now.getTime() && now.getTime() - e.touched > FORGET_MS) this.map.delete(k);
    // Still full: drop the oldest entries (Map keeps insertion order).
    for (const k of this.map.keys()) {
      if (this.map.size < MAX_KEYS) break;
      this.map.delete(k);
    }
  }
}
