# VIO Converter v3 — Automatic Production Workflow

Offline-first PHP/PWA for converting ordinary videos to the `.vio` format used by the target hardware player.

## Production behavior

The application now has one user-facing mode: **Automatic**.

After selecting a video, the browser inspects only lightweight container/track metadata and chooses the conversion path automatically:

1. **Fast remux** — when the source is H.264/AVC + AAC and is within the assumed player resolution limit of 1920×1080 (orientation-aware: longest side ≤1920 and shortest side ≤1080). The encoded tracks are copied without video/audio re-encoding.
2. **Compatible re-encode** — when the source exceeds 1080p or uses incompatible codecs. Video is converted to H.264/AVC 1920×1080, 25 fps, about 1.984 Mb/s, GOP 1.2 s. AAC 48 kHz stereo audio is copied when already compatible; otherwise audio is converted to AAC-LC 48 kHz stereo.
3. The resulting MP4 is transformed into `NNN.vio` by XORing every byte with `0xA7`.

The video never needs to be uploaded to the server. Processing happens locally in the browser through Mediabunny and WebCodecs.

## Why 1080p is the production boundary

Physical-player testing on 2026-09-14 established:

- 1920×1080 H.264 High, about 30 fps, ~15 Mb/s: **works** through remux.
- 1920×1080 H.264 High, about 60 fps, ~22 Mb/s: **works** through remux.
- 3840×2160 iPhone H.264 High@5.1: remuxed MP4 is valid, but the hardware player **does not play it**.

The application therefore treats 1920×1080 as the maximum supported player resolution. Frame rate, bitrate and H.264 profile are not unnecessarily normalized when a source can be remuxed directly.

## Deployment on DreamHost

Clone/pull the repository into the document root for `vio.trekm.com`, then install the self-hosted Mediabunny browser files:

```bash
php tools/fetch_mediabunny.php
```

Verify deployment with:

```text
https://vio.trekm.com/health.php
```

`mediabunny_vendor_ready` should be `true`.

No Python or Node runtime is required on DreamHost.

## Local development

PHP's built-in server is sufficient:

```bash
php -S 127.0.0.1:8080
```

Open:

```text
http://127.0.0.1:8080/
```

The self-hosted Mediabunny vendor files must exist for conversion to work.

## SD-card workflow

The generated file should be saved to the player's FAT32 card under:

```text
01/001.vio
01/002.vio
...
01/015.vio
```

On iPhone/iPad, use the system Share/Save sheet to save the generated `.vio` file into the SD card's `01` directory.

## Continuity

See `HANDOVER.md` for the full reverse-engineering history, physical-player validation, failed experiments, performance measurements, and rationale behind the Automatic rules.


### v3.0.1 visual identity
Added the orange kids-camera artwork to the page header, PWA/home-screen icons, Apple touch icon, and browser favicons. Service-worker cache bumped to ensure installed/mobile clients refresh the assets.
