<?php
declare(strict_types=1);

require_once __DIR__ . '/wompi-config.php';

// Thin Wompi HTTP client (cURL) with timeouts and a cached OAuth token.
// Errors are thrown as RuntimeException carrying a SAFE code only; callers
// map them to a generic public error and log the code.

/** @return array{status:int, body:?array} */
function wompi_http(string $method, string $url, array $headers, ?string $body = null): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    $raw = curl_exec($ch);
    $errno = curl_errno($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($raw === false || $errno !== 0) {
        throw new RuntimeException('wompi_network_' . $errno);
    }
    $decoded = json_decode((string) $raw, true);
    return ['status' => $status, 'body' => is_array($decoded) ? $decoded : null];
}

function wompi_token_cache_path(): string
{
    return wompi_data_dir() . '/token-cache.json';
}

/** client_credentials token, cached on disk until expires_in - 60s. */
function wompi_token(bool $forceRefresh = false): string
{
    $path = wompi_token_cache_path();
    if (!$forceRefresh) {
        $raw = @file_get_contents($path);
        $c = $raw === false ? null : json_decode($raw, true);
        if (is_array($c) && isset($c['token'], $c['exp']) && (int) $c['exp'] > time()) {
            return (string) $c['token'];
        }
    }
    $appId = wompi_env('WOMPI_APP_ID');
    $secret = wompi_env('WOMPI_API_SECRET');
    if ($appId === null || $secret === null) {
        throw new RuntimeException('wompi_not_configured');
    }
    $res = wompi_http('POST', WOMPI_TOKEN_URL, ['Content-Type: application/x-www-form-urlencoded'], http_build_query([
        'grant_type' => 'client_credentials',
        'client_id' => $appId,
        'client_secret' => $secret,
        'audience' => 'wompi_api',
    ]));
    $token = $res['body']['access_token'] ?? null;
    if ($res['status'] !== 200 || !is_string($token) || $token === '') {
        throw new RuntimeException('wompi_token_' . $res['status']);
    }
    $ttl = (int) ($res['body']['expires_in'] ?? 3600);
    $file = ['token' => $token, 'exp' => time() + max(60, $ttl) - 60];
    if (@file_put_contents($path, json_encode($file), LOCK_EX) !== false) {
        @chmod($path, 0600);
    }
    return $token;
}

/** Authorized API call; refreshes the token once on 401. */
function wompi_api(string $method, string $path, ?array $json = null): array
{
    $res = ['status' => 0, 'body' => null];
    for ($attempt = 0; $attempt < 2; $attempt++) {
        $res = wompi_http($method, WOMPI_API_BASE . $path, [
            'authorization: Bearer ' . wompi_token($attempt === 1),
            'Content-Type: application/json',
            'Accept: application/json',
        ], $json === null ? null : json_encode($json, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        if ($res['status'] !== 401) {
            return $res;
        }
    }
    return $res;
}
