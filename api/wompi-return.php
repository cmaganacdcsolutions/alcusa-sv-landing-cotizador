<?php
declare(strict_types=1);

// GET /api/wompi-return.php  (Wompi urlRedirect target, payment-link flavour)
// Wompi appends ?identificadorEnlaceComercio&idTransaccion&idEnlace&monto&hash.
// We (1) verify hash = HMAC-SHA256(API Secret, ident + idTransaccion + idEnlace + monto),
// (2) confirm with GET /TransaccionCompra/{id} (the redirect has no approved
// flag), (3) 303 to the SPA: #cotizador/7-resultado?pago=aprobado|rechazado|pendiente&ref=...
// Anything we cannot verify becomes "pendiente": the webhook is the truth.

require_once __DIR__ . '/_lib/wompi-client.php';

$base = rtrim((string) wompi_env('WOMPI_REDIRECT_BASE', ''), '/');
$secret = wompi_env('WOMPI_API_SECRET');
if ($base === '' || $secret === null) {
    wompi_fail(503, 'not_configured', 'No disponible.');
}

function wompi_return_to(string $base, string $pago, string $ref): void
{
    header('Cache-Control: no-store');
    header('Referrer-Policy: no-referrer');
    header('Location: ' . $base . '/#cotizador/7-resultado?pago=' . $pago . ($ref !== '' ? '&ref=' . rawurlencode($ref) : ''), true, 303);
    exit;
}

$q = [];
foreach (['identificadorEnlaceComercio', 'idTransaccion', 'idEnlace', 'monto', 'hash'] as $k) {
    $v = $_GET[$k] ?? '';
    $q[$k] = is_string($v) && strlen($v) <= 100 ? $v : '';
}
$ref = wompi_valid_reference($q['identificadorEnlaceComercio']) ? $q['identificadorEnlaceComercio'] : '';

$hashOk = $q['hash'] !== '' && wompi_hash_equals(wompi_hmac(wompi_redirect_hash_input($q), $secret), $q['hash']);
if (!$hashOk || $ref === '' || !preg_match('/^[A-Za-z0-9-]{8,64}$/', $q['idTransaccion'])) {
    wompi_log('return', 'invalid_hash_or_params', ['ref' => $ref]);
    wompi_return_to($base, 'pendiente', $ref);
}

$order = wompi_order_load($ref);
$outcome = 'pendiente';
try {
    $res = wompi_api('GET', '/TransaccionCompra/' . rawurlencode($q['idTransaccion']));
    $b = $res['body'];
    if ($res['status'] === 200 && is_array($b) && isset($b['esAprobada'])) {
        $amountOk = $order !== null && isset($b['monto']) && abs((float) $order['amount'] - (float) $b['monto']) < 0.01;
        $isReal = ($b['esReal'] ?? false) === true;
        $acceptTest = wompi_env('WOMPI_ACCEPT_TEST_TRANSACTIONS', '0') === '1';
        if ($b['esAprobada'] === true) {
            // Approved counts only if the amount matches what we asked for,
            // and it is a real charge (or test mode is explicitly accepted).
            $outcome = ($amountOk && ($isReal || $acceptTest)) ? 'aprobado' : 'pendiente';
        } else {
            $outcome = 'rechazado';
        }
        wompi_log('return', 'confirmed', ['ref' => $ref, 'outcome' => $outcome, 'esReal' => $isReal, 'amountOk' => $amountOk]);
    }
} catch (RuntimeException $e) {
    wompi_log('return', 'confirm_failed', ['ref' => $ref, 'code' => $e->getMessage()]);
}

wompi_return_to($base, $outcome, $ref);
