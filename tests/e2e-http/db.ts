// DB helper for the http e2e: runs server/scripts/e2e-db.ts (alcusa_test, migrate account) so root never
// imports server code or mysql2. Credentials come from server/.env, loaded by playwright.http.config.ts.
import { execFileSync } from 'node:child_process';

export function e2eDb(...args: string[]): void {
  execFileSync('npx', ['tsx', '--env-file-if-exists=.env', 'scripts/e2e-db.ts', ...args], {
    cwd: 'server',
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: 'pipe',
    shell: process.platform === 'win32', // npx is a .cmd on Windows; args are fixed/validated codes
  });
}
