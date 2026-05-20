---
name = "deepinit"
description = "Deep codebase initialization with hierarchical GEMINI.md documentation"
---

# Deep Init Skill

Creates comprehensive, hierarchical GEMINI.md documentation across the entire codebase.

> **Context file naming**: Gemini CLI uses `GEMINI.md` as the canonical context file (per `gemini-extension.json` `contextFileName`). This skill writes `GEMINI.md` files. `AGENTS.md` is recognized as a compatibility alias — if the repo already has `AGENTS.md` files from an OMC-based workflow, they will be respected; new files written by this skill use `GEMINI.md`.

## Core Concept

GEMINI.md files serve as **AI-readable documentation** that helps agents understand:
- What each directory contains
- How components relate to each other
- Special instructions for working in that area
- Dependencies and relationships

## Hierarchical Tagging System

Every GEMINI.md (except root) includes a parent reference tag:

```markdown
<!-- Parent: ../GEMINI.md -->
```

This creates a navigable hierarchy:
```
/GEMINI.md                           ← Root (no parent tag)
├── src/GEMINI.md                    ← <!-- Parent: ../GEMINI.md -->
│   ├── src/components/GEMINI.md     ← <!-- Parent: ../GEMINI.md -->
│   └── src/utils/GEMINI.md          ← <!-- Parent: ../GEMINI.md -->
└── docs/GEMINI.md                   ← <!-- Parent: ../GEMINI.md -->
```

## GEMINI.md Template

```markdown
<!-- Parent: {relative_path_to_parent}/GEMINI.md -->
<!-- Generated: {timestamp} | Updated: {timestamp} -->

# {Directory Name}

## Purpose
{One-paragraph description of what this directory contains and its role}

## Key Files
{List each significant file with a one-line description}

| File | Description |
|------|-------------|
| `file.ts` | Brief description of purpose |

## Subdirectories
{List each subdirectory with brief purpose}

| Directory | Purpose |
|-----------|---------|
| `subdir/` | What it contains (see `subdir/GEMINI.md`) |

## For AI Agents

### Working In This Directory
{Special instructions for AI agents modifying files here}

### Testing Requirements
{How to test changes in this directory}

### Common Patterns
{Code patterns or conventions used here}

## Dependencies

### Internal
{References to other parts of the codebase this depends on}

### External
{Key external packages/libraries used}

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
```

## Execution Workflow

### Step 1: Map Directory Structure

Use Gemini CLI search tools to map the repo:

```
glob("**/*", {exclude: ["node_modules", ".git", "dist", "build", "__pycache__", ".venv", "coverage", ".next", ".nuxt"]})
```

Or use `read_many_files` on directory listings for broader scans.

### Step 2: Create Work Plan

Generate task entries in `.omg/state/taskboard.md` (check `.omg/state/session-lock.json` first) for each directory, organized by depth level:

```
Level 0: / (root)
Level 1: /src, /docs, /tests
Level 2: /src/components, /src/utils, /docs/api
...
```

### Step 3: Generate Level by Level

**IMPORTANT**: Generate parent levels before child levels to ensure parent references are valid.

For each directory:
1. Read all files in the directory via `read_many_files`
2. Analyze purpose and relationships
3. Generate GEMINI.md content
4. Write file with proper parent reference via `write_file`

### Step 4: Compare and Update (if exists)

When GEMINI.md already exists:

1. **Read existing content** via `read_file`
2. **Identify sections**:
   - Auto-generated sections (can be updated)
   - Manual sections (`<!-- MANUAL -->` preserved)
3. **Compare**:
   - New files added?
   - Files removed?
   - Structure changed?
4. **Merge**:
   - Update auto-generated content
   - Preserve manual annotations
   - Update timestamp

### Step 5: Validate Hierarchy

After generation, run validation checks via `run_shell_command`:

| Check | How to Verify | Corrective Action |
|-------|--------------|-------------------|
| Parent references resolve | Read each GEMINI.md, check `<!-- Parent: -->` path exists | Fix path or remove orphan |
| No orphaned GEMINI.md | Compare GEMINI.md locations to directory structure | Delete orphaned files |
| Completeness | List all directories, check for GEMINI.md | Generate missing files |
| Timestamps current | Check `<!-- Generated: -->` dates | Regenerate outdated files |

Validation command pattern:
```bash
# Find all GEMINI.md files
find . -name "GEMINI.md" -type f

# Check parent references
grep -r "<!-- Parent:" --include="GEMINI.md" .
```

