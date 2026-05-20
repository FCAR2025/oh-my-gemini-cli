# Obsidian Second-Brain — Agent Usage Guide

**Vault location**: `/home/info/Obsidian-FCAR/`  
**MCP server name**: `obsidian-vault`  
**Backend**: `@modelcontextprotocol/server-filesystem` (filesystem-only, no Obsidian app needed)  
**Date created**: 2026-05-20

---

## Why This Exists

Joy is a headless server VM — the Obsidian desktop app and its Local REST API plugin
cannot run headlessly without Xvfb/Electron gymnastics. The filesystem MCP gives agents
read/write/search access to the vault directory without any running app process. The
trade-off is no Obsidian-native features (backlink graph, block references via API);
those require the upgrade path below.

---

## Vault Layout

```
/home/info/Obsidian-FCAR/
  Daily/       — Daily session notes, one file per day
  Decisions/   — Strategic and architectural decision records
  Memory/      — Persistent memory snapshots, entity profiles
  Topics/      — Research notes on recurring FCAR domains
  README.md    — Vault purpose + upgrade path
```

---

## Writing a Daily Note (from an agent)

Use the MCP `write_file` tool targeting `Daily/YYYY-MM-DD.md`:

```
Tool: write_file
Path: /home/info/Obsidian-FCAR/Daily/2026-05-20.md
Content:
# 2026-05-20

## Session Summary
- Wired Obsidian filesystem MCP into Claude Code + OMG
- Vault skeleton created at /home/info/Obsidian-FCAR/

## Decisions
- Chose filesystem MCP over Local REST API for headless server compatibility

## Open Items
- [ ] Sync with Adrian vault via sshfs
```

Agents should append to an existing daily note rather than overwrite. Use `read_file`
first, then `write_file` with the full updated content.

---

## Searching the Vault

Use the MCP `search_files` tool to find notes by filename pattern:

```
Tool: search_files
Path: /home/info/Obsidian-FCAR
Pattern: *.md
```

For content search, use `search_file_content` (if exposed by the server) or fall back
to the `grep-mcp` MCP server which covers the same vault path.

---

## Writing a Decision Record

Save to `Decisions/<slug>.md`:

```
Tool: write_file
Path: /home/info/Obsidian-FCAR/Decisions/filesystem-mcp-over-rest-api.md
Content:
# Decision: filesystem MCP over Local REST API

**Date**: 2026-05-20  
**Status**: Accepted

## Context
Joy is a headless GCP VM. Obsidian-the-app requires a display.

## Decision
Use @modelcontextprotocol/server-filesystem scoped to the vault dir.

## Consequences
No Obsidian backlink graph or REST API features until upgrade path lands.
```

---

## Upgrade Path — Local REST API + Obsidian App

When ready to move to full Obsidian integration:

1. **Mount Adrian's vault** via sshfs or Syncthing so both machines share the same vault.
2. **Install the plugin** — place release assets from
   `https://github.com/coddingtonbear/obsidian-local-rest-api/releases/latest`
   into `<vault>/.obsidian/plugins/obsidian-local-rest-api/`.
3. **Pre-seed API key** in `<vault>/.obsidian/plugins/obsidian-local-rest-api/data.json`
   with a key generated via `openssl rand -hex 32`.
4. **Run Obsidian under Xvfb** (or use Adrian's local app pointing at the sshfs vault).
5. **Replace** the `obsidian-vault` MCP entry in `gemini-extension.json` and `~/.claude.json`
   with the `cyanheads/obsidian-mcp-server` entry, passing `OBSIDIAN_API_KEY` via env.

Until step 4 is complete, the filesystem MCP remains the active path.

---

## MCP Server Entry (reference)

Both Claude Code (`~/.claude.json`) and OMG (`gemini-extension.json`) have this entry:

```json
"obsidian-vault": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/info/Obsidian-FCAR"]
}
```

No API key, no env vars, no running app required.
