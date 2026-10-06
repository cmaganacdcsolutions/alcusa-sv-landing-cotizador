// Public promotions.json contract. Mirrors the site loader (src/content/promotions.ts parsePromotions)
// rule for rule, so a file this module writes can never break the site build. Parity is guarded by
// test/admin/promo-schema.test.ts. Messages are Spanish because they surface in the admin form.

export interface PromoRecord {
  id: string;
  placeholder: boolean;
  title: string;
  description: string;
  image: string;
  image_alt: string;
  price_before: number | null;
  price_promo: number;
  product_slug: string;
  cotizador_params?: { vidrio: string };
  starts_on: string;
  ends_on: string;
  rules: string[];
}

/** Slugs of src/content/catalog.ts (closed list; parity-tested against the file). */
export const PRODUCT_SLUGS = [
  'puertas-de-bano', 'templada-10mm', 'recta', 'en-l', 'l-aquaclara', 'l-frosted', 'l-aquafold', 'bisagra',
  'puertas-de-jardin', 'jardin-1-hoja', 'jardin-2-hojas', 'jardin-3-hojas', 'jardin-2-fijas-2-corredizas',
  'jardin-1-fijo-3-corredizas', 'ventanas', 'ventana-francesa', 'ventana-bilbao',
] as const;

/** Same set as DEEP_LINK_GLASSES in src/content/deepLink.ts. */
export const GLASSES = ['claro', 'nevado', 'decorado', 'mallado', 'duplex', 'aquafold'] as const;

export const MAX_RULES = 6;
export const MAX_RULE_LEN = 160;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isPrice = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
export const isRealDate = (s: string): boolean =>
  YMD.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

const defaultSlugExists = (s: string): boolean => (PRODUCT_SLUGS as readonly string[]).includes(s);

/** Returns every problem found (empty = valid). Same checks as the site loader. */
export function validatePromotions(input: unknown, slugExists: (s: string) => boolean = defaultSlugExists): string[] {
  const errors: string[] = [];
  const list = isRec(input) ? input['promotions'] : undefined;
  if (!Array.isArray(list)) return ['falta el arreglo "promotions"'];
  const seen = new Set<string>();
  list.forEach((item: unknown, i: number) => {
    const label = isRec(item) && isStr(item['id']) ? ` (${item['id']})` : '';
    const at = (m: string): void => void errors.push(`promotions[${i}]${label}: ${m}`);
    if (!isRec(item)) return at('no es un objeto');
    for (const k of ['id', 'title', 'description', 'image', 'image_alt', 'product_slug'] as const) {
      if (!isStr(item[k])) at(`"${k}" es obligatorio (texto)`);
    }
    if (isStr(item['id'])) {
      if (seen.has(item['id'])) at('id duplicado');
      seen.add(item['id']);
    }
    if (!isPrice(item['price_promo'])) at('"price_promo" debe ser un numero > 0');
    const before = item['price_before'] ?? null;
    if (before !== null && !isPrice(before)) at('"price_before" debe ser un numero > 0 o null');
    if (isPrice(before) && isPrice(item['price_promo']) && item['price_promo'] >= before) {
      at('"price_promo" debe ser menor que "price_before"');
    }
    for (const k of ['starts_on', 'ends_on'] as const) {
      const v = item[k];
      if (typeof v !== 'string' || !isRealDate(v)) at(`"${k}" debe ser una fecha YYYY-MM-DD valida`);
    }
    if (typeof item['starts_on'] === 'string' && typeof item['ends_on'] === 'string' && item['starts_on'] > item['ends_on']) {
      at('"starts_on" no puede ser posterior a "ends_on"');
    }
    if (isStr(item['product_slug']) && !slugExists(item['product_slug'])) {
      at(`"product_slug" "${item['product_slug']}" no existe en el catalogo`);
    }
    const cp = item['cotizador_params'];
    if (cp !== undefined) {
      if (!isRec(cp)) at('"cotizador_params" debe ser un objeto');
      else if (cp['vidrio'] !== undefined && (typeof cp['vidrio'] !== 'string' || !(GLASSES as readonly string[]).includes(cp['vidrio']))) {
        at('"cotizador_params.vidrio" no es un vidrio conocido');
      }
    }
    const rules = item['rules'] ?? [];
    if (!Array.isArray(rules) || !rules.every((r) => typeof r === 'string')) at('"rules" debe ser un arreglo de textos');
  });
  return errors;
}

/** Admin-only limits on top of the loader contract (plain text, bounded). */
export function validateAdminLimits(p: PromoRecord): string[] {
  const e: string[] = [];
  if (p.title.length < 3 || p.title.length > 80) e.push('El título debe tener entre 3 y 80 caracteres.');
  if (p.description.length > 300) e.push('La descripción admite hasta 300 caracteres.');
  if (p.image_alt.length > 300) e.push('El texto alternativo admite hasta 300 caracteres.');
  if (p.rules.length > MAX_RULES) e.push(`Máximo ${MAX_RULES} reglas.`);
  if (p.rules.some((r) => r.length > MAX_RULE_LEN)) e.push(`Cada regla admite hasta ${MAX_RULE_LEN} caracteres.`);
  if (/[<>]/.test([p.title, p.description, p.image_alt, ...p.rules].join(''))) e.push('No se permite HTML (< o >) en los textos.');
  return e;
}

/** Validation of one record: loader rules + admin limits. */
export function validatePromo(p: PromoRecord): string[] {
  return [...validatePromotions({ promotions: [p] }), ...validateAdminLimits(p)];
}
