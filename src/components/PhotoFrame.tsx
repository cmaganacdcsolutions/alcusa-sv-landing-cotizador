import type { CSSProperties, ReactNode } from 'react';

/** Proporciones de marco permitidas por la regla "Foto completa". */
export type PhotoRatio = '1/1' | '4/5' | '4/3' | '3/2';

export interface PhotoFrameProps {
  src: string;
  alt: string;
  ratio: PhotoRatio;
  /** Proporción desde el breakpoint desktop (900px); sin ella se conserva `ratio`. */
  ratioLg?: PhotoRatio;
  /** srcset opcional; se reutiliza en la capa ambiental (misma descarga). */
  srcSet?: string;
  sizes?: string;
  loading?: 'lazy' | 'eager';
  /** Solo para la foto LCP (hero). */
  fetchPriority?: 'high' | 'low' | 'auto';
  /** Tamaño intrínseco del archivo: reserva espacio y evita saltos de layout. */
  width?: number;
  height?: number;
  /** `cover` recorta con punto focal (fotos altas); por defecto `contain` (foto completa). */
  fit?: 'contain' | 'cover';
  /** Punto focal CSS (object-position) para `fit="cover"`. */
  objectPosition?: string;
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
  loading = 'lazy',
  fetchPriority,
  width,
  height,
  fit = 'contain',
  objectPosition,
  className,
  style,
  children,
}: PhotoFrameProps) {
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
      <img
        className="photo-frame__ambient"
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt=""
        aria-hidden="true"
        width={width}
        height={height}
        loading={loading}
        decoding="async"
      />
      <img
        className="photo-frame__img"
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        width={width}
        height={height}
        style={fit === 'cover' ? { objectFit: 'cover', objectPosition } : undefined}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding="async"
      />
      {children}
    </div>
  );
}
