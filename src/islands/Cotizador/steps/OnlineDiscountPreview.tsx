import type { ReactElement } from 'react';
import type { PayOffer } from '../state/payOffer';
import { IconCardRect } from '../icons-checkout';
import '@styles/cotizador-discount.css';

export interface OnlineDiscountPreviewProps {
  offer: PayOffer | null;
  /** Each placement owns its testid (step body vs desktop aside), so a locator never matches two nodes. */
  testId?: string;
}

/**
 * "Pagando con tarjeta en línea: $X (−10%)": what the card would cost, shown while the discount is
 * NOT applied yet (Precio -> Resumen without `?oferta=online10` and before choosing card in Step5).
 * It never touches the golden totals around it.
 */
export default function OnlineDiscountPreview({
  offer,
  testId = 'online-discount-preview',
}: OnlineDiscountPreviewProps): ReactElement | null {
  if (!offer || offer.mode !== 'preview') return null;
  return (
    <p className="online-discount-preview" data-testid={testId}>
      <IconCardRect size={18} className="online-discount-preview__icon" />
      <span>{`Pagando con tarjeta en línea: $${offer.cardTotal.toFixed(2)} (−10%)`}</span>
    </p>
  );
}
