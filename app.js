'use strict';

const CONFIG = window.VIO_CONFIG ?? {};
const PROFILE = CONFIG.conversion ?? {};
const XOR_KEY = CONFIG.xorKey ?? 0xA7;

const els = {
  compatibility: document.querySelector('#compatibility'),
  offlineBadge: document.querySelector('#offlineBadge'),
  input: document.querySelector('#videoInput'),
  sourceInfo: document.querySelector('#sourceInfo'),
  preview: document.querySelector('#preview'),
  slot: document.querySelector('#slot'),
  convert: document.querySelector('#convertButton'),
  cancel: document.querySelector('#cancelButton'),
  progress: document.querySelector('#progress'),
  percent: document.querySelector('#progressPercent'),
  stage: document.querySelector('#stage'),
  log: document.querySelector('#log'),
  resultCard: document.querySelector('#resultCard'),
  resultSummary: document.querySelector('#resultSummary'),
  share: document.querySelector('#shareButton'),
  download: document.querySelector('#downloadLink')
};

let selectedFile = null;
let sourceInput = null;
let currentConversion = null;
let resultFile = null;
let resultUrl = null;
let capabilitiesReady = false;

for (const n of (CONFIG.slots ?? Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(3, '0')))) {
  const option = document.createElement('option');
  option.value = n;
  option.textContent = `${n}.vio`;
  els.slot.append(option);
}

function log(message) {
  const stamp = new Date().toLocaleTimeString();
  const line = `[${stamp}] ${String(message)}`;
  const lines = (els.log.textContent + line + '\n').split('\n');
  if (lines.length > 250) lines.splice(0, lines.length - 250);
  els.log.textContent = lines.join('\n');
  els.log.scrollTop = els.log.scrollHeight;
}

function setStage(text, value = null) {
  els.stage.textContent = text;
  if (value !== null) {
    const n = Math.max(0, Math.min(100, Math.round(value)));
    els.progress.value = n;
    els.percent.textContent = `${n}%`;
  }
}

function humanBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function capabilityRow(name, ok, detail) {
  const row = document.createElement('div');
  row.className = 'status-row';
  row.innerHTML = `<span>${name}<br><small class="muted">${detail}</small></span><span class="${ok ? 'status-ok' : 'status-bad'}">${ok ? 'Available' : 'Missing'}</span>`;
  els.compatibility.append(row);
}

function getMb() {
  if (!window.Mediabunny) throw new Error('Mediabunny is not installed. Run php tools/fetch_mediabunny.php on the server, then reload.');
  return window.Mediabunny;
}

async function checkCapabilities() {
  els.compatibility.innerHTML = '';
  const hasWebCodecs = typeof VideoDecoder !== 'undefined' && typeof VideoEncoder !== 'undefined' &&
    typeof AudioDecoder !== 'undefined' && typeof AudioEncoder !== 'undefined';
  capabilityRow('WebCodecs', hasWebCodecs, 'Native video/audio decoding and encoding');
  capabilityRow('Service Worker', 'serviceWorker' in navigator, 'Offline application cache');
  capabilityRow('File API', typeof File !== 'undefined' && typeof Blob !== 'undefined', 'Local input and output files');
  capabilityRow('Share API', typeof navigator.share === 'function', 'Optional iOS save/share integration');

  if (!window.Mediabunny) {
    capabilityRow('Mediabunny', false, 'Self-hosted browser media toolkit is missing');
    setStage('Mediabunny vendor files are missing. Run the server installer.');
    return;
  }
  capabilityRow('Mediabunny', true, `Self-hosted v${CONFIG.mediabunny?.version ?? 'unknown'}`);

  if (!hasWebCodecs) {
    setStage('This browser does not provide the required WebCodecs APIs.');
    return;
  }

  try {
    const mb = getMb();
    const avc = await mb.canEncodeVideo('avc');
    let aac = await mb.canEncodeAudio('aac');
    if (!aac && window.MediabunnyAacEncoder?.registerAacEncoder) {
      window.MediabunnyAacEncoder.registerAacEncoder();
      aac = await mb.canEncodeAudio('aac');
      log('Native AAC encoder unavailable; registered the small bundled AAC fallback encoder.');
    }
    capabilityRow('H.264/AVC encoder', avc, 'Required output video codec');
    capabilityRow('AAC encoder', aac, 'Required output audio codec');
    capabilitiesReady = Boolean(avc && aac);
    if (!capabilitiesReady) setStage('This device cannot encode the required AVC/AAC profile.');
  } catch (err) {
    log(`Capability check failed: ${err.message}`);
    setStage(`Capability check failed: ${err.message}`);
  }

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      els.offlineBadge.textContent = 'Ready for offline use';
      els.offlineBadge.classList.add('ok');
    } catch (err) {
      els.offlineBadge.textContent = 'Offline cache unavailable';
      log(`Service worker error: ${err.message}`);
    }
  }
}

