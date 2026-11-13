<!-- factory 0.6.1 · managed file, do not edit: it is replaced on upgrade. This is the installed copy of the factory/v1 contract -->
# Factory state contract — `factory/v1`

The fixed interface between a factory run and anything that observes it (the dashboard today,
Andon later). Projects may customize reviewers, rules, models, and gates; they may not change
anything in this contract. The code that implements it is `packages/contract`.

## Principles

1. **The event log is the truth.** Each job has an append-only `events.jsonl`. Everything else
   about a job's state is derived from it.
2. **One writer.** Only the factory CLI writes `events.jsonl` and `job.json`. Orchestrators run
   CLI commands; they never hand-write state.
3. **Clock, not model.** Every timestamp is taken by the CLI from the system clock. A model never
   supplies a time.
4. **Derived files are disposable.** `job.json` can be deleted and rebuilt from the log at any time.
5. **Source and state never share a tree.** `factory/jobs/`, `factory/.lock/`, `factory/.worktrees/`
   are runtime state (gitignored); no job's diff may write there.

## File layout

```
factory/
  CONTRACT.md                 # the installed copy of this contract (docs/contract/v1.md)
  config.json                 # project settings the CLI and dashboard read (tracked)
  managed.json                # managed-file manifest: version + sha256 per file (tracked; optional)
  roles/<role>.md             # overlay: the project's rules for one role (tracked; optional)
  cli.ts                      # the only writer of job state (managed: a self-contained bundle)
  backlog.md  briefs/         # human-facing queue and interview briefs (tracked)
  epics/<slug>.md             # an epic's plan: its member briefs and their order (tracked; see "Epics")
  jobs/.claim.lock/           # the CLI's mutex for handing out job ids (runtime; never by hand)
  jobs/<id>/                  # runtime state, one dir per job (gitignored)
    events.jsonl              # append-only event log — the truth
    job.json                  # derived snapshot — what the board reads
    feature.md  rework-<k>.md # inputs written by the orchestrator
    conflict-<c>.md           # input written by the orchestrator: one per merge conflict
    spec.md  build.md  decision.md
    round-<N>/review-<key>.md # one per reviewer key in the round
    round-<N>/<key>/*         # that reviewer's supporting files, e.g. round-<N>/ui/*.png screenshots
  jobs/epics/<slug>/          # runtime state, one dir per epic (gitignored with jobs/; see "Epics")
    events.jsonl              # the epic's append-only log — the truth
    epic.json                 # derived snapshot over the log, the plan, and the epic's jobs
  .lock/  .worktrees/<id>/    # runtime (gitignored)
  .worktrees/epic-<slug>/     # an epic's worktree, on branch factory/epic/<slug> (runtime)
```

An **epic** (see "Epics") has its plan at `factory/epics/<slug>.md`, its runtime state at
`factory/jobs/epics/<slug>/`, its integration branch `factory/epic/<slug>`, and its worktree at
`factory/.worktrees/epic-<slug>/`. An **epic slug** follows the job slug rule below
(`^[a-z0-9]+(-[a-z0-9]+)*$`, at most 40 characters) and must not match the job-id pattern, so a
command argument, a dir under `jobs/epics/`, or an entry on the archive branch can always be told
from a job; the CLI checks it before building any path or ref. `jobs/epics/` is not named like a
job id, so job numbering, `doctor`'s duplicate-number note, and readers that list job dirs skip
it. *(Added within v1, additively: new files and dirs.)*

`conflict-<c>.md` is written by the orchestrator right before it logs `merge.conflicted` (see
"`events.jsonl`"), with `c` the job's new `conflicts` count (1 or 2). It holds facts only: the
target branch and its sha at the failed merge, the conflicting paths (`git diff --name-only
--diff-filter=U`, taken before the merge is aborted), and `git merge`'s one-line summary.
*(Added within v1, additively: a new input file.)*

When archiving is on, `factory archive` also copies each `merged` or `abandoned` job to the
orphan branch `factory/archive` in the same repo (see "Job archive"). That branch is history, not
state: the job dirs under `jobs/` stay the live, local, gitignored copy until `factory prune`
removes the ones already archived and settled (see "CLI"); a pruned job's record lives on the
branch, and its number is never handed out again.

Job id: `^\d{3}-[a-z0-9-]+$` (three-digit sequence + kebab slug). The CLI checks it before
building any path under `jobs/`, so a bad id never reads, writes, or creates anything.

Job ids are handed out by the CLI only, by `claim <slug>` (see "CLI"); an orchestrator never
computes one. A **slug** (a job's dir name with the `NNN-` prefix removed) must match
`^[a-z0-9]+(-[a-z0-9]+)*$` and be at most 40 characters ("2–4 words" is the skill's guidance, not
a CLI rule). The number is the highest number among the job dirs **and the job ids archived on
the `factory/archive` branch** + 1 (`001` when there are none);
gaps are never filled, and once `999` is taken `claim` refuses. Only `jobs/` entries that are
directories named like a job id count; `.claim.lock` and other stray entries are ignored. On the
branch, only its tip's top-level directories named like a job id count. The branch is read
whenever it exists, whatever `archive` says in `config.json`, so turning archiving off never
reuses a number; with no `factory/archive` branch the number is exactly the job-dir rule's.
*(Added within v1, additively: with no archive branch nothing changes.)*
**Uniqueness:** every claim takes its number under `jobs/.claim.lock` (see the "Concurrency" paragraph in
"CLI"), so no two claims, from any number of sessions or processes, get the same number. Job dirs
created before this rule may already share a number; they keep working untouched, and `doctor`
reports each such number as a `note`.

## `config.json`

```json
{
  "schema": "factory/v1",
  "name": "Minerva Admin",
  "reviewers": ["security", "ux", "ui", "code"],
  "maxRound": 2,
  "dashboard": { "settleAfterHours": 24 },
  "gate": ["bun test", "tsc --noEmit"],
  "merge": { "target": "current" },
  "archive": { "enabled": true },
  "epic": { "maxParallel": 3 },
  "roles": { "builder": { "runner": "claude", "model": "sonnet" }, "ux": { "runner": "claude" } }
}
```

- `name` — optional. The project's display name: Andon labels the project with it (see "Andon
  service"). A string of 1–64 characters, counted in Unicode code points, with no leading or
  trailing whitespace and no control characters (any Unicode `Cc` code point: U+0000–U+001F,
  U+007F–U+009F); spaces, punctuation, and non-ASCII characters are allowed. Anything else,
  including an empty string or `null`, is an error. When `name` is absent, the project is labeled
  with its root's basename. It is a label, not an identifier: the project id never depends on it,
  and `factory init` never writes one. *(Added within v1, additively: a new optional key; a CLI or
  Andon service from before it rejects a config that sets `name`, so upgrade first.)*
- `reviewers` — ordered reviewer keys (`^[a-z][a-z0-9-]*$`, at least one, unique, and none may
  equal a fixed role name: `spec-writer`, `builder`, `approver`). Each key `k` writes
  `round-<N>/review-<k>.md`. The order is the chip order on the board.
- `maxRound` — default review budget for a new job.
- `dashboard.settleAfterHours` — a merged job older than this is *settled*: hidden from the
  Merged column and listed in the Settled dialog. Purely a view; no event records it. An
  abandoned job is settled at once, whatever this says.

  **The epic-aware settle rule** extends it to epics and their jobs (see "Epics"), and is
  exported once from `packages/contract` (`isSettled`, `isEpicSettled`): an epic settles like a
  job (`landed`: when its `endedAt` is more than `settleAfterHours` old; `abandoned`: at once). A
  job with no `epic` settles by the rule above, unchanged. An `abandoned` job is settled at once,
  whatever its epic's state, as always. A `merged` job with an `epic` is never settled while its
  epic isn't `landed` or `abandoned` (an unknown epic counts as not terminal); once it is, the job
  settles when its epic does (by the epic's `endedAt`). `prune` uses it, behind its own stricter
  guard (see "CLI", `prune`), and so does the Andon service (see "Andon service", "Epics in the
  service"). *(Added within v1, additively: jobs without an epic settle exactly as before.)*
- `gate` — optional. The project's gate: an ordered, non-empty array of non-empty shell command
  strings. Agents run them in order from the worktree root, and the gate is green only when
  every command exits 0. There is no default: when `gate` is absent, no gate is configured, and
  agents say so instead of inventing a command. The CLI only validates it; it never runs it.
- `merge` — optional. How a job lands; v1 holds only `target`, and any other key inside `merge`
  is an error. `merge.target` is the job's **target branch**, the branch it is based on and
  merges into: `"current"` (the default when `merge` or `merge.target` is absent) means the
  branch the main checkout is on when the job is claimed; any other value names a branch. A
  target branch name, configured or resolved from `"current"`, must match
  `^[A-Za-z0-9][A-Za-z0-9._/-]*$` with no `..`, `//`, or `/.`, and must not end in `/`, `.`, or
  `.lock`, so it can never carry quotes, whitespace, or shell metacharacters into the commands
  that use it; anything else is an error. The CLI resolves it once per job, at `claim`, and records it on `job.claimed` (see
  "`events.jsonl`"), so changing `merge.target` affects only jobs claimed afterward. A branch
  literally named `current` can't be targeted: the value always means the checkout's branch.
- `archive` — optional. Whether `factory archive` copies terminal jobs to the `factory/archive`
  branch (see "Job archive"): an object holding only `enabled`, which is required and is `true`
  or `false`. Any other shape (not an object, `enabled` missing or not a boolean) or any other key
  inside `archive` is an error. No `archive` key, or `"enabled": false`, means off: `factory
  archive` refuses, saying archiving is disabled. It is overlay config: `factory init` and
  `factory upgrade` never write it. Archiving never pushes. *(Added within v1, additively: a new
  optional key; a CLI from before it rejects a config that sets `archive`, so upgrade first.)*
- `epic` — optional. How an epic schedules its members (see "Epics"): an object holding only
  `maxParallel`, a positive integer, the most members of one epic in a working stage at once
  (a member in `needs-human` holds no slot; sync and fix jobs bypass it). No `epic` key, or
  `"epic": {}`, means `maxParallel` 3. Any other shape, any other key inside `epic`, or a
  `maxParallel` that isn't a positive integer is an error. It is overlay config: `factory init`
  and `factory upgrade` never write it. *(Added within v1, additively: a new optional key; a CLI
  from before it rejects a config that sets `epic`, so upgrade first.)*
- `roles` — optional. Says how each role is run: an object mapping a role name to
  `{ "runner": "claude", "model"?: string }`. A role name is a fixed role (`spec-writer`,
  `builder`, `approver`) or a key in `reviewers`; any other name is an error. In an entry,
  `runner` is required, and `"claude"` (Claude Code) is the only accepted runner in v1; later
  v1 releases may accept more runners, additively (see "Runners"). `model` is optional: an opaque
  harness model name, not whitelisted, that must match `^[A-Za-z0-9][A-Za-z0-9._:\[\]-]*$` (so it
  can't break YAML frontmatter). Without it, or without an entry, or without `roles` at all, a
  role runs on the default model, `opus`. Unknown keys inside an entry are an error. The model is
  rendered into the role's managed agent file, so changing `roles` changes managed bytes and
  takes effect only after `factory upgrade` (the same as changing `reviewers`); until then the
  installed agents keep their old models, and `doctor` does not report that drift.

Unknown keys are an error, and `factory doctor` enforces the same. Later versions add a
tracker and further merge policy (inside `merge`) — additively.

### Role overlays — `roles/<role>.md`

`factory/roles/<role>.md` is the project's own rules for one role, where `<role>` is
`spec-writer`, `builder`, `approver`, or a reviewer key. Together with `config.json` it is the
**overlay**: written by humans, tracked, and never a managed file. Each file is optional; a
missing one is normal and means the role's managed defaults apply. Each managed role document
tells its agent to read its overlay file at run time, so the overlay is never inlined into a
managed file and editing it never changes a managed file's hash. The overlay adds rules; it
never changes which file an agent writes, its path, or its first line.

**The outcome rule.** An overlay never decides a role's outcome. It is a ratchet: it can make a
role more focused or stricter, never more lenient about what the role finds. It may say where to
look and what to look for, add checks and escalation triggers, make something blocking, or let a
reviewer PASS early when nothing in its area changed (nothing in scope, nothing to find). It may
never fix a verdict or decision regardless of what the agent finds, drop, hide, or downgrade a
finding made within the role's scope, remove a default escalation trigger, or tell the builder to
skip or wave off a `[blocking]` finding. The test an agent applies to each line: *does this line
decide the outcome before looking, or throw away something already found?*

- **Recorded-decision exemption.** A line may downgrade or exempt a finding only when it cites a
  recorded human decision: a brief's decision or contract call, or a decision record the project
  names (such as its lists of deferred work and known gaps). The finding is still reported,
  marked as covered, for example `[accepted: <the decision>]`. Nothing parses that marker; it is
  prose for the approver and the human.
- **Ignore and note.** An agent ignores a line that breaks the rule and works as if it weren't
  there. It notes the line once in its own file: a reviewer as one `[nit]` finding,
  `factory/roles/<key>.md: "<the line>" breaks the overlay outcome rule; ignored.`; the approver
  as a line in `decision.md`; the builder in `build.md`; the spec-writer under **Constraints** in
  `spec.md`. No agent can edit `factory/roles/`, so an ignored line never causes blocking or
  escalation.
- **Customize refuses it.** `/factory customize` refuses to write a role rule that breaks the
  outcome rule, names the rule, and offers the allowed form (cite a recorded decision, keep the
  finding visible).

Worked examples:

| overlay line | allowed? |
|---|---|
| "PASS early when no UI file changed." | Yes: scope, not a predetermined verdict. |
| "Always APPROVE." / "Always return `VERDICT: PASS`." | No: fixes the outcome before looking. Ignored and noted. |
| "Treat missing CHANGELOG entries as a nit." | Only when it cites a recorded decision (for example, "per the brief's decision 3") and the finding is still written, marked `[accepted: …]`. Bare, it throws away something found: ignored and noted. |

The rule is enforced by the agents and by `customize`, not by `doctor`: whether a line breaks it
is a judgment call, not a text check.

## Runners

A **runner** is what fills a role: it takes a spawn card, does the role's work, and leaves the
role's one file on disk. In v1 the only runner is Claude Code (`"claude"`), which runs each role
as the agent `factory-<role>` (`factory-<key>` for a reviewer). This section is the **role I/O
protocol** every runner implements, whatever the harness. A runner that meets it can fill any
role; the orchestrator, the CLI, and the board can't tell runners apart.

**Input: the spawn card.** All context comes from files; the card gives only paths. The
orchestrator passes these fields, dropping the ones that don't apply:

| field | value | given to |
|---|---|---|
| `repo` | the absolute repo root `<R>` | every role |
| `job dir` | `<R>/factory/jobs/<id>` | every role |
| `worktree` | `<R>/factory/.worktrees/<id>` (branch `factory/<id>`) | builder, reviewers, approver |
| `base` | the job's target branch: `target` from `job.json` (see "`job.json`" for the `null` fallback). The worktree branches from it, and roles diff and log against it (`<base>...HEAD`) | builder, reviewers, approver |
| `round` | the review round `<N>` | reviewers; the builder when resumed after round `<N>` |
| `brief` | `<R>/factory/briefs/<slug>.md` | spec-writer and approver, when the job has one |
| `write` | the one absolute path the role writes | every role |
| `deliver` | the instruction to create the `write` file, not to reply with its contents | every role |

A rework adds the path of `<job dir>/rework-<k>.md` to the builder's (or spec-writer's) card.
A merge conflict adds the path of `<job dir>/conflict-<c>.md` to the builder's card (or names it
in the message resuming the builder); the builder merges `base` into `factory/<id>` in the
worktree as a merge commit (never a rebase or any history rewrite), resolves it, runs the gate,
and adds a `## Conflict <c>` section to `build.md`. *(Added within v1, additively.)*

**Per role.** Each role also reads its overlay, `factory/roles/<role>.md`, when it exists, and
the project's instructions. "Writes" is the role's one file (the card's `write` path):

| role | reads | writes | first line |
|---|---|---|---|
| `spec-writer` | `feature.md`, any `rework-*.md`, the brief, the code | `<job dir>/spec.md` | `# <title>` (its H1 becomes `job.titled`) |
| `builder` | `spec.md`, any `rework-*.md`, any `conflict-*.md`, the round's `review-*.md`, its own `build.md`, `config.json` (`gate`) | `<job dir>/build.md`, plus commits on `factory/<id>` in the worktree | `# Build — <id>` |
| reviewer `<key>` | `spec.md`, `build.md`, the diff `<base>...factory/<id>`, `config.json` (`gate`), its previous `round-<N-1>/review-<key>.md` | `<job dir>/round-<N>/review-<key>.md` (and supporting files under `round-<N>/<key>/`) | `VERDICT: PASS` or `VERDICT: CHANGES` |
| `approver` | `feature.md`, `spec.md`, `build.md`, any `rework-*.md`, any `conflict-*.md`, the brief, every `round-*/review-*.md`, `config.json`, the diff and log | `<job dir>/decision.md` | `APPROVE` or `ESCALATE` |

The builder is the only role that changes code, and only in the job worktree. Reviewers and the
approver may run commands there (the gate) but never edit or commit.

**Never written by a runner:** `events.jsonl`, `job.json`, or anything else under `jobs/<id>/`
but the role's own file (and a reviewer's supporting files); the overlay (`config.json`,
`roles/**`); managed files (anything listed in `managed.json`); `.lock/`; the main checkout's
code; and never the job's target branch (`base`: no checkout, commit, merge, or push).

**Spans and events stay with the orchestrator.** A runner never runs the CLI's `event` command.
The orchestrator brackets each run in one agent span (`agent.started` before, `agent.finished`
once the run returns and its file exists), with the identity fields in "`events.jsonl`", never
a harness's agent id. The CLI alone reads the verdict from the file's first line. A runner that
returns without its file gets the same nudge, re-spawn, and escalation as any other.

A non-normative design for runners other than Claude Code is in `docs/runners.md`.

## Managed files

`factory/managed.json` lists the files the factory manages (the installed skill, agents, CLI, and
contract) with the hash each had when it was installed, so `factory doctor` can tell an edited or
missing managed file from a pristine one:

```json
{
  "schema": "factory/v1",
  "version": "0.1.0",
  "files": {
    "factory/CONTRACT.md": "<sha256 hex>",
    ".claude/agents/factory-builder.md": "<sha256 hex>"
  }
}
```

- `schema` — `"factory/v1"`. `version` — a non-empty string naming the managed release.
- `files` — maps a repo-relative path to the SHA-256 of the file's bytes, as 64 lowercase hex
  characters. A path uses `/` separators, is never absolute, and never contains a `..` segment.
  A listed file that resolves (through symlinks) outside the repo is a failure; doctor never reads it.
- Unknown keys are an error, as for `config.json`.
- The file is optional. Without it the install is *unstamped*: doctor reports that and skips the
  hash checks without failing. Writing the manifest is the installer's job, not the CLI's.

Each rendered managed document also carries an **in-file version stamp**: one HTML comment line
that names the managed version, says the file is managed and must not be edited, and points to
its overlay path (`factory/roles/<role>.md` for a role document; `factory/config.json and
factory/roles/<role>.md` for the skill and `explore.md`), e.g.
`<!-- factory 0.1.0 · managed file, do not edit: … Project rules go in the overlay: factory/roles/builder.md -->`.
In a file with YAML frontmatter the stamp is the line right after the closing `---`, so the
frontmatter still parses; otherwise it is the first line. The stamp is part of the file's bytes,
so it is covered by the hash. The hash itself lives only in `managed.json`, since a file can't
contain its own hash. The templates are rendered by `packages/templates`, whose version is the
manifest's `version`.

The installed CLI and contract copy carry a stamp too, naming the same managed version:

- `factory/cli.ts` starts with one `//` comment line, e.g.
  `// factory 0.1.0 · managed file, do not edit: it is replaced on upgrade. Project settings go in the overlay: factory/config.json`.
- `factory/CONTRACT.md` starts with one HTML comment line, e.g.
  `<!-- factory 0.1.0 · managed file, do not edit: it is replaced on upgrade. This is the installed copy of the factory/v1 contract -->`,
  followed by this document's text.

As for the rendered documents, each stamp is covered by the file's hash, and the hash lives only
in `managed.json`. `factory init` writes the manifest and `factory upgrade` rewrites it (see "CLI").

## `events.jsonl`

One JSON object per line, UTF-8, `\n`-terminated, appended only. Every event has:

| field | type | |
|---|---|---|
| `ts` | string | ISO-8601 UTC with milliseconds (`new Date().toISOString()`), set by the CLI |
| `type` | string | one of the types below |

Plus the type's own fields:

| type | fields | effect on the job |
|---|---|---|
| `job.claimed` | `schema: "factory/v1"`, `id`, `maxRound`, `brief: string\|null`, `issue: string\|null`, `target?` (the resolved target branch; filled by the CLI), `session?` (see "Session" below), `epic?` and `kind?` (see "Epic membership" below) | first line of every log, written only by `claim`; stage `claimed`; sets `target`; sets `session` (or `null`); sets `epic` and `kind` (or `null`) |
| `job.titled` | `title` | sets the card title (from spec.md's H1) |
| `stage.entered` | `stage` (`spec`\|`build`\|`approve`) | moves the job to that stage |
| `round.started` | `round`, `reviewers: string[]` (filled by the CLI from `config.reviewers` when omitted; the stored event always has it) | stage `review`; previous round (if any) moves to history; every listed reviewer `pending` |
| `agent.started` | `role` (`spec-writer`\|`builder`\|`reviewer`\|`approver`), `key?` (reviewer key), `round?`, `name?` (agent name/id, e.g. `builder-019-…`) | opens a timing span |
| `agent.finished` | same identity fields as its start, `verdict?`, `agentId?` (see "Usage" below), `usage?` (written by the CLI) | closes the span; a reviewer's `verdict` (`PASS`\|`CHANGES`) sets its chip only when its `round` is the current round and its `key` is one that round listed (any other finish closes its span and changes no chip); the approver's (`APPROVE`\|`ESCALATE`) sets `decision`; sets the span's `agentId` and `usage` |
| `job.noted` | `note` | one-line card note |
| `job.escalated` | `reason`, `orchestrator?` (written by the CLI; see "Usage") | stage `needs-human`; `note = reason`; `stoppedBy = "escalated"`, `stoppedFrom` = the stage it left; closes every still-open agent span at this `ts` with `verdict: null` |
| `job.reworked` | `k`, `maxRound`, `session?` | stage `spec` when `stoppedFrom` (as it was before this event) is `spec` or `claimed` (the job stopped before anything was built), else stage `build`; clears `decision`; `reworks = k`; `note = ""`; `stoppedBy` and `stoppedFrom` = `null`; with `session`, sets `session` (without, keeps it) |
| `job.human-approved` | `session?` | `decision = "APPROVE (human)"`; with `session`, sets `session` (without, keeps it) (idempotent: a repeat while `needs-human` is accepted; it changes nothing but `session`, when it carries one) |
| `merge.failed` | `reason`, `orchestrator?` (written by the CLI) | stage `needs-human`; `note = reason`; `stoppedBy = "merge-failed"`; from `approve`, `stoppedFrom = "approve"` (from `needs-human`, after `job.human-approved`, `stoppedFrom` is unchanged) |
| `merge.conflicted` | `reason` (non-empty; no other field) | stage `build`; `maxRound = round + 2` (the current `round`); `conflicts` + 1; `note = reason`; clears `decision`; clears any human approval (a later merge from `needs-human` needs a new `job.human-approved`); `stoppedBy`, `stoppedFrom`, `reworks`, and `session` unchanged; closes no agent span. *(Added within v1, additively.)* |
| `job.merged` | `sha`, `orchestrator?` (written by the CLI) | stage `merged`; `note = "merged <sha>"`; `endedAt = ts`; terminal |
| `job.abandoned` | `reason` (non-empty), `orchestrator?` (written by the CLI) | stage `abandoned`; `note = reason`; `endedAt = ts`; closes every still-open agent span at this `ts` with `verdict: null`; terminal. *(Added within v1, additively.)* |

`target` is never supplied by the orchestrator either: a caller-supplied `target` is rejected as
an extra field, and nothing is written. The CLI resolves it from `merge.target` with git, in the
repo root (the parent of `factory/`, i.e. the main checkout): for `"current"`,
`git symbolic-ref --short HEAD`; for a branch name, that `refs/heads/<name>` exists. A detached
HEAD, a missing branch, a branch whose name isn't an allowed target name (see `merge` in
"`config.json`"), or a git failure refuses the claim with a one-line reason, and nothing is
written (no job dir, no `events.jsonl`, no `job.json`). Logs claimed before `target` existed have
no `target` on `job.claimed`; that is still valid v1.

**Session.** `session` is the orchestrator's thread: `{ "app": "t3code", "environment": "<environmentId>", "thread": "<threadId>" }`, ids only, never a link (a viewer builds any link
itself). It is optional on exactly three events, `job.claimed`, `job.reworked`, and
`job.human-approved`; on every other event (including `job.abandoned`) it is an extra field,
rejected with nothing written. On the command line it is one string,
`session=t3code:<environmentId>/<threadId>`, parsed only by its own check (never coerced by the
CLI's value parsing): the app before the first `:` must be `t3code` (the only app accepted today;
the `app` key leaves room for other harnesses), then exactly one `/` separating the environment
id and the thread id, each 1–64 characters of `[A-Za-z0-9-]`. Anything else (another app, no
`:` or `/`, more than one `/`, an empty or 65-character id, any other character) refuses the
event with a one-line reason, and nothing is written (on `claim`, no job dir). Logs without any
`session` are still valid v1. Readers are tolerant: a stored `session` that isn't a well-formed
object is ignored by the projection. *(Added within v1, additively: a new optional field on
three events.)*

**Epic membership.** `epic` and `kind` are set together, only on a job claimed into an epic
(`claim … epic=<slug>`, see "CLI"): `epic` is the epic's slug and `kind` is `member` (a plan
member, the default), `sync`, or `fix` (a job the epic generates; see "Epics"). On a job claimed
into an epic, `target` is always `factory/epic/<slug>`. A standalone job's `job.claimed` has
neither key, exactly as before. Both are caller fields of `claim` only; on any other event they
are extra fields. Logs without them are still valid v1, and readers treat their absence as a
standalone job. *(Added within v1, additively: two new optional fields on `job.claimed`.)*

