# ADR-011: Panel admin, promociones dinámicas, folio de cotización, webhook y contactos (CR-01)

Date: 2026-09-29
Status: proposed (pendiente de revisión del cliente; se vuelve accepted al aprobar CR-01)
Depende de: ADR-010 (base de datos y modelo). Toca: ADR-002, ADR-003, ADR-008 §5, ADR-009 §4.

## Contexto
CR-01 pide un panel admin para: CRUD de promociones (imagen, descripción, precio, reglas aún sin definir), cotizaciones con ID
único visible para cliente y admin, ventas Wompi ligadas a su cotización, contactos del formulario, y que la landing muestre
las 3 promociones activas desde la BD. El resto del sitio sigue estático.

Estado actual: Astro estático + islas React (ADR-001) servido por Nginx; solo 3 endpoints PHP ejecutables (`wompi-create-link`,
`wompi-return`, `wompi-webhook`) con `_lib/` denegado (ADR-002 rev., runbook). Secretos y datos en `alcusa-private/` fuera de
releases. `open_basedir` y `disable_functions` restringen el pool `alcusa`. Presupuesto de JS de la landing 40 KB gzip y CLS ≤ 0.1.
Equipo: 1 dev frontend; sin DBA ni SRE dedicados. Volumen SUPUESTO en ADR-010 (5–30 cotizaciones/día).

Principio rector: **el sitio público no debe depender de la BD para mostrarse**; la BD y el admin son una capa añadida, no un
nuevo punto único de falla del landing.

## Decisión

### 1. Dónde vive y cómo se construye el admin
**Subdominio `admin.alcusasv.com`** (dev: `admin.dev.alcusasv.com`), **PHP 8.3 renderizado en servidor**, plantillas PHP nativas,
JS vanilla mínimo. **No** hay SPA React ni API JSON para el admin.

| Criterio | `/admin` en el mismo host | **`admin.` subdominio** |
|---|---|---|
| Aislamiento de cookies/origen | Comparte origen con la landing y su JS | Origen propio; cookie `__Host-` acotada solo al admin |
| CSP | Una sola para landing y admin (la landing necesita allowances de Maps/Wompi) | CSP estricta propia del admin (`script-src 'self'`, sin terceros) |
| Controles de Nginx (allowlist de IP opcional, `limit_req` estricto, `noindex`) | Mezclados con el vhost público | Vhost separado, cambiables sin tocar el público |
| Costo | Ninguno | 1 registro DNS + 1 certificado certbot por entorno |

| Criterio | **PHP renderizado en servidor** | React SPA + API JSON |
|---|---|---|
| Piezas nuevas | 0 (mismo lenguaje que Wompi/API) | Segundo build, tokens/CSRF para la API, DTOs duplicados, más superficie |
| Validación | Un solo lugar (servidor) | Duplicada cliente/servidor |
| Riesgo XSS | Escape en plantilla (`htmlspecialchars`) + CSP sin `unsafe-inline` | Menor por defecto en React, pero mayor superficie de API |
| Interactividad requerida | Listados, filtros, formularios, subir imagen: no necesita SPA | Innecesaria |
| Mantenimiento | Un dev PHP/TS lo lee entero | Dos stacks de admin |

Elección: renderizado en servidor. Ninguna pantalla del alcance (5 listados, 1 CRUD, cuenta) justifica una SPA.
Costo: sin interactividad rica (filtros recargan página; la vista previa de la promo se resuelve con un formulario de dos pasos).
Salida: las acciones viven en clases de servicio (`app/src/Service/*`); si un día hace falta SPA, se les pone un controlador JSON encima sin reescribir la lógica.
Rechazado: WordPress/CMS/Directus (ver ADR-010 alternativas), Laravel/Symfony (framework completo para ~10 pantallas; Composer + actualizaciones de seguridad).
Dependencias PHP: ninguna obligatoria en v1 (PDO, `sodium`, GD, `password_hash` ya vienen en 8.3); si se agrega una, es por ADR o nota de revisión.

**Estructura de código** (`03-dev/`):
```
app/src/          # clases PHP (Db, Config, Auth, Service/*, Repo/*, PromotionRuleRegistry) — fuera del docroot
app/templates/    # plantillas del admin
admin/public/index.php   # único front controller ejecutable del vhost admin
api/promotions-publish.php ... # ver §4; los .php públicos son finos y llaman a app/src
bin/              # migrate.php, create-admin.php, retention.php, publish-promotions.php (solo CLI)
db/migrations/    # ADR-010 §5
```
Regla de erosión (review gate): cero lógica de negocio en `api/*.php` ni en plantillas; todo en `app/src`.
Nginx: en el vhost admin solo `admin/public/index.php` es ejecutable; en el vhost público la lista blanca de `.php` crece explícitamente (§4, §7, §9) y todo lo demás sigue en 404 (checklist del runbook se actualiza).
Pool PHP-FPM: mismo pool `alcusa` en v1; pool separado `alcusa-admin` es tech-debt (trigger: segundo operador o hallazgo de seguridad). `open_basedir` se amplía a `.../alcusa-private/uploads`.

