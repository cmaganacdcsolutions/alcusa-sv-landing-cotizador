# ADR-013: Backend en Node (Fastify + TypeScript) en lugar de PHP; BD y BE se construyen primero en local

- Estado: **accepted** (decisión de Carlos, 2026-10-01)
- Fecha: 2026-10-01
- Supersede parcialmente: ADR-002 (el "PHP-FPM bajo `public_html/api/`" pasa a un servicio Node tras Nginx), ADR-003 (la implementación S8 en PHP; el contrato, la firma y el modo mock no cambian), ADR-010 §1 (versión de MariaDB), §2 (PDO → driver Node), §5 (runner de migraciones en TS), ADR-011 (toda mención de `app/src` PHP, `bin/*.php`, `admin/public/index.php`, FPM, `sodium`, `password_hash`), ADR-012 §3 (la ubicación Nginx `fastcgi` → `proxy_pass`).
- No cambia: modelo de datos (ADR-010 §3/§4/§7), contratos HTTP (ADR-011 §5, ADR-012 §3), seguridad (argon2id + TOTP obligatorio, cookie `__Host-`, ruta admin protegida, 404 uniforme, rate limits), MariaDB como motor, VPS KVM 2 con Nginx.

## 1. Contexto

- Prod: Hostinger KVM VPS 2 (srv2021291), sin aprovisionar (Ubuntu 24.04 LTS supuesto), Nginx al frente; despliegue tras la transferencia del dominio.
- Carlos quiere el backend en **Node** (un solo lenguaje con el FE Astro/React/TS) y construir BD + BE **en local ya**, sin contenedores, y migrar al VPS después.
- Máquina local: Windows 11, Node 24.21 (fnm), sin php/mysql/docker. Se autoriza instalar lo necesario con winget.
- Wompi SV ya está en **producción** (dinero real). El S8 en PHP (`api/wompi-*.php`, 571 líneas) se construyó pero **nunca se desplegó**: portarlo ahora cuesta lo mismo que portarlo después de desplegarlo, y no hay compatibilidad con producción que preservar.
- El motivo de ADR-002 para PHP (hosting compartido sin Node garantizado) **ya no aplica**: el VPS permite cualquier runtime.

## 2. Decisión

### 2.1 Forma del backend
| Tema | Decisión |
|---|---|
| Framework | **Fastify 5**. Rechazados: Express (sin validación/serialización de primera clase, mantenimiento más lento), Hono (excelente pero su ventaja es multi-runtime/edge, que no usamos; menos plugins maduros para cookies/rate-limit/static en Node). Fastify trae `pino` (logs JSON), `inject()` para tests sin red y esquemas. |
| Lenguaje | TypeScript estricto, ESM, Node 24 LTS en local **y** VPS (misma versión mayor). Dev con `tsx`; build con `tsup` (esbuild) a `server/dist/`. |
| Unidad | **Un solo servicio (monolito modular)**: `api` público + admin SSR en el mismo proceso. Sin colas, sin microservicios. Split solo si un driver real lo exige (revisar si el admin necesita otro dominio de fallo). |
| Ubicación | `server/` en este repo, **paquete npm propio** (su `package.json` y `node_modules`, **no** workspace del raíz: los worktrees comparten `node_modules` del FE por junction y hoistear arriesga el caché de Vite). Raíz expone `npm run server:dev` / `server:test` que delegan. |
| Estructura | `server/src/{config,db,http,modules/{quotes,payments,promotions,contacts,admin},cli}`, `server/db/migrations/*.sql`, `server/test/`. Regla anti-erosión (review gate): cero lógica de negocio en handlers HTTP o plantillas; todo en `modules/*/service`. |
| Validación | **zod** en cada frontera (body, params, env, filas críticas). Una sola fuente por contrato. |
| Contratos compartidos | El FE conserva sus tipos en `src/integrations/quotes/types.ts` y `src/integrations/wompi/types.ts`. El servidor define los schemas zod y un **test de tipos** (`expectTypeOf<z.infer<...>>().toEqualTypeOf<QuoteFolioRequest>()`) importa esos `.ts` del FE **solo como tipos**; si divergen, falla `npm run server:test`. El módulo puro `src/integrations/quotes/code.ts` (normalización + dígito de control del folio) se **importa tal cual** en el servidor (una sola implementación, vectores de `code.test.ts` normativos); regla: debe seguir sin dependencias del navegador. |
| Procesos en VPS | **systemd** (`alcusa-api.service`), usuario sin shell `alcusa`, `EnvironmentFile=/etc/alcusa/api.env` (0640 root:alcusa), `Restart=on-failure`, hardening (`NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`, `ReadWritePaths` solo uploads/spool/public-data), escucha `127.0.0.1:3001`. Rechazado PM2 (capa extra por un proceso; systemd ya reinicia, rota logs vía journald y arranca en boot). Timers systemd para publicar promos y purga de retención (reemplazan cron). |
| Nginx | Sirve `dist/` estático. `location /api/ { proxy_pass http://127.0.0.1:3001; }` + la ruta admin protegida (`location ^~ __ADMIN_BASE__/ { proxy_pass ...; }` con los mismos `limit_req`, `access_log` sin cookies, headers y 404 uniforme de ADR-011 §1/§2). Se mantienen `limit_req` y la lista blanca (ahora de **rutas**, no de `.php`). `X-Forwarded-For` solo desde Nginx; Fastify `trustProxy: '127.0.0.1'`. Timeouts: `proxy_read_timeout 15s`, cuerpo máx. 64 KB (webhook) / 32 KB (quote). |