`verdict` is never supplied by the orchestrator: the CLI reads it from the agent's file — the first
non-empty line, trimmed, which must be exactly `VERDICT: PASS` or `VERDICT: CHANGES` for reviews,
`APPROVE` or `ESCALATE` for decision.md — so the board can't disagree with the files.

**Usage.** The token spend of each agent span and of the orchestrator, recorded on the log at
span close so it outlives the harness's transcripts, and so `rebuild` (and any re-projection,
such as Andon's archive) reproduces it without reading any transcript. *(Added within v1,
additively: one new optional caller field, `agentId`, and CLI-written fields on existing
events; no transition changes.)*

- **The usage shape** (harness-neutral; the contract never knows a harness's transcript format):
  `{ "model": string|null, "input": n, "output": n, "cacheWrite": n, "cacheRead": n }` — the
  four raw token counts (non-negative integers: input, output, cache write, cache read) and the
  model with the most output tokens in the window (`null` when none was named) — or
  `{ "unavailable": "<one-line reason>" }`. Nothing else from a transcript is ever copied: no
  prompt, content, path, or session id. No dollar figure is recorded.
- **`agentId`** — optional on `agent.finished` only (an extra field on every other event): the
  harness's handle for the agent (Claude Code's Agent tool agent id), passed through by the
  orchestrator. It is a string, never coerced (the literal `null`, or any non-string, refuses the
  event with a one-line reason and nothing written). It is data on the span, never its identity
  or `name`. The CLI builds a path from it only when it matches `^[A-Za-z0-9_-]+$`; any other
  string is dropped from the stored event and the span's usage records as unavailable (the event
  still succeeds).
- **`usage`** on `agent.finished`, written by the CLI (a caller-supplied `usage` is an extra
  field): the agent's spend over its span, from the matching open `agent.started`'s `ts` to this
  event's `ts`, both inclusive. With no `agentId`, an unsafe one, no matching open span, a missing
  or unreadable transcript, or another harness, it is `{ "unavailable": "<reason>" }`.
- **`orchestrator`** on `job.escalated`, `merge.failed`, `job.merged`, and `job.abandoned`,
  written by the CLI (a caller-supplied one is an extra field), only on a **standalone** job (no
  `epic` on `job.claimed`): the orchestrating session(s)' spend inside the **stretch** that event
  ends. A stretch starts at `job.claimed`, `job.reworked`, or `job.human-approved` (the first one
  after the last end) and ends at one of those four events; an end event with no open stretch
  (such as `job.abandoned` from `needs-human` after an escalation) records nothing. The sessions
  are found from the job's recorded `agentId`s (an agent's transcript lives under its parent
  session); no session id is stored. If one session drives two jobs side by side, each job's
  stretch counts that session's full spend inside its own window (the windows may overlap).
- **Usage never blocks.** The CLI reads usage only once the event passed its transition check (a
  rejected event reads nothing and writes nothing), and a failure to read it records
  `unavailable`, never a refusal. `doctor` checks nothing about usage.
- **The reader.** The CLI injects a harness reader into the store. The only one today is Claude
  Code's (in the CLI, outside the contract): the transcript root is `$CLAUDE_CONFIG_DIR`, else
  `~/.claude`, then `projects/`; an agent's transcript is
  `<project>/<session>/subagents/agent-<agentId>.jsonl`, looked up first under the project folder
  for the repo root (its path with every character outside `[A-Za-z0-9]` as `-`), then under any
  project folder; its session's transcript is `<project>/<session>.jsonl`. It sums each line's
  `message.usage` over the lines whose `timestamp` falls in the window, counting each
  `message.id` once (Claude Code writes a line per content block, each repeating the usage), and
  reads nothing but `timestamp`, `message.id`, `message.model`, and `message.usage`.
- Logs written before usage carry none of these fields and are still valid v1; their spans read
  **not recorded**, which is distinct from **unavailable**.

A builder resumed for a new round (or a rework) gets a fresh `agent.started`/`agent.finished`
pair with the same `name`; spans never overlap for one identity.

### Transitions the CLI enforces

| from | allowed events |
|---|---|
| (no log) | `job.claimed` |
| `claimed` | `stage.entered spec`, `job.escalated`, `job.abandoned` (force only) |
| `spec` | `job.titled`, `stage.entered build`, `job.escalated`, `job.abandoned` (force only) |
| `build` | `round.started` (round = previous + 1), `job.escalated`, `job.abandoned` (force only) |
| `review` | `stage.entered build` (only if round < maxRound and the round is complete), `stage.entered approve` (round complete), `job.escalated`, `job.abandoned` (force only) |
| `approve` | `job.escalated`, `job.merged`, `merge.failed`, `merge.conflicted` (at most 2 per job), `job.abandoned` (force only) |
| `needs-human` | `job.reworked` (enters `spec` when `stoppedFrom` is `spec` or `claimed`, else `build`), `job.abandoned`, `job.human-approved` → then `job.merged` \| `merge.failed` \| `merge.conflicted` (at most 2 per job) (a failed or conflicted merge resets the approval, so `job.human-approved` is needed again before the next `job.merged`) |
| `merged` | nothing (terminal) |
| `abandoned` | nothing (terminal) |

`job.escalated` is allowed from every working stage (`claimed`, `spec`, `build`, `review`, `approve`),
not from `needs-human`. `job.reworked` takes the job back to the stage the rework redoes: to
`spec` when the job stopped from `spec` or `claimed` (its `stoppedFrom`, before the rework resets
it; nothing was built), so `job.titled` and `stage.entered build` follow and `round.started` is
refused; otherwise to `build`. A `merge.failed` always stops from `approve`, so it reworks into
`build`. A job whose log has no `job.claimed`, or whose dir holds a `job.json` but no
`events.jsonl` (legacy), rejects every event — including `job.claimed`; only `claim` creates a
job dir (it logs `job.claimed` on a new id), and a rejected event leaves nothing behind. A merge from `needs-human`
needs a `job.human-approved` logged after any `merge.failed` (and after any `job.escalated`).
`job.human-approved` is idempotent while `needs-human`: logging it again when the job is already
human-approved is accepted (so a retried `approve` never fails on it) and has no further effect.

`merge.conflicted` is allowed from `approve`, and from `needs-human` once a `job.human-approved`
has been logged after the last `job.escalated` or `merge.failed` (the condition `job.merged`
uses); from every other stage it is rejected. A job may log it at most **2** times: when the log
already has 2 `merge.conflicted` events, the next one is rejected with a one-line reason telling
the orchestrator to log `merge.failed` instead (which is still accepted), and nothing is written.
The limit is fixed in the contract, not a config key. The CLI derives the count and the new
`maxRound` from the log alone; the event carries no number. After it, the job is in `build`:
`round.started` takes round + 1, and `stage.entered build` from `review` is allowed up to round
+ 2. *(Added within v1, additively: a new event; no existing transition is tightened.)*

`job.abandoned` is allowed from `needs-human` always, and from a working stage only when the
caller passes **force**, an option of the transition check, not a field of the event: the event
stores `reason` only, and nothing records whether force was passed. `bun factory/cli.ts event
<id> job.abandoned reason=…` never passes force, so through `event` it is allowed from
`needs-human` only; `abandon --force` (see "CLI") passes it. It is never allowed from `merged`
or `abandoned`, with or without force. *(Added within v1, additively: a new event and a new
terminal stage; no existing transition is tightened.)*

`merged` and `abandoned` are the two terminal stages: each rejects every later event, including
`job.noted`, `job.titled`, and `agent.*`, with or without force.

`job.noted`, `job.titled`, `agent.started`, and `agent.finished` are allowed in any non-terminal
stage. A round is **complete** when every reviewer listed in its `round.started` has an
`agent.finished` with a verdict (WAIT FOR ALL, enforced). An event that breaks these rules is
rejected with a non-zero exit and nothing is written.

## `job.json` — the derived snapshot

Rebuilt by the CLI after every append (written to a temp file, then renamed, so readers never
see a partial file). Field-compatible with the pre-contract `job.json`, plus timing:

```json
{
  "schema": "factory/v1",
  "id": "019-example", "title": "Example", "branch": "factory/019-example", "target": "main",
  "builder": "builder-019-example",
  "stage": "review", "round": 2, "maxRound": 2,
  "reviews": { "security": "CHANGES", "ux": "PASS", "ui": "pending", "code": "PASS" },
  "history": [ { "round": 1, "reviews": { "security": "CHANGES", "ux": "PASS", "ui": "CHANGES", "code": "PASS" } } ],
  "reworks": 0, "conflicts": 0, "decision": null, "note": "", "stoppedBy": null, "stoppedFrom": null,
  "brief": null, "issue": "M80",
  "session": { "app": "t3code", "environment": "env-1", "thread": "thread-A" },
  "epic": null, "kind": null,
  "startedAt": "2026-10-23T14:02:11.204Z",
  "stageEnteredAt": "2026-10-23T14:31:40.019Z",
  "endedAt": null,
  "updated": "2026-10-23T14:35:02.771Z",
  "timing": {
    "stages": [ { "stage": "spec", "round": 0, "enteredAt": "…", "exitedAt": "…", "ms": 184000 } ],
    "agents": [ { "role": "reviewer", "key": "security", "round": 2, "name": null,
                  "startedAt": "…", "finishedAt": null, "ms": null, "verdict": null,
                  "agentId": null, "usage": null } ]
  },
  "usage": {
    "stages": [ { "stage": "build", "total": { "status": "exact", "input": 120, "output": 48000,
                  "cacheWrite": 210000, "cacheRead": 3400000, "spans": 2, "unknown": 0 } } ],
    "rounds": [ { "round": 0, "total": { "status": "partial", "input": 120, "output": 48000,
                  "cacheWrite": 210000, "cacheRead": 3400000, "spans": 3, "unknown": 1 } } ],
    "job": { "status": "partial", "input": 120, "output": 48000, "cacheWrite": 210000, "cacheRead": 3400000, "spans": 3, "unknown": 1 },
    "orchestrator": { "status": "exact", "input": 0, "output": 0, "cacheWrite": 0, "cacheRead": 0, "spans": 0, "unknown": 0 }
  }
}
```

- `target` — the job's target branch, from `job.claimed`'s `target`; `null` when the log's
  `job.claimed` has none (claimed before it was recorded). For a `null` target, an orchestrator
  that needs the branch resolves `merge.target` from the current `config.json` each time (with
  `"current"`, the main checkout's branch), so such a job is not frozen to its claim-time branch.
  Before merging any job, the orchestrator checks that the main checkout is on the target; if
  not, it records `merge.failed reason='checkout is on <x>, job targets <target>'` and never
  switches the checkout's branch.
- `session` — the orchestrator's thread (see "Session" in "`events.jsonl`"): the most recent
  `session` recorded on `job.claimed`, `job.reworked`, or `job.human-approved` (latest wins); a
  `job.reworked` or `job.human-approved` without one keeps the earlier one, and no other event
  changes it. `null` when none was ever recorded. Readers treat a missing key as `null` (a
  snapshot written before it, until a `rebuild`). *(Added within v1, additively.)*
- `epic`, `kind` — from `job.claimed`'s `epic` and `kind` (see "Epic membership" in
  "`events.jsonl`"): the epic's slug and `member`, `sync`, or `fix` for a job in an epic; both
  `null` for a standalone job and for a log written before them (a stored `epic` with no valid
  `kind` reads as `member`). Snapshots written by the CLI always carry both keys; readers treat a
  missing key as `null`. *(Added within v1, additively.)*
