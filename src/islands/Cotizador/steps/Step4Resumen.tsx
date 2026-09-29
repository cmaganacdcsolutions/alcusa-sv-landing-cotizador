import { useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { CATALOG_PRODUCTS, type CatalogProduct } from '@content/catalog';
import { buildWaLink } from '@integrations/whatsapp/waLink';
import { buildQuoteMessage } from '@integrations/whatsapp/buildMessage';
import type { CotizadorState } from '../state/cotizadorStore';
import { buildOrderMessageItems, orderItemsSubtotal, type OrderLineItem } from '../state/order';
import { IconArrowRight, IconPlus, IconWarningTriangle, IconWhatsApp } from '../icons';
import { IconLocationPin, IconTrash } from '../icons-checkout';
import { PRODUCT_IMAGES } from './productImages';
import '@styles/cotizador-checkout.css';

export interface Step4ResumenProps {
  product: CatalogProduct;
  state: CotizadorState;
  // S7 — one row per cart item (committed) + the current item, in that
  // order; built once in Cotizador.tsx (state/order.ts) so every consumer
  // (this card, the desktop aside, the WhatsApp/Wompi payloads) agrees on
  // the same list.
  items: OrderLineItem[];
  zoneFee: number | undefined;
  total: number | null;
  onNext: () => void;
  // Renders as a real "Cambiar" link/button either way; a no-op if omitted.
  onEditZone?: () => void;
  // S7 — commits the current item into the cart and resets step 0 with a
  // fresh item (prototype-spec.md §2.1 step 4).
  onAddAnother: () => void;
  // S7 — `id: 'current'` removes the in-progress item (promoting the last
  // cart item back into it, or falling back to step 0 if the cart empties
  // too); any other id removes that committed cart item.
  onRemoveItem: (id: string) => void;
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

// Step 4 — multi-item cart summary (S7). "+ Agregar otro producto" commits
// the current item and loops back to step 0; "Quitar" removes any row
// (current or committed). One row per cart item regardless of product —
// a ventana item's several repeatable panes are summarized into its own
// single row here (buildLineItem's rowCount summary), matching the boards'
// "Quitar" contract of one action per item (cotizador-mobile.spec.ts:
// "no separate Editar" per row). The WhatsApp message still expands a
// ventana item into one line per pane (existing S6 granularity) via
// buildOrderMessageItems.
export default function Step4Resumen({
  product,
  state,
  items,
  zoneFee,
  total,
  onNext,
  onEditZone,
  onAddAnother,
  onRemoveItem,
  asideCtaTarget,
}: Step4ResumenProps): ReactElement {
  const [liveMessage, setLiveMessage] = useState('');

  const entregaLabel: 'con instalación' | 'retiro en tienda' =
    state.entrega === 'instalacion' ? 'con instalación' : 'retiro en tienda';
  const zona = state.entrega === 'instalacion' ? state.zone : '—';
  const transporte = zoneFee ?? 0;
  const subtotal = orderItemsSubtotal(items);
  const anyRequiresQuote = items.some((i) => i.requiresQuote);
  const grandTotal = total ?? subtotal;
  const anticipo = Math.round(grandTotal * 80) / 100;
  const saldo = grandTotal - anticipo;
  const countText = `${items.length} ${items.length === 1 ? 'producto' : 'productos'}`;

  const waMsgItems = buildOrderMessageItems(state, CATALOG_PRODUCTS, { zona, entrega: entregaLabel });
  const waHref = buildWaLink(
    buildQuoteMessage({ items: waMsgItems, transporte, total: grandTotal, anticipo, saldo }),
  );

  function handleAddAnother(): void {
    setLiveMessage(`${product.name} agregado. Elige otro producto.`);
    onAddAnother();
  }

  function handleRemove(item: OrderLineItem): void {
    setLiveMessage(`${item.name} quitado de tu cotización.`);
    onRemoveItem(item.id);
  }

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
      <div className="visually-hidden" aria-live="polite" role="status">
        {liveMessage}
      </div>
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

        {items.map((item) => (
          <article className="summary-item" key={item.id}>
            <img
              src={PRODUCT_IMAGES[item.productId]}
              alt=""
              width={56}
              height={56}
              className="summary-item__thumb"
              style={{ objectFit: 'cover' }}
            />
            <div className="summary-item__meta">
              <span className="summary-item__name">{item.name}</span>
              <span className="summary-item__detail">{item.detail}</span>
              <span className="summary-item__detail">
                {entregaLabel === 'con instalación' ? `Con instalación · ${state.zone}` : 'Retiro en tienda'}
              </span>
              <div className="summary-item__footer">
                <span className="summary-item__price">
                  {item.requiresQuote ? 'Por WhatsApp' : `$${item.subtotal.toFixed(2)}`}
                </span>
                <button
                  type="button"
                  className="summary-item__remove"
                  aria-label={`Quitar ${item.name}`}
                  onClick={() => handleRemove(item)}
                >
                  <IconTrash />
                  Quitar
                </button>
              </div>
            </div>
          </article>
        ))}

        <button type="button" className="summary-add" onClick={handleAddAnother}>
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
              resto, o quitarlo y confirmar solo lo que ya tiene precio.
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

      <div className="bottom-bar cotizador__mobile-only-ctas">{ctas}</div>
      {asideCtaTarget && createPortal(ctas, asideCtaTarget)}
    </section>
  );
}