**Pantallas v1**: inicio (contadores + pagos no conciliados), promociones (lista, crear/editar, publicar/despublicar/archivar, vista previa), cotizaciones (lista con filtros por estado/fecha/búsqueda de folio o teléfono; detalle con ítems y pagos), ventas (pagos, marca `unmatched`/`amount_mismatch`/`test`), contactos (lista, marcar leído/atendido/spam), auditoría (solo lectura), mi cuenta (cambiar contraseña, TOTP). Solo lectura en cotizaciones/ventas/contactos, salvo el estado de contactos y el cancelar cotización.

### 2. Autenticación y sesión
- **Sin auto-registro**: no existe ruta de alta. Los usuarios se crean solo por CLI en el VPS (ver "Bootstrap").
- **Contraseñas**: `password_hash($pw, PASSWORD_ARGON2ID, ['memory_cost' => 65536, 'time_cost' => 3, 'threads' => 1])` (ajustar para ~250 ms en el VPS y documentar en el runbook); `password_needs_rehash` al iniciar sesión. Largo mínimo 14 al cambiarla; sin reglas de composición; se rechaza la contraseña igual al username o a una lista corta de comunes.
- **TOTP (RFC 6238) obligatorio para todo admin**, decisión adoptada: SHA-1, 6 dígitos, 30 s, ventana ±1, control anti-replay con `totp_last_step`. Secreto cifrado con `sodium_crypto_secretbox` (clave en `config.php` externo), 8 códigos de recuperación de un solo uso guardados hasheados. Implementación propia de ~60 líneas con vectores de prueba de la RFC (sin dependencia). El usuario necesita una app autenticadora en su celular (pregunta al cliente).
- **Bootstrap y recuperación por CLI** (`bin/create-admin.php`, no es una ruta web):
  - Primer usuario: `alcusa`. Comando en el VPS por SSH: `sudo -u alcusa php bin/create-admin.php alcusa`.
  - Aborta si `PHP_SAPI !== 'cli'` (no puede invocarse desde FPM ni por HTTP).
  - Genera la contraseña con CSPRNG (`random_int`, ≥ 20 caracteres, alfabeto sin ambiguos), la **imprime una sola vez** en el terminal del operador para llevarla al gestor de contraseñas, y **se niega a imprimirla si stdout no es un TTY** (para que no acabe en un pipe, log de CI o archivo). Guarda solo el hash argon2id. Limpia el buffer con `sodium_memzero`.
  - La contraseña nunca se acepta por argumento ni por variable de entorno, y nunca va a repo, logs, BD en claro, archivos `.env` ni chat. El script tampoco loguea la contraseña ni el hash.
  - Crea al usuario con `must_change_password=1` y sin TOTP: en el **primer login** solo se permiten dos pantallas, cambiar la contraseña y enrolar TOTP (con QR y códigos de recuperación); cualquier otra ruta redirige ahí (middleware sobre `stage`, `must_change_password`, `totp_enabled_at`).
  - Modo `--rotate` (reset): mismo script sobre un usuario existente, genera una contraseña nueva con las mismas reglas, pone `must_change_password=1`, limpia `failed_attempts`/`locked_until` e **invalida todas sus sesiones**; el TOTP se conserva salvo `--reset-totp`, que lo borra y obliga a re-enrolar. Es también el camino de recuperación (no hay "olvidé mi contraseña" por correo: no hay canal de correo confiable ni se justifica un flujo de reseteo web).
  - Cada ejecución escribe en `audit_log` (`admin.created` / `admin.password_rotated` / `admin.totp_reset`, `actor_type=cli`, usuario del SO) sin ningún dato secreto. El mismo script sirve para crear otros admins.
  - Si en el futuro Carlos/CDC necesita acceso soporte, se crea un usuario propio; no se comparten cuentas.
- **Sesiones en BD** (`admin_sessions`, ADR-010): identificador aleatorio de 256 bits, se guarda su SHA-256. Cookie `__Host-alcusa_admin` con `Secure; HttpOnly; SameSite=Strict; Path=/` y sin `Domain` (el prefijo `__Host-` lo impone el navegador). Rotación de id al pasar de `password_ok` a `active` (tras TOTP) y al cambiar la contraseña. Inactividad 30 min, duración absoluta 8 h. Logout = POST + borrado de la fila.
- **CSRF**: token sincronizado por sesión en cada formulario POST, comparación en tiempo constante, más `SameSite=Strict` y verificación de `Origin`/`Sec-Fetch-Site` en todo método no seguro. Ninguna mutación por GET.
- **Fuerza bruta**: Nginx `limit_req` en `/login` (5 req/min/IP, burst 5); en la app, contador por username y por IP-hash (`rate_limits`): 5 fallos → bloqueo exponencial 1, 5, 15, 60 min (`locked_until`); mensaje único "credenciales inválidas" y verificación de hash ficticia para usuario inexistente (sin enumeración por tiempo o texto); el TOTP fallido cuenta igual. `fail2ban` sobre el log de Nginx para `/login` con 401/429 repetidos. Cada fallo y bloqueo va a `audit_log`.
- **Cabeceras del vhost admin**: `Content-Security-Policy: default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` en respuestas autenticadas, HSTS junto con el resto (ADR-002). Opcional y apagado por defecto: allowlist de IP por snippet de Nginx si el cliente opera desde IP fija.

