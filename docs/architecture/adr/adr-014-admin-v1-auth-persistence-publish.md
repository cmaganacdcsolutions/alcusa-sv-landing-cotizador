# ADR-014: Admin v1.0 (Promociones + Productos): autenticación, persistencia y modelo de publicación

- Estado: **proposed** (pendiente de visto bueno de Carlos; pasa a accepted con el pitch de po-pm)
- Fecha: 2026-10-06
- Nota de numeración: el pedido lo llamó "ADR-013"; ese número ya es "Backend Node, local-first". Este es el 014.
- Extiende: ADR-011 (admin + promos dinámicas), ADR-013 (Fastify/MariaDB/sharp), ADR-010 (modelo de datos).
- Supersede **solo para v1.0**: ADR-011 §2 "TOTP obligatorio para todo admin" y el middleware de primer login que obliga a enrolar TOTP. El 2FA queda **agendado para v1.1** (decisión del Foreman, 2026-10-06) y este ADR deja la costura (§3.4). Todo lo demás de ADR-011 §1-§4 (ruta protegida, cookie `__Host-`, CSRF, lockout, 404 uniforme, publicador de `promotions.json`, tope de 3 promos, ingest de imágenes) **sigue vigente**.
- ADR-011 §3 (GD, 400/800/1200) ya fue reemplazado por `sharp` en ADR-013; aquí se fija además el pipeline de productos (§3.5).

## 1. Contexto y drivers

Alcance de v1.0 (decidido por el usuario): login simple sin 2FA, credenciales definidas por CDC y aprovisionadas por nosotros (sin alta ni gestión de usuarios); dos secciones: **Promociones** y **Productos** (alta/edición/baja, vistas de tarjetas + formularios).

Estado actual (honesto):
- Sitio Astro 100 % estático (18 páginas); catálogo y precios en código: `src/content/catalog.ts` (árbol Categoría > Subcategoría > Variante, con `fromPrice` literal guardado por test contra el motor), `catalogContent.ts` (textos, imágenes, specs, `pending`), `pricingTables.ts` + `src/engine/pricing/*`. Promos: `promotions.json` validado en build por `promotions.ts`.
- `server/` (Fastify 5 + mysql2 + MariaDB 11.4) existe con el módulo `quotes`; **no existe** módulo admin, ni tablas de productos (solo `0001_init.sql`, que ya trae `admin_users`, `admin_sessions`, `promotions`). Nada desplegado.
- Hosting: **Hostinger KVM 2 VPS** (2 vCPU / 8 GB / 100 GB NVMe, srv2021291), Ubuntu 24.04, Nginx; **sin aprovisionar** (slice D0 diferida hasta la transferencia del dominio). Fuentes: ADR-002 (revisión 2026-09-29), ADR-013 §1, runbook 05-ops §Fase 2. Node es posible: no es hosting compartido.

NFR (SUPUESTOS, nadie dio números): 1-3 operadores, <50 acciones de admin/día, 50-200 sesiones públicas/día, p95 de páginas públicas igual que hoy (estático), p95 admin <500 ms, disponibilidad 99 % (un solo VPS), RPO 24 h / RTO 4 h, presupuesto $0 adicional al VPS ya pagado, PII: solo en cotizaciones/contactos (el admin v1.0 no las muestra).

## 2. Decisión (resumen)

