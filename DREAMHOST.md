# DreamHost deployment — VIO Converter v2

## Requirements

- Ordinary DreamHost PHP hosting.
- HTTPS enabled for the domain/subdomain.
- SSH access is useful for the one-time vendor download.
- No Python, Node.js, FFmpeg binary, database, cron job or server-side video processing is required.

## Deploy

1. Upload all project files.
2. SSH to the site directory.
3. Run:

```bash
php tools/fetch_mediabunny.php
```

4. Verify:

```text
https://your-domain/health.php
```

Expected important field:

```json
"mediabunny_vendor_ready": true
```

5. Open the main site in Safari/Chrome.
6. On iPhone, optionally use **Add to Home Screen** after the first successful online load.
7. Reload once after the service worker is installed; the app and local vendor JS are then available offline.

## Runtime architecture

PHP only renders configuration and static application HTML. Conversion runs locally:

```text
video file
  -> Mediabunny demuxer
  -> browser WebCodecs decode
  -> browser WebCodecs AVC/AAC encode
  -> Mediabunny MP4 muxer
  -> XOR 0xA7 in JavaScript
  -> NNN.vio
```

The source video is never POSTed to DreamHost.

## Updating Mediabunny

The pinned version lives in `config.php`. When deliberately updating it:

1. change `mediabunny.version`;
2. delete the two files under `vendor/mediabunny/`;
3. run `php tools/fetch_mediabunny.php`;
4. increment `app_version` so clients receive a new service-worker/app cache;
5. retest on the physical device.

Do not silently float to `latest`; the target file format is unusual and regression testing matters.

## v2.2 deployment note

v2.2 changes the application and Service Worker cache identifiers. After `git pull`, Mobile Safari should receive the new build automatically, but during testing it is still useful to fully close/reopen the Home Screen app or Safari tab if an old UI persists.

No new server dependency is introduced by the fast path. The existing self-hosted Mediabunny files remain sufficient.

## v2.3 deployment note

v2.3 changes only application/configuration files. Existing self-hosted Mediabunny assets can be retained. After `git pull` or uploading the new build, reload Safari so Service Worker cache `vio-converter-v8-encoder-presets` replaces the older cache.

## v2.4 deployment note

v2.4 changes the Service Worker cache name. After `git pull`, reload the site on iPhone. If Safari continues to show an older UI, close/reopen the PWA or clear the site's cached website data during development.

No new server-side dependency is required; the existing self-hosted Mediabunny 1.56.2 assets are reused.


## v2.4.1 composable conversion fix

Tests B/C previously passed `tags: {}` to a Mediabunny conversion configured with `composable: true`. Mediabunny disallows conversion-level metadata in composable mode because the caller owns the output lifecycle. v2.4.1 removes that illegal option; output metadata is intentionally left unset for these experimental paths.
