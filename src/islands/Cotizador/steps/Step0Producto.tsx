import { useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import {
  CATEGORIES,
  formatFromPrice,
  hasVariants,
  subFromPrice,
  type Category,
  type ProductId,
  type QuoterPreset,
  type Subcategory,
  type Variant,
} from '@content/catalog';
import { buildWaLink } from '@integrations/whatsapp/waLink';
import PhotoFrame from '@components/PhotoFrame';
import { IconArrowRight, IconCheck, IconLock, IconWhatsApp } from '../icons';
import { categoryImage, typeImage, variantImage } from './productImages';
import QuoteLoadBlock, { type QuoteLoadBlockProps } from './quote/QuoteLoadBlock';
import { IconQuoteImage, IconQuoteTriangle } from './quote/QuoteIcons';
import '@styles/cotizador-medidas.css';
import '@styles/cotizador-selector.css';

export interface Step0ProductoProps {
  /** Desktop resumen <aside> (owned by Cotizador); the selector portals its live summary here. */
  asideTarget: HTMLElement | null;
  selectedId: ProductId | null;
  /** Engine inputs already in the store (used to restore a preselected leaf). */
  current: QuoterPreset;
  onSelect: (productId: ProductId, preset: QuoterPreset) => void;
  quoteLoad: Pick<QuoteLoadBlockProps, 'hasItems' | 'autoFolio' | 'onLoad'>;
}

// Display copy that belongs to the approved selector boards (r03), keyed by
// catalog slug so the structure stays data-driven (R1 model) and only the
// board wording lives here. Prices always come from the catalog.
const CATEGORY_SUPPORT: Readonly<Record<string, string>> = {
  'puertas-de-bano': '4 tipos',
  'puertas-de-jardin': '1, 2, 3 hojas y más',
  ventanas: 'Francesa y Bilbao',
};
const TYPE_LABEL: Readonly<Record<string, string>> = {
  'templada-10mm': 'Templada 10 mm',
  bisagra: 'De bisagra',
  'jardin-1-hoja': '1 hoja',
  'jardin-2-hojas': '2 hojas',
  'jardin-3-hojas': '3 hojas',
  'jardin-2-fijas-2-corredizas': 'Más opciones',
  'templada-10mm-abatible': 'Más opciones',
  'ventana-bilbao-medio-punto': 'Más opciones',
  'abatible-interior-exterior': 'Más opciones',
  'abatible-oficina-vidrio-fijo': 'Más opciones',
  'abatible-oficina-cerrador': 'Más opciones',
};
const TYPE_KICKER: Readonly<Record<string, string>> = {
  'puertas-de-bano': '2 · TIPO DE PUERTA',
  'puertas-de-jardin': '2 · TIPO DE PUERTA',
  ventanas: '2 · TIPO DE VENTANA',
};
const TYPE_GROUP_LABEL: Readonly<Record<string, string>> = {
  'puertas-de-bano': 'Tipo de puerta de baño',
  'puertas-de-jardin': 'Hojas de la puerta de jardín',
  ventanas: 'Tipo de ventana',
};
// Desktop aside headline per type (board r03: "Puerta de baño en L · desde $444").
const SUMMARY_NAME: Readonly<Record<string, string>> = {
  'templada-10mm': 'Puerta de baño templada 10 mm',
  recta: 'Puerta de baño recta',
  'en-l': 'Puerta de baño en L',
  bisagra: 'Puerta de baño de bisagra',
  'jardin-1-hoja': 'Puerta de jardín 1 hoja',
  'jardin-2-hojas': 'Puerta de jardín 2 hojas',
  'jardin-3-hojas': 'Puerta de jardín 3 hojas',
  'jardin-2-fijas-2-corredizas': 'Puerta de jardín · más opciones',
  'ventana-francesa': 'Ventana francesa',
  'ventana-bilbao': 'Ventana bilbao',
  'templada-10mm-abatible': 'Puerta de baño abatible templada 10 mm · más opciones',
  'ventana-bilbao-medio-punto': 'Ventana · más opciones',
  'abatible-interior-exterior': 'Puerta de jardín abatible · más opciones',
  'abatible-oficina-vidrio-fijo': 'Puerta de jardín abatible · más opciones',
  'abatible-oficina-cerrador': 'Puerta de jardín abatible · más opciones',
};
// Copy del panel de asesor por categoria (las hojas solo asesor nunca entran al cotizador en linea).
const ADVISOR_COPY: Readonly<Record<string, { message: string; text: string }>> = {
  'puertas-de-jardin': {
    message: 'Hola, quiero cotizar una puerta de jardín con más opciones (cuatro hojas o abatible).',
    text: 'Las puertas de jardín de cuatro hojas (2 fijas + 2 corredizas, o 1 fija + 3 corredizas) y las abatibles de doble manija, con vidrio fijo o con cerrador automático se diseñan a tu medida y no entran al cotizador en línea. Escríbenos por WhatsApp y te respondemos con tu precio.',
  },
  'puertas-de-bano': {
    message: 'Hola, quiero cotizar una puerta de baño abatible de vidrio templado de 10 mm.',
    text: 'La puerta abatible de vidrio templado de 10 mm se diseña a tu medida y no entra al cotizador en línea. Escríbenos por WhatsApp y te respondemos con tu precio.',
  },
  ventanas: {
    message: 'Hola, quiero cotizar una ventana Bilbao con medio punto.',
    text: 'La ventana Bilbao con medio punto se diseña a tu medida y no entra al cotizador en línea. Escríbenos por WhatsApp y te respondemos con tu precio.',
  },
};
const ADVISOR_FALLBACK = ADVISOR_COPY['puertas-de-jardin'] as { message: string; text: string };

type Leaf = { model: ProductId; preset: QuoterPreset };

function leafOf(node: Subcategory | Variant): Leaf | null {
  return node.advisorOnly || !node.quoterModel ? null : { model: node.quoterModel, preset: node.preset ?? {} };
}

function matches(node: Subcategory | Variant, id: ProductId, cur: QuoterPreset): boolean {
  const l = leafOf(node);
  if (!l || l.model !== id) return false;
  const p = l.preset;
  return (
    (p.cornerFinish === undefined || p.cornerFinish === cur.cornerFinish) &&
    (p.gardenHojas === undefined || p.gardenHojas === cur.gardenHojas) &&
    (p.windowType === undefined || p.windowType === cur.windowType)
  );
}

/** Restores (category, type, finish) from the store's product + presets. */
function restore(id: ProductId | null, cur: QuoterPreset): { cat: string | null; sub: string | null; variant: string | null } {
  if (!id) return { cat: null, sub: null, variant: null };
  for (const c of CATEGORIES) {
    for (const s of c.subcategories) {
      if (hasVariants(s)) {
        const v = s.variants.find((x) => matches(x, id, cur));
        if (v) return { cat: c.slug, sub: s.slug, variant: v.slug };
      } else if (matches(s, id, cur)) return { cat: c.slug, sub: s.slug, variant: null };
    }
  }
  return { cat: null, sub: null, variant: null };
}

function Check(): ReactElement {
  return (
    <span className="sel-tile__check">
      <IconCheck size={12} strokeWidth={2.5} />
    </span>
  );
}

// Step 0 — 3-level selector (R5, boards r03): Categoría > Tipo > Acabado.
// Everything renders from CATEGORIES (R1 catalog model).
export default function Step0Producto({ asideTarget, selectedId, current, onSelect, quoteLoad }: Step0ProductoProps): ReactElement {
  const init = restore(selectedId, current);
  const [catSlug, setCat] = useState<string | null>(init.cat);
  const [subSlug, setSub] = useState<string | null>(init.sub);
  const [varSlug, setVar] = useState<string | null>(init.variant);
  // A deep link (?producto=) preselects AFTER mount: re-restore when the store's
  // product/presets change (adjust-state-during-render, no effect).
  const storeKey = `${selectedId}|${current.cornerFinish}|${current.gardenHojas}|${current.windowType}`;
  const [seenKey, setSeenKey] = useState(storeKey);
  if (seenKey !== storeKey) {
    setSeenKey(storeKey);
    setCat(init.cat);
    setSub(init.sub);
    setVar(init.variant);
  }

  const category: Category | undefined = CATEGORIES.find((c) => c.slug === catSlug);
  const sub = category?.subcategories.find((s) => s.slug === subSlug);
  const variants = sub && hasVariants(sub) ? sub.variants : null;
  const variant = variants?.find((v) => v.slug === varSlug);
  const advisor = !!sub && !hasVariants(sub) && !!sub.advisorOnly;
  const leaf = variants ? (variant ? leafOf(variant) : null) : sub ? leafOf(sub) : null;
  // "Más opciones": the advisorOnly jardín leaves collapse into ONE tile (board).
  const types = category
    ? category.subcategories.filter((s, i, all) => !(s.advisorOnly && all.findIndex((x) => x.advisorOnly) !== i))
    : [];
  const moreTile = category?.subcategories.find((s) => s.advisorOnly);
  const typeSelected = (s: Subcategory): boolean => s.slug === subSlug || (!!s.advisorOnly && !!sub?.advisorOnly);

  const advisorCopy = (category && ADVISOR_COPY[category.slug]) || ADVISOR_FALLBACK;
  const summaryName = sub ? (SUMMARY_NAME[sub.slug] ?? sub.name) : null;
  const summaryPrice = variant?.fromPrice ?? (sub ? subFromPrice(sub) : null);
  const asideLabel = !summaryName
    ? 'Aún no eliges un producto'
    : advisor || summaryPrice === null
      ? summaryName
      : `${summaryName} · desde`;
  const asideTotal = advisor ? 'Con asesor' : summaryName && summaryPrice !== null ? formatFromPrice(summaryPrice) : '—';
  const asideNote = advisor
    ? 'Este producto no continúa en el cotizador en línea.'
    : 'El precio final depende de tus medidas.';
  const asideWa = buildWaLink(summaryName ? `Hola ALCUSA, quiero cotizar: ${summaryName}.` : undefined);

  return (
    <section aria-labelledby="step0-heading" className="sel">
      <h3 id="step0-heading" tabIndex={-1} className="sel__h2">
        Elige tu producto
      </h3>
      <QuoteLoadBlock {...quoteLoad} />

      <div className="sel__level">
        <p className="sel__kicker">1 · CATEGORÍA</p>
        <div className="sel__grid sel__grid--cat" role="group" aria-label="Categoría">
          {CATEGORIES.map((c) => (
            <button
              key={c.slug}
              type="button"
              className={`sel-tile sel-tile--cat${c.slug === catSlug ? ' on' : ''}`}
              aria-pressed={c.slug === catSlug}
              onClick={() => {
                if (c.slug === catSlug) return;
                setCat(c.slug);
                setSub(null);
                setVar(null);
              }}
            >
              <PhotoFrame className="sel-tile__photo" src={categoryImage(c.slug)} alt="" ratio="1/1" />
              <span className="sel-tile__tx">
                <span className="sel-tile__n sel-tile__n--lg">{c.name}</span>
                <span className="sel-tile__m">{CATEGORY_SUPPORT[c.slug]}</span>
              </span>
              {c.slug === catSlug && <Check />}
            </button>
          ))}
        </div>
      </div>

      {category && (
        <div className="sel__level sel__level--in">
          <p className="sel__kicker">{TYPE_KICKER[category.slug]}</p>
          <div className="sel__grid sel__grid--type" role="group" aria-label={TYPE_GROUP_LABEL[category.slug]}>
            {types.map((s) => {
              const price = subFromPrice(s);
              const on = typeSelected(s);
              const target = s.advisorOnly && moreTile ? moreTile : s;
              return (
                <button
                  key={s.slug}
                  type="button"
                  className={`sel-tile${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onClick={() => {
                    setSub(target.slug);
                    setVar(null);
                  }}
                >
                  {typeImage(s.slug) ? (
                    <PhotoFrame className="sel-tile__photo" src={typeImage(s.slug) as string} alt={TYPE_LABEL[s.slug] ?? s.name} ratio="1/1" />
                  ) : (
                    <span className="sel-tile__photo sel-wa" data-testid="type-thumb-wa" aria-hidden="true">
                      <IconWhatsApp size={28} />
                    </span>
                  )}
                  <span className="sel-tile__tx">
                    <span className="sel-tile__n">{TYPE_LABEL[s.slug] ?? s.name}</span>
                    <span className="sel-tile__s">{s.advisorOnly || price === null ? 'Con un asesor' : `Desde ${formatFromPrice(price)}`}</span>
                  </span>
                  {on && <Check />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {variants && sub && (
        <div className="sel__level sel__level--in">
          <p className="sel__kicker">3 · ACABADO</p>
          <div className="sel__grid sel__grid--fin" role="group" aria-label="Acabado de la puerta en L">
            {variants.map((v) => (
              <button
                key={v.slug}
                type="button"
                className={`sel-tile sel-tile--fin${v.slug === varSlug ? ' on' : ''}`}
                aria-pressed={v.slug === varSlug}
                onClick={() => setVar(v.slug)}
              >
                {/* Foto pendiente (board: placeholder punteado). Cuando exista `photo` en el catalogo se usa PhotoFrame. */}
                {(v.photo ?? variantImage(v.slug)) ? (
                  <PhotoFrame className="sel-tile__photo" src={(v.photo ?? variantImage(v.slug)) as string} alt={v.name} ratio="1/1" />
                ) : (
                  <span className="sel-ph"><IconQuoteImage /></span>
                )}
                <span className="sel-tile__tx">
                  <span className="sel-tile__n sel-tile__n--lg">{v.name.replace(/ en L$/, '')}</span>
                </span>
                {v.slug === varSlug && <Check />}
              </button>
            ))}
          </div>
          {!variant && <p className="sel__help">Elige un acabado para continuar.</p>}
        </div>
      )}

      {advisor && (
        <section className="sel-advisor" role="status" aria-labelledby="sel-adv">
          <span className="qi qi--lg"><IconQuoteTriangle size={22} /></span>
          <h3 id="sel-adv" className="sel-advisor__title">Esta puerta la cotiza un asesor</h3>
          <p className="sel-advisor__text">
            {advisorCopy.text}
          </p>
          <p className="sel-advisor__msg"><strong>Mensaje prellenado:</strong> “{advisorCopy.message}”</p>
          <a className="bt bw" href={buildWaLink(advisorCopy.message)} target="_blank" rel="noopener noreferrer">
            <IconWhatsApp size={20} />
            Cotizar con un asesor por WhatsApp
          </a>
          <button type="button" className="sel-advisor__other" onClick={() => setSub(null)}>
            Elegir otra opción
          </button>
        </section>
      )}

      {asideTarget &&
        createPortal(
          <>
            <div className="cotizador-aside__hero">
              <div className="cotizador-aside__hero-top">
                <span className="cotizador-aside__kicker">TU COTIZACIÓN</span>
              </div>
              <span className="cotizador-aside__total-label">{asideLabel}</span>
              <span
                className={`cotizador-aside__total-value${advisor ? ' cotizador-aside__total-value--sm' : ''}`}
                aria-live="polite"
                data-testid="summary-price-value"
              >
                {asideTotal}
              </span>
              <span className="cotizador-aside__note">{asideNote}</span>
            </div>
            <div className="cotizador-aside__ctas">
              {leaf ? (
                <button type="button" className="bt bp" onClick={() => onSelect(leaf.model, leaf.preset)}>
                  Siguiente
                  <IconArrowRight size={20} />
                </button>
              ) : (
                <button type="button" className="bt bd" disabled>
                  Siguiente
                </button>
              )}
              <a className="bt bw" href={asideWa} target="_blank" rel="noopener noreferrer">
                <IconWhatsApp size={20} />
                Cotizar por WhatsApp
              </a>
            </div>
            <p className="cotizador-aside__wompi-note">
              <IconLock size={16} />
              Pago con tarjeta vía Wompi · excepto American Express
            </p>
          </>,
          asideTarget,
        )}

      <div className="sel-bar">
        {leaf ? (
          <button type="button" className="bt bp" onClick={() => onSelect(leaf.model, leaf.preset)}>
            Siguiente
            <IconArrowRight size={20} />
          </button>
        ) : (
          <button type="button" className="bt bd" disabled>
            Siguiente
          </button>
        )}
        {advisor && <span className="sel-bar__note">Este producto no continúa en el cotizador en línea.</span>}
      </div>
    </section>
  );
}
