// UNICO mapa de imagenes del sitio publico: portadas de producto, de categoria, galeria y hero.
// 2026-10-08: TODO sale del portafolio oficial de Alcusa ("DOC IMAGENES PARA WEB", 28 fotos retocadas),
// convertido por scripts/convert-fotos.mjs a public/images/fotos/<nombre>-{800,<ancho nativo>}.webp.
// Los renders de estudio de public/images/renders/ siguen en disco pero ya no se referencian.
//
// Regla de la foto de un producto para una eleccion (color, vidrio|acabado):
//   1. foto con match de VIDRIO (`byGlass`)  2. foto con match de COLOR (`byColor`)  3. la portada del producto.
// `variants` (clave `<color>-<vidrio|acabado>`) se deriva de esa regla para cada combinacion de PRODUCT_CONFIGS,
// asi el script de la tarjeta del inicio y `pickVariant` siguen funcionando igual.
// Las fotos son 3:4 vertical (algunas horizontales): `kind: 'photo'` (contain + relleno ambiental, sin recorte).
import type { CatalogImage } from './catalogContent';
import { PRODUCT_CONFIGS, type OptionGroup, type ProductConfig } from './catalogHome';

export type MediaRef = CatalogImage;

export const FOTOS_DIR = '/images/fotos' as const;

/** Ratio del slot de portada de tarjeta (4:3). Las fotos verticales se contienen dentro, sin recorte. */
export const COVER_RATIO = '4/3' as const;
/** Ancho de la version ligera (la que usan tarjetas y tiles). */
const W = 800;

/** Tamano nativo (ancho, alto) de cada foto convertida; el archivo grande se llama `<nombre>-<ancho nativo>.webp`. */
export const FOTO_NATIVE: Readonly<Record<string, readonly [number, number]>> = {
  'ventana-francesa-negro': [1086, 1448],
  'jardin-1-fijo-3-corredizas': [1086, 1448],
  'jardin-1-fijo-3-corredizas-galeria': [1086, 1448],
  'jardin-3-hojas-galeria': [844, 1500],
  'jardin-3-hojas': [1086, 1448],
  'jardin-2-hojas-galeria': [1448, 1086],
  'jardin-1-hoja': [1086, 1448],
  'ventana-bilbao': [1086, 1448],
  bisagra: [1086, 1448],
  recta: [1086, 1448],
  'bisagra-galeria': [1374, 1145],
  'jardin-2-fijas-2-corredizas': [1448, 1086],
  'en-l': [1086, 1448],
  'abatible-interior-exterior': [1086, 1448],
  'bisagra-decorado': [1086, 1448],
  'ventana-bilbao-medio-punto': [1086, 1448],
  'jardin-2-hojas': [1086, 1448],
  'ventana-francesa': [1086, 1448],
  'en-l-aquafold': [1254, 1254],
  'abatible-oficina-vidrio-fijo': [1086, 1448],
  'recta-galeria': [1086, 1448],
  'recta-aquafold': [1086, 1448],
  'en-l-galeria': [1086, 1448],
  'abatible-oficina-cerrador': [1086, 1448],
  'recta-nevado': [1086, 1448],
  'en-l-frosted': [1086, 1448],
  'templada-10mm': [1086, 1448],
  'templada-10mm-abatible': [1086, 1448],
};

/** Foto oficial: `src` = version de 800 px; `srcSet` con descriptores veraces (800w + ancho nativo). */
function foto(name: string, alt: string): MediaRef {
  const native = FOTO_NATIVE[name];
  if (!native) throw new Error(`home-media: foto desconocida "${name}"`);
  const [nw, nh] = native;
  const w = Math.min(W, nw);
  return {
    src: `${FOTOS_DIR}/${name}-${w}.webp`,
    ...(nw > w ? { srcSet: `${FOTOS_DIR}/${name}-${w}.webp ${w}w, ${FOTOS_DIR}/${name}-${nw}.webp ${nw}w` } : {}),
    alt,
    width: w,
    height: Math.round((w * nh) / nw),
    kind: 'photo',
  };
}

export type AluminumKey = 'natural' | 'blanco' | 'bronce' | 'negro';
export type GlassKey =
  | 'claro'
  | 'nevado'
  | 'decorado'
  | 'mallado'
  | 'duplex'
  | 'aquafold'
  | 'bronce'
  | 'super_gris'
  | 'reflectivo_azul'
  | 'reflectivo_bronce';
/** Acabados de la cabina en L (valor de la opcion "acabado" de en-l). */
export type FinishKey = 'l-aquaclara' | 'l-frosted' | 'l-aquafold';

