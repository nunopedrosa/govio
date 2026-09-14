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
  preset: document.querySelector('#preset'),
  presetInfo: document.querySelector('#presetInfo'),
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
let selectedMeta = null;
let sourceInput = null;
let currentConversion = null;
let resultFile = null;
let resultUrl = null;
let capabilitiesReady = false;
const PRESETS = PROFILE.presets ?? { compatible: { label: 'Compatible', width: 1920, height: 1080, video_bitrate: 1984000, gop_seconds: 1.2, description: 'Validated profile.' } };


for (const n of (CONFIG.slots ?? Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(3, '0')))) {
  const option = document.createElement('option');
  option.value = n;
  option.textContent = `${n}.vio`;
  els.slot.append(option);
}


for (const [key, preset] of Object.entries(PRESETS)) {
  const option = document.createElement('option');
  option.value = key;
  option.textContent = preset.label ?? key;
  els.preset.append(option);
}

function selectedPreset() {
  return PRESETS[els.preset.value] ?? PRESETS.compatible ?? Object.values(PRESETS)[0];
}

function updatePresetInfo() {
  const p = selectedPreset();
  els.presetInfo.textContent = `${p.description ?? ''} ${p.width}×${p.height}, ${(p.video_bitrate / 1000000).toFixed(2)} Mb/s, GOP ${p.gop_seconds.toFixed(1)} s.`.trim();
  try { localStorage.setItem('vio.lastPreset', els.preset.value); } catch (_) {}
}

try {
  const savedPreset = localStorage.getItem('vio.lastPreset');
  if (savedPreset && [...els.preset.options].some(o => o.value === savedPreset)) els.preset.value = savedPreset;
} catch (_) {}
els.preset.addEventListener('change', updatePresetInfo);
updatePresetInfo();

try {
  const savedSlot = localStorage.getItem('vio.lastSlot');
  if (savedSlot && [...els.slot.options].some(o => o.value === savedSlot)) els.slot.value = savedSlot;
} catch (_) {}

els.slot.addEventListener('change', () => {
  try { localStorage.setItem('vio.lastSlot', els.slot.value); } catch (_) {}
});

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
    capabilityRow('H.264/AVC encoder', avc, 'Required when video transcoding is needed');
    capabilityRow('AAC encoder', aac, 'Required when audio transcoding is needed');
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

  sourceInput = new mb.Input({
    formats: mb.ALL_FORMATS,
    source: new mb.BlobSource(file, { maxCacheSize: 2 * 1024 * 1024 })
  });

  const videoTrack = await sourceInput.getPrimaryVideoTrack();
  if (!videoTrack) throw new Error('No video track was found in this file.');
  const audioTrack = await sourceInput.getPrimaryAudioTrack();
  if (!audioTrack) throw new Error('No audio track was found. This prototype requires audio to match the validated device profile.');

  const [videoCodec, videoCodecString, audioCodec, width, height, channels, sampleRate, duration] = await Promise.all([
    videoTrack.getCodec(),
    videoTrack.getCodecParameterString?.() ?? Promise.resolve(null),
    audioTrack.getCodec(),
    videoTrack.getDisplayWidth(),
    videoTrack.getDisplayHeight(),
    audioTrack.getNumberOfChannels(),
    audioTrack.getSampleRate(),
    videoTrack.getDurationFromMetadata().catch(() => null)
  ]);

  return { videoCodec, videoCodecString, audioCodec, width, height, channels, sampleRate, duration };
}

