# DreamHost deployment — VIO Converter

Current profile URL: https://vio.basecentral.link. Keep the Git checkout outside the public webroot; the former in-webroot clone and server vendor-installer procedure is superseded. DreamHost serves PHP only; no user videos are uploaded or transcoded there.

## Publish

Commit and push the prepared app files, including both pinned vendor bundles, from development. On the hosting account, in the dedicated clean checkout:

```bash
git pull --ff-only
bash scripts/deploy.sh --dry-run
bash scripts/deploy.sh --verify
```

Default destination: `$HOME/vio.basecentral.link`. To use another existing public directory, pass its absolute path to both commands or set DEPLOY_SITE. The normal deploy fetches/pulls, enforces a clean tracked checkout and publishes only the profile allowlist. It does not build/download dependencies, reset/clean/stash, push, or prune unrelated public files.

## Media library and headers

Mediabunny 1.56.2 files are part of Git and deploy with the app. Do not run tools/fetch_mediabunny.php in the server checkout as a deployment step: untracked or modified vendor files make deployment fail. The fetch script is for reviewed development preparation only; --check is a read-only checksum check.

A missing .htaccess is initialized from the reviewed root template. Existing host headers are preserved. **If your webroot already has .htaccess, review it and add the following inside its mod_mime block if absent:**

```apache
AddType application/javascript .cjs
```

The original header file did not declare .cjs, so a preserved older copy may still need this correction. Do not replace unrelated custom host settings.

After deployment:

```bash
curl --fail https://vio.basecentral.link/health.php
curl --head https://vio.basecentral.link/vendor/mediabunny/mediabunny.min.cjs
```

Expect mediabunny_vendor_ready=true and mediabunny_version=1.56.2. Both bundle sizes must be nonzero; main CJS Content-Type must be JavaScript, especially with nosniff. The common --verify check only establishes a successful root HTTP response. Test actual app/conversion separately.

## Cache and scope

App/config and worker markers are 3.0.3-vendor. The worker includes the bundled files and licence/notice in the offline shell. This fix preserves the existing worker activation policy and conversion rules; it is not a broader browser-compatibility or update-policy migration. No Node or Python runtime is required on the host. The old vio.trekm.com coordinates and 3.0.0 instructions are historical.
