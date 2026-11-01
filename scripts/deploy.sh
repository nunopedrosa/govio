#!/bin/sh
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"
# Run on the host. Local shared engine; this wrapper never deploys another app.
set -euo pipefail
DEPLOY_CHECKOUT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
source "$DEPLOY_CHECKOUT/scripts/deploy-profile.sh"
source "$DEPLOY_CHECKOUT/scripts/deploy-core.sh"
deploy_main "$@"
