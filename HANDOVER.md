# VIO Converter — Technical handover

**Current application generation:** v2.0.0-webcodecs  
**Hosting target:** DreamHost shared hosting / PHP  
**Primary client target:** recent iPhone/Safari, also desktop Chrome/Safari  
**Design goal:** local/offline video conversion without App Store installation or server upload
**v2 physical validation:** PASSED on 2026-09-14 — browser-generated Mediabunny/WebCodecs VIO played successfully in the target hardware player

---

## 1. Project origin

The work began with an unreadable-looking 4 GB SD card. The original physical card was `/dev/disk24` at the time of imaging, but macOS disk numbers are dynamic and must never be relied upon later.

A full image was created with GNU ddrescue:

```bash
sudo ddrescue -f -n /dev/rdisk24 ~/sdcard.img ~/sdcard.map
```

Result:

- 4,026 MB rescued
- zero read errors
- zero bad sectors
- zero bad areas

The physical media therefore appeared healthy.

The image contained one FAT32 partition. `fsck_msdos -n` parsed it successfully and reported 130 files and approximately 2.66 GiB free. It mounted read-only successfully.

Relevant filesystem structure:

```text
01/
  001.vio
  002.vio
  ...
  015.vio
```

The `.vio` files were typically 70–90 MB.

---

## 2. VIO reverse engineering

A hex dump of `001.vio` began with many `0xA7` bytes. XORing every byte with `0xA7` revealed a normal MP4 header:

```text
stored: c1 d3 de d7
xor A7: 66 74 79 70  -> ftyp
```

The entire file decoded successfully with:

```python
bytes(b ^ 0xA7 for b in chunk)
```

The decoded `001.mp4` played completely.

**Confirmed VIO transformation:** the VIO file is simply the underlying MP4 XOR-obfuscated byte-for-byte with key `0xA7`. XOR is symmetric, so the exact same operation converts MP4 -> VIO and VIO -> MP4.

---

## 3. Original media profile

`ffprobe` of decoded `001.mp4` showed:

### Video

- H.264 / AVC
- Main profile
- Level 4.0
- `avc1`
- 1920×1080
- progressive
- yuv420p, BT.709
- 25 fps
- time base 1/25000
- around 1.984 Mbps
- keyframes exactly every 1.2 seconds = 30 frames

### Audio

- AAC-LC
- `mp4a`
- 48,000 Hz
- stereo
- around 128 kbps
- time base 1/48000

### Original MP4 container observations

- major brand `mp42`
- minor version 1
- compatible brands `isom mp41 mp42`
- video handler `Core Media Video`
- audio handler `Core Media Audio`
- `moov` before media data
- original `udta` had title, description, author and a `thmb` thumbnail atom

Those exact metadata details turned out not to be required by the playback device.

---

## 4. Physical-device compatibility experiments

### 4.1 Filesystem copy

A second nominal 4 GB SD card was 64 MiB smaller than the original image, so a sector-for-sector clone could not fit.

The test card was reformatted FAT32/MBR and files were copied at filesystem level. The copied card worked in the target device.

**Conclusion:** exact MBR geometry, original FAT allocation and exact sector placement are not required.

### 4.2 FFmpeg remux of original video

The decoded original MP4 was remuxed with FFmpeg, losing/changing some original Core Media metadata. It was XORed back to `.vio` and placed on the test card.

The target device played it successfully.

**Conclusion:** exact original MP4 atom layout, Core Media handler strings, thumbnail atom and original user metadata are not required.

### 4.3 Completely different video

`Takedown.webm` was VP9 1920×1080 at 23.98 fps with Opus audio. It was transcoded with native FFmpeg to the discovered target profile, XORed with `0xA7`, copied as `001.vio`, and tested in the physical device.

It played the entire replacement video successfully, including its different 3:07 duration.

**Conclusion:** the device reads media duration from the file and accepts newly encoded content. The practical requirements are the compatible media profile, MP4 container, filename/slot convention and XOR transform.

---

## 5. Proven desktop FFmpeg recipe

This command produced a VIO-compatible replacement when followed by XOR `0xA7`:

