// Local admin entry (no MariaDB needed): `npm run admin:dev`. Port 4500 by default.
import { buildApp } from './http/app.ts';
import { createAdminRuntime, loadAdminConfig } from './modules/admin/runtime.ts';

const cfg = loadAdminConfig();
const { deps } = createAdminRuntime(cfg);
const app = await buildApp({
  config: { LOG_LEVEL: cfg.LOG_LEVEL, TRUST_PROXY: false, NODE_ENV: cfg.NODE_ENV, SERVE_STATIC_DIR: undefined },
  admin: deps,
});
await app.listen({ host: cfg.HOST, port: cfg.ADMIN_PORT });
process.stdout.write(`Admin en http://localhost:${cfg.ADMIN_PORT}${cfg.ADMIN_BASE_PATH}/login\n`);
