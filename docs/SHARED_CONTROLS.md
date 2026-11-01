# Shared controls 1.0.0

Local copies: `shared-controls.css` and `shared-icons.svg`. Canonical source: sibling `pwa/shared/controls/`. App-owned screen adapters remain in the existing stylesheet. Controls preserve existing actions and app colors; print geometry and domain controls are excluded. No data migration.

Use the central `scripts/sync-controls.py --check govio` to detect upstream drift. Synchronizing assets does not update app release markers or authorize deployment.

The bundled `shared-chevron.svg` is the selector arrow, loaded locally to respect strict CSPs without data URLs.
