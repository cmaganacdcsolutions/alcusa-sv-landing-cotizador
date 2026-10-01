import { fileURLToPath } from 'node:url';

/** server/db, resolved from src/ (tsx) and dist/ (tsup) alike: both sit two levels below server/. */
export const DB_DIR = fileURLToPath(new URL('../../db', import.meta.url));
export const MIGRATIONS_DIR = `${DB_DIR}/migrations`;
