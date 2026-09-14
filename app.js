'use strict';

const CONFIG = window.VIO_CONFIG ?? {};
const PROFILE = CONFIG.conversion ?? {};
const XOR_KEY = CONFIG.xorKey ?? 0xA7;
const PRESETS = PROFILE.presets ?? {};

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
let currentOutput = null;
let cancelRequested = false;
let resultFile = null;
let resultUrl = null;
let capabilitiesReady = false;

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
  return PRESETS[els.preset.value] ?? PRESETS.control ?? Object.values(PRESETS)[0];
}

function updatePresetInfo() {
  const p = selectedPreset();
  const target = p.kind === 'remux'
    ? 'Original resolution, profile, frame rate and bitrate are preserved.'
    : `${p.width}×${p.height}, ${(p.video_bitrate / 1000000).toFixed(2)} Mb/s, ${PROFILE.fps ?? 25} fps, GOP ${p.gop_seconds.toFixed(1)} s.`;
  els.presetInfo.textContent = `${p.description ?? ''} ${target}`.trim();
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
    capabilityRow('H.264/AVC encoder', avc, 'Required for Control and Realtime tests');
    capabilityRow('AAC encoder', aac, 'Needed only when source audio cannot be copied');
    capabilitiesReady = Boolean(avc && aac);
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
    log(`Source metadata ready in ${elapsed.toFixed(2)} s: ${selectedMeta.width}x${selectedMeta.height} ${selectedMeta.videoCodec}${selectedMeta.videoCodecString ? ` ${selectedMeta.videoCodecString}` : ''}; ${selectedMeta.audioCodec} ${selectedMeta.sampleRate} Hz ${selectedMeta.channels} ch.`);
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

async function getTrackPlan() {
  const videoTrack = await sourceInput.getPrimaryVideoTrack();
  const audioTrack = await sourceInput.getPrimaryAudioTrack();
  if (!videoTrack || !audioTrack) throw new Error('Primary video/audio tracks are unavailable. Please reselect the file.');
  const [videoCodec, codecString, width, height, audioCodec, sampleRate, channels] = await Promise.all([
    videoTrack.getCodec(), videoTrack.getCodecParameterString?.() ?? Promise.resolve(null),
    videoTrack.getDisplayWidth(), videoTrack.getDisplayHeight(), audioTrack.getCodec(),
    audioTrack.getSampleRate(), audioTrack.getNumberOfChannels()
  ]);
  const audioCopy = audioCodec === 'aac' && sampleRate === (PROFILE.audio_rate ?? 48000) && channels === (PROFILE.audio_channels ?? 2);
  return { videoTrack, audioTrack, videoCodec, codecString, width, height, audioCodec, sampleRate, channels, audioCopy };
}

function controlVideoOptions() {
  const p = PRESETS.control;
  return {
    codec: 'avc', width: p.width, height: p.height, fit: 'contain', frameRate: PROFILE.fps ?? 25,
    bitrate: p.video_bitrate, keyFrameInterval: p.gop_seconds,
    hardwareAcceleration: 'prefer-hardware', forceTranscode: true
  };
}
function transcodeAudioOptions() {
  return {
    codec: 'aac', bitrate: PROFILE.audio_bitrate ?? 128000,
    sampleRate: PROFILE.audio_rate ?? 48000, numberOfChannels: PROFILE.audio_channels ?? 2,
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

async function runStandardConversion(mb, preset, plan, target, output, startedAt) {
  const isRemux = preset.kind === 'remux';
  if (isRemux && (plan.videoCodec !== 'avc' || plan.audioCodec !== 'aac')) {
    throw new Error('Test A requires an H.264/AVC video track and AAC audio so both tracks can be copied unchanged.');
  }

  const videoOptions = isRemux ? {} : controlVideoOptions();
  const audioOptions = plan.audioCopy ? {} : transcodeAudioOptions();
  currentConversion = await mb.Conversion.init({
    input: sourceInput, output, tracks: 'primary', tags: {},
    copy: isRemux ? { mode: 'forced', shiftTolerance: 0, boundaryPolicy: 'expand' } : { mode: 'preferred', shiftTolerance: 0, boundaryPolicy: 'expand' },
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
    const label = isRemux ? 'Test A: remuxing original tracks' : 'Control: compatible encode';
    setStage(`${label}${Number.isFinite(processedTime) ? ` · ${processedTime.toFixed(1)} s processed` : ''}${speed ? ` · ${speed.toFixed(2)}× realtime` : ''}`, 2 + fraction * 93);
  };
  await currentConversion.execute();
  return isRemux ? 'Test A — Original / Remux' : 'Control — Compatible';
}

async function runRealtimeConversion(mb, preset, plan, target, output, startedAt) {
  const duration = selectedMeta?.duration;
  const videoSink = new mb.VideoSampleSink(plan.videoTrack, { hardwareAcceleration: 'prefer-hardware' });
  let actualEncoderConfig = null;
  const videoSource = new mb.VideoSampleSource({
    codec: 'avc',
    quality: new mb.Quality({ bitrate: preset.video_bitrate }),
    latencyMode: 'realtime',
    hardwareAcceleration: 'prefer-hardware',
    keyFrameInterval: preset.gop_seconds,
    transform: {
      width: preset.width,
      height: preset.height,
      fit: 'contain',
      frameRate: PROFILE.fps ?? 25,
      alpha: 'discard'
    },
    onEncoderConfig: config => {
      actualEncoderConfig = config;
      log(`WebCodecs encoder config: codec=${config.codec}; ${config.width}x${config.height}; bitrate=${config.bitrate ?? 'n/a'}; framerate=${config.framerate ?? 'n/a'}; hardwareAcceleration=${config.hardwareAcceleration ?? 'n/a'}; latencyMode=${config.latencyMode ?? 'n/a'}.`);
    }
  });
  output.addVideoTrack(videoSource, { frameRate: PROFILE.fps ?? 25 });

  currentConversion = await mb.Conversion.init({
    input: sourceInput,
    output,
    tracks: 'primary',
    video: { discard: true },
    audio: plan.audioCopy ? {} : transcodeAudioOptions(),
    copy: { mode: 'preferred', shiftTolerance: 0, boundaryPolicy: 'expand' },
    composable: true,
    showWarnings: false
  });

  currentOutput = output;
  await output.start();
  let lastAudioPump = -1;
  let lastTimestamp = 0;
  try {
    for await (const sample of videoSink.samples()) {
      if (cancelRequested) throw new Error('Conversion canceled by user.');
      lastTimestamp = Math.max(lastTimestamp, sample.timestamp ?? 0);
      await videoSource.add(sample);
      sample.close();

      if (lastTimestamp - lastAudioPump >= 1.0) {
        await currentConversion.execute({ until: lastTimestamp });
        lastAudioPump = lastTimestamp;
      }
      const elapsed = (performance.now() - startedAt) / 1000;
      const speed = elapsed > 0.5 ? lastTimestamp / elapsed : null;
      const fraction = Number.isFinite(duration) && duration > 0 ? Math.min(1, lastTimestamp / duration) : 0;
      setStage(`${preset.label} · ${lastTimestamp.toFixed(1)} s processed${speed ? ` · ${speed.toFixed(2)}× realtime` : ''}`, 2 + fraction * 91);
    }
    videoSource.close();
    await currentConversion.execute();
    await output.finalize();
  } catch (err) {
    try { videoSource.close(); } catch (_) {}
    try { await output.cancel(); } catch (_) {}
    throw err;
  }
  if (!actualEncoderConfig) log('Realtime encode completed, but Safari did not expose an encoder configuration callback.');
  return preset.label;
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
  if (!selectedFile || !sourceInput) return;
  const mb = getMb();
  const preset = selectedPreset();
  cancelRequested = false;
  els.convert.disabled = true;
  els.cancel.classList.remove('hidden');
  els.resultCard.classList.add('hidden');
  const startedAt = performance.now();
  try {
    const plan = await getTrackPlan();
    log(`TEST START: ${preset.label}. Source=${plan.width}x${plan.height} ${plan.videoCodec}${plan.codecString ? ` ${plan.codecString}` : ''}; audio=${plan.audioCodec} ${plan.sampleRate} Hz ${plan.channels} ch; duration=${Number.isFinite(selectedMeta?.duration) ? selectedMeta.duration.toFixed(2) + ' s' : 'unknown'}.`);
    if (preset.kind === 'remux') {
      log('Test A hypothesis: the player may accept the iPhone H.264/AAC stream without re-encoding. This preserves original resolution/profile/frame rate/bitrate.');
    } else if (preset.kind === 'realtime') {
      log(`${preset.label} hypothesis: WebCodecs realtime latency + prefer-hardware may improve 4K downscale/re-encode speed. Target=${preset.width}x${preset.height} ${(preset.video_bitrate / 1000000).toFixed(2)} Mb/s, ${PROFILE.fps ?? 25} fps, GOP ${preset.gop_seconds}s.`);
    } else {
      log('Control hypothesis: reproduce the already validated player-compatible profile.');
    }

    const { target, output } = makeOutput(mb);
    currentOutput = output;
    const modeLabel = preset.kind === 'realtime'
      ? await runRealtimeConversion(mb, preset, plan, target, output, startedAt)
      : await runStandardConversion(mb, preset, plan, target, output, startedAt);
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
    els.convert.disabled = !selectedFile || !capabilitiesReady;
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
