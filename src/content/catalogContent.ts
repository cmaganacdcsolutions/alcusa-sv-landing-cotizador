// Catalog presentation data (R2). The MODEL (slugs, prices, presets) lives in
// catalog.ts; this file holds everything ALCUSA will send later: photos, alt
// text, descriptions, specs. Loading real data = editing ONLY this file (and
// dropping the files in public/). No page or component changes.
//
// Every value that is a stand-in is named in `pending`; `validateCatalogContent`
// fails the build when the data contradicts itself (see catalogContent.test.ts).

export type PendingField = 'photo' | 'description' | 'specs' | 'price';

export interface CatalogImage {
  /** Absolute public path, e.g. `/images/catalog-l.jpeg`. */
  src: string;
  /** Descriptive alt text (required by the a11y rule). */
  alt: string;
}

export interface SpecRow {
  label: string;
  value: string;
}

export interface CatalogContent {
  /** Card title when it differs from the model name (board copy). */
  cardTitle?: string;
  /** Detail h1 when it differs from the card title. */
  detailTitle?: string;
  /** Short chip label for index/category cards. */
  chip?: string;
  /** One-line description for index cards. */
  blurb?: string;
  /** Detail description (or category lead). */
  description?: string;
  /** Empty => the "FOTO PRÓXIMAMENTE" placeholder renders. */
  images: readonly CatalogImage[];
  /** Rendered only when non-empty. */
  specs?: readonly SpecRow[];
  /** Stand-in values awaiting ALCUSA. Drives DATOS A CARGAR and tests. */
  pending: readonly PendingField[];
}

const EMPTY: CatalogContent = { images: [], pending: ['photo', 'description'] };

export const CATEGORY_CONTENT: Readonly<Record<string, CatalogContent>> = {
  'puertas-de-bano': {
    blurb: 'Vidrio templado, rectas, en L y de bisagra.',
    description: 'Cuatro modelos fabricados a tu medida. Elige uno para ver el detalle o cotizarlo.',
    images: [{ src: '/images/catalog-recta.jpg', alt: 'Puerta de baño recta corrediza' }],
    pending: ['description'],
  },
  'puertas-de-jardin': {
    blurb: 'Corredizas de una, dos y tres hojas, y más opciones.',
    description: 'Corredizas de una, dos y tres hojas, y combinaciones con paneles fijos.',
    images: [{ src: '/images/catalog-jardin.webp', alt: 'Puerta de jardín corrediza de tres hojas' }],
    pending: ['description'],
  },
  ventanas: {
    blurb: 'Francesa y Bilbao, a tu medida.',
    description: 'Francesa y Bilbao, fabricadas a tu medida. Elige una para ver el detalle o cotizarla.',
    images: [{ src: '/images/catalog-ventana.jpeg', alt: 'Ventanas francesas con perfil negro' }],
    pending: ['description'],
  },
};