### 2.2 URLs: se renombran, sin `.php`
Nada se desplegó, así que se limpia ahora: `/api/quote-create`, `/api/wompi-create-link`, `/api/wompi-webhook`, `/api/wompi-return`, `/api/contact-submit`, `/api/quotes/{code}` (este último ya no tenía sufijo), `/api/health`. **Excepción de verificación (gate de N3):** si en el panel de Wompi ya está registrada una URL de webhook/retorno con `.php`, se añade un `location = /api/wompi-webhook.php { proxy_pass .../api/wompi-webhook; }` temporal en vez de tocar producción primero.

**Deltas de FE** (los aplica el dueño del FE; este ADR no toca esos archivos):
1. `src/lib/quote-folio/index.ts:10` `QUOTE_CREATE_PATH` -> `'/api/quote-create'` (+ comentario línea 184).
2. `src/integrations/wompi/client.ts:13` `CREATE_LINK_ENDPOINT` -> `'/api/wompi-create-link'` (+ comentarios en `client.ts:2`, `types.ts:1,12,25`, `mock.ts:5`, `Cotizador.tsx:212`).
3. Tests: `src/lib/quote-folio/folio.test.ts:40`, `src/lib/quote.test.ts:80`, `src/integrations/wompi/client.test.ts:39`; comentario de `tests/e2e/wompi-mock-flow.spec.ts:47`.
4. `astro.config.mjs`: `vite.server.proxy` `{'/api': 'http://127.0.0.1:3001'}` (y la ruta admin local). Sin otro cambio: `httpClient.ts` ya usa `/api/quotes` y el selector `PUBLIC_QUOTE_API=mock|http` no cambia.
5. `PUBLIC_COTIZADOR_MODE=wompi` y `PUBLIC_QUOTE_API=http` se activan en el despliegue, no antes (modo mock sigue siendo el default).

