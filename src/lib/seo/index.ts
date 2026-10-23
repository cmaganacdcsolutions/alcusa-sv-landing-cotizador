// SEO compartido: URL del sitio, URLs canonicas, paginas indexables (sitemap) y JSON-LD del negocio.
// Solo datos que ya existen en el repo (footer, contacto, nosotros); nada inventado.

export const DEFAULT_SITE_URL = 'https://alcusasv.com';
export const SITE_NAME = 'Alcusa';
export const OG_IMAGE_PATH = '/images/og-alcusa-1200x630.jpg';

/** Paginas publicas indexables, en el orden del sitemap. Las redirecciones (/catalogo/**) y el admin no van. */
export const INDEXABLE_PATHS = ['/', '/cotizador', '/nosotros', '/contacto'] as const;

export function siteUrl(): string {
  return import.meta.env.PUBLIC_SITE_URL || DEFAULT_SITE_URL;
}

/** Ruta canonica: raiz "/", el resto con "/" final (asi la sirve Apache para carpetas: /nosotros -> /nosotros/). */
export function canonicalPath(pathname: string): string {
  const clean = pathname.replace(/\/+$/, '');
  return clean === '' ? '/' : `${clean}/`;
}

export function absoluteUrl(path: string, base: string = siteUrl()): string {
  return new URL(path, base).href;
}

export function buildBusinessJsonLd(base: string = siteUrl()): Record<string, unknown> {
  const home = absoluteUrl('/', base);
  const businessId = `${home}#negocio`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${home}#sitio`,
        name: SITE_NAME,
        url: home,
        inLanguage: 'es-SV',
        publisher: { '@id': businessId },
      },
      {
        '@type': ['HomeAndConstructionBusiness', 'Organization'],
        '@id': businessId,
        name: SITE_NAME,
        legalName: 'Aluminios Cuzcatlán, S.A. de C.V.',
        slogan: 'Disfrutar con calidad',
        description:
          'Puertas de baño, puertas de jardín, ventanas, espejos, zarandas y fachadas comerciales de aluminio y vidrio a la medida en El Salvador.',
        url: home,
        logo: absoluteUrl('/images/logo-primary.png', base),
        image: absoluteUrl(OG_IMAGE_PATH, base),
        telephone: ['+50376802410', '+50322782460', '+50325637742', '+50322084101'],
        email: 'administracion@alcusa.com.sv',
        address: {
          '@type': 'PostalAddress',
          streetAddress: 'Calle El Pedregal, local 29 G',
          addressLocality: 'Ciudad Merliot',
          addressCountry: 'SV',
        },
        areaServed: { '@type': 'Country', name: 'El Salvador' },
        sameAs: [
          'https://instagram.com/alcusasv',
          'https://tiktok.com/@alcusaes',
          'https://youtube.com/@alcusaelsalvador8209',
        ],
      },
    ],
  };
}

/** Serializa JSON-LD para incrustarlo en <script type="application/ld+json"> sin poder cerrar la etiqueta. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\u003c');
}
