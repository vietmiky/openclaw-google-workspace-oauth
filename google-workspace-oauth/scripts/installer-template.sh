#!/usr/bin/env bash
set -Eeuo pipefail

# Google Workspace OAuth plugin installer for OpenClaw.
# No OpenClaw version allowlist: compatibility is decided by real build/test/runtime checks.

SCRIPT_VERSION="0.1.0"
PLUGIN_ID="google-workspace-oauth"
PLUGIN_VERSION="0.1.0"
OPENCLAW_HOME="${OPENCLAW_HOME:-/opt/openclaw}"
STATE_DIR="${OPENCLAW_STATE_DIR:-$OPENCLAW_HOME/.openclaw}"
CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-$STATE_DIR/openclaw.json}"
CONFIG_DIR="${OPENCLAW_CONFIG_DIR:-$OPENCLAW_HOME/config}"
PLUGIN_PARENT="$STATE_DIR/workspace/plugins"
PLUGIN_DIR="$PLUGIN_PARENT/$PLUGIN_ID"
PAYLOAD_SHA256="__PAYLOAD_SHA256__"

OAUTH_JSON=""
# Bare curl|bash installs against the standard secret already prepared on the VPS.
SECRET_ALREADY_STORED=1
DELETE_OAUTH_JSON=0
VERIFY_ONLY=0
STAGE=""

say() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Usage:
  sudo bash install.sh [options]

Options:
  --oauth-json PATH          Import a Google Desktop OAuth client JSON file.
  --secret-already-stored    Reuse GOOGLE_WORKSPACE_OAUTH_CLIENT_JSON already in the store.
  --delete-oauth-json        Delete PATH after successful secret import.
  --verify-only              Verify the embedded payload without modifying OpenClaw.
  -h, --help                 Show this help.

Examples:
  sudo bash install.sh
  sudo bash install.sh --oauth-json /root/openclaw-google-client-secret.json --delete-oauth-json
  sudo bash install.sh --secret-already-stored
USAGE
}

cleanup() {
  if [[ -n "${STAGE:-}" && -d "$STAGE" ]]; then
    rm -rf -- "$STAGE"
  fi
}
trap cleanup EXIT

extract_payload() {
  local out_dir="$1" archive="$2"
  base64 -d > "$archive" <<'__OPENCLAW_GOOGLE_WORKSPACE_PAYLOAD__'
__PAYLOAD_DATA__
__OPENCLAW_GOOGLE_WORKSPACE_PAYLOAD__
  printf '%s  %s\n' "$PAYLOAD_SHA256" "$archive" | sha256sum -c - >/dev/null \
    || die "Embedded plugin payload checksum failed."
  mkdir -p "$out_dir"
  tar -xzf "$archive" -C "$out_dir"
}

validate_oauth_json() {
  local path="$1"
  python3 - "$path" <<'PY'
import json, sys
p=sys.argv[1]
d=json.load(open(p, encoding='utf-8'))
client=d.get('installed') if isinstance(d,dict) else None
if not isinstance(client,dict):
    raise SystemExit('OAuth JSON must be a Google Desktop app document with an installed object.')
for key in ('client_id','client_secret','auth_uri','token_uri','redirect_uris'):
    if not client.get(key):
        raise SystemExit('OAuth JSON is missing required field: installed.'+key)
print('OAuth JSON schema: OK')
PY
}

while (($#)); do
  case "$1" in
    --oauth-json) [[ $# -ge 2 ]] || die "--oauth-json requires a path"; OAUTH_JSON="$2"; shift 2 ;;
    --secret-already-stored) SECRET_ALREADY_STORED=1; shift ;;
    --delete-oauth-json) DELETE_OAUTH_JSON=1; shift ;;
    --verify-only) VERIFY_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

for cmd in base64 sha256sum tar python3; do
  command -v "$cmd" >/dev/null 2>&1 || die "Required command not found: $cmd"