export interface ProductMedia {
  /** Portada por defecto de la tarjeta. */
  cover: MediaRef;
  /** Variantes de acabado, clave = `<aluminio>-<vidrio|acabado>` (ver variantKey). Sin entrada = se usa la portada. */
  variants?: Readonly<Record<string, MediaRef>>;
  /** Fotos extra del producto (galeria); nunca la portada. */
  gallery?: readonly MediaRef[];
}

/** Eleccion de acabado de una tarjeta o cotizacion (mismos nombres que el deep link y `Choices` de catalogHome). */
export interface VariantChoice {
  color?: string;
  vidrio?: string;
  /** Solo en-l: valor del acabado (`l-aquaclara` ...). Se usa cuando no hay `vidrio`. */
  acabado?: string;
}

export function variantKey(color: string, glass: string): string {
  return `${color}-${glass}`;
}

/** Definicion de un producto: nombre de la foto portada + fotos por vidrio/color + galeria. */
interface ProductSpec {
  cover: string;
  alt: string;
  /** vidrio|acabado -> nombre de foto. */
  byGlass?: Readonly<Record<string, string>>;
  /** aluminio -> nombre de foto (solo si no hay match de vidrio). */
  byColor?: Readonly<Record<string, string>>;
  /** Alt de las fotos por vidrio/color: nombre de foto -> alt. */
  alts?: Readonly<Record<string, string>>;
  gallery?: ReadonlyArray<readonly [name: string, alt: string]>;
}