```bash
ffmpeg -i INPUT \
  -map 0:v:0 -map 0:a:0? \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=25" \
  -c:v libx264 \
  -profile:v main \
  -level:v 4.0 \
  -pix_fmt yuv420p \
  -b:v 1984k \
  -maxrate 1984k \
  -bufsize 3968k \
  -g 30 \
  -keyint_min 30 \
  -sc_threshold 0 \
  -c:a aac \
  -profile:a aac_low \
  -b:a 128k \
  -ar 48000 \
  -ac 2 \
  -video_track_timescale 25000 \
  -tag:v avc1 \
  -tag:a mp4a \
  -movflags +faststart \
  OUTPUT.mp4
```

This remains the reference implementation when comparing browser output.

---

## 6. Why v1 was abandoned

v1 used `ffmpeg.wasm`. Advantages: close match to the already proven desktop FFmpeg command. Problems found during real browser testing:

1. Safari appeared stuck at 2% while loading/running the heavy WASM runtime.
2. The application initially flooded the DOM with thousands of identical FFmpeg log lines, worsening Safari responsiveness.
3. A tested AV1 source failed in Chrome with:

```text
[av1] Missing Sequence Header.
Error while decoding stream #0:0
Conversion failed!
```

The log repeated >14,000 times. v1.3 added log throttling and an AV1 guard, but the architecture was no longer attractive for iPhone.

---

## 7. v2 architecture

v2 uses Mediabunny as the demux/mux/conversion abstraction and browser-native WebCodecs for actual codec work.

```text
File picker
   |
Mediabunny BlobSource/Input
   |
source video/audio track canDecode() checks
   |
WebCodecs decode
   |
Mediabunny Conversion
   |-- video -> AVC, 1920x1080, 25 fps, ~1.984 Mbps,
   |            keyFrameInterval 1.2 s, hardware preferred
   |-- audio -> AAC, 48 kHz, 2 channels, 128 kbps
   |
Mediabunny Mp4OutputFormat(fastStart='in-memory')
   |
BufferTarget
   |
in-place XOR 0xA7
   |
File('NNN.vio')
   |
Web Share API / browser download
```

### Why this is a better iPhone fit

- avoids the ~32 MB generic FFmpeg core;
- uses browser/platform codec implementations and can prefer hardware acceleration;
- input codec compatibility can be checked explicitly using `track.canDecode()`;
- output AVC/AAC capability is checked at startup;
- Safari 26 added WebCodecs AudioEncoder/AudioDecoder, removing the previous major audio gap;
- a small self-hosted Mediabunny AAC fallback is retained for browsers that cannot natively encode AAC.

---

## 8. PHP/DreamHost design

There is deliberately no server-side conversion.

PHP responsibilities:

- render `index.php`;
- expose configuration from `config.php`;
- provide `health.php`;
- provide one-time `tools/fetch_mediabunny.php` installer.

Client responsibilities:

- inspect local file;
- decode/transcode locally;
- mux MP4;
- XOR;
- save/share `.vio`.

The source video is never uploaded.

### Vendor installation

After upload to DreamHost:

```bash
php tools/fetch_mediabunny.php
```

This downloads pinned browser-global builds from the official Mediabunny GitHub release into `vendor/mediabunny/`.

Runtime then has no third-party CDN dependency.

---

## 9. Offline behavior

`sw.js` precaches:

- PHP app shell response
- CSS/JS/manifest/icons
- self-hosted Mediabunny main bundle
- self-hosted AAC fallback bundle

After one successful online load, the application can reopen offline. Actual conversion never needs the network.

The PWA should be served over HTTPS for iPhone testing. `localhost` is only appropriate for desktop development.

---

## 10. v2 physical validation and remaining limitations

### Critical compatibility milestone — PASSED

On **2026-09-14**, the complete v2 browser pipeline was tested against the real target hardware and **worked successfully**. A source video was converted by the v2 application using Mediabunny/WebCodecs, muxed to MP4, XOR-obfuscated byte-for-byte with `0xA7`, saved as a `.vio` file, copied to the SD card, and played successfully by the physical player.

This validates the complete production-direction pipeline:

```text
source video
    ↓
Mediabunny + browser WebCodecs
    ↓
H.264/AAC MP4
    ↓
XOR 0xA7
    ↓
NNN.vio
    ↓
FAT32 SD card / 01/
    ↓
target hardware player  ✅
```

