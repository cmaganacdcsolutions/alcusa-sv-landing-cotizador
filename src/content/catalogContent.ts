// Catalog presentation data (R2). The MODEL (slugs, prices, presets) lives in
// catalog.ts; this file holds everything ALCUSA will send later: photos, alt
// text, descriptions, specs. Loading real data = editing ONLY this file (and
// dropping the files in public/). No page or component changes.
//
// Every value that is a stand-in is named in `pending`; `validateCatalogContent`
// fails the build when the data contradicts itself (see catalogContent.test.ts).

export type PendingField = 'photo' | 'description' | 'specs' | 'price';

export interface CatalogImage {
  /** Absolute public path, e.g. `/images/catalog/puertas-de-bano/en-l/en-l-1200.webp`. */
  src: string;
  /** Descriptive alt text (required by the a11y rule). */
  alt: string;
  /** Intrinsic pixel size of `src` (reserves space, avoids layout shift). */
  width: number;
  height: number;
  /** Focal point (CSS object-position) for tall photos shown cropped in galleries. */
  objectPosition?: string;
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
  /** Extra photos shown in a gallery below the main block (never the primary image). */
  gallery?: readonly CatalogImage[];
  /** Rendered only when non-empty. */
  specs?: readonly SpecRow[];
  /** Stand-in values awaiting ALCUSA. Drives DATOS A CARGAR and tests. */
  pending: readonly PendingField[];
}

const EMPTY: CatalogContent = { images: [], pending: ['photo', 'description'] };

export const CATEGORY_CONTENT: Readonly<Record<string, CatalogContent>> = {
  'puertas-de-bano': {
    blurb: 'Vidrio templado, rectas, en L y de bisagra.',
    description:
      'Cuatro modelos fabricados a tu medida. Elige uno para ver el detalle o cotizarlo.',
    images: [
      {
        src: '/images/catalog/puertas-de-bano/_general/general-1200.webp',
        width: 1200,
        height: 1600,
        alt: 'Cerramiento de ducha con puerta corrediza de vidrio nevado y aluminio natural',
      },
    ],
    pending: ['description'],
  },
  'puertas-de-jardin': {
    blurb: 'Corredizas de una, dos y tres hojas, y más opciones.',
    description:
      'Corredizas de una, dos y tres hojas, y combinaciones con paneles fijos.',
    images: [
      {
        src: '/images/catalog/puertas-de-jardin/_general/general-1200.webp',
        width: 1200,
        height: 1600,
        alt: 'Puerta de jardín corrediza de vidrio claro con perfil de aluminio negro',
      },
    ],
    gallery: [
      {
        src: '/images/catalog/puertas-de-jardin/_general/abatible-1-1200.webp',
        width: 1200,
        height: 1600,
        alt: 'Puerta de jardín abatible de dos hojas con vidrio y perfil de aluminio negro',
      },
      {
        src: '/images/catalog/puertas-de-jardin/_general/abatible-2-1200.webp',
        width: 1200,
        height: 1600,
        alt: 'Puerta abatible de dos hojas de vidrio claro con perfil de aluminio negro en el interior de una casa',
      },
      {
        src: '/images/catalog/puertas-de-jardin/_general/abatible-5-1200.webp',
        width: 1200,
        height: 1600,
        alt: 'Puerta abatible de vidrio con aluminio negro abierta hacia un pasillo exterior',
      },
      {
        src: '/images/catalog/puertas-de-jardin/_general/jardin-9-1200.webp',
        width: 1200,
        height: 900,
        alt: 'Muro corredizo de vidrio de varios paneles con perfil de aluminio negro abierto hacia el jardín',
      },
      {
        src: '/images/catalog/puertas-de-jardin/_general/abatible-4-417.webp',
        width: 417,
        height: 554,
        alt: 'Puerta abatible de una hoja con perfil de aluminio blanco y vidrio',
      },
      {
        src: '/images/catalog/puertas-de-jardin/_general/abatible-3-359.webp',
        width: 359,
        height: 477,
        alt: 'Puerta abatible de una hoja con vidrio y aluminio negro',
      },
      {
        src: '/images/catalog/puertas-de-jardin/_general/abatible-6-305.webp',
        width: 305,
        height: 576,
        alt: 'Puerta abatible de aluminio negro con paño superior de vidrio',
        objectPosition: 'center top',
      },
      {
        src: '/images/catalog/puertas-de-jardin/_general/abatible-7-430.webp',
        width: 430,
        height: 422,
        alt: 'Puerta abatible de una hoja con manija de palanca y vidrio tintado en un pasillo interior',
      },
    ],
    pending: ['description'],
  },
  ventanas: {
    blurb: 'Francesa y Bilbao, a tu medida.',
    description:
      'Francesa y Bilbao, fabricadas a tu medida. Elige una para ver el detalle o cotizarla.',
    images: [
      {
        src: '/images/catalog/ventanas/_general/general-1200.webp',
        width: 1200,
        height: 1600,
        alt: 'Ventana francesa con cuadrícula, vidrio super gris y aluminio negro',
      },
    ],
    pending: ['description'],
  },
};

