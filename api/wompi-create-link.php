<?php
declare(strict_types=1);

// POST /api/wompi-create-link.php  (ADR-003)
// Creates a Wompi hosted payment link. Secrets stay server-side.
//
// Request  { "pct": 80|100, "total": 1148.00, "items": [{ "name": "...", "subtotal": 123.45 }] }
// 201      { "urlEnlace": "https://lk.wompi.sv/xxxx", "reference": "ALC-2026-7F3A9C", "amount": 918.40 }
// 4xx/5xx  { "error": { "code": "...", "message": "..." } }
//
// AMOUNT TRUST MODEL (Phase 1, documented in docs/ops/wompi-go-live.md):
// the browser never sends the amount to charge. It sends the cart total and
// the 80/100 choice; the server derives the amount, bounds-checks the total,
// checks that the item subtotals add up (transport = total - sum, bounded),
// and stores the expected amount per reference so return + webhook can
// reconcile. A full PHP re-price of the cart (Phase 2) is proposed there.

require_once __DIR__ . '/_lib/wompi-client.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    wompi_fail(405, 'method_not_allowed', 'Método no permitido.', ['Allow: POST']);
}
if (!wompi_is_configured()) {
    wompi_fail(503, 'not_configured', 'El pago en línea no está disponible por ahora.');
}

// Same-site only: the Origin header (sent by browsers on fetch POST) must match.
$base = rtrim((string) wompi_env('WOMPI_REDIRECT_BASE'), '/');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && rtrim($origin, '/') !== $base) {
    wompi_log('create', 'origin_rejected');
    wompi_fail(403, 'forbidden', 'Solicitud no permitida.');
}

// Naive per-IP rate limit (file based): 10 links / 10 minutes.
$rlDir = wompi_data_dir('ratelimit');
$rlFile = $rlDir . '/' . hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . wompi_env('WOMPI_APP_ID')) . '.json';
$hits = [];
$raw = @file_get_contents($rlFile);
if ($raw !== false) {
    $hits = array_values(array_filter((array) json_decode($raw, true), static fn ($t) => is_int($t) && $t > time() - 600));
}
if (count($hits) >= 10) {
    wompi_fail(429, 'rate_limited', 'Demasiados intentos. Intente de nuevo en unos minutos.', ['Retry-After: 600']);
}
$hits[] = time();
@file_put_contents($rlFile, json_encode($hits), LOCK_EX);

// Input validation (layer 1: shape).
$body = file_get_contents('php://input', false, null, 0, 8193);
if ($body === false || strlen($body) > 8192) {
    wompi_fail(413, 'payload_too_large', 'Solicitud demasiado grande.');
}
$in = json_decode($body, true);
if (!is_array($in)) {
    wompi_fail(400, 'invalid_json', 'Solicitud inválida.');
}
$pct = $in['pct'] ?? null;
$total = $in['total'] ?? null;
$items = $in['items'] ?? null;
if (!in_array($pct, [80, 100], true) || !is_numeric($total) || !is_array($items) || count($items) < 1 || count($items) > 30) {
    wompi_fail(422, 'invalid_request', 'Datos del pedido inválidos.');
}
$total = round((float) $total, 2);
$minTotal = (float) wompi_env('WOMPI_MIN_TOTAL', '1');
$maxTotal = (float) wompi_env('WOMPI_MAX_TOTAL', '20000');
$maxTransport = (float) wompi_env('WOMPI_MAX_TRANSPORT', '250');
if ($total < $minTotal || $total > $maxTotal) {
    wompi_fail(422, 'invalid_total', 'El monto del pedido está fuera de rango.');
}

// Business rules (layer 2): item subtotals must add up; the remainder is
// transport, a bounded non-negative amount.
$sum = 0.0;
$names = [];
foreach ($items as $it) {
    if (!is_array($it) || !isset($it['name'], $it['subtotal']) || !is_string($it['name']) || !is_numeric($it['subtotal'])) {
        wompi_fail(422, 'invalid_items', 'Datos del pedido inválidos.');
    }
    $sub = (float) $it['subtotal'];
    if ($sub < 0 || $sub > $maxTotal) {
        wompi_fail(422, 'invalid_items', 'Datos del pedido inválidos.');
    }
    $sum += $sub;
    $names[] = mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $it['name']) ?? ''), 0, 120);
}
$transport = round($total - $sum, 2);
if ($transport < -0.01 || $transport > $maxTransport) {
    wompi_log('create', 'total_mismatch', ['total' => $total, 'sum' => round($sum, 2)]);
    wompi_fail(422, 'invalid_total', 'El monto del pedido no coincide con sus productos.');
}