| # | Tema | Decisión |
|---|---|---|
| 1 | Runtime | El **servicio Fastify único de ADR-013** (`server/`, `127.0.0.1:3001`) sirve el admin SSR bajo la ruta protegida. Sin Astro SSR, sin PHP, sin segundo servicio. |
| 2 | Persistencia | **MariaDB = fuente de verdad** (promos y productos). El sitio público sigue estático. |
| 2a | Publicar **promos** | JSON estático `promotions.json` regenerado al guardar + timer 15 min (ADR-011 §4 opción C, sin cambios). Instantáneo. |
| 2b | Publicar **productos** | **Exportar BD -> rebuild del sitio estático en el VPS -> swap atómico** (worker systemd, botón "Publicar catálogo", ~1-2 min). Conserva SEO/rendimiento y el cotizador compilado. |
| 3 | Auth | Usuario + contraseña, argon2id, sesión en BD, cookie `__Host-`, CSRF, lockout; **máquina de estados con paso `mfa_pending` reservado** (apagado en v1.0). |
| 4 | Imágenes | `sharp` en servidor, solo JPEG/PNG/WebP <=5 MB, salida WebP 800/1200 (promos además 400), **nunca recorta ni fuerza proporción**. |
| 5 | Precios | **El admin NO edita precios en v1.0.** Los productos se enlazan a un modelo del motor mediante una lista cerrada. |

## 3. Detalle

### 3.1 Runtime (qué corre en Hostinger)
- Proceso `alcusa-api.service` (systemd, usuario `alcusa`, `127.0.0.1:3001`); Nginx hace `proxy_pass` de `/api/` y de `ADMIN_BASE_PATH/` (ADR-013 §2.1). Módulos nuevos: `server/src/modules/{admin,promotions,products}` con la regla anti-erosión (lógica en `service`, no en handlers ni plantillas). HTML con el helper `html` autoescapado, JS vanilla mínimo, CSS propio; **sin SPA**.
- Worker de catálogo: `alcusa-catalog-build.service` (oneshot) disparado por un `.path`/timer; no es un segundo servicio de larga vida.
- Rechazadas: **Astro SSR (adapter node)** mezcla el sitio cacheable con el admin y duplica el proceso (ya rechazado en ADR-013); **API separada / SPA React de admin** duplica DTOs y build para ~6 pantallas; **PHP** supersedido por ADR-013.
- **A verificar antes de D0** (no bloquean el diseño, sí el despliegue): (1) que el KVM 2 siga sin panel y con SSH/root; (2) Node >= 24.7 en el VPS (argon2 nativo; si no, paquete `argon2`); (3) tiempo real de `astro build` + `sharp` en el VPS (supuesto 30-90 s; 8 GB de RAM sobra); (4) dominio transferido (el admin no sale a producción antes). Mientras tanto todo se construye y prueba en local (ADR-013 §2.5).

### 3.2 Persistencia y modelo de publicación

| Opción | Frescura | SEO / rendimiento | Piezas | Veredicto |
|---|---|---|---|---|
| A. Fetch en runtime de promos **y** productos a la BD | Inmediata | Páginas de producto sin contenido en HTML o SPA; BD en el camino de lectura | Baja | Rechazada para productos |
| B. JSON-en-repo + commit + CI + deploy | Minutos, con humano en medio | Óptima | Alta: token de GitHub en el VPS o que CDC publique cada cambio | Rechazada: el cliente no se autogestiona |
| C. BD + JSON estático en runtime (solo promos) | Inmediata | Estático + ~1 KB de JS, fallback horneado | Baja (ya diseñada) | **Adoptada para promos** |
| D. BD + export + rebuild en el VPS + swap atómico | 1-2 min tras "Publicar" | Óptima (HTML estático real, cotizador compilado) | Media: un worker | **Adoptada para productos** |

Por qué productos != promos: una promo es un bloque que cambia seguido y ya tiene fallback de build; un producto genera **páginas** (`/catalogo/<slug>`), entradas del cotizador y metadatos SEO, y cambia pocas veces al mes. Pagar 1-2 min por publicar es aceptable; romper SEO o hidratar tarjetas en cliente, no.

