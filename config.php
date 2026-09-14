<?php

declare(strict_types=1);

return [
    'app_name' => 'VIO Converter',
    'app_version' => '3.0.1-orange-icons',
    'slots' => range(1, 15),
    'xor_key' => 0xA7,
    'player' => [
        'max_width' => 1920,
        'max_height' => 1080,
        'direct_video_codec' => 'avc',
        'direct_audio_codec' => 'aac',
    ],
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
        'version' => '1.56.2',
        'main' => './vendor/mediabunny/mediabunny.min.cjs',
        'aac_encoder' => './vendor/mediabunny/mediabunny-aac-encoder.min.js',
    ],
];