els.input.addEventListener('change', async () => {
  const file = els.input.files?.[0];
  if (!file) return;
  const started = performance.now();
  selectedFile = file;
  selectedMeta = null;
  resultFile = null;
  if (resultUrl) { URL.revokeObjectURL(resultUrl); resultUrl = null; }
  els.convert.disabled = true;
  els.resultCard.classList.add('hidden');
  setStage('Reading video metadata…', 0);

  els.preview.pause?.();
  els.preview.removeAttribute('src');
  els.preview.load?.();
  els.preview.classList.add('hidden');

  try {
    selectedMeta = await inspectSelectedFile(file);
    const elapsed = (performance.now() - started) / 1000;
    const durationText = Number.isFinite(selectedMeta.duration) ? ` · ${selectedMeta.duration.toFixed(1)} s` : '';
    els.sourceInfo.innerHTML = `<strong>${file.name}</strong><br>${humanBytes(file.size)}${durationText} · ${selectedMeta.width}×${selectedMeta.height} · video ${selectedMeta.videoCodec}${selectedMeta.videoCodecString ? ` (${selectedMeta.videoCodecString})` : ''} · audio ${selectedMeta.audioCodec}, ${selectedMeta.sampleRate} Hz, ${selectedMeta.channels} ch`;
    log(`Source metadata ready in ${elapsed.toFixed(2)} s: ${selectedMeta.videoCodec} video + ${selectedMeta.audioCodec} audio.`);
    els.convert.disabled = !capabilitiesReady;
    setStage(capabilitiesReady ? 'Ready to convert.' : 'Source metadata is readable, but required output codecs are unavailable.', 0);
  } catch (err) {
    const elapsed = (performance.now() - started) / 1000;
    els.sourceInfo.textContent = `${file.name} — ${err.message}`;
    setStage(`Source not supported: ${err.message}`, 0);
    log(`Source inspection failed after ${elapsed.toFixed(2)} s: ${err.message}`);
  }
});

function isMainProfileAtMostLevel40(codecString) {
  if (!codecString) return false;
  const match = /^avc1\.([0-9a-f]{6})$/i.exec(codecString.trim());
  if (!match) return false;
  const profile = parseInt(match[1].slice(0, 2), 16);
  const level = parseInt(match[1].slice(4, 6), 16);
  return profile === 0x4d && level <= 0x28;
}

async function chooseConversionPlan() {
  const videoTrack = await sourceInput.getPrimaryVideoTrack();
  const audioTrack = await sourceInput.getPrimaryAudioTrack();
  if (!videoTrack || !audioTrack) throw new Error('Primary video/audio tracks are no longer available. Please reselect the file.');

  setStage('Checking for fast-path compatibility…', 1);
  const [videoCodec, codecString, width, height, audioCodec, sampleRate, channels] = await Promise.all([
    videoTrack.getCodec(),
    videoTrack.getCodecParameterString?.() ?? Promise.resolve(null),
    videoTrack.getDisplayWidth(),
    videoTrack.getDisplayHeight(),
    audioTrack.getCodec(),
    audioTrack.getSampleRate(),
    audioTrack.getNumberOfChannels()
  ]);

  const compatiblePreset = PRESETS.compatible ?? selectedPreset();
  let fps = null;
  if (videoCodec === 'avc' && width === compatiblePreset.width && height === compatiblePreset.height) {
    // This reads only a small packet sample and is intentionally deferred until Convert.
    const metrics = await videoTrack.computeFrameRateMetrics({ targetPacketCount: 64 });
    fps = metrics.bestGuessFrameRate;
  }

  const videoCopy = videoCodec === 'avc' &&
    width === compatiblePreset.width &&
    height === compatiblePreset.height &&
    Number.isFinite(fps) && Math.abs(fps - (PROFILE.fps ?? 25)) <= 0.05 &&
    isMainProfileAtMostLevel40(codecString);

  const audioCopy = audioCodec === 'aac' &&
    sampleRate === (PROFILE.audio_rate ?? 48000) &&
    channels === (PROFILE.audio_channels ?? 2);

  return { videoCopy, audioCopy, fps, codecString, videoCodec, audioCodec };
}

function transcodeVideoOptions(preset) {
  return {
    codec: 'avc',
    width: preset.width,
    height: preset.height,
    fit: 'contain',
    frameRate: PROFILE.fps ?? 25,
    bitrate: preset.video_bitrate,
    keyFrameInterval: preset.gop_seconds,
    hardwareAcceleration: 'prefer-hardware',
    forceTranscode: true
  };
}