**Flujo "Publicar catálogo"** (`products` en BD: `draft|published|archived`; guardar crea/edita borrador y **no** afecta al sitio hasta publicar):
1. El admin pulsa Publicar -> `INSERT publish_jobs(status='queued')` + `audit_log`. Un job activo a la vez (`GET_LOCK('catalog_build')`); botón deshabilitado y estado visible (en cola / construyendo / publicado hh:mm / falló).
2. El worker exporta `catalog.generated.json` (solo `published`), ejecuta `astro build` en un directorio de trabajo y **valida** (esquema zod + el `assertCatalogContent` existente + conteo de páginas esperado + que ningún `product_slug` de promo publicada apunte a un slug ausente). Solo entonces `rsync` a `releases/<ts>` y **swap atómico** del symlink `current`; conserva 3 releases.
3. Si falla cualquier paso, el sitio queda como estaba y el job pasa a `failed` con el final del log (sin secretos) visible en el admin. Rollback manual = symlink anterior.
- **Regla de un solo constructor** (evita pelear con el pipeline de D0): el pipeline de despliegue sube el **código fuente** (release + `npm ci`) y el worker es el único que produce `dist/`; el CI sigue corriendo todos los gates antes. Cada deploy de código dispara también el worker. `senior-devops` lo concreta en D0.
- Astro **no se conecta a la BD**: solo lee el export. En local/CI sin export el build usa la semilla en repo (§3.7), así `npm run build` y los tests actuales no cambian.
- Imágenes de productos subidas desde el admin se sirven por Nginx en `/media/products/` (inmutables, clave aleatoria); **no** se copian al repo ni a `public/`, así sobreviven a los rebuilds. Las imágenes ya existentes en `public/images/` conservan su ruta (`legacy_src`).
- Costo: una pieza más que operar. Salida: si el volumen de cambios creciera, pasar a la opción A para tarjetas sin tocar el modelo de datos.

### 3.3 Autenticación (v1.0)
- **Sin alta ni gestión de usuarios.** Cuentas creadas solo por CLI en el VPS (`server/src/cli/create-admin.ts`, ADR-011 §2 / ADR-013 §2.4). **Desvío deliberado de "credenciales desde env"**: las credenciales de usuario **no** viven en variables de entorno (quedarían en claro en `/etc/alcusa/api.env`, en `ps` o en el historial); se guardan solo como hash argon2id en BD. En el env van únicamente secretos de plataforma: BD, `ADMIN_BASE_PATH`, pepper/clave AES, `ADMIN_MFA_MODE`.
- "Definidas por CDC": CDC elige el usuario y la contraseña inicial por **entrada oculta interactiva** en TTY (`create-admin <usuario> --prompt`; nunca por argv/env/archivo) o la deja generar (CSPRNG, impresa una vez). Se entrega al cliente por canal seguro y `must_change_password=1` obliga a cambiarla en el primer login (única pantalla forzada en v1.0). Mínimo 14 caracteres, sin reglas de composición, rechazo de comunes/igual al usuario. No hay "olvidé mi contraseña": `--rotate` por SSH.
- **Hash**: argon2id (`node:crypto`, m=64 MiB, t=3, p=1; afinar a ~250 ms en el VPS), formato PHC, rehash al login; verificación ficticia si el usuario no existe.
- **Sesión**: id de 256 bits, se guarda su SHA-256 en `admin_sessions`; cookie `__Host-alcusa_admin; Secure; HttpOnly; SameSite=Strict; Path=/` sin `Domain`; inactividad 30 min, absoluta 8 h; rotación de id en cada cambio de `stage` y al cambiar contraseña; **logout = POST** que borra fila y cookie.
- **CSRF**: token por sesión en cada formulario POST (comparación en tiempo constante) + `Origin`/`Sec-Fetch-Site`; cero mutaciones por GET; `Cache-Control: no-store`.
- **Fuerza bruta**: Nginx `limit_req` (login 5/min/IP; ruta 60/min/IP) + app por usuario y `ip_hash` en `rate_limits`: 5 fallos -> bloqueo 1/5/15/60 min, mensaje único, todo a `audit_log`; fail2ban sobre log propio de la ruta admin (ADR-011 §2).
- **Riesgo aceptado, a firmar por Carlos**: sin segundo factor y con el admin en el **mismo origen** que la landing (ADR-011, enmienda), la protección descansa en contraseña larga + lockout + ruta secreta + CSP estricta. Mitigación barata en v1.0: allowlist opcional de IP (`$admin_allowed`, responde 404); se recomienda activarla si el operador tiene IP fija. Se cierra en v1.1 con 2FA.