export const ITEM_CONTENT: Readonly<Record<string, CatalogContent>> = {
  'templada-10mm': {
    cardTitle: 'Templada 10 mm',
    chip: 'Templada 10 mm',
    description:
      'Puerta de vidrio templado de 10 mm, fabricada a tu medida, con alto fijo de 2.00 m.',
    images: [
      {
        src: '/images/catalog/puertas-de-bano/templada-10mm/templada-10mm-1200.webp',
        width: 1200,
        height: 1599,
        alt: 'Puerta de ducha de vidrio templado de 10 mm con riel visto cromado',
      },
    ],
    pending: ['description'],
  },
  recta: {
    cardTitle: 'Rectas',
    chip: 'Rectas',
    description:
      'Puerta de baño recta corrediza, fabricada a tu medida, con perfil de aluminio y el vidrio que elijas.',
    images: [
      {
        src: '/images/catalog/puertas-de-bano/recta/recta-1200.webp',
        width: 1200,
        height: 1600,
        alt: 'Puerta de ducha recta corrediza con vidrio nevado y aluminio natural',
      },
    ],
    pending: ['description'],
  },
  'en-l': {
    cardTitle: 'En L',
    detailTitle: 'Puerta en L',
    chip: 'En L',
    description:
      'Cabina en L fabricada a tu medida, con perfil de aluminio y el vidrio que elijas.',
    images: [
      {
        src: '/images/catalog/puertas-de-bano/en-l/en-l-1200.webp',
        width: 1200,
        height: 1600,
        alt: 'Cabina de ducha en L con vidrio claro y aluminio natural',
      },
    ],
    pending: ['description'],
  },
  // Finishes of "En L": no own photo yet, the detail keeps the parent's photo.
  'l-aquaclara': {
    chip: 'Aquaclara',
    images: [
      {
        src: '/images/catalog/puertas-de-bano/en-l/en-l-1200.webp',
        width: 1200,
        height: 1600,
        alt: 'Cabina de ducha en L Aquaclara con vidrio claro y aluminio natural',
      },
    ],
    pending: ['description'],
  },
  'l-frosted': {
    chip: 'Frosted',
    images: [
      {
        src: '/images/catalog/puertas-de-bano/en-l/l-frosted-800.webp',
        width: 800,
        height: 1067,
        alt: 'Cabina de ducha en L con vidrio nevado y aluminio natural',
      },
    ],
    pending: ['description'],
  },
  'l-aquafold': {
    chip: 'Aquafold',
    images: [
      {
        src: '/images/catalog/puertas-de-bano/en-l/l-aquafold-1200.webp',
        width: 1200,
        height: 1200,
        alt: 'Cabina de ducha en L con vidrio decorativo Aquafold y aluminio natural',
      },
    ],
    pending: ['description'],
  },
  bisagra: {
    cardTitle: 'De bisagra',
    chip: 'De bisagra',
    description:
      'Puerta de baño con bisagra, fabricada a tu medida, con alto fijo de 1.85 m.',
    images: [
      {
        src: '/images/catalog/puertas-de-bano/bisagra/bisagra-1200.webp',
        width: 1200,
        height: 1600,
        alt: 'Puerta de ducha de bisagra con franjas de vidrio nevado y aluminio negro',
      },
    ],
    gallery: [
      {
        src: '/images/catalog/puertas-de-bano/bisagra/bisagra-b-320.webp',
        width: 320,
        height: 427,
        alt: 'Puerta de ducha de bisagra con marco de aluminio negro y vidrio esmerilado, instalada',
      },
      {
        src: '/images/catalog/puertas-de-bano/bisagra/bisagra-c-323.webp',
        width: 323,
        height: 475,
        alt: 'Puerta de baño de bisagra con marco de aluminio color champán y vidrio texturizado',
      },
    ],
    pending: ['description'],
  },
  'jardin-1-hoja': {
    chip: '1 hoja',
    description: 'Puerta corrediza de una hoja, fabricada a tu medida.',
    images: [
      {
        src: '/images/catalog/puertas-de-jardin/jardin-1-hoja/jardin-1-hoja-1200.webp',
        width: 1200,
        height: 1600,
        alt: 'Puerta de jardín corrediza de una hoja con aluminio blanco',
      },
    ],
    gallery: [
      {
        src: '/images/catalog/puertas-de-jardin/jardin-1-hoja/jardin-1-hoja-c-340.webp',
        width: 340,
        height: 686,
        alt: 'Puerta corrediza de una hoja con perfil de aluminio negro y vidrio ahumado sobre pared amarilla',
        objectPosition: 'center top',
      },
    ],
    pending: [],
  },
  'jardin-2-hojas': {
    chip: '2 hojas',
    description: 'Puerta corrediza de dos hojas, fabricada a tu medida.',
    images: [
      {
        src: '/images/catalog/puertas-de-jardin/jardin-2-hojas/jardin-2-hojas-1200.webp',
        width: 1200,
        height: 900,
        alt: 'Puerta de jardín corrediza de dos hojas con vidrio claro y aluminio blanco',
      },
    ],
    pending: ['description'],
  },
  'jardin-3-hojas': {
    chip: '3 hojas',
    description: 'Puerta corrediza de tres hojas, fabricada a tu medida.',
    images: [
      {
        src: '/images/catalog/puertas-de-jardin/jardin-3-hojas/jardin-3-hojas-800.webp',
        width: 800,
        height: 1422,
        alt: 'Puerta de jardín corrediza de tres hojas con aluminio negro',
        objectPosition: 'center 40%',
      },
    ],
    pending: ['description'],
  },
  'jardin-2-fijas-2-corredizas': {
    chip: 'Más opciones',
    description:
      'Una combinación a medida para tu jardín. Un asesor te prepara la cotización.',
    images: [],
    pending: ['photo'],
  },
  'jardin-1-fijo-3-corredizas': {
    chip: 'Más opciones',
    description:
      'Una combinación a medida para tu jardín. Un asesor te prepara la cotización.',
    images: [
      {
        src: '/images/catalog/puertas-de-jardin/jardin-1-fijo-3-corredizas/jardin-1-fijo-3-corredizas-1200.webp',
        width: 1200,
        height: 1600,
        alt: 'Puerta de jardín con paño fijo superior y tres hojas corredizas en aluminio negro',
      },
    ],
    pending: ['description'],
  },
  'ventana-francesa': {
    chip: 'Francesa',
    description: 'Ventana francesa de aluminio, fabricada a tu medida.',
    images: [
      {
        src: '/images/catalog/ventanas/ventana-francesa/ventana-francesa-1200.webp',
        width: 1200,
        height: 1600,
        alt: 'Ventana francesa con cuadrícula, vidrio super gris y aluminio negro',
      },
    ],
    gallery: [
      {
        src: '/images/catalog/ventanas/ventana-francesa/ventana-guillotina-469.webp',
        width: 469,
        height: 625,
        alt: 'Ventana de guillotina vertical de dos cuerpos con marco de aluminio negro, en obra',
        objectPosition: 'center 40%',
      },
      {
        src: '/images/catalog/ventanas/ventana-francesa/ventana-francesa-b-270.webp',
        width: 270,
        height: 369,
        alt: 'Ventana corrediza de dos hojas con marco de aluminio blanco y vidrio, con repisa exterior',
      },
    ],
    pending: ['description'],
  },
  'ventana-bilbao': {
    chip: 'Bilbao',
    description: 'Ventana Bilbao de aluminio, fabricada a tu medida.',
    images: [
      {
        src: '/images/catalog/ventanas/ventana-bilbao/ventana-bilbao-800.webp',
        width: 800,
        height: 1067,
        alt: 'Ventana Bilbao de dos hojas corredizas con vidrio bronce y aluminio negro',
      },
    ],
    gallery: [
      {
        src: '/images/catalog/ventanas/ventana-bilbao/ventana-bilbao-b-390.webp',
        width: 390,
        height: 292,
        alt: 'Ventana de cuatro hojas corredizas con marco de aluminio negro sobre un fregadero de cocina',
      },
      {
        src: '/images/catalog/ventanas/ventana-bilbao/ventana-bilbao-c-463.webp',
        width: 463,
        height: 347,
        alt: 'Ventana de cuatro hojas corredizas con marco de aluminio blanco y vidrio reflectivo',
      },
    ],
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
  content: Readonly<Record<string, CatalogContent>> = {
    ...CATEGORY_CONTENT,
    ...ITEM_CONTENT,
  },
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
    for (const img of [...c.images, ...(c.gallery ?? [])]) {
      if (!img.src.startsWith('/'))
        issues.push({ slug, problem: `src no absoluto: ${img.src}` });
      if (img.alt.trim().length < 5)
        issues.push({ slug, problem: `alt vacío o muy corto: ${img.src}` });
      if (!(img.width > 0 && img.height > 0))
        issues.push({ slug, problem: `sin width/height: ${img.src}` });
      if (exists && !exists(img.src))
        issues.push({ slug, problem: `archivo inexistente: ${img.src}` });
    }
    if (!c.description && !c.blurb && !c.pending.includes('description')) {
      issues.push({ slug, problem: 'sin descripción y sin marcar pending:description' });
    }
  }
  const known = new Set(slugs);
  for (const slug of Object.keys(content)) {
    if (!known.has(slug))
      issues.push({
        slug,
        problem: 'contenido huérfano: el slug no existe en el modelo',
      });
  }
  return issues;
}

export function assertCatalogContent(
  slugs: readonly string[],
  exists?: (publicPath: string) => boolean,
): void {
  const issues = validateCatalogContent(slugs, undefined, exists);
  if (issues.length > 0) {
    throw new Error(
      `catalogContent inválido:\n${issues.map((i) => `- ${i.slug}: ${i.problem}`).join('\n')}`,
    );
  }
}
