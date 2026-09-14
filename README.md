# VIO Converter v2

Offline-first PHP-hosted PWA for converting ordinary videos into the `.vio` format accepted by the target device.

## What changed in v2

v1 used `ffmpeg.wasm`. It worked for some inputs but was heavy (~32 MB engine), slow on mobile, and exposed an AV1 decoding failure. v2 removes FFmpeg/WASM from the main path and uses **WebCodecs through Mediabunny**.

The conversion remains entirely local in the browser:

1. Read the selected file locally.
2. Verify that the browser can decode its primary video and audio tracks.
3. Re-encode video to AVC/H.264 at 1920×1080, 25 fps, ~1.984 Mbps, keyframe interval 1.2 s.
4. Re-encode audio to AAC-LC, 48 kHz stereo, 128 kbps.
5. Mux MP4 with fast-start metadata.
6. XOR the MP4 bytes in-place with `0xA7`.
7. Save/share as `001.vio` … `015.vio`.

No video is uploaded to DreamHost.

## DreamHost install

Upload the project to the site directory, then SSH into DreamHost and run:

```bash
cd /path/to/site
php tools/fetch_mediabunny.php
```

This downloads the pinned browser builds into `vendor/mediabunny/`. There is no CDN dependency at runtime.

Check deployment:

```text
https://your-domain/health.php
```

`mediabunny_vendor_ready` should be `true`.

## Local test

After the vendor files exist:

```bash
php -S 127.0.0.1:8080
```

Open `http://127.0.0.1:8080/`.

For iPhone/PWA testing use HTTPS on the real host.

## Known prototype constraints

- The selected input must contain both video and audio. This deliberately matches the validated device files.
- Input decode support depends on the browser/device. The app calls `track.canDecode()` and fails early if, for example, an older iPhone cannot decode an AV1 source.
- Output is currently buffered in memory before the XOR step. This is appropriate for the tested ~50–100 MB outputs, but very long videos should eventually use a streaming/output-file path.
- The device accepted a completely different 3:07 source video after conversion/XOR, so exact original metadata, title, thumbnail atoms and duration are not required.

See `HANDOVER.md` for full project history and continuation notes.
