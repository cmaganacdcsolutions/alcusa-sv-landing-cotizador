// Home catalog configurator data (spec home-catalogo-completo §5-§6). Pure; no DOM.
// Options mirror steps/measures/finishOptions.ts (what the cotizador accepts).
// The href built here is the deep-link contract: the no-JS <form method="get">
// and the progressive-enhancement script both use buildCotizadorHref's shape.

export type OptionGroupName = 'acabado' | 'color' | 'vidrio';

export interface ChoiceOption {
  value: string;
  label: string;
  /** "Cotización personalizada" (text badge, never color only). */
  custom?: boolean;
}

export interface OptionGroup {
  name: OptionGroupName;
  legend: string;
  options: readonly ChoiceOption[];
  defaultValue: string;
}

export interface ProductConfig {
  /** Slug of the card (catalog.ts leaf or `en-l` subcategory). */
  cardSlug: string;
  /** Leaf slug sent as `producto` (en-l: the default finish variant). */
  productSlug: string;
  groups: readonly OptionGroup[];
}

export const COTIZADOR_PATH = '/cotizador';
export const STEP_PARAM = 'paso';
export const STEP_MEDIDAS = 'medidas';
export const COLOR_PARAM = 'color';
export const GLASS_PARAM_NAME = 'vidrio';

const colors = (order: readonly string[], custom: readonly string[] = []): readonly ChoiceOption[] =>
  order.map((value) => ({
    value,
    label: { natural: 'Natural', blanco: 'Blanco', bronce: 'Bronce', negro: 'Negro' }[value] ?? value,
    custom: custom.includes(value) || undefined,
  }));

const GLASS_LABELS: Record<string, string> = {
  claro: 'Claro 5 mm',
  nevado: 'Nevado 5 mm',
  decorado: 'Decorado',
  aquafold: 'Aquafold',
  mallado: 'Mallado',
  duplex: 'Dúplex',
  bronce: 'Bronce 5 mm',
  super_gris: 'Súper gris',
  reflectivo_azul: 'Reflectivo azul',
  reflectivo_bronce: 'Reflectivo bronce',
};
const glasses = (order: readonly string[], custom: readonly string[] = []): readonly ChoiceOption[] =>
  order.map((value) => ({
    value,
    label: value === 'claro' && order.includes('super_gris') ? 'Claro' : (GLASS_LABELS[value] ?? value),
    custom: custom.includes(value) || undefined,
  }));

const windowGroups = (frames: readonly string[] = ['blanco', 'bronce', 'natural']): OptionGroup[] => [
  { name: 'color', legend: 'Marco', options: colors(frames, ['natural']), defaultValue: 'blanco' },
  {
    name: 'vidrio',
    legend: 'Vidrio',
    options: glasses(['claro', 'bronce', 'super_gris', 'reflectivo_azul', 'reflectivo_bronce'], ['reflectivo_bronce']),
    defaultValue: 'claro',
  },
];
const gardenGroups = (): OptionGroup[] => [
  { name: 'color', legend: 'Color', options: colors(['blanco', 'bronce', 'natural', 'negro'], ['bronce', 'natural', 'negro']), defaultValue: 'blanco' },
  { name: 'vidrio', legend: 'Vidrio', options: glasses(['claro', 'nevado', 'decorado', 'mallado', 'duplex']), defaultValue: 'claro' },
];

export const PRODUCT_CONFIGS: Readonly<Record<string, ProductConfig>> = {
  'ventana-francesa': { cardSlug: 'ventana-francesa', productSlug: 'ventana-francesa', groups: windowGroups(['blanco', 'bronce', 'natural', 'negro']) },
  'ventana-bilbao': { cardSlug: 'ventana-bilbao', productSlug: 'ventana-bilbao', groups: windowGroups() },
  'jardin-1-hoja': { cardSlug: 'jardin-1-hoja', productSlug: 'jardin-1-hoja', groups: gardenGroups() },
  'jardin-2-hojas': { cardSlug: 'jardin-2-hojas', productSlug: 'jardin-2-hojas', groups: gardenGroups() },
  'jardin-3-hojas': { cardSlug: 'jardin-3-hojas', productSlug: 'jardin-3-hojas', groups: gardenGroups() },
  'templada-10mm': { cardSlug: 'templada-10mm', productSlug: 'templada-10mm', groups: [] },
  recta: {
    cardSlug: 'recta',
    productSlug: 'recta',
    groups: [
      { name: 'color', legend: 'Color', options: colors(['natural', 'blanco', 'bronce', 'negro'], ['negro']), defaultValue: 'natural' },
      {
        name: 'vidrio',
        legend: 'Vidrio',
        options: glasses(['claro', 'nevado', 'decorado', 'aquafold', 'mallado', 'duplex']),
        defaultValue: 'claro',
      },
    ],
  },
  'en-l': {
    cardSlug: 'en-l',
    productSlug: 'l-aquaclara',
    groups: [
      {
        name: 'acabado',
        legend: 'Acabado',
        options: [
          { value: 'l-aquaclara', label: 'Aquaclara' },
          { value: 'l-frosted', label: 'Frosted' },
          { value: 'l-aquafold', label: 'Aquafold' },
        ],
        defaultValue: 'l-aquaclara',
      },
      { name: 'color', legend: 'Color', options: colors(['natural', 'bronce']), defaultValue: 'natural' },
    ],
  },
  bisagra: {
    cardSlug: 'bisagra',
    productSlug: 'bisagra',
    groups: [
      { name: 'color', legend: 'Color', options: colors(['natural', 'blanco', 'bronce', 'negro'], ['negro']), defaultValue: 'natural' },
      { name: 'vidrio', legend: 'Vidrio', options: glasses(['nevado', 'claro', 'decorado', 'mallado', 'duplex']), defaultValue: 'claro' },
    ],
  },
};

export interface Choices {
  /** Finish variant slug (en-l only); replaces the product slug. */
  acabado?: string;
  color?: string;
  vidrio?: string;
}

/**
 * `/cotizador?producto=<slug>&paso=medidas[&color=<c>][&vidrio=<v>]` — same
 * shape the no-JS GET form produces (hidden fields first, then radios in DOM order).
 */
export function buildCotizadorHref(productSlug: string, choices: Choices = {}): string {
  const q = new URLSearchParams();
  q.set('producto', choices.acabado ?? productSlug);
  q.set(STEP_PARAM, STEP_MEDIDAS);
  if (choices.color) q.set(COLOR_PARAM, choices.color);
  if (choices.vidrio) q.set(GLASS_PARAM_NAME, choices.vidrio);
  return `${COTIZADOR_PATH}?${q.toString()}`;
}

export function defaultChoices(config: ProductConfig): Choices {
  const out: Choices = {};
  for (const g of config.groups) out[g.name] = g.defaultValue;
  return out;
}

/** Text of the live summary: "Tu selección: Aluminio Natural · Vidrio Claro 5 mm". */
export function summaryText(config: ProductConfig, choices: Choices): string {
  const parts: string[] = [];
  for (const g of config.groups) {
    const label = g.options.find((o) => o.value === choices[g.name])?.label;
    if (!label) continue;
    parts.push(g.name === 'vidrio' ? `Vidrio ${label}` : g.name === 'acabado' ? `Acabado ${label}` : `Aluminio ${label}`);
  }
  return parts.length ? `Tu selección: ${parts.join(' · ')}` : '';
}
