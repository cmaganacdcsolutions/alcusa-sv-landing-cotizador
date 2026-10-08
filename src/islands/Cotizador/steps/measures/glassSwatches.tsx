import type { ReactElement } from 'react';
import type { AluminumColor, CornerModel, StraightGlass, WindowGlass } from '@engine/pricing';

// "Tipo de vidrio" swatches. 2026-10-06: ya NO hay fotos (ni de Alcusa ni recortes): son
// circulos CSS puros con los mismos fondos que las fichas del inicio
// (`.pcard__sw[data-sw='glass:*']` en components/home/ProductCard.astro), para que el vidrio
// se vea igual en el inicio y en el cotizador.
interface GlassSwatchDef {
  css: string;
}

export const GLASS_SWATCHES: Readonly<Record<StraightGlass, GlassSwatchDef>> = {
  claro: { css: 'linear-gradient(135deg, #f3f8fc 0%, #cfe2f0 100%)' },
  nevado: {
    css: 'radial-gradient(circle at 30% 30%, #ffffff 0 12%, transparent 13%), radial-gradient(circle at 70% 60%, #fff 0 10%, transparent 11%), linear-gradient(135deg, #e9eef3, #cdd6df)',
  },
  decorado: { css: 'repeating-linear-gradient(90deg, #dfe8f1 0 3px, #f7fafc 3px 6px)' },
  aquafold: { css: 'radial-gradient(circle, #cfe2f0 0 28%, transparent 30%) 0 0 / 10px 10px, #f3f8fc' },
  mallado: {
    css: 'repeating-linear-gradient(45deg, #c9d3e3 0 1px, transparent 1px 7px), repeating-linear-gradient(-45deg, #c9d3e3 0 1px, #f4f7fb 1px 7px)',
  },
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
