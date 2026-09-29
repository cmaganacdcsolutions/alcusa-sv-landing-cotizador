import type { ReactElement } from 'react';

// Shared inline icon glyphs, 1:1 with the APPROVED boards
// (02-design/boards/*.dc.html). Outline-only; paint comes from the global
// `svg { stroke: currentColor }` rule in src/styles/global.css — these
// components only carry the path data + intrinsic size.
export interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function IconChevronLeft({ size = 20, className }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function IconChevronDown({ size = 20, className }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function IconArrowRight({ size = 20, className }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconCheck({ size = 16, strokeWidth, className }: IconProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      style={strokeWidth ? { strokeWidth } : undefined}
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

// sf-cot-models — fallback glyph for .model-card__image-wrap when a model
// photo is missing/fails to load (spec §5). Same outline-only language as
// the icons above: no inline stroke props, inherits from the global `svg{}`
// rule in global.css.
export function IconWindow({ size = 24, className }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M12 3.5v17M3.5 12h17" />
    </svg>
  );
}

export function IconWarningTriangle({ size = 22, className }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4.5M12 17.2v.3" />
    </svg>
  );
}

export function IconWarningCircle({ size = 22, className }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8v.2" />
    </svg>
  );
}

export function IconPlus({ size = 20, className }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconWhatsApp({ size = 20, className }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M4.5 19.5l1.2-3.6a8 8 0 1 1 2.9 2.6z" />
      <path d="M9.3 8.7c.4 2.6 3.2 5.4 6 6l1.1-1.4-1.8-1-1 .9c-1-.4-2-1.4-2.4-2.4l.9-1-1-1.8z" />
    </svg>
  );
}

export function IconCard({ size = 20, className }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M7 15h3" />
    </svg>
  );
}

// Wompi payment-note padlock (desktop-0[3-7] asides + footer "Pago con
// tarjeta vía Wompi · excepto American Express" line — glyph is 1:1 with
// the boards' inline `<rect>` + `<path>` pair, not a generic lock icon.
export function IconLock({ size = 16, className }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  );
}
