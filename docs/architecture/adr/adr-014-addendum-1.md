# ADR-014 Addendum 1: precios editables, archivar/reactivar y veredictos de la fase 1 (admin v1.0)

- Estado: **proposed** (se acepta junto con ADR-014)
- Fecha: 2026-10-06
- Enmienda: ADR-014 (no se edita el original; donde hay conflicto, **manda este addendum**).
- Revisado: rama `admin-v1`, commits f9fd329 (S1) y 7b712a5 (adaptadores MariaDB, archivar/reactivar, persistencia, smoke de navegador). Código en `server/`.

## 1. Decisiones del usuario (2026-10-06) que el ADR absorbe

| # | Decisión | Efecto sobre ADR-014 |
|---|---|---|
| D1 | Precios de promo editables | Ya implementado (`price_before`/`price_promo`). Sustituye §3.6 "el admin NO edita precios" **solo para promos**. |
| D2 | Precios de producto editables: `price_from` opcional + `show_price` | **Supersede §2 fila 5 y §3.6 ("fromPrice no se almacena")**. Ver §2. |
| D3 | Eliminar promo -> **archivar**, con **Reactivar** que devuelve a borrador | Alinea §3.6 ("Baja = archivar"); `ck_promotions_status` ya admite `archived`; sin DDL. |
| D4 | MariaDB local instalada para pruebas de persistencia | Los tests de persistencia corren contra MariaDB real (`ADMIN_STORE=mariadb`); `file` queda solo para pruebas rápidas. |

### 2. Precios de producto (supersede parcial de ADR-014 §3.6)
- Migración `0004_products.sql` incluye `price_from DECIMAL(7,2) NULL` (1.00-99,999.99; CHECK `price_from IS NULL OR price_from BETWEEN 1 AND 99999.99`) y `show_price TINYINT(1) NOT NULL DEFAULT 0` (CHECK `show_price = 0 OR price_from IS NOT NULL`).
- **Alcance**: precio de **referencia de marketing** ("Desde $X"). **Excluidas las tablas por medida/vidrio del cotizador** (`pricingTables.ts`, `src/engine/pricing/*`): siguen en código con sus tests. El admin nunca modifica una cotización ni un cobro Wompi.
- Consecuencia asumida: el "Desde" puede divergir del precio que calcula el cotizador. Mitigación: la copia de la UI lo llama "precio de referencia"; la semilla (`seed-catalog`) importa el `fromPrice` literal actual como `price_from`, `show_price=1`, y el test de paridad contra el motor pasa a verificar **solo la semilla**, no el valor editado.
- La numeración de ADR-014 §3.6 (`0003_products.sql`) queda corrida: **`0003` ya es `promotions_alt_300`; productos es `0004`**.
- `advisor_only` siempre muestra CTA "Cotizar por WhatsApp" aunque tenga precio visible (propuesta de la spec, pregunta 2: **adoptada por defecto** salvo que Carlos diga lo contrario).
- Cambiar `price_from`/`show_price` cuenta como "cambio sin publicar" y requiere "Publicar catálogo" (a diferencia de promos, que publican al guardar).

## 3. Veredictos de las desviaciones reportadas

