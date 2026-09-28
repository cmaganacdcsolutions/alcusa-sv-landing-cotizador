// 6 product categories shown in Step 0 of the cotizador (and, later, the
// landing catálogo section — S3/S4). "recta" (S1), "l"/"templado"/"bisagra"
// (S5) are enabled/priceable; "jardin"/"ventana" still render as disabled
// "Próximamente" cards until S6 wires their pricing modules.
export type ProductId = 'recta' | 'l' | 'templado' | 'bisagra' | 'jardin' | 'ventana';

export interface CatalogProduct {
  id: ProductId;
  name: string;
  fromPrice: number;
  altoText: string;
  enabled: boolean;
}

export const CATALOG_PRODUCTS: readonly CatalogProduct[] = [
  { id: 'recta', name: 'Puerta de baño recta', fromPrice: 222, altoText: 'Alto estándar 1.85 m', enabled: true },
  { id: 'l', name: 'Cabina en L', fromPrice: 444, altoText: 'Medida fija 0.80 × 0.80 × 1.85 m', enabled: true },
  { id: 'templado', name: 'Templado 10 mm', fromPrice: 672, altoText: 'Alto fijo 2.00 m', enabled: true },
  { id: 'bisagra', name: 'Puerta con bisagra', fromPrice: 253, altoText: 'Alto fijo 1.85 m', enabled: true },
  { id: 'jardin', name: 'Puerta de jardín', fromPrice: 410, altoText: 'Alto 2.10 o 2.40 m', enabled: false },
  { id: 'ventana', name: 'Ventana Francesa o Bilbao', fromPrice: 108, altoText: 'Alto a tu medida', enabled: false },
];
