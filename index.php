<?php

declare(strict_types=1);

$config = require __DIR__ . '/config.php';
$clientConfig = [
    'appName' => $config['app_name'],
    'appVersion' => $config['app_version'],
    'slots' => array_map(static fn (int $n): string => str_pad((string) $n, 3, '0', STR_PAD_LEFT), $config['slots']),
    'xorKey' => $config['xor_key'],
    'conversion' => $config['conversion'],
    'mediabunny' => $config['mediabunny'],
];

header('Content-Type: text/html; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#111827" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="VIO Converter" />
  <link rel="manifest" href="./manifest.webmanifest" />
  <link rel="apple-touch-icon" href="./icons/icon-192.png" />
  <link rel="stylesheet" href="./styles.css?v=<?= rawurlencode($config['app_version']) ?>" />
  <title><?= htmlspecialchars($config['app_name'], ENT_QUOTES, 'UTF-8') ?></title>
  <script>
    window.VIO_CONFIG = <?= json_encode($clientConfig, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  </script>
  <script defer src="<?= htmlspecialchars($config['mediabunny']['main'], ENT_QUOTES, 'UTF-8') ?>"></script>
  <script defer src="<?= htmlspecialchars($config['mediabunny']['aac_encoder'], ENT_QUOTES, 'UTF-8') ?>"></script>
  <script defer src="./app.js?v=<?= rawurlencode($config['app_version']) ?>"></script>
</head>
<body>
  <main class="app-shell">
    <header class="hero">
      <div>
        <p class="eyebrow">v2 · WebCodecs · PHP-hosted · offline-first</p>
        <h1>VIO Converter</h1>
        <p class="subtitle">Convert a video into the validated <code>NNN.vio</code> format locally on the iPhone. No upload, no server transcoding, no FFmpeg/WASM core.</p>
      </div>
      <div id="offlineBadge" class="badge">Checking offline support…</div>
    </header>

    <section class="card">
      <h2>Device check</h2>
      <div id="compatibility" class="status-list"></div>
      <p class="hint">v2 uses browser-native WebCodecs through Mediabunny. Input codec support is checked again after you select a video.</p>
    </section>

    <section class="card">
      <h2>1. Choose a video</h2>
      <label class="file-picker">
        <span>Select video</span>
        <input id="videoInput" type="file" accept="video/*,.webm,.mp4,.mov,.m4v,.mkv" />
      </label>
      <div id="sourceInfo" class="source-info muted">No video selected.</div>
      <video id="preview" controls playsinline class="preview hidden"></video>
    </section>

    <section class="card grid-two">
      <div>
        <h2>2. Choose slot</h2>
        <label for="slot">Target filename</label>
        <select id="slot"></select>
        <p class="hint">Slots 001–015 match the card layout observed on the original media.</p>
      </div>
      <div>
        <h2>3. Convert</h2>
        <button id="convertButton" class="primary" disabled>Convert to VIO</button>
        <button id="cancelButton" class="secondary hidden">Cancel</button>
      </div>
    </section>

    <section class="card">
      <div class="progress-head">
        <h2>Progress</h2>
        <span id="progressPercent">0%</span>
      </div>
      <progress id="progress" max="100" value="0"></progress>
      <p id="stage" class="stage">Waiting for a source video.</p>
      <details>
        <summary>Technical log</summary>
        <pre id="log"></pre>
      </details>
    </section>

    <section class="card hidden" id="resultCard">
      <h2>4. Save the result</h2>
      <p id="resultSummary"></p>
      <div class="actions">
        <button id="shareButton" class="primary">Share / Save</button>
        <a id="downloadLink" class="button-link secondary" download>Download file</a>
      </div>
      <p class="hint">On iPhone/iPad, save the file into the SD card's <code>01</code> folder through the system share/save sheet.</p>
    </section>

    <section class="card technical-profile">
      <h2>Validated output profile</h2>
      <dl>
        <div><dt>Engine</dt><dd>WebCodecs via Mediabunny; hardware acceleration preferred</dd></div>
        <div><dt>Video</dt><dd>H.264/AVC · 1920×1080 · 25 fps · ~1.984 Mb/s</dd></div>
        <div><dt>GOP</dt><dd>Keyframe interval 1.2 s (30 frames at 25 fps)</dd></div>
        <div><dt>Audio</dt><dd>AAC-LC · 48 kHz · stereo · 128 kb/s</dd></div>
        <div><dt>Container</dt><dd>MP4, fast-start</dd></div>
        <div><dt>VIO transform</dt><dd>Every MP4 byte XOR 0xA7</dd></div>
      </dl>
      <p class="hint">Build <?= htmlspecialchars($config['app_version'], ENT_QUOTES, 'UTF-8') ?></p>
    </section>
  </main>
</body>
</html>
