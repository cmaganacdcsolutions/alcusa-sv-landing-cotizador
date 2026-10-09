<?php
declare(strict_types=1);

// Pure order-amount rules for api/wompi-create-link.php (no I/O, no globals, no
// exit): kept apart so `php api/_dev/wompi-smoke.php unit` can test them.
//
// Mirrors the client (src/engine/pricing/onlineDiscount.ts + src/islands/Cotizador/state/payable.ts):
//   items[].subtotal already carry the "retiro en tienda" -15% (per item).
//   online card discount = 10% of sum(items[].subtotal), never over shipping.
//   total charged = sum - discount + transport (transport 0 when shippingPending).
// Rules confirmed by the client owner on 2026-10-06. The server NEVER trusts the
// browser's discount: it recomputes it and rejects any other code or amount.

const WOMPI_ONLINE_DISCOUNT_CODE = 'online_card_10';
const WOMPI_ONLINE_DISCOUNT_RATE = 0.10;
/** One cent of slack: JS Math.round and PHP round() disagree on exact .5 cents. */
const WOMPI_MONEY_TOLERANCE = 0.01;

/** Same tolerance comparison everywhere (float noise safe). */
function wompi_money_close(float $a, float $b): bool
{
    return abs($a - $b) <= WOMPI_MONEY_TOLERANCE + 1e-9;
}

/** Expected online-card discount for a cart: round2(10% * round2(sum of item subtotals)). */
function wompi_expected_online_discount(float $itemsSum): float
{
    return round(round($itemsSum, 2) * WOMPI_ONLINE_DISCOUNT_RATE, 2);
}

/** @return array{ok:false, status:int, code:string, message:string, log:string, ctx:array<string,mixed>} */
function wompi_price_fail(string $code, string $message, string $log, array $ctx = [], int $status = 422): array
{
    return ['ok' => false, 'status' => $status, 'code' => $code, 'message' => $message, 'log' => $log, 'ctx' => $ctx];
}

/**
 * Layer-2 business rules for an order: item subtotals, optional online-card
 * discount and the "shipping pending" flag, against the declared total.
 *
 * Without `$discount` and `$shippingPending` this is exactly the Phase-1 rule:
 * sum <= total <= sum + maxTransport.
 *
 * @param array  $items           decoded items[] (name, subtotal)
 * @param float  $total           declared total, already rounded to cents
 * @param mixed  $discount        null | { code: 'online_card_10', amount: number }
 * @param mixed  $shippingPending null | bool
 * @return array{ok:true, sum:float, transport:float, discount:?array{code:string, amount:float}, shippingPending:bool, names:list<string>}
 *       | array{ok:false, status:int, code:string, message:string, log:string, ctx:array<string,mixed>}
 */
function wompi_check_order_amounts(array $items, float $total, mixed $discount, mixed $shippingPending, float $maxTotal, float $maxTransport, mixed $promoId = null): array
{
    // Contexto promo (`?promo=<id>`): una orden promo va SIN el 10% de tarjeta; el server lo rechaza.
    if ($promoId !== null && (!is_string($promoId) || $promoId === '' || strlen($promoId) > 80)) {
        return wompi_price_fail('invalid_request', 'Datos del pedido inválidos.', 'invalid_promo_id');
    }
    if ($promoId !== null && $discount !== null) {
        return wompi_price_fail('invalid_discount', 'El descuento del pedido no es válido.', 'discount_not_allowed_on_promo');
    }
    if ($shippingPending !== null && !is_bool($shippingPending)) {
        return wompi_price_fail('invalid_request', 'Datos del pedido inválidos.', 'invalid_shipping_pending');
    }
    $pending = $shippingPending === true;

    $sum = 0.0;
    $names = [];
    foreach ($items as $it) {
        if (!is_array($it) || !isset($it['name'], $it['subtotal']) || !is_string($it['name']) || !is_numeric($it['subtotal'])) {
            return wompi_price_fail('invalid_items', 'Datos del pedido inválidos.', 'invalid_items');
        }
        $sub = (float) $it['subtotal'];
        if ($sub < 0 || $sub > $maxTotal) {
            return wompi_price_fail('invalid_items', 'Datos del pedido inválidos.', 'invalid_items');
        }
        $sum += $sub;
        $names[] = mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $it['name']) ?? ''), 0, 120);
    }

    // Discount: shape, code, then amount recomputed server-side.
    $discountOut = null;
    $discountAmount = 0.0;
    if ($discount !== null) {
        $amountIn = is_array($discount) ? ($discount['amount'] ?? null) : null;
        $codeIn = is_array($discount) ? ($discount['code'] ?? null) : null;
        if (!is_array($discount) || !is_string($codeIn) || (!is_int($amountIn) && !is_float($amountIn)) || !is_finite((float) $amountIn)) {
            return wompi_price_fail('invalid_discount', 'El descuento del pedido no es válido.', 'discount_malformed');
        }
        if ($codeIn !== WOMPI_ONLINE_DISCOUNT_CODE) {
            return wompi_price_fail('invalid_discount', 'El descuento del pedido no es válido.', 'discount_unknown_code');
        }
        $amountIn = round((float) $amountIn, 2);
        $expected = wompi_expected_online_discount($sum);
        if ($amountIn <= 0 || !wompi_money_close($amountIn, $expected)) {
            return wompi_price_fail(
                'discount_mismatch',
                'El descuento del pedido no coincide con sus productos.',
                'discount_mismatch',
                ['sent' => $amountIn, 'expected' => $expected, 'sum' => round($sum, 2)]
            );
        }
        $discountAmount = $amountIn;
        $discountOut = ['code' => WOMPI_ONLINE_DISCOUNT_CODE, 'amount' => $amountIn];
    }

    $transport = round($total - ($sum - $discountAmount), 2);
    $transportOk = $pending
        ? wompi_money_close($transport, 0.0) // shipping is confirmed later via WhatsApp: nothing for it in this charge
        : ($transport >= -WOMPI_MONEY_TOLERANCE && $transport <= $maxTransport);
    if (!$transportOk) {
        return wompi_price_fail(
            'invalid_total',
            'El monto del pedido no coincide con sus productos.',
            'total_mismatch',
            ['total' => $total, 'sum' => round($sum, 2), 'discount' => $discountAmount, 'shippingPending' => $pending]
        );
    }

    return [
        'ok' => true,
        'sum' => round($sum, 2),
        'transport' => $transport,
        'discount' => $discountOut,
        'shippingPending' => $pending,
        'names' => $names,
    ];
}

/**
 * Product description shown by Wompi (page + panel), max 1500 chars. The
 * discount / shipping notes go last and are never truncated away: the item
 * names are cut to make room for them.
 *
 * @param list<string>                         $names
 * @param ?array{code:string, amount:float}    $discount
 */
function wompi_product_description(array $names, ?array $discount, bool $shippingPending): string
{
    $notes = '';
    if ($discount !== null) {
        $notes .= ' | Descuento 10% pago en línea: -$' . number_format($discount['amount'], 2, '.', '');
    }
    if ($shippingPending) {
        $notes .= ' | Envío por confirmar por WhatsApp (no incluido)';
    }
    return mb_substr(implode(' | ', $names), 0, 1500 - mb_strlen($notes)) . $notes;
}
