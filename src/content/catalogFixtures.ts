// TEST-ONLY fixtures for the r06 states that real data cannot show yet
// (board Estado B "sin precio" WITH a photo). Same shape as catalogContent.ts,
// never imported by pages. Reachable today without fixtures:
//   Estado B (sin precio, sin foto): /catalogo/puertas-de-jardin/jardin-1-fijo-3-corredizas
//   Estado C (sin foto, con precio): /catalogo/puertas-de-jardin/jardin-1-hoja
import { ITEM_CONTENT, type CatalogContent } from './catalogContent';

/** Advisor-only leaf that ALCUSA has already photographed (existing stock image). */
export const FIXTURE_ADVISOR_WITH_PHOTO: Readonly<Record<string, CatalogContent>> = {
  'jardin-2-fijas-2-corredizas': {
    ...ITEM_CONTENT['jardin-2-fijas-2-corredizas'],
    images: [{ src: '/images/catalog/puertas-de-jardin/jardin-3-hojas/jardin-3-hojas-800.webp', width: 800, height: 1422, alt: 'Puerta de jardín corrediza de tres hojas con aluminio negro' }],
    pending: [],
  },
};
