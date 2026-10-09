import { beforeEach, describe, expect, it, vi } from 'vitest';
import raw from '@content/promotions.json';
import { PROMOTIONS_ENDPOINT } from '@content/promotionsParser';
import {
  HYDRATE_TIMEOUT_MS,
  getPromoRegistrySource,
  hydratePromoRegistry,
  lookupActivePromo,
  lookupPromo,
  resetPromoRegistry,
} from './promoRegistry';

type Raw = Record<string, unknown> & { id: string };
const SEED = (raw as unknown as { promotions: Raw[] }).promotions;
// Vigencia holgada: el registro usa el "hoy" real, que no debe volver fragiles estos tests.
const live = (p: Raw): Raw => ({ ...p, starts_on: '2000-01-01', ends_on: '2999-12-31' });
const doc = (promotions: Raw[]) => ({ generated_at: '2026-10-09T00:00:00-06:00', promotions });
const reply = (body: unknown, status = 200): Response =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const fx = (impl: () => Promise<Response>) => vi.fn<typeof fetch>(impl);

const [first, second, third] = SEED as [Raw, Raw, Raw];
const extra = (n: number): Raw => ({ ...live(first), id: `promo-extra-${n}` });

beforeEach(() => {
  resetPromoRegistry();
  vi.useRealTimers();
});

describe('promoRegistry — semilla del build', () => {
  it('sin hidratar: source build y las promos del build resuelven', () => {
    expect(getPromoRegistrySource()).toBe('build');
    expect(lookupPromo(first.id)?.price).toBe(222);
  });
});

describe('promoRegistry — hidratacion', () => {
  it('un ahora editado manda (lookupActivePromo y lookupPromo)', async () => {
    const edited = { ...live(second), price_promo: 199 };
    const f = fx(() => Promise.resolve(reply(doc([live(first), edited, live(third)]))));
    expect(await hydratePromoRegistry(f)).toBe('runtime');
    expect(getPromoRegistrySource()).toBe('runtime');
    expect(lookupActivePromo(second.id)?.price).toBe(199);
    expect(lookupPromo(second.id)?.price).toBe(199);
  });

  it('un id que solo existe en runtime resuelve con su reglaje', async () => {
    const novel = { ...live(first), id: 'promo-solo-runtime', price_promo: 150 };
    await hydratePromoRegistry(fx(() => Promise.resolve(reply(doc([novel])))));
    expect(lookupActivePromo('promo-solo-runtime')).toMatchObject({ id: 'promo-solo-runtime', price: 150, widthMinCm: 100, widthMaxCm: 120 });
  });

  it('memoiza: un solo fetch aunque se llame varias veces', async () => {
    const f = fx(() => Promise.resolve(reply(doc([live(first)]))));
    await Promise.all([hydratePromoRegistry(f), hydratePromoRegistry(f)]);
    await hydratePromoRegistry(f);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0]?.[0]).toBe(PROMOTIONS_ENDPOINT);
  });

  it('aplica el tope de 3 vigentes', async () => {
    await hydratePromoRegistry(fx(() => Promise.resolve(reply(doc([1, 2, 3, 4, 5].map(extra))))));
    const ok = [1, 2, 3, 4, 5].map((n) => lookupActivePromo(`promo-extra-${n}`) !== null);
    expect(ok).toEqual([true, true, true, false, false]);
  });

  it('una promo vencida en el JSON no es vigente, pero lookupPromo la honra (snapshot en vuelo)', async () => {
    const expired = { ...first, starts_on: '2000-01-01', ends_on: '2000-01-31' };
    await hydratePromoRegistry(fx(() => Promise.resolve(reply(doc([expired])))));
    expect(lookupActivePromo(first.id)).toBeNull();
    expect(lookupPromo(first.id)).not.toBeNull();
  });

  it('una promo archivada (ausente del JSON) fuera de la semilla devuelve null', async () => {
    await hydratePromoRegistry(fx(() => Promise.resolve(reply(doc([live(first)])))));
    expect(lookupPromo('promo-archivada')).toBeNull();
    expect(lookupActivePromo('promo-archivada')).toBeNull();
  });
});

describe('promoRegistry — fallas conservan la semilla', () => {
  const cases: [string, () => Promise<Response>][] = [
    ['HTTP 500', () => Promise.resolve(reply('boom', 500))],
    ['JSON invalido', () => Promise.resolve(reply('{no es json'))],
    ['esquema invalido', () => Promise.resolve(reply({ promotions: 'x' }))],
    ['204 vacio', () => Promise.resolve(new Response(null, { status: 204 }))],
    ['red caida', () => Promise.reject(new TypeError('network'))],
    ['imagen insegura', () => Promise.resolve(reply(doc([{ ...live(first), image: 'https://evil.example/x.webp' }])))],
  ];
  it.each(cases)('%s', async (_n, impl) => {
    expect(await hydratePromoRegistry(fx(impl))).toBe('build');
    expect(lookupPromo(first.id)?.price).toBe(222);
  });

  it('timeout: aborta a los 2500 ms y conserva la semilla', async () => {
    vi.useFakeTimers();
    const f = vi.fn<typeof fetch>((_u, init) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
      }),
    );
    const p = hydratePromoRegistry(f);
    await vi.advanceTimersByTimeAsync(HYDRATE_TIMEOUT_MS - 1);
    expect(getPromoRegistrySource()).toBe('build');
    await vi.advanceTimersByTimeAsync(2);
    expect(await p).toBe('build');
    expect(lookupActivePromo(first.id)?.price).toBe(222);
  });
});
