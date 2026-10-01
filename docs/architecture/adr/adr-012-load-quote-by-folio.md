# ADR-012: Cargar una cotización por folio en el cotizador
> **Amended by ADR-013 (2026-10-01):** Nginx proxies `/api/quotes/{code}` to the Node service (not fastcgi to quote-load.php); B6 is slice N2 and the `quote-create` path is `/api/quote-create`. Contract and security unchanged. See ADR-013 §2.2 and §7.

- Estado: **proposed**
- Fecha: 2026-09-30
- Depende de: ADR-009 (§4 ya superado), ADR-010 §4 (folio), ADR-011 §5 (`quote-create`), ADR-003 (sobre de error)
- Nota (2026-09-30): ADR-010 y ADR-011 siguen como borradores sin commit. Las enmiendas de este ADR (§2 y §4) **ya se aplicaron** editando esos borradores (folio `{8}`, `CHAR(21)`, `config` completo, `config_schema_version`, `promo_ref`, lista blanca PHP). Además se corrigieron aquí: ejemplo de folio (el dígito de control correcto es `0`), marcador de contingencia `L`=>`U`, dinero en dólares decimales, y se añadió la captura de nombre + WhatsApp (ADR-011 §5), que **no cambia** el contrato de lectura.

## 1. Contexto y decisión

Requisito (Carlos, 2026-09-30): al inicio del cotizador, un campo "¿Ya tienes una cotización? Ingresa tu código para cargarla". El cliente escribe su folio y la cotización se carga.

Hechos del código actual: el carrito es `CotizadorState.cart: CartItem[]`, una foto por ítem con las claves de `ITEM_FIELD_KEYS` (producto, medidas, color, vidrio, filas de ventana, etc.). Ya existe `EDIT_ITEM`, y el carrito se persiste en `sessionStorage`. El motor de precios es TypeScript en el cliente (ADR-008/009), no existe en el servidor (ADR-011 §5).

**Decisión.**
1. Nuevo endpoint de solo lectura `GET /api/quotes/{code}` que devuelve ítems, configuración, totales guardados, folio y fechas. **Nunca** nombre, WhatsApp, email ni dirección. (Desde 2026-09-30 toda cotización guarda `customer_name` y `customer_whatsapp` porque se piden antes de generar el PDF; `GET /api/quotes/{code}` **sigue sin devolver PII**, confirmado. Cargar una cotización no rellena el mini formulario: lo reabre vacío, o con lo que esa misma pestaña ya tenga en `sessionStorage`.)
2. Al cargar, el cliente reconstruye `cart` (editable con las acciones existentes), **recalcula precios localmente** con catálogo y `promotions.json` vigentes, y muestra un aviso con lo que cambió.
3. Cotización vencida: carga igual, con marca "precios actualizados". Vigencia = 15 días (`QUOTE_VALIDITY_DAYS`, **pendiente de confirmar por el cliente**; es una constante de configuración, no un literal).
4. Se adopta sin cambios el default del Foreman, con una excepción: **410 se descarta** (ver §3).
5. El folio deja de ser solo "referencia" y pasa a ser una **llave de consulta**. ADR-010 §4 decía "30 bits bastan porque no hay endpoint público"; esa premisa cae. Se sube la entropía (§4).

## 2. Dónde se persiste la cotización

**Sin cambio de momento**: ADR-011 §5 ya persiste con `POST /api/quote-create.php` en el paso Resumen, en la primera acción saliente (Descargar PDF / WhatsApp / Pagar) y con datos completos. Se mantiene: guardar en cada cambio o al entrar al Resumen llenaría la BD de borradores sin cliente, y no hay folio que dar antes de tener contacto. Consecuencia asumida: solo se puede recargar una cotización que ya salió del Resumen. Lo que el cliente tiene en mano (PDF/WhatsApp) siempre tiene folio de servidor, salvo el folio de contingencia (sufijo que empieza con `U`), que **no existe en BD y no se puede cargar**.

**Delta contra ADR-010 / ADR-011** (lo que falta para que la carga funcione):

