'use strict';

const CONFIG = window.VIO_CONFIG ?? {};
const PROFILE = CONFIG.conversion ?? {};
const PLAYER = CONFIG.player ?? {};
const XOR_KEY = CONFIG.xorKey ?? 0xA7;

const els = {
  compatibility: document.querySelector('#compatibility'),
  offlineBadge: document.querySelector('#offlineBadge'),
  input: document.querySelector('#videoInput'),
  sourceInfo: document.querySelector('#sourceInfo'),
  planInfo: document.querySelector('#planInfo'),
  slot: document.querySelector('#slot'),
  slotFilename: document.querySelector('#slotFilename'),
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
let currentOutput = null;
let cancelRequested = false;
let resultFile = null;
let resultUrl = null;
let capabilitiesReady = false;
let avcEncoderAvailable = false;
let aacEncoderAvailable = false;

for (const n of (CONFIG.slots ?? Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(3, '0')))) {
  const option = document.createElement('option');
  option.value = n;
  option.textContent = `${n}.vio`;
  els.slot.append(option);
}

function updateSlotFilename() {
  els.slotFilename.textContent = `${els.slot.value}.vio`;
  try { localStorage.setItem('vio.lastSlot', els.slot.value); } catch (_) {}
}
try {
  const savedSlot = localStorage.getItem('vio.lastSlot');
  if (savedSlot && [...els.slot.options].some(o => o.value === savedSlot)) els.slot.value = savedSlot;
} catch (_) {}
els.slot.addEventListener('change', updateSlotFilename);
updateSlotFilename();

function log(message) {
  const stamp = new Date().toLocaleTimeString();
  const line = `[${stamp}] ${String(message)}`;
  const lines = (els.log.textContent + line + '\n').split('\n');
  if (lines.length > 300) lines.splice(0, lines.length - 300);
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
      log('Native AAC encoder unavailable; registered bundled AAC fallback encoder.');
    }
    avcEncoderAvailable = Boolean(avc);
    aacEncoderAvailable = Boolean(aac);
    capabilityRow('H.264/AVC encoder', avcEncoderAvailable, 'Used when a source needs video re-encoding');
    capabilityRow('AAC encoder', aacEncoderAvailable, 'Used when source audio cannot be copied');
    capabilitiesReady = true;
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
  if (!audioTrack) throw new Error('No audio track was found.');

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

function automaticPlan(meta) {
  const maxSide = Math.max(meta.width, meta.height);
  const minSide = Math.min(meta.width, meta.height);
  const withinResolution = maxSide <= (PLAYER.max_width ?? 1920) && minSide <= (PLAYER.max_height ?? 1080);
  const videoCopy = meta.videoCodec === (PLAYER.direct_video_codec ?? 'avc') && withinResolution;
  const audioCopy = meta.audioCodec === (PLAYER.direct_audio_codec ?? 'aac');
  const direct = videoCopy && audioCopy;
  return {
    direct,
    videoCopy,
    audioCopy,
    withinResolution,
    mode: direct ? 'Fast remux' : 'Compatible conversion',
    reason: direct
      ? `H.264/AAC source is within the player's assumed ${PLAYER.max_width ?? 1920}×${PLAYER.max_height ?? 1080} resolution limit.`
      : !withinResolution
        ? `Source resolution ${meta.width}×${meta.height} exceeds the player's assumed ${PLAYER.max_width ?? 1920}×${PLAYER.max_height ?? 1080} limit.`
        : meta.videoCodec !== (PLAYER.direct_video_codec ?? 'avc')
          ? `Source video codec ${meta.videoCodec} must be converted to H.264/AVC.`
          : `Source audio codec ${meta.audioCodec} must be converted to AAC.`
  };
}