### 3. Subida de imágenes (promociones)
Flujo (servidor, `Service\ImageIngest`), aplicado a **todo** archivo subido; el cliente nunca decide tipo, nombre ni ruta:
1. Límite de 5 MB (`client_max_body_size` solo en la ruta de subida + `upload_max_filesize`), una imagen por petición, solo con sesión `active` + CSRF.
2. Detección real: `finfo(FILEINFO_MIME_TYPE)` **y** `getimagesizefromstring`; solo `image/jpeg`, `image/png`, `image/webp`. Extensión y `Content-Type` del cliente se ignoran. **SVG, GIF, HEIC y cualquier otro se rechazan** (SVG = XSS/SSRF).
3. Tope de dimensiones (lado ≤ 6000 px y ≤ 24 megapíxeles) **antes** de decodificar (mitiga bombas de descompresión) y `memory_limit` acotado.
4. **Recodificación obligatoria** con GD: decodificar a lienzo, descartar EXIF/ICC/metadatos y cualquier payload políglota, y guardar como **WebP** en 3 anchos (400/800/1200, sin ampliar más que la fuente), calidad ~80. Mantiene el NFR de imágenes del README (WebP; se documenta que AVIF/`<picture>` con fallback no es necesario para estos assets porque WebP es universal en los navegadores objetivo). Verificar `gd` con WebP en el VPS (paquete `php8.3-gd`).
5. Nombre de archivo generado por el servidor: `<image_key>-<ancho>.webp` con `image_key = 16 bytes aleatorios en hex`; jamás derivado del nombre original. `image_alt` obligatorio (WCAG).
6. Almacenamiento **fuera del docroot y de los releases**: `/var/www/alcusa-private/uploads/promotions/` (0750, propietario `alcusa`), incluido en respaldos (ADR-010 §6). Se sirve solo con Nginx: `location /media/ { alias /var/www/alcusa-private/uploads/promotions/; }` con `add_header X-Content-Type-Options nosniff`, `Cache-Control: public, max-age=31536000, immutable` (el nombre cambia al reemplazar la imagen) y **sin PHP** (la regla `location ~ \.php$ { return 404; }` gana en ese vhost). Respuesta con `Content-Type` fijo `image/webp`; sin autoindex.
7. Al reemplazar/archivar una promoción, las imágenes huérfanas se borran en la purga de retención (no en la petición web).
Costo: GD consume memoria en imágenes grandes (acotado por el tope de megapíxeles); salida: si se requiere AVIF, `imagick`/libavif detrás de `ImageIngest`.

### 4. Cómo llegan las promociones a la landing estática
Opciones:

| Opción | JS extra | Depende de BD/PHP al cargar | Frescura | Complejidad |
|---|---|---|---|---|
| A. Fetch en runtime a un endpoint PHP/BD | Sí | **Sí** (BD caída = bloque roto) | Inmediata | Baja |
| B. Rebuild + deploy al publicar (CI) | No | No | Minutos; el admin necesita token de GitHub/CI en el VPS o un webhook | Alta, más secretos, build de 1–3 min por cambio |
| **C. Publicar un JSON estático desde PHP + fetch de ese archivo, con fallback horneado en el HTML** | Sí (script inline ≈ 1 KB, dentro de ADR-008) | **No** (Nginx sirve un archivo) | Inmediata al guardar + cron | Baja |

**Decisión: C.**
- Al guardar/publicar/archivar una promoción, `Service\PromotionPublisher` construye `promotions.json` con las **hasta 3 activas** y lo escribe **de forma atómica** (`tmp` + `rename`) en `/var/www/alcusa-private/public/promotions.json`; Nginx lo expone en `GET /api/promotions.json` (`alias`, `application/json`). No hay PHP ni BD en la ruta de lectura.
- Selección: `status='published'` y `starts_on <= hoy_SV <= ends_on`, orden `sort_order ASC, ends_on ASC, id ASC`, `LIMIT 3` (misma regla de fechas y comparación de string que ADR-008 §5). El admin muestra cuáles están "en la landing" y cuáles "en cola" si hay más de 3 activas.
- Contenido del JSON: solo campos públicos (`id`, `title`, `description`, `price_before`, `price_promo`, `image` (claves y anchos), `product_slug`, `starts_on`, `ends_on`, reglas en su forma pública informativa, `generated_at`). Nunca ids internos de auditoría ni datos del admin.
- **Vencimiento sin acción del admin**: `bin/publish-promotions.php` por cron cada 15 min regenera el archivo (solo escribe si el hash cambió) y el script inline de la landing **vuelve a filtrar por la fecha de hoy en SV** (defensa doble).
- **Caché**: Nginx `Cache-Control: public, max-age=60, stale-while-revalidate=300, stale-if-error=86400` + ETag. Imágenes `immutable` (§3). Sin CDN por ahora.
- **Fallback en capas (nunca se rompe la landing)**:
  1. Archivo estático servido por Nginx (no depende de PHP ni BD; si MariaDB cae, sigue mostrando lo último publicado).
  2. Si el `fetch` falla, expira, devuelve JSON inválido o vacío por error, el script **deja el bloque tal como lo renderizó el build**: Astro sigue renderizando `Promotions.astro` desde `src/content/promotions.ts`, que pasa a ser **semilla/fallback** (idealmente vacía o con promos de temporada aprobadas por el cliente).
  3. Sin promos válidas en ninguna capa, el bloque se oculta (como ya define ADR-008).