| Tabla.columna | ADR-010/011 | Cambio |
|---|---|---|
| `quotes.code` | `CHAR(17)`, `ALC-AAAAMMDD-XXXXXX` | `CHAR(21)` (4+8+1+8), `ALC-AAAAMMDD-` + 8 chars (§4). Regex de archivo de ADR-009/011 pasa de `{6}` a `{8}`. **Aplicado a ADR-010/011.** |
| `quote_items.config` | JSON "lo que produzca el cotizador" | **Debe ser el snapshot completo del `CartItem`** (todas las claves de `ITEM_FIELD_KEYS`, sin `id`). Sin esto no hay forma de restaurar el ítem editable; `description` solo sirve para mostrar. |
| `quote_items.config_schema_version` | no existe | `SMALLINT NOT NULL DEFAULT 1`. Sube cuando cambie `ITEM_FIELD_KEYS`; el FE marca "no se puede cargar" lo que no entienda. |
| `quote_items.promo_ref` | no existe | `VARCHAR(60) NULL`: id de la promoción aplicada a la línea (para detectar "promo vencida" al recalcular). |
| `quotes.customer_name` / `customer_whatsapp` | no estaban en la respuesta | Existen (ADR-010 §3) pero **no se seleccionan** en `quote-load`: el SELECT es explícito y el test de contrato falla si aparecen. |
| `quotes.delivery_mode` / `delivery_zone` | `pickup\|delivery` / zona | Sin cambio de esquema. Mapeo FE: `instalacion` <-> `delivery`, `retiro` <-> `pickup`. `delivery_address` **no se devuelve**. |
| `quotes.supersedes_quote_id` | existe | Se usa: si el cliente edita una cotización cargada y genera PDF, `quote-create` recibe `supersedesCode` opcional y crea una **cotización nueva** enlazada. **No se modifica el estado de la original** (cualquiera con un folio podría invalidar la cotización ajena). |
| Índices | `code UNIQUE` | Suficiente para la búsqueda. |

Tareas derivadas: D1 incluye las columnas; B3/F2 envían y validan `config` completo, `configSchemaVersion`, `promoRef` y `supersedesCode`.

## 3. Contrato

**Elegido: `GET`.** La consulta es idempotente y sin efectos; el folio no es PII ni secreto de alto valor (§4) y ya viaja en PDF/WhatsApp; POST no aporta higiene real de enumeración. Con GET se responde `Cache-Control: no-store` para que ningún intermediario guarde la respuesta.

Nginx: `location ~ ^/api/quotes/([^/]{1,40})$` con `fastcgi` a `quote-load.php` (script fijo, folio como parámetro). Cualquier otra ruta bajo `/api/quotes/` = 404 sin tocar PHP. Se suma a la lista blanca de ADR-011 §9. `limit_req` propio (§4).

**Request:** `GET /api/quotes/ALC-20260930-K7QM3X90` (el cliente ya normalizó, §5; el servidor normaliza otra vez y no confía en el cliente).

**200 OK**
```ts
// src/integrations/quotes/types.ts
export interface QuoteLoadItem {
  position: number;
  productSlug: string;
  description: string;           // solo para mostrar; la verdad es `config`
  qty: number;
  savedUnitPrice: number;        // USD, lo que vio el cliente
  savedLineTotal: number;
  promoRef: string | null;
  configSchemaVersion: number;
  config: Record<string, unknown>; // CartItemFields sin `id`; el FE valida con un parser antes de despachar
}
export interface QuoteLoadResponse {
  code: string;                  // folio canónico
  createdAt: string;             // 'YYYY-MM-DD' (fecha SV)
  validUntil: string;            // 'YYYY-MM-DD'
  expired: boolean;              // calculado en servidor con la fecha SV, no con `status`
  currency: 'USD';
  delivery: { mode: 'pickup' | 'delivery'; zone: string | null };
  items: QuoteLoadItem[];
  saved: { subtotal: number; transportFee: number; total: number };
}
export type QuoteLoadErrorCode =
  | 'invalid_code' | 'not_found' | 'rate_limited' | 'server_error';
export interface QuoteLoadError { error: { code: QuoteLoadErrorCode; message: string } }
```
**Convención de dinero fijada (2026-09-30)**: dólares decimales con máx. 2 decimales (`19.99`), NO centavos enteros, igual en `quote-create` (ADR-011 §5) y aquí. El servidor guarda `DECIMAL(10,2)` y compara sumas en centavos internamente; B3 y B6 lo aplican igual.

**Errores** (sobre de ADR-003, mensaje en español):

