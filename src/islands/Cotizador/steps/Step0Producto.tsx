import type { ReactElement } from 'react';
import { CATALOG_PRODUCTS, type ProductId } from '@content/catalog';
import { IconCheck } from '../icons';
import { PRODUCT_IMAGES } from './productImages';
import '@styles/cotizador-medidas.css';

export interface Step0ProductoProps {
  selectedId: ProductId | null;
  onSelect: (productId: ProductId) => void;
}

// Step 0 — product picker. All 6 catalog products are enabled/priceable as
// of S6 (see @content/catalog.ts); "Próximamente" only renders if a future
// entry ships disabled.
export default function Step0Producto({ selectedId, onSelect }: Step0ProductoProps): ReactElement {
  return (
    <section aria-labelledby="step0-heading">
      <h3 id="step0-heading" tabIndex={-1} className="cotizador__section-heading" style={{ marginBottom: 12 }}>
        Elige tu producto
      </h3>
      <div className="product-grid">
        {CATALOG_PRODUCTS.map((p) => {
          const selected = selectedId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className="product-card"
              disabled={!p.enabled}
              aria-pressed={selected}
              onClick={() => p.enabled && onSelect(p.id)}
            >
              <img src={PRODUCT_IMAGES[p.id]} alt="" className="product-card__image" width={64} height={64} />
              <span className="product-card__body">
                <span className="product-card__name">{p.name}</span>
                <span className="product-card__price">Desde ${p.fromPrice}</span>
                {!p.enabled && <span className="product-card__badge">Próximamente</span>}
              </span>
              {selected && (
                <span className="product-card__check">
                  <IconCheck size={12} strokeWidth={2.5} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {!selectedId && (
        <div className="callout callout--empty" role="status" style={{ marginTop: 16 }}>
          <span className="callout-empty__title">Aún no eliges un producto</span>
          <span className="callout-empty__body">Toca una opción para ver sus medidas y acabados.</span>
        </div>
      )}
    </section>
  );
}
