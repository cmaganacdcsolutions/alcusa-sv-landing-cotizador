# Slices R0–R6 — Revisión con cliente 2026-09-29

Pitch: `../pitch-revision-cliente-2026-09-29.md` · Preguntas: `../client-questions-revision-2026-09-29.md`
DoD común (además del de backlog.md): rama `dev`, gates en worktree aparte (no en 03-dev),
fidelidad 100% contra el board aprobado, viewports iOS 390 / Android 412 / desktop 1920,
copy sin precios inventados, HANDOFF escrito. Hill chart: U = uphill (incógnitas), D = downhill.

## R0 — Diseño en el canvas (U) · senior-uiux-design (+ prototype-maker) · P1 · M
Boards nuevos en https://claude.ai/artifact/38smLC97mxBPp5RT9iKmED, mobile iOS + Android + desktop:
landing nueva, /catalogo índice, categoría/subcategorías, detalle, sección Promos, estados
(vacío/sin promos, sin foto, "Cotiza con asesor"), resumen de cotizador con botón PDF y hoja
de compartir, plantilla del PDF (A4).
AC:
- Given el canvas, When se revisa, Then existe un board por cada pantalla/estado listado en los 3 viewports.
- Given cada board, When lo lee fe-senior-react, Then trae medidas, tokens, iconos y copy (sin "lorem").
- Given la landing, Then contiene SOLO topbar, hero, Promos, CTA catálogo y lo que Q11 decida conservar; ningún grid de productos.
- Given el diseño, Then el cliente/usuario lo aprueba explícitamente antes de R2/R3/R4-UI.
Nota: R1 (datos) NO espera al diseño.

## R1 — Modelo de datos del catálogo + tracer /catalogo→/cotizador (U) · fe-senior-react + senior-be · P1 · M · Depende: sf-audit (no bloquea), S2, S7
Vertical mínima: datos → página índice → deep link → cotizador preselecciona.
Tareas (≤5): T1.1 tipos+datos (`Category`, `Subcategory`, `Variant`, `slug`, `quoterModel`, `fromPrice?`, `photo?`, `advisorOnly?`) reemplazando/derivando de `CATALOG_PRODUCTS`; T1.2 test de integridad; T1.3 ruta `/catalogo` con 3 tarjetas desde el modelo (estilo provisional); T1.4 parseo `?producto=` en cotizador; T1.5 ADR de estructura de datos (arquitecto).
AC:
- Given el modelo, When corre el test, Then cada subcategoría de la taxonomía canónica existe con slug único y exactamente un `quoterModel` o `advisorOnly=true`.
- Given cada subcategoría con `quoterModel`, When el test invoca el motor con medidas mínimas válidas, Then `fromPrice` == mínimo calculado (guardia como catalog.test.ts actual).
- Given `/catalogo`, When carga, Then muestra 3 categorías con sus nombres exactos (Puertas de baño, Puertas de jardín, Ventanas) y cada una enlaza a su página.
- Given `/cotizador?producto=<slug válido>`, When carga, Then el paso 0 llega con ese producto seleccionado y avanza al paso de medidas; Given slug inválido, Then cae al paso 0 normal sin error de consola.
- Given `advisorOnly`, When el usuario elige Cotizar, Then se abre WhatsApp con mensaje prellenado del producto, sin precio.
- Lint+types+unit+build verdes en worktree de gates.

