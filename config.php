<?php

declare(strict_types=1);

return [
    'app_name' => 'VIO Converter',
    'app_version' => '2.3.1-interaction-first',
    'slots' => range(1, 15),
    'xor_key' => 0xA7,
    'conversion' => [
        'fps' => 25,
        'audio_bitrate' => 128000,
        'audio_rate' => 48000,
        'audio_channels' => 2,
        'presets' => [
            'compatible' => [
                'label' => 'Compatible',
                'width' => 1920,
                'height' => 1080,
                'video_bitrate' => 1984000,
                'gop_seconds' => 1.2,
                'description' => 'Validated 1080p profile; safest choice.',
            ],
            'fast' => [
                'label' => 'Fast',
                'width' => 1920,
                'height' => 1080,
                'video_bitrate' => 1400000,
                'gop_seconds' => 2.0,
                'description' => '1080p with a lower target bitrate and fewer keyframes.',
            ],
            'experimental' => [
                'label' => 'Experimental',
                'width' => 1280,
                'height' => 720,
                'video_bitrate' => 1000000,
                'gop_seconds' => 2.0,
                'description' => '720p speed test; substantially less pixel work, pending player validation.',
            ],
        ],
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
