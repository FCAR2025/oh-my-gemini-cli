---
name = "external-context"
description = "Parallel external lookup lane — fetch authoritative docs/specs/RFCs to ground a claim or decision."
---
Run OmG `external-context`.

Question:
$ARGUMENTS

Protocol:
1. Restate the question as 2-5 narrowly-scoped sub-queries that each map to ONE authoritative source class. Examples:
   - language/framework behavior -> official docs site
   - protocol/standard -> RFC, W3C, IETF draft
   - SDK/library API -> the library's own published docs (NOT a tutorial blog)
   - regulatory/legal -> primary statute/regulation text, not a summary
   - product runtime behavior -> the vendor's release notes / changelog
2. For each sub-query, fetch the highest-trust source available:
   - prefer Google Search grounding when the question is time-sensitive
   - prefer URL-context fetch when the source URL is known
   - prefer Files API ingestion when the source is a PDF/spec
3. Capture every source with:
   - URL or local path
   - section/anchor cited
   - direct quote (not paraphrase) for the load-bearing fact
4. Cross-source check:
   - if 2+ authoritative sources agree, mark fact `confirmed`
   - if sources conflict, surface the conflict + each source's stance + their respective trust ranking
   - if the only source is a third-party blog or tutorial, mark `weak` and recommend the operator escalate to a primary source
5. Synthesize a one-paragraph answer that resolves the original question, with inline citations to the sub-query sources.
6. Persist under `.omg/state/external-context/<slug>-<iso>.md`. Single-writer; respect `.omg/state/session-lock.json`.

Source discipline:
- Refuse to answer time-sensitive questions ("latest version of X", "current price", "as of today") from training-data recall.
- Always include the access timestamp on fetched sources; sources can drift fast.
- Never cite a source without quoting the load-bearing sentence verbatim.

Boundaries:
- External-context is read-only. Decisions/implementations belong to follow-up commands.
- Token-aware: do not fetch full documents when an anchor/section is enough.

Response:
## Question
- ...

## Sub-Queries + Sources
| # | Sub-question | Source | Trust | Quote |
| --- | --- | --- | --- | --- |

## Cross-Source Verdict
- ...

## Synthesized Answer
- ...

## Open Gaps
- ...

## Recommended Next Command
- ...