## R2 — Página /catalogo completa (D) · fe-senior-react · P2 · M · Depende: R0, R1
Índice → página de categoría → subcategorías → detalle con CTA. Estados: cargando (estático: n/a), sin foto, advisorOnly, categoría vacía (no debería existir).
AC:
- Given `/catalogo/<categoria>`, When carga, Then lista todas sus subcategorías del modelo en el orden de la taxonomía (Puertas de baño: Templadas, Rectas, En L, Bisagra; Jardín: 1, 2, 3 hojas, Más opciones; Ventanas: Francesa, Bilbao).
- Given "Puertas en forma de L", Then muestra Aquaclara en L, Frosted en L y Aquafold en L; Given "Más opciones para tu jardín", Then muestra "2 fijas + 2 corredizas" y "1 fijo + 3 corredizas".
- Given un detalle, When se pulsa "Cotizar este producto", Then navega a `/cotizador?producto=<slug>` (o WhatsApp si advisorOnly).
- Given precio calculado, Then muestra "Desde $X" igual al motor; Given sin precio, Then "Cotiza con un asesor" y ningún $.
- Given falta de foto, Then placeholder rotulado (no imagen rota) — AC de test: ninguna `<img>` con 404.
- Given cada página, Then una sola h1, breadcrumb, foco visible, navegable por teclado; responsive suite 390/412/1920 sin overflow horizontal.
- Given la Galería (Q11 default), Then aparece al pie de /catalogo.
- Fidelidad contra boards de R0.

## R3 — Landing: Promociones del mes + CTA al catálogo; catálogo fuera (D) · fe-senior-react · P1 · M · Depende: R0, R1 (para links)
Incluye limpiar la landing y actualizar topbar/drawer.
AC:
- Given `/`, When carga, Then NO renderiza el grid de catálogo ni la galería; renderiza Promociones del mes y un CTA "Ver catálogo" → `/catalogo`.
- Given `promotions.ts` con 3 promos, 2 vigentes y 1 vencida (fecha fija en test), When se renderiza, Then aparecen 2 y se muestran precio antes tachado, precio ahora y vigencia "Hasta <fecha>".
- Given 0 promos vigentes, Then el bloque de promos no se renderiza y el CTA permanece.
- Given una promo vinculada, When se pulsa su CTA, Then va a `/cotizador?producto=<slug>` o al detalle de catálogo.
- Given una promo con precio ahora que no coincide con el motor, Then el test de integridad lo marca (la promo declara `precioPromo` explícito; nunca se calcula ni se contradice sin marcar).
- Given topbar/drawer, Then "Catálogo" enlaza a `/catalogo`; Given `/#catalogo` o `/#galeria`, Then redirige a `/catalogo`.
- Given cambio de landing, Then los e2e de landing/ios390 previos se actualizan (no se borran silenciosamente) y pasan; responsive 135/135 equivalente.
- Hero, contacto/footer revisados según Q11 y board R0.

## R4 — PDF de cotización + WhatsApp (U) · senior-software-architect (ADR) → fe-senior-react (+ senior-be solo si el ADR pide PHP) · P1 · L · Depende: R0, S7 (cart); no depende de R5
Decisión del usuario (2026-09-29): móvil = `navigator.share({files:[pdf]})`; desktop o sin soporte = descarga + `wa.me/50376802410?text=...`. El ADR solo decide librería PDF y si se genera en cliente (recomendado: cliente, import dinámico, sin guardar datos del cliente).
Tareas: T4.1 ADR librería PDF/generación; T4.2 generación desde el carrito; T4.3 UI botón + flujo de envío (share / fallback); T4.4 numeración y vigencia; T4.5 e2e.
AC:
- Given carrito con ≥1 ítem y datos de contacto válidos, When "Descargar cotización (PDF)", Then se genera un PDF A4 con logo, N.º de cotización, fecha, vigencia, ítems (producto/medidas/color/cant./precio), transporte y total idénticos al resumen en pantalla (test: total PDF == total resumen).
- Given carrito vacío, Then el botón está deshabilitado con mensaje.
- Given navegador con `navigator.canShare({files:[pdf]})` verdadero (móvil), When "Enviar por WhatsApp", Then se llama `navigator.share` con el archivo PDF, título y texto; Then no se abre wa.me.
- Given `canShare` falso o `navigator.share` ausente (desktop/no soportado), When "Enviar por WhatsApp", Then se descarga el PDF y se abre `https://wa.me/50376802410?text=<encoded>` en pestaña nueva, con texto que incluye N.º de cotización, resumen de ítems/total y "adjunto el PDF descargado", y se muestra aviso de que el usuario debe adjuntar el archivo.
- Given el share sheet abierto, When el usuario lo cancela (`AbortError`), Then no se muestra error, no se abre wa.me, no se descarga nada extra y el botón queda de nuevo disponible.
- Given `navigator.share` falla con un error distinto de AbortError, Then se cae al flujo de fallback (descarga + wa.me) y se informa al usuario.
- Given el número, Then +503 7680-2410 sale de una única constante `WHATSAPP_NUMBER` compartida con el botón del topbar.
- Given error de generación del PDF, Then mensaje accionable y fallback al texto de WhatsApp actual sin PDF.
- Given el PDF, Then abre en iOS Safari, Android Chrome y desktop, texto seleccionable, ≤500 KB con 5 ítems.
- Given la librería PDF, Then carga por import dinámico al pulsar el botón (no entra al JS inicial de /cotizador; el ADR fija el presupuesto en KB).
- Given la generación, Then ningún dato del cliente sale del navegador (sin endpoint, sin terceros).
- Tests: unit de la decisión share/fallback con `navigator` mockeado (3 ramas: soporta, no soporta, AbortError); e2e Chromium emulando móvil con `navigator.share` stub y desktop con `canShare` falso.
- Limitación a documentar en QA: la prueba real de share con archivo hacia WhatsApp solo es verificable en dispositivo físico iOS/Android (checklist manual).

