import type { ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';

export interface ComingSoonFormProps {
  product: CatalogProduct;
  onBack: () => void;
}

// Placeholder branch for products not yet wired in this slice ("jardin",
// "ventana" — S6 plugs in its own <Name>Form.tsx here at merge time).
export default function ComingSoonForm({ product, onBack }: ComingSoonFormProps): ReactElement {
  return (
    <section aria-labelledby="step1-heading">
      <button type="button" className="cotizador__back" onClick={onBack}>
        ← Producto
      </button>
      <h2 id="step1-heading" className="cotizador__title" style={{ fontSize: '1.375rem', margin: '8px 0 16px' }}>
        Medidas y acabado
      </h2>
      <div className="callout" role="status">
        <span className="callout__title">{product.name} próximamente</span>
        <p className="callout__body">Este producto aún no está disponible en el cotizador en línea.</p>
      </div>
    </section>
  );
}
