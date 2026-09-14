# DreamHost deployment — VIO Converter v3

The application is PHP-served but performs video conversion locally in the browser. DreamHost does not transcode or receive the selected videos.

## Initial deployment

From the DreamHost SSH account, in the `vio.trekm.com` document root:

```bash
git pull origin main
php tools/fetch_mediabunny.php
```

Then verify:

```text
https://vio.trekm.com/health.php
```

Expected key fields:

```json
{
  "ok": true,
  "engine": "WebCodecs/Mediabunny",
  "mediabunny_vendor_ready": true
}
```

## Subsequent deployments

Normally:

```bash
cd ~/vio.trekm.com
git pull origin main
```

Run `php tools/fetch_mediabunny.php` again only when vendor assets are missing or the pinned Mediabunny version changes.

## Browser cache / Service Worker

v3 uses a new application and Service Worker cache version (`3.0.0-automatic`). If an iPhone appears to show the previous experimental UI, reload the page once online so the new Service Worker can activate. Closing/reopening the Home Screen web app can also help after an update.

## MIME types

The included `.htaccess` explicitly serves `.cjs` files as JavaScript. This is required because Safari can refuse to execute a `.cjs` file when `X-Content-Type-Options: nosniff` is active and the server supplies a generic binary MIME type.


### v3.0.1 visual identity
Added the orange kids-camera artwork to the page header, PWA/home-screen icons, Apple touch icon, and browser favicons. Service-worker cache bumped to ensure installed/mobile clients refresh the assets.
