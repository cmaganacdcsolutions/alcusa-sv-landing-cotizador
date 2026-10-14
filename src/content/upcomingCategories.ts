// Categorias del catalogo SIN precio ni cotizador en linea (cliente, 2026-10-14): fotos y precios pendientes.
// Viven aparte de CATEGORIES (catalog.ts) a proposito: el cotizador, los deep links y el pricing no las conocen.
export type UpcomingCategorySlug = 'espejos' | 'zarandas' | 'fachadas-comerciales';

export interface UpcomingCategory {
  /** Id de la seccion del inicio (ancla /#slug, contrato con navbar y footer). */
  readonly slug: UpcomingCategorySlug;
  readonly name: string;
  /** Mensaje prellenado de WhatsApp del CTA de la seccion. */
  readonly waMessage: string;
}

/** Orden de aparicion en el inicio: despues de Ventanas. */
export const UPCOMING_CATEGORIES: readonly UpcomingCategory[] = [
  { slug: 'espejos', name: 'Espejos', waMessage: 'Hola, quiero cotizar espejos.' },
  { slug: 'zarandas', name: 'Zarandas', waMessage: 'Hola, quiero cotizar zarandas.' },
  { slug: 'fachadas-comerciales', name: 'Fachadas comerciales', waMessage: 'Hola, quiero cotizar fachadas comerciales.' },
];

/** Tarjetas placeholder por seccion. */
export const UPCOMING_PLACEHOLDER_COUNT = 3;
export const UPCOMING_PLACEHOLDER_COPY = {
  image: 'Imagen pendiente',
  title: 'Modelo por confirmar',
  price: 'Precio pendiente',
  cta: 'Cotizar con un asesor',
} as const;
