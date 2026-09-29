# Pitch — Revisión con cliente 2026-09-29 (catálogo propio + promos + PDF)

Status: shaped. Pendiente: boards en el canvas (diseño primero) y respuestas del cliente
(`client-questions-revision-2026-09-29.md`, cada pregunta con default).

## Problem
Hoy la landing mezcla todo: hero, catálogo, galería, cotizador. El dueño quiere que quien
entra vea primero lo que vende ESTE mes (Promociones del mes) y que el catálogo completo
viva aparte, organizado como piensa el cliente final: Puertas de baño, Puertas de jardín,
Ventanas. Además, quien arma su cotización hoy solo la "envía" como texto de WhatsApp; el
cliente quiere mandar un PDF formal al +503 7680-2410 para que el taller tenga un documento.
El catálogo actual (6 tarjetas planas en `src/content/catalog.ts`) no refleja subcategorías
reales (Aquaclara/Frosted/Aquafold en L, 1/2/3 hojas, fijas+corredizas), no hay dónde
promocionar ofertas y la cotización no es un documento.

## Appetite
**Big Batch acotado, ~2 semanas**, después de sf-audit y compitiendo con S8/S10 por
capacidad (ver orden en backlog). Si no cabe: se recorta scope (R6 y variantes "asesor"
primero), no se extiende. Circuit breaker: una R-slice que exceda su tamaño vuelve a shaping.

## Solution (fat marker)
- **Rutas**: `/` (hero, topbar, Promociones del mes, CTA "Ver catálogo", contacto/footer),
  `/catalogo` (índice de 3 categorías → subcategorías → detalle), `/cotizador`, `/contacto`.
- **Modelo de datos único** (categorías → subcategorías → variantes) con `quoterModel` que
  mapea cada nodo al motor de precios existente. Lo consumen /catalogo, promos y cotizador.
- **/catalogo**: índice (3 tarjetas) → categoría con subcategorías → detalle con foto,
  descripción, medidas y CTA "Cotizar este producto" → `/cotizador?producto=<id>`
  con selección precargada.
- **Promociones del mes**: sección de landing alimentada por archivo de datos versionado
  (`src/content/promotions.ts`) con vigencia; vencida se oculta; sin vigentes queda solo el CTA.
- **PDF**: botón en el resumen del cotizador. Generación y entrega a WhatsApp = decisión del
  arquitecto (ADR solo de librería PDF / generación en cliente; el método de entrega ya está decidido, ver Rabbit hole 1).

Taxonomía canónica (cambios 3-4 del cliente):
- Puertas de baño: Templadas (10 mm única) · Rectas · En L (Aquaclara, Frosted, Aquafold) · De bisagra
- Puertas de jardín: 1 hoja corrediza · 2 hojas · 3 hojas · "Más opciones para tu jardín" (2 fijas + 2 corredizas; 1 fijo + 3 corredizas)
- Ventanas: Francesa · Bilbao

## Rabbit holes (ya decididos)
1. **wa.me no adjunta archivos.** DECIDIDO por el usuario (2026-09-29): móvil = Web Share API
   con el PDF (`navigator.share({files})`, se verifica con `navigator.canShare`); desktop o
   navegador sin soporte = se descarga el PDF y se abre `wa.me/50376802410` con mensaje
   prellenado (N.º de cotización, resumen, aviso "adjunto el PDF descargado"). Cancelar el
   share sheet no es error. El arquitecto solo decide la librería PDF y si se genera en cliente.
2. **Sitio estático**: promos sin CMS este ciclo (archivo de datos).
3. **Motor de precios**: subcategorías nuevas (acabados en L, combinaciones fijas+corredizas)
   pueden no tener tabla. Se mapean al motor donde exista; el resto muestra "Cotiza con un
   asesor" (WhatsApp). Nunca se inventa un precio.
4. **Fotos**: sin foto real por subcategoría, placeholder de marca rotulado, no stock disfrazado.
5. **Anclas/SEO**: la landing pierde `#catalogo`/`#galeria`; actualizar drawer/links y
   redirigir `/#catalogo` → `/catalogo`.
6. **Galería** (hoy en landing) sin destino dicho por el cliente: default se mueve a /catalogo.
7. **Diseño primero**: R1+ no arrancan sin boards aprobados (iOS/Android mobile web + desktop).
8. **Gates en worktree aparte** (regla STATE.md): nunca correr build/tests en 03-dev con el dev server del usuario.

## No-gos
- CMS/panel admin; login; nueva pasarela (Wompi sigue en S8).
- WhatsApp Business API / envío server-side automático.
- Carrito/checkout dentro de /catalogo (solo lleva al cotizador).
- Re-plumbing del motor de precios o del carrito S7 (solo se extiende el mapeo).
- Deploy/DNS/Hostinger. Buscador, filtros, favoritos.

## Success signal
- De `/` a `/cotizador` con producto precargado en ≤3 clics vía catálogo.
- 100% de subcategorías alcanzables desde /catalogo con destino en cotizador (cotizable o "asesor").
- PDF con número, ítems y total abre en iOS, Android y desktop.
- El dueño actualiza las promos editando un solo archivo en <10 min (o el método de Q1).
