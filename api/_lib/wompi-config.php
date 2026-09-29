<?php
declare(strict_types=1);

// Server-side configuration + small shared helpers for the Wompi endpoints.
// NEVER echo secrets, never log them. See docs/ops/wompi-go-live.md.
//
// Config sources, first hit wins:
//   1. Real environment (getenv / $_SERVER, incl. Apache SetEnv and its
//      REDIRECT_ prefixed twin).
//   2. A non-versioned PHP file OUTSIDE the webroot returning an array:
//      $WOMPI_CONFIG_FILE, or <domain-root>/alcusa-private/config.php
//      (Hostinger: /home/uXXX/domains/alcusasv.com/alcusa-private/config.php).

const WOMPI_API_BASE = 'https://api.wompi.sv';
const WOMPI_TOKEN_URL = 'https://id.wompi.sv/connect/token';

function wompi_env(string $key, ?string $default = null): ?string
{
    static $file = null;
    if ($file === null) {
        $file = [];
        $candidates = [
            getenv('WOMPI_CONFIG_FILE') ?: '',
            dirname(__DIR__, 3) . '/alcusa-private/config.php',
        ];
        foreach ($candidates as $path) {
            if ($path !== '' && is_file($path)) {
                $cfg = require $path;
                if (is_array($cfg)) {
                    $file = $cfg;
                }
                break;
            }
        }
    }
    foreach ([getenv($key), $_SERVER[$key] ?? null, $_SERVER['REDIRECT_' . $key] ?? null, $_ENV[$key] ?? null] as $v) {
        if (is_string($v) && $v !== '') {
            return $v;
        }
    }
    if (isset($file[$key]) && is_string($file[$key]) && $file[$key] !== '') {
        return $file[$key];
    }
    return $default;
}

function wompi_is_configured(): bool
{
    return wompi_env('WOMPI_APP_ID') !== null
        && wompi_env('WOMPI_API_SECRET') !== null
        && wompi_env('WOMPI_WEBHOOK_URL') !== null
        && wompi_env('WOMPI_REDIRECT_BASE') !== null;
}

/** Private, non-web-served directory for logs, token cache, pending orders. */
function wompi_data_dir(string $sub = ''): string
{
    $base = wompi_env('WOMPI_DATA_DIR') ?? (dirname(__DIR__, 3) . '/alcusa-private/data');
    $dir = $sub === '' ? $base : $base . '/' . $sub;
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    return $dir;
}

/** JSON response. Errors use the stable envelope { error: { code, message } }. */
function wompi_json(int $status, array $body, array $headers = []): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    foreach ($headers as $h) {
        header($h);
    }
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function wompi_fail(int $status, string $code, string $message, array $headers = []): void
{
    wompi_json($status, ['error' => ['code' => $code, 'message' => $message]], $headers);
}

/**
 * Structured log line, daily-rotated, pruned after 30 days, outside webroot.
 * Callers pass ONLY non-sensitive context (no secrets, no card/customer data).
 */
function wompi_log(string $channel, string $event, array $ctx = []): void
{
    $dir = wompi_data_dir('logs');
    $line = json_encode(
        ['ts' => gmdate('c'), 'ch' => $channel, 'event' => $event] + $ctx,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    @file_put_contents($dir . '/wompi-' . gmdate('Y-m-d') . '.log', $line . "\n", FILE_APPEND | LOCK_EX);
    if (random_int(1, 50) === 1) {
        foreach (glob($dir . '/wompi-*.log') ?: [] as $f) {
            if (@filemtime($f) < time() - 30 * 86400) {
                @unlink($f);
            }
        }
    }
}

/** Lowercase hex HMAC-SHA256 (what Wompi sends in wompi_hash / redirect hash). */
function wompi_hmac(string $data, string $secret): string
{
    return hash_hmac('sha256', $data, $secret);
}

/** Constant-time comparison, case-insensitive on the hex digest. */
function wompi_hash_equals(string $expected, string $given): bool
{
    return hash_equals(strtolower($expected), strtolower(trim($given)));
}

/** Redirect-URL hash input for payment links, in the documented order. */
function wompi_redirect_hash_input(array $q): string
{
    return ($q['identificadorEnlaceComercio'] ?? '') . ($q['idTransaccion'] ?? '')
        . ($q['idEnlace'] ?? '') . ($q['monto'] ?? '');
}

/** Amount charged for a total and a 80/100 percentage, computed server-side. */
function wompi_amount(float $total, int $pct): float
{
    return round($total * $pct / 100, 2);
}

/** Reference like ALC-2026-7F3A9C: human readable, unguessable enough. */
function wompi_new_reference(): string
{
    return 'ALC-' . gmdate('Y') . '-' . strtoupper(bin2hex(random_bytes(3)));
}

function wompi_valid_reference(string $ref): bool
{
    return (bool) preg_match('/^ALC-\d{4}-[0-9A-F]{6}$/', $ref);
}

/** Pending-order record (expected amount) keyed by reference. */
function wompi_order_path(string $ref): string
{
    return wompi_data_dir('orders') . '/' . $ref . '.json';
}

function wompi_order_load(string $ref): ?array
{
    if (!wompi_valid_reference($ref)) {
        return null;
    }
    $raw = @file_get_contents(wompi_order_path($ref));
    $data = $raw === false ? null : json_decode($raw, true);
    return is_array($data) ? $data : null;
}

function wompi_order_save(string $ref, array $order): void
{
    if (wompi_valid_reference($ref)) {
        @file_put_contents(wompi_order_path($ref), json_encode($order), LOCK_EX);
    }
}