This result removes the principal remaining container/encoder compatibility uncertainty. In particular, the player does **not** require the original Core Media MP4 atom layout, proprietary `udta` metadata/thumbnail, FFmpeg-specific muxing, exact original duration/file size, or exact original filesystem geometry. Both native-FFmpeg replacements and the browser-native Mediabunny/WebCodecs output have now been accepted by the real device.

**Architectural decision:** Mediabunny/WebCodecs is now the preferred primary conversion engine. FFmpeg/WASM is no longer required in the critical path and should not be reintroduced unless a concrete unsupported-input requirement justifies it. The WebCodecs route is substantially lighter and avoids the FFmpeg/WASM initialization and AV1-decoder problems encountered during v1 testing.

The following characteristics may still be useful to inspect for diagnostics or regression testing, but they are no longer blockers because the physical player accepted the v2 output:

- H.264 profile/level selected by the browser encoder;
- pixel format/color metadata;
- actual bitrate behavior;
- MP4 brand/track metadata;
- exact keyframe cadence;
- video timescale;
- audio priming/edit-list behavior.

### Memory

v2 currently uses `BufferTarget`; the full MP4 resides in memory before XOR. XOR is performed in-place to avoid an extra full-size buffer. This should be reasonable for the tested files (~50–100 MB output), but very long videos should eventually use a streaming/file-system output approach.

### No-audio sources

v2 currently rejects files with no audio track. This is deliberate because every validated original VIO had AAC audio. A future revision can synthesize a silent 48 kHz stereo track.

---

## 11. Next test sequence

The core v2 conversion and physical-player compatibility milestone is complete. The next phase is production hardening:

1. Deploy/retain v2 on the intended DreamHost HTTPS site and confirm `health.php` reports `mediabunny_vendor_ready: true`.
2. Test the same workflow on the target iPhone Safari/PWA, including Save/Share to Files.
3. After one successful online load, enable Airplane Mode, reopen the PWA, convert a video, and verify true offline operation.
4. Test representative inputs: VP9/WebM, H.264/MP4, HEVC/iPhone video, portrait video, variable-frame-rate phone video, and AV1 where the browser reports decoding support.
5. Stress-test longer videos and record conversion time, output size, memory pressure, thermal behavior, and browser stability.
6. Implement a defined policy for sources with no audio; preferably synthesize silent AAC-LC 48 kHz stereo rather than rejecting them.
7. Add practical input-size/duration guardrails if iPhone memory testing shows they are needed.
8. Polish error messages, capability reporting, progress, cancellation, and SD-card/save instructions.
9. Treat the physically validated v2 output as the regression baseline for future changes.

---

## 12. Useful inspection procedure for v2 output

Because `.vio` is XOR-obfuscated, decode a generated v2 file on macOS:

```python
src = '001.vio'
dst = '001-v2.mp4'
with open(src, 'rb') as fin, open(dst, 'wb') as fout:
    while chunk := fin.read(1024 * 1024):
        fout.write(bytes(b ^ 0xA7 for b in chunk))
```

Then compare against the known-good FFmpeg-generated replacement:

```bash
ffprobe -hide_banner 001-v2.mp4
mp4dump 001-v2.mp4 | head -200
```

Specifically check AVC codec/profile/level, resolution, 25 fps, AAC 48 kHz stereo, and keyframe intervals.

---

## 13. Important files

```text
index.php                     UI shell and client config injection
config.php                    central output profile and pinned dependency versions
app.js                        WebCodecs/Mediabunny conversion + XOR + save/share
sw.js                         offline cache
styles.css                    UI
health.php                    deployment diagnostic
tools/fetch_mediabunny.php    one-time vendor downloader
vendor/mediabunny/            self-hosted browser runtime
README.md                     quick start
DREAMHOST.md                  deployment instructions
HANDOVER.md                   this document
```

---

## 14. Suggested prompt for a future ChatGPT session

