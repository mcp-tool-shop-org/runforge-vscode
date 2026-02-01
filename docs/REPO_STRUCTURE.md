# Repository Structure

## This Is a Standalone Repo

**Canonical location:** `F:\AI\runforge-vscode`
**GitHub:** `https://github.com/mcp-tool-shop-org/runforge-vscode`

This repository is **standalone**. It is the only source of truth for the RunForge VS Code extension.

## Do NOT Develop From These Locations

| Path | Why |
|------|-----|
| `F:\AI\mcp-tool-shop\extensions\runforge-vscode` | Subfolder of monorepo. Git root is `mcp-tool-shop`, not the extension. Commits will include unrelated changes. |
| Any other nested path | Same problem — git operations will target the wrong root. |

## Before Any Git Operation

Run this check:

```bash
git rev-parse --show-toplevel
```

Expected output:
```
F:/AI/runforge-vscode
```

If you see anything else (like `F:/AI/mcp-tool-shop`), **STOP**. You're in the wrong directory.

## Publishing Checklist

1. `cd F:\AI\runforge-vscode`
2. `git remote -v` → must show `mcp-tool-shop-org/runforge-vscode`
3. `git branch --show-current` → must be `main`
4. `git rev-parse --show-toplevel` → must be `F:/AI/runforge-vscode`
5. Only then: build, test, tag, push, release

## Why This Matters

The monorepo (`mcp-tool-shop`) contains shared infrastructure, other extensions, and core libraries. If you accidentally push from that location with the wrong remote configured, you risk:

- Pushing hundreds of unrelated files to the extension repo
- Breaking the extension repo's commit history
- Mixing concerns that should be separate

Keep it simple: **one repo, one folder, one remote**.
