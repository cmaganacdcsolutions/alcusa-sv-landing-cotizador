import type { ReactElement } from 'react';
import type { IconProps } from './icons';

// Icon glyphs for the checkout steps (Step3–7), 1:1 with the approved
// boards (02-design/boards/desktop|ios|android-0{4..7}-*.dc.html). Kept
// separate from ./icons.tsx (owned by sf-cot-shell) per T-sf-cot-checkout
// file ownership split. Same conventions as icons.tsx: outline-only, paint
// comes from the global `svg { stroke: currentColor }` rule.

export function IconTruck({ size = 24, className }: IconProps): ReactElement {
  // desktop-04/05/07 "con instalación" glyph.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M3 6.5h11v9H3zM14 9.5h3.8l3.2 3.4v2.6h-7" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </svg>
  );
}

export function IconStore({ size = 24, className }: IconProps): ReactElement {
  // desktop-04 "retiro en tienda" glyph.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M4 9.5l1.5-5h13l1.5 5M4 9.5h16M5 9.5v10h14v-10M10 19.5v-5h4v5" />
    </svg>
  );
}

export function IconLock({ size = 18, className }: IconProps): ReactElement {
  // Padlock — "Pago con tarjeta vía Wompi · excepto American Express" note,
  // repeated verbatim across desktop-04/05/06 asides and the ios-06 no-AMEX
  // bullet.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  );
}

export function IconCardRect({ size = 26, className }: IconProps): ReactElement {
  // desktop-06 "Pagar ahora" radio-avatar + ios-06 Wompi CTA glyph.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M7 15h4" />
    </svg>
  );
}

export function IconEdit({ size = 18, className }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

export function IconTrash({ size = 18, className }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
    </svg>
  );
}

export function IconLocationPin({ size = 18, className }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  );
}

export function IconSpinner({ size = 20, className }: IconProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      style={{ strokeWidth: 2.5, animation: 'cot-spin 0.9s linear infinite' }}
    >
      <circle cx="12" cy="12" r="8" opacity="0.35" />
      <path d="M20 12a8 8 0 0 0-8-8" />
    </svg>
  );
}

export function IconShieldCheck({ size = 18, className }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M12 3.5l7 2.8v5.2c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6.3z" />
      <path d="M8.8 12.2l2.2 2.2 4.2-4.4" />
    </svg>
  );
}

export function IconWindowPane({ size = 32, className }: IconProps): ReactElement {
  // Generic product-thumbnail placeholder (no per-product photography in
  // the catalog data model yet — see HANDOFF). Used in the resumen cart
  // rows in place of the boards' `it.img` photo.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M12 4v16M4 12h16" />
    </svg>
  );
}
