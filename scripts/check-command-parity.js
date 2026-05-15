#!/usr/bin/env node
/**
 * check-command-parity.js
 *
 * OmG ↔ omc/omx parity gate.
 *
 * Reads the curated peer matrix at scripts/data/command-parity.json and
 * verifies every entry's `omg` slot resolves to a real TOML under
 * commands/omg/. Fails CI on accidental drift.
 *
 * Curated entries can mark themselves:
 *   - "omg": "<name>"             → must exist as commands/omg/<name>.toml
 *   - "omg": "alias:<x>"          → existing /omg:<x> covers this peer
 *   - "omg": "agent:<name>"       → covered by an agent prompt at agents/<name>.md
 *   - "omg": "submode:<parent>"   → covered as a sub-mode of /omg:<parent>
 *   - "omg": "skip:<reason>"      → permanently not-applicable to OmG runtime
 *   - "omg": "defer:<reason>"     → known gap with explicit reason; not blocking
 *   - "omg": "needs-runtime:<x>"  → would require a runtime surface OmG does not ship
 *   - "omg": null                 → unclassified gap (forbidden; replace with one of the above)
 *
 * Exit codes:
 *   0  → all entries resolve (broken=0)
 *   1  → drift detected (broken alias/port/agent/submode, or unclassified null)
 *   2  → matrix file missing or malformed
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");
const MATRIX_PATH = join(__dirname, "data", "command-parity.json");
const COMMANDS_DIR = join(REPO_ROOT, "commands", "omg");
const AGENTS_DIR = join(REPO_ROOT, "agents");

function loadMatrix() {
  if (!existsSync(MATRIX_PATH)) {
    console.error(`parity matrix missing: ${MATRIX_PATH}`);
    process.exit(2);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(MATRIX_PATH, "utf8"));
  } catch (err) {
    console.error(`parity matrix not valid JSON: ${err.message}`);
    process.exit(2);
  }
  if (!Array.isArray(parsed?.entries)) {
    console.error("parity matrix must have an 'entries' array");
    process.exit(2);
  }
  return parsed.entries;
}

function commandExists(name) {
  return existsSync(join(COMMANDS_DIR, `${name}.toml`));
}

function agentExists(name) {
  // Agent prompts live at agents/<name>.md (with or without an `omg-` prefix).
  return existsSync(join(AGENTS_DIR, `${name}.md`));
}

function main() {
  const entries = loadMatrix();
  const issues = [];
  const buckets = {
    ported: 0,
    aliased: 0,
    "agent-covered": 0,
    "submode-covered": 0,
    skipped: 0,
    deferred: 0,
    "needs-runtime": 0,
  };

  for (const entry of entries) {
    const peer = entry.peer || "(unknown)";
    const omg = entry.omg;

    if (omg === null || omg === undefined) {
      issues.push({ peer, kind: "UNCLASSIFIED-NULL", omg: "(none)" });
      continue;
    }
    if (typeof omg !== "string") {
      issues.push({ peer, kind: "BAD-TYPE", omg: String(omg) });
      continue;
    }
    if (omg.startsWith("alias:")) {
      const target = omg.slice("alias:".length);
      if (!commandExists(target)) {
        issues.push({ peer, kind: "BROKEN-ALIAS", omg });
      } else {
        buckets.aliased += 1;
      }
      continue;
    }
    if (omg.startsWith("agent:")) {
      const target = omg.slice("agent:".length);
      if (!agentExists(target)) {
        issues.push({ peer, kind: "BROKEN-AGENT", omg });
      } else {
        buckets["agent-covered"] += 1;
      }
      continue;
    }
    if (omg.startsWith("submode:")) {
      const parent = omg.slice("submode:".length);
      if (!commandExists(parent)) {
        issues.push({ peer, kind: "BROKEN-SUBMODE", omg });
      } else {
        buckets["submode-covered"] += 1;
      }
      continue;
    }
    if (omg.startsWith("skip:")) {
      buckets.skipped += 1;
      continue;
    }
    if (omg.startsWith("defer:")) {
      buckets.deferred += 1;
      continue;
    }
    if (omg.startsWith("needs-runtime:")) {
      buckets["needs-runtime"] += 1;
      continue;
    }
    // Bare command name: must resolve to commands/omg/<name>.toml
    if (!commandExists(omg)) {
      issues.push({ peer, kind: "BROKEN-PORT", omg });
      continue;
    }
    buckets.ported += 1;
  }

  const failing = issues.length;
  const summary = Object.entries(buckets)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.log(`parity matrix: entries=${entries.length} ${summary} broken=${failing}`);

  if (failing > 0) {
    console.log();
    console.log("issues:");
    for (const i of issues) {
      console.log(`  [${i.kind}] peer=${i.peer} omg=${i.omg}`);
    }
    console.error(
      "\nFAIL: parity drift detected (broken/unclassified entry). " +
        "Replace null with one of: <name> | alias:<x> | agent:<name> | submode:<parent> | " +
        "skip:<reason> | defer:<reason> | needs-runtime:<reason>.",
    );
    process.exit(1);
  }
  console.log("\nAll parity gates pass.");
}

main();
