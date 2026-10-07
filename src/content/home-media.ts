// UNICO mapa de imagenes del inicio: portadas de producto, de categoria, galeria y intro.
// 2026-10-06: TODO sale de los renders profesionales (public/images/renders/). Ninguna foto
// enviada por Alcusa se referencia desde aqui.
//
// Convencion de nombres (4:3, 1600x1200 salvo -800 / -cutout), clave = SLUG REAL del catalogo:
//   <slug>.webp                         base de estudio          (recta.webp, jardin-2-hojas.webp)
//   <slug>-800.webp                     version ligera 800x600   (la que usan las tarjetas)
//   <slug>-cutout.webp                  recorte con alfa (contain, sin marco)
//   <slug>-<aluminio>-<vidrio>-800.webp variante de acabado: UNA por cada combinacion de PRODUCT_CONFIGS
//                                       (catalogHome.ts) color x vidrio (en-l: color x acabado). El token del
//                                       vidrio es el valor de la opcion con `_` -> `-` y sin el prefijo `l-`
//                                       (recta-bronce-aquafold-800, ventana-francesa-natural-super-gris-800,
//                                       en-l-natural-aquaclara-800). Solo templada-10mm no tiene opciones.
//   Los `<slug>-<aluminio>-<claro|nevado>[-cutout].webp` antiguos de las ventanas siguen en disco pero ya no se mapean.
// Los archivos de origen del disenador se llaman `bano-<modelo>` / `<name>__<alu>-<vidrio>`;
// RENDER_SOURCE_NAME solo documenta la equivalencia (no se renombran slugs).
import type { CatalogImage } from './catalogContent';
import { PRODUCT_CONFIGS, type OptionGroup, type ProductConfig } from './catalogHome';

export type MediaRef = CatalogImage;

export const RENDERS_DIR = '/images/renders' as const;

/** Slug del catalogo -> nombre del render del disenador (solo documentacion/equivalencia). */
export const RENDER_SOURCE_NAME: Readonly<Record<string, string>> = {
  'templada-10mm': 'bano-templada-10mm',
  recta: 'bano-recta',
  'en-l': 'bano-en-l',
  bisagra: 'bano-bisagra',
};

/** Ratio del slot de portada de tarjeta: render 4:3 exacto (object-fit: cover, sin blur). */
export const COVER_RATIO = '4/3' as const;
const W = 800;
const H = 600;

export type AluminumKey = 'natural' | 'blanco' | 'bronce';
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
  /** Portada por defecto de la tarjeta (slot 4:3). */
  cover: MediaRef;
  /** Variantes de acabado, clave = `<aluminio>-<vidrio|acabado>` (ver variantKey). Sin entrada = se usa la portada. */
  variants?: Readonly<Record<string, MediaRef>>;
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

const render = (file: string, alt: string, width = W, height = H): MediaRef => ({
  src: `${RENDERS_DIR}/${file}.webp`,
  alt,
  width,
  height,
  kind: 'render',
});

const ALU_ES: Readonly<Record<AluminumKey, string>> = { natural: 'aluminio natural', blanco: 'aluminio blanco', bronce: 'aluminio bronce' };
// Clave = valor de la opcion (catalogHome: grupos "vidrio" y "acabado").
const GLASS_ES: Readonly<Record<GlassKey | FinishKey, string>> = {
  claro: 'vidrio claro',
  nevado: 'vidrio nevado',
  decorado: 'vidrio decorado',
  mallado: 'vidrio mallado',
  duplex: 'vidrio dúplex',
  aquafold: 'vidrio aquafold',
  bronce: 'vidrio bronce',
  super_gris: 'vidrio súper gris',
  reflectivo_azul: 'vidrio reflectivo azul',
  reflectivo_bronce: 'vidrio reflectivo bronce',
  'l-aquaclara': 'vidrio aquaclara',
  'l-frosted': 'vidrio frosted',
  'l-aquafold': 'vidrio aquafold',
};

