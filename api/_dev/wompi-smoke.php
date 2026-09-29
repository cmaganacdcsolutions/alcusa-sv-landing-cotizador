<?php
declare(strict_types=1);

// CLI only. Never runs from the web (also blocked by api/_dev/.htaccess), never in CI.
//
//   php api/_dev/wompi-smoke.php unit    # pure checks, no network, no credentials (CI-safe)
//   php api/_dev/wompi-smoke.php live    # needs WOMPI_APP_ID + WOMPI_API_SECRET in env AND
//                                         WOMPI_SMOKE_CONFIRM_DEV_MODE=1 (you confirm the
//                                         business is in "modo desarrollo" in panel.wompi.sv).
//                                         Gets a token, creates a $0.01 link and ABORTS
//                                         if Wompi says estaProductivo=true.

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/../_lib/wompi-client.php';

$mode = $argv[1] ?? 'unit';
$failures = 0;
function check(string $name, bool $ok): void
{
    global $failures;
    echo ($ok ? "  ok   " : "  FAIL ") . $name . "\n";
    if (!$ok) {
        $failures++;
    }
}

if ($mode === 'unit') {
    // RFC 4231 test case 2: key "Jefe", data "what do ya want for nothing?"
    check('hmac vector', wompi_hmac('what do ya want for nothing?', 'Jefe') === '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
    check('hash_equals ok / case-insensitive', wompi_hash_equals('abcdef', 'ABCDEF'));
    check('hash_equals rejects', !wompi_hash_equals('abcdef', 'abcdee'));
    check('redirect hash input order', wompi_redirect_hash_input([
        'identificadorEnlaceComercio' => 'test-link', 'idTransaccion' => 'tx1', 'idEnlace' => '15', 'monto' => '10',
    ]) === 'test-linktx1' . '15' . '10');
    check('amount 80%', wompi_amount(1148.0, 80) === 918.4);
    check('amount 100%', wompi_amount(1148.0, 100) === 1148.0);
    check('amount rounding', wompi_amount(333.33, 80) === 266.66);
    check('reference format', wompi_valid_reference(wompi_new_reference()));
    check('reference rejects traversal', !wompi_valid_reference('../../etc/passwd'));
} elseif ($mode === 'live') {
    if (wompi_env('WOMPI_APP_ID') === null || wompi_env('WOMPI_API_SECRET') === null) {
        fwrite(STDERR, "Missing WOMPI_APP_ID / WOMPI_API_SECRET. Nothing done.\n");
        exit(2);
    }
    if (wompi_env('WOMPI_SMOKE_CONFIRM_DEV_MODE') !== '1') {
        fwrite(STDERR, "Set WOMPI_SMOKE_CONFIRM_DEV_MODE=1 after confirming the business is in development mode. Nothing done.\n");
        exit(2);
    }
    try {
        check('token obtained', wompi_token(true) !== '');
        $ref = wompi_new_reference();
        $res = wompi_api('POST', '/EnlacePago', [
            'identificadorEnlaceComercio' => $ref,
            'monto' => 0.01,
            'nombreProducto' => 'ALCUSA smoke ' . $ref,
            'formaPago' => [
                'permitirTarjetaCreditoDebido' => true, 'permitirPagoConPuntoAgricola' => false,
                'permitirPagoEnCuotasAgricola' => false, 'permitirPagoEnBitcoin' => false, 'permitePagoQuickPay' => false,
            ],
            'configuracion' => [
                'urlWebhook' => wompi_env('WOMPI_WEBHOOK_URL', 'https://example.invalid/hook'),
                'notificarTransaccionCliente' => false,
            ],
        ]);
        check('link created (2xx)', $res['status'] >= 200 && $res['status'] < 300);
        $prod = $res['body']['estaProductivo'] ?? null;
        if ($prod !== false) {
            fwrite(STDERR, "ABORT: estaProductivo is not false. The business is NOT in development mode.\n");
            exit(3);
        }
        check('business in development mode (estaProductivo=false)', true);
        echo '  link: ' . ($res['body']['urlEnlace'] ?? '?') . "\n";
    } catch (RuntimeException $e) {
        check('no exception (' . $e->getMessage() . ')', false);
    }
} else {
    fwrite(STDERR, "usage: wompi-smoke.php unit|live\n");
    exit(2);
}
echo $failures === 0 ? "ALL OK\n" : "$failures FAILED\n";
exit($failures === 0 ? 0 : 1);
