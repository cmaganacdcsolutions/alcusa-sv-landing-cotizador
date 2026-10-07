import { describe, expect, it } from 'vitest';
import { cotizadorReducer, initialCotizadorState, type CotizadorState } from './cotizadorStore';
import {
  clearWizardSnapshot,
  hasDeepLinkParams,
  parseWizardSnapshot,
  persistWizardState,
  readWizardSnapshot,
  restoredStep,
  restoreFields,
  shouldRestoreWizard,
  snapshotFromState,
  WIZARD_STORAGE_KEY,
  writeWizardSnapshot,
  type RestoreContext,
  type StorageLike,
} from './persist';

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwingStorage: StorageLike = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

function midFlowState(over: Partial<CotizadorState> = {}): CotizadorState {
  return {
    ...initialCotizadorState,
    step: 'zonaEntrega',
    productId: 'recta',
    width: '150',
    color: 'bronce',
    glass: 'nevado',
    zone: 'Soyapango',
    address: {
      departamentoId: '06',
      municipioId: '0603',
      distritoId: '060301',
      colonia: 'Residencial Las Flores',
      calle: 'Pasaje 3',
      referencia: 'portón negro',
      telefono: '7123-4567',
      geo: { lat: 13.69, lng: -89.19 },
    },
    ...over,
  };
}

describe('state/persist — snapshot round-trip', () => {
  it('guarda y restaura producto, medidas, direccion con geo, zona y paso', () => {
    const state = midFlowState();
    const snap = snapshotFromState(state);
    expect(snap).not.toBeNull();
    const parsed = parseWizardSnapshot(JSON.parse(JSON.stringify(snap)));
    expect(parsed).toMatchObject({
      v: 1,
      step: 'zonaEntrega',
      productId: 'recta',
      width: '150',
      color: 'bronce',
      glass: 'nevado',
      zone: 'Soyapango',
      entrega: 'instalacion',
    });
    expect(parsed?.address.geo).toEqual({ lat: 13.69, lng: -89.19 });
    expect(parsed?.address.colonia).toBe('Residencial Las Flores');
  });

  it('RESTORE_WIZARD aplica el snapshot sobre un estado limpio sin tocar pago ni carrito', () => {
    const snap = snapshotFromState(midFlowState({ editingItem: { id: 'x1', index: 1 } }));
    const restored = cotizadorReducer(
      { ...initialCotizadorState, cart: [], payMethodChosen: false },
      { type: 'RESTORE_WIZARD', fields: restoreFields(snap!, null) },
    );
    expect(restored.step).toBe('zonaEntrega');
    expect(restored.productId).toBe('recta');
    expect(restored.editingItem).toEqual({ id: 'x1', index: 1 });
    expect(restored.payMethod).toBe(initialCotizadorState.payMethod);
    expect(restored.payMethodChosen).toBe(false);
    expect(restored.wompiOutcome).toBeNull();
  });

  it('el snapshot nunca contiene pago ni campos de Wompi', () => {
    const snap = snapshotFromState(
      midFlowState({ payMethod: 'wa', payMethodChosen: true, payAmountPct: 100, wompiOrderNumber: 'ALC-1' }),
    )!;
    for (const key of ['payMethod', 'payMethodChosen', 'payAmountPct', 'wompiOutcome', 'wompiOrderNumber', 'cart', 'quoteLoad']) {
      expect(snap).not.toHaveProperty(key);
    }
  });

  it('onlineOffer hace round-trip y RESTORE_WIZARD lo devuelve sin tocar el metodo de pago', () => {
    const snap = snapshotFromState(midFlowState({ onlineOffer: true, payMethod: 'wa', payMethodChosen: true }))!;
    expect(snap.onlineOffer).toBe(true);
    expect(parseWizardSnapshot(JSON.parse(JSON.stringify(snap)))?.onlineOffer).toBe(true);
    const restored = cotizadorReducer(initialCotizadorState, { type: 'RESTORE_WIZARD', fields: restoreFields(snap, null) });
    expect(restored.onlineOffer).toBe(true);
    // payMethod/payMethodChosen siguen FUERA del snapshot: el link `?oferta=` los vuelve a aplicar al montar.
    expect(restored.payMethod).toBe(initialCotizadorState.payMethod);
    expect(restored.payMethodChosen).toBe(false);
  });

  it('sin la oferta el snapshot guarda onlineOffer false', () => {
    expect(snapshotFromState(midFlowState())?.onlineOffer).toBe(false);
  });

  it('ventana, jardin y esquina (campos de item) hacen round-trip', () => {
    const state = midFlowState({
      productId: 'ventana',
      windowModel: 'bilbao',
      windowGlass: 'super_gris',
      windowZaranda: true,
      windowRows: [
        { id: 'row-1', qty: '2', widthM: '1.20', heightM: '1.00' },
        { id: 'row-2', qty: '1', widthM: '0.90', heightM: '0.80' },
      ],
      gardenHojas: 'custom',
      gardenHeightOption: 'otra',
      gardenHeightOtra: '2.30',
      cornerModel: 'frosted',
    });
    const parsed = parseWizardSnapshot(JSON.parse(JSON.stringify(snapshotFromState(state))));
    expect(parsed).toMatchObject({
      windowModel: 'bilbao',
      windowGlass: 'super_gris',
      windowZaranda: true,
      gardenHojas: 'custom',
      gardenHeightOption: 'otra',
      gardenHeightOtra: '2.30',
      cornerModel: 'frosted',
    });
    expect(parsed?.windowRows).toHaveLength(2);
  });
});