- **CLS ≤ 0.1**: el contenedor reserva altura (`min-height`) por breakpoint; la sustitución de contenido no cambia la altura de la rejilla de 3 tarjetas; el bloque va bajo el fold (no es el LCP). Test Lighthouse en la slice FE.
- Sin JS: se ve el fallback del build; riesgo residual heredado de ADR-008 (promo vencida tras el último deploy con JS desactivado) se mantiene y sigue en tech-debt.
- Salida: si se quisiera HTML completo sin JS, se puede añadir un `sub_filter`/SSI o un rebuild por webhook de CI sin cambiar el admin ni el JSON.

```mermaid
sequenceDiagram
  autonumber
  actor A as Admin
  participant N as Nginx (admin.)
  participant P as PHP-FPM (app)
  participant D as MariaDB
  participant F as promotions.json (disco)
  actor V as Visitante
  participant L as Nginx (alcusasv.com)
  A->>N: POST /promociones/12/publicar (sesion + CSRF)
  N->>P: front controller
  P->>D: UPDATE promotions + INSERT audit_log
  P->>D: SELECT hasta 3 activas
  P->>F: escribe tmp + rename (atomico)
  P-->>A: 302 lista (aviso: "en la landing")
  V->>L: GET / (HTML estatico, promos del build)
  L-->>V: HTML + fallback horneado
  V->>L: GET /api/promotions.json
  alt archivo disponible
    L-->>V: 200 JSON (cache 60s, SWR)
    Note over V: script filtra por fecha SV y reemplaza las tarjetas
  else fallo / invalido
    Note over V: se conserva el fallback del build
  end
```

### 5. El cotizador obtiene su folio
**Cuándo**: un `POST /api/quote-create.php` en el paso **Resumen** (S7), en la **primera acción saliente** que necesita folio: "Descargar PDF", "Enviar por WhatsApp" o "Pagar ahora", y **no** al entrar al paso ni en cada cambio de precio (evita basura y spam). Se requieren nombre y teléfono válidos (ya son necesarios para PDF/WhatsApp/pago); email opcional. El botón muestra estado de carga y, con el folio en mano, sigue con la acción. Para no romper la activación de `navigator.share` (problema descrito en ADR-009 §2), el POST se dispara al **montar el Resumen con los datos ya completos** (o en idle tras completarlos), y el tap solo consume el resultado ya resuelto.

**Contrato** (JSON, `Content-Type: application/json`, ≤ 32 KB, máx. 30 ítems):
- Request: `idempotencyKey` (UUIDv4 generado en el cliente y guardado en `sessionStorage` junto al hash del carrito, la misma regla (a) de ADR-009), `supersedes` (folio previo si el carrito cambió), `customer{name,phone,email?}`, `delivery{mode,zone?,address?}`, `items[{productSlug,description,qty,unitPrice,lineTotal,config}]`, `transportFee`, `total`, `consent:true`, `hp` (honeypot).
- Response `201` (nuevo) o `200` (mismo `idempotencyKey`: **misma respuesta, mismo folio**): `{code, validUntil, total}`. Errores en el sobre estándar de ADR-003 (`error.code`, mensaje en español).
- **Idempotencia**: `UNIQUE(idempotency_key)`; reintento por red o doble tap devuelve la fila existente. Si el carrito cambia materialmente el cliente genera una clave nueva y envía `supersedes`; la cotización anterior queda `superseded` (se conserva, visible en admin).
- **Validación**: tipos, longitudes, `qty` entera positiva, suma de líneas + transporte == `total` (mismo chequeo que `wompi-create-link`), rango de total, `productSlug` con formato válido, teléfono normalizado a E.164 (+503 por defecto). **Confianza de precio**: no existe motor de precios en el servidor (es TypeScript en el cliente), así que el servidor guarda `pricing_source='client'`: la cotización es "lo que el cliente vio", no una verificación. Riesgo: alguien puede fabricar una cotización con precio bajo. Mitigaciones: el folio no obliga a la empresa (el PDF trae fecha de validez y nota de que el precio final lo confirma un asesor); el admin ve `pricing_source`; **nunca** se acepta un monto de pago del cliente (§8: el monto sale de la cotización y un asesor puede cancelarla antes de que se pague). Tech-debt con trigger: si se cobra en línea el 100% sin revisión humana, portar el motor de precios a PHP o a un paquete compartido y recalcular en servidor.
- **Abuso**: Nginx `limit_req` 10 req/min/IP (burst 5) para el endpoint; en la app, `rate_limits` de 20 cotizaciones/hora por IP-hash y 5/hora por teléfono; honeypot; límite de tamaño; rechazo de `Origin` distinto al del sitio (control de comodidad, no de seguridad); sin CAPTCHA en el flujo de venta (fricción); alarma si >200 cotizaciones/día (señal de abuso, no hay tope duro). El teléfono se valida por formato, no por SMS (costo/fricción sin driver).
- **Si la API no responde** (timeout 4 s, 5xx, red): el cotizador **no bloquea la cotización**: emite folio de contingencia local (`ALC-AAAAMMDD-L?????`, ver ADR-010 §4), genera el PDF y el mensaje de WhatsApp con él, y **deshabilita el pago en línea** (pagar requiere cotización en BD) mostrando "Paga con un asesor por WhatsApp". El folio de contingencia no existe en BD; el asesor lo encuentra en la conversación. Tech-debt: reintentar el POST en segundo plano con la misma `idempotencyKey` y adjuntar el folio local en `client_code` para conciliar (trigger: primer incidente real).

