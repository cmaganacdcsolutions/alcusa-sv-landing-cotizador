// Real gateway client (PUBLIC_COTIZADOR_MODE=wompi). Calls OUR
// api/wompi-create-link.php only, never Wompi directly (ADR-003). Pure enough
// to unit-test: fetch and storage are injected.
import type {
  ApiErrorEnvelope,
  CreateLinkRequest,
  CreateLinkResponse,
  PendingPayment,
  ReturnOutcome,
  WompiReturn,
} from './types';

export const CREATE_LINK_ENDPOINT = '/api/wompi-create-link.php';
export const PENDING_STORAGE_KEY = 'alcusa-wompi-pending';

export class WompiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WompiClientError';
  }
}

const GENERIC_ERROR =
  'No pudimos iniciar el pago. Intente de nuevo o escríbanos por WhatsApp.';

export async function createWompiPaymentLink(
  req: CreateLinkRequest,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15000,
): Promise<CreateLinkResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(CREATE_LINK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req),
      credentials: 'same-origin',
      signal: ctrl.signal,
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const env = data as Partial<ApiErrorEnvelope> | null;
      throw new WompiClientError(
        env?.error?.code ?? `http_${res.status}`,
        env?.error?.message ?? GENERIC_ERROR,
      );
    }
    const ok = data as Partial<CreateLinkResponse> | null;
    if (
      !ok ||
      typeof ok.urlEnlace !== 'string' ||
      !ok.urlEnlace.startsWith('https://') ||
      typeof ok.reference !== 'string'
    ) {
      throw new WompiClientError('bad_response', GENERIC_ERROR);
    }
    return ok as CreateLinkResponse;
  } catch (e) {
    if (e instanceof WompiClientError) throw e;
    throw new WompiClientError('network', GENERIC_ERROR);
  } finally {
    clearTimeout(timer);
  }
}

/** Parses `#cotizador/7-resultado?pago=aprobado&ref=ALC-2026-7F3A9C`. */
export function parseWompiReturn(hash: string): WompiReturn | null {
  const raw = hash.replace(/^#/, '');
  const [path, query = ''] = raw.split('?');
  if (path !== 'cotizador/7-resultado') return null;
  const params = new URLSearchParams(query);
  const pago = params.get('pago');
  if (pago !== 'aprobado' && pago !== 'rechazado' && pago !== 'pendiente') return null;
  const ref = params.get('ref');
  return {
    pago: pago as ReturnOutcome,
    ref: ref && /^ALC-\d{4}-[0-9A-F]{6}$/.test(ref) ? ref : null,
  };
}

export function savePendingPayment(
  p: PendingPayment,
  storage: Pick<Storage, 'setItem'> = window.sessionStorage,
): void {
  try {
    storage.setItem(PENDING_STORAGE_KEY, JSON.stringify(p));
  } catch {
    // private mode / quota: the return screen falls back to defaults.
  }
}

export function loadPendingPayment(
  storage: Pick<Storage, 'getItem'> = window.sessionStorage,
): PendingPayment | null {
  try {
    const raw = storage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<PendingPayment>;
    if ((p.pct !== 80 && p.pct !== 100) || typeof p.reference !== 'string') return null;
    return {
      reference: p.reference,
      pct: p.pct,
      zone: typeof p.zone === 'string' ? p.zone : '',
      entrega: p.entrega === 'retiro' ? 'retiro' : 'instalacion',
    };
  } catch {
    return null;
  }
}