describe('state/persist — clampeo y borrado al escribir', () => {
  it('wompi se guarda como formaPago', () => {
    expect(snapshotFromState(midFlowState({ step: 'wompi' }))?.step).toBe('formaPago');
  });

  it('resultado aprobado o pendiente borra el guardado', () => {
    expect(snapshotFromState(midFlowState({ step: 'resultado', wompiOutcome: 'approved' }))).toBeNull();
    expect(snapshotFromState(midFlowState({ step: 'resultado', wompiOutcome: 'pending' }))).toBeNull();
  });

  it('resultado rechazado guarda formaPago para reintentar', () => {
    expect(snapshotFromState(midFlowState({ step: 'resultado', wompiOutcome: 'declined' }))?.step).toBe('formaPago');
  });

  it('estado virgen borra el guardado; un paso intermedio sin producto tambien', () => {
    expect(snapshotFromState(initialCotizadorState)).toBeNull();
    expect(snapshotFromState(midFlowState({ productId: null }))).toBeNull();
  });

  it('con retiro elegido y sin producto (tras agregar al carrito) el estado NO es virgen', () => {
    expect(snapshotFromState({ ...initialCotizadorState, entrega: 'retiro' })).not.toBeNull();
  });

  it('con la oferta online aplicada el estado NO es virgen (se guarda aunque no haya producto)', () => {
    const offerOnly = cotizadorReducer(initialCotizadorState, { type: 'APPLY_ONLINE_OFFER' });
    const snap = snapshotFromState(offerOnly);
    expect(snap).not.toBeNull();
    expect(snap?.onlineOffer).toBe(true);
    expect(snap?.step).toBe('producto');
    expect(snapshotFromState({ ...initialCotizadorState, onlineOffer: false })).toBeNull();
  });
});

describe('state/persist — parseWizardSnapshot rechaza lo no confiable', () => {
  const good = () =>
    JSON.parse(JSON.stringify(snapshotFromState(midFlowState({ onlineOffer: true })))) as Record<string, unknown>;

  it('acepta el snapshot valido', () => {
    expect(parseWizardSnapshot(good())).not.toBeNull();
  });

  it.each([null, undefined, 'x', 42, [], {}])('rechaza %j', (v) => {
    expect(parseWizardSnapshot(v)).toBeNull();
  });

  it('rechaza otra version', () => {
    expect(parseWizardSnapshot({ ...good(), v: 2 })).toBeNull();
  });

  it.each([
    ['step', 'inventado'],
    ['step', '__proto__'],
    ['entrega', 'envio'],
    ['productId', 'puerta-magica'],
    ['color', 'rojo'],
    ['glass', 'espejo'],
    ['cornerModel', 'x'],
    ['windowModel', 'x'],
    ['windowGlass', 'x'],
    ['gardenHojas', 4],
    ['gardenHojas', '2'],
    ['gardenHeightOption', '3.00'],
    ['gardenColor', 'x'],
    ['gardenGlass', 'x'],
    ['width', 150],
    ['width', 'x'.repeat(65)],
    ['zone', 7],
    ['zone', 'z'.repeat(121)],
    ['hingedFixedPanelEnabled', 'true'],
    ['addressFromQuote', 1],
    ['onlineOffer', 'x'],
    ['onlineOffer', 1],
    ['onlineOffer', null],
    ['windowRows', []],
    ['windowRows', [{ id: 'r', qty: 1, widthM: '1', heightM: '1' }]],
    ['windowRows', 'nope'],
    ['editingItem', { id: 'a', index: -1 }],
    ['editingItem', { id: 'a', index: 1.5 }],
    ['editingItem', 'a'],
    ['address', 'calle'],
    ['address', null],
  ])('rechaza %s = %j', (key, value) => {
    expect(parseWizardSnapshot({ ...good(), [key]: value })).toBeNull();
  });

  it('rechaza un campo faltante', () => {
    const snap = good();
    delete snap.glass;
    expect(parseWizardSnapshot(snap)).toBeNull();
  });

  it('un snapshot viejo sin onlineOffer se descarta (sin bump de version)', () => {
    const snap = good();
    delete snap.onlineOffer;
    expect(parseWizardSnapshot(snap)).toBeNull();
  });

  it('rechaza demasiadas filas de ventana', () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({ id: `r${i}`, qty: '1', widthM: '1', heightM: '1' }));
    expect(parseWizardSnapshot({ ...good(), windowRows: rows })).toBeNull();
  });

  it('un paso intermedio sin producto se rechaza; "producto" sin producto es valido', () => {
    expect(parseWizardSnapshot({ ...good(), productId: null })).toBeNull();
    expect(parseWizardSnapshot({ ...good(), productId: null, step: 'producto' })).not.toBeNull();
  });

  it('geo invalido en la direccion se descarta (parser tolerante) sin romper el resto', () => {
    const snap = good();
    (snap.address as Record<string, unknown>).geo = { lat: 'x', lng: 1 };
    expect(parseWizardSnapshot(snap)?.address.geo).toBeNull();
  });
});

