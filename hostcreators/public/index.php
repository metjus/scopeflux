<?php
declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Cache-Control: no-store');

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
if ($path === '/health') {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => true, 'runtime' => 'php', 'version' => PHP_VERSION], JSON_THROW_ON_ERROR);
    exit;
}
http_response_code(503);
header('Content-Type: text/html; charset=utf-8');
echo '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>ScopeFlux migration staging</title><body><h1>ScopeFlux migration staging</h1><p>The PHP backend is not ready for public use. Production stays on Cloudflare.</p></body></html>';