| # | Desviación | Veredicto | Razón y condiciones |
|---|---|---|---|
| 1 | `promotions.json` se regenera en cada guardado, sin timer de 15 min | **ACEPTAR + seguimiento** | Es lo que ADR-014 §2a ya decía ("regenerado al guardar"); el timer era red de seguridad. Condición: la regeneración debe ocurrir **dentro del lock de publicación** (hoy `republish()` corre fuera para guardar/archivar/reactivar: dos regeneraciones concurrentes pueden dejar un JSON viejo). El timer pasa a "reconciliador" opcional en D0 (re-exporta desde BD cada 15 min y compara). |
| 2 | Sin sesión: redirección a `/login` en vez de 404 uniforme | **ACEPTAR (acotado)** | El `/login` ya es público bajo la ruta secreta, así que el 303 no revela nada nuevo. El 404 uniforme se conserva para: todo lo que no esté bajo `ADMIN_BASE_PATH`, `/media/promos/*` sin sesión, rutas MFA reservadas, y la allowlist de IP. Actualiza ADR-011 §1 en ese sentido. |
| 3 | Imágenes de promo 600/900 en vez de 400/800/1200 | **ACEPTAR** | 600/900 son las variantes que el sitio realmente consume (`promo-N-600/900.webp`); 3 anchos eran de ADR-011 con GD, superado. Productos: **800/1200** se mantiene (ADR-014 §3.5.3). |
| 4 | Lista cerrada de slugs en `schema.ts`, verificada contra `catalog.ts` por test | **ACEPTAR solo para promos v1; CAMBIAR en Productos** | Con la tabla `products`, `slugExists` debe consultar `products` (publicados) como exige ADR-014 §3.6, no una lista en código. La lista y su test se retiran en la slice Productos. El test de paridad pasa a usar el `parsePromotions` real del sitio sobre documentos generados (hoy es un espejo copiado a mano; el comentario de `schema.ts` apunta a un `promo-schema.test.ts` que no existe). |
| 5 | `Origin: null` aceptado solo con `Sec-Fetch-Site: same-origin` | **ACEPTAR (revisión de seguridad hecha)** | Correcto: bajo `Referrer-Policy: no-referrer` el estándar Fetch serializa `Origin: null` en POST del mismo origen. `Sec-Fetch-Site` es cabecera prohibida (JS no puede falsearla); un iframe con sandbox o `data:` envía `Origin: null` **y** `cross-site`, que se rechaza (hay test). El token CSRF por sesión sigue siendo obligatorio y la cookie es `SameSite=Strict`. Condiciones: (a) detrás de Nginx la comparación `Origin.host === Host` exige `proxy_set_header Host $host` (D0 debe probarlo); (b) para POST autenticados, **endurecer** a: `Sec-Fetch-Site` ausente solo se tolera si hay `Origin` válido igual al host (hoy sin ambos headers pasa); `none` no es válido en POST. Seguimiento, no bloqueante porque el token CSRF cubre. |
| 6 | Migración 0003 ensancha `image_alt` a 300 | **ACEPTAR** | Alinea columna y validador (`validateAdminLimits`). **Spec A11 dice 5-160 para productos**: no hay conflicto, productos nuevos nacen con VARCHAR(160); promos conservan 300. Aviso: unificar el límite (160) en el formulario de promos es deuda menor. |
| 7 | DATETIME con precisión de segundo | **ACEPTAR** | Suficiente (<50 acciones/día). Efecto a conocer: `updated_at` de segundo no sirve como token de concurrencia optimista (la spec A11 lo pide): usar columna `version INT` o `updated_at DATETIME(3)` en `products` (ver plan). |
| 8 | Sin rate limit en `/login` ni allowlist de IP | **ACEPTAR como diferido, con gate** | Nada está desplegado. Gate de D0 (no negociable): `limit_req` 5/min/IP en login y 60/min/IP en la ruta + allowlist opcional (404) + fail2ban. El bloqueo por usuario (5 fallos -> 1/5/15/60 min) ya existe y persiste. Riesgo conocido: sin límite por IP, la respuesta 429 de "bloqueado" distingue usuarios existentes de inexistentes (enumeración); se cierra en D0 o respondiendo 401 genérico durante el bloqueo. |

## 4. Hallazgos de la revisión (resumen; detalle en el informe de revisión)

**Bloqueantes antes de Productos**
- B1. **Subida multipart sin autenticar**: `@fastify/multipart` con `attachFieldsToBody` parsea y guarda en memoria hasta 5 MB **antes** de que el handler llame `guardPost`. Un anónimo puede forzar el parseo. ADR-014 §3.5.1 exige sesión `active` primero. Mover la verificación de sesión a un hook `onRequest` de las rutas POST (o registrar multipart solo en rutas autenticadas).
- B2. **Ubicación de uploads por defecto dentro de `public/`** (`PROMO_IMAGES_DIR=../public/images/promos`, `PROMOTIONS_OUT_DIR=../public/data`). El worker de Productos reconstruye y hace swap de `dist/`: todo lo escrito dentro del árbol del sitio se pierde o queda huérfano. Definir ya el contrato de producción (§3.5.5: `/var/www/alcusa-private/uploads/`, URL `/media/...`, `promotions.json` fuera de `releases/`) y que `image` en el JSON use la URL `/media/...` servida por Nginx. En local puede seguir en `public/`, pero debe haber un test que asegure que `PROMO_IMAGE_URL_PREFIX` y la ruta servida coinciden.
- B3. **Carrera de regeneración y escritura sin versión** (ver desviación 1): `republish()` debe correr bajo el lock, y `save` de promos debe tener control optimista (spec A11: conflicto de edición) o al menos `updated_at` comparado. Productos nace con `version` desde el día uno; promos se ajusta en la misma slice.

**No bloqueantes** (ver informe): purga de sesiones expiradas, `RELEASE_LOCK` silencioso sin destruir la conexión, `pool.query` con `IN (?)` fuera de la regla "execute", `Guardar` de una promo publicada la pasa a borrador (confirmar intención UX), reactivar con 3 activas permitido vs. bloqueo de la spec (**decisión: permitir**, la regla de cupo se aplica al publicar; la spec lo plantea como pregunta 1), cobertura de pruebas faltante.

## 5. Gate de revisión (añadido a ADR-014 §6)
- Ningún `fromPrice` literal editable en código; el valor editable vive solo en `products.price_from`.
- `slugExists` consulta `products`; no hay lista de slugs en código tras Productos.
- Toda escritura de contenido publicable pasa por el lock; todo POST con archivo exige sesión antes de leer el cuerpo.
- Migraciones: `0004_products.sql` (products, product_images, publish_jobs, `price_from`, `show_price`, `version`).