### 3.4 Costura para 2FA (v1.1 sin rediseño)
Estado de sesión `password_ok -> mfa_pending -> active` **ya modelado en v1.0**:
- `admin_sessions.stage` CHECK pasa a `('password_ok','mfa_pending','active')` en la migración `0002` (hacia adelante, antes de cualquier despliegue). v1.1 no necesita cambio de esquema en sesiones.
- `admin_users` **ya reserva** `totp_secret_enc`, `totp_enabled_at`, `totp_last_step`, `recovery_codes_hash` (0001); `0002` añade `mfa_method VARCHAR(16) NULL` (`NULL|'totp'`) para admitir otros métodos.
- Una única función `nextStage(user, policy)` decide la transición tras verificar la contraseña: `ADMIN_MFA_MODE=off` (v1.0, por defecto) -> `active`; `optional` y usuario con `totp_enabled_at` -> `mfa_pending`; `required` -> `mfa_pending` (sin enrolar, solo se permite la pantalla de enrolamiento). Interfaz `SecondFactor { isEnrolled(user); verify(user, input): Promise<Result> }` con `NullSecondFactor` en v1.0.
- Un middleware de autorización **exige `stage='active'`** en toda ruta salvo `/login`, `/login/mfa` y `/account/mfa-enroll`; las dos últimas existen reservadas y responden el 404 uniforme mientras el modo sea `off`.
- `audit_log` y `rate_limits` ya cubren la acción reservada `admin.mfa_failed`. El diseño del segundo factor (TOTP RFC 6238, AES-256-GCM, anti-replay, códigos de recuperación) es el de ADR-011 §2 sin cambios: v1.1 implementa `TotpSecondFactor`, las pantallas de enrolamiento y cambia el modo a `required`. Un test de contrato de v1.0 verifica que con `stage='mfa_pending'` ninguna ruta del panel responde.

### 3.5 Imágenes (promos y productos)
El cliente nunca decide tipo, nombre ni ruta.
1. Solo sesión `active` + CSRF; 1 archivo por petición; **<=5 MB** (límite de Nginx solo en la ruta de subida + `limits.fileSize` de `@fastify/multipart`).
2. Tipo por **firma real** (bytes mágicos / `sharp.metadata()`), no por extensión ni `Content-Type`; permitidos JPEG, PNG, WebP; **se rechaza SVG, GIF, HEIC, AVIF y todo lo demás**. Lado <=6000 px y <=24 MP **antes** de decodificar (`limitInputPixels`); mínimo 600 px en el lado largo.
3. `sharp(...).rotate()` (aplica EXIF) -> se descartan metadatos -> `resize({width, fit:'inside', withoutEnlargement:true})` -> WebP q≈80. Anchos: **productos 800 y 1200** (pipeline existente), **promos 400/800/1200** (ADR-011 §3). Si la fuente es menor que un ancho, **no se genera** ese ancho (nunca amplía).
4. **Regla "foto completa" (`02-design/specs/image-frame-rule.md`)**: el servidor **nunca recorta, rellena ni fuerza proporción** (`fit:'inside'`; jamás `cover` ni `attention`) y guarda `width`/`height` intrínsecos. Cualquier proporción se admite; el marco 1:1 + `contain` + capa ambiental blur es solo presentación, y el **componente `PhotoFrame` es el mismo** en el sitio y en la vista previa del admin, de modo que lo que el operador ve es lo que se publica. Los formularios no tienen campos de enfoque/focal.
5. Nombre `<image_key>-<ancho>.webp`, con `image_key` = 16 bytes aleatorios en hex; `image_alt` **obligatorio** (<=160). Almacenamiento fuera de docroot y de releases: `/var/www/alcusa-private/uploads/{promotions,products}/` (0750), servido por Nginx en `/media/...` con `nosniff`, `immutable`, sin PHP ni autoindex. Escritura atómica (tmp + rename); si falla un ancho no queda archivo parcial.
6. **Borrado**: eliminar una promo/producto o reemplazar su imagen marca las claves huérfanas; el archivo se borra en la **purga diaria** (no en la petición web) y solo si ninguna versión publicada ni release vigente la referencia.

