import type { Page } from '@playwright/test';

// "Entrega y zona" (Con instalacion): un dropdown "Ubicacion / zona de cobertura" (nombre + precio de envio)
// y luego colonia, calle, referencia y telefono. Helper compartido por los specs que llegan al total.
// `zone` es la clave de la tabla de transporte; 'Santa Ana' es un alias de "Otra zona" (sin tarifa automatica,
// estado vacio "Tu zona aun no tiene tarifa").
const OTHER_ZONE_ALIAS: Readonly<Record<string, string>> = { 'Santa Ana': 'otro' };

export const TEST_PHONE = '7123-4567';

export interface AddressFill {
  /** Salta los campos de texto/telefono (para probar que sin ellos no hay total). */
  onlyZone?: boolean;
  phone?: string;
}

export async function fillAddress(page: Page, zone = 'Soyapango', opts: AddressFill = {}): Promise<void> {
  await page.locator('#addr-zona').selectOption({ value: OTHER_ZONE_ALIAS[zone] ?? zone });
  if (opts.onlyZone) return;
  await page.locator('#addr-colonia').fill('Residencial Las Flores');
  await page.locator('#addr-calle').fill('Pasaje 3, casa 12');
  await page.locator('#addr-referencia').fill('frente a la iglesia, portón negro');
  await page.locator('#addr-telefono').fill(opts.phone ?? TEST_PHONE);
}
