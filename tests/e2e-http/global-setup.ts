import { e2eDb } from './db';

/** The API limits per ip_hash and every test comes from 127.0.0.1: start each run with empty counters. */
export default function globalSetup(): void {
  e2eDb('truncate-rate-limits');
}
