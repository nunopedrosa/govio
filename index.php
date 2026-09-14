<?php

declare(strict_types=1);

$config = require __DIR__ . '/config.php';
$clientConfig = [
    'appName' => $config['app_name'],
    'appVersion' => $config['app_version'],
    'slots' => array_map(static fn (int $n): string => str_pad((string) $n, 3, '0', STR_PAD_LEFT), $config['slots']),
    'xorKey' => $config['xor_key'],
    'player' => $config['player'],
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
  <meta name="theme-color" content="#f97316" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="VIO Converter" />
  <link rel="manifest" href="./manifest.webmanifest" />
  <link rel="apple-touch-icon" sizes="180x180" href="./icons/apple-touch-icon.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="./icons/favicon-32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="./icons/favicon-16.png" />
  <link rel="shortcut icon" href="./icons/favicon.ico" />
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
      <div class="brand-lockup">
        <img class="brand-camera" src="./icons/camera-orange.png" alt="" width="76" height="102" />
        <div>
          <p class="eyebrow">Automatic · local conversion</p>
          <h1>VIO Converter</h1>
        </div>
      </div>
      <div id="offlineBadge" class="badge">Checking offline support…</div>
    </header>

    <section class="card workflow-card">
      <h2>Convert a video</h2>
      <div class="workflow-grid workflow-grid-auto">
        <div class="workflow-section workflow-source">
          <label class="workflow-label">1. Source video</label>
          <label class="file-picker">
            <span>Select video</span>
            <input id="videoInput" type="file" accept="video/*,.webm,.mp4,.mov,.m4v,.mkv" />
          </label>
          <div id="sourceInfo" class="source-info muted">No video selected.</div>
          <div id="planInfo" class="plan-info hidden" aria-live="polite"></div>
        </div>

        <div class="workflow-section">
          <label class="workflow-label" for="slot">2. Target slot</label>
          <select id="slot"></select>
          <p class="hint">The result will be named <span id="slotFilename">001.vio</span>.</p>
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
        <summary>How Automatic mode works</summary>
        <div class="details-body technical-profile">
          <dl>
            <div><dt>Fast path</dt><dd>H.264/AVC + AAC video at or below 1920×1080 is remuxed without video/audio re-encoding.</dd></div>
            <div><dt>Conversion path</dt><dd>Higher-resolution or otherwise incompatible input is re-encoded to H.264/AVC 1920×1080 at 25 fps with AAC-LC audio.</dd></div>
            <div><dt>Player limit</dt><dd>Production assumption: maximum supported video resolution is 1920×1080.</dd></div>
            <div><dt>VIO transform</dt><dd>Every byte of the resulting MP4 is XORed with <code>0xA7</code>.</dd></div>
          </dl>
        </div>
      </details>

      <details class="card collapsible">
        <summary>Device compatibility</summary>
        <div class="details-body">
          <div id="compatibility" class="status-list"></div>
          <p class="hint">Conversion runs locally in the browser through WebCodecs and Mediabunny. Source videos are not uploaded to the server.</p>
        </div>
      </details>

      <details class="card collapsible">
        <summary>Technical log</summary>
        <div class="details-body"><pre id="log"></pre></div>
      </details>

      <details class="card collapsible">
        <summary>About this build</summary>
        <div class="details-body">
          <p class="hint">Production workflow derived from physical-player tests. Experimental results and compatibility evidence are retained in <code>HANDOVER.md</code>.</p>
          <p class="hint">Build <?= htmlspecialchars($config['app_version'], ENT_QUOTES, 'UTF-8') ?></p>
        </div>
      </details>
    </section>
  </main>
</body>
</html>