| HTTP | `error.code` | Cuándo |
|---|---|---|
| 404 | `not_found` | No existe, está `cancelled`, o pasó de `LOAD_MAX_AGE_DAYS` (supuesto: 90 días desde `created_at`), o es un folio de contingencia. **Mismo cuerpo, mismas cabeceras y mismo camino de consulta** en todos los casos. |
| 422 | `invalid_code` | Formato o dígito verificador inválido. No consulta la BD, así que no revela existencia. |
| 429 | `rate_limited` | Ver §4. Incluye `Retry-After`. |
| 500/503 | `server_error` | BD caída. Sin detalles. |
| ~~410~~ | descartado | Una cotización vencida **sí carga** (200 con `expired:true`), y una cancelada debe ser indistinguible de una inexistente. 410 solo serviría de oráculo de existencia. |

**Recalculo (cliente).** `applyLoadedQuote(res)`: (1) parsea cada `config` (descarta el ítem con motivo `discontinued` si el `productSlug` ya no está en el catálogo, o `unsupported` si la versión o alguna opción ya no existe); (2) `dispatch({type:'LOAD_QUOTE', items, delivery})` reemplaza `cart` con ids nuevos y fija `entrega`/`zone`; el reducer deja `current` vacío y va a `resumen`, donde `EDIT_ITEM` funciona igual que hoy (verificar en FE que `buildOrderItems` no exige un ítem "current"); (3) recalcula con el motor actual y compara contra `savedLineTotal`/`saved.total`; (4) genera la lista de cambios: `price_changed` (línea, antes -> ahora), `promo_expired` (tenía `promoRef` y ya no aplica), `promo_new` (opcional), `discontinued`, `unsupported`. Guarda `loadedFromCode` en `sessionStorage` para enviar `supersedesCode` después.

## 4. Seguridad

**Entropía.** Con 6 chars no alcanza: espacio por día 32^6 ≈ 1.07e9 (30 bits), la fecha es adivinable y las cotizaciones vivas abarcan ~15 días (más el margen de 90). Con un supuesto de 200 cotizaciones/día y ~90 días cargables, hay ~18,000 objetivos; por intento acierta ~18,000 / (90 x 1.07e9) ≈ 1.9e-7. A 14,400 intentos/día por IP (10/min) da ~0.3% de encontrar *alguno* por IP y día, y sube con una red de IPs. Con datos de baja sensibilidad (sin PII) es tolerable, pero un buscador de cotizaciones ajenas revela medidas, productos y precios de otros clientes.

**Corrección (enmienda a ADR-010 §4, cero migración porque aún es borrador):** sufijo de **8 chars Crockford base32 = 7 aleatorios (35 bits) + 1 de control**. Folio: `ALC-20260930-K7QM3X90`, mostrado agrupado `ALC-20260930-K7QM-3X90`. Con 35 bits, el mismo cálculo da ~6e-9 por intento y ~1e-4 por IP y año a 10/min: enumeración inviable. Sigue siendo dictable por teléfono (alfabeto sin I, L, O, U; agrupado en 4+4).
- **Dígito verificador**: `check = ALPHABET[ (Σ v_i * (i+1)) mod 31 ]`, i = 0..6 sobre los 7 chars aleatorios, `v_i` = índice en el alfabeto (0..31). Módulo primo con pesos invertibles: detecta todo error de un carácter y toda transposición adyacente. Sirve para dar error inmediato en el FE (sin viaje al servidor) y para rechazar barato en el servidor (422 sin BD). No aporta seguridad frente a enumeración; la aporta la entropía y el rate limit.
- Folio de contingencia (sufijo con `U` inicial, `ALC-AAAAMMDD-U???????`): el FE lo reconoce **localmente** y no consulta (ver §6). `U` se eligió porque no existe en el alfabeto, ninguna regla de normalización lo corrige y no hay carácter que se confunda con él al teclear; el marcador anterior `L` chocaba con el mapeo `l`->`1` (un folio real cuyo primer carácter es `1` tecleado como `l` se habría tomado por contingencia). Un folio con `U` al inicio se clasifica como contingencia **antes** de validar el dígito de control; el servidor responde 422 `invalid_code` si le llega uno.
- **Vectores normativos**: B3 (generador) y B6 (validador PHP) se fijan a los vectores de `src/integrations/quotes/code.test.ts` (rama `r5-cotizador`, líneas 12-50: `K7QM3X9` => suma 434 => check `0` => `ALC-20260930-K7QM3X90`, mostrado `ALC-20260930-K7QM-3X90`). El ejemplo anterior de este ADR (`...3X9T`) no cumplía su propia fórmula.
- Si Carlos prefiere no cambiar a 8 chars, el mínimo aceptable es mantener 6 más dígito de control + los límites de abajo, sabiendo que el riesgo residual es el de arriba.