done

STAGE="$(mktemp -d /tmp/google-workspace-oauth.XXXXXX)"
ARCHIVE="$STAGE/plugin.tar.gz"
SOURCE="$STAGE/source"
extract_payload "$SOURCE" "$ARCHIVE"

if ((VERIFY_ONLY)); then
  python3 - "$SOURCE" <<'PY'
import json, pathlib, sys
root=pathlib.Path(sys.argv[1])
manifest=json.load(open(root/'openclaw.plugin.json', encoding='utf-8'))
package=json.load(open(root/'package.json', encoding='utf-8'))
assert manifest['id']=='google-workspace-oauth'
assert package['version']=='0.1.0'
assert (root/'dist/index.js').is_file()
assert (root/'src/index.ts').is_file()
print('Embedded payload: OK')
print('Plugin: google-workspace-oauth 0.1.0')
PY
  say "SHA-256: $PAYLOAD_SHA256"
  exit 0
fi

[[ $EUID -eq 0 ]] || die "Run this installer as root (sudo bash ...)."
for cmd in npm node curl systemctl; do
  command -v "$cmd" >/dev/null 2>&1 || die "Required command not found: $cmd"
done
OPENCLAW_BIN="$(command -v openclaw || true)"
[[ -n "$OPENCLAW_BIN" ]] || die "openclaw command not found."
[[ -f "$CONFIG_PATH" ]] || die "OpenClaw config not found: $CONFIG_PATH"

VERSION_OUTPUT="$($OPENCLAW_BIN --version 2>&1)"
if [[ "$VERSION_OUTPUT" =~ OpenClaw[[:space:]]+([0-9]+\.[0-9]+\.[0-9]+) ]]; then
  CORE_VERSION="${BASH_REMATCH[1]}"
else
  die "Could not determine the OpenClaw version."
fi
export HOME="$OPENCLAW_HOME"
export OPENCLAW_STATE_DIR="$STATE_DIR"
export OPENCLAW_CONFIG_PATH="$CONFIG_PATH"
export OPENCLAW_CONFIG_DIR="$CONFIG_DIR"
export OPENCLAW_VERSION="$CORE_VERSION"

say "OpenClaw: $CORE_VERSION"
say "Preparing plugin $PLUGIN_ID $PLUGIN_VERSION..."
cd "$SOURCE"
npm ci --no-audit --no-fund
npm run build
npm test

python3 - "$SOURCE" <<'PY'
import json, pathlib, sys
root=pathlib.Path(sys.argv[1])
m=json.load(open(root/'openclaw.plugin.json', encoding='utf-8'))
p=json.load(open(root/'package.json', encoding='utf-8'))
assert m.get('id')=='google-workspace-oauth'
assert p.get('version')=='0.1.0'
assert (root/'dist/index.js').is_file()
print('Plugin build manifest: OK')
PY

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="$OPENCLAW_HOME/backups/google-workspace-plugin-$TS"
mkdir -p "$BACKUP" "$PLUGIN_PARENT"
cp -a "$CONFIG_PATH" "$BACKUP/openclaw.json.before"
if [[ -f "$OPENCLAW_HOME/.env" ]]; then
  cp -a "$OPENCLAW_HOME/.env" "$BACKUP/env.before"
  python3 - "$OPENCLAW_HOME/.env" "$CORE_VERSION" <<'PY'
from pathlib import Path
import re, sys
path=Path(sys.argv[1])
text=path.read_text(encoding='utf-8')
updated=re.sub(r'(?m)^([ \t]*OPENCLAW_VERSION[ \t]*=[ \t]*)latest([ \t]*)$', rf'\g<1>{sys.argv[2]}\g<2>', text)
if updated != text:
    path.write_text(updated, encoding='utf-8')
    print('Pinned OPENCLAW_VERSION to the detected installed version.')
