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
require_once __DIR__ . '/../_lib/wompi-pricing.php';

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

    // --- wompi_check_order_amounts: online-card 10% discount + shippingPending (rules of 2026-10-06) ---
    // Cart: items sum 1148.50 -> expected discount round2(0.10 * 1148.50) = 114.85. Max transport 250.
    $items = [['name' => 'Puerta A', 'subtotal' => 1000.00], ['name' => 'Ventana B', 'subtotal' => 148.50]];
    $chk = static fn (float $total, mixed $discount = null, mixed $pending = null, ?array $its = null) =>
        wompi_check_order_amounts($its ?? $items, $total, $discount, $pending, 20000.0, 250.0);
    $disc = static fn (mixed $amount, mixed $code = 'online_card_10') => ['code' => $code, 'amount' => $amount];
    $failsWith = static fn (array $r, string $code) => $r['ok'] === false && $r['code'] === $code && $r['status'] === 422;

    // Backward compatibility: no discount, no flag == Phase-1 rule.
    $r = $chk(1148.50);
    check('no discount: total == sum ok (transport 0)', $r['ok'] && $r['transport'] === 0.0 && $r['discount'] === null && $r['shippingPending'] === false);
    $r = $chk(1198.50);
    check('no discount: transport 50 ok', $r['ok'] && $r['transport'] === 50.0);
    $r = $chk(1398.50);
    check('no discount: transport 250 (max) ok', $r['ok'] && $r['transport'] === 250.0);
    check('no discount: transport above max -> invalid_total', $failsWith($chk(1398.51), 'invalid_total'));
    check('no discount: total below sum -> invalid_total (nobody pays less without discount)', $failsWith($chk(1034.00), 'invalid_total'));
    check('no discount: total == sum - 0.01 tolerated (as before)', $chk(1148.49)['ok']);
    check('no discount: explicit null discount/shippingPending == absent', $chk(1148.50, null, null)['ok']);
    check('items: bad item -> invalid_items', $failsWith($chk(10.0, null, null, [['name' => 'x']]), 'invalid_items'));

    // Valid discount.
    $r = $chk(1033.65, $disc(114.85));
    check('discount: valid, transport 0', $r['ok'] && $r['transport'] === 0.0 && $r['discount'] === ['code' => 'online_card_10', 'amount' => 114.85]);
    $r = $chk(1068.65, $disc(114.85));
    check('discount: valid + transport 35', $r['ok'] && $r['transport'] === 35.0);
    check('discount: expected amount of a round cart (10% of 1000.00 = 100.00)', wompi_expected_online_discount(1000.0) === 100.0);
    check('discount: +-0.01 tolerance on the amount (114.86)', $chk(1033.64, $disc(114.86))['ok']);
    check('discount: +-0.01 tolerance on the amount (114.84)', $chk(1033.66, $disc(114.84))['ok']);
    check('discount: total within 0.01 of sum - discount ok', $chk(1033.66, $disc(114.85))['ok']);
    check('discount: half-cent case is tolerated either way (0.1 * 1234.55 = 123.455)', wompi_money_close(wompi_expected_online_discount(1234.55), 123.455));

    // Wrong amount / code / shape.
    check('discount: amount too high -> discount_mismatch', $failsWith($chk(948.50, $disc(200.0)), 'discount_mismatch'));
    check('discount: amount 0.02 off -> discount_mismatch', $failsWith($chk(1033.63, $disc(114.87)), 'discount_mismatch'));
    check('discount: amount 0 -> discount_mismatch', $failsWith($chk(1148.50, $disc(0)), 'discount_mismatch'));
    check('discount: negative amount -> discount_mismatch', $failsWith($chk(1263.35, $disc(-114.85)), 'discount_mismatch'));
    // Declared discount but the undiscounted total: indistinguishable from transport 114.85 (Phase-1 model); the customer pays MORE, never less.
    check('discount: undiscounted total reads as transport (customer overpays, accepted)', $chk(1148.50, $disc(114.85))['ok'] && $chk(1148.50, $disc(114.85))['transport'] === 114.85);
    check('discount: undiscounted total with shippingPending -> invalid_total', $failsWith($chk(1148.50, $disc(114.85), true), 'invalid_total'));
    check('discount: total discounted twice -> invalid_total', $failsWith($chk(918.80, $disc(114.85)), 'invalid_total'));
    check('discount: unknown code -> invalid_discount', $failsWith($chk(1033.65, $disc(114.85, 'promo_x')), 'invalid_discount'));
    check('discount: code is case sensitive -> invalid_discount', $failsWith($chk(1033.65, $disc(114.85, 'ONLINE_CARD_10')), 'invalid_discount'));
    check('discount: numeric code -> invalid_discount', $failsWith($chk(1033.65, $disc(114.85, 10)), 'invalid_discount'));
    check('discount: amount as string -> invalid_discount', $failsWith($chk(1033.65, $disc('114.85')), 'invalid_discount'));
    check('discount: missing amount -> invalid_discount', $failsWith($chk(1033.65, ['code' => 'online_card_10']), 'invalid_discount'));
    check('discount: missing code -> invalid_discount', $failsWith($chk(1033.65, ['amount' => 114.85]), 'invalid_discount'));
    check('discount: scalar instead of object -> invalid_discount', $failsWith($chk(1033.65, 'online_card_10'), 'invalid_discount'));
    check('discount: unknown code wins over the amount check', $failsWith($chk(1033.65, $disc(999.0, 'x')), 'invalid_discount'));

    // shippingPending: transport must be 0 in the charged total.
    $r = $chk(1033.65, $disc(114.85), true);
    check('shippingPending + discount, transport 0 ok', $r['ok'] && $r['shippingPending'] === true && $r['transport'] === 0.0);
    $r = $chk(1148.50, null, true);
    check('shippingPending without discount, total == sum ok', $r['ok'] && $r['shippingPending'] === true);
    check('shippingPending + transport 35 in total -> invalid_total', $failsWith($chk(1068.65, $disc(114.85), true), 'invalid_total'));
    check('shippingPending false keeps transport allowed', $chk(1068.65, $disc(114.85), false)['ok']);
    check('shippingPending non-boolean -> invalid_request', $failsWith($chk(1033.65, $disc(114.85), 'yes'), 'invalid_request'));
    check('shippingPending 1 (int) -> invalid_request', $failsWith($chk(1033.65, $disc(114.85), 1), 'invalid_request'));

    // Deposit percentage applies on the validated, discounted total.
    check('deposit 80% on discounted total (1033.65 -> 826.92)', wompi_amount(1033.65, 80) === 826.92);
    check('deposit 100% on discounted total', wompi_amount(1033.65, 100) === 1033.65);
    check('deposit 80% differs from 80% of the undiscounted total', wompi_amount(1033.65, 80) !== wompi_amount(1148.50, 80));

    // Product description keeps the discount / shipping notes and the 1500 limit.
    $d = wompi_product_description(['Puerta A', 'Ventana B'], ['code' => 'online_card_10', 'amount' => 114.85], true);
    check('description: items + discount note + shipping note', str_starts_with($d, 'Puerta A | Ventana B | Descuento 10% pago en línea: -$114.85') && str_contains($d, 'Envío por confirmar'));
    check('description: no notes without discount / pending', wompi_product_description(['Puerta A'], null, false) === 'Puerta A');
    $long = wompi_product_description(array_fill(0, 30, str_repeat('x', 120)), ['code' => 'online_card_10', 'amount' => 1.0], true);
    check('description: <= 1500 chars and notes survive truncation', mb_strlen($long) <= 1500 && str_contains($long, 'Envío por confirmar'));
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
