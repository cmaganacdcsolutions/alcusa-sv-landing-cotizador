import type { ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { CatalogProduct } from '@content/catalog';
import { buildWaLink } from '@integrations/whatsapp/waLink';
import { buildQuoteMessage } from '@integrations/whatsapp/buildMessage';
import { buildGardenMessageItem, buildWindowMessageItems } from '@integrations/whatsapp/windowGardenMessageItems';
import { COLOR_LABELS, GLASS_LABELS, type CotizadorState } from '../state/cotizadorStore';
import { buildLineItem, type QuoteResult } from '../state/quote';
import { computeGardenQuote, computeWindowQuote } from '../state/quoteWindowGarden';
import { GARDEN_HOJAS_LABELS } from './measures/GardenForm';
import { WINDOW_GLASS_LABELS, WINDOW_MODEL_LABELS } from './measures/WindowForm';
import { IconArrowRight, IconPlus, IconWarningTriangle, IconWhatsApp } from '../icons';
import { IconLocationPin, IconTrash } from '../icons-checkout';
import { PRODUCT_IMAGES } from './productImages';
import '@styles/cotizador-checkout.css';

export interface Step4ResumenProps {
  product: CatalogProduct;
  state: CotizadorState;
  quote: QuoteResult;
  zoneFee: number | undefined;
  total: number | null;
  onNext: () => void;
  // Renders as a real "Cambiar" link/button either way; a no-op if omitted.
  onEditZone?: () => void;
  // sf-cot-polish item 3 — desktop-05 draws "Enviar por WhatsApp para
  // confirmar"/"Pagar ahora" ONLY in the "TU COTIZACIÓN" aside (never in the
  // main content column); ios-05/android-05 draw them ONLY in the main
  // content bottom area (the aside is hidden below 1024px). Rather than
  // duplicate the per-product WhatsApp-message logic in Cotizador.tsx, this
  // component keeps owning it and `createPortal`s a second, identically
  // wired copy into the aside's mount node when given one. CSS hides
  // whichever copy doesn't match the current breakpoint.
  asideCtaTarget?: HTMLElement | null;
}

// Step 4 — single-item summary card (T1.3 scope; generalized to
// corner/tempered/hinged in S5). "+ Agregar otro producto"/"Editar"/"Quitar"
// are visible but disabled/stub this slice — the multi-item cart (add/edit/
// remove) is S7 tech-debt (see docs/architecture/tech-debt.md). The primary
// WhatsApp handoff lives here too, matching desktop-05/ios-05/android-05.
export default function Step4Resumen({
  product,
  state,
  quote,
  zoneFee,
  total,
  onNext,
  onEditZone,
  asideCtaTarget,
}: Step4ResumenProps): ReactElement {
  // S6 — ventana/jardin: multi-row (ventana) / single-line (jardin) summary
  // + WhatsApp handoff. Per T6.3, WhatsApp is ALWAYS available even when a
  // line requiresQuote (its subtotal is annotated, not blocking); "Pagar
  // ahora" below only sums what IS priced — a full multi-item cart with
  // per-item removal lands in S7 (see HANDOFF).
  if (product.id === 'ventana' || product.id === 'jardin') {
    const entregaLabel: 'con instalación' | 'retiro en tienda' =
      state.entrega === 'instalacion' ? 'con instalación' : 'retiro en tienda';
    const zona = state.entrega === 'instalacion' ? state.zone : '—';
    const transporte = zoneFee ?? 0;

    const isWindow = product.id === 'ventana';
    const windowQuote = isWindow ? computeWindowQuote(state) : null;
    const gardenQuote = !isWindow ? computeGardenQuote(state) : null;
    const subtotal = (isWindow ? windowQuote?.subtotal : gardenQuote?.subtotal) ?? 0;
    const anyRequiresQuote = isWindow ? (windowQuote?.rows.some((r) => r.requiresQuote) ?? false) : (gardenQuote?.requiresQuote ?? false);
    const grandTotal = total ?? subtotal;
    const anticipo = Math.round(grandTotal * 80) / 100;
    const saldo = grandTotal - anticipo;

    const items = isWindow
      ? buildWindowMessageItems(windowQuote!.rows, {
          modelLabel: WINDOW_MODEL_LABELS[state.windowModel],
          frameLabel: COLOR_LABELS[state.windowFrame],
          glassLabel: WINDOW_GLASS_LABELS[state.windowGlass],
          zona,
          entrega: entregaLabel,
        })
      : [
          buildGardenMessageItem({
            hojasLabel: GARDEN_HOJAS_LABELS[state.gardenHojas],
            widthM: gardenQuote!.widthM,
            heightM: gardenQuote!.heightM,
            colorLabel: COLOR_LABELS[state.gardenColor],
            glassLabel: GLASS_LABELS[state.gardenGlass],
            subtotal: gardenQuote!.subtotal,
            requiresQuote: gardenQuote!.requiresQuote,
            zona,
            entrega: entregaLabel,
          }),
        ];

    const waHref = buildWaLink(buildQuoteMessage({ items, transporte, total: grandTotal, anticipo, saldo }));

    const countText = `${items.length} ${items.length === 1 ? 'producto' : 'productos'}`;

    const ctas = (
      <>
        <a href={waHref} className="btn btn-whatsapp" style={{ width: '100%' }}>
          <IconWhatsApp />
          Enviar por WhatsApp para confirmar
        </a>
        <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={onNext}>
          Pagar ahora
          <IconArrowRight />
        </button>
      </>
    );

    return (
      <section aria-labelledby="cotizador-page-title">
        <div className="summary-card">
          <div className="summary-card__header">
            <span className="summary-card__count">Tus productos · {countText}</span>
            {entregaLabel === 'con instalación' && (
              <p className="summary-card__zone">
                <IconLocationPin />
                Zona: {state.zone} · con instalación
                <button type="button" className="summary-card__zone-change" onClick={onEditZone}>
                  Cambiar
                </button>
              </p>
            )}
          </div>
          {items.map((item, index) => (
            <article className="summary-item" key={index}>
              <img
                src={PRODUCT_IMAGES[product.id]}
                alt=""
                width={56}
                height={56}
                className="summary-item__thumb"
                style={{ objectFit: 'cover' }}
              />
              <div className="summary-item__meta">
                <span className="summary-item__name">{item.producto}</span>
                <span className="summary-item__detail">
                  {item.anchoM.toFixed(2)} × {item.altoM.toFixed(2)} m · {item.color} · {item.vidrio}
                </span>
                <span className="summary-item__detail">
                  {entregaLabel === 'con instalación' ? `Con instalación · ${state.zone}` : 'Retiro en tienda'}
                </span>
                <div className="summary-item__footer">
                  <span className="summary-item__price">${item.subtotal.toFixed(2)}</span>
                  <button
                    type="button"
                    className="summary-item__remove"
                    disabled
                    aria-disabled="true"
                    aria-label={`Quitar ${item.producto}`}
                  >
                    <IconTrash />
                    Quitar
                  </button>
                </div>
              </div>
            </article>
          ))}

          <button type="button" className="summary-add" disabled aria-disabled="true">
            <IconPlus />
            Agregar otro producto
          </button>

          {anyRequiresQuote && (
            <div className="callout" role="status" style={{ marginTop: 8 }}>
              <span className="callout__title">
                <IconWarningTriangle />
                Cotización personalizada por WhatsApp
              </span>
              <p className="callout__body">
                Al menos un acabado elegido requiere cotización manual. Puedes enviarlo por WhatsApp junto con el
                resto, o confirmar solo lo que ya tiene precio.
              </p>
            </div>
          )}

          <dl className="breakdown" style={{ marginTop: 8 }}>
            <div className="breakdown__row">
              <dt>Subtotal productos</dt>
              <dd>${subtotal.toFixed(2)}</dd>
            </div>
            <div className="breakdown__row">
              <dt>Transporte{state.entrega === 'instalacion' ? ` · ${state.zone}` : ''}</dt>
              <dd>${transporte.toFixed(2)}</dd>
            </div>
            <div className="breakdown__row breakdown__row--total">
              <dt>Total</dt>
              <dd data-testid="resumen-total-value">${grandTotal.toFixed(2)}</dd>
            </div>
            <div className="breakdown__row">
              <dt>Anticipo (80%)</dt>
              <dd>${anticipo.toFixed(2)}</dd>
            </div>
            <div className="breakdown__row">
              <dt>Saldo (20%, al entregar)</dt>
              <dd>${saldo.toFixed(2)}</dd>
            </div>
            <div className="breakdown__row">
              <dt>Entrega estimada</dt>
              <dd>8–10 días hábiles</dd>
            </div>
          </dl>
        </div>

        <div className="bottom-bar cotizador__mobile-only-ctas">
          {ctas}
        </div>
        {asideCtaTarget && createPortal(ctas, asideCtaTarget)}
      </section>
    );
  }

  const item = buildLineItem(state);
  const subtotal = quote.amount ?? 0;
  const transporte = zoneFee ?? 0;
  const grandTotal = total ?? subtotal;
  const anticipo = Math.round(grandTotal * 80) / 100;
  const saldo = grandTotal - anticipo;
  const entregaLabel = state.entrega === 'instalacion' ? 'con instalación' : 'retiro en tienda';

  const waHref = buildWaLink(
    buildQuoteMessage({
      items: [
        {
          producto: product.name,
          anchoM: item.anchoM,
          altoM: item.altoM,
          color: item.color,
          vidrio: item.vidrio,
          cantidad: item.cantidad,
          zona: state.entrega === 'instalacion' ? state.zone : '—',
          entrega: entregaLabel,
          subtotal,
        },
      ],
      transporte,
      total: grandTotal,
      anticipo,
      saldo,
    }),
  );

  const ctas = (
    <>
      <a href={waHref} className="btn btn-whatsapp" style={{ width: '100%' }}>
        <IconWhatsApp />
        Enviar por WhatsApp para confirmar
      </a>
      <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={onNext}>
        Pagar ahora
        <IconArrowRight />
      </button>
    </>
  );

  return (
    <section aria-labelledby="cotizador-page-title">
      <div className="summary-card">
        <div className="summary-card__header">
          <span className="summary-card__count">Tus productos · 1 producto</span>
          {entregaLabel === 'con instalación' && (
            <p className="summary-card__zone">
              <IconLocationPin />
              Zona: {state.zone} · con instalación
              <button type="button" className="summary-card__zone-change" onClick={onEditZone}>
                Cambiar
              </button>
            </p>
          )}
        </div>
        <article className="summary-item">
          <img
            src={PRODUCT_IMAGES[product.id]}
            alt=""
            width={56}
            height={56}
            className="summary-item__thumb"
            style={{ objectFit: 'cover' }}
          />
          <div className="summary-item__meta">
            <span className="summary-item__name">{product.name}</span>
            <span className="summary-item__detail">{item.detail}</span>
            <span className="summary-item__detail">
              {entregaLabel === 'con instalación' ? `Con instalación · ${state.zone}` : 'Retiro en tienda'}
            </span>
            <div className="summary-item__footer">
              <span className="summary-item__price">${subtotal.toFixed(2)}</span>
              <button
                type="button"
                className="summary-item__remove"
                disabled
                aria-disabled="true"
                aria-label={`Quitar ${product.name}`}
              >
                <IconTrash />
                Quitar
              </button>
            </div>
          </div>
        </article>

        <button type="button" className="summary-add" disabled aria-disabled="true">
          <IconPlus />
          Agregar otro producto
        </button>

        <dl className="breakdown" style={{ marginTop: 8 }}>
          <div className="breakdown__row">
            <dt>Subtotal productos</dt>
            <dd>${subtotal.toFixed(2)}</dd>
          </div>
          <div className="breakdown__row">
            <dt>Transporte{state.entrega === 'instalacion' ? ` · ${state.zone}` : ''}</dt>
            <dd>${transporte.toFixed(2)}</dd>
          </div>
          <div className="breakdown__row breakdown__row--total">
            <dt>Total</dt>
            <dd data-testid="resumen-total-value">${grandTotal.toFixed(2)}</dd>
          </div>
          <div className="breakdown__row">
            <dt>Anticipo (80%)</dt>
            <dd>${anticipo.toFixed(2)}</dd>
          </div>
          <div className="breakdown__row">
            <dt>Saldo (20%, al entregar)</dt>
            <dd>${saldo.toFixed(2)}</dd>
          </div>
          <div className="breakdown__row">
            <dt>Entrega estimada</dt>
            <dd>8–10 días hábiles</dd>
          </div>
        </dl>
      </div>

      <div className="bottom-bar cotizador__mobile-only-ctas">
        {ctas}
      </div>
      {asideCtaTarget && createPortal(ctas, asideCtaTarget)}
    </section>
  );
}
