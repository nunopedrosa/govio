Self-hosted, committed Mediabunny 1.56.2 browser bundles.

Normal deployment copies these tracked assets; no host installer or runtime CDN.
Private checksum/version lock: tools/mediabunny-lock.json in the source checkout.
Development check: php tools/fetch_mediabunny.php --check (read-only, no network).
Development refresh: php tools/fetch_mediabunny.php; review and commit before push.

Source and attribution: NOTICE.txt. License: LICENSE-MPL-2.0.txt.
Do not omit the two bundles from Git: shared deploy requires every public file tracked.