### 2.3 Base de datos
- **Se mantiene MariaDB** y el modelo de ADR-010 sin cambios de esquema. No hay argumento para cambiar de motor por pasar a Node.
- **Versión: MariaDB 11.4 LTS en local y en el VPS** (enmienda a ADR-010 §1 "10.11"). Motivo: winget solo ofrece 10.6.x y luego 11.4+ (no hay 10.11); 11.4 es LTS (soporte a 2029). En el VPS se instala desde el repositorio oficial de MariaDB (`mariadb.org`, rama 11.4) en vez del paquete de Ubuntu 10.11, para que **local = prod en versión mayor**. Las migraciones se mantienen en SQL portable (`DECIMAL`, `DATETIME`, `VARCHAR+CHECK`), así que además corren en 10.11. Costo: un repo apt externo que vigilar en las actualizaciones de seguridad (`unattended-upgrades` lo cubre).
- **Driver: `mysql2`** (promesas, pool, `execute()` con sentencias preparadas). Rechazado el conector `mariadb`: equivalente, pero `mysql2` es el estándar de facto, tiene más soporte (y salida a Kysely si algún día hace falta). Config del pool: `dateStrings: true`, `timezone: 'Z'`, `decimalNumbers: false` (DECIMAL llega como string y se convierte a **centavos enteros** en el borde, ADR-011 §5); sesión `utf8mb4`, `time_zone='+00:00'`, `sql_mode` estricto.
- **Capa de consulta: SQL parametrizado a mano en repositorios** (`modules/*/repo.ts`), tipos de fila escritos a mano y parseados con zod en lecturas críticas. Sin ORM ni Kysely/Drizzle ahora: ~12 tablas, consultas conocidas, y ADR-010/012 exigen `SELECT` con columnas explícitas (un ORM empuja a `SELECT *`). Revisar si las tablas pasan de ~25 o los repos pasan de ~1.5k líneas (entonces Kysely).
- **Migraciones**: SQL plano `server/db/migrations/NNNN_descripcion.sql`, solo hacia adelante, checksum en `schema_migrations`, `GET_LOCK`, aborta si cambia el checksum de una ya aplicada, expand -> migrate -> contract (todo ADR-010 §5, sin cambio). El runner pasa de `bin/migrate.php` a `server/src/cli/migrate.ts` (~100 líneas, mismo comportamiento). **El mismo comando corre local y en el VPS**: `npm run db:migrate`. Usuarios `alcusa_migrate` (DDL) y `alcusa_app` (DML) también en local, para que los GRANT se prueben desde el día 1.
- **Semillas/fixtures**: `server/db/seed/dev.sql` (promos de ejemplo, cotizaciones de prueba con folios con dígito de control válido) vía `npm run db:seed`; **se niega a correr si `NODE_ENV=production`**. Los tests crean sus datos con builders, no con el seed.
- **Migrar local -> VPS**: no se copian datos locales (son de prueba). El VPS arranca con `db:migrate` sobre BD vacía + `create-admin`. Lo que sí migra es el esquema, que es el mismo archivo.

