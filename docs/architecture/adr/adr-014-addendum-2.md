# ADR-014 Addendum 2: el cotizador resuelve promos desde el JSON publicado (una sola fuente de precio)

- Estado: **proposed**
- Fecha: 2026-10-09
- Enmienda: ADR-014, addendum 1, ADR-011 §4 y ADR-010 §3 (no se editan; donde hay conflicto, manda este addendum).
- Base: rama `dev` @ dbb309c.

## 1. Problema (verificado en el código)
- El home lee `/api/promotions.json` en runtime (`src/components/promotionsRuntime.ts`); el cotizador importa `@content/promotions.json` **en build** (`src/islands/Cotizador/state/promoRegistry.ts`, usado por `lookupActivePromo` y `lookupPromo`).
- `toPromoContext` (`src/content/promoContext.ts`) toma `price = p.ahora`; `computeQuote` (`state/quote.ts`) y `StraightForm.tsx` lo aplican. `pricingTables.ts` y `engine/pricing/straight.ts` **no** contienen precios de promo (solo contexto normal): el único punto a corregir es el registro.
- Efectos: (1) precio editado en el panel -> home nuevo, cotizador viejo ($290 vs $260 ya ocurrió); (2) promo nueva -> el CTA abre `?promo=<id>` y el cotizador no la conoce, cotiza sin promo.
- Server de cotizaciones: `promoId` solo sirve para negar el 10% de tarjeta (`server/src/modules/quotes/create-request.ts:46-47,220`). **No valida ni recalcula el precio de promo**; el monto lo manda el cliente. En dev `PUBLIC_QUOTE_API=mock`, no hay server. Deuda preexistente, no se resuelve aquí (§6, P3).

## 2. Opciones evaluadas
| | (a) Registro del cotizador hidratado desde el JSON runtime, build como respaldo | (b) Publicar dispara rebuild estático | (c) Copiar el JSON al build solo en cada deploy |
|---|---|---|---|
| Fuente única | Sí: home y cotizador leen el mismo archivo con el mismo parser | Sí, pero con retraso de minutos y ventana de desincronía | No: dos copias entre ediciones |
| Complejidad | Baja: 1 archivo FE + gate de arranque | Alta: worker, cola, swap de `dist/`, locks, fallos de build; choca con B2 del addendum 1 | Muy baja, no resuelve nada |
| Riesgo | Latencia/fallo del fetch (acotado con timeout y respaldo) | Un guardado puede dejar el sitio a medias; el cliente espera un build para ver su cambio | Falsa seguridad |
| Golden / `@critical` / Wompi / stash / smoke | Golden intacto (no toca `engine/pricing`); sin runtime, el respaldo = datos de hoy | Igual, más superficie de falla | -- |

## 3. Decisión: opción (a)
1. `promoRegistry.ts` mantiene el **build como semilla y respaldo** y expone `hydratePromoRegistry()`: pide `PROMOTIONS_ENDPOINT` (`cache:'no-cache'`, timeout **2500 ms**, vs 8000 del home), valida con `parsePromotions` + `isSafePromoImage` y **reemplaza** la lista en memoria. Ante cualquier falla (red, HTTP no-OK, JSON inválido, timeout) conserva la semilla y marca `source: 'build'`. Se memoiza: un solo fetch por carga de página.
2. `lookupActivePromo` / `lookupPromo` siguen **síncronas** y leen la lista vigente del registro; `computeQuote` y los componentes no cambian de firma.
3. **Gate de arranque**: `Cotizador.tsx` espera `hydratePromoRegistry()` antes del efecto de arranque que llama `lookupActivePromo(...)` (~línea 318: deep link, decisión `restoring`, stash, retorno Wompi/folio). Nunca se calcula un precio de promo antes de hidratar. Sin `?promo=` ni snapshot con `promoId` no se espera: se hidrata en segundo plano.
4. **Vigencia y tope**: `lookupActivePromo` filtra por `isActive` (hoy en SV) y el registro aplica `selectActivePromotions` (misma regla que el home, máx. 3 = `MAX_ACTIVE`). El servidor sigue garantizando el tope al publicar.
5. **`lookupPromo(id)` (snapshot/Wompi/stash, sin mirar vigencia)**: busca primero en el JSON runtime (el precio editado manda) y luego en la semilla del build. Si el id ya no está publicado (archivada/borrador) y no está en la semilla, devuelve `null`: la cotización pasa a contexto normal con el aviso existente `promo_expired`. Decisión conservadora: no se honra una promo que el panel retiró. Ver P2.
6. **Stash / RECOVER_WORK / ENTER_PROMO**: sin cambios. La promo que alimenta `ENTER_PROMO` ya viene del registro hidratado; el stash guarda carrito y snapshot, no precios.
7. **nginx** (runbook §11): `/api/promotions.json` ya es `no-cache` y el panel escribe con temp+rename (atómico). Sin cambios; solo verificar `Content-Type: application/json` y que dev sirva el archivo compartido.
8. **Sin cambios en BE ni en `engine/pricing`**.

## 4. Consecuencias
- Buenas: una fuente de precio sin pipeline nuevo; el cambio del panel se ve en el cotizador en la siguiente carga; si el runtime falla, degrada al comportamiento actual.
- Malas: una petición extra antes de resolver `?promo=` (hasta 2,5 s en el peor caso); si el runtime falla, home (HTML horneado) y cotizador (semilla) son coherentes entre sí pero ambos pueden mostrar precio viejo.
- Ventana residual: pestañas con JSON distinto o una cotización a medias con el precio anterior. Se acepta; el monto final lo confirma el servidor cuando exista cotización real (P3).
- Salida: si se justifica rebuild automático (SEO de promos), la opción (b) se añade **encima** sin deshacer esta.

## 5. Gate de revisión
- `git grep "@content/promotions.json" src/islands` solo en `promoRegistry.ts` (semilla) y tests.
- Ningún precio de promo en `engine/pricing` ni `pricingTables.ts`.
- Golden y `@critical` sin cambios en esperados; `promoContext.test.ts` pasa sin tocar sus expectativas.
- Sin `innerHTML`; imágenes validadas con `isSafePromoImage`.
- La slice FE no toca presentación ni transiciones del wizard (E5 de motion): solo `state/promoRegistry.ts`, el gate de arranque y tests.

## 6. Preguntas abiertas / decisiones del usuario
- P1. **"Archivar/borrar"**: v1.0 = archivar con Reactivar (addendum 1, D3). Recomendación: mantener; borrado físico a v1.1 (rompería el historial con `promoRef`). Confirmar con Alcusa.
  - **Decidido por el usuario (2026-10-09): P1 = solo archivar con Reactivar; no hay borrado definitivo en v1.0.**
- P2. **Promo archivada con cotización/pago en vuelo**: se trata como vencida (cotiza normal con aviso). Alternativa: guardar el precio de la promo en snapshot/cotización y honrarlo (toca `persist.ts`/`quoteDocument.ts`). Decidir antes de cobros reales.
- P3. **Validación server-side del precio de promo**: obligatoria antes de `PUBLIC_QUOTE_API=real`; registrar en `docs/architecture/tech-debt.md` con disparador "antes del primer cobro real".
- P4. **Tope de 3 y reactivar**: se mantiene "reactivar permitido, tope al publicar" (addendum 1 §4). Una 4ª publicada simplemente no aparece (ni en home ni en cotizador); confirmar que el usuario lo entiende.