```mermaid
sequenceDiagram
  autonumber
  actor C as Cliente
  participant W as Cotizador (React)
  participant N as Nginx
  participant P as quote-create.php
  participant D as MariaDB
  C->>W: completa datos en Resumen
  W->>N: POST /api/quote-create.php (idempotencyKey, items, customer)
  N->>N: limit_req por IP
  N->>P: reenvia
  P->>P: valida, rate_limits, honeypot
  P->>D: INSERT quotes(code aleatorio) + quote_items (tx)
  alt colision de code
    P->>D: reintenta hasta 5 veces
  end
  D-->>P: ok
  P-->>W: 201 {code, validUntil}
  W->>W: buildQuotePdf(code) / wa.me con folio
  C->>W: Descargar PDF / Enviar WhatsApp / Pagar
  Note over W,P: mismo idempotencyKey = mismo folio (200)
  opt API caida
    W->>W: folio local ALC-...-L?????, sin pago en linea
  end
```

### 6. Contactos y antispam
`POST /api/contact-submit.php` (nuevo `.php` público en lista blanca). El island React del formulario de contacto (ADR-001) envía JSON:
`{name, phone?, email?, message, consent:true, hp, t}`.
- Campos: nombre ≤ 120, mensaje 10–2000 caracteres, teléfono **o** email obligatorio, consentimiento explícito con aviso de privacidad (`consent_at`).
- Antispam por capas, sin terceros en v1: (1) **honeypot** `hp` oculto por CSS (debe llegar vacío); (2) **token de tiempo firmado**: el servidor emite `t = base64(ts).HMAC` en `GET /api/contact-token.php` o embebido en el HTML por la isla; se rechaza si el envío ocurre en <3 s o >2 h; (3) `rate_limits`: 5 envíos/hora por IP-hash y 3/hora por teléfono/email; (4) `dedupe_hash` (SHA-256 de teléfono/email + mensaje normalizado): mismo contenido en 10 min = `200` sin insertar; (5) heurística: rechazo silencioso si el mensaje trae >2 URLs o patrones típicos; los rechazos por antispam responden `200` genérico para no dar señal al bot y se cuentan en métrica, no se guardan.
- Trigger para CAPTCHA: >10 contactos spam/día en el admin → activar **Cloudflare Turnstile** detrás de una bandera de configuración (costo: tercero y cookies; por eso no entra de inicio).
- El mensaje se almacena tal cual como **texto** y se muestra en el admin escapado (nunca como HTML). Sin envío de correo en v1 (no hay MTA en el VPS; ver pregunta abierta sobre notificaciones): el admin muestra el contador de "nuevos". Trigger para email: el cliente no revisa el panel a diario; opción SMTP de Google Workspace con contraseña de aplicación fuera del repo.
- Fallo de BD: `503` con mensaje "escríbenos por WhatsApp" (el formulario ya tiene ese canal alterno en la landing); no se pierde silenciosamente.

```mermaid
sequenceDiagram
  autonumber
  actor V as Visitante
  participant W as Formulario (isla React)
  participant N as Nginx
  participant P as contact-submit.php
  participant D as MariaDB
  V->>W: llena y envia
  W->>N: POST /api/contact-submit.php {..., hp, t}
  N->>P: limit_req ok
  P->>P: honeypot, token de tiempo, rate_limits, dedupe
  alt spam / duplicado
    P-->>W: 200 generico (no se guarda)
  else valido
    P->>D: INSERT contacts (consent_at, ip_hash)
    P-->>W: 201
  end
  Note over D: el admin lo ve como "nuevo"
```

### 7. Promociones y folio en el PDF (impacto en ADR-008 y ADR-009)
Ver sección "Impacto" al final.

### 8. Webhook de Wompi escribe pagos
Se mantienen tal cual de ADR-003: HMAC-SHA256 del cuerpo crudo con `wompi_hash`, `hash_equals`, cuerpo ≤ 64 KB, 400 con firma inválida sin loguear cuerpo, `wompi-return.php` solo de presentación (nunca marca pagado). Cambia el destino de la escritura:
1. **`wompi-create-link.php`** deja de aceptar un monto del cliente: recibe `quoteCode` + `percent` (p. ej. 80/100), busca la cotización en BD (`status` pagable, no vencida, no cancelada), **calcula `amount = total * percent/100` en servidor**, inserta `payment_intents` con `reference = <code>-P<n>` y llama a Wompi con ese `identificadorEnlaceComercio`. Sin cotización registrada no hay pago en línea.
2. **`wompi-webhook.php`**, tras verificar la firma, en **una transacción**: `INSERT payments` con `wompi_transaction_id` `UNIQUE` (`ON DUPLICATE`/captura de `ER_DUP_ENTRY` → responde `200 duplicate`, sin reprocesar); resuelve `payment_intents` por `reference`; compara monto con `payment_intents.amount` (tolerancia 0.01); determina `status`: `approved` (ExitosaAprobada + productivo + monto ok), `amount_mismatch`, `failed`, `test` (`EsProductiva=false`, nunca cuenta) o `unmatched` (referencia desconocida: se guarda igual con `quote_id NULL`). Actualiza `payment_intents.status` y recalcula la cotización: suma de pagos `approved` ≥ total → `paid`; > 0 → `partially_paid`. Escribe `audit_log` (`payment.received`, `actor_type=system`).
3. **Falla de BD**: se **escribe el cuerpo crudo ya verificado en un spool** (`alcusa-private/data/webhook-spool/`, 0600) y se responde `503` para que Wompi reintente; `bin/replay-webhook-spool.php` lo reprocesa (idempotente por `wompi_transaction_id`). Nunca se responde 200 sin haber persistido en BD o en el spool.
4. El archivo `data/processed/` deja de ser fuente de verdad (se conserva 30 días como red de seguridad y luego se elimina en la slice de limpieza). El mock mode de ADR-003 no cambia y escribe en una BD de desarrollo/SQLite de prueba solo en tests.
5. Riesgo abierto a verificar (slice B3): formato/longitud permitidos de `identificadorEnlaceComercio`, y si el 80% de anticipo genera un segundo enlace sobre el mismo folio (modelado con `payment_intents`).

