# Preguntas para ALCUSA — reunión 2026-09-29

Una sola lista, consolidada y priorizada. **BLOQUEA** = no podemos salir a
producción (go-live) sin esa respuesta. **Deseable** = no bloquea el
desarrollo de este ciclo (usamos placeholder `[confirmar]`), pero sí
bloquea el ciclo siguiente (Hostinger, DNS, correo) o la publicación final
de esa cifra.

## Bloquea el go-live

1. **¿Quién es dueño de la cuenta Wompi y de sus llaves API?** Este
   ciclo integramos Wompi solo en modo mock/sandbox local; para salir a
   producción necesitamos que ustedes nos compartan (o creen) la cuenta y
   las llaves reales, y confirmen si siguen usando la de
   `alcusa-tienda.alcusasv.chatgpt.site` o si abrimos una nueva.
2. **Dominio y DNS:** ¿el sitio nuevo reemplaza `www.alcusasv.com`? ¿Qué
   pasa con la tienda en `chatgpt.site`? Necesitamos esto antes de
   planear el ciclo de despliegue.
3. **Regla de recargo por color bronce:** la tarjeta promocional implica
   +10%, pero la tabla C del cotizador implica hasta +50% sobre la banda
   promo. ¿Cuál es la correcta? (Por ahora programamos la de la tabla,
   verificada contra la UI en vivo.)
4. **Transporte cobrado una sola vez por pedido:** el sitio nuevo unifica
   el carrito y cobra el transporte **una vez por pedido**, no por unidad
   como lo hacía el sistema anterior en ventanas/bisagra/jardín.
   ¿Confirman este cambio de comportamiento?
5. **IVA:** ¿los precios mostrados ya incluyen impuestos? Ustedes emiten
   "factura normal o crédito fiscal" — confirmar si no hace falta una
   línea de impuesto separada.
6. **Zonas de entrega:** ¿la lista de 23 municipios está completa y
   vigente? ¿Qué debe pasar si el cliente está fuera de esas 23 zonas
   (solo cotización manual, o ampliamos la tabla)?
7. **Logo vectorial:** no existe hoy un archivo AI/EPS/SVG del wordmark.
   Necesitamos que nos compartan el archivo original o nos autoricen
   presupuestar un redibujo vectorial (versión a color + versión blanca).
8. **Fotos reales del producto:** las fotos "hero" actuales son stock
   genérico sin relación con ALCUSA. Necesitamos fotografía propia del
   producto instalado, o autorización explícita para seguir usando la
   interina (`product-ventana-bilbao.jpeg`).
9. **Horario de atención y correo de contacto:** no están publicados en
   ninguno de los dos sitios actuales; los necesitamos para la sección de
   Contacto y para los datos estructurados (SEO).
10. **NIT / registro fiscal y razón social exacta** para el pie de página
    y los documentos de cotización/factura.
11. **Texto de WhatsApp para confirmar cotización:** confirmamos que el
    mensaje debe iniciar exactamente con *"Hola ALCUSA, quiero confirmar
    esta cotización:"* — avisar si prefieren otro texto.
12. **Plazo de entrega:** el sitio actual dice "8–10 días hábiles" en
    unos lugares y `[PLAZO — confirmar]` en otros. ¿Cuál es el plazo real
    vigente hoy?

## Deseable (no bloquea el desarrollo de este ciclo)

13. **Años de experiencia:** 35 (sitio principal) vs 39 (tienda) —
    mientras tanto no imprimimos ninguna cifra.
14. **Clientes atendidos:** "+10,000 puertas cambiadas" vs "+15,000
    clientes satisfechos" — confirmar una cifra verificada.
15. **Métodos de pago a mantener:** ¿solo enlace Wompi (80/20), o también
    transferencia/efectivo y cuotas Banco Agrícola Tasa 0% (3/6/9/12),
    hoy ocultas en el código?
16. **Inversión de precio en puertas de jardín:** el precio por área a
    veces sale más barato que la promo fija (ej. 1.00×2.10 = $399 vs
    promo $410) — ¿es intencional?
17. **Precio "decorado" bisagra 40cm = $449** parece error de transcripción
    vs el valor de 50cm ($355) — confirmar el precio correcto.
18. **Alcance más allá del catálogo actual:** ¿el sitio nuevo debe incluir
    los servicios no cotizados del sitio 1 (puertas de oficina, fachadas,
    divisiones, pizarras, espejos/vitrales, sillas y mesas)? ¿Mantenemos
    la promo "Modelo Flores + espejo gratis"?
19. **Derechos de foto de referencia de jardín** ("Fuente: BBC
    Menuiseries") — necesitamos permiso de uso o la retiramos.
20. **Azul oficial de marca:** #2B6CA3 (sitio 1) vs #073B92/#0956D8
    (tienda, ya adoptado en `tokens.json`) — asumimos que el de la tienda
    es el correcto; confirmar.
21. **¿Mantener la asesoría gratis "Remodela tu baño" (30 min)** como CTA
    del sitio nuevo?
22. **Tasa 0% con tarjeta de crédito:** ¿sigue vigente esa promoción con
    Wompi?
23. **Seguidores en redes sociales:** no citamos ninguna cifra (el dato de
    TikTok recuperado en el descubrimiento no es creíble) — si quieren
    mostrar un número, debe verificarse manualmente en cada app.

## Acceso a Hostinger (para el ciclo siguiente, no para este)

No lo necesitamos todavía — este ciclo termina en `dev` local con pruebas
verdes, sin desplegar. Para poder planear el ciclo de despliegue sí
vamos a necesitar, cuando llegue el momento:
- Tipo de plan de Hostinger contratado.
- Acceso al hPanel (usuario con permisos de administrador).
- Confirmar si el plan incluye Node.js/SSH, o si es hosting solo-PHP
  (esto cambia por completo cómo desplegamos).
