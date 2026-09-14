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