describe('state/persist — storage', () => {
  it('write -> read -> clear', () => {
    const storage = fakeStorage();
    const snap = snapshotFromState(midFlowState())!;
    writeWizardSnapshot(snap, storage);
    expect(storage.data.has(WIZARD_STORAGE_KEY)).toBe(true);
    expect(readWizardSnapshot(storage)).toEqual(snap);
    clearWizardSnapshot(storage);
    expect(readWizardSnapshot(storage)).toBeNull();
  });

  it('persistWizardState escribe en curso y borra al completar', () => {
    const storage = fakeStorage();
    persistWizardState(midFlowState(), storage);
    expect(readWizardSnapshot(storage)?.step).toBe('zonaEntrega');
    persistWizardState(midFlowState({ step: 'resultado', wompiOutcome: 'approved' }), storage);
    expect(storage.data.has(WIZARD_STORAGE_KEY)).toBe(false);
  });

  it('JSON corrupto o gigante se ignora', () => {
    const storage = fakeStorage();
    storage.setItem(WIZARD_STORAGE_KEY, '{no json');
    expect(readWizardSnapshot(storage)).toBeNull();
    storage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ pad: 'x'.repeat(25_000) }));
    expect(readWizardSnapshot(storage)).toBeNull();
  });

  it('storage bloqueado (lanza) o ausente no rompe nada', () => {
    const snap = snapshotFromState(midFlowState())!;
    expect(() => writeWizardSnapshot(snap, throwingStorage)).not.toThrow();
    expect(() => clearWizardSnapshot(throwingStorage)).not.toThrow();
    expect(() => persistWizardState(midFlowState(), throwingStorage)).not.toThrow();
    expect(readWizardSnapshot(throwingStorage)).toBeNull();
    expect(readWizardSnapshot(null)).toBeNull();
    expect(() => writeWizardSnapshot(snap, null)).not.toThrow();
  });
});

describe('state/persist — elegibilidad de la restauracion', () => {
  const base: RestoreContext = { wompiReturn: false, hasFolio: false, search: '', hashStep: null, navigation: 'navigate' };

  it('llegada nueva sin hash ni deep link: no restaura', () => {
    expect(shouldRestoreWizard(base)).toBe(false);
  });

  it('reload o atras restauran', () => {
    expect(shouldRestoreWizard({ ...base, navigation: 'reload' })).toBe(true);
    expect(shouldRestoreWizard({ ...base, navigation: 'back_forward' })).toBe(true);
  });

  it('un hash que resuelve a un paso restaura aunque sea navegacion nueva', () => {
    expect(shouldRestoreWizard({ ...base, hashStep: 'zonaEntrega' })).toBe(true);
  });

  it('retorno de Wompi y ?folio= nunca restauran', () => {
    expect(shouldRestoreWizard({ ...base, wompiReturn: true, navigation: 'reload', hashStep: 'resultado' })).toBe(false);
    expect(shouldRestoreWizard({ ...base, hasFolio: true, navigation: 'reload' })).toBe(false);
  });

  it('deep link: gana en llegada nueva (aunque haya hash); reload o atras restauran', () => {
    const search = '?producto=recta&paso=medidas';
    expect(shouldRestoreWizard({ ...base, search })).toBe(false);
    expect(shouldRestoreWizard({ ...base, search, hashStep: 'medidas' })).toBe(false);
    expect(shouldRestoreWizard({ ...base, search, navigation: 'reload' })).toBe(true);
    expect(shouldRestoreWizard({ ...base, search, navigation: 'back_forward' })).toBe(true);
  });

  it('hasDeepLinkParams reconoce producto|paso|color|vidrio|oferta y nada mas', () => {
    for (const p of ['producto', 'paso', 'color', 'vidrio', 'oferta']) expect(hasDeepLinkParams(`?${p}=x`)).toBe(true);
    expect(hasDeepLinkParams('')).toBe(false);
    expect(hasDeepLinkParams('?utm_source=x&folio=1')).toBe(false);
  });

  it('restoreFields quita la version y resuelve el paso', () => {
    const snap = snapshotFromState(midFlowState({ step: 'resumen' }))!;
    const fields = restoreFields(snap, 'precio');
    expect(fields).not.toHaveProperty('v');
    expect(fields.step).toBe('precio');
  });

  it('restoredStep: hash gana al snapshot; wompi/resultado se llevan a formaPago', () => {
    const snap = snapshotFromState(midFlowState({ step: 'resumen' }))!;
    expect(restoredStep(null, snap)).toBe('resumen');
    expect(restoredStep('precio', snap)).toBe('precio');
    expect(restoredStep('wompi', snap)).toBe('formaPago');
    expect(restoredStep('resultado', snap)).toBe('formaPago');
  });
});
