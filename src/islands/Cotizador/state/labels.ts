// Shared label maps consumed by both the pure state layer (state/quote.ts —
// no React/DOM imports allowed there) and step components. Kept separate
// from cotizadorStore.ts (reducer/actions) and steps/measures/WindowForm.tsx
// (a step component) so a UI component is never a dependency of state/quote.ts
// (sf-cot-polish item 5 — was previously only defined in WindowForm.tsx,
// which made buildLineItem's ventana branch fall back to the raw
// WindowGlass id, e.g. "super_gris", instead of its label).
import type { WindowGlass } from '@engine/pricing';

export const WINDOW_GLASS_LABELS: Readonly<Record<WindowGlass, string>> = {
  claro: 'Claro',
  bronce: 'Bronce 5 mm',
  super_gris: 'Súper gris',
  reflectivo_azul: 'Reflectivo azul',
  reflectivo_bronce: 'Reflectivo bronce',
};
