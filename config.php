<?php

declare(strict_types=1);

return [
    'app_name' => 'VIO Converter',
    'app_version' => '2.4.1-realtime-fix',
    'slots' => range(1, 15),
    'xor_key' => 0xA7,
    'conversion' => [
        'fps' => 25,
        'audio_bitrate' => 128000,
        'audio_rate' => 48000,
        'audio_channels' => 2,
        'presets' => [
            'control' => [
                'label' => 'Control — Compatible',
                'kind' => 'control',
                'width' => 1920,
                'height' => 1080,
                'video_bitrate' => 1984000,
                'gop_seconds' => 1.2,
                'description' => 'Validated player profile. Use as the baseline/control result.',
            ],
            'remux' => [
                'label' => 'Test A — Original / Remux',
                'kind' => 'remux',
                'description' => 'No video re-encode. Copies the original H.264 + AAC tracks into MP4, then creates VIO. Tests whether the player accepts the phone recording unchanged.',
            ],
            'realtime1080' => [
                'label' => 'Test B — 1080p Realtime',
                'kind' => 'realtime',
                'width' => 1920,
                'height' => 1080,
                'video_bitrate' => 1400000,
                'gop_seconds' => 2.0,
                'description' => 'Hardware-preferred H.264 encode with WebCodecs latencyMode=realtime at 1080p25.',
            ],
            'realtime720' => [
                'label' => 'Test C — 720p Realtime',
                'kind' => 'realtime',
                'width' => 1280,
                'height' => 720,
                'video_bitrate' => 1000000,
                'gop_seconds' => 2.0,
                'description' => 'Hardware-preferred H.264 encode with WebCodecs latencyMode=realtime at 720p25. Tests whether lower output resolution materially improves speed.',
            ],
        ],
    ],
    'mediabunny' => [
        'version' => '1.56.2',
        'main' => './vendor/mediabunny/mediabunny.min.cjs',
        'aac_encoder' => './vendor/mediabunny/mediabunny-aac-encoder.min.js',
    ],
];
