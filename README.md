# VIO Converter v2.4 — Realtime / Remux Experiments

Offline-first PHP/PWA for converting ordinary videos to the `.vio` format used by the target player.

## Confirmed format

The target player accepts an MP4 containing H.264/AVC + AAC after every byte is XORed with `0xA7` and saved as `NNN.vio` in the card's `01` directory. The normal Mediabunny/WebCodecs 1080p conversion path has been physically validated on the player.

## v2.4 purpose

v2.4 is an explicitly instrumented performance experiment for high-resolution iPhone sources, especially 4K AVC recordings. Do not treat every preset as equally validated.

### Control — Compatible

The known-good control:
- H.264/AVC
- 1920x1080
- 25 fps
- ~1.984 Mb/s
- GOP 1.2 s
- AAC 48 kHz stereo

This is the baseline for player compatibility.

### Test A — Original / Remux

Copies the source H.264 and AAC packets into a new MP4 without re-encoding, then applies XOR `0xA7`.

For an iPhone 14 Pro 4K AVC recording this tests a major hypothesis: **does the player accept the original 3840x2160 High-profile stream directly?**

If yes, this is by far the fastest path because no video decode/resize/re-encode is needed.

This test intentionally preserves source resolution, AVC profile/level, frame rate and bitrate.

### Test B — 1080p Realtime

Uses the lower-level Mediabunny sample pipeline so WebCodecs can be requested with:
- `latencyMode: 'realtime'`
- `hardwareAcceleration: 'prefer-hardware'`
- 1920x1080
- 25 fps
- ~1.4 Mb/s
- GOP 2 s

The app logs the actual `VideoEncoderConfig` returned by Safari so we can see what configuration the browser chose.

### Test C — 720p Realtime

Same realtime/hardware-prioritized path as Test B but outputs:
- 1280x720
- 25 fps
- ~1.0 Mb/s
- GOP 2 s

This isolates whether reducing output pixel count materially helps when the expensive source decode is still 4K.

## Recommended test sequence

Use the same source file for all tests and record:
1. conversion time / realtime multiplier;
2. resulting VIO size;
3. whether the physical player opens it;
4. complete playback;
5. audio/video sync;
6. seeking behavior.

Recommended order: Control, Test A, Test B, Test C.

## Deployment

Upload/pull the repository into the DreamHost document root, then ensure Mediabunny is installed:

```bash
php tools/fetch_mediabunny.php
```

Verify:

```text
https://vio.trekm.com/health.php
```

Then reload the PWA. v2.4 uses a new Service Worker cache name.


## v2.4.1 composable conversion fix

Tests B/C previously passed `tags: {}` to a Mediabunny conversion configured with `composable: true`. Mediabunny disallows conversion-level metadata in composable mode because the caller owns the output lifecycle. v2.4.1 removes that illegal option; output metadata is intentionally left unset for these experimental paths.
