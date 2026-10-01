import { ConfigError, loadConfig } from './config/index.ts';
import { createAppPool } from './db/pool.ts';
import { buildApp } from './http/app.ts';

function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    // Variable NAMES only, never values.
    process.stderr.write(`${err instanceof ConfigError ? err.message : 'Config error'}\n`);
    process.exit(1);
  }
  const pool = createAppPool(config);

  return buildApp({ config, pool }).then(async (app) => {
    const shutdown = async (signal: string): Promise<void> => {
      app.log.info({ signal }, 'shutting down');
      await app.close();
      await pool.end();
      process.exit(0);
    };
    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    await app.listen({ host: config.HOST, port: config.PORT });
  });
}

main().catch((err: unknown) => {
  process.stderr.write(`startup failed: ${err instanceof Error ? err.message : 'unknown error'}\n`);
  process.exit(1);
});