export const ITEM_CONTENT: Readonly<Record<string, CatalogContent>> = {
  'templada-10mm': {
    cardTitle: 'Templada 10 mm',
    chip: 'Templada 10 mm',
    description: 'Puerta de vidrio templado de 10 mm, fabricada a tu medida, con alto fijo de 2.00 m.',
    images: [{ src: '/images/catalog-templado.jpeg', alt: 'Puerta de vidrio templado de 10 mm' }],
    pending: ['description'],
  },
  recta: {
    cardTitle: 'Rectas',
    chip: 'Rectas',
    description: 'Puerta de baño recta corrediza, fabricada a tu medida, con perfil de aluminio y el vidrio que elijas.',
    images: [{ src: '/images/catalog-recta.jpg', alt: 'Puerta de baño recta corrediza' }],
    pending: ['description'],
  },
  'en-l': {
    cardTitle: 'En L',
    detailTitle: 'Puerta en L',
    chip: 'En L',
    description: 'Cabina en L fabricada a tu medida, con perfil de aluminio y el vidrio que elijas.',
    images: [{ src: '/images/catalog-l.jpeg', alt: 'Cabina de baño en L con perfil negro' }],
    pending: ['description'],
  },
  // Finishes of "En L": no own photo yet, the detail keeps the parent's photo.
  'l-aquaclara': { chip: 'Aquaclara', images: [], pending: ['photo', 'description'] },
  'l-frosted': { chip: 'Frosted', images: [], pending: ['photo', 'description'] },
  'l-aquafold': { chip: 'Aquafold', images: [], pending: ['photo', 'description'] },
  bisagra: {
    cardTitle: 'De bisagra',
    chip: 'De bisagra',
    description: 'Puerta de baño con bisagra, fabricada a tu medida, con alto fijo de 1.85 m.',
    images: [{ src: '/images/catalog-bisagra.jpeg', alt: 'Puerta de baño con bisagra' }],
    pending: ['description'],
  },
  'jardin-1-hoja': {
    chip: '1 hoja',
    description: 'Puerta corrediza de una hoja, fabricada a tu medida.',
    images: [],
    pending: ['photo'],
  },
  'jardin-2-hojas': {
    chip: '2 hojas',
    description: 'Puerta corrediza de dos hojas, fabricada a tu medida.',
    images: [],
    pending: ['photo', 'description'],
  },
  'jardin-3-hojas': {
    chip: '3 hojas',
    description: 'Puerta corrediza de tres hojas, fabricada a tu medida.',
    images: [{ src: '/images/catalog-jardin.webp', alt: 'Puerta de jardín corrediza de tres hojas' }],
    pending: ['description'],
  },
  'jardin-2-fijas-2-corredizas': {
    chip: 'Más opciones',
    description: 'Una combinación a medida para tu jardín. Un asesor te prepara la cotización.',
    images: [],
    pending: ['photo'],
  },
  'jardin-1-fijo-3-corredizas': {
    chip: 'Más opciones',
    description: 'Una combinación a medida para tu jardín. Un asesor te prepara la cotización.',
    images: [],
    pending: ['photo', 'description'],
  },
  'ventana-francesa': {
    chip: 'Francesa',
    description: 'Ventana francesa de aluminio, fabricada a tu medida.',
    images: [{ src: '/images/catalog-ventana.jpeg', alt: 'Ventanas francesas con perfil negro' }],
    pending: ['description'],
  },
  'ventana-bilbao': {
    chip: 'Bilbao',
    description: 'Ventana Bilbao de aluminio, fabricada a tu medida.',
    images: [{ src: '/images/hero-ventana-bilbao-800.webp', alt: 'Ventana Bilbao de aluminio' }],
    pending: ['description'],
  },
};

/** Content for a slug; unknown slugs fall back to an all-placeholder entry. */
export function contentFor(slug: string): CatalogContent {
  return CATEGORY_CONTENT[slug] ?? ITEM_CONTENT[slug] ?? EMPTY;
}

export interface ContentIssue {
  slug: string;
  problem: string;
}

/**
 * Pure integrity check. `slugs` = every slug the model exposes; `exists`
 * optionally verifies image files (the build passes an fs-backed predicate).
 */
export function validateCatalogContent(
  slugs: readonly string[],
  content: Readonly<Record<string, CatalogContent>> = { ...CATEGORY_CONTENT, ...ITEM_CONTENT },
  exists?: (publicPath: string) => boolean,
): ContentIssue[] {
  const issues: ContentIssue[] = [];
  for (const slug of slugs) {
    const c = content[slug];
    if (!c) {
      issues.push({ slug, problem: 'sin entrada de contenido' });
      continue;
    }
    if (c.images.length === 0 && !c.pending.includes('photo')) {
      issues.push({ slug, problem: 'sin imágenes y sin marcar pending:photo' });
    }
    if (c.images.length > 0 && c.pending.includes('photo')) {
      issues.push({ slug, problem: 'tiene imagen pero sigue marcado pending:photo' });
    }
    for (const img of c.images) {
      if (!img.src.startsWith('/')) issues.push({ slug, problem: `src no absoluto: ${img.src}` });
      if (img.alt.trim().length < 5) issues.push({ slug, problem: `alt vacío o muy corto: ${img.src}` });
      if (exists && !exists(img.src)) issues.push({ slug, problem: `archivo inexistente: ${img.src}` });
    }
    if (!c.description && !c.blurb && !c.pending.includes('description')) {
      issues.push({ slug, problem: 'sin descripción y sin marcar pending:description' });
    }
  }
  const known = new Set(slugs);
  for (const slug of Object.keys(content)) {
    if (!known.has(slug)) issues.push({ slug, problem: 'contenido huérfano: el slug no existe en el modelo' });
  }
  return issues;
}

export function assertCatalogContent(slugs: readonly string[], exists?: (publicPath: string) => boolean): void {
  const issues = validateCatalogContent(slugs, undefined, exists);
  if (issues.length > 0) {
    throw new Error(`catalogContent inválido:\n${issues.map((i) => `- ${i.slug}: ${i.problem}`).join('\n')}`);
  }
}
