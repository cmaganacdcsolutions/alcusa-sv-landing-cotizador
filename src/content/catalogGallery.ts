// "Galería de proyectos" at the foot of /catalogo (Q11, board r04). Data only:
// add a line + drop the file in public/ to grow it. Photos are the real
// customer photos already in the repo (same set as the landing gallery).
import type { CatalogImage } from './catalogContent';

export const CATALOG_GALLERY: readonly CatalogImage[] = [
  { src: '/images/galeria-01.jpeg', width: 934, height: 1280, alt: 'Puerta de baño con vidrio decorado instalada' },
  { src: '/images/galeria-02.jpeg', width: 1600, height: 1200, alt: 'División de vidrio esmerilado' },
  { src: '/images/galeria-05.jpeg', width: 1600, height: 1200, alt: 'Fachada con puerta y ventanales de aluminio negro' },
];
