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
    <header class="hero hero-compact">
      <div>
        <p class="eyebrow">v2.4.1 · WebCodecs · realtime tests</p>
        <h1>VIO Converter</h1>
      </div>
      <div id="offlineBadge" class="badge">Checking offline support…</div>
    </header>

    <section class="card workflow-card">
      <h2>Convert a video</h2>
      <div class="workflow-grid">
        <div class="workflow-section workflow-source">
          <label class="workflow-label">1. Source video</label>
          <label class="file-picker">
            <span>Select video</span>
            <input id="videoInput" type="file" accept="video/*,.webm,.mp4,.mov,.m4v,.mkv" />
          </label>
          <div id="sourceInfo" class="source-info muted">No video selected.</div>
          <video id="preview" controls playsinline class="preview hidden"></video>
        </div>

        <div class="workflow-section">
          <label class="workflow-label" for="slot">2. Target slot</label>
          <select id="slot"></select>
        </div>

        <div class="workflow-section">
          <label class="workflow-label" for="preset">3. Encoding mode</label>
          <select id="preset"></select>
          <p id="presetInfo" class="hint"></p>
        </div>
      </div>

      <div class="convert-actions">
        <button id="convertButton" class="primary" disabled>Convert to VIO</button>
        <button id="cancelButton" class="secondary hidden">Cancel</button>
      </div>

      <div class="progress-block">
        <div class="progress-head">
          <strong>Progress</strong>
          <span id="progressPercent">0%</span>
        </div>
        <progress id="progress" max="100" value="0"></progress>
        <p id="stage" class="stage">Waiting for a source video.</p>
      </div>
    </section>

    <section class="card hidden" id="resultCard">
      <h2>Save the result</h2>
      <p id="resultSummary"></p>
      <div class="actions">
        <button id="shareButton" class="primary">Share / Save</button>
        <a id="downloadLink" class="button-link secondary" download>Download file</a>
      </div>
      <p class="hint">On iPhone/iPad, save the file into the SD card's <code>01</code> folder through the system share/save sheet.</p>
    </section>

    <section class="info-panels" aria-label="Application information">
      <details class="card collapsible">
        <summary>Device compatibility</summary>
        <div class="details-body">
          <div id="compatibility" class="status-list"></div>
          <p class="hint">The app uses browser-native WebCodecs through Mediabunny. Selection stays metadata-only. The four conversion modes are deliberately separated so player compatibility and speed can be tested independently.</p>
        </div>
      </details>

      <details class="card collapsible">
        <summary>Encoding profiles</summary>
        <div class="details-body technical-profile">
          <dl>
            <div><dt>Engine</dt><dd>Mediabunny; direct packet copy when compatible, WebCodecs hardware transcode otherwise</dd></div>
            <div><dt>Control — Compatible</dt><dd>Validated H.264/AVC · 1920×1080 · 25 fps · ~1.984 Mb/s · GOP 1.2 s</dd></div>
            <div><dt>Test A — Original / Remux</dt><dd>Copies original H.264 + AAC without re-encoding. Tests whether the player accepts the iPhone recording profile directly.</dd></div>
            <div><dt>Test B — 1080p Realtime</dt><dd>H.264/AVC · 1920×1080 · 25 fps · ~1.4 Mb/s · GOP 2.0 s · hardware preferred · realtime latency</dd></div>
            <div><dt>Test C — 720p Realtime</dt><dd>H.264/AVC · 1280×720 · 25 fps · ~1.0 Mb/s · GOP 2.0 s · hardware preferred · realtime latency</dd></div>
            <div><dt>Audio</dt><dd>AAC-LC · 48 kHz · stereo · 128 kb/s</dd></div>
            <div><dt>Container</dt><dd>MP4, fast-start</dd></div>
            <div><dt>VIO transform</dt><dd>Every MP4 byte XOR 0xA7</dd></div>
          </dl>
        </div>
      </details>

      <details class="card collapsible">
        <summary>Technical log</summary>
        <div class="details-body">
          <pre id="log"></pre>
        </div>
      </details>

      <details class="card collapsible">
        <summary>About this build</summary>
        <div class="details-body">
          <p class="hint">Runs locally in the browser. Videos are not uploaded for conversion. The generated MP4 is transformed into the player-compatible <code>NNN.vio</code> format by XORing every byte with <code>0xA7</code>.</p>
          <p class="hint">Build <?= htmlspecialchars($config['app_version'], ENT_QUOTES, 'UTF-8') ?></p>
        </div>
      </details>
    </section>
  </main>
</body>
</html>
