import type { Dispatch, ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import type { CotizadorAction, CotizadorState } from '../state/cotizadorStore';
import type { QuoteResult } from '../state/quote';
import CornerForm from './measures/CornerForm';
import GardenForm from './measures/GardenForm';
import HingedForm from './measures/HingedForm';
import StraightForm from './measures/StraightForm';
import TemperedForm from './measures/TemperedForm';
import WindowForm from './measures/WindowForm';
import '@styles/cotizador-medidas.css';

export interface Step1MedidasProps {
  product: CatalogProduct;
  state: CotizadorState;
  dispatch: Dispatch<CotizadorAction>;
  quote: QuoteResult;
  onNext: () => void;
}

// Step 1 — thin per-product dispatcher (S5 refactor). Each product's
// measures UI lives in steps/measures/<Name>Form.tsx; this file only routes.
export default function Step1Medidas({ product, state, dispatch, quote, onNext }: Step1MedidasProps): ReactElement {
  switch (state.productId) {
    case 'recta':
      return <StraightForm product={product} state={state} dispatch={dispatch} quote={quote} onNext={onNext} />;
    case 'l':
      return <CornerForm product={product} state={state} dispatch={dispatch} quote={quote} onNext={onNext} />;
    case 'templado':
      return <TemperedForm product={product} state={state} dispatch={dispatch} quote={quote} onNext={onNext} />;
    case 'bisagra':
      return <HingedForm product={product} state={state} dispatch={dispatch} quote={quote} onNext={onNext} />;
    case 'ventana':
      return <WindowForm state={state} dispatch={dispatch} onNext={onNext} />;
    case 'jardin':
      return <GardenForm state={state} dispatch={dispatch} onNext={onNext} />;
    default:
      return <StraightForm product={product} state={state} dispatch={dispatch} quote={quote} onNext={onNext} />;
  }
}