## R5 — Cotizador adopta la taxonomía nueva (D) · fe-senior-react + senior-be · P2 · M · Depende: R1
Paso 0 del cotizador deja de tener 6 tarjetas planas y usa categorías→subcategorías del modelo; ventanas eligen Francesa/Bilbao; L elige acabado; jardín elige hojas/combinación. Carrito S7 conserva ítems (no re-plumb).
AC:
- Given paso 0, Then ofrece las 3 categorías y, al elegir, sus subcategorías del modelo; las `advisorOnly` muestran "Cotiza con asesor" y no entran al carrito con precio.
- Given cada subcategoría cotizable, When se ingresan medidas válidas, Then el precio coincide con el del motor previo para el mismo caso (tests de regresión: los casos de S2 siguen verdes sin editar).
- Given Templada 10 mm y Bisagra, Then se cotizan por medida como hoy (Q7), alto fijo respectivo.
- Given un ítem de L con Aquaclara/Frosted/Aquafold, Then el resumen y el PDF lo muestran con el acabado.
- Given un carrito S7 con 3 ítems de categorías distintas, Then total, transporte único y checkout S8 no cambian de valor.
- Given `?producto=` (R1), Then sigue funcionando con los slugs nuevos.
- e2e cotizador-cart/checkout actualizados y pasan en 390/412/1920.

## R6 — Limpieza y QA de la revisión (D) · senior-qa · P2 · S · Depende: R2–R5 (se fusiona en S11)
Nice-to-have recortable: sitemap/`/catalogo` en JSON-LD, redirects, e2e end-to-end "landing → promo → catálogo → cotizar → PDF".
AC:
- Given el flujo landing→promo→cotizar→PDF, Then e2e verde en 3 viewports.
- Given todos los links internos, Then ninguno apunta a anclas eliminadas (test de enlaces).
- a11y (axe) sin críticos en `/`, `/catalogo`, `/catalogo/*`, resumen con PDF.

## Riesgos / supuestos
- Precios de acabados en L y combinaciones de jardín pueden no existir (Q8/Q9) → advisorOnly.
- R4 sigue uphill por PDF en cliente (fuentes, peso, iOS Safari); el método de entrega ya está decidido. Si Web Share con archivo falla en dispositivo real, el fallback descarga+wa.me cubre; no se extiende.
- R0 es el camino crítico; R1 corre en paralelo para no esperar.

## HANDOFF
Siguiente: senior-uiux-design (R0). Paralelo: senior-software-architect (ADR estructura de datos R1 + ADR librería PDF R4). Luego fe-senior-react R1→R3→R2→R5→R4-UI.
