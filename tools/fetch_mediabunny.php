<?php

declare(strict_types=1);

$config = require dirname(__DIR__) . '/config.php';
$version = $config['mediabunny']['version'];
$dest = dirname(__DIR__) . '/vendor/mediabunny';

if (!is_dir($dest) && !mkdir($dest, 0775, true) && !is_dir($dest)) {
    fwrite(STDERR, "Could not create {$dest}\n");
    exit(1);
}

$base = "https://github.com/Vanilagy/mediabunny/releases/download/v{$version}";
$files = [
    'mediabunny.min.cjs',
    'mediabunny-aac-encoder.min.js',
];

foreach ($files as $file) {
    $url = "{$base}/{$file}";
    $target = "{$dest}/{$file}";
    echo "Downloading {$url}\n";

    $context = stream_context_create([
        'http' => [
            'follow_location' => 1,
            'timeout' => 180,
            'user_agent' => 'VIO-Converter-Installer/2.0',
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ],
    ]);

    $in = @fopen($url, 'rb', false, $context);
    if (!$in) {
        fwrite(STDERR, "Failed to download {$url}\n");
        exit(1);
    }
    $out = fopen($target . '.tmp', 'wb');
    if (!$out) {
        fclose($in);
        fwrite(STDERR, "Cannot write {$target}.tmp\n");
        exit(1);
    }
    stream_copy_to_stream($in, $out);
    fclose($in);
    fclose($out);
    rename($target . '.tmp', $target);
    echo "  -> {$target} (" . filesize($target) . " bytes)\n";
}

echo "Mediabunny v{$version} installed.\n";
