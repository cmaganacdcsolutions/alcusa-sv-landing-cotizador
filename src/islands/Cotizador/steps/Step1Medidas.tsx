import type { Dispatch, ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import type { CotizadorAction, CotizadorState } from '../state/cotizadorStore';
import type { QuoteResult } from '../state/quote';
import ComingSoonForm from './measures/ComingSoonForm';
import CornerForm from './measures/CornerForm';
import HingedForm from './measures/HingedForm';
import StraightForm from './measures/StraightForm';
import TemperedForm from './measures/TemperedForm';

export interface Step1MedidasProps {
  product: CatalogProduct;
  state: CotizadorState;
  dispatch: Dispatch<CotizadorAction>;
  quote: QuoteResult;
  onBack: () => void;
  onNext: () => void;
}

// Step 1 — thin per-product dispatcher (S5 refactor). Each product's
// measures UI lives in steps/measures/<Name>Form.tsx; this file only routes.
export default function Step1Medidas({ product, state, dispatch, quote, onBack, onNext }: Step1MedidasProps): ReactElement {
  switch (state.productId) {
    case 'recta':
      return <StraightForm product={product} state={state} dispatch={dispatch} quote={quote} onBack={onBack} onNext={onNext} />;
    case 'l':
      return <CornerForm product={product} state={state} dispatch={dispatch} quote={quote} onBack={onBack} onNext={onNext} />;
    case 'templado':
      return <TemperedForm product={product} state={state} dispatch={dispatch} quote={quote} onBack={onBack} onNext={onNext} />;
    case 'bisagra':
      return <HingedForm product={product} state={state} dispatch={dispatch} quote={quote} onBack={onBack} onNext={onNext} />;
    // 'jardin' / 'ventana' — S6 plugs its own form in here at merge.
    default:
      return <ComingSoonForm product={product} onBack={onBack} />;
  }
}
