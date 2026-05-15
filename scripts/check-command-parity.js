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
 *   - "omg": "<name>"      → must exist as commands/omg/<name>.toml
 *   - "omg": null          → intentional non-port (omg has no analog yet)
 *   - "omg": "alias:<x>"   → existing /omg:<x> covers this peer
 *   - "omg": "skip:<reason>" → permanently not-applicable to OmG runtime
 *
 * Exit codes:
 *   0  → all entries resolve
 *   1  → drift detected (missing TOML, broken alias, etc.)
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

function main() {
  const entries = loadMatrix();
  const issues = [];
  let ported = 0;
  let aliased = 0;
  let skipped = 0;
  let missing = 0;

  for (const entry of entries) {
    const peer = entry.peer || "(unknown)";
    const omg = entry.omg ?? null;
    if (omg === null) {
      missing += 1;
      issues.push({ peer, kind: "MISSING", omg: "(none)" });
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
        aliased += 1;
      }
      continue;
    }
    if (omg.startsWith("skip:")) {
      skipped += 1;
      continue;
    }
    if (!commandExists(omg)) {
      issues.push({ peer, kind: "BROKEN-PORT", omg });
      continue;
    }
    ported += 1;
  }

  const failing = issues.filter((i) => i.kind !== "MISSING");
  console.log(
    `parity matrix: entries=${entries.length} ported=${ported} aliased=${aliased} ` +
      `skipped=${skipped} missing=${missing} broken=${failing.length}`,
  );

  if (issues.length > 0) {
    console.log();
    console.log("issues:");
    for (const i of issues) {
      console.log(`  [${i.kind}] peer=${i.peer} omg=${i.omg}`);
    }
  }

  if (failing.length > 0) {
    console.error("\nFAIL: parity drift detected (broken alias/port).");
    process.exit(1);
  }
  if (missing > 0) {
    console.log("\nNOTE: 'MISSING' entries are intentional gaps; nothing to gate on.");
  }
  console.log("\nAll parity gates pass.");
}

main();
