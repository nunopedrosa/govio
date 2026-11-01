#!/usr/bin/env bash
# BaseCentral deploy 1.0.0. Sourced by a local app wrapper; Bash 3+ and standard host tools.
deploy_fail(){ printf 'Deployment stopped: %s\n' "$*" >&2; exit 1; }
deploy_path(){
  local root=$1 rel=$2 required=$3 part rest=$2 current=$1
  case "$rel" in ''|/*|../*|*/../*|*/..|./*|*/./*|*//*|*/|*[!a-zA-Z0-9_./@+-]*) deploy_fail "Unsafe public path: $rel";; esac
  while [[ "$rest" == */* ]]; do part=${rest%%/*};rest=${rest#*/};current="$current/$part";[[ ! -L "$current" ]] || deploy_fail "Symlinked parent: $current";[[ ! -e "$current" || -d "$current" ]] || deploy_fail "Not a directory: $current";done
  current="$current/$rest";[[ ! -L "$current" ]] || deploy_fail "Symlinked asset: $current"
  [[ ! -e "$current" || -f "$current" ]] || deploy_fail "Not a regular file: $current"
  [[ "$required" != yes || -f "$current" && -r "$current" ]] || deploy_fail "Missing public file: $rel"
}
# Reject user-controlled symlink ancestors before canonicalizing. macOS system aliases
# /tmp and /var are platform roots, not an operator-supplied destination redirect.
deploy_root_path(){
 local path=$1 allow_leaf=${2:-no} current='' part rest=${1#/}
 [[ "$path" == /* ]] || deploy_fail 'Root paths must be absolute.'
 while [[ -n "$rest" ]];do
  if [[ "$rest" == */* ]];then part=${rest%%/*};rest=${rest#*/};else part=$rest;rest='';fi
  [[ -n "$part" ]] || continue
  [[ "$part" != . && "$part" != .. ]] || deploy_fail 'Root paths cannot contain dot segments.'
  current="$current/$part"
  if [[ -L "$current" ]];then
   case "$current" in /tmp|/var) [[ "$(uname -s)" == Darwin ]] || deploy_fail "Symlinked root: $current";;
    *)[[ "$allow_leaf" == yes && -z "$rest" ]] || deploy_fail "Symlinked root: $current";;esac
  fi
 done
}
deploy_sha(){ if command -v sha256sum >/dev/null;then sha256sum "$1" | cut -d ' ' -f1;else shasum -a 256 "$1" | cut -d ' ' -f1;fi; }
deploy_clean(){ [[ -z "$(git -C "$DEPLOY_CHECKOUT" status --porcelain --untracked-files=all)" ]] || deploy_fail 'Checkout must be clean; local changes or untracked files found.'; }
deploy_cleanup(){
  local status=$?;trap - EXIT
  [[ -z "${DEPLOY_STAGE:-}" ]] || rm -rf -- "$DEPLOY_STAGE"
  [[ -z "${DEPLOY_NEXT_LINK:-}" ]] || rm -f -- "$DEPLOY_NEXT_LINK"
  [[ -z "${DEPLOY_DEST_LOCK:-}" ]] || rmdir -- "$DEPLOY_DEST_LOCK" 2>/dev/null || true
  [[ -z "${DEPLOY_REPO_LOCK:-}" ]] || rmdir -- "$DEPLOY_REPO_LOCK" 2>/dev/null || true
  if [[ "$status" != 0 && "${DEPLOY_PUBLISHING:-0}" == 1 ]];then printf 'Publication incomplete; some public files may have changed. Correct the failure and rerun.\n' >&2;fi
  exit "$status"
}
deploy_main(){
  local dry=${DEPLOY_DRY_RUN:-${BALANCE_DRY_RUN:-0}} verify=0 pull=1 destination=${DEFAULT_DESTINATION:-} explicit=0 arg root target gitroot branch remote upstream ahead commit rel duplicate parent mode=${DEPLOY_MODE:-copy} profile_before core_before
  for arg in "$@";do case "$arg" in
    --help|-h) printf 'Usage: bash scripts/deploy.sh [--dry-run] [--verify] [DESTINATION]\nHost-side, clean tracked Git branch; fast-forward pull; public assets only.\n--dry-run changes nothing and does not fetch. --no-pull uses the already-fetched upstream.\n';return 0;;
    --dry-run|-n)dry=1;; --verify|-v)verify=1;; --no-pull)pull=0;;
    --no-http)verify=0;; --force|-f) :;;
    -*)deploy_fail "Unknown option: $arg";;
    *)[[ "$explicit" == 0 ]] || deploy_fail 'Only one destination is allowed.';destination=$arg;explicit=1;;esac;done
  [[ "$destination" == /* && "$destination" != / && "$destination" != "$HOME" ]] || deploy_fail 'Supply an absolute, existing public directory (or owned current link for release mode).'
  [[ "$APP_ID" != '' && "$APP_ID" != *[!a-zA-Z0-9_-]* ]] || deploy_fail 'Invalid application profile.'
  [[ "$dry" == 0 || "$dry" == 1 ]] || deploy_fail "Dry-run setting must be 0 or 1."
  deploy_root_path "$DEPLOY_CHECKOUT"
  deploy_root_path "$destination" "$([[ "$mode" == release ]] && echo yes || echo no)"
  DEPLOY_CHECKOUT=$(cd -- "$DEPLOY_CHECKOUT" && pwd -P)
  gitroot=$(git -C "$DEPLOY_CHECKOUT" rev-parse --show-toplevel) || deploy_fail 'Not a Git checkout.'
  [[ "$(cd -- "$gitroot" && pwd -P)" == "$DEPLOY_CHECKOUT" ]] || deploy_fail 'App must be at its own Git checkout root.'
  root="$DEPLOY_CHECKOUT/${SOURCE_SUBDIR:-.}";[[ -d "$root" && ! -L "$root" ]] || deploy_fail 'Invalid public source root.';root=$(cd -- "$root" && pwd -P)
  case "$root/" in "$DEPLOY_CHECKOUT/"*) :;;*)deploy_fail 'Public source escapes checkout.';;esac
  if [[ "$mode" == release ]];then
    [[ -L "$destination" && -d "$destination" ]] || deploy_fail 'Release mode requires the existing owned current symlink; bootstrap separately.'
    parent=$(cd -- "$(dirname -- "$destination")" && pwd -P);target="$parent/$(basename -- "$destination")"
    [[ -d "${RELEASE_ROOT:-}" && ! -L "$RELEASE_ROOT" ]] || deploy_fail 'Existing private release root required.'
    deploy_root_path "$RELEASE_ROOT"
    RELEASE_ROOT=$(cd -- "$RELEASE_ROOT" && pwd -P)
    DEPLOY_PREVIOUS_LINK=$(readlink "$destination")
    case "$(cd -- "$destination" && pwd -P)/" in "$RELEASE_ROOT/"*) :;;*)deploy_fail 'Current link does not point inside the owned release store.';;esac
  else
    [[ ! -L "$destination" && -d "$destination" && -w "$destination" && -x "$destination" ]] || deploy_fail 'Destination must exist, be writable and not be a symlink.'
    target=$(cd -- "$destination" && pwd -P);parent=$target
  fi
  case "$parent/" in "$DEPLOY_CHECKOUT/"*)deploy_fail 'Destination overlaps checkout.';;esac
  case "$DEPLOY_CHECKOUT/" in "$parent/"*)deploy_fail 'Checkout is inside destination.';;esac
  branch=$(git -C "$DEPLOY_CHECKOUT" symbolic-ref --quiet --short HEAD) || deploy_fail 'Detached HEAD is not deployable.'
  upstream=$(git -C "$DEPLOY_CHECKOUT" rev-parse --symbolic-full-name '@{upstream}') || deploy_fail 'Branch must track an upstream.'
  remote=$(git -C "$DEPLOY_CHECKOUT" config --get "branch.$branch.remote") || deploy_fail 'Missing upstream remote.'
  [[ "$remote" != . ]] || deploy_fail 'Upstream must be a remote repository.'
  deploy_clean
  profile_before=$(deploy_sha "$DEPLOY_CHECKOUT/scripts/deploy-profile.sh");core_before=$(deploy_sha "$DEPLOY_CHECKOUT/scripts/deploy-core.sh")
  DEPLOY_STAGE='';DEPLOY_DEST_LOCK='';DEPLOY_REPO_LOCK='';DEPLOY_NEXT_LINK='';DEPLOY_PUBLISHING=0
  if [[ "$dry" == 0 ]];then
    trap deploy_cleanup EXIT;trap 'exit 130' INT;trap 'exit 143' TERM
    local gitdir;gitdir=$(git -C "$DEPLOY_CHECKOUT" rev-parse --absolute-git-dir)
    mkdir -- "$gitdir/basecentral-deploy.lock" 2>/dev/null || deploy_fail 'Checkout deployment lock exists.';DEPLOY_REPO_LOCK="$gitdir/basecentral-deploy.lock"
    mkdir -- "$parent/.basecentral-deploy.lock" 2>/dev/null || deploy_fail 'Destination deployment lock exists.';DEPLOY_DEST_LOCK="$parent/.basecentral-deploy.lock"
    if [[ "$pull" == 1 ]];then git -C "$DEPLOY_CHECKOUT" fetch --quiet -- "$remote" || deploy_fail 'Fetch failed; nothing published.';fi
  fi
  ahead=$(git -C "$DEPLOY_CHECKOUT" rev-list --count "$upstream..HEAD");[[ "$ahead" == 0 ]] || deploy_fail 'Local-only/divergent commits are not deployable.'
  if [[ "$dry" == 0 && "$pull" == 1 ]];then git -C "$DEPLOY_CHECKOUT" pull --ff-only --quiet || deploy_fail 'Pull failed; nothing published.';fi
  deploy_clean
  [[ "$(deploy_sha "$DEPLOY_CHECKOUT/scripts/deploy-profile.sh")" == "$profile_before" && "$(deploy_sha "$DEPLOY_CHECKOUT/scripts/deploy-core.sh")" == "$core_before" ]] || deploy_fail 'Deployment code/profile changed in the pull. Review it and rerun.'
  commit=$(git -C "$DEPLOY_CHECKOUT" rev-parse HEAD)
  local -a files=() original_hashes=()
  while IFS= read -r rel || [[ -n "$rel" ]];do
    [[ -n "$rel" ]] || continue
    for duplicate in "${files[@]+"${files[@]}"}";do [[ "$rel" != "$duplicate" ]] || deploy_fail "Duplicate path: $rel";done
    deploy_path "$root" "$rel" yes
    git -C "$DEPLOY_CHECKOUT" ls-files --error-unmatch -- "${SOURCE_SUBDIR:+$SOURCE_SUBDIR/}$rel" >/dev/null 2>&1 || deploy_fail "Public file not tracked: $rel"
    if [[ "$mode" == copy ]];then deploy_path "$target" "$rel" no;fi
    files+=("$rel");original_hashes+=("$(deploy_sha "$root/$rel")")
  done <<< "$PUBLIC_FILES"
  [[ "${#files[@]}" -gt 0 ]] || deploy_fail 'Empty publication allowlist.'
  if [[ -n "${HEADER_TEMPLATE:-}" ]];then
    deploy_path "$DEPLOY_CHECKOUT" "$HEADER_TEMPLATE" yes;deploy_path "$target" .htaccess no
    git -C "$DEPLOY_CHECKOUT" ls-files --error-unmatch -- "$HEADER_TEMPLATE" >/dev/null || deploy_fail 'Header template must be tracked.'
  fi
  if declare -F deploy_validate >/dev/null;then deploy_validate "$root";fi
  printf '%s: %s public files; commit %s\nSource: %s\nDestination: %s\n' "$APP_ID" "${#files[@]}" "$commit" "$root" "$target"
  if [[ "$dry" == 1 ]];then printf 'DRY RUN: local inventory only; no fetch, writes, backup, pruning or HTTP checks.\n';printf '  %s\n' "${files[@]+"${files[@]}"}";return 0;fi
  if [[ -n "${BACKUP_ROOT:-}" ]];then
    case "$BACKUP_ROOT/" in "$target/"*|"$DEPLOY_CHECKOUT/"*)deploy_fail 'Backup directory must be private and outside checkout.';;esac
    deploy_root_path "$BACKUP_ROOT"
    [[ ! -L "$BACKUP_ROOT" ]] || deploy_fail 'Symlinked backup root.';mkdir -p -- "$BACKUP_ROOT"
    tar -czf "$BACKUP_ROOT/$APP_ID-$(date +%Y%m%d-%H%M%S)-$$.tar.gz" -C "$target" . || deploy_fail 'Required public-site backup failed.'
  fi
  umask 022
  if [[ "$mode" == release ]];then DEPLOY_STAGE=$(mktemp -d "$RELEASE_ROOT/.stage.XXXXXXXX");else DEPLOY_STAGE=$(mktemp -d "$target/.basecentral-stage.XXXXXXXX");fi
  local stage_public=$DEPLOY_STAGE
  if [[ "$mode" == release ]];then stage_public="$DEPLOY_STAGE/web";mkdir -- "$stage_public";fi
  for rel in "${files[@]+"${files[@]}"}";do mkdir -p -- "$stage_public/$(dirname -- "$rel")";cp -- "$root/$rel" "$stage_public/$rel";chmod 0644 "$stage_public/$rel";cmp -s -- "$root/$rel" "$stage_public/$rel" || deploy_fail "Staging mismatch: $rel";done
  if [[ -n "${HEADER_TEMPLATE:-}" ]];then
    cp -- "$DEPLOY_CHECKOUT/$HEADER_TEMPLATE" "$DEPLOY_STAGE/.header-template";chmod 0644 "$DEPLOY_STAGE/.header-template"
  fi
  if declare -F deploy_prepare >/dev/null;then deploy_prepare "$stage_public";fi
  [[ "$(git -C "$DEPLOY_CHECKOUT" rev-parse HEAD)" == "$commit" ]] || deploy_fail 'HEAD changed during staging.';deploy_clean
  local index=0
  for rel in "${files[@]+"${files[@]}"}";do deploy_path "$root" "$rel" yes;[[ "$(deploy_sha "$root/$rel")" == "${original_hashes[$index]}" ]] || deploy_fail "Source changed during staging: $rel";index=$((index+1));if [[ "$mode" == copy ]];then deploy_path "$target" "$rel" no;fi;done
  if declare -F deploy_validate_stage >/dev/null;then deploy_validate_stage "$stage_public";fi
  if [[ "$mode" == release ]];then
    local release="$RELEASE_ROOT/$APP_ID-$commit";[[ ! -e "$release" ]] || deploy_fail 'Release already exists; do not overwrite immutable releases.'
    chmod 0755 "$DEPLOY_STAGE"
    mv -- "$DEPLOY_STAGE" "$release";DEPLOY_STAGE=''
    DEPLOY_NEXT_LINK=$(mktemp "$parent/.basecentral-current.XXXXXXXX");rm -- "$DEPLOY_NEXT_LINK";ln -s -- "$release" "$DEPLOY_NEXT_LINK"
    [[ -L "$target" && "$(readlink "$target")" == "$DEPLOY_PREVIOUS_LINK" ]] || deploy_fail 'Current link changed before activation.'
    if [[ "$(uname -s)" == Darwin ]];then mv -fh -- "$DEPLOY_NEXT_LINK" "$target";else mv -fT -- "$DEPLOY_NEXT_LINK" "$target";fi;DEPLOY_NEXT_LINK=''
  else
    DEPLOY_PUBLISHING=1
    # Explicit worker metadata last; preserve profile ordering within each phase.
    local phase
    for phase in assets html metadata;do for rel in "${files[@]+"${files[@]}"}";do
      local kind=assets;case "$rel" in index.html|index.php)kind=html;;sw.js|service-worker.js|version.json|precache.js|release.js)kind=metadata;;esac
      [[ "$kind" == "$phase" ]] || continue
      [[ "$rel" != .htaccess || "${PRESERVE_HTACCESS:-0}" != 1 || ! -e "$target/.htaccess" ]] || continue
      deploy_path "$target" "$rel" no;mkdir -p -- "$target/$(dirname -- "$rel")"
      local expected_hash;expected_hash=$(deploy_sha "$stage_public/$rel")
      mv -f -- "$stage_public/$rel" "$target/$rel"
      [[ "$(deploy_sha "$target/$rel")" == "$expected_hash" ]] || deploy_fail "Published bytes differ: $rel"
    done;done
    if [[ -n "${HEADER_TEMPLATE:-}" && ! -e "$target/.htaccess" ]];then
      deploy_path "$target" .htaccess no
      ln -- "$DEPLOY_STAGE/.header-template" "$target/.htaccess" 2>/dev/null || printf 'Preserved concurrently created .htaccess.\n'
    fi
    DEPLOY_PUBLISHING=0
  fi
  if [[ "$verify" == 1 ]];then
    if declare -F deploy_verify >/dev/null;then deploy_verify "$target";else
      [[ -n "${DEPLOY_URL:-}" ]] || deploy_fail 'No verification URL configured.'
      curl --fail --silent --show-error --max-time 30 -I "$DEPLOY_URL/" || deploy_fail 'HTTP verification failed.'
    fi
  fi
  printf 'Commit: %s\n' "$commit"
  printf 'Published %s (%s). Unrelated files preserved; no pruning.\n' "$APP_ID" "$commit"
}
