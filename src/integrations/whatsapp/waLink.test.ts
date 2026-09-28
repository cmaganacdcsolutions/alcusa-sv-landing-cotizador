import { describe, expect, it } from 'vitest';
import { buildWaLink } from './waLink';

describe('integrations/whatsapp waLink', () => {
  it('builds a bare wa.me link with no message (quick-contact icons)', () => {
    expect(buildWaLink()).toMatch(/^https:\/\/wa\.me\/\d+$/);
  });

  it('URL-encodes the message as a query param', () => {
    const link = buildWaLink('Hola ALCUSA, quiero confirmar esta cotización: 1 & 2');
    expect(link).toContain('?text=');
    expect(link).toContain(encodeURIComponent('Hola ALCUSA, quiero confirmar esta cotización: 1 & 2'));
  });
});