- `conflicts` — the number of `merge.conflicted` events in the log, `0` when there are none
  (at most 2: see "Transitions the CLI enforces"). Snapshots written by the CLI (`event`,
  `rebuild`) always carry the key, and `rebuild` derives it from the log; readers treat a missing
  key as `0` (a snapshot written before it, until a `rebuild`). *(Added within v1, additively.)*
- `stageEnteredAt` — when the current stage began (drives the card's live timer).
- `stoppedBy` — why the job is (or last was) in `needs-human`: `"escalated"` (set by
  `job.escalated`) or `"merge-failed"` (set by `merge.failed`, also one logged while already in
  `needs-human`); `null` when it never was, or since its last `job.reworked`.
- `stoppedFrom` — the working stage (`claimed`, `spec`, `build`, `review`, or `approve`) the job
  was in when it entered `needs-human`, or `null`. A `merge.failed` from `needs-human` leaves it
  unchanged. `job.reworked` reads `stoppedFrom` first (`spec` or `claimed` sends the job back to
  stage `spec`, any other value to `build`), then resets both fields to `null`; `job.human-approved`,
  `merge.conflicted`, `job.merged`, and `job.abandoned` keep them. Snapshots written by the CLI always carry both keys; readers treat a
  missing key as `null` (a snapshot written before them, until a `rebuild` derives them from the
  log). *(Added within v1, additively.)*
- `endedAt` — the `job.merged` or `job.abandoned` time, else `null`. A merged job is settled when
  `endedAt` is older than `settleAfterHours`; an abandoned job is always settled.
- `updated` — the last event's `ts`.
- `timing.stages[].exitedAt`/`ms` are `null` for the open stage; `timing.agents[].finishedAt`/`ms`
  are `null` while the agent runs. Viewers compute live elapsed time from the open timestamps.
- `history[]` entries may carry their own `timing` slice later; v1 keeps history verdict-only.
- `timing.agents[].agentId` — the span's `agentId` from its `agent.finished` (see "Usage" in
  "`events.jsonl`"), else `null`. `timing.agents[].usage` — the span's usage from its
  `agent.finished`: the counts, or `{ "unavailable": "<reason>" }`; `null` means **not
  recorded** (the span is still open, or it closed on a log written before usage). A span closed
  by `job.escalated` or `job.abandoned` without its own `agent.finished` reads `{ "unavailable":
  "closed by escalation" }` (or `"closed by abandon"`) in a log that records usage (any event
  carries a `usage` or `orchestrator`), and `null` in one that doesn't. Readers treat a missing
  key as `null`; a stored value that isn't the usage shape (or an `agentId` outside
  `^[A-Za-z0-9_-]+$`) reads as `null`. *(Added within v1, additively.)*
- `usage` — the job's token spend, rolled up from its **closed** agent spans (an open span is not
  counted yet), following the timing's shape. Each total is `{ status, input, output, cacheWrite,
  cacheRead, spans, unknown }`: `spans` counts what it covers and `unknown` those without counts
  (unavailable or not recorded); `status` is `exact` (every span has counts, or there are none),
  `partial` (some do, `unknown` don't: the counts are a lower bound, never an exact figure),
  `unavailable` (none do and some was unavailable), or `not recorded` (none was recorded).
  - `stages` — one total per stage with spans, in the order `spec`, `build`, `review`,
    `approve`, by role: `spec-writer` → `spec`, `builder` → `build`, `reviewer` → `review`,
    `approver` → `approve`.
  - `rounds` — one total per round, ascending: a span's own `round`, else the job's `round` when
    the span started (so the spec writer and the first build are round 0, and an approver after
    round N is round N).
  - `orchestrator` — the **orchestrator slice** of a standalone job: one total over its
    stretches (each stretch-ending event's `orchestrator`; a stretch whose end carries none, on a
    log written before usage, is not recorded). `null` for a job in an epic, whose orchestrator
    spend is the epic's (`epic.json`'s `orchestrator`).
  - `job` — every closed span plus the orchestrator's stretches.

  Snapshots written by the CLI always carry `usage`; readers treat a missing key as not recorded.
  *(Added within v1, additively.)*

**Legacy jobs** (no `events.jsonl`, written before this contract) are left untouched. Viewers treat
them as having no timing and use `updated` as the merge time when `stage` is `merged`.

## Epics

An **epic** runs several briefs, in the order a plan gives, as ordinary jobs (its **members**)
that branch from, are reviewed against, and merge into the epic's own integration branch,
`factory/epic/<slug>`; when every member has merged, the epic lands on its target with one
merge. The design is `docs/design/epics/design.md`, and decision 13 in `docs/decisions.md`
records it. The CLI owns the epic's setup and teardown (`epic start`, `epic abandon`), its log,
its snapshot, and its scheduling rules (`epic next`, and the checks `claim … epic=` makes); every
merge (members into the epic branch, catch-ups, landing) stays with the orchestrator, which
records the outcomes as events. Besides its members, an epic may claim **generated** jobs inside
itself: a **sync** job (brings the target into the epic branch after a conflicting catch-up) or a
**fix** job (makes a red gate green before landing). Each epic job is a normal job with a normal
log; only `job.claimed`'s `epic` and `kind` tie it to the epic. *(Added within v1, additively:
new files, events, optional fields, a config key with a default, and new commands; no existing
event, field, or transition changes.)*

### The plan — `factory/epics/<slug>.md`

A tracked markdown file, written by humans and `explore`, never by the CLI. Its slug (the file
name without `.md`) is the epic's id, with one run per plan. The CLI reads two things from it,
with one parser (`parsePlan`) that serves `epic start`, `epic next`, `doctor`, and the
projection alike:

- **Status.** The first line starting with `- Status:` before the first `## ` heading, as briefs
  have. Its trimmed value is one of `draft`, `ready`, `done`, or `abandoned`; no such line, or
  any other value, is a status error.
- **Members.** The `## Members` section, from that heading to the next `#` or `##` heading. Each
  list item at column 0 is one member and must start with the member's brief slug in backticks,
  `` - `<slug>` ``; free text may follow. Indented lines continue the item above (so an item may
  wrap); other non-list lines are prose. An item may carry `` after: `<slug>`[, `<slug>`] `` (the
  members it waits on) and `maxRound: <n>` (a positive integer: the member job's review budget
  when `claim` gives none), each at most once. Any other list item (no backticked slug first, a
  `*`, `+`, or numbered item), a slug that isn't a job slug (`^[a-z0-9]+(-[a-z0-9]+)*$`, at most
  40 characters), a malformed `after:` or `maxRound:`, an `after:` listing one slug twice, a
  duplicate member, a missing `## Members` section, and a section with no items are parse
  errors, each one line naming the section line.
- **Graph.** Every `after:` slug must be a member, and the `after:` edges must have no cycle.
- **Member briefs.** Member `<m>`'s brief is `factory/briefs/<m>.md`; it counts as `ready` when
  its `- Status:` line (read the same way) says exactly `ready`. Plans and briefs are read only as
  regular files: a symlink is never followed.

A plan's live state (running, blocked, waiting) is never written to it.

`epic start` refuses a plan, and `doctor` FAILs a `ready` plan, with the same one-line reason,
checked in this order: the plan is missing; its status (missing, unknown, or not `ready`:
`plan factory/epics/<slug>.md is <status>, not ready`); its first parse error; its graph (`member
<m> is after <x>, which is not a member`, or `the after: edges form a cycle: a -> b -> a`); then
each member's brief, in plan order (missing, or not `ready`).

### The epic log — `jobs/epics/<slug>/events.jsonl`

The same format as a job's log (one JSON object per line, `ts` set by the CLI from the system
clock, appended only), written only by the CLI under the epic's own lock,
`jobs/epics/<slug>/.events.lock` (an `mkdir`, stale after 30 s, as for jobs). It records only
epic-level facts; a member's progress lives in its own log.

| type | fields | effect on the epic |
|---|---|---|
| `epic.started` | `schema: "factory/v1"`, `slug`, `target` (resolved by the CLI with `claim`'s rule), `session?` | first line of every epic log, written only by `epic start`; state `running` |
| `epic.waiting` | `reason` (non-empty), `orchestrator?` (written by the CLI) | state `waiting` on you; `note = reason` |
| `epic.resumed` | `session?` | from a logged `waiting`, back to the state before it (`running` or `landing`); clears `note`; with `session`, records the driving session (on a running epic it records the session only) |
| `epic.landing` | none | state `landing` |
| `epic.landed` | `sha` (non-empty; a string, never coerced), `orchestrator?` (written by the CLI) | state `landed`; `sha`; `note = "landed <sha>"`; `endedAt = ts`; terminal |
| `epic.abandoned` | `reason` (non-empty), `orchestrator?` (written by the CLI) | state `abandoned`; `note = reason`; `endedAt = ts`; terminal; written only by `epic abandon` |

`session` (the same shape and CLI check as "Session" in "`events.jsonl`") is accepted on
`epic.started` and `epic.resumed` only; on any other epic event it is an extra field. Any
unknown field is rejected.

`orchestrator` (the usage shape of "Usage" in "`events.jsonl`") is the epic's orchestrating
session(s)' spend inside the **stretch** the event ends, written by the CLI (a caller-supplied
one is an extra field). An epic stretch starts at `epic.started` or `epic.resumed` (the first one
after the last end) and ends at `epic.waiting`, `epic.landed`, or `epic.abandoned`; an end with
no open stretch records nothing. The sessions are found from the `agentId`s recorded on the
epic's jobs (their `job.json` spans); no session id is stored. The epic's orchestrator spend is
one figure for the epic: it is never split across its members, whose own logs record no
`orchestrator`. Reading it never refuses the event. *(Added within v1, additively.)*

Transitions are checked against the epic's **logged** state: Transitions are checked against the epic's **logged** state:

| from | allowed events |
|---|---|
| (no log) | `epic.started` |
| `running` | `epic.waiting`, `epic.resumed`, `epic.landing` (only when every plan member's newest job is `merged` and no sync or fix job is live), `epic.abandoned` |
| `waiting` (logged) | `epic.resumed`, `epic.abandoned` |
| `landing` | `epic.waiting`, `epic.landed`, `epic.abandoned` |
| `landed` | nothing (terminal) |
| `abandoned` | nothing (terminal) |

A second `epic.started` is always refused (one run per plan). A refused event, a torn last line,
or a bad slug (checked before any path is built) exits non-zero with a one-line reason and writes
nothing. `epic.landing`'s refusal names what is missing (`not every member has merged (a:
running, …)`, or `sync job <id> is live`). A job is **live** when it is neither `merged` nor
`abandoned`, as for `claim`.

### `epic.json` — the derived snapshot

A disposable projection, written to a temp file and renamed, over three inputs: the epic's log,
the plan **as it reads now** (so a member added to the plan mid-run appears at the next rebuild),
and every job whose `job.json` names the epic (`epic` equal to the slug). It is rebuilt after
every epic event, after every event on an epic job (`claim`, `event`, `abandon`; under the
epic's lock, taken after the job's is released; a failure there never fails the job's event),
by `rebuild`, and by `epic show`.

```json
{
  "schema": "factory/v1", "slug": "auth", "branch": "factory/epic/auth", "target": "main",
  "plan": "factory/epics/auth.md", "planError": null,
  "state": "running", "waitingOn": null, "note": "", "session": null, "sha": null,
  "members": [
    { "slug": "a", "after": [], "state": "merged", "job": "053-a", "stage": "merged", "blockedOn": [] },
    { "slug": "b", "after": ["a"], "state": "running", "job": "054-b", "stage": "review", "blockedOn": [] },
    { "slug": "c", "after": ["b"], "state": "blocked", "job": null, "stage": null,
      "blockedOn": [{ "member": "b", "job": "054-b" }] }
  ],
  "generated": [{ "id": "055-sync-main", "kind": "sync", "stage": "merged" }],
  "counts": { "queued": 0, "blocked": 1, "running": 1, "merged": 1, "needs-human": 0, "abandoned": 0 },
  "startedAt": "…", "endedAt": null, "updated": "…",
  "orchestrator": { "status": "exact", "input": 40, "output": 9100, "cacheWrite": 52000, "cacheRead": 880000, "spans": 1, "unknown": 0 }
}
```

- `state` — the logged state (`running`, `waiting`, `landing`, `landed`, `abandoned`), except
  that a `running` or `landing` epic is `waiting` when nothing can run (no member can be claimed
  and it can't land), no epic job is in a working stage, and some epic job (a member, or a
  generated sync or fix job) is in `needs-human`.
- `waitingOn` — `"you"` when the state is a logged `epic.waiting` (then `note` is its reason),
  `"members"` when the waiting is derived, `null` otherwise.
- `members` — every plan member, in plan order. A member's `job` is its newest job (the highest
  id among the epic's `member` jobs whose `brief` is `factory/briefs/<m>.md`), and its `state`
  comes from that job's stage: `running` (with the working `stage`), `needs-human`, `merged`, or
  `abandoned`. A member with no job is `queued` when every `after:` member has merged, else
  `blocked`, with `blockedOn` naming each unmerged `after:` member and its job id (`null` when it
  has none). An abandoned member blocks its dependents.
- `generated` — the epic's sync and fix jobs, in id order, with their stage.
- `counts` — the members by state.
- `planError` — why the plan couldn't be read or parsed in full (missing, or its first parse
  error), else `null`; the members that did parse still count.
- `session` — the latest `session` on `epic.started` or `epic.resumed`, else `null`. `sha` —
  the `epic.landed` sha, else `null`.
- `startedAt` — `epic.started`'s `ts`; `endedAt` — the `epic.landed` or `epic.abandoned` `ts`,
  else `null`; `updated` — the latest of the epic log's last `ts` and its jobs' `updated`.
- `orchestrator` — the epic's orchestrator spend: one total (the shape of `job.json`'s `usage`
  totals) over its stretches, each from its ending event's `orchestrator` (not recorded when an
  end carries none, on a log written before usage). Snapshots written by the CLI always carry it;
  readers treat a missing key as not recorded. *(Added within v1, additively.)*

### Scheduling

`epic next <slug>` prints one action per line, and only while the epic's logged state is
`running`: `claim <member>` for each `queued` member (no job, every `after:` member merged), in
plan order, while the members in a working stage plus those already printed stay under
`epic.maxParallel` and no sync job is live; or `land` when every member has merged and no sync or
fix job is live; nothing otherwise (`epic show` says why). An abandoned member is never offered
again.

`claim <slug> epic=<e> …` enforces the same plan (see "CLI"). The cap counts working members
only (a member in `needs-human` holds no slot); sync and fix jobs bypass it, but while a sync job
is live no member is claimed.

## CLI

```
bun factory/cli.ts claim <slug> [brief=…] [issue=…] [maxRound=…] [session=t3code:<environmentId>/<threadId>] [epic=<slug> [kind=member|sync|fix]]  # create a job; prints its id
bun factory/cli.ts event <id> <type> [field=value …]   # validate, append, rebuild job.json
bun factory/cli.ts rebuild <id> | --all                # regenerate job.json (and epic.json) from the logs
bun factory/cli.ts show <id>                           # human-readable timing and token usage summary
bun factory/cli.ts abandon <id> "<reason>" [--force] [--delete-branch]  # close a job for good
bun factory/cli.ts archive <id> | --all [--force]      # copy terminal jobs to the factory/archive branch
bun factory/cli.ts prune                               # remove local job dirs already archived and settled
bun factory/cli.ts doctor                              # validate config.json, verify managed hashes, note duplicate job numbers, check epic plans
bun factory/cli.ts epic start <slug> [session=…]       # set up an epic: branch, worktree, epic.started
bun factory/cli.ts epic event <slug> <type> [field=value …]  # validate, append, rebuild epic.json
bun factory/cli.ts epic next <slug>                    # what the epic should do now
bun factory/cli.ts epic show <slug>                    # the epic's state, its members, and why it waits
bun factory/cli.ts epic abandon <slug> "<reason>" [--force] [--delete-branch]  # close an epic for good
factory init [--force]                                 # (source or release bundle) install the managed core
factory upgrade [--force] [--commit]                   # (source or release bundle) replace the managed core (and commit exactly that)
factory projects                                       # (source or release bundle) list the Andon registry's roots and their state
factory projects prune [--dry-run]                     # (source or release bundle) unregister the dead roots
factory projects remove <path>                         # (source or release bundle) unregister one root
factory peers list                                     # (source or release bundle) list the Andon peers this machine's service follows
factory peers add <machine|url>                        # (source or release bundle) check a peer's Andon service and list it
factory peers remove <machine|url>                     # (source or release bundle) unlist a peer
factory service install                                # (source or release bundle) make the Andon service a per-user OS service and start it
factory service install --tailnet                      # (source or release bundle) the same, and publish it on the tailnet with tailscale serve
factory service uninstall                              # (source or release bundle) stop and disable it and remove the unit
factory service start                                  # (source or release bundle) start it (launchctl / systemctl --user)
factory service stop                                   # (source or release bundle) stop it
factory service restart                                # (source or release bundle) restart it
factory service status                                 # (source or release bundle) installed, running, URL, releases, logs
factory service run                                    # (source or release bundle) run the Andon service in the foreground
factory --version                                      # (source or release bundle) print the release and how it runs
```

Alias: `bun run factory:event …` for `event`. Value parsing is fixed, not guessed: `round`, `maxRound`,
and `k` are integers (anything else is an error); `reviewers` is a JSON array; the literal `null`
is `null`; every other value stays a string (so `sha=3e45678` and `title=404` are never coerced; `session` stays a string until its own check parses it). The CLI fills `job.claimed`'s `id`/`schema`/`target`
(and `maxRound` when omitted) and `round.started`'s `reviewers` when omitted from `config.json`. Exit 0 and print the new stage on success;
exit non-zero with a one-line reason on rejection. `event <id> job.claimed …` is always rejected,
with a one-line reason naming `claim`, and writes nothing: a job is created only by `claim`.

`claim <slug> [brief=…] [issue=…] [maxRound=…] [session=…]` is the only way to create a job. It takes a slug,
never a full id (there is no override). In order, it: checks the slug (see "File layout") and the
fields (`brief`, `issue`, `maxRound`, `session` only, `session` checked as "Session" in
"`events.jsonl`" says; a caller-supplied `target`, `id`, or anything else is
an extra field); resolves `target` from `merge.target` with git (see "`events.jsonl`"); then,
holding `jobs/.claim.lock`, scans the job dirs, refuses the slug when a **live** job already has
it, reads the `factory/archive` branch's job ids when the branch exists (one `git ls-tree`, under the
same lock; a git failure here refuses the claim), picks the next number (the highest among both
+ 1; refused once `999` is taken), and appends `job.claimed`
for `<NNN>-<slug>` through the per-job path (so `jobs/<id>/.events.lock` nests inside
`.claim.lock`), which creates the dir, `events.jsonl`, and `job.json`. A job is live when its
dir has a readable `job.json` whose `stage` is neither `merged` nor `abandoned`; a dir with no
readable `job.json` (legacy) is not live. A live slug is refused with
`slug <slug> is live as <id>`; after that job is `merged` or `abandoned`, the same slug is
claimed again under a new number. On success `claim` exits 0 and prints only the full id
(e.g. `005-week-view-pager`) on stdout: the dir's name and the log's `id`. Every refusal (a bad
or missing slug, a bad field, a refused target, a live slug, no numbers left) exits 1 with one
stderr line and writes nothing: no job dir, no `events.jsonl`, no `job.json`. The slug, field,
and target checks run before the lock is taken, so they also leave no `.claim.lock` and use up
no number. A missing slug prints `usage: claim <slug> [brief=…] [issue=…] [maxRound=…] [session=t3code:<environmentId>/<threadId>] [epic=<slug> [kind=member|sync|fix]]`.

**Claiming into an epic.** `claim <slug> epic=<e> [kind=member|sync|fix] [brief=…]` claims a job
into epic `<e>` (see "Epics"), recording `epic` and `kind` on `job.claimed` (`kind` defaults to
`member`). Before any lock, with the slug and field checks, it refuses: `kind` without `epic`
(`job.claimed: kind=<k> needs epic=<slug>`); an `epic` that isn't an epic slug; a member claim
without `brief=`; a `brief=` on a sync or fix job (`job.claimed: a <kind> job takes no brief=`);
and a caller-supplied `target` (an extra field, as always). Instead of resolving `merge.target`,
it sets `target` to `factory/epic/<e>`: the epic must have a log (`epic <e> has not started (no
epic.started)`) and
the branch must exist (`epic <e>: no branch refs/heads/factory/epic/<e>`). Then, holding
`jobs/.claim.lock` and, nested in it, the epic's `.events.lock`, after the live-slug check and
the number pick, it refuses: an epic whose log has no `epic.started`, or is `landed` or
`abandoned`, or is torn; for a member, a `brief` that isn't `factory/briefs/<m>.md` for a member
`<m>` listed in the plan's `## Members`, a member whose `after:` members haven't all merged, a
member that already has a job that isn't abandoned, a member claim while a sync job is live, and
a member claim when the members in a working stage are already at `epic.maxParallel`. When
`maxRound=` is omitted, the plan's `maxRound` for that member applies, if it has one, else
`config.maxRound`. It appends `job.claimed` and rewrites `epic.json` before releasing the epic's
lock, so two concurrent claims can't both pass the cap or both claim one member (a failed
`epic.json` rewrite after the append never fails the claim: the job exists and its id is
printed). Every refusal
writes nothing and uses up no job number. A claim without `epic` behaves exactly as before.
*(Added within v1, additively: two new caller fields.)*
`event <id> job.reworked k=… maxRound=… [session=…]` and `event <id> job.human-approved [session=…]`
take the same `session=` argument with the same check; `session=` on any other event is refused as
an extra field, and nothing is written.

