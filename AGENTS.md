# AGENTS.md — Advanced Reasoning MCP

Operational guide for AI agents using the `advanced-reasoning` MCP server. This
file tells you _when_ and _how_ to call each tool. For human/dev setup, see
`README.md`.

## What this server gives you

A persistent reasoning workspace on top of sequential thinking:

- **A reasoning loop** (`advanced_reasoning`) with confidence, reasoning-quality,
  meta-cognition, hypotheses, evidence, revisions, and branches.
- **A graph memory** of your thoughts, organized into named **libraries**,
  searchable by TF-IDF relevance.
- **SystemJSON**: structured, searchable documents for reusable workflows,
  instructions, and domain knowledge.

Everything persists to `memory_data/` on disk and is reloaded on restart, so
memory survives across sessions and conversations.

## Mental model

```
library  ──contains──>  sessions + memory nodes (graph)
session  ──groups──>    a connected chain of thoughts toward one goal
node     ──links to──>  other nodes via builds_on / challenges edges
SystemJSON ──separate──> document store for workflows & reference data
```

A **node ID** looks like `node_1753683441451_a1b2c3d4`. A **session ID** looks
like `session_<ts>_<rand>`. You wire the reasoning graph by passing prior node
IDs into `builds_on` / `challenges` on later thoughts.

## The core workflow

1. **Pick or create a library** for the topic (optional but recommended for
   multi-topic work). Default library is `cognitive_memory`.
   - `create_memory_library { library_name }` then `switch_memory_library`, or
   - just keep working in the current one.
2. **Create a session** for the goal: `create_reasoning_session { goal }`.
   Keep the returned `session_id`.
3. **Reason step by step** with `advanced_reasoning`, passing `session_id` every
   call so thoughts persist. Capture the returned `nodeId` of each step.
4. **Link thoughts**: on later steps, put earlier `nodeId`s in `builds_on` (this
   step extends them) or `challenges` (this step contradicts them).
5. **Recall** earlier insight anytime with `query_reasoning_memory { query }`.
6. **Save reusable procedures/data** as SystemJSON for future sessions.

> Persistence rule: a thought is stored **only if you pass `session_id`**.
> Without it, `advanced_reasoning` still runs and returns analysis, but nothing
> is written to memory. When in doubt, pass a session_id.

## Tools

### `advanced_reasoning` — the reasoning step

Required: `thought`, `thoughtNumber`, `totalThoughts`, `nextThoughtNeeded`.

Most useful optionals:

- `session_id` — pass to persist this thought and get related-memory suggestions.
- `confidence` (0–1, default 0.5), `reasoning_quality` (`low|medium|high`,
  default `medium`), `meta_thought` (reflect on your own reasoning).
- `goal`, `progress` (0–1).
- `hypothesis`, `test_plan`, `test_result`, `evidence[]` for hypothesis testing.
- `builds_on[]` / `challenges[]` — node IDs of prior thoughts to link to.
- `isRevision` + `revisesThought`, or `branchFromThought` + `branchId` for
  revisions and alternative branches.

`totalThoughts` is a moving estimate — raise it as needed; set
`nextThoughtNeeded: false` on the final step.

Returns: `nodeId` (store it), `edges` (which links were made vs. `missing` IDs),
`relatedMemories` with their IDs (candidate `builds_on` targets), `memoryStats`,
and `consistency_note` when related thoughts exist.

### `create_reasoning_session` — start a goal-scoped chain

`{ goal, library_name? }` → returns `session_id`. Do this before a multi-step
reasoning chain so the chain is grouped and persisted.

### `query_reasoning_memory` — recall

`{ query, session_id? }`. TF-IDF search over node content in the current
library. Use before reasoning to avoid redoing work; use mid-chain to pull in
prior evidence. Returns nodes with IDs you can then `builds_on`.

### Library management

- `create_memory_library { library_name }` — names: letters/numbers/`_`/`-` only.
- `switch_memory_library { library_name }` — saves current state first.
- `list_memory_libraries` — names, node counts, last modified.
- `get_current_library_info` — active library + stats.

Search and node operations always act on the **current** library. Switch before
querying if the knowledge lives elsewhere.

### SystemJSON — structured documents

Separate from the memory graph. Use it for things you want to retrieve verbatim:
checklists, multi-step workflows, config, domain facts.

- `create_system_json { name, domain, description, data, tags? }` — `name` is
  alphanumeric/`_`/`-`; fails if it already exists (no overwrite).
- `get_system_json { name }` — exact retrieval.
- `search_system_json { query }` — relevance-ranked matches.
- `list_system_json` — all documents by name/domain/description.

## When to use what

- Exploring/deciding/debugging step by step → `advanced_reasoning` (+ session).
- "Have I reasoned about this before?" → `query_reasoning_memory`.
- A reusable recipe, checklist, or stable reference → SystemJSON.
- Separating unrelated projects/domains → distinct libraries.

## Conventions & gotchas

- Always thread the same `session_id` through one reasoning chain.
- Pass real node IDs (from prior `nodeId` returns) in `builds_on`/`challenges`;
  unknown IDs come back in the `missing` list and create no edge.
- `confidence` of exactly `0` is respected (it is not coerced to the default).
- Names for libraries and SystemJSON must match `^[a-zA-Z0-9_-]+$`.
- Creates do not overwrite: pick a fresh name or read the existing one first.
- Set `DISABLE_REASONING_LOGGING=true` to silence the formatted stderr trace.

## Storage layout

```
memory_data/
├── cognitive_memory.json     # default library (nodes + sessions)
├── {library_name}.json       # one file per named library
└── system_json/
    └── {name}.json           # one file per SystemJSON document
```

Writes are atomic and serialized, so concurrent auto-saves won't corrupt a file.
