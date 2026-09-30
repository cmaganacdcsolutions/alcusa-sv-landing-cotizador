import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearStoredCustomer,
  consentStillValid,
  CUSTOMER_STORAGE_KEY,
  formatWhatsappInput,
  formatWhatsappPrint,
  loadStoredCustomer,
  MSG,
  normalizeName,
  saveStoredCustomer,
  validateName,
  validateWhatsapp,
} from './index';

describe('name', () => {
  it('normalizes NFC, trim and collapses spaces', () => {
    expect(normalizeName('  María   López ')).toBe('María López');
    expect(normalizeName('María')).toBe('María'.normalize('NFC'));
  });
  it.each([
    ['María López', true],
    ["D'Angelo O’Neil-Ruiz Jr.", true],
    ['Zoë', true],
    ['Li', true],
    ['  Ana   Paz ', true],
  ])('accepts %s', (v, ok) => expect(validateName(v).ok).toBe(ok));
  it('reports exact copy', () => {
    expect(validateName('   ')).toEqual({ ok: false, error: MSG.nameRequired });
    expect(validateName('M')).toEqual({ ok: false, error: MSG.nameShort });
    expect(validateName('A'.repeat(81))).toEqual({ ok: false, error: MSG.nameLong });
    expect(validateName('A'.repeat(80)).ok).toBe(true);
    for (const bad of ['1234', 'Ana <b>', 'http://x.co', '-Ana', 'Ana_7', '😀 Ana']) expect(validateName(bad)).toEqual({ ok: false, error: MSG.nameChars });
  });
});

describe('whatsapp', () => {
  it.each([
    ['7123-4567', '71234567'],
    ['7123 4567', '71234567'],
    ['+503 7123-4567', '71234567'],
    ['503 (6123) 4567', '61234567'],
    ['50371234567', '71234567'],
    ['(712) 34-567', '71234567'],
  ])('normalizes %s', (raw, d) => {
    const r = validateWhatsapp(raw);
    expect(r).toEqual({ ok: true, value: { display: `${d.slice(0, 4)}-${d.slice(4)}`, e164: `+503${d}` } });
  });
  it.each(['5123-4567', '8123-4567', '7123-456', '7123-45678', '+504 7123-4567', '50471234567', 'abcd-efgh', '503 5123 4567'])('rejects %s', (raw) =>
    expect(validateWhatsapp(raw)).toEqual({ ok: false, error: MSG.waInvalid }));
  it('requires a value', () => {
    expect(validateWhatsapp('  - ')).toEqual({ ok: false, error: MSG.waRequired });
  });
  it('masks while typing and prints +503 ####-####', () => {
    expect(formatWhatsappInput('71234567')).toBe('7123-4567');
    expect(formatWhatsappInput('7123')).toBe('7123');
    expect(formatWhatsappInput('71234')).toBe('7123-4');
    expect(formatWhatsappInput('+503 7123 4567')).toBe('7123-4567');
    expect(formatWhatsappInput('7a1b2c3d4e5f6g7h999')).toBe('7123-4567');
    expect(formatWhatsappPrint('+50371234567')).toBe('+503 7123-4567');
  });
});

describe('sessionStorage (alcusa.cliente.v1)', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    } as unknown as Storage;
  });
  it('saves the contract shape, reads it back and clears it', () => {
    expect(loadStoredCustomer()).toBeNull();
    saveStoredCustomer({ name: 'Ana Paz', whatsapp: '+50371234567' }, new Date('2026-09-30T12:00:00Z'));
    expect(JSON.parse(sessionStorage.getItem(CUSTOMER_STORAGE_KEY)!)).toEqual({
      name: 'Ana Paz',
      whatsapp: '+50371234567',
      consent: { accepted: true, noticeVersion: '2026-10-v1' },
      savedAt: '2026-09-30T12:00:00.000Z',
    });
    const s = loadStoredCustomer()!;
    expect(consentStillValid(s)).toBe(true);
    expect(consentStillValid({ ...s, consent: { accepted: true, noticeVersion: 'old' } })).toBe(false);
    clearStoredCustomer();
    expect(loadStoredCustomer()).toBeNull();
  });
  it('ignores corrupt payloads', () => {
    sessionStorage.setItem(CUSTOMER_STORAGE_KEY, '{"name":1}');
    expect(loadStoredCustomer()).toBeNull();
    sessionStorage.setItem(CUSTOMER_STORAGE_KEY, 'not json');
    expect(loadStoredCustomer()).toBeNull();
  });
});