**Otros controles**
- **Rate limit por IP**: Nginx `limit_req` 10 req/min por IP, burst 5, zona propia `quote_load`. En la app (`rate_limits`, por `ip_hash`): 30 consultas/hora y **10 fallos (404/422) por hora**; al excederse, 429 con `Retry-After`. Umbral de fallos generoso para no castigar a quien se equivoca al teclear un par de veces.
- **404 uniforme**: inexistente, cancelada y demasiado antigua usan la misma consulta única, el mismo cuerpo y tiempo comparable (sin ramas de texto). Sin `Set-Cookie`, sin ETag.
- **Sin PII** en la respuesta: la lista de columnas se arma explícita en el SELECT (nunca `SELECT *`) y hay un test de contrato que falla si aparece `customer_*` o `delivery_address`.
- **Sin escrituras en GET.**
- **Logs**: JSON, `event=quote_load`, `result` (`ok|not_found|invalid|rate_limited`), `ip_hash`, `latency_ms`, `code_hash` (primeros 12 hex de SHA-256). No se registra el folio en claro ni la IP. Métrica: consultas/hora, ratio de fallos; **alarma** si fallos globales >50/hora (señal de barrido).
- **Alcance de la exposición**: quien tenga el folio ve ítems y precios de esa cotización; se acepta porque el folio es lo que el cliente ya recibió por PDF/WhatsApp. Si en el futuro se muestra estado de pago o datos de contacto: **no** con folio solo (ADR-010 §4), ADR nuevo.
- **CSP**: sin cambio. Es la misma origen (`connect-src 'self'`), sin recursos externos nuevos.
- **Deep link**: el folio queda en la URL; `Referrer-Policy: no-referrer` en esa página y el FE la limpia con `history.replaceState` tras leerla.

## 5. Normalización de entrada y deep link

**Normalización** (función pura `normalizeQuoteCode`, mismas reglas en TS y PHP, con la misma batería de pruebas):
1. `trim`, mayúsculas, quitar espacios, guiones, guiones bajos y puntos.
2. Mapeo Crockford solo en la parte del sufijo (8 chars): `O`->`0`, `I`/`L`->`1`. (`U` no existe en el alfabeto: no se corrige; un sufijo que empieza con `U` es un folio de contingencia, §4.)
3. Aceptar con o sin el prefijo `ALC` y con o sin la fecha *solo si están completos*; es decir `ALC20260930K7QM3X90`, `20260930-K7QM-3X90` y `alc 20260930 k7qm 3x9t` se aceptan. Sufijo solo, sin fecha: **no** se acepta (el servidor no adivina la fecha).
4. Salida canónica `ALC-AAAAMMDD-XXXXXXXX`; validar fecha real y dígito verificador. Si la fecha es futura o anterior a `LOAD_MAX_AGE_DAYS`, es formato inválido (sin consulta).
5. Al pegar texto largo (mensaje de WhatsApp completo), buscar con regex la primera coincidencia de folio dentro del texto.

**Deep link `/cotizador?folio=...`: SÍ.** Razones: es lo que hace útil el folio desde WhatsApp ("Retoma tu cotización: <enlace>"), funciona en sitio estático (se lee en el isla con `URLSearchParams`), y no agrega superficie de servidor. Reglas: se procesa una vez, no reemplaza un carrito con ítems sin confirmación (§6 "carrito con productos"), se limpia la URL después, y sigue los mismos controles de rate limit. Agregarlo al texto de WhatsApp/PDF es opcional y **cuesta ~55 caracteres del presupuesto de 1,800** de ADR-009: decidirlo en F2, no aquí.

## 6. Estados de UI para diseño

Ubicación: paso 0 (Producto), sobre la lista de productos, como bloque compacto plegado por defecto en móvil. Campo con etiqueta visible (no solo placeholder), botón "Cargar", `inputmode="text"`, `autocapitalize="characters"`, `autocomplete="off"`, `spellcheck="false"`. Errores en texto con icono, nunca solo color.

