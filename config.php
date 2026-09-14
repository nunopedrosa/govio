<?php

declare(strict_types=1);

return [
    'app_name' => 'VIO Converter',
    'app_version' => '2.0.0-webcodecs',
    'slots' => range(1, 15),
    'xor_key' => 0xA7,
    'conversion' => [
        'width' => 1920,
        'height' => 1080,
        'fps' => 25,
        'video_bitrate' => 1984000,
        'gop_seconds' => 1.2,
        'audio_bitrate' => 128000,
        'audio_rate' => 48000,
        'audio_channels' => 2,
    ],
    'mediabunny' => [
        // Pinned to a release with browser-global builds. Run:
        //   php tools/fetch_mediabunny.php
        // once after deployment to populate vendor/mediabunny/.
        'version' => '1.56.2',
        'main' => './vendor/mediabunny/mediabunny.min.cjs',
        'aac_encoder' => './vendor/mediabunny/mediabunny-aac-encoder.min.js',
    ],
];