### 3.6 Modelo de datos v1.0 (migraciones `0002_admin_mfa_seam.sql` y `0003_products.sql`)

**Promotion**: tabla `promotions` de ADR-010 §3 sin cambio estructural. Mapa al contrato público actual (`promotions.ts`; JSON en snake_case): `title`, `description`, `price_before` (NULL = "Precio especial"), `price_promo`, `image_key` + `image_alt`, `product_slug`, `starts_on`/`ends_on`, `status`, `sort_order`, `promotion_rules`. Reglas v1.0: `rule_type='text'` con `params {text}` (el cliente aún no definió reglas estructuradas; el registro de tipos queda extensible). Validación de servidor: `price_promo < price_before`, `ends_on >= starts_on`, `product_slug` existente y `published` en `products`, y tope de 3 activas por solape al publicar (ADR-011 §4). **Baja** = archivar (los borradores sí se eliminan).

**Product** (nuevo; "hoja" del catálogo = subcategoría sin variantes o variante; el árbol de categorías **no** se edita en v1.0, es código):
- `products(id, slug UNIQUE inmutable, category_slug CHECK IN (las 3 actuales), parent_slug NULL, name, blurb, description, chip NULL, specs JSON [{label,value}], alto_text NULL, quoter_ref VARCHAR(40) NULL, advisor_only TINYINT, sort_order, status draft|published|archived, created_by/updated_by, timestamps)`.
- `product_images(id, product_id FK CASCADE, image_key NULL, legacy_src NULL, alt, width, height, position)`; exactamente uno de `image_key`/`legacy_src`.
- `publish_jobs(id, kind, status, requested_by, started_at, finished_at, log_tail, result_release)`.
- **Vínculo con el cotizador (`quoter_ref`)**: lista **cerrada en código** (`QUOTER_REFS`); cada valor = un par `(quoterModel, preset)` ya soportado por el motor (recta, templada, L aquaclara/frosted/aquafold, bisagra, jardín 1/2/3 hojas, ventana francesa/bilbao). El formulario ofrece "Se cotiza como: ..." o "Solo asesoría por WhatsApp" (`advisor_only=1`, `quoter_ref NULL`: el tipo `Advisor` ya existente). **Un producto nuevo no puede inventar un modelo de cálculo ni un precio.**
- `fromPrice` **no se almacena ni se edita**: el build lo calcula con el motor para el `quoter_ref` (elimina el literal duplicado que hoy guarda `catalog.test.ts`). Los `advisor_only` no muestran precio.
- **Baja de producto = archivar**, nunca borrar: desaparece al publicar; se bloquea si una promo publicada o programada lo referencia; el slug queda reservado para siempre (no rompe `?producto=<id>` ni enlaces). Las cotizaciones emitidas guardan su **snapshot** (ADR-013 §7) y no dependen de la fila. Las URLs archivadas devuelven 404 (redirección a la categoría = tech-debt).
- Los `pending` (`photo|description|specs|price`) se **derivan** (sin foto => `photo` pendiente, etc.) y el admin los muestra como "falta" en la tarjeta.

**¿Edita precios el admin en v1.0? No.** (1) El cliente aún debe entregar precios y reglas de promo (memoria de proyecto); (2) los precios determinan cotizaciones y cobros Wompi, y cambiarlos sin versionar tablas rompe la reproducibilidad de cotizaciones guardadas; (3) hoy viven en código con tests de paridad. Cuando lleguen se cargan por PR (`pricingTables.ts`). Disparador de una pantalla "Precios" (v1.2+): el cliente pide cambiar tarifas con frecuencia; exige `price_tables` versionada + `price_table_version` en el snapshot de cotización + ADR propio.