### 2.4 Port del S8 y del admin
| Pieza | PHP actual / ADR-011 | Node |
|---|---|---|
| Webhook Wompi | `wompi-webhook.php`: HMAC-SHA256 del cuerpo crudo con `WOMPI_API_SECRET`, header `wompi_hash`, `hash_equals`, <=64 KB | `POST /api/wompi-webhook`: parser JSON de esa ruta con `parseAs: 'buffer'` (se firma el **cuerpo crudo**, nunca el re-serializado); `crypto.timingSafeEqual` con comparación previa de longitud; 400 sin loguear cuerpo; transacción con `INSERT payments` y `UNIQUE(wompi_transaction_id)` -> `ER_DUP_ENTRY` = `200 duplicate`; monto contra `payment_intents`; `EsProductiva=false` -> `test`; falla de BD -> spool 0600 + `503` (ADR-011 §8). Nunca `200` sin persistir. |
| create-link | `wompi-create-link.php`: token OAuth + enlace | `fetch` nativo con `AbortSignal.timeout(10_000)`, token cacheado hasta caducar, 1 reintento solo ante error de red/5xx **antes** de crear (la creación del enlace no se reintenta a ciegas: la `reference` única evita duplicado). El monto lo calcula el servidor desde la cotización (ADR-011 §8.1). |
| return | `wompi-return.php` | `GET /api/wompi-return`: solo presentación, valida el hash de retorno, nunca marca pagado. |
| quote-create / quotes/{code} | (B3/B6, solo en ADR) | Se escriben directo en Node (nunca existieron en PHP). Mismas reglas: idempotencia por `idempotencyKey`, folio con `crypto.randomInt` + reintento por `UNIQUE`, 404 uniforme, SELECT explícito sin PII. |
| Admin SSR | PHP SSR | **Fastify + HTML renderizado en servidor** con un helper `html\`\`` de ~30 líneas con autoescape (sin motor de plantillas ni SPA), CSS propio. |
| argon2id | `password_hash` | `node:crypto` `argon2` (nativo en Node >= 24.7, **sin dependencia nativa**), parámetros de ADR-011 §2 (m=64 MiB, t=3, p=1; afinar a ~250 ms en el VPS), hash en formato PHC, rehash al login. Si el runtime del VPS fuera < 24.7 se usa el paquete `argon2`. |
| TOTP | implementación propia | `node:crypto` HMAC-SHA1 RFC 6238, mismas reglas (6 dígitos, 30 s, ±1, anti-replay `totp_last_step`), tests con los vectores del RFC. Secreto cifrado con AES-256-GCM (reemplaza `sodium_crypto_secretbox`), clave en el env. Obligatorio para todo admin, sin excepción. |
| Sesión/cookie | `__Host-alcusa_admin` | `@fastify/cookie`: igual (`Secure; HttpOnly; SameSite=Strict; Path=/`, sin `Domain`), id de 256 bits, se guarda su SHA-256, rotación tras TOTP. En local, `http://localhost` cuenta como contexto seguro en Chrome/Edge/Firefox actuales; no se crea una variante sin `Secure`. |
| CSRF / headers | igual | Token por sesión + verificación de `Origin`/`Sec-Fetch-Site`; `@fastify/helmet` (CSP del admin de ADR-011 §2) y `@fastify/rate-limit` como segunda capa tras Nginx `limit_req`. |
| Ruta protegida | `ADMIN_BASE_PATH` en `config.php` | `ADMIN_BASE_PATH` en `api.env`, nunca hardcodeada; la app recorta el prefijo. En local un valor de ejemplo, no el real. |
| CLI | `bin/*.php` | `server/src/cli/{migrate,create-admin,publish-promotions,retention,replay-webhook-spool}.ts`. `create-admin` conserva todo ADR-011 §2: aborta si no hay TTY (`process.stdout.isTTY`), contraseña CSPRNG impresa una vez, nunca por argv/env, `must_change_password=1`, `--rotate`, `--reset-totp`, `audit_log` con `actor_type=cli`. |
| promotions.json | `PromotionPublisher` PHP + cron | Mismo contrato JSON y mismo tope de 3 promos activas / solape de fechas; escritura atómica (`writeFile` a `.tmp` + `rename`), solo si cambia el hash; se invoca al publicar/archivar y desde un **timer systemd cada 15 min** (`publish-promotions`). Ruta de salida configurable (`PROMOTIONS_OUT_DIR`; local: `public/data/`, ignorado por git). |
| Imágenes de promos | `ImageIngest` PHP (GD) | `sharp` (re-codifica y quita EXIF, mismas listas blancas y límites de ADR-011 §3). Única dependencia nativa; prebuilt para Windows y Linux. |

**Se elimina de `api/`** (después de la paridad de N3, en el mismo PR): `api/wompi-create-link.php`, `api/wompi-return.php`, `api/wompi-webhook.php`, `api/_lib/wompi-client.php`, `api/_lib/wompi-config.php`, y `api/_dev/wompi-smoke.php` (reemplazado por `server/scripts/wompi-smoke.ts`). El directorio `api/` desaparece; toda mención de `.htaccess`/`public_html` en ADR-002 queda histórica. No se conserva PHP en ninguna parte del repo.