function transcodeAudioOptions() {
  return {
    codec: 'aac',
    bitrate: PROFILE.audio_bitrate ?? 128000,
    sampleRate: PROFILE.audio_rate ?? 48000,
    numberOfChannels: PROFILE.audio_channels ?? 2,
    forceTranscode: true
  };
}

async function convert() {
  if (!selectedFile || !sourceInput) return;
  const mb = getMb();
  els.convert.disabled = true;
  els.cancel.classList.remove('hidden');
  els.resultCard.classList.add('hidden');
  const startedAt = performance.now();
  let plan = null;

  try {
    plan = await chooseConversionPlan();
    const presetKey = els.preset.value;
    const preset = selectedPreset();
    const allowVideoCopy = presetKey === 'compatible' && plan.videoCopy;
    const allowAudioCopy = plan.audioCopy;
    const mode = allowVideoCopy && allowAudioCopy ? 'FAST REMUX' :
      allowVideoCopy ? 'HYBRID (copy video, encode audio)' :
      allowAudioCopy ? `HYBRID (${preset.label}: encode video, copy audio)` : `${preset.label.toUpperCase()} TRANSCODE`;
    log(`Conversion plan: ${mode}. Preset=${preset.label}; target=${preset.width}x${preset.height} ${(preset.video_bitrate/1000000).toFixed(2)} Mb/s GOP ${preset.gop_seconds}s. Video=${plan.videoCodec}${plan.codecString ? ` ${plan.codecString}` : ''}${Number.isFinite(plan.fps) ? ` ${plan.fps.toFixed(3)} fps` : ''}; audio=${plan.audioCodec}.`);
    setStage(allowVideoCopy && allowAudioCopy ? 'Fast path: remuxing without re-encoding…' : `Preparing ${preset.label} conversion…`, 2);

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
      copy: { mode: 'preferred', shiftTolerance: 0, boundaryPolicy: 'expand' },
      video: allowVideoCopy ? {} : transcodeVideoOptions(preset),
      audio: allowAudioCopy ? {} : transcodeAudioOptions()
    });

    if (!currentConversion.isValid) {
      const reasons = currentConversion.discardedTracks.map(x => x.reason).join(', ') || 'unknown reason';
      throw new Error(`Conversion configuration is not valid on this device (${reasons}).`);
    }

    currentConversion.onProgress = (fraction, processedTime) => {
      const pct = 2 + fraction * 93;
      const elapsed = (performance.now() - startedAt) / 1000;
      const speed = Number.isFinite(processedTime) && elapsed > 0.5 ? processedTime / elapsed : null;
      const label = allowVideoCopy && allowAudioCopy ? 'Remuxing locally' : `${preset.label} encode`;
      setStage(`${label}${Number.isFinite(processedTime) ? ` · ${processedTime.toFixed(1)} s processed` : ''}${speed ? ` · ${speed.toFixed(1)}× realtime` : ''}`, pct);
    };

    await currentConversion.execute();
    if (!target.buffer) throw new Error('The MP4 muxer produced no output buffer.');

    setStage('Creating VIO file…', 96);
    const bytes = new Uint8Array(target.buffer);
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
    const totalSeconds = (performance.now() - startedAt) / 1000;
    const resultMode = allowVideoCopy && allowAudioCopy ? 'fast remux' : `${preset.label} encode`;
    const duration = selectedMeta?.duration;
    const overallSpeed = Number.isFinite(duration) && totalSeconds > 0 ? ` · ${(duration / totalSeconds).toFixed(2)}× realtime overall` : '';
    els.resultSummary.textContent = `${filename} · ${humanBytes(resultFile.size)} · ${resultMode} · ${totalSeconds.toFixed(1)} s total${overallSpeed}.`;
    els.resultCard.classList.remove('hidden');
    setStage('Complete.', 100);
    log(`Created ${filename} (${humanBytes(resultFile.size)}) using ${resultMode} in ${totalSeconds.toFixed(1)} s.`);
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