const SPECS: Readonly<Record<string, ProductSpec>> = {
  // Ventanas
  'ventana-francesa': {
    cover: 'ventana-francesa',
    alt: 'Ventana francesa lisa de aluminio blanco con vidrio claro de 5 mm: una hoja fija y una corrediza',
    // Aluminio negro (#1): foto del color negro (ver byColor); tambien en la galeria.
    byColor: { negro: 'ventana-francesa-negro' },
    alts: {
      'ventana-francesa': 'Ventana francesa lisa de aluminio blanco con vidrio claro de 5 mm: una hoja fija y una corrediza',
      'ventana-francesa-negro': 'Ventana francesa lisa de aluminio negro con vidrio claro de 5 mm: una hoja fija y una corrediza',
    },
    gallery: [['ventana-francesa-negro', 'Ventana francesa lisa de aluminio negro con vidrio claro de 5 mm: una hoja fija y una corrediza']],
  },
  'ventana-bilbao': {
    cover: 'ventana-bilbao',
    alt: 'Ventana Bilbao de dos hojas corredizas con vidrio bronce',
  },
  // Solo asesor
  'ventana-bilbao-medio-punto': {
    cover: 'ventana-bilbao-medio-punto',
    alt: 'Ventana Bilbao de dos hojas corredizas con medio punto, vidrio claro de 5 mm y aluminio blanco',
  },
  // Puertas de jardin
  'jardin-1-hoja': {
    cover: 'jardin-1-hoja',
    alt: 'Puerta corrediza de una hoja para patio, vidrio claro de 5 mm',
    // Negro: su misma portada (#7).
    byColor: { negro: 'jardin-1-hoja' },
  },
  'jardin-2-hojas': {
    cover: 'jardin-2-hojas',
    alt: 'Puerta de jardín de dos hojas corredizas, vidrio claro de 5 mm y aluminio negro',
    byColor: { negro: 'jardin-2-hojas' }, // portada (#17)
    gallery: [['jardin-2-hojas-galeria', 'Puerta de dos hojas corredizas, vidrio claro de 5 mm, aluminio negro o blanco']],
  },
  'jardin-3-hojas': {
    cover: 'jardin-3-hojas',
    alt: 'Puerta de jardín corrediza de tres hojas, vidrio claro de 5 mm y aluminio natural',
    byColor: { negro: 'jardin-3-hojas-galeria' }, // #4
    alts: { 'jardin-3-hojas-galeria': 'Puerta de tres hojas corredizas, vidrio claro de 5 mm, aluminio negro o blanco' },
    gallery: [['jardin-3-hojas-galeria', 'Puerta de tres hojas corredizas, vidrio claro de 5 mm, aluminio negro o blanco']],
  },
  'jardin-2-fijas-2-corredizas': {
    cover: 'jardin-2-fijas-2-corredizas',
    alt: 'Puerta de jardín de cuatro hojas: un vidrio fijo en cada extremo y dos hojas corredizas al centro, aluminio negro',
  },
  'jardin-1-fijo-3-corredizas': {
    cover: 'jardin-1-fijo-3-corredizas',
    alt: 'Puerta de jardín con un vidrio fijo y tres hojas corredizas, vidrio claro de 5 mm y aluminio negro',
    gallery: [['jardin-1-fijo-3-corredizas-galeria', 'Puerta de jardín con un vidrio fijo y tres hojas corredizas, aluminio negro']],
  },
  // Puertas de bano
  recta: {
    cover: 'recta',
    alt: 'Puerta de ducha corrediza aquaclara, vidrio claro de 5 mm y aluminio natural',
    // claro no se lista: es la portada, y asi el color negro (#21) puede mostrarse con el vidrio por defecto.
    byGlass: { nevado: 'recta-nevado', decorado: 'recta-aquafold', aquafold: 'recta-aquafold' },
    byColor: { negro: 'recta-galeria' },

    alts: {
      recta: 'Puerta de ducha corrediza aquaclara, vidrio claro de 5 mm y aluminio natural',
      'recta-nevado': 'Puerta de ducha corrediza con vidrio nevado de 5 mm y aluminio natural',
      'recta-aquafold': 'Puerta de ducha corrediza aquafold, vidrio claro de 5 mm con diseño y aluminio natural',
      'recta-galeria': 'Puerta de ducha corrediza con vidrio claro de 5 mm y aluminio negro',
    },
    gallery: [['recta-galeria', 'Puerta de ducha corrediza con vidrio claro de 5 mm y aluminio negro']],
  },
  bisagra: {
    cover: 'bisagra',
    alt: 'Puerta de bisagra para baño, vidrio nevado de 5 mm y aluminio natural, altura de 2 m',
    // nevado/claro no se listan (son la portada): asi el color negro (#15) se ve con el vidrio por defecto.
    byGlass: { decorado: 'bisagra-decorado', aquafold: 'bisagra-decorado' },
    byColor: { negro: 'bisagra-decorado' },
    alts: {
      bisagra: 'Puerta de bisagra para baño, vidrio nevado de 5 mm y aluminio natural, altura de 2 m',
      'bisagra-decorado': 'Puerta de bisagra para ducha, vidrio claro de 5 mm con diseño y aluminio negro',
    },
    gallery: [['bisagra-galeria', 'Puerta de bisagra para ducha, antes y después: vidrio claro de 5 mm con diseño aquafold, aluminio negro']],
  },
  'en-l': {
    cover: 'en-l',
    alt: 'Puerta de ducha en L, vidrio claro de 5 mm y aluminio natural',
    byGlass: { 'l-aquaclara': 'en-l', 'l-frosted': 'en-l-frosted', 'l-aquafold': 'en-l-aquafold' },
    alts: {
      'en-l': 'Puerta de ducha en L aquaclara, vidrio claro de 5 mm y aluminio natural',
      'en-l-frosted': 'Puerta de ducha en L con vidrio nevado (frosted) y aluminio natural',
      'en-l-aquafold': 'Puerta de ducha en L aquafold, vidrio claro de 5 mm con diseño y aluminio natural',
    },
    gallery: [['en-l-galeria', 'Puerta de ducha en L, vidrio claro de 5 mm con diseño y aluminio natural']],
  },
  'templada-10mm': {
    cover: 'templada-10mm',
    alt: 'Puerta de ducha de vidrio templado de 10 mm con riel visto cromado: una hoja fija y una corrediza',
  },
  // Solo asesor
  'templada-10mm-abatible': {
    cover: 'templada-10mm-abatible',
    alt: 'Puerta abatible de vidrio templado de 10 mm con conectores y haladera tipo C',
  },
  // Puertas abatibles (todas solo asesor)
  'abatible-interior-exterior': {
    cover: 'abatible-interior-exterior',
    alt: 'Puerta de bisagra para interior y exterior, aluminio blanco con vidrio claro de 5 mm y chapa de doble manija',
  },
  'abatible-oficina-vidrio-fijo': {
    cover: 'abatible-oficina-vidrio-fijo',
    alt: 'Puerta de bisagra para oficina, aluminio negro con vidrio claro de 5 mm y vidrio fijo arriba por altura',
  },
  'abatible-oficina-cerrador': {
    cover: 'abatible-oficina-cerrador',
    alt: 'Puerta abatible para oficina, aluminio negro con haladera de concha y cerrador automático',
  },
};

/** Grupo que cambia el vidrio de un producto: "vidrio" o, en la cabina en L, "acabado". */
function finishGroupOf(config: ProductConfig): OptionGroup | undefined {
  return config.groups.find((g) => g.name === 'vidrio') ?? config.groups.find((g) => g.name === 'acabado');
}

/** Vidrio/acabado por defecto de un producto (peldano previo a la portada de la escalera). */
export function defaultFinishOf(config: ProductConfig): string | undefined {
  return finishGroupOf(config)?.defaultValue;
}

/** Foto de un producto para (color, vidrio|acabado): match de vidrio -> match de color -> portada. */
export function photoNameFor(spec: Pick<ProductSpec, 'cover' | 'byGlass' | 'byColor'>, color: string, finish: string): string {
  return spec.byGlass?.[finish] ?? spec.byColor?.[color] ?? spec.cover;
}