### 2.5 Entorno local (sin contenedores)
Instalación (PowerShell, una vez; requiere terminal con permisos para el servicio):
```powershell
winget install --id MariaDB.Server --version 11.4.3.0 --exact --accept-package-agreements --accept-source-agreements
# durante el instalador: puerto 3306, servicio "MariaDB", usuario root con contrasena que va a tu gestor (no al repo), utf8mb4
mariadb --version           # esperado: 11.4.x ; si no esta en PATH: C:\Program Files\MariaDB 11.4\bin
winget install --id HeidiSQL.HeidiSQL --exact   # opcional, cliente grafico
fnm use 24                  # Node ya instalado (24.21); no se instala nada mas
```
Crear BD y usuarios (una vez, como root; las contraseñas viven en `server/.env`, ignorado por git):
```sql
CREATE DATABASE alcusa_dev  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE alcusa_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- alcusa_migrate: ALL sobre alcusa_dev.* y alcusa_test.*; alcusa_app: SELECT,INSERT,UPDATE,DELETE (sin DDL; audit_log solo INSERT/SELECT lo fija 0001)
```
Un script `npm run db:setup-local` (N0) hace esto de forma idempotente leyendo la contraseña de root de `MARIADB_ROOT_PASSWORD` en el shell (no se guarda).

`server/.env.example` (sin secretos; `server/.env` real ignorado por git):
```
NODE_ENV=development
PORT=3001
HOST=127.0.0.1
TRUST_PROXY=false
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=alcusa_dev
DB_APP_USER=alcusa_app
DB_APP_PASSWORD=
DB_MIGRATE_USER=alcusa_migrate
DB_MIGRATE_PASSWORD=
DB_TEST_NAME=alcusa_test
ADMIN_BASE_PATH=/dev-ops-local
SECRETS_KEY=            # 32 bytes base64: cifra el secreto TOTP (generar con el CLI)
IP_HASH_PEPPER=         # base64: hash de IP para rate limit y logs
WOMPI_MODE=mock         # mock|sandbox|live ; live solo en el VPS
WOMPI_APP_ID=
WOMPI_API_SECRET=
WOMPI_API_BASE=
WOMPI_AUTH_URL=
PUBLIC_SITE_URL=http://localhost:4321
PROMOTIONS_OUT_DIR=../public/data
UPLOADS_DIR=./.local/uploads
WEBHOOK_SPOOL_DIR=./.local/webhook-spool
SERVE_STATIC_DIR=       # solo dev/e2e: sirve dist/ desde Fastify; el arranque falla si NODE_ENV=production
```
Un schema zod valida el env al arrancar y **falla rápido** con la lista de variables faltantes (sin imprimir valores). `WOMPI_MODE=live` exige `NODE_ENV=production`.

**Proxy `/api`**: en `astro dev` (puerto 4321 o el que use cada worktree) `vite.server.proxy` envía `/api` y `ADMIN_BASE_PATH` a `127.0.0.1:3001`. Verificar en N0 si `astro preview` respeta el proxy; si no (probable), el e2e y el preview local usan `SERVE_STATIC_DIR=dist` y se abre `http://localhost:3001` (un solo origen, igual que en prod con Nginx, lo cual además prueba cookies y CSP reales).

**Pruebas**: (1) unitarias puras (folio, normalización de WhatsApp, TOTP RFC, HMAC, dinero en centavos) en vitest; (2) **integración contra MariaDB local `alcusa_test`**: `globalSetup` corre `db:migrate`, cada test en transacción o con `TRUNCATE`, HTTP vía `fastify.inject()`; (3) Wompi externo siempre con un servidor falso local (`undici` `MockAgent`), jamás la red; la prueba de humo real a sandbox/live queda manual (`wompi-smoke.ts`, gate de N3); (4) e2e Playwright existente con `PUBLIC_QUOTE_API=http` contra `server` + `alcusa_test`, `webServer` levanta ambos; (5) test de contrato: la respuesta de `GET /api/quotes/{code}` jamás contiene `customer_*`/`delivery_address`. CI necesitará MariaDB como servicio (GitHub Actions `services:`; sigue sin ser contenedor local).