## Smart Delegation

See OmG agent registry in `agents/` and model lanes in `context/omg-core.md` for agent details.

| Task | Agent | Lane |
|------|-------|------|
| Directory mapping | Gemini CLI search tools (`glob`, `read_many_files`, `search_file_content`) | quick-lane |
| File analysis | `omg-architect` | planning-lane |
| Content generation | `omg-executor` | execution-lane |
| GEMINI.md writes | `omg-executor` | execution-lane |

## Empty Directory Handling

When encountering empty or near-empty directories:

| Condition | Action |
|-----------|--------|
| No files, no subdirectories | **Skip** - do not create GEMINI.md |
| No files, has subdirectories | Create minimal GEMINI.md with subdirectory listing only |
| Has only generated files (*.min.js, *.map) | Skip or minimal GEMINI.md |
| Has only config files | Create GEMINI.md describing configuration purpose |

Example minimal GEMINI.md for directory-only containers:
```markdown
<!-- Parent: ../GEMINI.md -->
# {Directory Name}

## Purpose
Container directory for organizing related modules.

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `subdir/` | Description (see `subdir/GEMINI.md`) |
```

## Parallelization Rules

1. **Same-level directories**: Process in parallel
2. **Different levels**: Sequential (parent first)
3. **Large directories**: Spawn dedicated `omg-executor` per directory
4. **Small directories**: Batch multiple into one `omg-executor`

## Quality Standards

### Must Include
- [ ] Accurate file descriptions
- [ ] Correct parent references
- [ ] Subdirectory links
- [ ] AI agent instructions

### Must Avoid
- [ ] Generic boilerplate
- [ ] Incorrect file names
- [ ] Broken parent references
- [ ] Missing important files

## Example Output

### Root GEMINI.md
```markdown
<!-- Generated: 2024-01-15 | Updated: 2024-01-15 -->

# my-project

## Purpose
A web application for managing user tasks with real-time collaboration features.

## Key Files
| File | Description |
|------|-------------|
| `package.json` | Project dependencies and scripts |
| `tsconfig.json` | TypeScript configuration |
| `.env.example` | Environment variable template |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `src/` | Application source code (see `src/GEMINI.md`) |
| `docs/` | Documentation (see `docs/GEMINI.md`) |
| `tests/` | Test suites (see `tests/GEMINI.md`) |

## For AI Agents

### Working In This Directory
- Always install dependencies after modifying the project manifest
- Use TypeScript strict mode
- Follow ESLint rules

### Testing Requirements
- Run tests before committing
- Ensure >80% coverage

### Common Patterns
- Use barrel exports (index.ts)
- Prefer functional components

## Dependencies

### External
- React 18.x - UI framework
- TypeScript 5.x - Type safety
- Vite - Build tool

<!-- MANUAL: Custom project notes can be added below -->
```

### Nested GEMINI.md
```markdown
<!-- Parent: ../GEMINI.md -->
<!-- Generated: 2024-01-15 | Updated: 2024-01-15 -->

# components

## Purpose
Reusable React components organized by feature and complexity.

## Key Files
| File | Description |
|------|-------------|
| `index.ts` | Barrel export for all components |
| `Button.tsx` | Primary button component |
| `Modal.tsx` | Modal dialog component |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `forms/` | Form-related components (see `forms/GEMINI.md`) |
| `layout/` | Layout components (see `layout/GEMINI.md`) |

## For AI Agents

### Working In This Directory
- Each component has its own file
- Use CSS modules for styling
- Export via index.ts

### Testing Requirements
- Unit tests in `__tests__/` subdirectory
- Use React Testing Library

### Common Patterns
- Props interfaces defined above component
- Use forwardRef for DOM-exposing components

## Dependencies

### Internal
- `src/hooks/` - Custom hooks used by components
- `src/utils/` - Utility functions

### External
- `clsx` - Conditional class names
- `lucide-react` - Icons

<!-- MANUAL: -->
```

## Triggering Update Mode

When running on an existing codebase with GEMINI.md files:

1. Detect existing files first via `glob`
2. Read and parse existing content via `read_file`
3. Analyze current directory state
4. Generate diff between existing and current
5. Apply updates while preserving manual sections via `write_file`

## Performance Considerations

- **Cache directory listings** - Don't re-scan same directories
- **Batch small directories** - Process multiple at once
- **Skip unchanged** - If directory hasn't changed, skip regeneration
- **Parallel writes** - Multiple `omg-executor` agents writing different files simultaneously
