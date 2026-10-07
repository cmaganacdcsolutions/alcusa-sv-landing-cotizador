// Usage: npm run promos:status   (READ-ONLY: lists promos through the configured admin store, never writes)
import { createAdminRuntime, loadAdminConfig } from '../modules/admin/runtime.ts';

const ymdSV = (now = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

async function main(): Promise<void> {
  const cfg = loadAdminConfig();
  const rt = createAdminRuntime(cfg);
  try {
    const all = await rt.store.list();
    const today = ymdSV();
    const live = all.filter((p) => p.status === 'published' && p.starts_on <= today && today <= p.ends_on);
    const by = (s: string): number => all.filter((p) => p.status === s).length;
    process.stdout.write(`promos:status tienda=${cfg.ADMIN_STORE} hoy(SV)=${today}\n`);
    process.stdout.write(`total=${all.length} publicadas=${by('published')} borradores=${by('draft')} archivadas=${by('archived')} vigentes_hoy=${live.length}\n`);
    for (const p of all) process.stdout.write(`- ${p.id} [${p.status}] $${p.price_promo.toFixed(2)} ${p.starts_on}..${p.ends_on} ${p.status === 'published' && live.includes(p) ? 'VIGENTE' : ''}\n`);
  } finally {
    await rt.close();
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`promos:status fallo: ${e instanceof Error ? e.message : 'error'}\n`);
  process.exitCode = 1;
});