function renderPlan(meta) {
  const plan = automaticPlan(meta);
  els.planInfo.classList.remove('hidden', 'plan-fast', 'plan-transcode');
  els.planInfo.classList.add(plan.direct ? 'plan-fast' : 'plan-transcode');
  els.planInfo.innerHTML = plan.direct
    ? `<strong>Fast remux</strong><br>No video or audio re-encoding is required. ${plan.reason}`
    : `<strong>Conversion required</strong><br>${plan.reason} Only tracks that need conversion will be re-encoded; video above the player limit is reduced to the safe 1920×1080 profile.`;
  return plan;
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
  els.planInfo.classList.add('hidden');
  setStage('Reading video metadata…', 0);

  try {
    selectedMeta = await inspectSelectedFile(file);
    const elapsed = (performance.now() - started) / 1000;
    const durationText = Number.isFinite(selectedMeta.duration) ? ` · ${selectedMeta.duration.toFixed(1)} s` : '';
    els.sourceInfo.innerHTML = `<strong>${file.name}</strong><br>${humanBytes(file.size)}${durationText} · ${selectedMeta.width}×${selectedMeta.height} · video ${selectedMeta.videoCodec}${selectedMeta.videoCodecString ? ` (${selectedMeta.videoCodecString})` : ''} · audio ${selectedMeta.audioCodec}, ${selectedMeta.sampleRate} Hz, ${selectedMeta.channels} ch`;
    const plan = renderPlan(selectedMeta);
    log(`Source metadata ready in ${elapsed.toFixed(2)} s: ${selectedMeta.width}x${selectedMeta.height} ${selectedMeta.videoCodec}${selectedMeta.videoCodecString ? ` ${selectedMeta.videoCodecString}` : ''}; ${selectedMeta.audioCodec} ${selectedMeta.sampleRate} Hz ${selectedMeta.channels} ch. Automatic plan=${plan.mode}.`);
    const needsVideoEncoder = !plan.videoCopy;
    const needsAudioEncoder = !plan.audioCopy;
    const canRun = capabilitiesReady && (!needsVideoEncoder || avcEncoderAvailable) && (!needsAudioEncoder || aacEncoderAvailable);
    els.convert.disabled = !canRun;
    setStage(canRun ? `Ready — ${plan.mode}.` : 'This source requires an encoder that is unavailable in this browser.', 0);
  } catch (err) {
    const elapsed = (performance.now() - started) / 1000;
    els.sourceInfo.textContent = `${file.name} — ${err.message}`;
    els.planInfo.classList.add('hidden');
    setStage(`Source not supported: ${err.message}`, 0);
    log(`Source inspection failed after ${elapsed.toFixed(2)} s: ${err.message}`);
  }
});

async function getTracks() {
  const videoTrack = await sourceInput.getPrimaryVideoTrack();
  const audioTrack = await sourceInput.getPrimaryAudioTrack();
  if (!videoTrack || !audioTrack) throw new Error('Primary video/audio tracks are unavailable.');
  return { videoTrack, audioTrack };
}

function safeVideoOptions() {
  return {
    codec: 'avc',
    width: PROFILE.width ?? 1920,
    height: PROFILE.height ?? 1080,
    fit: 'contain',
    frameRate: PROFILE.fps ?? 25,
    bitrate: PROFILE.video_bitrate ?? 1984000,
    keyFrameInterval: PROFILE.gop_seconds ?? 1.2,
    hardwareAcceleration: 'no-preference',
    forceTranscode: true
  };
}

function safeAudioOptions() {
  return {
    codec: 'aac',
    bitrate: PROFILE.audio_bitrate ?? 128000,
    sampleRate: PROFILE.audio_rate ?? 48000,
    numberOfChannels: PROFILE.audio_channels ?? 2,
    forceTranscode: true
  };
}

function makeOutput(mb) {
  const target = new mb.BufferTarget();
  const output = new mb.Output({
    format: new mb.Mp4OutputFormat({ fastStart: 'in-memory', metadataFormat: 'auto' }),
    target
  });
  return { target, output };
}

async function runAutomaticConversion(mb, meta, target, output, startedAt) {
  const plan = automaticPlan(meta);
  await getTracks();
  let videoOptions;
  let audioOptions;
  let copy;
  let label;

  if (plan.direct) {
    videoOptions = {};
    audioOptions = {};
    copy = { mode: 'forced', shiftTolerance: 0, boundaryPolicy: 'expand' };
    label = 'Fast remux';
    log(`Automatic path: FAST REMUX. Copying ${meta.width}x${meta.height} AVC + AAC without re-encoding.`);
  } else {
    videoOptions = plan.videoCopy ? {} : safeVideoOptions();
    const audioAlreadySafe = meta.audioCodec === 'aac' && meta.sampleRate === (PROFILE.audio_rate ?? 48000) && meta.channels === (PROFILE.audio_channels ?? 2);
    audioOptions = plan.audioCopy && audioAlreadySafe ? {} : safeAudioOptions();
    copy = { mode: 'preferred', shiftTolerance: 0, boundaryPolicy: 'expand' };
    label = plan.videoCopy ? 'Compatible audio conversion' : '1080p compatible re-encode';
    log(`Automatic path: COMPATIBLE CONVERSION. video=${plan.videoCopy ? 'copy AVC' : `encode ${PROFILE.width ?? 1920}x${PROFILE.height ?? 1080} AVC ${(PROFILE.video_bitrate ?? 1984000) / 1000000} Mb/s @ ${PROFILE.fps ?? 25} fps`}; audio=${plan.audioCopy && audioAlreadySafe ? 'copy AAC' : 'encode AAC'}.`);
  }

  currentConversion = await mb.Conversion.init({
    input: sourceInput,
    output,
    tracks: 'primary',
    tags: {},
    copy,
    video: videoOptions,
    audio: audioOptions
  });

  if (!currentConversion.isValid) {
    const reasons = currentConversion.discardedTracks.map(x => x.reason).join(', ') || 'unknown reason';
    throw new Error(`Conversion configuration is not valid (${reasons}).`);
  }

  currentConversion.onProgress = (fraction, processedTime) => {
    const elapsed = (performance.now() - startedAt) / 1000;
    const speed = Number.isFinite(processedTime) && elapsed > 0.5 ? processedTime / elapsed : null;
    setStage(`${label}${Number.isFinite(processedTime) ? ` · ${processedTime.toFixed(1)} s processed` : ''}${speed ? ` · ${speed.toFixed(2)}× realtime` : ''}`, 2 + fraction * 93);
  };
  await currentConversion.execute();
  return label;
}