1. **Vacío** — Título: "¿Ya tienes una cotización?" · Ayuda: "Ingresa tu código para cargarla. Lo encuentras en tu PDF o en el mensaje de WhatsApp." · Placeholder: `ALC-20260930-K7QM-3X90` · Botón: "Cargar cotización" (deshabilitado hasta que el formato sea válido).
2. **Escribiendo / formato inválido** — Mientras escribe (sin error hasta salir del campo o pulsar Cargar): el campo aplica mayúsculas y agrupa solo. Al salir con formato incompleto: "El código está incompleto. Debe verse así: ALC-20260930-K7QM-3X90". Con dígito verificador malo: "Revisa el código: parece que hay un carácter equivocado." Con folio de contingencia (`L` inicial): "Esta cotización se generó sin conexión y no quedó guardada. Escríbenos por WhatsApp y te ayudamos."
3. **Cargando** — Botón: "Cargando…" (deshabilitado, con indicador) · Región `aria-live`: "Buscando tu cotización…"
4. **Cargada (con aviso de cambios)** — Éxito sin cambios: "Cotización ALC-20260930-K7QM-3X90 cargada. Puedes revisarla y editarla." Con cambios: título "Actualizamos tu cotización" · "Algunos precios cambiaron desde el {createdAt}. Revisa el detalle antes de continuar." · Lista, una línea por cambio: "{Producto}: antes ${antes}, ahora ${ahora}." / "{Producto}: la promoción ya no está vigente." / "{Producto}: ya no está disponible y se quitó de tu cotización." / "{Producto}: cambió una de sus opciones y hay que configurarlo de nuevo." · Pie: "Total anterior ${x} · Total actual ${y}" · Botón: "Entendido". Se muestra en el Resumen, persistente hasta cerrarlo.
5. **No encontrado** — "No encontramos una cotización con ese código. Revisa que esté completo o escríbenos por WhatsApp." (mismo texto para inexistente, cancelada y muy antigua).
6. **Vencida** — Cargó, con banda de aviso: "Esta cotización venció el {validUntil}. Cargamos tus productos con los precios de hoy." · Etiqueta junto al total: "Precios actualizados".
7. **Límite de intentos** — "Hiciste demasiados intentos. Espera unos minutos y vuelve a probar." (con `Retry-After`: "Vuelve a intentarlo en {n} min."). Botón deshabilitado durante la espera.
8. **Sin conexión / error** — "No pudimos consultar tu cotización. Revisa tu conexión e inténtalo de nuevo." · Botones "Reintentar" y "Empezar una nueva". Con `server_error`: "Estamos teniendo un problema de nuestro lado. Inténtalo en unos minutos o escríbenos por WhatsApp."
9. **Carrito con productos (extra, necesario)** — Antes de reemplazar: "Ya tienes productos en tu cotización actual. Si cargas la anterior, se reemplazarán." · Botones "Reemplazar" / "Cancelar".
10. **Enlace directo** (`?folio=`): estado 3 automático al abrir; si falla, se muestra el estado correspondiente con el campo prellenado.

## 7. Slice para el backlog

Nombre: **slice Q-LOAD** (una rebanada de valor, tres dueños).

**Dependencias (ADR-011):** D0 (ubicación Nginx, zona `limit_req` `quote_load`, lista blanca, BD lista) · D1 (esquema con el delta de §2) · B1 solo el esqueleto `app/src` (Config, Db, Http, Logger) y `rate_limits` · **B3** (`quote-create` debe persistir `config` completo, `promo_ref`, `config_schema_version` y aceptar `supersedesCode`; sin B3 no hay nada que cargar) · **F2** (módulo cliente del folio y `sessionStorage`; F4 reutiliza su cliente HTTP y sobre de error). No depende de B2/F1/B4/B5.
Orden: D0 -> D1 -> B1 -> B3 -> (B6 || F4) -> Q2. F4 puede avanzar antes contra un mock del contrato (`QuoteLoadResponse`) sin esperar a B6.

