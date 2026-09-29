// Local/dev/test mock for the Wompi client — default when
// PUBLIC_COTIZADOR_MODE=mock (src/env.d.ts, .env.example). Pure, no
// network/keys: Step6Wompi is the only caller (islands/Cotizador/steps/
// Step6Wompi.tsx). The real gateway client (WOMPI_* server credentials,
// api/*.php) is a later slice — see HANDOFF.
export type WompiMockOutcome = 'approved' | 'declined';

export interface WompiMockResult {
  outcome: WompiMockOutcome;
  orderNumber: string;
  reference: string;
}

/** Zero-padded 4-digit sequence from a reference string, deterministic per call. */
function orderSuffix(reference: string): string {
  let hash = 0;
  for (let i = 0; i < reference.length; i += 1)
    hash = (hash * 31 + reference.charCodeAt(i)) >>> 0;
  return String(hash % 10000).padStart(4, '0');
}

export interface MockCreatePaymentOptions {
  /** Test-only override (e2e specs force the declined branch this way). */
  forceOutcome?: WompiMockOutcome;
}

/**
 * Simulates creating + resolving a Wompi payment link, entirely client-side.
 * No fetch, no keys — approves by default (there's no real card entry in
 * this slice), unless `forceOutcome` says otherwise.
 */
export function mockCreateWompiPayment(
  amount: number,
  options: MockCreatePaymentOptions = {},
): Promise<WompiMockResult> {
  const reference = `mock-${Date.now()}-${amount.toFixed(2)}`;
  const outcome: WompiMockOutcome = options.forceOutcome ?? 'approved';
  const result: WompiMockResult = {
    outcome,
    orderNumber: `ALC-${new Date().getFullYear()}-${orderSuffix(reference)}`,
    reference,
  };
  return Promise.resolve(result);
}