/** Alt de la portada de cada producto (clave = slug de tarjeta). */
const COVER_ALT: Readonly<Record<string, string>> = {
  'ventana-francesa': 'Ventana francesa de aluminio con cuadrícula',
  'ventana-bilbao': 'Ventana Bilbao de dos hojas corredizas de aluminio y vidrio',
  'jardin-1-hoja': 'Puerta de jardín corrediza de una hoja, aluminio y vidrio',
  'jardin-2-hojas': 'Puerta de jardín corrediza de dos hojas',
  'jardin-3-hojas': 'Puerta de jardín corrediza de tres hojas, aluminio y vidrio',
  // "Más opciones para tu jardín" (solo asesor): solo portada, sin variantes ni opciones.
  'jardin-2-fijas-2-corredizas': 'Puerta de jardín de cuatro hojas: dos fijas y dos corredizas, aluminio y vidrio',
  'jardin-1-fijo-3-corredizas': 'Puerta de jardín de cuatro hojas: una fija y tres corredizas, aluminio y vidrio',
  'templada-10mm': 'Puerta de baño de vidrio templado de 10 mm',
  recta: 'Puerta de baño recta corrediza',
  'en-l': 'Puerta de baño en L, cabina de ducha de aluminio y vidrio',
  bisagra: 'Puerta de baño de bisagra, aluminio y vidrio',
};

/** Sustantivo del alt de las variantes: "{noun} con aluminio X y vidrio Y". */
const NOUN: Readonly<Record<string, string>> = {
  'ventana-francesa': 'Ventana francesa de aluminio con cuadrícula',
  'ventana-bilbao': 'Ventana Bilbao de dos hojas corredizas',
  'jardin-1-hoja': 'Puerta de jardín corrediza de una hoja',
  'jardin-2-hojas': 'Puerta de jardín corrediza de dos hojas',
  'jardin-3-hojas': 'Puerta de jardín corrediza de tres hojas',
  recta: 'Puerta de baño recta corrediza',
  'en-l': 'Puerta de baño en L, cabina de ducha',
  bisagra: 'Puerta de baño de bisagra',
};

/** Grupo que cambia el vidrio de un producto: "vidrio" o, en la cabina en L, "acabado". */
function finishGroupOf(config: ProductConfig): OptionGroup | undefined {
  return config.groups.find((g) => g.name === 'vidrio') ?? config.groups.find((g) => g.name === 'acabado');
}

/** Vidrio/acabado por defecto de un producto (peldano previo a la portada de la escalera). */
export function defaultFinishOf(config: ProductConfig): string | undefined {
  return finishGroupOf(config)?.defaultValue;
}

/** Token del nombre de archivo: valor de la opcion con `_` -> `-` y sin el prefijo `l-` de en-l. */
const fileToken = (value: string): string => value.replace(/^l-/, '').replace(/_/g, '-');

/** Variantes color x vidrio|acabado derivadas de PRODUCT_CONFIGS (sin lista a mano). */
function variantsFor(slug: string): Readonly<Record<string, MediaRef>> | undefined {
  const config = PRODUCT_CONFIGS[slug];
  const color = config?.groups.find((g) => g.name === 'color');
  const finish = config ? finishGroupOf(config) : undefined;
  const noun = NOUN[slug];
  if (!color || !finish || !noun) return undefined;
  const out: Record<string, MediaRef> = {};
  for (const c of color.options) {
    for (const f of finish.options) {
      const alt = `${noun} con ${ALU_ES[c.value as AluminumKey]} y ${GLASS_ES[f.value as GlassKey | FinishKey]}`;
      out[variantKey(c.value, f.value)] = render(`${slug}-${c.value}-${fileToken(f.value)}-800`, alt);
    }
  }
  return out;
}

const buildMedia = (slug: string, alt: string): ProductMedia => {
  const variants = variantsFor(slug);
  return variants ? { cover: render(`${slug}-800`, alt), variants } : { cover: render(`${slug}-800`, alt) };
};

export const PRODUCT_MEDIA: Readonly<Record<string, ProductMedia>> = /* @__PURE__ */ Object.fromEntries(
  Object.entries(COVER_ALT).map(([slug, alt]) => [slug, buildMedia(slug, alt)]),
);

/** Portadas de categoria: el render de producto mas fuerte de cada una (los cover-* quedan de respaldo). */
export const CATEGORY_MEDIA: Readonly<Record<string, MediaRef>> = {
  ventanas: render('ventana-francesa-800', 'Ventana francesa de aluminio con cuadrícula'),
  'puertas-de-jardin': render('jardin-3-hojas-800', 'Puerta de jardín corrediza de tres hojas'),
  'puertas-de-bano': render('recta-800', 'Puerta de baño recta corrediza de vidrio'),
};

/** Imagen del intro del inicio (el intro es solo texto: sin imagen). */
export const HOME_HERO_MEDIA: MediaRef | null = null;

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
 * Escalera: variante exacta -> mismo color con el vidrio por defecto del producto -> portada base.
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
