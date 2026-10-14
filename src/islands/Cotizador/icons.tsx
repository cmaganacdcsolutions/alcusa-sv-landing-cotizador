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
