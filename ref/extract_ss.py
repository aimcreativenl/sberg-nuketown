import re, base64, pathlib, json, urllib.request

# Prefer live capture via evaluating isn't available; parse last MCP dump if present
session = pathlib.Path(
    r"C:\Users\Gebruiker\.grok\sessions\c%3A%5CUsers%5CGebruiker%5CDocuments%5CPastel%20Town%203\019fc6a9-3d41-7600-b78e-9422c8550a06\mcp"
)
candidates = sorted(session.glob("call-*.txt"), key=lambda p: p.stat().st_mtime, reverse=True)
found = None
for p in candidates[:20]:
    text = p.read_text(encoding="utf-8", errors="ignore")
    m = re.search(r"data:image/png;base64,([A-Za-z0-9+/=]{500,})", text)
    if m:
        found = m.group(1)
        print("from", p.name, "b64len", len(found))
        break

if not found:
    raise SystemExit("no data url found")

out = pathlib.Path(r"c:\Users\Gebruiker\Documents\Pastel Town 3\ref\gun_verify.png")
out.write_bytes(base64.b64decode(found))
print("wrote", out, out.stat().st_size)
