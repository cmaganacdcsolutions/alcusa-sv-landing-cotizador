import type { ReactElement } from 'react';
// Root cotizador island. Hydrated with `client:visible` on #cotizador.
// Stub for Slice 0 — steps/state wired in Slice 3 (ADR-005).
export default function Cotizador(): ReactElement {
  return <div id="cotizador-root" data-testid="cotizador-root" />;
}