```mermaid
sequenceDiagram
  autonumber
  participant W as Cotizador
  participant P as wompi-create-link.php
  participant D as MariaDB
  participant O as Wompi
  participant H as wompi-webhook.php
  W->>P: POST {quoteCode, percent}
  P->>D: SELECT quote, calcula amount, INSERT payment_intents(reference=code-P1)
  P->>O: crea enlace (identificadorEnlaceComercio=reference, monto)
  O-->>P: url
  P-->>W: {url}
  Note over O: el cliente paga en el checkout de Wompi
  O->>H: POST webhook + wompi_hash
  H->>H: verifica HMAC del cuerpo crudo
  alt firma invalida
    H-->>O: 400
  else valida
    H->>D: TX: INSERT payments (tx id UNIQUE), recalcula quote
    alt duplicado
      H-->>O: 200 duplicate
    else BD caida
      H->>H: spool del cuerpo crudo
      H-->>O: 503 (Wompi reintenta)
    else ok
      H-->>O: 200
    end
  end
```

### 9. Superficie de red resultante
| Host | Rutas ejecutables | Notas |
|---|---|---|
| `alcusasv.com` (y `dev.`) | `/api/wompi-create-link.php`, `/api/wompi-return.php`, `/api/wompi-webhook.php`, `/api/quote-create.php`, `/api/contact-submit.php`, `/api/contact-token.php` | lista blanca explícita; `_lib`, `_dev`, dotfiles y todo otro `.php` = 404/deny |
| `alcusasv.com` | estáticos: `/api/promotions.json`, `/media/*` | sin PHP |
| `admin.alcusasv.com` (y `admin.dev.`) | solo `admin/public/index.php` | CSP estricta, `noindex`, `limit_req` en `/login` |
| MariaDB | ninguna pública | socket/127.0.0.1 |

### 10. Resumen de modelo de amenazas
| Amenaza | Vector | Control |
|---|---|---|
| Fuerza bruta / relleno de credenciales al admin | `/login` | argon2id, lockout exponencial, `limit_req`, fail2ban, TOTP obligatorio, mensaje único, auditoría |
| Robo de sesión | XSS, red, cookie | cookie `__Host-` HttpOnly/Secure/Strict, id hasheado en BD, rotación, expiración, CSP estricta, TLS/HSTS |
| CSRF | formularios del admin | token sincronizado + SameSite=Strict + verificación de Origin/Sec-Fetch-Site |
| XSS almacenado | descripción de promo, mensaje de contacto, nombre del cliente | texto plano, escape en salida en toda plantilla, CSP sin `unsafe-inline`, sin HTML libre en ningún campo |
| Inyección SQL | todos los inputs | PDO preparado sin emulación, `alcusa_app` sin DDL, `audit_log` solo INSERT |
| Subida maliciosa (RCE, bomba, políglota) | imagen de promo | sniffing real, lista blanca, tope de megapíxeles, recodificación, nombre aleatorio, fuera del docroot, sin PHP en `/media` |
| Falsificación/replay de webhook | POST a `wompi-webhook.php` | HMAC del cuerpo crudo, `wompi_transaction_id` UNIQUE, monto contra `payment_intents`, `EsProductiva` |
| Pago con monto manipulado | create-link | monto calculado en servidor desde la cotización |
| Cotización con precio fabricado | `quote-create.php` (motor de precios en cliente) | `pricing_source` visible, validez y confirmación por asesor, cancelación admin, tech-debt con trigger |
| Spam / llenado de BD / DoS de aplicación | quote-create, contacto | `limit_req`, `rate_limits`, honeypot, token de tiempo, dedupe, tamaños máximos, alerta de volumen y disco, purga por retención |
| Enumeración de cotizaciones | folios | folio aleatorio, sin endpoint público de consulta, PK interna nunca expuesta |
| Fuga de PII | BD, respaldos, logs | BD solo local, respaldos cifrados con `age`, logs sin PII, IP solo como HMAC, retención y anonimización (ADR-010 §7) |
| Compromiso de secretos | repo, config | secretos solo en `alcusa-private/config.php` (0640), nunca en repo/logs; contraseña admin nunca persistida en claro |
| Inyección CSV/fórmulas | export futuro | no hay export en v1; si se agrega, prefijar `'` a celdas que empiecen con `= + - @` |
| Clickjacking / redirecciones abiertas | admin | `frame-ancestors 'none'`, sin parámetro `next` externo |
| Cadena de suministro | dependencias | cero dependencias PHP obligatorias en v1; `composer.lock` + revisión si se añade alguna |
| Abuso interno / error humano | admin | `audit_log` de cada mutación y login, borrado lógico, respaldos |