### 3.7 Migración mínima de los archivos actuales a la BD
1. `0002`/`0003` crean el esquema (BD vacía; nada desplegado).
2. `server/src/cli/seed-catalog.ts` (idempotente por `slug`; se niega con `NODE_ENV=production` salvo `--initial`) importa `catalog.ts` + `catalogContent.ts` a `products`/`product_images` como `published` con `legacy_src` apuntando a las imágenes actuales (**ninguna imagen se mueve ni se reconvierte**), y `promotions.json` a `promotions` (los placeholders quedan `draft`).
3. `src/content/*.ts` **se conservan como semilla y fallback de build**: sin export el build usa el código; con export manda la BD por `slug`. Un test de equivalencia garantiza que `seed -> export -> build` reproduce las 18 páginas actuales (mismas rutas, mismos `fromPrice`).
4. Desde la primera publicación en producción la BD es la fuente de verdad del contenido; los `.ts` solo se tocan para estructura (categorías, modelos del motor, precios).

### 3.8 Postura de seguridad (OWASP Top 10:2021) y respaldos
- **A01 Control de acceso**: un solo rol; `stage='active'` exigido por middleware; 404 uniforme sin sesión; sin enumeración de usuarios.
- **A02 Criptografía**: argon2id; TLS + HSTS; sesión opaca hasheada en BD; secretos solo en `/etc/alcusa/api.env` (0640); `pino redact`.
- **A03 Inyección/XSS**: solo SQL parametrizado (regla de lint), zod en cada frontera, HTML autoescapado, CSP del admin `default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; form-action 'self'`; el contenido del admin es **texto plano** (sin HTML/markdown) y se escapa en sitio y export.
- **A04 Diseño**: publicar != guardar; validación al publicar; el export falla cerrado; auditoría de toda mutación.
- **A05 Configuración**: ruta admin como config validada; 404 uniforme; puerto 3001 solo en loopback; ufw 22/80/443; `X-Robots-Tag: noindex`; el worker corre como `alcusa` sin shell con `ReadWritePaths` acotados.
- **A06 Componentes**: dependencias nuevas mínimas (`sharp`, `@fastify/multipart`, `@fastify/cookie`, `@fastify/helmet`, `@fastify/rate-limit`; el resto `node:crypto`), versiones exactas, `npm audit` en CI.
- **A07 Autenticación**: §3.3; riesgo de no-2FA aceptado y cerrado en v1.1.
- **A08 Integridad**: export validado contra esquema y build antes del swap; imágenes re-codificadas; swap atómico.
- **A09 Registro**: `audit_log` (login ok/fallo/bloqueo, crear/editar/publicar/archivar, subir imagen, publicar catálogo) sin secretos; logs JSON a journald; alerta si `publish_jobs` falla; una métrica por camino crítico (login, publicar promo, publicar catálogo).
- **A10 SSRF**: el admin no hace fetch de URLs; imágenes solo por archivo.
- Extra: XSS de la landing hacia el admin por mismo origen (ADR-011 §10) mitigado con CSP estricta en el sitio, sin HTML de usuario y CSRF por token.
- **Respaldos** (ADR-010 §6 + esto): `mariadb-dump` diario cifrado con copia fuera del VPS (7 diarios / 4 semanales) **más** `/var/www/alcusa-private/uploads/` (rsync diario) y el último `catalog.generated.json`; snapshot semanal de Hostinger como red extra; prueba de restauración trimestral. RPO 24 h.

