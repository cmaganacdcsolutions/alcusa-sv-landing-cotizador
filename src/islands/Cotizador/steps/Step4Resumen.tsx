import { useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { CATALOG_PRODUCTS, type CatalogProduct } from '@content/catalog';
import { buildWaLink } from '@integrations/whatsapp/waLink';
import { buildQuoteMessage } from '@integrations/whatsapp/buildMessage';
import { distritoName, formatAddressLine, formatAddressForMessage, isAddressComplete } from '../../../lib/delivery-address';
import { snapshotCartItem, type CotizadorState } from '../state/cotizadorStore';
import { buildOrderMessageItems, orderItemsSubtotal, type OrderLineItem } from '../state/order';
import { depositOf, formatDiscount } from '../state/payable';
import { ONLINE_DISCOUNT_LABEL, type PayOffer } from '../state/payOffer';
import OnlineDiscountPreview from './OnlineDiscountPreview';
import { IconArrowRight, IconPlus, IconWarningTriangle } from '../icons';
import { IconEdit, IconLocationPin, IconTrash } from '../icons-checkout';
import { estimateImage, type ImageSelection } from './productImages';
import QuoteChangeNotice from './quote/QuoteChangeNotice';
import PhotoFrame from '../../../components/PhotoFrame';
import { useQuoteShare } from '../share/useQuoteShare';
import { QuoteShareButton, QuoteShareNotices, QuoteShareToast } from '../share/QuoteShare';
import { CustomerDialog } from '../share/CustomerDialog';
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
  /** 10% online-card discount already subtracted from `total` (0 until the customer chose card in Step5). */
  onlineDiscount: number;
  /** 'preview' = "Pagando con tarjeta en línea: $X (−10%)" while the discount is not applied; null otherwise. */
  payOffer: PayOffer | null;
  /** Distrito sin tarifa: el envio no esta sumado en `total`, se confirma por WhatsApp. */
  shippingPending: boolean;
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
  // sf-cot-s7gaps gap 1 — desktop-only "Editar" (desktop-05-cotizador-
  // resumen.dc.html ~L84), drawn for every row like the board (uniform
  // `sc-for` loop, no special-case for the in-progress item): jumps to
  // Medidas with that item's fields loaded into the editable slot.
  onEditItem: (id: string) => void;
  // F4 (ADR-012): dismiss handler for the loaded-quote notice (state.quoteLoad).
  onDismissQuoteNotice?: () => void;
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
  onlineDiscount,
  payOffer,
  shippingPending,
  onNext,
  onEditZone,
  onAddAnother,
  onRemoveItem,
  onEditItem,
  onDismissQuoteNotice,
  asideCtaTarget,
}: Step4ResumenProps): ReactElement {
  const [liveMessage, setLiveMessage] = useState('');

  const entregaLabel: 'con instalación' | 'retiro en tienda' =
    state.entrega === 'instalacion' ? 'con instalación' : 'retiro en tienda';
  const zona = state.entrega === 'instalacion' ? state.zone : '—';
  // Miniatura por fila: el item en curso (`id: 'current'`) toma su color/vidrio del estado vivo; los del carrito, de su snapshot.
  const selectionOf = (item: OrderLineItem): ImageSelection =>
    (item.id === 'current' ? state : state.cart.find((c) => c.id === item.id)) ?? {};
  const transporte = zoneFee ?? 0;
  const subtotal = orderItemsSubtotal(items);
  const anyRequiresQuote = items.some((i) => i.requiresQuote);
  const grandTotal = total ?? subtotal;
  const anticipo = depositOf(grandTotal);
  const saldo = grandTotal - anticipo;
  // WhatsApp / PDF-fallback text is the non-card path: never discounted.
  const waTotal = Math.round((grandTotal + onlineDiscount) * 100) / 100;
  const waAnticipo = depositOf(waTotal);
  const waSaldo = Math.round((waTotal - waAnticipo) * 100) / 100;
  const countText = `${items.length} ${items.length === 1 ? 'producto' : 'productos'}`;

  const direccionMsg = state.entrega === 'instalacion' && isAddressComplete(state.address) ? formatAddressForMessage(state.address) : '';
  const waMsgItems = buildOrderMessageItems(state, CATALOG_PRODUCTS, { zona, entrega: entregaLabel });
  const waHref = buildWaLink(
    buildQuoteMessage({
      items: waMsgItems,
      transporte,
      total: waTotal,
      anticipo: waAnticipo,
      saldo: waSaldo,
      ...(shippingPending ? { shippingPending: true } : {}),
      ...(direccionMsg ? { direccion: direccionMsg } : {}),
    }),
  );

  // R4 — PDF + WhatsApp share (ios/android/desktop-r07). `waHref` stays as the
  // text-only fallback in the G error card.
  const configs = Object.fromEntries(
    items.map((it) => {
      const snap: object = (it.id === 'current' ? snapshotCartItem(state, it.id) : state.cart.find((c) => c.id === it.id)) ?? {};
      return [it.id, Object.fromEntries(Object.entries(snap).filter(([k]) => k !== 'id'))];
    }),
  );
  const share = useQuoteShare({
    items,
    configs,
    entrega: state.entrega === 'instalacion' ? 'instalacion' : 'retiro',
    zone: state.zone,
    ...(direccionMsg ? { address: formatAddressLine(state.address) } : {}),
    transport: transporte,
    total: grandTotal,
    // Folio WITHOUT the card discount unless the customer already chose card in Step5.
    ...(shippingPending ? { shippingPending: true } : {}),
    ...(onlineDiscount > 0 ? { discount: { code: 'online_card_10' as const, amount: onlineDiscount } } : {}),
  });

  function handleAddAnother(): void {
    setLiveMessage(`${product.name} agregado. Elige otro producto.`);
    onAddAnother();
  }

  function handleRemove(item: OrderLineItem): void {
    setLiveMessage(`${item.name} quitado de tu cotización.`);
    onRemoveItem(item.id);
  }

  function handleEdit(item: OrderLineItem): void {
    onEditItem(item.id);
  }

  const ctas = (
    <>
      <QuoteShareNotices share={share} textOnlyHref={waHref} variant="aside" />
      <QuoteShareButton share={share} />
      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%' }}
        disabled={share.status === 'preparing'}
        onClick={onNext}
      >
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
      {state.quoteLoad && onDismissQuoteNotice && (
        <QuoteChangeNotice notice={state.quoteLoad} onDismiss={onDismissQuoteNotice} />
      )}
      <div className="summary-card">
        <div className="summary-card__header">
          <span className="summary-card__count">Tus productos · {countText}</span>
          {entregaLabel === 'con instalación' && (
            <p className="summary-card__zone">
              <IconLocationPin />
              Zona: {state.zone || distritoName(state.address)} · con instalación
              <button type="button" className="summary-card__zone-change" onClick={onEditZone}>
                Cambiar
              </button>
            </p>
          )}
          {entregaLabel === 'con instalación' && isAddressComplete(state.address) && (
            <p className="summary-card__address" data-testid="resumen-address">
              {formatAddressLine(state.address)} · Tel: {state.address.telefono}
              {state.address.geo ? ' · Ubicación guardada' : ''}
            </p>
          )}
        </div>

        {items.map((item) => (
          <article className="summary-item" key={item.id}>
            <PhotoFrame src={estimateImage(item.productId, selectionOf(item))} alt="" ratio="1/1" loading="eager" className="summary-item__thumb" />
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
                <div className="summary-item__actions">
                  {/* desktop-05-cotizador-resumen.dc.html ~L84 — desktop-only
                     "Editar", mobile boards (ios-05/android-05) draw only
                     "Quitar"; cotizador-mobile.spec.ts asserts no Editar
                     below 1024px. */}
                  <button
                    type="button"
                    className="summary-item__edit"
                    aria-label={`Editar ${item.name}`}
                    onClick={() => handleEdit(item)}
                  >
                    <IconEdit />
                    Editar
                  </button>
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
            <dt>
              {shippingPending
                ? 'Envío'
                : `Transporte${state.entrega === 'instalacion' ? ` · ${state.zone}` : ''}`}
            </dt>
            <dd>{shippingPending ? 'Por confirmar' : `$${transporte.toFixed(2)}`}</dd>
          </div>
          {onlineDiscount > 0 && (
            <div className="breakdown__row" data-testid="resumen-discount-row">
              <dt>{ONLINE_DISCOUNT_LABEL}</dt>
              <dd data-testid="resumen-discount-value">{formatDiscount(onlineDiscount)}</dd>
            </div>
          )}
          <div className="breakdown__row breakdown__row--total">
            <dt>{shippingPending ? 'Total productos' : 'Total'}</dt>
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
        <OnlineDiscountPreview offer={payOffer} />
        {onlineDiscount > 0 && (
          <p className="online-discount-wa-note" data-testid="resumen-whatsapp-note">
            {`Por WhatsApp ${shippingPending ? 'el total de productos' : 'el total'} es $${waTotal.toFixed(2)}: el 10% aplica solo pagando con tarjeta en línea.`}
          </p>
        )}
      </div>

      <QuoteShareNotices share={share} textOnlyHref={waHref} variant="main" />
      <QuoteShareToast share={share} />
      <CustomerDialog share={share} prefillWhatsapp={state.entrega === 'instalacion' ? state.address.telefono : undefined} />
      <div className="bottom-bar cotizador__mobile-only-ctas">{ctas}</div>
      {asideCtaTarget && createPortal(ctas, asideCtaTarget)}
    </section>
  );
}
