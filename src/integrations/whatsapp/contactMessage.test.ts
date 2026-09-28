import { describe, expect, it } from 'vitest';
import {
  buildContactMessage,
  isContactFormReady,
  isTelefonoError,
  telefonoDigits,
} from './contactMessage';

describe('integrations/whatsapp contactMessage — telefono validation', () => {
  it('has no error on an empty phone (pristine/empty state)', () => {
    expect(isTelefonoError('')).toBe(false);
  });

  it('flags an error once digits are typed but count != 8', () => {
    expect(isTelefonoError('777')).toBe(true);
    expect(isTelefonoError('777788889999')).toBe(true);
  });

  it('accepts 8 digits regardless of separators', () => {
    expect(isTelefonoError('7680-2410')).toBe(false);
    expect(isTelefonoError('77778888')).toBe(false);
  });

  it('strips non-digits', () => {
    expect(telefonoDigits('7680-2410')).toBe('76802410');
  });
});

describe('integrations/whatsapp contactMessage — form readiness', () => {
  it('is not ready when nombre or telefono are blank', () => {
    expect(isContactFormReady('', '')).toBe(false);
    expect(isContactFormReady('María', '')).toBe(false);
    expect(isContactFormReady('', '77778888')).toBe(false);
  });

  it('is not ready while the phone has fewer/more than 8 digits', () => {
    expect(isContactFormReady('María', '7777')).toBe(false);
  });

  it('is ready with a name and an 8-digit phone', () => {
    expect(isContactFormReady('María', '77778888')).toBe(true);
  });
});

describe('integrations/whatsapp contactMessage — buildContactMessage', () => {
  it('matches the §2.9 template exactly for the documented example', () => {
    const message = buildContactMessage({
      nombre: 'María',
      telefono: '77778888',
      producto: 'Ventana Francesa o Bilbao',
      mensaje: 'Cotización urgente',
    });
    expect(message).toBe(
      'Hola ALCUSA, soy María (77778888). Me interesa: Ventana Francesa o Bilbao. Cotización urgente',
    );
  });

  it('defaults producto to "Otro" when left blank', () => {
    const message = buildContactMessage({ nombre: 'Luis', telefono: '77778888', producto: '', mensaje: '' });
    expect(message).toBe('Hola ALCUSA, soy Luis (77778888). Me interesa: Otro. ');
  });

  it('trims nombre/telefono/mensaje', () => {
    const message = buildContactMessage({
      nombre: '  Ana  ',
      telefono: ' 7777-8888 ',
      producto: 'Otro',
      mensaje: '  hola  ',
    });
    expect(message).toBe('Hola ALCUSA, soy Ana (7777-8888). Me interesa: Otro. hola');
  });
});
