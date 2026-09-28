// Reducer + hash/history sync for the cotizador wizard (ADR-005).
// Stub for Slice 0 — implemented in Slice 3.

export type CotizadorStep =
  | 'producto'
  | 'medidas'
  | 'precio'
  | 'zonaEntrega'
  | 'resumen'
  | 'formaPago'
  | 'wompi'
  | 'resultado';

export interface CotizadorState {
  step: CotizadorStep;
}

export const initialCotizadorState: CotizadorState = {
  step: 'producto',
};
