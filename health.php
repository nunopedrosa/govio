<?php

declare(strict_types=1);
$config = require __DIR__ . '/config.php';
header('Content-Type: application/json; charset=UTF-8');
$main = __DIR__ . '/vendor/mediabunny/mediabunny.min.cjs';
$aac = __DIR__ . '/vendor/mediabunny/mediabunny-aac-encoder.min.js';
echo json_encode([
    'ok' => true,
    'app' => $config['app_name'],
    'version' => $config['app_version'],
    'php' => PHP_VERSION,
    'engine' => 'WebCodecs/Mediabunny',
    'mediabunny_version' => $config['mediabunny']['version'],
    'mediabunny_vendor_ready' => is_file($main) && is_file($aac),
    'vendor_files' => [
        'mediabunny.min.cjs' => is_file($main) ? filesize($main) : null,
        'mediabunny-aac-encoder.min.js' => is_file($aac) ? filesize($aac) : null,
    ],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
