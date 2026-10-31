#!/usr/bin/env python3
"""Regenerate install.sh with an embedded, deterministic plugin payload."""
from pathlib import Path
import base64, gzip, hashlib, io, os, re, tarfile

root = Path(__file__).resolve().parents[1]
template_path = root / "scripts" / "installer-template.sh"
exclude = {"README.md", "install.sh", ".gitignore"}
files = []
for path in sorted(root.rglob("*")):
    rel = path.relative_to(root).as_posix()
    parts = rel.split("/")
    if "node_modules" in parts or ".git" in parts:
        continue
    if path.is_file() and rel not in exclude and not rel.startswith("scripts/"):
        files.append((path, rel))

tar_buf = io.BytesIO()
with tarfile.open(fileobj=tar_buf, mode="w") as tf:
    for path, rel in files:
        info = tf.gettarinfo(str(path), arcname=rel)
        info.uid = info.gid = info.mtime = 0
        info.uname = info.gname = "root"
        with path.open("rb") as handle:
            tf.addfile(info, handle)
payload = gzip.compress(tar_buf.getvalue(), compresslevel=9, mtime=0)
sha = hashlib.sha256(payload).hexdigest()
encoded = base64.b64encode(payload).decode("ascii")
lines = "\n".join(encoded[i:i+76] for i in range(0, len(encoded), 76))
template = template_path.read_text(encoding="utf-8")
template = template.replace("__PAYLOAD_SHA256__", sha)
template = template.replace("__PAYLOAD_DATA__", lines)
out = root / "install.sh"
out.write_text(template, encoding="utf-8")
os.chmod(out, 0o755)
readme = root / "README.md"
if readme.exists():
    text = readme.read_text(encoding="utf-8")
    text = re.sub(
        r"(?m)^- Embedded payload SHA-256: `[^`]+`$",
        f"- Embedded payload SHA-256: `{sha}`",
        text,
    )
    readme.write_text(text, encoding="utf-8")
print(f"Wrote {out} (payload sha256={sha})")
