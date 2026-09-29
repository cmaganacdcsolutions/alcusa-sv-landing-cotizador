<?php
declare(strict_types=1);

// POST /api/wompi-webhook.php  (ADR-003, confirmed 2026-09-29)
// Wompi header `wompi_hash` = lowercase hex HMAC-SHA256 of the EXACT raw body,
// keyed with the business API Secret. 400 on mismatch, 200 on success or
// duplicate (Wompi retries until it gets a 2xx). No DB: flat-file records
// outside the webroot, idempotent per IdTransaccion.

require_once __DIR__ . '/_lib/wompi-config.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    wompi_fail(405, 'method_not_allowed', 'Método no permitido.', ['Allow: POST']);
}
$secret = wompi_env('WOMPI_API_SECRET');
if ($secret === null) {
    wompi_log('webhook', 'not_configured');
    wompi_fail(503, 'not_configured', 'No disponible.');
}

$raw = file_get_contents('php://input', false, null, 0, 65537);
if ($raw === false || $raw === '' || strlen($raw) > 65536) {
    wompi_fail(400, 'invalid_request', 'Solicitud inválida.');
}

$given = (string) ($_SERVER['HTTP_WOMPI_HASH'] ?? '');
if ($given === '' || !wompi_hash_equals(wompi_hmac($raw, $secret), $given)) {
    // Never log the body or the hashes of an unauthenticated request.
    wompi_log('webhook', 'invalid_signature', ['len' => strlen($raw)]);
    wompi_fail(400, 'invalid_signature', 'Firma inválida.');
}

$evt = json_decode($raw, true);
$txId = is_array($evt) ? ($evt['IdTransaccion'] ?? null) : null;
if (!is_string($txId) || !preg_match('/^[A-Za-z0-9-]{8,64}$/', $txId)) {
    wompi_log('webhook', 'invalid_payload');
    wompi_fail(400, 'invalid_payload', 'Solicitud inválida.');
}

// Idempotency: exclusive-create a marker per transaction id.
$marker = wompi_data_dir('processed') . '/' . $txId . '.json';
$fh = @fopen($marker, 'x');
if ($fh === false) {
    wompi_log('webhook', 'duplicate', ['tx' => $txId]);
    wompi_json(200, ['status' => 'duplicate']);
}

$ref = (string) ($evt['EnlacePago']['IdentificadorEnlaceComercio'] ?? '');
$monto = isset($evt['Monto']) && is_numeric($evt['Monto']) ? round((float) $evt['Monto'], 2) : null;
$result = (string) ($evt['ResultadoTransaccion'] ?? '');
$productive = ($evt['EsProductiva'] ?? null) === true;
$order = wompi_order_load($ref);
$amountMatches = $order !== null && $monto !== null && abs((float) $order['amount'] - $monto) < 0.01;
$paid = $result === 'ExitosaAprobada';

fwrite($fh, json_encode([
    'tx' => $txId, 'ref' => $ref, 'monto' => $monto, 'result' => $result,
    'productive' => $productive, 'amountMatches' => $amountMatches, 'at' => gmdate('c'),
]));
fclose($fh);

if ($order !== null) {
    $order['status'] = $paid ? ($amountMatches ? 'paid' : 'paid_amount_mismatch') : 'failed';
    $order['productive'] = $productive;
    $order['idTransaccion'] = $txId;
    $order['updated'] = gmdate('c');
    wompi_order_save($ref, $order);
}

// Reconciliation record. esProductiva=false means a development-mode test:
// no money moved and the order must NOT be fulfilled.
wompi_log('webhook', 'processed', [
    'tx' => $txId,
    'ref' => $ref,
    'monto' => $monto,
    'result' => $result,
    'esProductiva' => $productive,
    'orderKnown' => $order !== null,
    'amountMatches' => $amountMatches,
]);

wompi_json(200, ['status' => 'ok']);