$amount = wompi_amount($total, (int) $pct);
$reference = wompi_new_reference();
$webhookUrl = (string) wompi_env('WOMPI_WEBHOOK_URL');
$now = time();

$payload = [
    'identificadorEnlaceComercio' => $reference,
    'monto' => $amount,
    'nombreProducto' => 'Pedido ALCUSA ' . $reference . ((int) $pct === 80 ? ' (anticipo 80%)' : ' (pago total)'),
    // Only card payments. AMEX cannot be excluded through this API; it is
    // excluded by the card group (idGrupoTarjetas) configured in the panel.
    'formaPago' => [
        'permitirTarjetaCreditoDebido' => true,
        'permitirPagoConPuntoAgricola' => false,
        'permitirPagoEnCuotasAgricola' => false,
        'permitirPagoEnBitcoin' => false,
        'permitePagoQuickPay' => false,
    ],
    'infoProducto' => [
        'descripcionProducto' => mb_substr(implode(' | ', $names), 0, 1500),
    ],
    'configuracion' => [
        // A payment-link redirect gets ?identificadorEnlaceComercio&idTransaccion&idEnlace&monto&hash
        // appended. Our endpoint validates the hash server-side and then
        // sends the browser to #cotizador/7-resultado.
        'urlRedirect' => $base . '/api/wompi-return.php',
        'urlRetorno' => $base . '/#cotizador/5-forma-pago',
        'urlWebhook' => $webhookUrl,
        'esMontoEditable' => false,
        'esCantidadEditable' => false,
        'cantidadPorDefecto' => 1,
        'duracionInterfazIntentoMinutos' => 30,
        'notificarTransaccionCliente' => true,
    ],
    'vigencia' => [
        'fechaInicio' => gmdate('Y-m-d\TH:i:s\Z', $now),
        'fechaFin' => gmdate('Y-m-d\TH:i:s\Z', $now + 86400),
    ],
    'limitesDeUso' => ['cantidadMaximaPagosExitosos' => 1],
];
$notify = wompi_env('WOMPI_NOTIFY_EMAILS');
if ($notify !== null) {
    $payload['configuracion']['emailsNotificacion'] = $notify;
}
$cardGroup = wompi_env('WOMPI_CARD_GROUP_ID');
if ($cardGroup !== null) {
    $payload['idGrupoTarjetas'] = $cardGroup;
}

try {
    $res = wompi_api('POST', '/EnlacePago', $payload);
} catch (RuntimeException $e) {
    wompi_log('create', 'upstream_exception', ['code' => $e->getMessage(), 'ref' => $reference]);
    wompi_fail(502, 'payment_unavailable', 'No pudimos iniciar el pago. Intente de nuevo o escríbanos por WhatsApp.');
}
$url = $res['body']['urlEnlace'] ?? null;
if ($res['status'] < 200 || $res['status'] >= 300 || !is_string($url) || !str_starts_with($url, 'https://')) {
    wompi_log('create', 'upstream_error', ['status' => $res['status'], 'ref' => $reference]);
    wompi_fail(502, 'payment_unavailable', 'No pudimos iniciar el pago. Intente de nuevo o escríbanos por WhatsApp.');
}

wompi_order_save($reference, [
    'reference' => $reference,
    'amount' => $amount,
    'total' => $total,
    'pct' => (int) $pct,
    'idEnlace' => $res['body']['idEnlace'] ?? null,
    'productive' => $res['body']['estaProductivo'] ?? null,
    'status' => 'pending',
    'created' => gmdate('c'),
]);
wompi_log('create', 'link_created', [
    'ref' => $reference,
    'amount' => $amount,
    'pct' => (int) $pct,
    'productive' => $res['body']['estaProductivo'] ?? null,
]);

wompi_json(201, ['urlEnlace' => $url, 'reference' => $reference, 'amount' => $amount]);