### 2.6 Seguridad por defecto (no negociable, heredada y ahora explícita)
- Rate limit de `GET /api/quotes/{code}`: Nginx `limit_req` 10/min/IP burst 5 **y** app (30 consultas/h, 10 fallos/h por `ip_hash`, tabla `rate_limits`, no memoria del proceso: sobrevive reinicios) -> 429 + `Retry-After` (ADR-012 §4).
- 404 uniforme (mismo cuerpo, cabeceras y consulta única) para inexistente/cancelada/antigua/contingencia; 422 sin tocar la BD; `Cache-Control: no-store`; sin `Set-Cookie`/ETag.
- Sin PII en `GET`; `SELECT` con lista explícita de columnas; test de contrato.
- **Solo SQL parametrizado** (`execute` con `?`); lint (`no-restricted-syntax`) prohíbe plantillas con interpolación en llamadas a `query/execute`.
- Secretos **solo en entorno** (`/etc/alcusa/api.env` en el VPS, 0640), nunca en repo/logs/respuestas; el logger (`pino` con `redact`) enmascara `authorization`, `cookie`, `wompi_hash`, `customer`, `password`, `totp`.
- Logs JSON a stdout (journald); `/api/health` (proceso) y `/api/health/ready` (BD) sin detalles; error handler global con el sobre de ADR-003 y sin stack trace al cliente.
- La app escucha solo en `127.0.0.1`; MariaDB solo en socket/`127.0.0.1`; ufw expone 22/80/443.
- `npm audit` y `lockfile` fijo (versiones exactas, como el FE) en CI; Dependabot/renovación semanal. Menos dependencias = menos superficie: se prefiere `node:crypto` donde alcanza (argon2, TOTP, HMAC, AES-GCM).

## 3. Alternativas consideradas
- **Mantener PHP en el VPS.** Descartado por decisión de Carlos: dos lenguajes, y no hay PHP ni MariaDB local para construir ya. Costo del cambio: reescribir ~570 líneas no desplegadas (bajo) y volver a probar el webhook (se cubre con N3).
- **Node dentro de contenedores / docker-compose local.** Descartado (decisión explícita: sin contenedores; un VPS de 1 servicio no lo justifica).
- **SQLite local, MariaDB en prod.** Descartado: paridad cero en SQL/GRANT/`GET_LOCK`/concurrencia; justo lo que ADR-010 eligió MariaDB para tener.
- **PostgreSQL ahora que cambiamos de pila.** Técnicamente válido, pero no hay driver: cuesta rediseñar tipos/migraciones y reabrir ADR-010 por nada. El camino de salida sigue abierto (SQL portable).
- **Hono / Express / Next/Astro SSR como backend.** Ver tabla; Astro SSR mezclaría el sitio estático (barato y cacheable) con el camino del dinero.
- **PM2.** systemd ya hace todo lo que se necesita.
- **Drizzle/Kysely/Prisma.** Ver §2.3; no por ahora.

## 4. Consecuencias
- Bueno: un solo lenguaje y tipos compartidos FE/BE; BE y BD testeables en local desde hoy; despliegue = copiar `server/dist` + `db:migrate` + `systemctl restart`; menos piezas en el VPS (sin PHP-FPM, sin sodium, sin cron).
- Bueno: URLs limpias y sin `.php`; los contratos no cambian, así que el FE solo cambia 3 constantes.
- Malo: ahora hay un **proceso de larga vida** que supervisar (memoria, reinicios); mitigado con systemd, `/api/health`, límites de memoria (`MemoryMax=512M`) y un monitor externo de uptime. Una caída de la app ya no se arregla "sola" por request como en PHP-FPM.
- Malo: seguridad hecha a mano en `node:crypto` (argon2, TOTP, AES-GCM) en lugar de funciones de PHP probadas por años; mitigado con vectores de prueba oficiales (RFC 6238, argon2) y revisión de `senior-qa` en Q1. Si el equipo prefiere, se cambia a librerías auditadas sin tocar contratos.
- Malo: MariaDB 11.4 difiere del 10.11 que ADR-010 daba por supuesto; mitigado con SQL portable y probando local con la versión de prod.
- Malo: el despliegue ya no es "subir archivos"; `senior-devops` define el pipeline (build -> rsync a `releases/<sha>` -> `db:migrate` -> swap de symlink -> `systemctl restart`/reload -> health check -> rollback por symlink + migración expand/contract).
- Salida: Fastify es HTTP estándar tras Nginx (cambiable por cualquier otro proceso en `:3001`); la BD sale con `mariadb-dump`/SQL portable.