No cubierto en v1 (aceptado): roles/permisos por usuario, WAF, detección de anomalías, pentest externo. Trigger: primer pago en línea productivo de alto monto o segundo operador. `senior-qa` convierte esta tabla en pruebas (auth, CSRF, subida, webhook, rate limits).

### 11. Observabilidad
Logs estructurados JSON de la app sin PII (`event`, `code`/`reference`, `status`, `latency_ms`); métricas mínimas por camino crítico: cotizaciones creadas/hora, ratio 4xx/5xx de `quote-create`, pagos por estado, pagos `unmatched`, edad del último respaldo, edad de `promotions.json`, disco libre. Health check `/api/health.php` con ping a BD **sin exponer detalles** (solo desde localhost/monitor). Definir con `senior-infrastructure` en la slice D0.

## Alternativas consideradas
- Panel como SPA React sobre API JSON, `/admin` en el mismo host, CMS/headless, Laravel/Symfony: ver §1 y ADR-010.
- Promociones por fetch directo a PHP/BD o por rebuild en CI: ver §4.
- Enviar el monto de pago desde el cliente: rechazado (§8).
- Login por enlace mágico / OAuth: requiere correo o proveedor externo sin driver; TOTP + contraseña local basta para 1–3 operadores.
- Folio secuencial: ver ADR-010 §4.

## Consecuencias
Bueno
- La landing sigue estática y **sobrevive a la caída de PHP/BD** (JSON estático + fallback del build).
- Un solo lenguaje de servidor (PHP), sin dependencias nuevas obligatorias, sin segundo build.
- Pagos siempre atados a una cotización y calculados en servidor; webhook idempotente y sin pérdida.
- Panel con controles de seguridad razonables para el riesgo (TOTP, sesiones en BD, auditoría) y sin flujos de recuperación web que atacar.

Malo
- Estado y PII nuevos que operar y proteger (ADR-010); más superficie PHP pública (3 endpoints nuevos).
- La cotización guarda precios del cliente (sin motor en servidor): la confianza descansa en confirmación humana.
- El admin es server-rendered: menos "app-like"; si el cliente exige UX rica habrá que invertir en una SPA sobre los servicios ya separados.
- La landing con JS desactivado o con promo vencida tras el último deploy conserva el riesgo de ADR-008.
- La contingencia offline produce folios que no están en BD.

Salida: servicios en `app/src/Service` reutilizables por una API JSON; JSON público reemplazable por SSR/rebuild; motor de BD tras `Repo/*`.

## Impacto en otros ADR (actualizaciones a aplicar)
- **ADR-008 §5**: `src/content/promotions.ts` pasa de fuente de verdad a **semilla/fallback del build**. El tipo `Promotion` se extiende (`image` con anchos, `rules` públicas informativas, `id` numérico de BD) y su test de integridad se convierte en un test del **esquema del JSON** publicado (fechas `YYYY-MM-DD`, `precio_promo < precio_antes`, `product_slug` resuelve con `findBySlug`). `isActive`/`activePromotions` se reutilizan en el script inline y tienen un espejo PHP (mismos casos de prueba). El resto del catálogo (categorías, slugs, precios) sigue **estático** y sin cambios.
- **ADR-009 §4 (folio)**: `generateQuoteNumber()` deja de ser fuente: el folio lo emite el servidor (`ALC-AAAAMMDD-XXXXXX`, 6 chars; ADR-010 §4). El PDF y el mensaje de WhatsApp se generan **después** de recibir el folio, con la misma etiqueta "N.º de cotización"; el nombre de archivo pasa a `^Cotizacion-ALC-\d{8}-[0-9A-HJKMNP-TV-Z]{6}\.pdf$` (el folio de contingencia usa el mismo patrón con `L` inicial en el sufijo). La regla "(b) el folio es una referencia, no un registro" se **sustituye**: ahora existe un registro en BD, aunque el precio sigue sin ser verificable por el servidor (§5). El presupuesto de 1,800 caracteres del `wa.me` sube 2 caracteres por el folio más largo (recalcular). El `sessionStorage` guarda además `idempotencyKey` y el folio recibido. El resto de ADR-009 (pdf-lib, generación 100% en el navegador, share/descarga) **no cambia**: el PDF sigue sin subirse a ningún servidor; solo se envía al servidor el JSON de la cotización.
- **ADR-003**: ver §8; ADR-002: hosting sin cambios, se añaden vhost admin, MariaDB, `uploads/` y lista blanca de PHP (runbook y su checklist, slice D0).
- **README de arquitectura §2/§5**: RPO/RTO y "sin BD" se actualizan (slice D1).

