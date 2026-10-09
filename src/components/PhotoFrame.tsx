import type { CSSProperties, ReactNode } from 'react';
import { ambientThumbSrc } from '../lib/photo-ambient';

/** Proporciones de marco permitidas por la regla "Foto completa". */
export type PhotoRatio = '1/1' | '4/5' | '4/3' | '9/16' | '3/2';

export interface PhotoFrameProps {
  src: string;
  alt: string;
  ratio: PhotoRatio;
  /** Proporción desde el breakpoint desktop (900px); sin ella se conserva `ratio`. */
  ratioLg?: PhotoRatio;
  /** srcset opcional de la foto principal (la capa ambiental horneada no lo usa). */
  srcSet?: string;
  sizes?: string;
  /**
   * Miniatura ambiental horneada (desenfoque en los pixeles, sin `filter: blur()` en vivo).
   * Por defecto se deriva de `src` (foto oficial o flyer de promo, ver `ambientThumbSrc`); si `src` no sigue la
   * convencion, la capa es un color solido de token (`--photo-ambient-fallback`): NUNCA blur en vivo.
   */
  ambientSrc?: string;
  /** `cover` = render de estudio (4:3 exacto, sin capa blur). `contain` (defecto) = foto real. */
  fit?: 'contain' | 'cover';
  loading?: 'lazy' | 'eager';
  /** Solo para la foto LCP (hero). */
  fetchPriority?: 'high' | 'low' | 'auto';
  /** Tamaño intrínseco del archivo: reserva espacio y evita saltos de layout. */
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
  /** Insignias, figcaption, degradados: van encima (z-index 2). */
  children?: ReactNode;
}

/**
 * Marco de foto completa: la imagen nunca se recorta (contain, 50% 50%) y la
 * misma imagen desenfocada rellena el marco. Render estático en Astro (sin
 * client:*) o dentro de islas React.
 */
export default function PhotoFrame({
  src,
  alt,
  ratio,
  ratioLg,
  srcSet,
  sizes,
  ambientSrc,
  fit = 'contain',
  loading = 'lazy',
  fetchPriority,
  width,
  height,
  className,
  style,
  children,
}: PhotoFrameProps) {
  const baked = ambientSrc ?? ambientThumbSrc(src);
  return (
    <div
      className={className ? `photo-frame ${className}` : 'photo-frame'}
      style={
        ratioLg
          ? ({
              '--photo-ratio': ratio.replace('/', ' / '),
              '--photo-ratio-lg': ratioLg.replace('/', ' / '),
              ...style,
            } as CSSProperties)
          : { aspectRatio: ratio, ...style }
      }
      data-ratio={ratio}
      data-ratio-lg={ratioLg}
    >
      {fit === 'contain' &&
        (baked ? (
          // Miniatura horneada: ya viene difuminada, sin srcset/sizes ni dimensiones de la foto.
          <img
            className="photo-frame__ambient photo-frame__ambient--baked"
            src={baked}
            alt=""
            aria-hidden="true"
            loading={loading}
            decoding="async"
          />
        ) : (
          // Sin miniatura derivable: color solido de token, sin imagen ni blur en vivo.
          <span className="photo-frame__ambient photo-frame__ambient--solid" aria-hidden="true" />
        ))}
      <img
        className={fit === 'cover' ? 'photo-frame__img photo-frame__img--cover' : 'photo-frame__img'}
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding="async"
      />
      {children}
    </div>
  );
}
