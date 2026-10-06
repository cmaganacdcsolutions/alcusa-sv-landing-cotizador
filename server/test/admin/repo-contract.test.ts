import { afterAll, describe, it } from 'vitest';
import { MemoryAdminStore } from '../../src/modules/admin/store.ts';
import { dbEnv, openStore, resetAdminTables, SKIP_MSG } from './db-env.ts';
import { repoContract } from './repo-contract.ts';

repoContract('memory', () => {
  const store = new MemoryAdminStore();
  return Promise.resolve({ store, reset: () => Promise.resolve() });
});

const env = dbEnv();
if (env) {
  const stores: Array<{ close: () => Promise<void> }> = [];
  repoContract('MariaDB', () => {
    const store = openStore(env);
    stores.push(store);
    return Promise.resolve({ store, reset: () => resetAdminTables(env) });
  });
  afterAll(async () => {
    await Promise.all(stores.map((s) => s.close()));
  });
} else {
  describe('repository contract: MariaDB', () => {
    it.skip(SKIP_MSG, () => undefined);
  });
}
