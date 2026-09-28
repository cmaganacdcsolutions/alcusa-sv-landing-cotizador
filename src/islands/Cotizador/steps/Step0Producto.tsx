import type { ReactElement } from 'react';
import { CATALOG_PRODUCTS, type ProductId } from '@content/catalog';

export interface Step0ProductoProps {
  selectedId: ProductId | null;
  onSelect: (productId: ProductId) => void;
}

// Step 0 — product picker. Only "recta" is selectable this slice; the other
// 5 render disabled/"Próximamente" (S5/S6 enable them), per T1.2 scope.
export default function Step0Producto({ selectedId, onSelect }: Step0ProductoProps): ReactElement {
  return (
    <section aria-labelledby="step0-heading">
      <h2 id="step0-heading" className="cotizador__title" style={{ fontSize: '1.375rem', marginBottom: 12 }}>
        Elige tu producto
      </h2>
      <div className="product-grid">
        {CATALOG_PRODUCTS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="product-card"
            disabled={!p.enabled}
            aria-pressed={selectedId === p.id}
            onClick={() => p.enabled && onSelect(p.id)}
          >
            <span className="product-card__body">
              <span className="product-card__name">{p.name}</span>
              <span className="product-card__price">Desde ${p.fromPrice}</span>
              {!p.enabled && <span className="product-card__badge">Próximamente</span>}
            </span>
          </button>
        ))}
      </div>
      {!selectedId && (
        <div className="callout callout--empty" role="status" style={{ marginTop: 16 }}>
          <span style={{ fontWeight: 700 }}>Aún no eliges un producto</span>
          <span style={{ fontSize: 14, color: 'var(--color-ink-muted)' }}>
            Toca una opción para ver sus medidas y acabados.
          </span>
        </div>
      )}
    </section>
  );
}
