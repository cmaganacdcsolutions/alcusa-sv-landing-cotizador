// Categorias del catalogo SIN cotizador en linea (cliente, 2026-10-14; contenido real de Zarandas y Fachadas 2026-10-16).
// Viven aparte de CATEGORIES (catalog.ts) a proposito: el cotizador, los deep links y el pricing no las conocen.
export type UpcomingCategorySlug = 'espejos' | 'zarandas' | 'fachadas-comerciales';

/** Foto oficial de Alcusa servida desde public/images/fotos (sin lightbox: no es interactiva). */
export interface CategoryPhoto {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

/** Tarjeta de producto con foto, descripcion y precio (Zarandas). */
export interface ProductPresentation {
  readonly title: string;
  readonly photo: CategoryPhoto;
  /** Precio tal como lo comunico Alcusa. */
  readonly price: string;
  /** Datos tal cual los envio el cliente (sin inferir instalacion ni IVA). */
  readonly details: readonly string[];
}

/** Galeria de fotos con texto de cotizacion y sin precio (Fachadas comerciales). */
export interface GalleryPresentation {
  readonly heading: string;
  readonly body: string;
  readonly photos: readonly CategoryPhoto[];
}

export type UpcomingContent =
  | { readonly kind: 'placeholder' }
  | { readonly kind: 'product'; readonly product: ProductPresentation }
  | { readonly kind: 'gallery'; readonly gallery: GalleryPresentation };

export interface UpcomingCategory {
  /** Id de la seccion del inicio (ancla /#slug, contrato con navbar y footer). */
  readonly slug: UpcomingCategorySlug;
  readonly name: string;
  /** Mensaje prellenado de WhatsApp del CTA de la seccion. */
  readonly waMessage: string;
  readonly content: UpcomingContent;
}

const FOTOS = '/images/fotos';
const fachada = (n: string, width: number, height: number, alt: string): CategoryPhoto => ({
  src: `${FOTOS}/fachada-${n}-${width}.webp`,
  width,
  height,
  alt,
});

/**
 * Fachadas 01-03 y 05-07: cerramientos y terrazas residenciales; 04 y 08-10: locales comerciales.
 * El ORDEN no es el del archivo: esta pensado para las filas justificadas de la galeria (la ultima fila se estira
 * y debe quedar con 2+ fotos a 1920/1280/768/390; el orden anterior dejaba la 10 sola). Si agregas fotos, vuelve a
 * revisar la ultima fila en esos anchos.
 */
export const FACHADAS_PHOTOS: readonly CategoryPhoto[] = [
  fachada('01', 800, 600, 'Cerramiento de vidrio con marco de aluminio negro y hojas corredizas en un pasillo techado'),
  fachada('02', 800, 599, 'Interior amplio visto a través de un cerramiento de vidrio con marcos de aluminio negro y puertas corredizas'),
  fachada('05', 800, 600, 'Terraza techada cerrada con ventanales de vidrio y marcos de aluminio oscuro'),
  fachada('04', 800, 1067, 'Fachada de un local con puerta y paños de vidrio con marco de aluminio negro bajo un rótulo rojo que dice «¡Bienvenido!»'),
  fachada('03', 800, 1066, 'Terraza con cerramiento de vidrio y marcos de aluminio negro, con sillas blancas al frente'),
  fachada('06', 800, 1067, 'Corredor con ventanales de vidrio de piso a techo y vista a un jardín'),
  fachada('07', 800, 600, 'Cerramiento de vidrio con marcos de aluminio negro frente a un jardín con plantas'),
  fachada('09', 800, 1067, 'Entrada de un local con ventanal de vidrio y hojas corredizas con marco de aluminio'),
  fachada('08', 800, 600, 'Fachada de un local con puerta corrediza de vidrio y ventana fija con marcos de aluminio negro'),
  fachada('10', 708, 944, 'Puerta doble de vidrio con marco de aluminio blanco en la fachada de un local'),
];

export const ZARANDA_PRODUCT: ProductPresentation = {
  title: 'Zarandas para ventanas francesas y celosías',
  photo: {
    src: `${FOTOS}/zaranda-aluminio-negro-693.webp`,
    width: 693,
    height: 924,
    alt: 'Zaranda de malla en un marco de aluminio negro',
  },
  price: '$25.00 por m²',
  details: ['Aluminio negro o blanco', 'Área mínima: 0.80 m²'],
};

/** Espejo (cliente, 2026-10-20): una foto y sin precio. Retocada (mano/telefono del fotografo en el reflejo); sin recorte. */
export const ESPEJO_PRODUCT: ProductPresentation = {
  title: 'Espejo de 5 mm con chapetones',
  photo: {
    src: `${FOTOS}/espejo-5mm-chapetones-320.webp`,
    width: 320,
    height: 426,
    alt: 'Espejo rectangular sin marco sobre un lavamanos, fijado a la pared con chapetones metálicos',
  },
  price: 'Cotización con asesor',
  details: ['Espejo de 5 mm', 'Fijación con chapetones'],
};

export const FACHADAS_GALLERY: GalleryPresentation = {
  heading: 'Cotización con asesor.',
  body: 'Con tus medidas te damos una cotización aproximada; la modalidad y los detalles se definen con un asesor. Restricciones aplican.',
  photos: FACHADAS_PHOTOS,
};

/** Orden de aparicion en el inicio: despues de Ventanas. */
export const UPCOMING_CATEGORIES: readonly UpcomingCategory[] = [
  {
    slug: 'espejos',
    name: 'Espejos',
    waMessage: 'Hola, quiero cotizar un espejo de 5 mm con chapetones.',
    content: { kind: 'product', product: ESPEJO_PRODUCT },
  },
  {
    slug: 'zarandas',
    name: 'Zarandas',
    waMessage: 'Hola, quiero cotizar zarandas para ventanas francesas y celosías.',
    content: { kind: 'product', product: ZARANDA_PRODUCT },
  },
  {
    slug: 'fachadas-comerciales',
    name: 'Fachadas comerciales',
    waMessage: 'Hola, quiero cotizar una fachada comercial.',
    content: { kind: 'gallery', gallery: FACHADAS_GALLERY },
  },
];

/** Tarjetas placeholder por seccion (hoy ninguna categoria usa content.kind === 'placeholder'; Espejos paso a producto 2026-10-20). */
export const UPCOMING_PLACEHOLDER_COUNT = 3;
export const UPCOMING_PLACEHOLDER_COPY = {
  image: 'Imagen pendiente',
  title: 'Modelo por confirmar',
  price: 'Precio pendiente',
  cta: 'Cotizar con un asesor',
} as const;