| ID | Dueño | Tarea | Criterios de aceptación |
|---|---|---|---|
| D1+ | senior-dba | Añadir el delta de §2 a `0001_init.sql`; `code CHAR(21)` | Migración reversible; coincide con este ADR; ADR-010 actualizado (tabla y §4). |
| B3+ | senior-be | `quote-create` (contrato final en ADR-011 §5, incluido nombre + WhatsApp + consentimiento) guarda snapshot completo + `promo_ref` + versión; `supersedesCode`; generador de folio de 7 + 1 chars; validación de `config` contra la versión | Folio `^ALC-\d{8}-[0-9A-HJKMNP-TV-Z]{8}$` con dígito verificador válido; reintento por colisión; `supersedesCode` inexistente se ignora sin error y no cambia la original. |
| B6 | senior-be | `quote-load.php`: ubicación Nginx, normalización, verificación, consulta única, serialización explícita, rate limits, logs, métricas | 200 con el JSON de §3; 404 idéntico (cuerpo/cabeceras) para inexistente, cancelada, >90 días y contingencia; 422 sin tocar BD; 429 con `Retry-After` tras 10 fallos/hora/IP; `Cache-Control: no-store`; **ninguna** columna `customer_*` ni `delivery_address` en la respuesta ni en logs; `expired` calculado por fecha SV; sin escrituras en GET. |
| F4 | fe-senior-react | Bloque de carga en paso 0; `normalizeQuoteCode` + verificador; cliente `getQuote`; acción `LOAD_QUOTE`; recalculo y aviso; deep link `?folio=` con `replaceState`; estados de §6 | Reutiliza `EDIT_ITEM` sin duplicar lógica; los 10 estados de §6 con el texto exacto; precios recalculados (nunca se usan los guardados para cobrar); ítem con `config` desconocido no rompe el cotizador; carrito existente pide confirmación; `loadedFromCode` viaja como `supersedesCode`; sin datos de cliente **provenientes del servidor** en el estado ni en `sessionStorage` (los que el usuario teclea en el mini formulario de ADR-011 §5 viven en `sessionStorage` de la pestaña y no los toca la carga); cargar una cotización no rellena nombre ni WhatsApp; JS extra ≤ 3 KB gzip; accesible (`aria-live`, foco, errores no solo por color). |
| Q2 | senior-qa | Pruebas de §4 | Unitarias de `normalizeQuoteCode` iguales en TS y PHP (O/0, I/1/L, espacios, guiones, minúsculas, pegado de mensaje, fecha futura); contrato: la respuesta no contiene PII (test que falla si se agrega una columna sensible); enumeración: 11 folios con formato válido pero inexistentes desde una IP -> 429; 404 uniforme y tiempo comparable entre inexistente y cancelada; ida y vuelta: crear en Resumen -> recargar -> mismos ítems editables; precio cambiado / promo vencida / producto retirado -> aviso correcto; vencida -> `expired` y etiqueta; offline -> estado 8. |

## Alternativas consideradas
- **Guardar el borrador en cada paso** para poder retomar: más filas basura, sin contacto para identificar al dueño, sin folio hasta el Resumen. Descartado.
- **Cargar con folio + últimos 4 dígitos del teléfono** (opción de ADR-010): mejor para datos personales, pero la respuesta no lleva PII y el usuario ya tiene el folio impreso; añade fricción. Se reserva para cuando se muestre estado de pago o contacto.
- **POST en lugar de GET**: sin ventaja real de higiene aquí. Descartado.
- **Servidor recalcula precios**: no existe motor en el servidor (tech-debt de ADR-011 §5). Se recalcula en el cliente.
- **Devolver 410 para vencidas**: contradice "vencida carga igual" y actúa de oráculo. Descartado.

## Consecuencias
- Bueno: retomar una cotización sin backend nuevo de precios; el aviso de cambios evita sorpresas; sin PII expuesta; enumeración inviable con 35 bits y límites.
- Malo: solo cotizaciones que pasaron por el Resumen; el folio pasa a 8 chars (más largo de dictar; se mitiga con agrupado 4+4 y dígito verificador); `config` queda acoplado a `ITEM_FIELD_KEYS` (cada cambio de campos exige subir `config_schema_version` y un migrador en el FE); el recalculo depende del cliente, así que la "verdad" de precio sigue sin ser del servidor.
- Salida: si se añade motor de precios en servidor, `quote-load` puede devolver precios vigentes y el aviso se calcula allí.

## Preguntas abiertas para el cliente
1. Confirmar la vigencia de 15 días.
2. ¿Hasta cuándo se puede recargar una cotización vencida? (supuesto: 90 días desde su creación).
3. ¿Incluir el enlace `?folio=` en el mensaje de WhatsApp y en el PDF?