async function inspectSelectedFile(file) {
  const mb = getMb();
  sourceInput?.dispose?.();

  // BlobSource reads the selected File lazily. Keep selection metadata-only:
  // do NOT call track.canDecode() here and do NOT attach the file to <video>.
  sourceInput = new mb.Input({
    formats: mb.ALL_FORMATS,
    source: new mb.BlobSource(file, { maxCacheSize: 2 * 1024 * 1024 })
  });

  const videoTrack = await sourceInput.getPrimaryVideoTrack();
  if (!videoTrack) throw new Error('No video track was found in this file.');
  const audioTrack = await sourceInput.getPrimaryAudioTrack();
  if (!audioTrack) throw new Error('No audio track was found. This prototype requires audio to match the validated device profile.');

  // These are container/track metadata reads only. Decoder capability is checked
  // later by Conversion.init() when the user explicitly starts conversion.
  const [videoCodec, audioCodec, width, height, channels, sampleRate, duration] = await Promise.all([
    (videoTrack.getCodec?.() ?? Promise.resolve(videoTrack.codec ?? 'unknown')),
    (audioTrack.getCodec?.() ?? Promise.resolve(audioTrack.codec ?? 'unknown')),
    videoTrack.getDisplayWidth(),
    videoTrack.getDisplayHeight(),
    audioTrack.getNumberOfChannels(),
    audioTrack.getSampleRate(),
    videoTrack.getDurationFromMetadata?.().catch?.(() => null) ?? Promise.resolve(null)
  ]);

  return { videoCodec, audioCodec, width, height, channels, sampleRate, duration };
}

els.input.addEventListener('change', async () => {
  const file = els.input.files?.[0];
  if (!file) return;
  const started = performance.now();
  selectedFile = file;
  els.convert.disabled = true;
  els.resultCard.classList.add('hidden');
  setStage('Reading video metadata…', 0);

  // Do not automatically create/attach a preview on iOS. Attaching a large
  // Photos-backed File to <video> can cause Safari/Photos to prepare/read it
  // before the user has asked to convert.
  els.preview.pause?.();
  els.preview.removeAttribute('src');
  els.preview.load?.();
  els.preview.classList.add('hidden');

  try {
    const info = await inspectSelectedFile(file);
    const elapsed = (performance.now() - started) / 1000;
    const durationText = Number.isFinite(info.duration) ? ` · ${info.duration.toFixed(1)} s` : '';
    els.sourceInfo.innerHTML = `<strong>${file.name}</strong><br>${humanBytes(file.size)}${durationText} · ${info.width}×${info.height} · video ${info.videoCodec} · audio ${info.audioCodec}, ${info.sampleRate} Hz, ${info.channels} ch`;
    log(`Source metadata ready in ${elapsed.toFixed(2)} s: ${info.videoCodec} video + ${info.audioCodec} audio.`);
    els.convert.disabled = !capabilitiesReady;
    setStage(capabilitiesReady ? 'Ready to convert.' : 'Source metadata is readable, but required output codecs are unavailable.', 0);
  } catch (err) {
    const elapsed = (performance.now() - started) / 1000;
    els.sourceInfo.textContent = `${file.name} — ${err.message}`;
    setStage(`Source not supported: ${err.message}`, 0);
    log(`Source inspection failed after ${elapsed.toFixed(2)} s: ${err.message}`);
  }
});

