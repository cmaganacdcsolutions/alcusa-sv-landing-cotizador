# Preguntas abiertas para ALCUSA — revisión 2026-09-29

Cada una con default: sin respuesta se construye con el default y se marca `[confirmar]`.
Se fusionan en `client-questions.md` (numeración #24+) cuando el cliente responda.

| # | Pregunta | Default propuesto | Afecta |
|---|---|---|---|
| Q1 | ¿Quién actualiza las Promociones del mes y cómo (archivo de datos vs CMS)? | CDC/dueño edita `src/content/promotions.ts` y se despliega; sin CMS. Si quieren autonomía: ciclo aparte con CMS headless. | R3 |
| Q2 | ¿Qué campos lleva una promoción? | título, descripción corta, imagen, producto/subcategoría vinculada, precio antes, precio ahora (opcionales), % calculado, vigencia desde/hasta, condiciones cortas. Vencida = se oculta. | R3 |
| Q3 | ¿Los productos del catálogo llevan precio visible? | Sí "Desde $X" donde el motor lo calcula; sin precio: "Cotiza con un asesor". | R1, R2 |
| Q4 | ¿Hay fotos por subcategoría? | No aún: placeholders rotulados; el cliente entrega fotos y se sustituyen por convención `public/catalogo/<slug>.webp` sin tocar código. | R2 |
| Q5 | ¿Contenido del PDF? | Logo, N.º de cotización (ALC-AAAAMMDD-NNN), fecha, vigencia (15 días), datos del cliente (nombre, teléfono, municipio), tabla de ítems (producto, medidas, color, cant., precio), transporte, total, esquema 80/20, nota IVA [depende de #5 previa], contacto. | R4 |
| Q7 | ¿"Puertas de bisagra" y "Templada 10 mm" se cotizan por medida como las demás? | Sí: ya están en el motor (hinged: alto fijo 1.85 m; tempered: 10 mm, alto fijo 2.00 m). Se conservan. | R5 |
| Q8 | En L: ¿Aquaclara, Frosted y Aquafold son acabados con precio distinto? ¿Medida fija 0.80×0.80 como hoy? | Mismo motor `corner`, acabado como opción; precio distinto no disponible = "asesor". | R1, R5 |
| Q9 | Jardín: ¿1/2/3 hojas y "2 fijas+2 corredizas / 1 fijo+3 corredizas" tienen tabla de precios? | 1-3 hojas: motor `garden` actual (verificar cobertura). Combinaciones: "asesor" hasta tener tabla. | R5 |
| Q10 | ¿Puertas rectas tiene subtipos? | Una sola subcategoría. | R1 |
| Q11 | ¿Dónde va la Galería y qué pasa con Cómo funciona / Confianza / Info importante? | Galería → /catalogo; las otras se quedan en landing bajo Promos+CTA; hero se conserva. Se valida en el diseño. | R0 diseño, R3 |
| Q12 | ¿Cuántas promos simultáneas y sin ninguna? | 1-4; sin vigentes: bloque oculto, CTA permanece. | R3 |
| Q13 | ¿+503 7680-2410 es el mismo número del botón actual de WhatsApp? | Sí; una constante `WHATSAPP_NUMBER`. | R4 |
| Q14 | ¿Ventanas Francesa/Bilbao: una subcategoría o dos? | Dos subcategorías (Francesa, Bilbao) bajo Ventanas, mismo motor. | R1 |

Nota: la entrega del PDF a WhatsApp (antes Q6) quedó DECIDIDA por el usuario el 2026-09-29 (Web Share con archivo en móvil; descarga + wa.me prellenado en desktop/fallback). Ya no es pregunta al cliente. Q6 queda sin uso para no renumerar.
