import type { Page } from '@playwright/test';

// "Entrega y zona" (Con instalacion) pide direccion completa: departamento -> municipio -> distrito
// + colonia, calle, referencia y telefono. Helper compartido por los specs que antes elegian
// solo el municipio con `#municipio`.
const DISTRITOS: Readonly<Record<string, readonly [departamento: string, municipio: string]>> = {
  Soyapango: ['San Salvador', 'San Salvador Este'],
  Apopa: ['San Salvador', 'San Salvador Oeste'],
  'San Salvador': ['San Salvador', 'San Salvador Centro'],
  'Santa Tecla': ['La Libertad', 'La Libertad Sur'],
  // Distrito sin tarifa automatica (estado vacio "Tu zona aun no tiene tarifa").
  'Santa Ana': ['Santa Ana', 'Santa Ana Centro'],
};

export const TEST_PHONE = '7123-4567';

export interface AddressFill {
  /** Salta los campos de texto/telefono (para probar que sin ellos no hay total). */
  onlyTerritory?: boolean;
  phone?: string;
}

export async function fillAddress(page: Page, distrito = 'Soyapango', opts: AddressFill = {}): Promise<void> {
  const place = DISTRITOS[distrito];
  if (!place) throw new Error(`fillAddress: distrito sin mapeo en tests/support/address.ts: ${distrito}`);
  await page.locator('#addr-departamento').selectOption({ label: place[0] });
  await page.locator('#addr-municipio').selectOption({ label: place[1] });
  await page.locator('#addr-distrito').selectOption({ label: distrito });
  if (opts.onlyTerritory) return;
  await page.locator('#addr-colonia').fill('Residencial Las Flores');
  await page.locator('#addr-calle').fill('Pasaje 3, casa 12');
  await page.locator('#addr-referencia').fill('frente a la iglesia, portón negro');
  await page.locator('#addr-telefono').fill(opts.phone ?? TEST_PHONE);
}
