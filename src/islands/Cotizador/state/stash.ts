// Trabajo en curso apartado ("stash") cuando el cliente entra por un link `?promo=` mientras ya
// tenia una cotizacion armada en OTRO contexto. Antes se borraba en silencio; ahora se guarda
// aparte en sessionStorage (ambito de pestana, misma PII que el carrito/snapshot que ya existen)
// y el cotizador ofrece "Recuperarla". Se limpia al descartar, al recuperar o al completar la promo.
import type { CotizadorState } from './cotizadorStore';
import { parseWizardSnapshot, type StorageLike, type WizardSnapshot } from './persist';

export const STASH_STORAGE_KEY = 'alcusa-cotizador-stash';
const MAX_STASH_CHARS = 60_000;

export type WorkStash = { cart: CotizadorState['cart']; snapshot: WizardSnapshot | null };

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Hay algo que valga la pena apartar: carrito con items o snapshot de wizard. */
export function hasWork(cart: CotizadorState['cart'], snapshot: WizardSnapshot | null): boolean {
  return cart.length > 0 || snapshot !== null;
}

export function readStash(storage: StorageLike | null = defaultStorage()): WorkStash | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STASH_STORAGE_KEY);
    if (!raw || raw.length > MAX_STASH_CHARS) return null;
    const o = JSON.parse(raw) as { cart?: unknown; snapshot?: unknown } | null;
    if (!o || typeof o !== 'object') return null;
    const cart = Array.isArray(o.cart) ? (o.cart as CotizadorState['cart']) : [];
    const snapshot = o.snapshot ? parseWizardSnapshot(o.snapshot) : null;
    return hasWork(cart, snapshot) ? { cart, snapshot } : null;
  } catch {
    return null;
  }
}

export function writeStash(stash: WorkStash, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(STASH_STORAGE_KEY, JSON.stringify(stash));
  } catch {
    // modo privado / cuota: el aviso simplemente no aparece.
  }
}

export function clearStash(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(STASH_STORAGE_KEY);
  } catch {
    // nada que hacer
  }
}