## Plan de construcción (slices, con dueño)
| # | Slice | Dueño | Depende de | Gate de revisión del arquitecto |
|---|---|---|---|---|
| D0 | Aprovisionar MariaDB (socket, usuarios `alcusa_app`/`alcusa_migrate`), `alcusa-private/{uploads,public,data/webhook-spool}`, vhost `admin.` + DNS/cert, `location /media` y `/api/promotions.json`, lista blanca PHP, `limit_req`, fail2ban, cron de respaldo cifrado + copia externa, actualizar runbook | senior-infrastructure | SO del VPS listo | Ninguna ruta PHP extra ejecutable; BD sin escucha pública; sin secretos en repo |
| D1 | Esquema `0001_init.sql`, runner `bin/migrate.php`, GRANTs, script de restore y purga (`retention.php`), datos semilla de prueba, actualizar README/tech-debt | senior-dba | D0 (BD dev) | Coincide con ADR-010; `audit_log` solo INSERT/SELECT; migración reversible por expand/contract |
| B1 | Esqueleto `app/src` (Config, Db, Http, Logger), `bin/create-admin.php` (create/`--rotate`/`--reset-totp`), login, sesiones, CSRF, TOTP, forzado de cambio de clave + enrolamiento, auditoría | senior-be | D1 | Bootstrap solo CLI y solo TTY; sin contraseña en logs/repo; cookies y CSP como §2; tests de bloqueo y CSRF |
| B2 | Promociones: CRUD + registro de reglas (`terms`), `ImageIngest`, `PromotionPublisher` (JSON atómico + cron) | senior-be | B1 | Hardening de §3 completo; el JSON público no filtra campos internos |
| B3 | Cotizaciones y ventas: `quote-create.php` (idempotencia, rate limits), `payment_intents`, cambios en `wompi-create-link.php`, webhook a BD + spool + replay | senior-be | B1 (D1) | Monto calculado en servidor; idempotencia por `wompi_transaction_id`; nunca 200 sin persistir; contrato verificado con docs.wompi.sv |
| B4 | Contactos: `contact-submit.php` + antispam | senior-be | D1 | Respuestas genéricas al bot; sin PII en logs |
| B5 | Vistas del admin (dashboard, listas y detalles de cotizaciones/ventas/contactos, auditoría) + CSS del admin | senior-be (apoyo de fe-senior-react en CSS/plantillas, sin SPA) | B2–B4 | Escape en toda salida; cero lógica en plantillas |
| F1 | Landing: bloque de promociones con fetch + fallback horneado + `min-height` (CLS), semilla `promotions.ts`, test del esquema del JSON | fe-senior-react | B2 (contrato JSON) | LCP/CLS/JS ≤ 40 KB gzip; funciona con fetch caído |
| F2 | Cotizador: POST de folio en Resumen, idempotencia en `sessionStorage`, PDF/WhatsApp con el folio del servidor, contingencia offline, deshabilitar pago sin folio | fe-senior-react | B3 | Sin datos de cliente persistidos salvo lo permitido; regex de archivo actualizada |
| F3 | Formulario de contacto: honeypot, token de tiempo, consentimiento y estados de error | fe-senior-react | B4 | Accesibilidad de errores (no solo color) |
| Q1 | Pruebas de seguridad y resiliencia derivadas del §10 (auth, CSRF, upload, webhook replay/forjado, rate limits, BD caída, restore) | senior-qa | B1–B5, F1–F3 | Pass/fail contra los criterios de NFR |

Orden real: D0 → D1 → B1 → (B2, B3, B4 en paralelo) → (F1, F2, F3) → B5 → Q1. B5 puede arrancar en cuanto existan las tablas de su lista.

## Preguntas abiertas para el cliente
1. **Reglas de promoción**: ejemplos reales (mínimo de piezas, solo cierta zona, producto específico, código de cupón, acumulables). ¿Deben cambiar el precio en el cotizador o solo informar?
2. Las 3 promociones de la landing: ¿criterio de orden si hay más de 3 activas (manual, la que vence antes)? ¿Qué se muestra si hay 0?
3. ¿Quién operará el panel (cuántas personas) y tienen un teléfono con app autenticadora (Google/Microsoft Authenticator)? Se propone TOTP obligatorio.
4. ¿El precio de una cotización obliga a ALCUSA? ¿Validez en días (se supuso una fecha `valid_until`)? ¿Puede el cliente pagar en línea sin revisión previa de un asesor?
5. ¿Opciones de pago (80% anticipo / 100%) y qué pasa con pagos parciales (saldo)?
6. ¿Notificación cuando llega un contacto o pago (correo de Google Workspace, WhatsApp) o basta con revisar el panel?
7. ¿El cliente necesita consultar el estado de su cotización/pago desde el sitio? (requiere ADR nuevo, ver ADR-010 §4).
8. Retención: 12 meses de contactos, 24 de cotizaciones, 10 años de ventas (supuestos). Validar con contador y asesor legal, y aprobar el texto del aviso de privacidad y consentimiento.
9. Respaldo externo: ¿destino y presupuesto (almacenamiento de objetos)? ¿Quién guarda la clave privada de descifrado?
10. ¿Hay facturación/DTE (Hacienda) que deba enlazarse con las ventas? (fuera de alcance de CR-01, afecta el modelo futuro).
11. Derechos de imagen y guía de fotos (tamaño, formato) para el cargador de promociones.
12. ¿Aceptan el subdominio `admin.alcusasv.com` y una IP fija para restringir (opcional)?
