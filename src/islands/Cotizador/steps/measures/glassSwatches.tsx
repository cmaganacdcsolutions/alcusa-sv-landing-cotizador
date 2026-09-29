import type { ReactElement } from 'react';
import type { StraightGlass } from '@engine/pricing';

// "Tipo de vidrio" swatches — sf-cot-medidas gap #2. Values copied verbatim
// from desktop-03/ios-03's `G` array: claro/nevado/decorado are real photos
// (resolved via canvas-assets.json to 01-discovery/assets/finish-*.webp, now
// optimized 160x160 crops in public/img/cotizador/); mallado/duplex have no
// photo on the boards and instead render the exact CSS patterns/gradients
// the boards use as `g.swatch`.
type GlassSwatchDef = { kind: 'image'; src: string } | { kind: 'pattern'; css: string };

export const GLASS_SWATCHES: Readonly<Record<StraightGlass, GlassSwatchDef>> = {
  claro: { kind: 'image', src: '/img/cotizador/finish-claro.webp' },
  nevado: { kind: 'image', src: '/img/cotizador/finish-nevado.webp' },
  decorado: { kind: 'image', src: '/img/cotizador/finish-decorado.webp' },
  mallado: {
    kind: 'pattern',
    css: 'repeating-linear-gradient(45deg, #c9d3e3 0 1px, transparent 1px 7px), repeating-linear-gradient(-45deg, #c9d3e3 0 1px, #f4f7fb 1px 7px)',
  },
  duplex: { kind: 'pattern', css: 'linear-gradient(135deg, #eef3f8 0 50%, #c7d2e0 50% 100%)' },
};

// Board markup (both breakpoints): a swatch box with the pattern/color as
// `background`, and — only when a photo exists — an <img> inside it zoomed
// with `transform: scale(2.2)` around `transform-origin: 24% 58%` so the
// texture reads at this size. Copied 1:1 (only the box's own w/h come from
// CSS so the 44px mobile -> 64px desktop bump in cotizador-medidas.css works).
export function GlassSwatch({ glass }: { glass: StraightGlass }): ReactElement {
  const def = GLASS_SWATCHES[glass];
  const background = def.kind === 'pattern' ? def.css : '#eef3f8';
  return (
    <span className="glass-chip__swatch" style={{ background }}>
      {def.kind === 'image' && (
        <img
          src={def.src}
          alt=""
          className="glass-chip__swatch-img"
          style={{ transform: 'scale(2.2)', transformOrigin: '24% 58%' }}
        />
      )}
    </span>
  );
}
