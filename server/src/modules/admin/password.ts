import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const argon2Async = promisify(argon2);

/** ADR-014 §3.3: argon2id m=64 MiB, t=3, p=1 (tune to ~250 ms on the VPS). */
export interface Argon2Params {
  memory: number; // KiB
  passes: number;
  parallelism: number;
}
export const DEFAULT_PARAMS: Argon2Params = { memory: 65536, passes: 3, parallelism: 1 };
const TAG = 32;

async function derive(password: string, salt: Buffer, p: Argon2Params): Promise<Buffer> {
  const out = await argon2Async('argon2id', {
    message: Buffer.from(password, 'utf8'),
    nonce: salt,
    parallelism: p.parallelism,
    tagLength: TAG,
    memory: p.memory,
    passes: p.passes,
  });
  return Buffer.from(out);
}

const b64 = (b: Buffer): string => b.toString('base64').replace(/=+$/, '');

/** PHC string: $argon2id$v=19$m=..,t=..,p=..$salt$hash */
export async function hashPassword(password: string, params: Argon2Params = DEFAULT_PARAMS): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, params);
  return `$argon2id$v=19$m=${params.memory},t=${params.passes},p=${params.parallelism}$${b64(salt)}$${b64(hash)}`;
}

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

export async function verifyPassword(password: string, phc: string): Promise<boolean> {
  const m = PHC.exec(phc);
  if (!m) return false;
  const params = { memory: Number(m[1]), passes: Number(m[2]), parallelism: Number(m[3]) };
  const salt = Buffer.from(m[4] as string, 'base64');
  const expected = Buffer.from(m[5] as string, 'base64');
  const actual = await derive(password, salt, params);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const COMMON = new Set([
  'passwordpassword', 'contrasenacontrasena', '12345678901234', '123456789012345', 'qwertyuiopasdf', 'alcusaalcusaalcusa',
  'administrator1234', 'passwordpassword1', 'letmeinletmein1',
]);

/** Policy of ADR-014 §3.3: >= 14 chars, no composition rules, reject common / equal to username. */
export function passwordProblems(password: string, username: string): string[] {
  const out: string[] = [];
  if (password.length < 14) out.push('Al menos 14 caracteres.');
  if (password.length > 200) out.push('Máximo 200 caracteres.');
  if (password.toLowerCase().includes(username.toLowerCase()) && username.length >= 3) out.push('No puede contener tu usuario.');
  if (COMMON.has(password.toLowerCase()) || /^(.)\1+$/.test(password)) out.push('Es una contraseña demasiado común.');
  return out;
}
