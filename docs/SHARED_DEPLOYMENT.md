# Shared deployment 1.0.0

Run on the host from the app checkout:

```sh
bash scripts/deploy.sh --dry-run 
bash scripts/deploy.sh 
bash scripts/deploy.sh --verify 
```

The normal command fetches and fast-forwards a clean tracked Git branch before publishing the reviewed app-owned list in `scripts/deploy-profile.sh`. A failed pull, local-only commits or incomplete assets abort. Commit/push prepared files separately before host deployment. No builds run on the host. If engine/profile changes arrive during pull, review and rerun.

`--dry-run` inspects the current local inventory without fetching, writing, locks or HTTP requests. It requires a clean tracked checkout, just like publication. `--no-pull` uses the already-fetched upstream and cannot establish remote freshness. Existing unrelated files are preserved; broad stale-file deletion is removed. Assets stage together; static publication is atomic per file, not for the entire release. Worker/update metadata publishes last.

The common engine is a local copy of sibling `pwa/shared/deploy/deploy-core.sh`; no shared server installation, SSH wrapper, credentials or live toolbox dependency. App-specific release/header/backup requirements remain in the profile and deployment guide. Nothing runs migrations, provisions users, sends mail or changes private data.
