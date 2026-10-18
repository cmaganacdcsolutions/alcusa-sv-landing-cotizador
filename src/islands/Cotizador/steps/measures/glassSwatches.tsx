import type { ReactElement } from 'react';
import { glassPhotoCss } from '@content/glassSwatchPhotos';
import type { AluminumColor, CornerModel, StraightGlass, WindowGlass } from '@engine/pricing';

// "Tipo de vidrio" swatches. 2026-10-06: circulos CSS puros con los mismos fondos que las fichas del
// inicio (`.pcard__sw[data-sw='glass:*']` en components/home/ProductCard.astro), para que el vidrio se
// vea igual en el inicio y en el cotizador. 2026-10-17: mallado, nevado y aquafold pasan a recortes de
// foto real (content/glassSwatchPhotos.ts, webp 64/128 px via CSS background; cero JS); claro, duplex y
// decorado siguen en CSS hasta que Alcusa envie fotos. Inicio y cotizador usan el mismo archivo.
interface GlassSwatchDef {
  css: string;
}

export const GLASS_SWATCHES: Readonly<Record<StraightGlass, GlassSwatchDef>> = {
  claro: { css: 'linear-gradient(135deg, #f3f8fc 0%, #cfe2f0 100%)' },
  nevado: { css: glassPhotoCss('nevado') },
  decorado: { css: 'repeating-linear-gradient(90deg, #dfe8f1 0 3px, #f7fafc 3px 6px)' },
  aquafold: { css: glassPhotoCss('aquafold') },
  mallado: { css: glassPhotoCss('mallado') },
  duplex: { css: 'linear-gradient(135deg, #eef3f8 0 50%, #c7d2e0 50% 100%)' },
};

// Frame colour swatches (every "Color del marco / aluminio / Color" selector).
// Plain CSS fills - no photo exists for the anodised finishes. "blanco" relies on
// the ring drawn by `.swatch::after` so it stays visible on a white card.
export const COLOR_SWATCHES: Readonly<Record<AluminumColor, GlassSwatchDef>> = {
  natural: { css: 'linear-gradient(135deg, #e4e7ec 0%, #aeb4be 55%, #d5d9df 100%)' },
  blanco: { css: '#ffffff' },
  bronce: { css: 'linear-gradient(135deg, #9a7550 0%, #6b4c2e 100%)' },
  negro: { css: 'var(--swatch-color-negro)' },
};

// Window glass: tinted gradients (no photos exist for these).
export const WINDOW_GLASS_SWATCHES: Readonly<Record<WindowGlass, GlassSwatchDef>> = {
  claro: { css: 'linear-gradient(135deg, #f3f8fc 0%, #d6e6f2 100%)' },
  bronce: { css: 'linear-gradient(135deg, #c9a77c 0%, #8a6a45 100%)' },
  super_gris: { css: 'linear-gradient(135deg, #8d949c 0%, #4f565e 100%)' },
  reflectivo_azul: { css: 'linear-gradient(135deg, #cfe3f5 0%, #5f8fc4 60%, #2e5f9a 100%)' },
  reflectivo_bronce: { css: 'linear-gradient(135deg, #e6cfae 0%, #a67b4b 60%, #6b4a2a 100%)' },
};

// "Cabina en L" glass models reuse the swatches of their straight twins.
export const CORNER_SWATCHES: Readonly<Record<CornerModel, GlassSwatchDef>> = {
  aquaclara: GLASS_SWATCHES.claro,
  frosted: GLASS_SWATCHES.nevado,
  aquafold: GLASS_SWATCHES.aquafold,
};

// Decorative circle (aria-hidden; the button's text is the accessible name).
export function Swatch({ def, id, className }: { def: GlassSwatchDef; id: string; className: string }): ReactElement {
  return <span className={`swatch ${className}`} style={{ background: def.css }} aria-hidden="true" data-swatch={id} />;
}

/** Glass-chip swatch (44px mobile -> 64px desktop), a circle. */
export function GlassSwatch({ glass }: { glass: StraightGlass }): ReactElement {
  return <Swatch def={GLASS_SWATCHES[glass]} id={`glass:${glass}`} className="glass-chip__swatch" />;
}

/** Small circle inside a `.chip` button. */
export function ColorSwatch({ color }: { color: AluminumColor }): ReactElement {
  return <Swatch def={COLOR_SWATCHES[color]} id={`color:${color}`} className="chip__swatch" />;
}

export function WindowGlassSwatch({ glass }: { glass: WindowGlass }): ReactElement {
  return <Swatch def={WINDOW_GLASS_SWATCHES[glass]} id={`wglass:${glass}`} className="chip__swatch" />;
}

export function CornerSwatch({ model }: { model: CornerModel }): ReactElement {
  return <Swatch def={CORNER_SWATCHES[model]} id={`corner:${model}`} className="chip__swatch" />;
}