`show` treats `abandoned` like `merged`: its terminal stage span is never closed and is not
shown as running.

After the timing, `show` prints the job's **usage table** (once the job has an agent span or an
ended orchestrator stretch): a `usage` line, then a header (`role  key  round  model  input
output  cache write  cache read`) and one row per agent span with its role, key, round (`-` when
none), and model and four counts; a span without counts shows `unavailable: <reason>`, `not
recorded`, or `running` in the model column and `-` for the counts. Then a total row per stage
(`stage <stage>`), per round (`round <n>`), the `orchestrator` line (its total; `in epic <slug>
(epic show)` for a job in an epic; `no stretch ended yet`), and `job`. A total row's model
column is its summary: `= 1.2M` (the four counts summed, in short form) when exact, `≥ 1.2M, 1
span unknown` when partial (its counts printed as `≥ n`, a lower bound), `unavailable (n spans)`,
or `not recorded`. *(Added within v1, additively.)*

`rebuild <id>` regenerates the job's `job.json` and, when the job names an epic that still has a
local dir, that epic's `epic.json` (an epic dir already pruned is skipped; a corrupt epic log
fails the command after `job.json` is rewritten); `rebuild --all` regenerates every job's and then every epic's (each dir under
`jobs/epics/` named like an epic slug). It prints `rebuilt <n>: <ids>` as before and, when it
rebuilt any epic, a second line `rebuilt epics <n>: <slugs>`.

**Epic commands.** Each checks the epic slug before building any path or ref, and prints its own
usage line for its usage errors (`usage: epic start|event|next|show|abandon <slug> …` for a
missing or unknown subcommand).

- `epic start <slug> [session=…]` is all or nothing. In order, it: checks the slug and the fields
  (`session` only); checks the plan as "Epics" says (the same one-line reason `doctor` gives);
  resolves the target with `claim`'s rule (`merge.target`); reserves `jobs/epics/<slug>/` with an
  exclusive `mkdir` (refused when it exists: `epic <slug> has already started: one run per plan`);
  under the epic's lock, refuses an existing `factory/epic/<slug>` branch or
  `factory/.worktrees/epic-<slug>` path; runs `git worktree add -b factory/epic/<slug>
  factory/.worktrees/epic-<slug> <target>` in the repo root; logs `epic.started`; writes
  `epic.json`; and prints `running`. Any refusal exits 1 with one line and leaves no epic dir,
  branch, or worktree: a failure after the reservation removes the git state it created (a failed
  `worktree add` deletes the branch only when it points at the target's commit, so a branch made
  by someone else is never deleted) and the dir; a rollback that itself fails adds what it left
  behind to the line.
- `epic event <slug> <type> [field=value …]` appends `epic.waiting`, `epic.resumed`,
  `epic.landing`, or `epic.landed` with the transitions in "Epics", rewrites `epic.json`, and
  prints the new state (the projected one, so a derived `waiting` prints `waiting`). It uses
  `event`'s value parsing (so `sha=0123456` stays a string). `epic.started` and `epic.abandoned`
  are always refused, with one line naming `epic start` or `epic abandon`, and nothing written.
- `epic next <slug>` prints the actions in "Scheduling" (nothing when there are none) and writes
  nothing.
- `epic show <slug>` rewrites `epic.json` and prints it for humans: `epic <slug>  <state>
  <branch> -> <target>`; `waiting on you: <note>` or `waiting on members: …` naming the jobs in
  `needs-human`; the note of a terminal epic; any `plan: <planError>`; the epic's orchestrator
  spend, `orchestrator usage: <total>` (`= 1.2M  (input …, output …, cache write …, cache read
  …)`, a partial total as `≥ 1.2M, 1 stretch unknown  (input ≥ …)`, or `unavailable (n
  stretches)`, `not recorded`, or `no stretch ended yet`; added within v1, additively); one `member <m>  <state>
  [<job>] [<stage>] [blocked on <m> (<job>), …]` line per member; one `<kind> <id>  <stage>` line
  per generated job.
- `epic abandon <slug> "<reason>" [--force] [--delete-branch]` closes an epic for good. Under the
  epic's lock it refuses, writing nothing, while any epic job is in a working stage and `--force`
  isn't given (one line naming them), and on an epic that is already terminal; else it logs
  `epic.abandoned`, which closes the epic to new claims. Then it abandons every epic job that
  isn't `merged` or `abandoned` as `abandon` does (passing force with `--force`; jobs in
  `needs-human` need none), with the reason `epic <slug> abandoned: <reason>`, keeping their
  branches; removes the epic worktree if it exists; and, with `--delete-branch`, deletes
  `factory/epic/<slug>`. It prints `abandoned`; a cleanup that fails exits 1 with one line naming
  what was left behind, while the epic stays `abandoned`. Missing arguments, an empty reason, or an
  unknown or repeated flag print `usage: epic abandon <slug> "<reason>" [--force] [--delete-branch]`.

*(Added within v1, additively: new commands.)*

`abandon <id> "<reason>" [--force] [--delete-branch]` closes a job without merging it. In order,
it: checks the job id (`^\d{3}-[a-z0-9-]+$`) before building any path; appends
`job.abandoned reason=<reason>` under the per-job lock, which runs the transition check (passing
force only with `--force`); in the repo root (the parent of `factory/`), runs
`git worktree remove --force factory/.worktrees/<id>` only if that worktree directory exists;
with `--delete-branch` only, runs `git branch -D <branch>`, where `<branch>` is the snapshot's
`branch` and must equal `factory/<id>` (a branch that no longer exists is not an error); and
prints `abandoned`. Without `--delete-branch` the branch is kept. The event is logged before
cleanup, the same rule as `job.merged`, so git and the board can't disagree about whether the
job is closed: a rejected event exits 1 and touches neither git nor the job, and a cleanup that
fails exits 1 with one line naming what was left behind, while the job stays `abandoned`. A
missing id or reason, an empty reason, an unknown or repeated flag, or an extra argument exits 1
with `usage: abandon <id> "<reason>" [--force] [--delete-branch]`, and nothing is written.
`abandon` never stops a running agent session; the skill asks the user to confirm the session
is stopped before it passes `--force`. *(Added within v1, additively: a new command.)*

`archive <id> | --all [--force]` copies a finished job's record to the `factory/archive` branch (see
"Job archive"). In order, it: checks the arguments (`<id>` or `--all`, and `--force` at most
once, in any order; anything else exits 1 with `usage: archive <id> | --all [--force]`); refuses
when archiving is off (no `archive` key, or `"enabled": false`), with one line saying archiving
is disabled; checks the job id (`^\d{3}-[a-z0-9-]+$`) before building any path or ref; and
refuses a job whose stage (projected from `events.jsonl`, or read from `job.json` for a legacy
job) is anything but `merged` or `abandoned`, including `needs-human`, with
`<id> is <stage>: only merged or abandoned jobs are archived`. It also refuses, each with one
line naming the job: a `jobs/<id>` that is missing (`<id>: no such job`) or is a symlink (never
followed); a legacy dir (no `events.jsonl`) with no readable `job.json`; an `events.jsonl` that
is empty or does not start with `job.claimed`; a `merged` job whose `job.merged` `sha` is not a
hex commit id (`^[0-9a-f]{4,64}$`; v1 accepts any string there, but the archive puts it in a
commit trailer); a job dir with no files to copy; and a branch whose `<id>` entry is not a
directory. It then compares the job with the branch tip:
- `<id>/` is not on the branch: one new commit adds it, and the CLI prints
  `archived <id> <short sha>`.
- `<id>/` holds a **different job**: refused, with or without `--force`, in one line naming both
  (`… already holds a different job at <id>/ (archived: …; local: …); nothing written`). A job
  is the same when the `job.claimed` event's `id` and `ts` in the branch's `<id>/events.jsonl`
  equal the local log's; for a legacy job (no `events.jsonl`), when the trees are equal.
- `<id>/` holds the same job, and the tree built from the local dir equals it: exit 0, no
  commit, and `<id>: already archived (unchanged)`.
- `<id>/` holds the same job with a different tree: refused without `--force` (one line naming
  `--force`); with `--force`, a new commit replaces `<id>/`, its parent the old tip, so history
  keeps both.

An argument that is not a job id but is an epic slug (see "File layout") names an **epic**: `archive
<slug> [--force]` copies a `landed` or `abandoned` epic to the branch under `epics/<slug>/` (see
"Job archive"), with the same rules: a non-terminal epic is refused with `epic <slug> is <state>:
only landed or abandoned epics are archived`; the plan, `factory/epics/<slug>.md`, must exist as a
regular file (`epic <slug>: plan factory/epics/<slug>.md is missing; not archived`); a `landed`
epic's `sha` must be a hex commit id; `epics/<slug>/` holding a different epic (compared by the
`epic.started` event's `slug` and `ts`) is refused with or without `--force`; unchanged is a
no-op (`epic <slug>: already archived (unchanged)`); changed needs `--force`; and it prints
`archived epic <slug> <short sha>`. An unknown slug is `epic <slug>: no such epic`; an argument
that is neither is refused as a bad job id.

`--all` runs that for every local job dir named like a job id, in id order, and then for every
local epic dir under `jobs/epics/`, in slug order: jobs that are not `merged` or `abandoned`, and
epics that are not `landed` or `abandoned`, are skipped, unchanged ones are no-ops, and each
archived job or epic gets its own commit and its `archived <id> <short sha>` (or `archived epic
<slug> <short sha>`) line. A per-job or per-epic failure is one stderr line and the rest still
run. It ends with
`archive --all: archived <n>, unchanged <n>, skipped <n> (not merged or abandoned), failed <n>`
(epics counted in the same totals) and exits 1 when any failed. Every refusal exits 1, moves no ref, and writes no git object
(the comparison builds its tree in a scratch object directory). A write that fails after it has
started (a lost compare-and-swap race, giving up after 50 tries, or any other `update-ref`
failure) is not a refusal: it moves no ref, but it may leave unreachable objects, which `git gc`
removes. `archive` reads only the local
`factory/archive` branch: it never fetches, never pushes, and never touches the main checkout's
working tree, index, or `HEAD`. The CLI never archives on its own: `event` and `abandon` have
no archive side effects; the skill runs `archive` after `job.merged` and after `abandon`.
*(Added within v1, additively: a new command.)*

