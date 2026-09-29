// Shared label maps consumed by both the pure state layer (state/quote.ts —
// no React/DOM imports allowed there) and step components. Kept separate
// from cotizadorStore.ts (reducer/actions) and steps/measures/WindowForm.tsx
// (a step component) so a UI component is never a dependency of state/quote.ts
// (sf-cot-polish item 5 — was previously only defined in WindowForm.tsx,
// which made buildLineItem's ventana branch fall back to the raw
// WindowGlass id, e.g. "super_gris", instead of its label).
import type { WindowGlass, WindowModel } from '@engine/pricing';

export const WINDOW_GLASS_LABELS: Readonly<Record<WindowGlass, string>> = {
  claro: 'Claro',
  bronce: 'Bronce 5 mm',
  super_gris: 'Súper gris',
  reflectivo_azul: 'Reflectivo azul',
  reflectivo_bronce: 'Reflectivo bronce',
};

// S7 — moved here (from steps/measures/WindowForm.tsx and .../GardenForm.tsx)
// so the pure state/order.ts cart aggregator (no React import allowed) can
// build multi-item WhatsApp copy without depending on a step component.
export const WINDOW_MODEL_LABELS: Readonly<Record<WindowModel, string>> = { francesa: 'Francesa', bilbao: 'Bilbao' };

export const GARDEN_HOJAS_LABELS: Readonly<Record<1 | 2 | 3 | 'custom', string>> = {
  1: '1 hoja',
  2: '2 hojas',
  3: '3 hojas',
  custom: 'A la medida',
};
