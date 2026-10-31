# Google Workspace OAuth for OpenClaw

Self-contained installer for the local `google-workspace-oauth` plugin.

- Plugin version: `0.1.0`
- OpenClaw versions: no installer allowlist; every host is accepted and must pass build, tests and runtime inspection
- Canonical deployment path: `/opt/openclaw`
- Embedded payload SHA-256: `a1490a79127c5d3387db0b1330e2409b965ed577d50468311bbf1051322fa1e2`

## Customer installation

The installer supports direct `curl | bash`. Use a URL pinned to a Git commit for production:

The no-argument command expects `GOOGLE_WORKSPACE_OAUTH_CLIENT_JSON` to already exist in the local OpenClaw secret store.

```bash
curl -fsSL https://raw.githubusercontent.com/OWNER/REPOSITORY/COMMIT_SHA/install.sh | \
  bash -s --
```

Using `main` also works, but allows the downloaded code to change without notice:

```bash
curl -fsSL https://raw.githubusercontent.com/OWNER/REPOSITORY/main/install.sh | \
  bash -s --
```

If the OAuth secret was already stored:

```bash
curl -fsSL https://raw.githubusercontent.com/OWNER/REPOSITORY/COMMIT_SHA/install.sh | \
  bash -s -- --secret-already-stored
```

If the customer uploaded a Google Desktop OAuth JSON file:

```bash
curl -fsSL https://raw.githubusercontent.com/OWNER/REPOSITORY/COMMIT_SHA/install.sh | \
  bash -s -- \
    --oauth-json /root/openclaw-google-client-secret.json \
    --delete-oauth-json
```

The final Google consent step remains interactive:

```bash
openclaw models auth login \
  --agent main \
  --provider google-workspace \
  --method oauth
```

Open the displayed Google URL in a local browser and paste the localhost callback into the same terminal. Never send the callback through chat.

## Verify the installer without changing OpenClaw

```bash
bash install.sh --verify-only
```

## Maintainer workflow

After editing plugin source, regenerate the self-contained installer:

```bash
python3 scripts/build-installer.py
bash -n install.sh
bash install.sh --verify-only
```

Commit the regenerated `install.sh`, create a version tag, and give customers a raw GitHub URL pinned to the resulting commit SHA.

## Security

This repository must never contain OAuth client JSON, access/refresh tokens, callback URLs, `.env`, SQLite databases, VPS credentials, SSH keys, or customer backups. The installer does not run Doctor, reset sessions, modify Codex/Zalo, or patch OpenClaw core.