PY
fi
if [[ -e "$PLUGIN_DIR" ]]; then
  mv "$PLUGIN_DIR" "$BACKUP/plugin.before"
fi
mv "$SOURCE" "$PLUGIN_DIR"
STAGE=""

"$OPENCLAW_BIN" plugins install \
  --link \
  --force \
  --accept-capabilities \
  --acknowledge-install-policy-warning \
  "$PLUGIN_DIR"

CONFIGURE_SECRET=0
if [[ -n "$OAUTH_JSON" ]]; then
  [[ -f "$OAUTH_JSON" ]] || die "OAuth JSON file not found: $OAUTH_JSON"
  validate_oauth_json "$OAUTH_JSON"
  "$OPENCLAW_BIN" secrets store set GOOGLE_WORKSPACE_OAUTH_CLIENT_JSON \
    --kind secret \
    --value-file "$OAUTH_JSON"
  CONFIGURE_SECRET=1
elif ((SECRET_ALREADY_STORED)); then
  CONFIGURE_SECRET=1
fi

if ((CONFIGURE_SECRET)); then
  CONFIG_KEY="plugins.entries.google-workspace-oauth.config.oauthClientJson"
  "$OPENCLAW_BIN" config set "$CONFIG_KEY" \
    --ref-provider default \
    --ref-source store \
    --ref-id GOOGLE_WORKSPACE_OAUTH_CLIENT_JSON \
    --dry-run
  "$OPENCLAW_BIN" config set "$CONFIG_KEY" \
    --ref-provider default \
    --ref-source store \
    --ref-id GOOGLE_WORKSPACE_OAUTH_CLIENT_JSON

  AUDIT_OUTPUT="$($OPENCLAW_BIN secrets audit 2>&1 || true)"
  [[ "$AUDIT_OUTPUT" == *"unresolved=0"* ]] \
    || die "SecretRef is unresolved. Import a valid OAuth JSON and rerun with --secret-already-stored."

  "$OPENCLAW_BIN" secrets reload
  "$OPENCLAW_BIN" plugins enable "$PLUGIN_ID" --accept-capabilities
  "$OPENCLAW_BIN" plugins reload "$PLUGIN_ID" --wait --accept-capabilities --json

  INSPECT_FILE="$(mktemp /tmp/google-workspace-inspect.XXXXXX.json)"
  "$OPENCLAW_BIN" plugins inspect "$PLUGIN_ID" --runtime --json > "$INSPECT_FILE"
  python3 - "$INSPECT_FILE" <<'PY'
import json, sys
p=json.load(open(sys.argv[1], encoding='utf-8'))['plugin']
assert p['enabled'] is True
assert p['activated'] is True
assert p['status']=='loaded'
assert 'google_workspace' in p.get('toolNames',[])
assert 'google-workspace' in p.get('providerIds',[])
print('Plugin runtime: loaded')
PY
  rm -f -- "$INSPECT_FILE"

  if ((DELETE_OAUTH_JSON)) && [[ -n "$OAUTH_JSON" ]]; then
    rm -f -- "$OAUTH_JSON"
    say "Deleted temporary OAuth JSON: $OAUTH_JSON"
  fi

  if systemctl is-active --quiet openclaw; then say "Gateway service: active"; fi
  READY="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:18789/readyz || true)"
  say "Gateway readiness HTTP: ${READY:-unreachable}"
  say ""
  say "Plugin installation and SecretRef configuration completed."
  say "Final interactive step:"
  say "  openclaw models auth login --agent main --provider google-workspace --method oauth"
  say "Open the Google URL locally and paste the localhost callback into the same terminal."
else
  say ""
  say "Plugin installed but left disabled because no OAuth secret was supplied."
  say "Run the same installer again with one of:"
  say "  --oauth-json /root/openclaw-google-client-secret.json --delete-oauth-json"
  say "  --secret-already-stored"
fi

say "Backup: $BACKUP"
exit 0