## 5. Plan de construcción (rebanadas, tracer-bullet primero)
Mapea a los IDs de ADR-011 §Plan y ADR-012 §7; `D0` (aprovisionar VPS) se difiere hasta el dominio.

| ID | Dueño | Qué | Depende | Criterios de aceptación (resumen) |
|---|---|---|---|---|
| **N0** (= D1 + esqueleto B1) | senior-dba + senior-be | Instalar MariaDB local; `server/` con Fastify, config zod, pool `mysql2`, logger, `/api/health` y `/health/ready`; runner de migraciones; `0001_init.sql` completa (ADR-010 §3 + delta ADR-012 §2); usuarios `app`/`migrate`; `db:setup-local`, `db:seed`; proxy de `astro dev` | ADR-013 | Ver sección 6 |
| **N1** (= B3 parte 1) | senior-be | `POST /api/quote-create`: contrato final ADR-011 §5, idempotencia, folio 7+1, snapshot completo, `supersedesCode`, rate limits, honeypot | N0 | 201/200/409/422/429 según contrato; tests de integración; folio con vectores de `code.test.ts` |
| **N2** (= B6) | senior-be | `GET /api/quotes/{code}` (404 uniforme, sin PII, rate limit, logs `quote_load`) | N1 | Contrato ADR-012 §3/§4, test de no-PII y de 404 idéntico |
| **N2-FE** (= F2 + F4 cableado) | fe-senior-react | Aplicar deltas §2.2, `PUBLIC_QUOTE_API=http` en dev, e2e contra el servidor local | N1, N2 | Flujo Resumen -> folio real -> cargar por folio, en local, con `alcusa_test` |
| **N3** (= B3 parte 2, S8 portado) | senior-be | `payment_intents`, `wompi-create-link`, `wompi-webhook`, `wompi-return`, spool + replay; borrar `api/*.php`; `wompi-smoke.ts` | N1 | Paridad con ADR-003 + ADR-011 §8; vectores de HMAC; duplicado = `200 duplicate`; falla BD -> spool + 503; **prueba real sandbox/live manual** antes de cualquier despliegue |
| **N4** (= B1 resto + B2 + B5) | senior-be | create-admin, login, sesión, CSRF, TOTP, promos CRUD/publicador/imágenes, vistas | N0 (N3 para ventas) | ADR-011 §2/§3/§4 sin relajar |
| **N5** (= B4 + F3 + F1) | senior-be + fe | contact-submit + antispam; promos dinámicas en la landing | N0 / N4 | ADR-011 §6 |
| **Q1** | senior-qa | Batería de seguridad/resiliencia (auth, CSRF, upload, webhook replay/forjado, rate limits, BD caída, restore) | N1–N5 | ADR-011 §10 |
| **D0** (diferido) | senior-infrastructure -> senior-devops | Aprovisionar el VPS: Ubuntu 24.04, Node 24, MariaDB 11.4 (repo oficial), Nginx, certbot, ufw, systemd units/timers, `api.env`, respaldos (ADR-010 §6), pipeline | dominio transferido | Despliegue de N0..N3 en `dev.` primero |