/** Variantes color x vidrio|acabado derivadas de PRODUCT_CONFIGS y de la regla de arriba (sin lista a mano). */
function variantsFor(slug: string, spec: ProductSpec): Readonly<Record<string, MediaRef>> | undefined {
  if (!spec.byGlass && !spec.byColor) return undefined;
  const config = PRODUCT_CONFIGS[slug];
  const color = config?.groups.find((g) => g.name === 'color');
  const finish = config ? finishGroupOf(config) : undefined;
  if (!color || !finish) return undefined;
  const out: Record<string, MediaRef> = {};
  for (const c of color.options) {
    for (const f of finish.options) {
      const name = photoNameFor(spec, c.value, f.value);
      out[variantKey(c.value, f.value)] = foto(name, spec.alts?.[name] ?? spec.alt);
    }
  }
  return out;
}

const buildMedia = (slug: string, spec: ProductSpec): ProductMedia => {
  const variants = variantsFor(slug, spec);
  const gallery = spec.gallery?.map(([name, alt]) => foto(name, alt));
  return {
    cover: foto(spec.cover, spec.alt),
    ...(variants ? { variants } : {}),
    ...(gallery ? { gallery } : {}),
  };
};

export const PRODUCT_MEDIA: Readonly<Record<string, ProductMedia>> = /* @__PURE__ */ Object.fromEntries(
  Object.entries(SPECS).map(([slug, spec]) => [slug, buildMedia(slug, spec)]),
);

/** Portadas de categoria. */
export const CATEGORY_MEDIA: Readonly<Record<string, MediaRef>> = {
  ventanas: foto('ventana-francesa-negro', 'Ventana francesa lisa de aluminio negro con vidrio claro de 5 mm'),
  'puertas-de-jardin': foto('jardin-1-fijo-3-corredizas', 'Puerta de jardín de aluminio negro con un vidrio fijo y tres hojas corredizas'),
  'puertas-de-bano': foto('en-l-galeria', 'Puerta de ducha en L con vidrio claro de 5 mm y aluminio natural'),
  'puertas-abatibles': foto('abatible-oficina-vidrio-fijo', 'Puerta abatible de oficina, aluminio negro con vidrio claro y vidrio fijo arriba'),
};

/** Fotos extra (galeria) de un producto; vacio si no tiene. */
export function galleryOf(cardSlug: string): readonly MediaRef[] {
  return PRODUCT_MEDIA[cardSlug]?.gallery ?? [];
}

/** Hero horizontal (puerta de 4 hojas). Con 480/800/ancho nativo en public/images/fotos/. El intro del inicio sigue siendo solo texto. */
export const HOME_HERO_MEDIA: MediaRef | null = {
  ...foto('jardin-2-fijas-2-corredizas', 'Puerta de jardín de cuatro hojas: un vidrio fijo en cada extremo y dos hojas corredizas al centro'),
  srcSet: `${FOTOS_DIR}/jardin-2-fijas-2-corredizas-480.webp 480w, ${FOTOS_DIR}/jardin-2-fijas-2-corredizas-800.webp 800w, ${FOTOS_DIR}/jardin-2-fijas-2-corredizas-1448.webp 1448w`,
};

/**
 * Escalera pura (sirve igual al servidor y al script de la tarjeta): variante exacta (color + vidrio|acabado)
 * -> mismo color con el vidrio/acabado por defecto del producto -> `undefined` (el llamador cae a la portada).
 */
export function pickVariant<T>(
  variants: Readonly<Record<string, T>>,
  choice: VariantChoice,
  defaultFinish: string | undefined,
): T | undefined {
  const { color } = choice;
  if (!color) return undefined;
  const finish = choice.vidrio ?? choice.acabado;
  const exact = finish ? variants[variantKey(color, finish)] : undefined;
  if (exact) return exact;
  return defaultFinish ? variants[variantKey(color, defaultFinish)] : undefined;
}

/**
 * Imagen de un producto para una eleccion de color/vidrio (en-l: color/acabado).
 * Escalera: variante exacta (vidrio -> color) -> mismo color con el vidrio por defecto -> portada base.
 */
export function coverFor(cardSlug: string, choice?: VariantChoice): MediaRef | null {
  const m = PRODUCT_MEDIA[cardSlug];
  if (!m) return null;
  const config = PRODUCT_CONFIGS[cardSlug];
  const hit = m.variants && choice ? pickVariant(m.variants, choice, config ? defaultFinishOf(config) : undefined) : undefined;
  return hit ?? m.cover;
}

/** Variantes de una tarjeta (para el swap por progressive enhancement). */
export function variantsOf(cardSlug: string): Readonly<Record<string, MediaRef>> {
  return PRODUCT_MEDIA[cardSlug]?.variants ?? {};
}