`prune` removes the local `jobs/<id>/` dirs whose record is already on the `factory/archive`
branch, and nothing else. In order, it: checks the arguments (it takes none; any argument exits 1
with `usage: prune` and removes nothing); refuses when archiving is off (no `archive` key, or
`"enabled": false`), with one line saying archiving is disabled, before any job dir or git ref is
read; reads the branch tip once; then sweeps every local job dir named like a job id, in id order
(a symlinked `jobs/<id>` is never listed or followed), as `archive --all` does. A job dir is
removed only when all of these hold, checked in this order:
- no top-level `.events.lock` dir is present (an event in flight);
- it reads as `archive` reads it (a refusal, such as a legacy dir with no readable `job.json` or
  an `events.jsonl` that does not start with `job.claimed`, keeps it, with that refusal's text);
- its stage is `merged` or `abandoned`;
- it is *settled* by the existing rule (`job.json`'s `endedAt`): `abandoned` at once, `merged`
  when `endedAt` is older than `dashboard.settleAfterHours` by the system clock. The stage and
  `endedAt` come from `events.jsonl`; a legacy job (no `events.jsonl`) uses its `job.json`'s, and
  a merged one with no readable `endedAt` is not settled;
- `<id>/` is on the branch tip, as a directory;
- the tree built from the local dir, with exactly the file set `archive` copies (see "Job
  archive": not `job.json`, `job.json.tmp`, or top-level `*.lock` dirs; a legacy job keeps its
  `job.json`), equals the archived `<id>/` tree byte for byte. An equal tree also means the same
  job. The comparison builds its tree in a scratch object directory, under the job's
  `.events.lock` (taken without waiting; a held lock keeps the job), so no event lands between
  the comparison and the removal.

A job with an `epic` is judged by the epic-aware settle rule (see "`config.json`",
`dashboard.settleAfterHours`): after the stage check, its epic's state and `endedAt` are read from
the local `jobs/epics/<slug>/` (or, once the epic dir is pruned, from `epics/<slug>/events.jsonl`
on the branch tip), and while the epic isn't `landed` or `abandoned` the job is kept, with the
reason `its epic <slug> is not landed or abandoned (<state>)` (or `its epic <slug> is not found`),
even when it is merged, archived, and past the window. This keep-while-the-epic-is-live guard is
stricter than the view rule: it keeps every job in a live (or unknown) epic, abandoned members
included, though the epic-aware settle rule settles an abandoned job at once. Once the epic is
terminal, an abandoned job settles at once and a merged job settles when its epic does.

After the jobs, `prune` sweeps every local epic dir under `jobs/epics/` (named like an epic slug),
in slug order, the same way: an epic dir is removed only when no `.events.lock` is present, its
log reads (`events.jsonl` starting with `epic.started`), it is `landed` or `abandoned`, it is
settled (an `abandoned` epic at once; a `landed` one when its `endedAt` is more than
`settleAfterHours` old), `epics/<slug>/` is on the branch tip, and the tree of its archived file
set (its `events.jsonl` and the current plan as `plan.md`) equals that tree byte for byte, compared
under the epic's `.events.lock`. Its line is `pruned epic <slug>` or `kept epic <slug>: <reason>`
(the reasons as for jobs, with `not landed or abandoned (<state>)`). The plan file is never
removed.

It prints one stdout line per job: `pruned <id>`, or `kept <id>: <reason>`, where the reason is
`an event is in flight (.events.lock)`, the read refusal's text, `not merged or abandoned
(<stage>)`, the epic reason above, `not settled`, `not archived`, or `differs from its archived
tree`; then one line per epic. It ends with
`prune: removed <n>, kept <n>, failed <n>` (jobs and epics counted together). A kept job is not a failure and is left byte for
byte. A job that can't be checked or removed (a git error, a read or `rm` error) is one stderr
line naming it and counts as failed; the rest still run. It exits 1 when any job failed (or when
the branch tip can't be read, before any job is checked), else 0. Removal never follows a symlink
inside the dir. `prune` reads only the local `factory/archive` branch: it writes no git object,
moves no ref, never fetches or pushes, and never touches the main checkout's working tree, index,
or `HEAD`, worktrees, branches, or `jobs/.claim.lock`. The removed job dirs are the only thing it
changes. A pruned job keeps its number (`claim` counts the branch's ids, see "File layout") and
stays on the board (see "Archived jobs" under "Andon service"). The CLI never prunes on its own,
and the skill never runs `prune`: it is a maintainer's manual step.
*(Added within v1, additively: a new command.)*

`doctor` writes nothing. It runs every check and reports every finding, one line per check
(`ok`, `FAIL`, or `note`), rather than stopping at the first:

1. `config.json` is parsed with the same strict rules as above. A missing file, invalid JSON, or
   a rule violation (unknown key, reserved reviewer key, …) is a failure. Unlike the other
   commands, a bad `config.json` is a reported finding, not a rejection before the command runs.
2. If `managed.json` exists, it must be well-formed (see "Managed files"), and each listed file
   must exist with a matching SHA-256. A malformed manifest, a missing file, or a changed file is
   a failure, and each is reported by its path. No manifest is a `note` (unstamped install).
3. Each job number held by more than one job dir (directories under `jobs/` named like a job id)
   is a `note`, never a failure, one line per number in number order, with the dirs sorted:
   `note: job number 005 is used by 005-links-footer, 005-week-view-pager`.
4. Each plan `factory/epics/*.md`, in name order, by the one plan parser (see "Epics"): a plan
   that is `ready`, or has no readable status, and that `epic start` would refuse on plan grounds
   is a failure with the same one-line reason (`FAIL  factory/epics/<slug>.md: <reason>`), as is a
   `ready` plan whose name isn't an epic slug; a sound one is `ok    factory/epics/<slug>.md`. A
   `draft` plan's parse errors are each a `note` (`note  factory/epics/<slug>.md: <error>`),
   never a failure (`ok    factory/epics/<slug>.md (draft)` when it has none). `done` and
   `abandoned` plans are skipped. A plan that isn't a regular file (a symlink) is a failure and is
   never read. *(Added within v1, additively.)*

`doctor` exits 0 when nothing failed and 1 otherwise.

The CLI's source is `packages/cli` (entry `src/main.ts`, linked onto the PATH as `factory` by
`bun link` in `packages/cli`; the release bundle's entry is `src/release-main.ts`; run from the
repo root, either finds the factory at `<cwd>/factory`).
An installed copy that predates `doctor` gains it when the CLI is promoted.

The installed `factory/cli.ts` is a single self-contained file (the source CLI bundled with its
contract code), so it runs with `bun` alone, with no workspace packages or `node_modules`. It
finds its factory root from its own location (its directory), and keeps the same commands
(`claim`, `event`, `rebuild`, `show`, `abandon`, `archive`, `prune`, `doctor`, `epic`), value parsing, per-command usage lines, and exit codes as
the source. The top-level usage line (printed for a missing or unknown command) differs: the
installed CLI prints
`usage: claim <slug> [k=v …] | event <id> <type> [k=v …] | rebuild <id>|--all | show <id>`, and the source CLI (and the
release bundle's) prints that line followed by ` | doctor | init [--force] | upgrade [--force] [--commit] | --version`. Neither line lists
`abandon`, `archive`, `prune`, or `epic`; each prints its own usage line for its usage errors. An
installed copy that predates `abandon`, `archive`, `prune`, `claim`, or `epic` gains it when the
CLI is promoted.
The same source always bundles to the same bytes. It does not offer `init`, `upgrade`,
`projects`, or `--version`: `init` and `upgrade` run from the global `factory` command against
a project, with the project root as the cwd, and `projects` works on the machine's Andon
registry, not on a project.

The global `factory` command runs from one of two places, with the same commands, usage lines,
and exit codes:

- **source**: a clone's source CLI (`packages/cli/src/main.ts`), linked with `bun run cli:link`.
  `init` and `upgrade` bundle the installed CLI with `bun build` and read `docs/contract/v1.md`
  from that clone.
- **the release bundle**: the self-contained tree on this repo's `release` branch (built by
  `bun run release`; installed with `bun add -g github:mattmccray/factory#release`), which needs
  only `bun`. The stamped installed CLI and contract are built into it, so `init` and `upgrade`
  run with no source tree, no `bun build`, and no read of `docs/contract/v1.md`.

For the same version both install the same bytes: every managed file and `managed.json` are
byte-identical. `factory --version` takes no arguments (any argument is a usage error,
`usage: --version`, exit 1), reads no config, prints one line, and exits 0: `factory <version> (source: <clone path>)` from source, where `<clone path>` is that
checkout's root, or `factory <version> (release)` from the release bundle. `<version>` is
`@factory/templates`' version, the one the stamps carry.

### `projects`

`factory projects` (from the global `factory` command, source or release bundle) works on the machine's Andon registry (see "Andon registry"),
`$ANDON_HOME/projects.json`. It needs no `factory/` directory in the cwd, and `init` stays the
only way to add a root. Each root has a state: `ok`, `missing` (the path doesn't exist), or
`not a factory project` (the path exists but has no `factory/` directory). The dead states are
`missing` and `not a factory project`.

- `factory projects` prints one stdout line per root, in registry order: `<state>  <root>`. It
  writes nothing.
- `factory projects prune` removes each dead root and prints `removed <root> (<state>)`, in
  registry order. `--dry-run` prints `would remove <root> (<state>)` for the same roots and writes
  nothing. With no dead root, it prints `nothing to prune`.
- `factory projects remove <path>` removes that one root whatever its state and prints
  `removed <root>`. A relative `<path>` is resolved against the cwd and normalized (no symlinks
  resolved, so a missing path can still be removed). A path not listed prints
  `not registered: <root>` and writes nothing.

A root is on a removable volume when it is under `/Volumes/<name>` (macOS), or under `/media/…`,
`/run/media/…`, or `/mnt/<name>` (Linux). Its volume is unmounted when no directory between that
prefix and the root (the root included) is a mount point: a directory that exists and whose device
id differs from its parent's. `factory projects` lists such a root's state (normally `missing`)
followed by `  (volume not mounted)`. `prune` and `prune --dry-run` keep a dead root on an
unmounted volume and print `skipped <root>: volume not mounted` instead. A dead root on a mounted
volume is pruned as usual.

With a missing or empty registry, `factory projects` and `prune` print `no projects registered`
and create or write no file. Every root is checked before anything is written; each removal is
one registry write (temp file plus rename). Exit 0 on success. A usage error prints
`usage: projects [prune [--dry-run] | remove <path>]`, and an unreadable or invalid registry its
one-line reason; each exits 1 and writes nothing.

### `peers`

`factory peers add <machine|url> | remove <machine|url> | list` (from the global `factory`
command, source or release bundle) works on the machine's Andon peers file (see "Andon peers"),
`$ANDON_HOME/peers.json`, the other machines' Andon services this machine's service follows. It
is the file's only writer. Listing a peer makes its data readable through this machine's service
(see "Andon service", "Peers", *Exposure*). Like `projects`, it needs no `factory/` directory in the cwd and reads
no config; no command runs `sudo`. *(Added within v1, additively: a new command.)*

- `factory peers list` prints one stdout line per peer, its URL, in file order, or `no peers`
  when there is none (a missing or empty file). It writes nothing.
- `factory peers add <machine>` resolves a short machine name (letters, digits, and `-`,
  matched case-insensitively, as `remove <machine>` matches it) through `tailscale status --json` (the `tailscale` CLI found as `service install --tailnet`
  finds it): the first `Peer[*].DNSName`, its trailing dot stripped and lowercased, whose first
  label is the name. The peer's URL is then `https://<DNSName>:8766` (the default service port);
  any other port is given as a URL. `factory peers add <url>` takes the URL itself, normalized
  (see "Andon peers"). Before it writes, it checks that the peer answers `GET /machines` and
  `GET /projects?scope=local` in this version's shapes (see "Andon service"), reaching it only at
  that URL, following no redirect, with about 10 s for each answer. It then adds the entry (temp
  file plus rename) and prints `added <name> <url>`, where `<name>` is the machine name the peer
  reports (the first entry of its `GET /machines`). Adding a URL that is already listed prints
  `already listed: <url>`, writes nothing, and exits 0.
- `add` refuses, printing one stderr line naming the cause, exit 1, leaving `peers.json` as it
  was, when: there is no `tailscale` CLI, or `tailscale status --json` fails or names no tailnet
  peer by that name; the argument is neither a machine name nor an `https:` URL, or the URL is
  `http:` or otherwise not an `https:` origin; the peer is unreachable, or answers with a redirect
  (never followed); the peer's answer isn't JSON in the expected shape (not an Andon service); the
  peer is from before peers (its `GET /machines` is a 404, or its `scope=local` projects carry no
  `machine` or an id with `@`), in which case the line names `factory upgrade` and
  `factory service restart` on that machine; or the name it reports is this machine's own name
  (the first label of the unit's recorded `ANDON_TAILNET_HOST`, else of the OS hostname,
  sanitized as in "Andon service"), or the name an already-listed peer that answers reports.
- `factory peers remove <url>` unlists the peer at that URL (normalized before matching), and
  `factory peers remove <machine>` the peer whose URL's host has that first label; each prints
  `removed <url>`. An argument that matches no listed peer prints `not listed: <arg>`, exits 1, and
  writes nothing; a machine name that matches more than one URL exits 1 naming them, and writes
  nothing.

A usage error prints `usage: peers add <machine|url> | remove <machine|url> | list` and exits 1.
An unreadable or invalid `peers.json` makes every subcommand print its one-line `peers:` reason
and exit 1, writing nothing. Every refusal is one stderr line, exit 1, and writes nothing.

### `service`

`factory service install [--tailnet] | uninstall | start | stop | restart | status | run` (from
the global `factory` command, source or release bundle) runs the machine's Andon service (see "Andon
service") as a per-user OS service, owned by the OS service manager only: on macOS a launchd
LaunchAgent, label `dev.factory.andon`, at `~/Library/LaunchAgents/dev.factory.andon.plist`,
in the `gui/<uid>` domain; on Linux a systemd `--user` unit, `andon.service`, at
`$XDG_CONFIG_HOME/systemd/user/andon.service` (default `~/.config/systemd/user/`). Like
`projects`, it needs no `factory/` directory in the cwd and reads no config. No command runs
`sudo`.

- `install` writes the unit, enables it, and starts it. The unit runs `<bun> <factory> service
  run`, where `<factory>` is the absolute, unresolved path of the `factory` that ran `install`
  and `<bun>` the absolute path of the `bun` that ran it; the unit's `PATH` starts with that
  `bun`'s directory. It sets `RunAtLoad` and `KeepAlive` (launchd) or `Restart=always` and
  `WantedBy=default.target` (systemd), so the service starts at login and restarts after a
  crash. `ANDON_PORT` and `ANDON_HOME` are recorded in the unit exactly when they are set at
  `install`. launchd logs the service's stdout and stderr to `~/.andon/service.log`; on Linux
  they go to the journal. On macOS it bootstraps the agent in `gui/<uid>` and kickstarts it; on
  Linux it runs `systemctl --user daemon-reload` and `enable --now andon.service`. Run again, it
  rewrites the unit and restarts the service (`bootout` before the `bootstrap`; or `restart`).
  On Linux it then reads lingering (`loginctl show-user <uid> --property=Linger --value`) and,
  when it is off, prints one hint line naming `loginctl enable-linger`; it never changes
  lingering. It refuses, writing no unit and running no command that changes anything, when
  `127.0.0.1:<port>` is held by a process that isn't the installed unit's service (the line names
  that pid and the port), when `ANDON_PORT` isn't a port number from 1 to 65535, when
  `ANDON_HOME` isn't an absolute path or contains a newline or NUL, or when the `factory` path,
  the `bun` path, or the home directory isn't absolute or contains a newline or NUL (the line
  names which one).
- `install --tailnet` also makes the service readable from the user's other machines over
  their tailnet, through `tailscale serve`; the service itself stays on `127.0.0.1`. After the
  refusals above (which come first and run no `tailscale` command), it finds the `tailscale` CLI
  (`tailscale` on `PATH`, else on macOS `/Applications/Tailscale.app/Contents/MacOS/Tailscale`)
  and reads `tailscale status --json`: the machine's name is `Self.DNSName`, its trailing dot
  stripped and lowercased (e.g. `studio.manticore-hue.ts.net`). It then runs
  `tailscale serve --bg --https=<port> http://127.0.0.1:<port>`, where `<port>` is the service
  port, before it writes the unit, and records the name in the unit as `ANDON_TAILNET_HOST`
  beside `ANDON_PORT`. It prints the tailnet URL, `tailnet: https://<name>:<port>/`. When a unit
  step fails after `tailscale serve` succeeded, it runs `tailscale serve --https=<port> off`
  (unless that entry was there before) and puts the previous unit file back, so a recorded name
  and its serve entry never part. Over a unit that records a tailnet host on another port, it
  removes that port's entry after the new unit is running. It refuses with one stderr line,
  exit 1, writing no unit and leaving no serve entry, when there is no `tailscale` CLI, when
  Tailscale is not running or logged out (`BackendState` is not `Running`), when there is no
  MagicDNS name, when HTTPS certificates are not enabled on the tailnet (`CertDomains` lacks the
  name), or when `tailscale serve` fails; on Linux, when `tailscale serve` is denied for want of
  an operator, the line is the one-time `sudo tailscale set --operator=$USER` instruction, which
  the CLI never runs. Only the `--https=<port>` serve entry is ever changed; other serve entries
  (443, for example) are left alone. Whether an entry exists is read from
  `tailscale serve status --json`. Tailscale ACLs, and running `tailscale up` or `tailscale set`,
  are the user's.
- `install` without `--tailnet` records no `ANDON_TAILNET_HOST`, so it turns tailnet access off:
  when the unit it replaces records one, it first removes that unit's `--https=<port>` serve entry
  (`tailscale serve --https=<port> off`, run only when `tailscale serve status --json` shows it),
  and prints `tailnet: off`; when that fails, it exits 1 with one line and keeps the unit. When
  the unit records no tailnet host, it runs no `tailscale` command and the unit is as before.
- `uninstall` stops and disables the service and removes the unit file. When the unit records a
  tailnet host, it first removes that unit's `--https=<port>` serve entry (as `install` without
  `--tailnet` does); when that fails, it exits 1 with one line and keeps the unit. The registry
  (`$ANDON_HOME/projects.json`) and the rest of `~/.andon/` are left untouched. With nothing
  installed it prints `not installed: <unit>` and exits 0.
- `start`, `stop`, and `restart` pass through to the service manager: `systemctl --user
  start|stop|restart andon.service` on Linux; on macOS `start` bootstraps an unloaded agent (or
  kickstarts a loaded one), `stop` boots it out (it comes back at the next login or `start`), and
  `restart` runs `kickstart -k`. With no unit installed, each exits 1 naming `factory service
  install`. `restart` is the answer to Andon's "Restart service".
- `status` prints five lines (six when the unit records a tailnet host): the service manager, unit, and whether it is installed; whether it
  is running, with the pid the service manager reports; the URL
  (`http://127.0.0.1:<port>/`, the port the unit records, else `$ANDON_PORT`, else 8766); when
  the unit records a tailnet host, the tailnet URL right after it,
  `tailnet: https://<name>:<port>/`; the running against the on-disk release, from the service's `GET /release` (with
  `restart needed (factory service restart)` when they differ); and where the logs are
  (`~/.andon/service.log`, or `journalctl --user -u andon.service`). It exits 0 only when the
  service manager reports a pid and the service answers; else 1.
- `run` runs the Andon service in the foreground for this CLI's own tree, through the service's
  one entry: from source, the clone's `apps/andon-ui/dist` and release; from the release bundle,
  its `andon/ui/` and release. It is what the unit runs.

On any platform other than macOS and Linux, or on Linux with no systemd `--user` manager, every
subcommand but `run` exits 1 with one line and writes and runs nothing. A usage error prints
`usage: service install [--tailnet]|uninstall|start|stop|restart|status|run` and exits 1;
`--tailnet` on any subcommand but `install`, or any other flag, is a usage error. Any other refusal,
or a service-manager command that fails, exits 1 with one stderr line.

### Job archive — the `factory/archive` branch

The archive is the orphan branch `factory/archive` (`refs/heads/factory/archive`) in the project's own
repo. It shares no history with any target branch, and it sits beside job branches
`refs/heads/factory/<id>` without a ref conflict, since job ids start with three digits. Its tip's
tree holds one top-level directory per archived job and, once an epic is archived, one `epics/`
directory, and nothing else:

```
<id>/                       # one per archived job, named by its job id
  events.jsonl              # the log — readers re-project job.json from it
  feature.md  rework-<k>.md  conflict-<c>.md  spec.md  build.md  decision.md
  round-<N>/review-<key>.md
  round-<N>/<key>/*         # reviewers' supporting files (e.g. screenshots), byte for byte
epics/<slug>/               # one per archived epic, named by its slug
  events.jsonl              # the epic's log — readers re-project epic.json from it
  plan.md                   # factory/epics/<slug>.md as it stood when archived
```

`epics/` is not named like a job id, so it never counts toward job numbers (`claim` reads only
the top-level directories named like a job id) and readers that list archived jobs skip it. An
archived epic holds exactly its `events.jsonl` and its plan, copied from
`factory/epics/<slug>.md` at archive time as `plan.md` (never `epic.json`, a projection, or the
lock dir); an epic whose plan is missing is not archived. Its commit message is
`chore(factory): archive epic <slug>`, a blank line, then the trailer `Factory-Epic: <slug>`,
followed, for a `landed` epic only, by `Landed-As: <sha>` (the last `epic.landed` sha, which the
archive requires to be a hex commit id). It is written with the same plumbing and the same
compare-and-swap as a job. *(Added within v1, additively.)*

`<id>/` is a copy of `jobs/<id>/` as it was when archived: every regular file, at any depth,
except `job.json` (a disposable projection), its write temp file `job.json.tmp`, and the job
dir's lock dirs (top-level directories named `*.lock`, such as `.events.lock`). A **legacy job**
(no `events.jsonl`) keeps its `job.json`, its only state. Symlinks are not followed or copied,
empty directories have no tree, and every file is stored as mode `100644`.

Each archived job is one commit, made with git plumbing (blobs and trees by `hash-object` and
`mktree`, then `commit-tree` with the current tip as the only parent, or no parent when the
branch is missing). Its message is `chore(factory): archive job <id>`, a blank line, then the
trailer `Factory-Job: <id>`, followed, for a `merged` job only, by `Merged-As: <sha>`: the
`sha` of the log's last `job.merged` event, which the archive requires to be a hex commit id (a
merged legacy job has no log, so no `Merged-As`). The ref
moves only by `git update-ref <ref> <new> <old>` with the tip it built on as the old value (a
compare-and-swap; the empty value when creating the branch); on a lost race it rereads the tip
and starts over, so concurrent archivers never lose each other's jobs. Writing the archive
never uses an index or a checkout. Pushing `factory/archive` is always a human decision.

### `init` and `upgrade`

The **managed files** are the Claude Code render of the skill and agents
(`.claude/skills/factory/{SKILL,explore}.md`, `.claude/agents/factory-<role>.md` for the fixed
roles and each configured reviewer key), the installed CLI `factory/cli.ts`, and the installed
contract `factory/CONTRACT.md`. Both commands plan every step before writing anything, so a
refusal writes nothing. They write each file to a temp file and rename it into place, and they
write `managed.json` last.

`init [--force]` installs the managed core into the project at the cwd:

- writes every managed file, then `factory/managed.json` listing exactly those files;
- if `factory/config.json` is absent, writes the default
  `{"schema":"factory/v1","reviewers":["code"],"maxRound":2,"dashboard":{"settleAfterHours":24}}`.
  An existing `config.json` is never rewritten, and it must parse with the strict rules above;
- appends any of `factory/jobs/`, `factory/.lock/`, `factory/.worktrees/` missing from the
  project's `.gitignore` (creating it if needed). A line already present, with or without a
  leading `/` or trailing `/`, is not added again.

- as its last step, after `managed.json` is written, registers the project's absolute root
  (symlinks resolved) in the Andon registry (see "Andon registry"). A root already listed is
  not added again. A registration failure (for example, an unwritable `ANDON_HOME` or an
  invalid registry file) does not fail `init`: it still exits 0 and prints one extra line,
  `note: not registered with Andon (<registry path>): <reason>`. A refused `init` registers
  nothing, and `upgrade` never registers.

`init` refuses when `factory/managed.json` exists (use `upgrade`), when a file with different
bytes already sits at a managed path (a file with the same bytes is fine), or when the existing
`config.json` is invalid.

`upgrade [--force] [--commit]` needs `factory/managed.json` and a valid `config.json`. It re-renders for
the current config, writes the managed files whose bytes changed, deletes the files the old
manifest lists that the new render does not (such as a reviewer removed from `reviewers`), and
rewrites `managed.json`. It refuses when there is no manifest (use `init`), when `managed.json`
is malformed (see "Managed files"), when a file the manifest lists is missing or no longer
matches its hash (a local edit), when a path the new render adds already holds a different,
unmanaged file, or when `config.json` is missing or invalid.

Neither command ever writes or deletes the overlay (`config.json`, `roles/**`) or other state
under `factory/` (`managed.json` aside): `backlog.md`, `briefs/`, `epics/`, `jobs/`, `.lock/`,
`.worktrees/`. Files nobody manages are left alone, and upgrade deletes only paths the old
manifest lists. Every path they write or delete must be a valid manifest path (see "Managed
files") and, after symlinks, still resolve inside the project, the same rule `doctor` uses. A
manifest path that breaks this, or that names (or resolves through a symlink to) the overlay,
runtime state, the tracked plans and briefs (`factory/epics/`, `factory/briefs/`), or `.git/`,
is refused.

`--force` overrides only the existing-file and edited-file refusals: `init --force` overwrites
files at managed paths (this is how an unstamped install is adopted), and `upgrade --force`
replaces edited or missing managed files and unmanaged files at new paths. It never overrides an
existing manifest on `init`, a missing manifest on `upgrade`, an invalid config, or a path
refusal.

`upgrade --commit` also commits the upgrade, as one git commit in the project's repo holding
exactly the paths upgrade wrote (new, untracked managed files included), the paths it deleted (a
path git never tracked is left out), and `factory/managed.json` when it was rewritten. The
message is `chore(factory): upgrade factory <old> -> <new>` (`<old>` from the previous
`managed.json`, `<new>` the CLI's version), with no trailer. It commits only those paths
(`git commit --only`), so every other staged and unstaged change keeps its state, and the overlay
and other state are never in it. Hooks run (they are never bypassed). Before anything is planned
or written, `--commit` refuses, writing nothing, when the project root is not inside a git work
tree, when HEAD is detached, or when a merge, rebase, cherry-pick, or revert is in progress; it
requires no particular branch and no clean tree. On success it prints the summary line, then
`committed <short sha>`, or `nothing to commit` when nothing changed (no commit is made). When the
commit fails after the writes (a hook rejects it, signing fails, no identity), the written files
stay as they are (no rollback; the install is consistent and has passed `doctor`), no commit is made,
and it exits 1 with one line naming the summary, git's first error line, and
`commit the upgraded files by hand`. Without `--commit`, upgrade runs no git command. `init`
takes no `--commit`.

After every upgrade that completes its writes (also one that wrote and removed nothing), `upgrade`
runs the installed doctor: `bun factory/cli.ts doctor` as a subprocess from the project root,
with the Bun running `factory`, so the freshly written `factory/cli.ts` itself is checked. It
prints its summary line, then doctor's lines as they print. Doctor fails on any `FAIL` line, a
non-zero exit, or a doctor that doesn't start; `note` lines never fail it. A failing doctor makes
`upgrade` exit 1 with no rollback (the written files and `managed.json` stay as they are), and
the last line (on stderr) names the summary and says doctor failed. With `--commit`, doctor runs
after the writes and before the commit; when doctor fails no commit is made, and the last line
adds `commit the upgraded files by hand once doctor passes`. A refused upgrade or a usage error
runs no doctor. `init` runs no doctor. *(Added within v1, additively: an upgrade that used to exit
0 next to a failing doctor now exits 1.)*

`init` takes only `--force`, and `upgrade` takes `--force` and `--commit`, in either order, each at
most once. Any other argument, or a repeated flag, is a usage error (`usage: init [--force]`,
`usage: upgrade [--force] [--commit]`).

Both exit 0 on success and print one summary line (plus, for `init`, the registration `note:`
line when registering fails; for `upgrade`, doctor's lines after the summary; and for
`upgrade --commit`, its commit line after those); on a refusal or usage error they exit 1 with
a one-line reason that names the offending paths. An `upgrade` whose doctor fails also exits 1:
the summary and doctor's lines on stdout, then the one doctor-failed line on stderr.

Concurrency: a job's log has exactly one writer at a time — the session driving that job (or,
in `needs-human`, whoever runs approve/rework). The CLI enforces it with a per-job lock,
`jobs/<id>/.events.lock` (an `mkdir`; considered stale after 30 s), held across read → check →
append → project → write. Job numbers are handed out under a second `mkdir` lock,
`jobs/.claim.lock` (the same 30 s stale rule; a fresh one is waited on), held by `claim` across
scan → pick → create dir → first event; the per-job `.events.lock` nests inside it. Only `claim`
takes it. An epic's log has its own `jobs/epics/<slug>/.events.lock` (the same rule), held across
read → check → append → project → write for epic events, by `claim … epic=` (nested inside
`.claim.lock`, around the epic's checks, the job's first event, and the `epic.json` rewrite), and
for every `epic.json` rewrite after a job event (taken after the job's lock is released). The only
nesting of the two is a claim's new job lock inside the epic's, so they never deadlock. Cross-job steps the CLI can't see (the orchestrator's overlap check and backlog tick
around a claim, and merges) stay under `factory/.lock` as before; an orchestrator holds
`factory/.lock` around its whole claim step, and `claim` never takes `factory/.lock`.

Log integrity: a log whose last line lacks `\n` (a torn write) is refused for appends as a corrupt
tail; an unparseable line is reported by its line number. Recovery is manual: a human truncates the
partial last line, then runs `bun factory/cli.ts rebuild <id>`; an orchestrator never edits the log.

## Dashboard endpoints

`GET /board` returns `{ jobs, config }` — every `job.json` plus the parsed `config.json`, read per
request. A bad `config.json` is a 500 carrying the reason, as is `GET /jobs/<id>/docs`.

## Andon registry

The machine registry lists the projects Andon watches. It is one file per machine,
`$ANDON_HOME/projects.json`, where `ANDON_HOME` defaults to `~/.andon`:

```json
{ "schema": "factory/v1", "projects": [{ "root": "/absolute/repo/root" }] }
```

`schema` must be `"factory/v1"`, and each `root` must be a normalized absolute path (no
trailing `/`, `.`, or `..` segment), listed at most once.
Unknown keys, at the top level or in a `projects` entry, are rejected with a one-line reason,
and nothing is written. A missing file is an empty registry. A write goes to a temp file beside
it and is renamed into place. Adding a root that is already listed, or removing one that is not,
changes nothing. `factory init` adds to it (see "`init` and `upgrade`"), and `factory projects
prune` and `factory projects remove` remove roots from it (see "`projects`"); a human may also edit
it by hand. Andon itself only reads it. The parse, add, and remove helpers are `packages/contract` (`registry.ts`).

## Andon peers

The peers file lists the other machines' Andon services this machine's service follows (see
"Andon service", "Peers"). It is one file per machine, `$ANDON_HOME/peers.json`, beside the
registry (`ANDON_HOME` defaults to `~/.andon`):

```json
{ "schema": "factory/v1", "peers": [{ "url": "https://studio.manticore-hue.ts.net:8766" }] }
```

`schema` must be `"factory/v1"`, and each `url` must be a normalized `https:` origin,
`https://<host>[:<port>]`, lowercase: an `https:` URL with a host and an optional port (the
default `443` dropped), with no user or password, no path other than `/`, no query, and no
fragment, listed at most once. Unknown keys, at the top level or in a `peers` entry, are rejected
with a one-line `peers:` reason, and nothing is written. A missing file is an empty list. It
copies the registry's other rules: a write goes to a temp file beside it and is renamed into
place, and adding a URL that is already listed, or removing one that is not, writes nothing.
`factory peers add` and `factory peers remove` are its only writers (see "`peers`"); a human may
also edit it by hand. The Andon service reads and watches it and never writes it, and Andon
never edits it. A peer is reached as `tailscale serve` publishes it,
`https://<machine>.<tailnet>.ts.net:<port>/` (see "`service`", `install --tailnet`). The parse,
read, add, and remove helpers, and the machine-name derivation, are `packages/contract`
(`peers.ts`). *(Added within v1, additively: a new file.)*

## Andon service

The Andon service is one Bun daemon per machine (`factory service run`, made a per-user OS
service by `factory service install`, see "`service`"; source `packages/andon-service`; in the
release bundle, `andon/service.js`, built from `src/release-main.ts`). The OS service manager is
its only owner: Andon, the Mac app, never starts or stops it. It listens on `127.0.0.1` only, on `$ANDON_PORT` (default 8766), and
reads the registry at `$ANDON_HOME/projects.json` and the peers file at `$ANDON_HOME/peers.json`
(see "Andon peers" and "Peers" below). It is a reader: it never writes job state, the registry, or
`peers.json`.
A request whose `Host` header is not `127.0.0.1:<port>` or `localhost:<port>`, or that carries an
`Origin` other than `http://` plus one of those, is a 403 (a guard against DNS rebinding).
When a tailnet host is recorded (`$ANDON_TAILNET_HOST`, written into the unit by
`factory service install --tailnet`; see "`service`"), the guard also accepts exactly that name:
a `Host` of `<name>:<port>` (in any case), and an `Origin` of `https://<name>:<port>`. Only that
one name, on the service's own port: never another `*.ts.net` name, the name with no port or
another port, or an `http://` origin for it. `tailscale serve` publishes the loopback service on
HTTPS port `<port>` and passes the client's `Host` through. With no tailnet host, the guard is as
above. A tailnet reader reads exactly what a loopback client may, behind the same guards; the
service checks no identity and ignores `Tailscale-User-*` headers. `$ANDON_TAILNET_HOST` must
be a lowercase DNS name (two or more labels, no port, scheme, path, whitespace, or trailing dot);
any other value makes the service exit 1 with one `andon:` line before it listens, as a bad
`$ANDON_PORT` does.
Successful API responses are JSON (the UI routes below serve the UI's files); every response
carries `cache-control: no-store`. Every endpoint is `GET` (anything else is a 405):

- `GET /projects` returns `{ projects: [{ id, name, root }] }` in registry order. `id` is the
  first 12 hex characters of the SHA-256 of the absolute `root` (it never depends on `name`).
  `name` is the project's `config.json` `name` when that config is valid and sets one, else the
  root's basename (no `factory/`, no `config.json`, or an unreadable or invalid one); it is
  resolved on every request. A project whose `factory/` is missing is still listed. *(Added
  within v1, additively: before, `name` was always the basename.)* Each entry also carries
  `release: { installed, state }`, resolved on every request like `name` (so an upgrade shows
  with no restart). `installed` is the `version` of the project's `factory/managed.json` (see
  "Managed files"), read with the contract's `parseManifest`; it is `null` when that file is
  missing, unreadable, not JSON, or rejected by `parseManifest` (an unstamped install). `state`
  compares `installed` with the service's `running` release (see `GET /release`): `current`
  (equal), `behind` (lower), `ahead` (higher), or `unknown`, which is the state whenever
  `installed` or `running` is `null` or either is not valid semver. Valid semver here is exactly
  `MAJOR.MINOR.PATCH`, non-negative integers with no leading zeros, compared numerically field by
  field; anything else (a pre-release or build suffix included) is not valid, so a manifest
  `version` of `"next"` is `{ installed: "next", state: "unknown" }`. `id`, `name`, and `root`
  are unchanged, and every project is still listed whatever its `release`. *(Added within v1,
  additively: `release`.)* Each entry also carries `machine`, the machine name of the service
  the project is on (see "Peers" below): this service's own name for its own projects. After this
  machine's projects, in registry order, come the projects of each peer this service follows, in
  `peers.json` order (see "Peers"). `GET /projects?scope=local` returns only this machine's
  projects; only the exact value `local` opts in, and any other `scope` value, or none, is the
  merged list. With no peers the two are the same. *(Added within v1, additively: `machine`, the
  peers' projects, and `scope=local`.)* Each entry also carries `repositories: [{ remote, host,
  owner, name }]`, the project's git fetch remotes as the service on the project's own machine
  reads them (`git -C <root> remote -v`, the lines ending `(fetch)`; a remote listed twice keeps
  one entry), sorted by `remote`, the remote's name. Each remote's URL is parsed in one of three
  forms: `https://[user[:token]@]host[:port]/owner/name[.git]`,
  `ssh://[user@]host[:port]/owner/name[.git]`, or scp-like `[user@]host:owner/name[.git]` (the
  scheme matched without case; the host a DNS name or an IPv4 address, so a bracketed IPv6 host is
  skipped). `host` is lowercased and keeps a port (`localhost:222`), except the scheme's default
  one (443 for https, 22 for ssh), which is dropped; the path is never percent-decoded; `owner` and `name` are exactly the two path
  parts, each `[A-Za-z0-9._-]+` and neither `.` nor `..`, with a trailing `.git` stripped from
  `name`. A user, password, or token in the URL is never kept, and the URL itself is never sent. A
  remote in any other form (a local path, a `file:` URL, a path with more or fewer than two parts,
  another scheme) is skipped. `repositories` is `[]` when no remote parses, when the root is not a
  git repo, or when git fails. It is resolved on every request, on every `/events` connect, and
  when the service announces its projects (on start, on a registry change, and on a `config.json`
  or `managed.json` change; never on a change under `jobs/`);
  nothing watches git config, so a remote added later shows at the next of those. The service
  only reads git here. A peer's projects carry that peer's own values, passed through by the hub
  unchanged; a peer on an older release sends no `repositories`, and its projects are listed
  without the field. `id`, `name`, `root`, `release`, and `machine` are unchanged. *(Added within
  v1, additively: `repositories`.)*
- `GET /machines` returns `{ machines: [{ name, url, state, since, reason, release }] }`: this
  machine first, then each listed peer in `peers.json` order. `name` is the machine name (for a
  peer not yet reached, its URL's first host label); `url` is this service's tailnet URL,
  `https://<tailnet host>:<port>`, when it has one, else `http://127.0.0.1:<port>`, and a peer's
  listed URL; `state` is one of `live`, `connecting`, `down`, or `error` (this machine is always
  `live`); `since` is the ISO 8601 time the machine entered that state (this machine: when the
  service started); `reason` is a one-line string, or `null` (always `null` for this machine); and
  `release` is that service's `GET /release` `running` value (`null` when it can't be read). It
  sits behind the same guards as every endpoint. *(Added within v1, additively: a new endpoint.)*
- `GET /release` returns `{ running, onDisk, changelog }`, the factory release of the clone the
  service runs from (this repo's checkout; the process entry passes its root). Run from the
  release bundle, the clone is the bundle itself, and its root `package.json` (which carries the
  same version) stands in for `packages/templates/package.json` throughout. `running` is the
  `version` string of the clone's `packages/templates/package.json`, read once when the service
  starts; `onDisk` is the same file read now, so `onDisk` differing from `running` means the
  clone has moved (a `git pull`) and the service needs a restart. Either is `null` when the
  service has no clone, or that file is missing, unreadable, or has no string `version`.
  `changelog` is the clone's root `CHANGELOG.md`, parsed: `[{ version, date, sections: {
  breaking, added, fixed } }]` in file order (the release script writes newest first), `[]` when
  the file is missing or unreadable. Only a heading `## vX.Y.Z (YYYY-MM-DD)` (valid semver, as
  above) starts a release, whose `version` is the heading's without the `v` and `date` is its
  `YYYY-MM-DD`; within one, only `### Breaking`, `### Added`, and `### Fixed` start a section, and
  a section absent from the file is `[]`. Any other heading ends the release (`#` or `##`) or the
  section (`###` and below), and lines outside a recognized release and section are ignored. The
  parse is tolerant and never fails: inside a section every non-blank line is one entry `{ area,
  text, job }`. A leading `- ` is stripped and the rest is read as `<Area>: <text> (<job id>)`,
  where the area (a label with no `:`, `(`, or `)`) and the trailing job id (matching
  `^\d{3}-[a-z0-9-]+$`) are each optional and `null` when absent; a line that leaves no text
  (`Andon: (056-x)`, say) matches neither shape and is `{ area: null, text: <the line>, job: null }`,
  the line taken after the `- ` strip. The service reads only these fixed paths under the clone
  root, and no request input builds a path. It sits behind the same guards as every
  endpoint (the `Host`/`Origin` 403, `GET` only, `cache-control: no-store`). *(Added within v1,
  additively: a new endpoint.)*
- `GET /projects/<pid>/board` returns `{ jobs, config }` for that project, with the same shape
  and rules as the dashboard's `GET /board`: a `job.json` that is missing or mid-write keeps the
  job's last good snapshot, unknown `job.json` fields are passed through (an `abandoned` job,
  `stoppedBy`, and `stoppedFrom` included, unchanged), and a bad
  `config.json` is a 500 whose text is `config.json: <reason>`. `jobs` also holds every job found
  only on the project's `factory/archive` branch (see "Archived jobs" below), in the same shape
  and sorted by id together with the local jobs. The response also carries `epics`: the
  project's *on-board epics*, every epic that is not settled (running, waiting, landing, or
  landed and not yet settled), in slug order, each its `epic.json` as stored (see "Epics in the
  service" below); `[]` when there are none, so a project with no epics serves exactly what it did
  before plus `epics: []`. *(Added within v1, additively: `epics`.)*
- `GET /projects/<pid>/board?settled=summary` returns the *narrow board* `{ jobs, config,
  settled, epics }`: `jobs` holds only that project's unsettled jobs, `config` and `epics` are as
  on the plain board, and `settled` is the project's *settled summary* `{ count, lastMergedAt,
  epics }`. Only the exact value `summary` opts in: with no `settled` parameter, or any other
  value, the response is the plain `{ jobs, config, epics }` above, unchanged. A job or an epic is
  *settled* by the epic-aware settle rule (see "`config.json`", `dashboard.settleAfterHours`, and
  "Epics in the service" below), applied by the service on the system clock when it builds the
  board. For a job with no `epic` that is the plain rule, unchanged: an `abandoned` job is
  settled at once; a `merged` job is settled when its `endedAt` parses and is more than
  `settleAfterHours` before now (a merged job with no readable `endedAt` is not settled); every
  other stage is unsettled. The narrow `jobs` and the `jobs` of `GET /projects/<pid>/settled`
  split the plain board's `jobs` between them, entry for entry, each in id order. In the summary,
  `count` is the number of settled jobs (settled merged plus abandoned), `lastMergedAt` is the
  newest `endedAt` among the settled merged jobs, or `null` when there is none (an abandoned job
  never counts as a merge), and `epics` is the number of settled epics (`0` when there are none;
  settled epics never count toward `count`). Errors are as for the plain board. *(Added within
  v1, additively: a new query parameter; the plain response is unchanged. The summary's `epics`
  and the narrow board's `epics` were added later within v1, additively.)* The narrow board also
  carries `backlog: { queued, exploring }`, the lengths of `GET /projects/<pid>/backlog`'s
  `queued` and `exploring` lists (below), read when the board is built; the plain board and
  `/settled` never carry it. *(Added within v1, additively: the narrow board's `backlog`.)*
- `GET /projects/<pid>/settled` returns `{ jobs, epics }`: only that project's settled jobs (by
  the rule above), sorted by id, in the same shape and under the same rules as the plain board's
  `jobs` (last good snapshot, unknown fields passed through, archived-only jobs included and
  re-projected as described under "Archived jobs"), and only its settled epics, in slug order,
  in the same shape as the board's `epics`. The board's `epics` and these `epics` split the
  project's epics between them, with no overlap or gap. A bad `config.json` is a 500 whose text
  is `config.json: <reason>`, and an unknown `<pid>` is a 404; it sits behind the same guards as
  every endpoint (the `Host`/`Origin` 403, `GET` only, `cache-control: no-store`). *(Added within
  v1, additively: a new endpoint. Its `epics` was added later within v1, additively.)*
- `GET /projects/<pid>/jobs/<id>/docs` returns `{ files: [{ path, text }] }`, with the same
  reading order, brief handling, and paths (relative to `factory/`) as the dashboard's
  `GET /jobs/<id>/docs`, except that it reads only regular files: a symlinked brief, file, or
  job directory is skipped. The job id is checked against `^\d{3}-[a-z0-9-]+$` before any path is
  built. For a job found only on `factory/archive`, `files` are its archived files, with the same
  paths (`jobs/<id>/…`), reading order, and text as the local copy had, led by the brief when the
  job names one that exists locally under `factory/briefs/`. The reading order is `feature.md`,
  `spec.md`, `build.md`, the `rework-<k>.md` notes and then the `conflict-<c>.md` notes (each in
  numeric order), `decision.md`, then each `round-<N>/` in numeric order. *(Added within v1,
  additively: the `conflict-<c>.md` notes; every other file's order is unchanged.)*
- `GET /projects/<pid>/epics/<slug>/docs` returns `{ files: [{ path, text }] }`: the epic's plan,
  then each member's brief in plan order, with paths relative to `factory/`. The slug is checked
  against the epic slug rule (`isEpicSlug`) before any path is built; a slug that fails it
  (an encoded `..` or `/` included) is a 404. The plan is `factory/epics/<slug>.md` when that is a
  regular file locally, else the archived `epics/<slug>/plan.md` on `factory/archive`; either way
  its `path` is `epics/<slug>.md`. A slug with no plan, locally or archived, is a 404. The members
  are those `## Members` items that parse (see "The plan"; a plan that only partly parses serves
  the members that parsed), and each brief is `briefs/<m>.md`, read locally; a missing brief is
  skipped. Plans and briefs are read only as regular files that resolve inside the project's
  `factory/`: a symlink is never followed (a symlinked plan counts as missing, a symlinked
  brief is skipped), and nothing outside `factory/` is read. It sits behind the same guards as
  every endpoint. *(Added within v1, additively: a new endpoint.)*
- `GET /projects/<pid>/backlog` returns `{ queued, exploring }`, the project's backlog (see
  "Backlog in the service" below): `queued` is its `factory/backlog.md`'s open lines, in file
  order, and `exploring` is its draft briefs and draft plans that no open line points at. Each
  item is `{ kind, slug, title, done, status, members, abandoned }`. A project with no
  `backlog.md`, `briefs/`, or `epics/` returns `{ queued: [], exploring: [] }`; an unknown `<pid>`
  is a 404. It sits behind the same guards as every endpoint. *(Added within v1, additively: a
  new endpoint.)*
- `GET /projects/<pid>/briefs/<slug>` and `GET /projects/<pid>/plans/<slug>` return `{ path, text
  }`: the exact text of `factory/briefs/<slug>.md` or `factory/epics/<slug>.md`, with `path`
  relative to `factory/` (`briefs/<slug>.md`, `epics/<slug>.md`), as the docs endpoints do. The
  slug is checked against `^[a-z0-9]+(-[a-z0-9]+)*$`, on the request path as sent (never
  decoded), before any path is built: a slug that fails it (`..`, an encoded `..` or `/`,
  uppercase, empty, or a leading, trailing, or doubled `-`) is a 404 and reads nothing. The file
  is read only as a regular file that resolves inside the project's `factory/`: a missing file, a
  directory, and a symlink (even one pointing inside `factory/`) are each a 404, and nothing
  outside `factory/` is read. An unknown `<pid>` is a 404. They sit behind the same guards as
  every endpoint. *(Added within v1, additively: new endpoints.)*
- `GET /` returns the Andon UI's `index.html`, and `GET /<path>` returns that file of the UI
  build (from source `apps/andon-ui/dist`, built by `bun run andon:ui:build`; from the release
  bundle, its `andon/ui/`), read-only. The URL path is decoded,
  and it must resolve to a regular file inside the build directory both before and after
  symlinks are followed: a path that escapes it (by `..`, by an encoded `..` or `/`, or through a
  symlink), a directory, a malformed escape, or a missing file is a 404. With no build present,
  `GET /` is a 404. These routes are matched after the API routes above, so a build file never
  shadows an endpoint. They sit behind the same guards as every endpoint: the `Host`/`Origin`
  403, `GET` only (anything else is a 405), and `cache-control: no-store`. *(Added within v1,
  additively: before, `/` and asset paths were 404s; no other endpoint changed.)* A successful
  UI route response (`GET /`, `GET /<path>`) also carries this `Content-Security-Policy` header,
  exactly: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src
  'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` (one
  line; no `'unsafe-inline'` or `'unsafe-eval'`). Only successful UI route responses carry it:
  API responses, `/events`, and every 403, 405, and 404 are unchanged. *(Added within v1,
  additively: a new response header on the UI routes; no status, body, or other header changed.)*
- An unknown `<pid>`, a malformed job id, epic slug, or brief or plan slug, or any other path not served by the UI routes is a 404.
- `GET /events` is a `text/event-stream` of these events, each `data` one JSON line:
  - `projects`: `{ projects: [{ id, name, root, release }] }`, with `name` and `release`
    resolved as in `GET /projects`, and each entry's `machine` and the peers' projects as there
    (*added within v1, additively*). A hub also re-sends it (with the merged list, to every client
    but `scope=local` ones) whenever a live peer's projects change, a peer goes `live`, or
    `peers.json` changes (see "Peers"). Sent once on connect, again whenever the registry's list of
    projects changes, again whenever a project's resolved name changes (its `config.json` gains,
    changes, or drops `name`, or turns invalid or valid), and again whenever a project's
    `release.installed` or `release.state` changes (its `factory/managed.json` is written, as by
    `upgrade`, or removed), alongside that change's `board` or `error` event. A `config.json` or
    `managed.json` write that leaves every resolved name and release unchanged (a manifest whose
    `files` alone differ, say) sends no `projects` event. Each entry also carries `repositories`,
    resolved as in `GET /projects`: this machine's entries by this service, and the peers'
    entries passed through by the hub as each peer sent them. A `projects` event is also re-sent
    whenever a project's resolved `repositories` change (seen whenever they are resolved: a
    `GET /projects`, a connect, a registry change, or a `config.json` or `managed.json` change),
    and a hub re-sends the merged event when a
    live peer's `repositories` change, as for any change in its projects. *(Added within v1,
    additively: the re-send on a name change; later, `release` and the re-send on its change;
    later, `repositories` and the re-send on its change.)*
  - `release`: the `GET /release` body, `{ running, onDisk, changelog }`. Sent once on connect,
    right after the first `projects` event, and again whenever the clone's `CHANGELOG.md` or
    `packages/templates/package.json` changes (created, edited, replaced, or removed), debounced
    like `board`. *(Added within v1, additively: a new event.)*
  - `board`: `{ project: <pid>, jobs, config, epics }`, sent when anything under a registered
    project's `factory/jobs/` (epic runtime state included), its `factory/config.json`, or its
    `factory/epics/` (a plan file created or edited) changes, or its `factory/archive` branch
    moves. `jobs` and `epics` are as in `GET /projects/<pid>/board`, archived jobs and epics
    included. A burst of changes is debounced to one `board` event per project (at most about
    100 ms of delay). *(Added within v1, additively: `epics`, and the re-send on a plan edit.
    There is no separate epic event.)*
  - `backlog`: `{ project: <pid> }`, sent to every client (plain and narrow) when that project's
    `factory/backlog.md`, a file in its `factory/briefs/`, or a plan file in its `factory/epics/`
    is created, edited, replaced, or removed, debounced like `board` to one `backlog` event per
    project per burst. It carries no list: a client re-fetches `GET /projects/<pid>/backlog`.
    The same burst sends narrow clients a fresh narrow `board` event, so its `backlog` counts
    update; a burst that touches only `backlog.md` or `briefs/` sends plain clients no `board`
    event. *(Added within v1, additively: a new event.)*
  - `error`: `{ project: <pid>, reason: "config.json: <reason>" }`, sent instead of `board` when
    that project's `config.json` is bad.
  - `machines`: the `GET /machines` body, `{ machines: [...] }`. Sent once on connect, right
    after the first `release` event, and again to every client (but `scope=local` ones, below)
    whenever an entry changes (a peer
    listed or unlisted, or a peer's state, reason, name, or release changing). *(Added within v1,
    additively: a new event.)*

  `GET /events?scope=local` is the same stream with only this machine's data: its `projects`
  events list only this machine's projects, it gets no peer's `board`, `backlog`, or `error`
  events, and its one `machines` event (on connect) lists only this machine. Only the exact value
  `local` opts in; it combines with `settled=summary`. With no peers it is the plain stream.
  *(Added within v1, additively: a new query parameter.)*

  `GET /events?settled=summary` is the same stream for a *narrow client*: its `projects` and
  `error` events (and its `backlog` events) are as above, and each of its `board` events is the
  narrow form `{ project: <pid>, jobs, config, settled, epics, backlog }`, with `jobs`,
  `settled`, `epics`, and `backlog` (*added within v1, additively*) as in
  `GET /projects/<pid>/board?settled=summary`. Only the exact value `summary` opts in; with no
  `settled` parameter, or any other value, the stream is the plain one above, unchanged. Plain and
  narrow clients may be connected at once: a change sends each client its own form of the same
  board, and an `error` event goes to both. Because a merged job or a landed epic becomes settled
  with no file change, while at least one narrow client is connected the service keeps one
  one-shot *settle timer* per project, armed for that project's next crossing of
  `settleAfterHours`: the earliest among its unsettled merged jobs with no `epic` and its
  unsettled `landed` epics (an epic's jobs settle with it, so its crossing covers them; the jobs
  of an epic that isn't `landed` or `abandoned` arm nothing). It is re-armed after every build of
  the project's board (so a `settleAfterHours` edit in `config.json` re-arms it through the normal
  rebuild). When it fires, narrow clients get a fresh narrow `board` event; plain clients get
  none. It is a single deadline, not periodic refetching (no polling): with no narrow client
  connected, no coming crossing (no unsettled merged job with no `epic`, and no unsettled landed
  epic, with a readable `endedAt`), or a bad `config.json`, no timer is armed, and the timer
  is cleared when the last narrow client disconnects, the project leaves the registry, or the
  service stops. A delay longer than a timer allows (2^31−1 ms) is clamped; firing early just
  rebuilds and re-arms. *(Added within v1, additively: a new query parameter and the timer's
  events, sent to narrow clients only; plain clients' events are unchanged. Epics' crossings
  were added later within v1, additively.)*

The service finds changes with `fs.watch`, never by polling: one recursive watch on each project's
`factory/jobs/` (which covers `factory/jobs/epics/`), one non-recursive watch on its `factory/`
(for `config.json`), one non-recursive watch on its `factory/epics/` (plan files; a
`factory/epics/` created after startup is watched once the `factory/` watch sees it appear), and
one non-recursive watch on its `factory/briefs/` (brief files; a `factory/briefs/` created after
startup is watched once the `factory/` watch sees it appear), and one on the registry file's
directory. *(Added within v1, additively: the `factory/epics/` watch, and later the
`factory/briefs/` watch.)* `factory/backlog.md` is seen by the existing non-recursive `factory/`
watch. The `factory/briefs/` watch is closed when the project leaves the registry or the service
stops. A project's `factory/managed.json` is seen by the existing non-recursive `factory/` watch
(which ignores dot-named entries, such as the installer's temp files), so it needs no watch of
its own. The clone the service runs from has two non-recursive watches: one on its root (for
`CHANGELOG.md` only) and one on its `packages/templates/` (for `package.json` only); from the
release bundle, one watch on its root covers both `CHANGELOG.md` and `package.json`. A missing
directory is not watched. Both are closed when the service stops. *(Added within v1,
additively: the clone watches.)* For a project in a git repo, the archive ref is watched in the repo's
git common dir (found once, by `git rev-parse --git-common-dir`, so a linked worktree's project
watches its main repo's refs): non-recursive watches on `refs/heads/factory/` (a loose archive ref),
on `refs/heads/` (for `factory/` appearing, so a branch created after startup is seen), and on the
common dir itself for `packed-refs` only (`git pack-refs`, `git update-ref`). It never watches or
serves `factory/.worktrees/` or `factory/.lock/`. An invalid registry edit keeps the current list.
`peers.json` is watched like the registry, on its directory (the same watch when they share it,
as they do by default), debounced; an unreadable or invalid `peers.json` edit keeps the current
peers and logs one line. *(Added within v1, additively: the peers watch.)*

**Peers.** A service that lists peers in `peers.json` (see "Andon peers") is a *hub*: it follows
each peer's own projects and serves them beside its own, so a client that connects to one service
sees every machine. It stays read-only, and it follows one hop only: it asks each peer for its
local data (`scope=local`) and never passes on what that peer follows, so machines may list each
other with no cycle or duplicate. *(Added within v1, additively: everything in this paragraph and
the list below. With no `peers.json`, or an empty one, a service serves exactly what it did before,
plus `machine` on each project, `GET /machines` listing only itself, and the `machines` event.)*

- *The machine name.* With a tailnet host (`$ANDON_TAILNET_HOST`), it is that host's first label
  (`studio.manticore-hue.ts.net` is `studio`). Otherwise it is the OS hostname's first label,
  lowercased, with every character outside `[a-z0-9-]` made `-`, leading and trailing `-` trimmed,
  and `local` when nothing is left (`Rocinante.local` is `rocinante`). It never contains `@`, so a
  service never refuses to start because of its hostname. `factory peers` derives this machine's
  name the same way (`machineName`, `packages/contract`).
- *Ids.* This machine's projects keep their bare 12-hex ids. A peer's project is served as
  `<pid>@<machine>` (e.g. `1a2b3c4d5e6f@studio`), its `machine` that peer's name, every other
  field of the peer's entry passed through unchanged. The same id names it on every endpoint
  (`/projects/<id>/board`, `/settled`, `/jobs/<id>/docs`, `/epics/<slug>/docs`, `/backlog`,
  `/briefs/<slug>`, `/plans/<slug>`) and in every event's `project`. In a request path, `@` may
  also be written `%40` (as `encodeURIComponent` writes it). An id whose part before `@` isn't 12
  lowercase hex characters, one with a second `@`, or one naming a machine that isn't a listed peer
  (or is one in `error`) is a 404, and sends no request.
- *Following.* The hub reaches each peer only at its listed URL, over HTTPS, through the
  transport, and follows no redirect: a 3xx answer is a failure, never followed. It first reads
  the peer's `GET /machines`; the peer's own entry is its first, and the hub learns the peer's
  name and `release` from it. Then it follows the peer with exactly two streams while it is
  reachable, `GET /events?scope=local` and `GET /events?scope=local&settled=summary`, and never
  polls: the peer's `projects` events set its projects (a change in a `live` peer's list re-sends
  the merged `projects` event to every client but `scope=local` ones), and its `board`, `backlog`, and `error`
  events reach the hub's clients of the matching form (plain from the first stream, narrow from
  the second; the peer's own settle timers drive narrow re-sends) with `project` rewritten to
  `<pid>@<machine>`. A peer's `release` and `machines` events are not passed on: `/release` and
  its event stay the hub's own. When a peer goes `live` (both streams open), the hub reads each
  of its projects' boards once, in both forms, and sends them as `board` events, so a reconnect
  brings fresh boards. The hub keeps, in memory only, the peer's projects and the last board of
  each form for each of them.
- *States.* A listed peer is `connecting` until both streams are open, then `live`. When it
  can't be reached, or a stream drops (a network error, a 5xx to its `GET /machines` or a stream
  open, such as `tailscale serve`'s 502, or no answer within about 10 s), it is `down`: its
  projects stay listed with their last boards, never removed. The hub reconnects with a backoff from 3 s, doubling, up to about 60 s, back to
  3 s once it is `live` again; a `down` peer that answers again is `connecting`, then `live`, and
  fresh `projects` and `board` events follow. A hub started while a peer is down lists it `down`
  with no projects. Nothing about peers is persisted.
- *Errors.* A peer is `error`, and none of its projects or events are merged, when: it is from
  before peers (its `GET /machines` is a 404, its `scope=local` projects carry no `machine`, or an
  id containing `@`), with a reason naming `factory upgrade` and `factory service restart` on that
  machine; it answers but not as an Andon service (not JSON in these shapes, or a redirect); or it
  reports this hub's own machine name, or the same name as an earlier peer in `peers.json` (the
  later or clashing peer is `error`, with a reason naming the clash). A peer in `error` for a name
  clash is retried when `peers.json` changes; any other is retried on the backoff and stays
  `error`, with its `since`, while nothing changes.
- *Releases.* A peer on another release passes through unchanged: its boards, docs, and events
  are served as it sends them, and its `release` shows on its machine entry.
- *Forwarded reads.* A read of a peer's project (every endpoint above) is forwarded to the peer
  on demand, not cached ahead: the hub sends `GET <peer url>/projects/<pid>/…` with the same path
  after the id and the same query, and returns the peer's status and body, whatever the status (a
  4xx or 5xx included: a peer project's bad `config.json` is the peer's 500 with its
  `config.json: <reason>` text), with `cache-control: no-store` and a `content-type` of JSON (when
  the peer's is) or plain text. A body larger than 32 MiB is a 502 naming the machine. The
  job id, epic slug, or brief or plan slug is checked by the same rules as for a local project
  first; one that fails is a 404 that sends no request. A forwarded read that fails on a `live`
  peer (a network error, a redirect, or no answer within about 10 s) is a 502 whose text names the
  machine. While a peer is not `live`, `GET /projects/<pid>@<machine>/board` serves the last board
  of the requested form the hub holds (plain, or narrow with `?settled=summary`), and is a 502
  naming the machine when it holds none; every other read for it is a 502 whose text names the
  machine. Forwarded responses sit behind the same guards as every endpoint (the `Host`/`Origin`
  403, `GET` only).
- *Changes.* Editing `peers.json` applies with no restart: a listed peer is followed, an unlisted
  one dropped (its projects leave the list), and every client gets fresh `projects` and `machines`
  events. The hub's own listener stays on `127.0.0.1`; peers are read through `tailscale serve`
  (see "`service`").
- *Exposure.* A hub re-serves its peers' data: anyone who can read the hub (on loopback, or over
  the tailnet when it is published with `install --tailnet`) can read every listed peer's
  projects through it, even a tailnet device that Tailscale ACLs keep from reaching the peer
  itself. Peer values other than `id` and `machine` are passed through as the peer sent them.

**Archived jobs.** A job whose `factory/jobs/<id>/` is gone (pruned, or never there on a fresh
clone) but which is on the local `factory/archive` branch (see "Job archive") is still served by
`board` (endpoint and event) and `docs`, in the existing shapes: no new field, endpoint, or event
marks it. Its board entry is re-projected from its archived `events.jsonl` exactly as the CLI
projects `job.json`; a legacy job (no `events.jsonl`) uses its archived `job.json`. A local
`factory/jobs/<id>/` always wins: such a job is served from the local copy only, with the
`job.json` and last-good rules above. Only the tip's top-level directories named like a job id
(`^\d{3}-[a-z0-9-]+/`) are read, and in them only regular-file blobs; anything else is ignored. A
job that can't be projected (a torn or empty `events.jsonl`, a log that doesn't start with
`job.claimed`, a legacy `job.json` that isn't a JSON object) is left out and logged, and never
fails the board. The service reads git only (`rev-parse`, `ls-tree`, `cat-file`; never a write,
fetch, or push), spawned without a shell, with fixed arguments naming only
`refs/heads/factory/archive` and object ids. It caches the archive in memory, keyed by the branch's
tip: a `factory/jobs/` change runs no git, a ref change that leaves the tip where it was runs only
the tip's `rev-parse`, and a moved tip (or startup) is read with one `git ls-tree` and one
`git cat-file --batch` for all files. With no `factory/archive` branch, or a root that isn't a git
repo, nothing changes and nothing is logged. *(Added within v1, additively: before, `board` and
`docs` read `factory/jobs/` only.)* The same `ls-tree` and `cat-file --batch` pass, and the
same tip-keyed cache, also read each archived epic's `epics/<slug>/events.jsonl` and
`epics/<slug>/plan.md` (regular-file blobs only, directly under a top-level `epics/` and a dir
named by an epic slug; see "Epics in the service"). *(Added within v1, additively.)*

**Epics in the service.** The board's `epics` (endpoint and event, plain and narrow) and
`/settled`'s `epics` are read from each project's epics, in slug order:

- A *local epic* is a `factory/jobs/epics/<slug>/` directory named by an epic slug (any other
  entry there is ignored, and is never served as a job). It is served as its `epic.json`, passed
  through as stored, unknown fields kept. An `epic.json` that is missing or mid-write keeps the
  epic's last good snapshot, as for jobs; one never read is not served. The service never
  re-projects or writes a local `epic.json`.
- An *archived epic* is one whose `epics/<slug>/` is on the `factory/archive` tip and that has no
  local `factory/jobs/epics/<slug>/` (a local epic dir always wins). The archive holds no
  `epic.json`, so it is re-projected exactly as the CLI projects `epic.json` (`projectEpic`), from
  its archived `events.jsonl`, its archived `plan.md` (parsed with `parsePlan`; a missing or partly
  parsed plan is a `planError`, as for a local epic), and the epic's jobs as the board holds them
  (local wins, else archived). An archived epic that can't be projected (a torn log, or one that
  doesn't start with this epic's `epic.started`) is left out and logged once per archive tip
  (never on every board build), and never fails the board.
- **Settling.** An epic's settled state comes from its snapshot's `state` and `endedAt` by the
  epic-aware settle rule (`isEpicSettled`, from `packages/contract`; the service has no copy of
  its own): `abandoned` at once, `landed` once its `endedAt` is more than `settleAfterHours` old.
  A job's settled state comes from `isSettled` with its epic's facts, and nothing else: an
  `abandoned` job is settled at once, whatever its epic's state; a `merged` job with no `epic`
  settles as before; a `merged` job with an `epic` is never settled while its epic isn't `landed`
  or `abandoned`, and once it is, it settles when its epic does. A job whose `epic` names an epic
  the service doesn't find (locally or archived) has an unknown epic, so a merged one is not
  settled. This applies to the narrow board, the settled summary, `/settled`, and the settle
  timer.

*(Added within v1, additively: epics in the service. A project with no epics serves exactly what
it did before plus `epics: []`, and `epics: 0` in the narrow summary; jobs with no `epic` settle
exactly as before.)*

**Backlog in the service.** `GET /projects/<pid>/backlog` and the narrow board's `backlog` counts
are read, per request and per build, from three fixed paths only: `factory/backlog.md`, the
`<slug>.md` files of `factory/briefs/`, and those of `factory/epics/`, each named by a slug
(`^[a-z0-9]+(-[a-z0-9]+)*$`) and read only as a regular file that resolves inside `factory/` (a
symlink, a directory, or a missing or unreadable file counts as absent). The parse is tolerant and
never fails: a malformed line or file is free text or absent, never an error. The service writes
nothing.

- *Queued.* Only lines starting `- [ ] ` are queued, in file order; ticked `- [x]` lines and any
  other text are ignored. The text after `- [ ] ` is split on ` — `: the first part is the
  `title`, and when the last part is a *pointer*, `brief: factory/briefs/<slug>.md` (kind `brief`)
  or `epic: factory/epics/<slug>.md` (kind `epic`) with a slug that passes the slug rule, the parts
  between are the `done` text (`null` when there are none). Anything else (no pointer, an unknown
  key, a key and folder that don't match, a slug that fails the rule) is kind `text`, with `slug:
  null` and every part after the title as `done`; a line with no ` — ` is kind `text` with the
  whole text as its `title` and `done: null`.
- *A brief's or plan's facts.* Its title is its first `# ` heading (else the slug), `status` is its
  `- Status:` value as the contract's `statusLine` reads it (else `null`), `abandoned` is the text
  after each `- Abandoned: ` line, in file order (`[]` when there are none), and a plan's member
  count is the number of `## Members` items `parsePlan` yields (`0` when none parse).
- *Items.* `{ kind: "brief" | "epic" | "text", slug, title, done, status, members, abandoned }`:
  `slug`, `done`, and `status` are `string | null`, `members` is a number for an epic and `null`
  otherwise, and `abandoned` is `string[]`. A queued `brief` or `epic` item takes `status`,
  `members`, and `abandoned` from the file it points at; when that file is absent, its kind and
  slug are kept, `status` is `null`, `abandoned` is `[]`, and an epic's `members` is `0`. A
  `text` item has `status: null`, `members: null`, and `abandoned: []`.
- *Exploring.* Every brief and plan whose `status` is `draft` and that no open line points at, in
  slug order, briefs before plans; a plan is kind `epic`, its title is the file's, and `done` is
  `null`. A draft an open line points at shows only in `queued`, so nothing is shown twice.

*(Added within v1, additively: the backlog in the service.)*

## Versioning

These rules record how the code behaves today; they change no behavior.

- **`schema: "factory/v1"` names the major version.** Within v1, changes are additive only: new
  event types, new optional event fields, new config keys, and new snapshot fields. Within v1,
  nothing is removed or renamed, no field's type or meaning changes, and no allowed transition is
  tightened. Anything else needs `factory/v2`.
- **Same-diff doc updates.** Every contract change updates this doc (`docs/contract/v1.md`) in the
  same diff, and is reviewed by the contract reviewer (`factory-contract`).
- **The writer is strict.** The CLI rejects unknown event fields on input and unknown
  `config.json` keys (and unknown keys inside `roles` entries, inside `merge`, inside `archive`, and inside `epic`). Accepting a new `runner` value is
  an additive widening within v1.
- **Readers are tolerant.** Readers of `events.jsonl` and `job.json` (the projection, the
  dashboard, and Andon) ignore fields they don't know. A reader that meets an unknown event `type`
  leaves the snapshot as it was and does not fail (the projection still advances `updated` to that
  event's `ts`, since `updated` is always the last event's `ts`).
- **2026-10-26: `claim` and the `job.claimed` refusal on `event`.** A single approved pre-1.0
  break within `factory/v1` (the brief's contract call, approved 2026-10-26): `job.claimed` is
  written only by the new `claim <slug>` command, which picks the job number, and `event` refuses
  `job.claimed`. It is not additive, and it is the only exception to the additive-only rule; it sets no
  general pre-1.0 policy. The log format and `job.claimed`'s fields are unchanged, so every
  existing `events.jsonl` and `job.json` stays valid v1.
- **2026-10-28: `session` on `job.claimed`, `job.reworked`, `job.human-approved`, and
  `job.json`.** Additive within v1 (the brief `job-session-link`'s contract call, approved
  2026-10-28): a new optional `session` field on those three events (the `session=` CLI argument
  on `claim` and on `event` for the two others, checked on write), and a new `session` snapshot
  field, the most recent one recorded, `null` when none was. No transition changes; every
  existing `events.jsonl` stays valid v1 and rebuilds to the same `job.json` plus
  `session: null`.
- **2026-10-28: the job archive.** Additive within v1 (the brief `job-archive`'s contract calls,
  approved 2026-10-28): the optional `config.json` key `archive: { enabled: boolean }` (absent
  means off); the archive branch (named `factory/jobs` until the 2026-10-29 rename below), its
  tree layout, and the new `archive` command; and job numbers that count the branch's top-level job ids as well as the job dirs. With no archive
  branch, `claim` picks the same number as before; no event, snapshot field, or transition
  changes.
- **2026-10-29: the job archive branch is renamed `factory/archive`.** The brief
  `archive-branch-rename`'s contract call, approved by Matt on 2026-10-29: the archive branch
  added on 2026-10-28 moves from `factory/jobs` (`refs/heads/factory/jobs`) to `factory/archive`
  (`refs/heads/factory/archive`), because a bare `git log factory/jobs` is ambiguous beside every
  project's `factory/jobs/` directory. It is not additive: it renames a v1 addition that was never
  released or used outside this repo, and it sets no general pre-1.0 policy. Nothing reads or
  writes a `factory/jobs` branch anymore, and there is no fallback or migration (an existing one
  is ignored; rename it by hand with `git branch -m factory/jobs factory/archive`). The
  `factory/jobs/` directory, the tree layout, the commit message and trailers, and the `archive`
  key are unchanged.
- **2026-10-29: `prune`.** Additive within v1 (the brief `job-prune`'s contract call, approved
  in the brief): the new `prune` command, which removes local job dirs that are archived on
  `factory/archive`, settled, and equal to their archived tree. It reuses the existing settle
  rule (`dashboard.settleAfterHours`, `endedAt`) and the archive's file set. No event, snapshot
  field, config key, or transition changes.
- **2026-10-29: `merge.conflicted`, `conflicts`, and `conflict-<c>.md`.** Additive within v1
  (the brief `merge-conflict-rework`'s contract call, approved by Matt on 2026-10-29): the new
  event `merge.conflicted` (`reason` only), allowed from `approve` and from `needs-human` after
  `job.human-approved`, moving the job to `build` with `maxRound = round + 2`, `note = reason`,
  and the human approval cleared, and refused once the job has 2 (log `merge.failed` instead);
  the new `job.json` field `conflicts` (default 0); and the new orchestrator-written input
  `jobs/<id>/conflict-<c>.md`, on the builder's card, in the builder's and approver's reads, in
  the archive's layout, and in Andon's job docs. No existing transition changes; every existing
  `events.jsonl` stays valid v1 and rebuilds to the same `job.json` plus `conflicts: 0`.
- **2026-10-29: epics.** Additive within v1 (the brief `epic-cli`'s contract call, approved by
  Matt on 2026-10-29; design `docs/design/epics/design.md`): the plan file
  `factory/epics/<slug>.md` and its format; the epic's runtime dir `jobs/epics/<slug>/`
  (`events.jsonl`, `epic.json`), its branch `factory/epic/<slug>`, and its worktree
  `factory/.worktrees/epic-<slug>/`; the epic events (`epic.started`, `epic.waiting`,
  `epic.resumed`, `epic.landing`, `epic.landed`, `epic.abandoned`), their transitions, and the
  `epic.json` projection; the optional `epic` and `kind` on `job.claimed` and the `epic` and
  `kind` snapshot fields (`null` for a standalone job); `claim`'s `epic=` and `kind=`; the
  `epic start|event|next|show|abandon` commands; the optional `config.json` key
  `epic: { maxParallel }` (absent: 3); `doctor`'s plan checks; epics on the `factory/archive`
  branch (`epics/<slug>/`) and in `prune`; the epic-aware settle rule beside the existing one;
  and `factory/epics/` among the paths the installer never touches. No existing event, field, or
  transition changes: every existing `events.jsonl` stays valid v1 and rebuilds to the same
  `job.json` plus `epic: null` and `kind: null`, and a standalone claim behaves exactly as before.
  (The `claim` usage line gains the two new fields.)
- **2026-10-29: the Andon service serves epics.** Additive within v1 (the brief
  `andon-epics-service`'s contract call, approved by Matt on 2026-10-29): `epics` on the plain and
  narrow board and on every `/events` `board` event, `epics` in the narrow settled summary,
  `epics` from `GET /projects/<pid>/settled`, the new `GET /projects/<pid>/epics/<slug>/docs`,
  archived epics, a watch on `factory/epics/`, and the service's switch to the epic-aware settle
  rule. New response fields and a new endpoint
  only: no event type is added, and jobs with no `epic` settle exactly as before.
- **2026-10-29: the Andon service reports releases.** Additive within v1 (the brief
  `andon-version-service`'s contract call, approved by Matt on 2026-10-29): `release: {
  installed, state }` on `GET /projects` entries and on the `projects` event, which is re-sent
  when a project's `installed` or `state` changes; the new `GET /release` endpoint (`{ running,
  onDisk, changelog }`) with its tolerant `CHANGELOG.md` line rule; the new `release` event, sent
  on connect and on a change to the clone's `CHANGELOG.md` or templates `package.json`; and the
  two clone watches. A new field, endpoint, and event only: `id`, `name`, and `root` are
  unchanged, and the service still writes nothing.
- **2026-10-30: the release bundle and `factory --version`.** Additive within v1 (the brief
  `cli-global-install`'s contract calls and decisions 3 and 5, approved by Matt on 2026-10-30):
  `init` and `upgrade` run from the release bundle as well as from source, installing the same
  bytes; the new `factory --version`; the source CLI's top-level usage line gains
  ` | --version`; and the Andon service, run from the bundle, reports the bundle's version and
  `CHANGELOG.md` on `GET /release`. The installed `factory/cli.ts` keeps its commands, usage
  lines, and exit codes, and `GET /release` keeps its shape. `projects` (below) runs from the
  bundle too, as every command of the global `factory` command does.
- **2026-10-30: `projects`.** Additive within v1 (the brief `registry-prune`'s contract call,
  approved by Matt on 2026-10-30): the new source-only commands `factory projects`,
  `factory projects prune [--dry-run]`, and `factory projects remove <path>`, which list the Andon
  registry's roots with their state and remove dead or named roots through the existing registry
  writer. The registry's format, its parse, add, and remove rules, the top-level usage lines, and
  the installed CLI's commands are unchanged; no event, snapshot field, config key, or transition
  changes.
- **2026-10-30: `service`.** Additive within v1 (the brief `andon-service-install`'s contract
  call, approved by Matt on 2026-10-30): the new commands `factory service install | uninstall |
  start | stop | restart | status | run`, from source and from the release bundle, which make the
  Andon service a launchd or systemd `--user` per-user service and report on it, and the
  `usage: service …` line. The Andon service's HTTP surface, port, and registry handling, the
  top-level usage lines, and the installed CLI's commands are unchanged; no event, snapshot
  field, config key, or transition changes. `bun run andon:service`, a root script and never part
  of the CLI, gives way to `factory service run`.
- **2026-10-30: the Andon service serves the backlog.** Additive within v1 (the brief
  `andon-backlog-service`'s contract call, approved by Matt on 2026-10-30): `backlog: { queued,
  exploring }` on the narrow board (endpoint and narrow `board` event); the new `GET
  /projects/<pid>/backlog`, `GET /projects/<pid>/briefs/<slug>`, and `GET
  /projects/<pid>/plans/<slug>`, with the slug rule and the regular-file-inside-`factory/` rule;
  the new `backlog` event; and the `factory/briefs/` watch. New fields, endpoints, and an event
  only: the plain board, the plain `board` event, `/settled`, and the epic docs endpoint are
  unchanged, and the service still writes nothing.
- **2026-10-30: the Andon service over the tailnet.** Additive within v1 (the brief
  `andon-peer-access`'s contract calls, approved by Matt on 2026-10-30): the Andon service's
  `Host`/`Origin` guard also accepts the recorded tailnet host (`Host` `<name>:<port>`, `Origin`
  `https://<name>:<port>`), only when one is recorded (`$ANDON_TAILNET_HOST`); and `service`
  gains `install --tailnet` with its refusals, `ANDON_TAILNET_HOST` in the unit, `install`
  without the flag turning tailnet access off, `uninstall` removing the serve entry, `status`'s
  `tailnet:` line, and the usage line `usage: service install [--tailnet]|uninstall|…`. The
  service still binds `127.0.0.1` only, is `GET` only, and writes nothing; with no tailnet host
  recorded, the guard, the unit, and every command's output are unchanged.
- **2026-10-31: `job.reworked` re-enters `spec` after a pre-build stop.** The brief
  `spec-question-escalation`'s contract call, approved by Matt on 2026-10-31: `job.reworked`
  enters stage `spec`, not `build`, when the job's `stoppedFrom` is `spec` or `claimed` (it
  stopped before anything was built, such as on a spec's open questions), in both the snapshot
  and the transitions the CLI enforces; from any other stop it still enters `build`. No event
  field, snapshot field, or config key changes, and no transition is tightened for a job that
  stopped from `build`, `review`, or `approve`. Every existing `events.jsonl` rebuilds to the same
  `job.json` (no recorded job was reworked from `spec` or `claimed`). The brief's fallback, should
  this be judged not additive, is an optional `stage=spec` field on `job.reworked`.
- **2026-11-02: token usage.** Additive within v1 (the brief `token-spend-record`'s contract
  calls, approved by Matt on 2026-11-02): the optional `agentId` caller field on `agent.finished`;
  the CLI-written `usage` on `agent.finished` and `orchestrator` on the events that end a job's or
  an epic's orchestrator stretch (see "Usage" in "`events.jsonl`"); the snapshot fields
  `timing.agents[].agentId`, `timing.agents[].usage`, and `usage` in `job.json`, and
  `orchestrator` in `epic.json`; the usage table in `show` and the orchestrator line in `epic
  show`. No transition changes, and reading usage never refuses an event. Every existing
  `events.jsonl` stays valid v1 and rebuilds to the same `job.json` plus those keys, reading "not
  recorded".
- **`config.json` is strict, so upgrade first.** A config that uses a newer v1 key needs a CLI that
  knows that key. Upgrade the managed files before adding the key to the overlay.