async function xorAndPublish(target, modeLabel, startedAt) {
  if (!target.buffer) throw new Error('The MP4 muxer produced no output buffer.');
  setStage('Creating VIO file…', 96);
  const bytes = new Uint8Array(target.buffer);
  const chunk = 4 * 1024 * 1024;
  for (let start = 0; start < bytes.length; start += chunk) {
    if (cancelRequested) throw new Error('Conversion canceled by user.');
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
  const duration = selectedMeta?.duration;
  const overallSpeed = Number.isFinite(duration) && totalSeconds > 0 ? duration / totalSeconds : null;
  els.resultSummary.textContent = `${filename} · ${humanBytes(resultFile.size)} · ${modeLabel} · ${totalSeconds.toFixed(1)} s total${overallSpeed ? ` · ${overallSpeed.toFixed(2)}× realtime overall` : ''}.`;
  els.resultCard.classList.remove('hidden');
  setStage('Complete.', 100);
  log(`RESULT: ${modeLabel}; ${filename}; ${humanBytes(resultFile.size)}; ${totalSeconds.toFixed(1)} s total${overallSpeed ? `; ${overallSpeed.toFixed(2)}x realtime overall` : ''}.`);
}

async function convert() {
  if (!selectedFile || !sourceInput || !selectedMeta) return;
  const mb = getMb();
  cancelRequested = false;
  els.convert.disabled = true;
  els.cancel.classList.remove('hidden');
  els.resultCard.classList.add('hidden');
  const startedAt = performance.now();
  try {
    const plan = automaticPlan(selectedMeta);
    log(`AUTOMATIC START: ${selectedMeta.width}x${selectedMeta.height} ${selectedMeta.videoCodec}${selectedMeta.videoCodecString ? ` ${selectedMeta.videoCodecString}` : ''}; audio=${selectedMeta.audioCodec} ${selectedMeta.sampleRate} Hz ${selectedMeta.channels} ch; plan=${plan.mode}; duration=${Number.isFinite(selectedMeta.duration) ? selectedMeta.duration.toFixed(2) + ' s' : 'unknown'}.`);
    const { target, output } = makeOutput(mb);
    currentOutput = output;
    const modeLabel = await runAutomaticConversion(mb, selectedMeta, target, output, startedAt);
    await xorAndPublish(target, modeLabel, startedAt);
  } catch (err) {
    if (cancelRequested || /canceled/i.test(err.message ?? '')) {
      setStage('Conversion canceled.', 0);
      log('Conversion canceled by user.');
    } else {
      setStage(`Conversion failed: ${err.message}`, 0);
      log(`ERROR: ${err.stack || err.message}`);
    }
  } finally {
    currentConversion = null;
    currentOutput = null;
    els.cancel.classList.add('hidden');
    if (selectedMeta) {
      const plan = automaticPlan(selectedMeta);
      els.convert.disabled = !(capabilitiesReady && (plan.videoCopy || avcEncoderAvailable) && (plan.audioCopy || aacEncoderAvailable));
    } else {
      els.convert.disabled = true;
    }
  }
}

els.convert.addEventListener('click', convert);
els.cancel.addEventListener('click', async () => {
  cancelRequested = true;
  setStage('Canceling…');
  try { if (currentConversion) await currentConversion.cancel(); } catch (_) {}
  try { if (currentOutput) await currentOutput.cancel(); } catch (_) {}
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
