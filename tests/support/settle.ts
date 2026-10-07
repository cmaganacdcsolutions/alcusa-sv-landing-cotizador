import type { Page } from '@playwright/test';

// Esperas deterministas para dos fuentes de carreras bajo carga (ambas son del TEST, no del producto):
//  - scroll suave: `html { scroll-behavior: smooth }` (Navbar.astro) + el efecto de Cotizador.tsx que desplaza la
//    ventana al encabezado de cada paso. Medir o hacer clic mientras la ventana todavia se mueve usa coordenadas
//    viejas (un clic `force` ni siquiera espera estabilidad).
//  - animaciones/transiciones CSS (fade-in de pasos y secciones): axe lee colores intermedios (contraste
//    transitorio) si corre a mitad de una transicion de opacidad.
// Ambas esperas estan acotadas por un plazo: si algo nunca se asienta, el test falla con un mensaje claro.

/** Cuadros consecutivos sin cambio que cuentan como "asentado" (1 cuadro puede ser un solo tick sin avance). */
const STABLE_FRAMES = 5;

/**
 * Espera a que la ventana deje de desplazarse: `scrollY` sin cambio durante STABLE_FRAMES cuadros de animacion
 * consecutivos. Medido en cuadros, no en ms: bajo carga el scroll suave avanza por cuadro, asi que la unidad
 * correcta es el cuadro.
 */
export async function waitForScrollSettled(page: Page, timeoutMs = 10_000): Promise<void> {
  await page.evaluate(
    ({ frames, timeout }) =>
      new Promise<void>((resolve, reject) => {
        const deadline = performance.now() + timeout;
        let last = Number.NaN;
        let stable = 0;
        const tick = (): void => {
          const y = window.scrollY;
          stable = y === last ? stable + 1 : 0;
          last = y;
          if (stable >= frames) return resolve();
          if (performance.now() > deadline) return reject(new Error(`scroll no se asento en ${timeout} ms (scrollY=${y})`));
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { frames: STABLE_FRAMES, timeout: timeoutMs },
  );
}

/**
 * Espera a que no quede ninguna animacion/transicion CSS finita en curso (`document.getAnimations()`), durante
 * STABLE_FRAMES cuadros seguidos (una transicion nueva puede arrancar un cuadro despues del cambio de estado).
 * Las animaciones infinitas (spinners, pulsos) se ignoran: nunca terminan y no son el fade que se quiere esperar.
 */
export async function waitForAnimationsSettled(page: Page, timeoutMs = 10_000): Promise<void> {
  await page.evaluate(
    ({ frames, timeout }) =>
      new Promise<void>((resolve, reject) => {
        const deadline = performance.now() + timeout;
        let calm = 0;
        const running = (): number =>
          document.getAnimations().filter((a) => {
            if (a.playState !== 'running') return false;
            const iterations = a.effect?.getComputedTiming().iterations;
            return iterations !== Number.POSITIVE_INFINITY;
          }).length;
        const tick = (): void => {
          calm = running() === 0 ? calm + 1 : 0;
          if (calm >= frames) return resolve();
          if (performance.now() > deadline) return reject(new Error(`${running()} animaciones siguen en curso tras ${timeout} ms`));
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { frames: STABLE_FRAMES, timeout: timeoutMs },
  );
}

/** Ambas: ventana quieta y sin transiciones en curso (antes de medir contraste o geometria). */
export async function waitForPageSettled(page: Page, timeoutMs = 10_000): Promise<void> {
  await waitForAnimationsSettled(page, timeoutMs);
  await waitForScrollSettled(page, timeoutMs);
}
