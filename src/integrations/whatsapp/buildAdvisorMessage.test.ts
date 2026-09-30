import { describe, expect, it } from 'vitest';
import { buildAdvisorMessage } from './buildMessage';

describe('integrations/whatsapp buildAdvisorMessage', () => {
  it('matches the snapshot and carries no price', () => {
    const message = buildAdvisorMessage('2 fijas + 2 corredizas');
    expect(message).toMatchInlineSnapshot(
      `"Hola ALCUSA, me interesa cotizar: 2 fijas + 2 corredizas. ¿Me pueden asesorar con medidas y precio?"`,
    );
    expect(message).not.toContain('$');
  });
});

describe('integrations/whatsapp buildCatalogAdvisorMessage', () => {
  it('uses the catalog board copy', async () => {
    const { buildCatalogAdvisorMessage } = await import('./buildMessage');
    expect(buildCatalogAdvisorMessage('2 fijas + 2 corredizas')).toBe('Hola, quiero cotizar 2 fijas + 2 corredizas');
  });
});