## 6. N0: criterios de aceptación (senior-dba + senior-be)
**senior-dba**
1. Documenta e instala MariaDB 11.4.x local; `SELECT VERSION()` lo confirma; `utf8mb4_unicode_ci`, `time_zone` UTC.
2. `server/db/migrations/0001_init.sql` cubre las tablas de ADR-010 §3 (+ `quotes.code CHAR(21)`, `quote_items.config/config_schema_version/promo_ref`, `rate_limits`, `schema_migrations`), SQL portable (sin extensiones MariaDB), `CHECK` en estados, FKs, índices; GRANTs de `alcusa_app` (DML) y `alcusa_migrate` (DDL); `audit_log` solo INSERT/SELECT para `app`.
3. `db:migrate` es idempotente (segunda corrida no hace nada), aborta si cambia el checksum de una migración aplicada, usa `GET_LOCK`; `db:seed` con fixtures de ADR-010 y negado en producción.
4. Prueba de portabilidad: el mismo `0001` se aplica sin error en una BD vacía dos veces (drop/recreate) y el `mariadb-dump` resultante se reimporta.

**senior-be**
5. `npm run server:dev` arranca en `127.0.0.1:3001`; `GET /api/health` -> 200 `{status:'ok'}`; `/api/health/ready` -> 200 con BD arriba y 503 sin detalles con BD abajo (test).
6. Env validado por zod; faltantes -> el proceso sale con código != 0 listando nombres, sin valores. `.env.example` completo; `server/.env` en `.gitignore`.
7. Logs JSON con `redact`; request id; error handler con el sobre `{error:{code,message}}`.
8. `npm run server:test` corre unitarias + integración contra `alcusa_test` (migrado por `globalSetup`); incluye el test de tipos contra `QuoteFolioRequest`/`QuoteLoadResponse` del FE y los vectores de `code.ts`.
9. `astro dev` + `server:dev` juntos: `fetch('/api/health')` desde el navegador responde por el proxy. Resultado de la verificación sobre `astro preview` documentado (decide `SERVE_STATIC_DIR`).
10. Lint: sin SQL interpolado; sin `console.log`; sin secretos hardcodeados. Ninguna dependencia fuera de la lista: `fastify`, `@fastify/{cookie,helmet,rate-limit,static}`, `mysql2`, `zod`, `pino` (viene con fastify), `sharp` (N4), `tsx`, `tsup`, `vitest`, `undici` (dev). Cualquier otra -> pedir al arquitecto.

## 7. Contrato que `senior-be` debe persistir (snapshot de cotización emitida)
El FE en modo mock guardará en localStorage lo que el backend real devolverá en `GET /api/quotes/{code}`; por lo tanto N1 debe persistir, **sin pérdida**, de cada `QuoteFolioRequest`:
- Cabecera: `code`, `created_at` (fecha SV `YYYY-MM-DD` para la respuesta), `valid_until`, `delivery_mode` (`pickup|delivery`), `delivery_zone`, `transport_fee`, `total` (y `subtotal = sum(lineTotal)`), `currency='USD'`, `supersedes_quote_id`, `idempotency_key` UNIQUE, y por separado la PII (`customer_name`, `customer_whatsapp`, `consent_at`, `privacy_notice_version`, `delivery_address`) que **nunca** sale en el GET.
- Por ítem (`position` 1..N): `productSlug`, `description`, `qty`, `savedUnitPrice` (= `unitPrice`), `savedLineTotal` (= `lineTotal`), `promoRef`, `configSchemaVersion`, y `config` = **snapshot completo del `CartItem` sin `id`** (todas las claves de `ITEM_FIELD_KEYS`; <= 4 KB; se devuelve byte-equivalente tras `JSON.parse`).
- Dinero: dólares decimales de 2 decimales en el borde; `DECIMAL(10,2)` en BD; sumas en centavos.
- Forma devuelta = `QuoteLoadResponse` de `src/integrations/quotes/types.ts` (el mock del FE se alinea con esa misma forma; ahí está la verdad de la paridad mock/http).

## 8. Preguntas abiertas
1. ¿Hay una URL de webhook/retorno de Wompi ya registrada en producción (con `.php`)? Decide el alias temporal de §2.2.
2. Longitud máxima de `identificadorEnlaceComercio` en Wompi SV (sigue siendo gate de N3).
3. Confirmar Node 24 LTS en el VPS (NodeSource) y MariaDB 11.4 vía repo oficial al aprovisionar (D0).
