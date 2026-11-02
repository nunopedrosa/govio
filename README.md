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

Keep the Govio Git checkout outside the public web directory. The shared deployment profile targets `https://vio.basecentral.link` and defaults to `$HOME/vio.basecentral.link` (override with `DEPLOY_SITE` or an absolute destination argument). The old `vio.trekm.com` hosting name is historical.

The pinned Mediabunny 1.56.2 browser bundles, licence and notice are now **committed application assets**, not files installed on the host after deployment. Normal deployment needs no vendor download or build. From the server checkout:

```bash
git pull --ff-only
bash scripts/deploy.sh --dry-run
bash scripts/deploy.sh --verify
```

The checkout must be clean and track its upstream. Deploy fetches/pulls normally, checks that every published asset is tracked, stages the reviewed public inventory and preserves unrelated host files. If the engine/profile changes during pull, review and rerun. Commit/push prepared changes on the development machine before deploying.

The deployment regression came from listing the two libraries as required public files while only `vendor/mediabunny/README.txt` existed in Git. Running the former host installer would create untracked files and still violate the shared deployment contract. The fix vendors the exact pinned release files in Git; it does not bypass clean-checkout or tracked-file checks.

When the host has no `.htaccess`, deployment installs the reviewed root template. **An existing `.htaccess` is preserved.** Review it and ensure its `mod_mime` block contains:

```apache
AddType application/javascript .cjs
```

This is required for the main bundle when `nosniff` is enabled. Check both the root and media-library headers after deployment:

```bash
curl --fail https://vio.basecentral.link/health.php
curl --head https://vio.basecentral.link/vendor/mediabunny/mediabunny.min.cjs
```

`mediabunny_vendor_ready` should be `true`, version should be `1.56.2`, and the `.cjs` response should have a JavaScript Content-Type. `--verify` performs the common HTTP check; it does not itself prove conversion or this MIME configuration. See [DREAMHOST.md](DREAMHOST.md).

## Local development

PHP's built-in server is sufficient:

```bash
php -S 127.0.0.1:8080
```

Open:

```text
http://127.0.0.1:8080/
```

The self-hosted Mediabunny bundles are included in the repository. Validate them with `php tools/fetch_mediabunny.php --check` before local testing.

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

## Shared deployment command (2026-11-01)

See [the current deployment contract](docs/SHARED_DEPLOYMENT.md) and `scripts/deploy-profile.sh`. This supersedes older script flags, SSH-only wrappers and broad deletion instructions below/above; hosting coordinates and app-specific private/release requirements still apply. No deployment is authorized by source changes.

## Vendor maintenance and verification

`tools/mediabunny-lock.json` records the configured version, exact byte lengths and SHA-256 digests from the official release metadata. Both bundles are unmodified. MPL-2.0 text and source/attribution notice are published beside them.

Development-only refresh:

```bash
php tools/fetch_mediabunny.php --check
# Only to restore/refresh reviewed pinned assets in the development checkout:
php tools/fetch_mediabunny.php
php tools/fetch_mediabunny.php --check
python3 scripts/test-vendor.py
```

`--check` is read-only and makes no network requests. Refresh skips valid files; downloads are bounded by the pinned size, checked for SHA-256 and staged before installation. Configured/locked versions must agree. Review and commit the bundles, lock, notices and linked version/cache markers before pushing. Never repair a production checkout by adding untracked downloaded dependencies.

`test-vendor.py` uses temporary local Git repositories and mocked PHP HTTPS streams. It covers complete clean-checkout publication, read-only dry-run, missing/corrupt files, preserved host headers/unrelated files, bounded integrity checking, unsuccessful-download preservation/cleanup and successful refresh. It never contacts production or external services. Full device conversion/player verification remains separate from deployment checks.