async function convert() {
  if (!selectedFile || !sourceInput) return;
  const mb = getMb();
  els.convert.disabled = true;
  els.cancel.classList.remove('hidden');
  els.resultCard.classList.add('hidden');
  setStage('Checking source codecs and preparing conversion…', 1);
  log('Starting WebCodecs/Mediabunny conversion.');

  try {
    const target = new mb.BufferTarget();
    const output = new mb.Output({
      format: new mb.Mp4OutputFormat({ fastStart: 'in-memory', metadataFormat: 'auto' }),
      target
    });

    currentConversion = await mb.Conversion.init({
      input: sourceInput,
      output,
      tracks: 'primary',
      tags: {},
      video: {
        codec: 'avc',
        width: PROFILE.width ?? 1920,
        height: PROFILE.height ?? 1080,
        fit: 'contain',
        frameRate: PROFILE.fps ?? 25,
        bitrate: PROFILE.video_bitrate ?? 1984000,
        keyFrameInterval: PROFILE.gop_seconds ?? 1.2,
        hardwareAcceleration: 'prefer-hardware',
        forceTranscode: true
      },
      audio: {
        codec: 'aac',
        bitrate: PROFILE.audio_bitrate ?? 128000,
        sampleRate: PROFILE.audio_rate ?? 48000,
        numberOfChannels: PROFILE.audio_channels ?? 2,
        forceTranscode: true
      }
    });

    if (!currentConversion.isValid) {
      const reasons = currentConversion.discardedTracks.map(x => x.reason).join(', ') || 'unknown reason';
      throw new Error(`Conversion configuration is not valid on this device (${reasons}).`);
    }

    currentConversion.onProgress = (fraction, processedTime) => {
      const pct = 2 + fraction * 93;
      setStage(`Encoding locally${Number.isFinite(processedTime) ? ` · ${processedTime.toFixed(1)} s processed` : ''}`, pct);
    };

    await currentConversion.execute();
    if (!target.buffer) throw new Error('The MP4 muxer produced no output buffer.');

    setStage('Creating VIO file…', 96);
    const bytes = new Uint8Array(target.buffer);
    // XOR in place: avoids a second full-size output buffer on memory-constrained phones.
    const chunk = 4 * 1024 * 1024;
    for (let start = 0; start < bytes.length; start += chunk) {
      const end = Math.min(bytes.length, start + chunk);
      for (let i = start; i < end; i += 1) bytes[i] ^= XOR_KEY;
      setStage('Creating VIO file…', 96 + 3 * (end / bytes.length));
      await new Promise(requestAnimationFrame);
    }

    const filename = `${els.slot.value}.vio`;
    resultFile = new File([target.buffer], filename, { type: 'application/octet-stream' });
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(resultFile);
    els.download.href = resultUrl;
    els.download.download = filename;
    els.resultSummary.textContent = `${filename} · ${humanBytes(resultFile.size)} · generated entirely on this device.`;
    els.resultCard.classList.remove('hidden');
    setStage('Complete.', 100);
    log(`Created ${filename} (${humanBytes(resultFile.size)}).`);
  } catch (err) {
    if (String(err?.name).includes('Canceled') || currentConversion?.state === 'canceled') {
      setStage('Conversion canceled.', 0);
      log('Conversion canceled by user.');
    } else {
      setStage(`Conversion failed: ${err.message}`, 0);
      log(`ERROR: ${err.stack || err.message}`);
    }
  } finally {
    currentConversion = null;
    els.cancel.classList.add('hidden');
    els.convert.disabled = !selectedFile || !capabilitiesReady;
  }
}

els.convert.addEventListener('click', convert);
els.cancel.addEventListener('click', async () => {
  if (currentConversion) {
    setStage('Canceling…');
    await currentConversion.cancel();
  }
});

els.share.addEventListener('click', async () => {
  if (!resultFile) return;
  try {
    if (navigator.canShare?.({ files: [resultFile] })) {
      await navigator.share({ files: [resultFile], title: resultFile.name });
    } else {
      els.download.click();
    }
  } catch (err) {
    if (err.name !== 'AbortError') log(`Share failed: ${err.message}`);
  }
});

window.addEventListener('DOMContentLoaded', checkCapabilities);
window.addEventListener('beforeunload', () => {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  sourceInput?.dispose?.();
});
