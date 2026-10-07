import type { Page } from '@playwright/test';

/**
 * Resuelve un token de color de `src/styles/tokens.css` (p. ej. `--color-accent-on-dark`) al valor que el navegador
 * calcula (`rgb(r, g, b)`), leyendo el CSS real de la pagina. Los specs lo usan en vez de fijar el hex a mano: si el
 * valor del token cambia, el spec sigue verificando "el elemento usa ESE token", no un color que se quedo viejo.
 */
export async function colorToken(page: Page, name: `--${string}`): Promise<string> {
  return page.evaluate((token) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${token})`;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }, name);
}