> Continue the VIO Converter project from the attached HANDOVER.md. The target device uses FAT32 cards with `01/001.vio` etc. VIO is an MP4 XORed byte-for-byte with 0xA7. The PHP-hosted v2 PWA uses Mediabunny/WebCodecs and its browser-generated VIO has been physically validated successfully in the real player on 2026-09-14. Treat Mediabunny/WebCodecs as the preferred architecture; FFmpeg/WASM is not required in the critical path. The next phase is iPhone/PWA offline validation, input-format coverage, memory/stress testing, no-audio handling, and production polish. Do not assume exact original MP4 metadata or filesystem geometry is required; those constraints have already been disproven by physical tests.


## 2026-09-14 — Mobile Safari large-video selection tuning

Observed on iPhone: a ~10 s video selected quickly, while a ~2 min video could remain in the selection/inspection stage for several minutes. The v2 selection handler was doing two expensive things before the user pressed Convert: calling `videoTrack.canDecode()` / `audioTrack.canDecode()` on the concrete tracks, and immediately attaching the Photos-backed `File` to a `<video>` preview.

Version 2.1 changes selection to be metadata-only. It constructs Mediabunny `Input` with `BlobSource` (2 MiB cache), reads track/container metadata, and defers decoder validation to `Conversion.init()` after Convert is pressed. Automatic preview attachment is disabled. Selection timing is logged so future iPhone tests can separate iOS Photos materialization time from application metadata-read time.

## 2026-09-14 — v2.2 fast-path tuning

After the v2.1 selection optimization, a ~2-minute video became available for conversion within a few seconds on Mobile Safari. The conversion completed, the resulting `.vio` was saved directly to the microSD card, and the target hardware played it successfully. This confirms that the metadata-only selection change solved the major pre-conversion delay without breaking the validated output path.

Version **2.2.0-fast-path** adds conservative direct-copy/remux optimization while preserving the v2.1 fast-selection behavior.

The optimization decision is deferred until the user presses **Convert**. This is deliberate: selection must remain cheap on iOS Photos-backed files. At conversion start, the application performs a small frame-rate probe only when the video is already AVC at 1920×1080, then chooses a per-track plan:

- copy video only when it is AVC/H.264 Main Profile at Level <= 4.0, 1920×1080, approximately 25 fps;
- copy audio only when it is AAC, 48 kHz, stereo;
- compatible tracks are muxed directly without decoding/re-encoding;
- incompatible tracks fall back independently to the physically validated WebCodecs settings.

This yields three modes: `FAST REMUX`, `HYBRID`, and `TRANSCODE`. Mediabunny's conversion API prefers encoded-packet copying when the configuration permits it. Options such as bitrate, resizing, frame-rate conversion, and keyframe interval force transcoding, so v2.2 deliberately omits those options only for tracks judged compatible.

Additional v2.2 tuning:

- remembers the last selected VIO slot locally;
- reports the selected conversion plan in the technical log;
- reports approximate processing speed in multiples of realtime;
- keeps XOR in-place to avoid a second full output buffer;
- revokes previous result object URLs when a new source is selected;
- bumps the application and Service Worker cache versions to avoid stale Mobile Safari assets.

### v2.2 validation status

The underlying v2/v2.1 transcoding path is already physically validated. The new **fast-remux and hybrid paths still require physical-player regression tests** using suitable already-compatible inputs. A failed fast-path test should not invalidate WebCodecs/Mediabunny; the application can simply tighten eligibility or disable copying for the affected track.

## 2026-09-14 — v2.3 encoder-preset experiment

v2.3 introduces user-selectable video encoder presets so conversion speed can be compared directly against physical-player compatibility without rebuilding the application:

| Preset | Resolution | FPS | Video bitrate | GOP | Status |
| --- | --- | ---: | ---: | ---: | --- |
| Compatible | 1920x1080 | 25 | 1,984 kb/s | 1.2 s | Physical-player validated |
| Fast | 1920x1080 | 25 | 1,400 kb/s | 2.0 s | Needs physical-player validation |
| Experimental | 1280x720 | 25 | 1,000 kb/s | 2.0 s | Needs physical-player validation |

Design rules:

- Compatible preserves the v2.2 automatic packet-copy/remux fast path when the source already matches the validated AVC/AAC profile.
- Fast and Experimental deliberately force video transcoding so their conversion times can be compared meaningfully.
- Compatible AAC 48 kHz stereo audio is still copied in all modes to isolate video-encoding cost where possible.
- The UI reports the selected preset, target parameters, elapsed time, and effective realtime speed.
- Mediabunny's high-level Conversion API exposes bitrate, resolution, frame rate, keyframe interval, and hardware preference, but not WebCodecs latencyMode directly; therefore these presets only use supported, measurable controls.

### Recommended v2.3 test procedure

Use the same source file for all three modes and record:

1. total conversion time;
2. reported realtime multiplier;
3. resulting `.vio` file size;
4. whether the physical player lists the file;
5. whether playback starts;
6. whether playback remains stable through the whole file;
7. audio sync and seeking behavior.

If Fast is accepted, it is the leading candidate to replace Compatible as the normal transcode preset. If Experimental is also accepted and visual quality is adequate, consider making it a user-facing speed/size option rather than the default.


## UI layout update (v2.3.1)
The mobile interface is interaction-first. Source selection, target slot, encoding preset, Convert, progress, and result/save actions appear before any explanatory material. Device compatibility, encoding profile details, technical logs, and build/about information are placed after the workflow in collapsed `<details>` panels. This keeps the normal iPhone workflow short while retaining diagnostics when needed.

---

## 2026-09-14 — v2.4 realtime/remux experiment

### Motivation

On an iPhone 14 Pro, an iPhone-recorded 4K source was observed converting at roughly 0.2x realtime in the previous Experimental 720p preset. Source characteristics were:

- 3840x2160
- H.264/AVC High profile (`avc1.640033`, Level 5.1)
- AAC
- 48000 Hz
- stereo

This means the browser must decode 4K AVC, resize every frame, and encode a new H.264 stream. Merely reducing bitrate is unlikely to solve the performance problem.

### v2.4 test modes

**Control — Compatible**
- Known-good player profile.
- 1920x1080, 25 fps, ~1.984 Mb/s, GOP 1.2 s.
- This remains the compatibility control.

**Test A — Original / Remux**
- Requires AVC + AAC input.
- Uses Mediabunny forced copy mode.
- No decode, resizing, frame-rate conversion, or video encoding.
- Preserves original 4K resolution/profile/level/framerate/bitrate.
- Tests whether the physical player can directly decode the iPhone's original AVC track after MP4 remux + XOR.
- If accepted, this becomes the preferred fast path for compatible phone recordings.

**Test B — 1080p Realtime**
- Uses `VideoSampleSink` with hardware-preferred decode.
- Uses `VideoSampleSource` with H.264 encoding, `latencyMode='realtime'` and `hardwareAcceleration='prefer-hardware'`.
- Target 1920x1080, 25 fps, 1.4 Mb/s, GOP 2 s.
- Audio is copied if already AAC 48 kHz stereo.

**Test C — 720p Realtime**
- Same low-level realtime/hardware path.
- Target 1280x720, 25 fps, 1.0 Mb/s, GOP 2 s.
- Tests whether lower encoder pixel load matters significantly when source decode remains 4K.

### Instrumentation

For each run the app logs:
- test name;
- source dimensions, codec string, audio format and duration;
- target parameters;
- progress/realtime multiplier;
- total elapsed time and overall realtime factor;
- the actual WebCodecs `VideoEncoderConfig` surfaced by Mediabunny where available.

The realtime paths use the lower-level Mediabunny media-source API specifically because the high-level `ConversionVideoOptions` exposes `hardwareAcceleration` but not `latencyMode`. This distinction must be retained in future changes.

### Validation status

- Control / ordinary v2 WebCodecs profile: **physically validated**.
- Test A Original/Remux with 4K iPhone source: **not yet validated**.
- Test B 1080p Realtime: **not yet validated**.
- Test C 720p Realtime: **not yet validated**.

Do not promote Test A/B/C to defaults until the physical player has been tested for complete playback and A/V sync.


## v2.4.1 composable conversion fix

Tests B/C previously passed `tags: {}` to a Mediabunny conversion configured with `composable: true`. Mediabunny disallows conversion-level metadata in composable mode because the caller owns the output lifecycle. v2.4.1 removes that illegal option; output metadata is intentionally left unset for these experimental paths.
