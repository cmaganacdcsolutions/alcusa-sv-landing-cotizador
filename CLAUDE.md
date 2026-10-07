# Alcusa landing + cotizador — reglas del proyecto

El cotizador se rompía seguido al agregar cambios. Estas reglas existen para que eso no pase.
Aplican a toda sesión y a todo sub-agente.

## Entorno
- **Node 24.** Todo comando `npm`/`npx` va con este prefijo:
  `export PATH="/c/Users/carlo/AppData/Roaming/fnm/node-versions/v24.21.0/installation:$PATH" && npm run ...`
- **Puertos.** `4400` es el dev server vivo del usuario: nunca usarlo, pararlo ni reiniciarlo.
  El e2e corre **solo** con `E2E_PORT=4410 npm run test:e2e` (usa también 4411 y 4412).
  Cualquier dev server de prueba/smoke va en `4420` (con `--ignore-lock`; nunca `--force`).
- **Nunca llamar `npx playwright test` directo para el e2e**: se salta `pretest:e2e` y prueba un `dist-e2e` viejo.
  Siempre `E2E_PORT=4410 npm run test:e2e -- <args>` (o `verify`/`verify:area`). El build e2e es por puerto
  (`dist-e2e/p<PUERTO>/`), así dos corridas en paralelo con puertos distintos no se pisan, y
  `playwright.config.ts` falla fuerte si el build es más viejo que `src/`/`public/`.
- Cada proceso tiene su propia caché Vite (`.vite-cache/<comando>-<puerto>`, ver `astro.config.mjs`); el dev server
  del usuario nunca comparte caché con builds ni con el smoke. Si un comando no pasa `--port`, usar `VITE_CACHE_DIR`.
- Nunca leer ni imprimir archivos `.env`.

## Regla de oro: no se reporta "listo" sin gate verde
1. **Toda feature terminada** corre, antes de reportar "listo" o de commitear:
   - `npm run verify:area -- <area>[,<area>]` por cada área que toca, **o**
   - `npm run verify` completo si hay duda o si tocó código compartido/layout
     (header, footer, `PhotoFrame`, carrusel, estilos globales, `astro.config`, `package.json`).
   - Áreas: `cotizador`, `home`, `promos`, `catalogo`, `contacto`, `layout`.
     `layout` arrastra todas las áreas. Para saber qué áreas toca un cambio: `npm run verify:suggest`.
2. **`npm run verify` completo es obligatorio antes de cada merge a `dev`.**
3. `git push` dispara el hook `pre-push` (`npm run verify:quick`). Se instala una vez con `npm run hooks:install`.
4. Un spec nuevo en `tests/e2e/` **debe** declararse en `tests/areas.json` (el gate falla si no).

## Qué hace cada comando
| Comando | Contenido | Cuándo |
|---|---|---|
| `npm run verify:quick` | lint, typecheck, unit, e2e `@critical` (desktop1920 + ios390) | pre-push, chequeo rápido |
| `npm run verify:area -- cotizador,promos` | lint, typecheck, unit, e2e de esas áreas (3 viewports, incluye golden y visuales), smoke dev de esas páginas | al terminar cada feature |
| `npm run verify` | lint, typecheck, unit, build, **todo** el e2e, smoke en `astro dev` (4420) | antes de merge a `dev` |

Qué protege (cada cosa ya se rompió antes):
- **Smoke en dev** (`tests/smoke`): falla con cualquier console error, pageerror, request fallido o imagen rota/0x0;
  exige que el wizard se renderice (tiles del paso 0, no solo el h1); camina un camino por familia hasta el resumen;
  cubre los 3 deep links de promo; y corre un `astro build` mientras el dev server está arriba (colisión de caché).
  Es lo que atrapa `_jsxDEV is not a function`.
- **Tabla dorada** (`tests/e2e/cotizador-golden.spec.ts`): precio, fotos y etiquetas de cada combinación alcanzable.
  "Por WhatsApp" es un valor esperado, no un fallo.
- **`@critical`** (`tests/e2e/critical.spec.ts` + tags en `cotizador.spec.ts` y `cotizador-combinaciones.spec.ts`):
  cada familia llega a precio, Aquafold $279.99 y las 3 promos, CTA de promo preselecciona vidrio,
  tile de asesor WhatsApp, foto del paso 2 no vacía, flechas del carrusel avanzan/vuelven al inicio, sin imágenes 0x0.
- **Visuales** (`visual-cotizador`, `visual-home`): baselines a 390 y 1920 en `tests/e2e/__snapshots__/`.

## Tests: prohibido debilitarlos
- **Nunca** debilitar, borrar, saltar (`skip`/`fixme`) ni relajar un test existente para que pase, ni subir
  tolerancias, ni dejar `test.only`, **sin aprobación explícita del usuario**. Si un test falla, se arregla el
  producto o se pregunta. No se pone nada en cuarentena en silencio: se reporta.
- **Actualizar baselines es una decisión intencional**: solo con `npm run test:visual:update` (visuales) o
  `npm run test:golden:update` (tabla dorada), explicando en el reporte qué diff cambió y por qué, y con
  aprobación del usuario. Nunca regenerar "para ponerlo en verde".
- Si el gate falla por un bug del producto, se reporta con repro; no se oculta con retries ni esperas.

## Sobre `src/`
- El server de dev comparte caché Vite con los gates; por eso `astro.config.mjs` ignora `dist/`, `coverage/`,
  `test-results/` y `playwright-report/`. Todo output nuevo de gates debe ir bajo esas rutas (el smoke usa
  `playwright-report/smoke`) para no tumbar el dev server del usuario.
