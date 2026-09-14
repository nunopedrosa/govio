# VIO Converter v2.2

Offline-first PHP-hosted PWA for converting ordinary videos into the `.vio` format accepted by the target device.

## Current architecture

The application runs locally in the browser. DreamHost/PHP only serves the application and configuration; source videos are not uploaded to the server.

The primary engine is **Mediabunny + WebCodecs**. The resulting MP4 is XORed byte-for-byte with `0xA7` and saved as `001.vio` … `015.vio`.

The complete WebCodecs/Mediabunny output path has been physically validated on the real target player.

## v2.2 fast path

v2.2 adds conservative track-copy/remux optimization. The expensive compatibility decision is intentionally deferred until the user presses **Convert**, keeping the fast-selection behavior introduced in v2.1.

A video track is copied directly when it already matches the validated profile closely enough:

- AVC/H.264
- Main Profile, Level <= 4.0
- 1920×1080
- approximately 25 fps

An audio track is copied directly when it is already:

- AAC
- 48 kHz
- stereo

The two tracks are considered independently. This produces three possible plans:

- **FAST REMUX** — copy video + copy audio, no media re-encoding
- **HYBRID** — copy one compatible track and transcode only the other
- **TRANSCODE** — use the fully validated WebCodecs conversion for both tracks

Mediabunny's conversion API natively supports direct packet copying when no transcode-forcing options are applied, so the fast path does not decode/re-encode compatible media.

## Validated transcode profile

- Video: H.264/AVC, 1920×1080, 25 fps, ~1.984 Mbps
- Keyframe interval: 1.2 s / 30 frames
- Audio: AAC-LC, 48 kHz, stereo, 128 kbps
- Container: MP4, fast-start
- VIO transform: XOR every byte with `0xA7`

## DreamHost install

Upload the project to the site directory, then SSH into DreamHost and run:

```bash
cd /path/to/site
php tools/fetch_mediabunny.php
```

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

## Mobile performance decisions

- Selection is metadata-only.
- No automatic `<video>` preview is opened for the selected Photos asset.
- Per-track decoder checks are deferred until conversion is actually required.
- Fast-path frame-rate probing happens only after pressing Convert and samples a small number of packets.
- XOR is done in-place on the final MP4 buffer to avoid an extra output-sized allocation.
- Conversion progress reports effective processing speed where available.

## Known constraints

- The selected input currently must contain both video and audio.
- The final MP4/VIO still uses an in-memory `BufferTarget`; very long videos need memory/stress testing.
- Fast-remux eligibility is intentionally conservative. A file that misses the fast path simply uses the already-validated transcode path.

See `HANDOVER.md` for the full reverse-engineering history and continuation notes.

## v2.3 encoder presets

v2.3 adds three selectable encoding modes for physical-player testing:

- **Compatible** — validated 1920x1080, 25 fps, ~1.984 Mb/s, GOP 1.2 s. Compatible AVC/AAC sources may use the fast remux path.
- **Fast** — forces video re-encoding at 1920x1080, 25 fps, ~1.4 Mb/s, GOP 2.0 s. Intended to reduce encoder work while retaining 1080p.
- **Experimental** — forces video re-encoding at 1280x720, 25 fps, ~1.0 Mb/s, GOP 2.0 s. Intended to measure the effect of substantially reducing pixel workload.

AAC 48 kHz stereo audio is copied when already compatible; otherwise it is transcoded to the validated 128 kb/s AAC profile.

The **Compatible** profile is physically validated. Fast and Experimental require physical-player validation before they should be treated as production-safe defaults.


## UI layout update (v2.3.1)
The mobile interface is interaction-first. Source selection, target slot, encoding preset, Convert, progress, and result/save actions appear before any explanatory material. Device compatibility, encoding profile details, technical logs, and build/about information are placed after the workflow in collapsed `<details>` panels. This keeps the normal iPhone workflow short while retaining diagnostics when needed.