### 3.9 Fallos y degradación
| Falla | Efecto | Recuperación |
|---|---|---|
| MariaDB caída | Admin no disponible; sitio público intacto (estático + JSON ya publicado) | systemd reinicia; restore desde dump |
| Build de catálogo falla | Sitio queda en la versión previa; job `failed` con log | Corregir dato y reintentar; rollback por symlink |
| Proceso Fastify caído | Admin y API caídos; sitio estático sigue | `Restart=on-failure`, health check externo |
| Imagen corrupta o bomba de descompresión | 422, no se escribe nada | n/a |
| Dos operadores publican a la vez | Se serializa con `GET_LOCK`; el segundo ve el job en curso | n/a |

## 4. Alternativas consideradas (resumen)
Astro SSR / API aparte / PHP / CMS headless (Directus, Strapi: segunda superficie y BD ajena al modelo de ADR-010) / JSON-en-repo / fetch en runtime de productos: ver §3.1-3.2. Editor de precios en v1.0: rechazado (§3.6). Subdominio `admin.`: ya rechazado en ADR-011 por Certificate Transparency.

## 5. Consecuencias
- Bueno: un solo proceso y lenguaje, cero costo recurrente nuevo; el sitio público no depende de la BD; el cliente se autogestiona sin tokens de Git; el 2FA entra en v1.1 sin migración ni cambio de flujo.
- Malo: el worker de build y la regla de un solo constructor añaden trabajo a D0; publicar productos tarda 1-2 min; seguridad sin 2FA durante v1.0 (riesgo firmado); dos fuentes de contenido transitorias (BD y `.ts`).
- Salida: SQL portable y Fastify sobre HTTP estándar; el export JSON permite volver a "JSON-en-repo" sin perder datos.

## 6. Orden de construcción y gates (para po-pm)
| ID | Dueño | Qué | Depende |
|---|---|---|---|
| A0 | senior-dba | `0002` (stage + `mfa_method`), `0003` (products, product_images, publish_jobs) | N0 |
| A1 | senior-be | Núcleo admin: `create-admin --prompt`, login/logout, sesión, CSRF, lockout, `nextStage`/`SecondFactor` en modo `off`, cambio de contraseña, layout y navegación | A0 |
| A2 | senior-be (+ diseño de vistas) | Promociones: CRUD, vista previa, publicar/archivar, publicador `promotions.json`, reglas texto | A1 |
| A3 | senior-be | `ImageIngest` con `sharp` (promos + productos), `/media`, purga | A1 |
| A4 | senior-be | Productos: CRUD, `QUOTER_REFS`, archivar con chequeo de promos, export `catalog.generated.json`, `seed-catalog` | A0, A3 |
| A5 | fe-senior-react | Sitio: `promotions.json` en runtime (F3 de ADR-011), lectura del export en build, test de equivalencia de 18 páginas | A2, A4 |
| A6 | senior-infrastructure -> devops | Worker de build + `publish_jobs`, release de código fuente, Nginx `/media`, respaldos de uploads | A4, D0 |
| Q1 | senior-qa | Auth/CSRF/lockout, `mfa_pending` bloquea todo, subida hostil, publicación concurrente, fallo de build, restore | A1-A6 |

Review gate por fase (arquitecto): sin lógica en handlers; SQL solo parametrizado; ningún secreto ni la ruta real en repo; ruta admin ausente de sitemap/robots; ningún campo de enfoque/recorte en imágenes; `fromPrice` nunca editable; dependencias nuevas = solo las listadas.

## 7. Preguntas abiertas
1. Carlos: firmar el riesgo de v1.0 sin 2FA + mismo origen; ¿IP fija del operador para la allowlist?
2. ¿Cuántos operadores y quién define usuario/contraseña inicial por cuenta?
3. ¿"Publicar catálogo" debe avisar por correo/WhatsApp al terminar? (v1.0: solo estado en pantalla)
4. Confirmar que no se necesita alta de categorías ni de modelos de cálculo nuevos desde el panel (van por PR).
5. Precios y reglas de promo: pendientes del cliente; no bloquean v1.0 (§3.6).
