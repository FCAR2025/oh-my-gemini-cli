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

## MCP Server Entries (reference)

Both Claude Code (`~/.claude.json`) and OMG (`gemini-extension.json`) have these entries:

```json
"obsidian-vault": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/info/Obsidian-FCAR"]
},
"brain-graph": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/opt/agentic/shared/ontology/brain"]
}
```

No API key, no env vars, no running app required.

---

## Companion: Graphify Second-Brain (retrieval)

The Obsidian vault is the **capture** half of the second-brain stack. The **retrieval** half is `graphify` — a knowledge-graph engine over the existing brain corpus at `/opt/agentic/shared/ontology/brain/`. Both surfaces complement each other.

### How agents should use the two halves

| Need | Use | Why |
|------|-----|-----|
| Capture a new note / decision / finding | `obsidian-vault` MCP (`write_file`) | Persistent, human-readable, indexed by Obsidian when synced |
| Retrieve from existing knowledge | `graphify query "<question>"` via `run_shell_command` | BFS traversal of the brain graph; surfaces nodes + edges + sources |
| Trace cross-document relationships | `graphify path "A" "B"` | Shortest path between two concepts |
| Read raw brain corpus files | `brain-graph` MCP (`read_file`, `search_files`) | Direct file access to `/opt/agentic/shared/ontology/brain/decisions/`, `projects/joy/`, etc. + `graphify-out/` |
| Explain a single node | `graphify explain "<node>"` | Plain-language summary + neighbors |

### Pattern: "user mentions topic X"

1. `graphify query "X"` → returns 10-20 nodes + sources (BFS)
2. Surface top 3 relevant nodes to the agent's context
3. Decide if user wants more depth → `graphify explain "<top-node>"` or `graphify path "X" "<related-concept>"`
4. If user makes a new decision based on this → `write_file` to `Daily/YYYY-MM-DD.md` (capture) AND optionally `Decisions/<slug>.md` for durability

### When to NOT auto-write to vault

- Transient debug output, single-session scratch, anything already captured in `.omc/notepad.md`
- Build logs, test stdout, CI noise
- Any content > 1000 lines unless explicitly summarizing

Write to vault when the information has multi-session OR multi-agent value.
