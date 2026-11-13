---
name: factory
description: "Run the factory — a feature goes spec → build → parallel reviews → approve → merge, driven by subagents that talk only through markdown files; `queue` and `explore` feed its backlog, and `customize` (alias `init`) tailors the project's overlay. Use when the user invokes /factory with a feature, `next [words]`, `queue <text>`, `explore <idea|brief>`, `customize`, `init`, `approve <job-id>`, `rework <job-id> <note>`, `abandon <job-id> <reason>`, `epic <slug>` (start or resume an epic: several briefs run as member jobs into one branch, then land as one merge), or `epic abandon <slug> <reason>`."
argument-hint: "<feature> | next [words] | queue <text> | explore <idea|brief> | customize | init | approve <job-id> | rework <job-id> <note> | abandon <job-id> <reason> | epic <slug> | epic abandon <slug> <reason>"
---
<!-- factory 0.6.1 · managed file, do not edit: it is replaced on upgrade. Project rules go in the overlay: factory/config.json and factory/roles/<role>.md -->

# /factory — the orchestrator

**Contents**

- [Files](#files-r--git-rev-parse---show-toplevel-always-pass-agents-absolute-paths)
- [The board — events through the CLI](#the-board--events-through-the-cli)
- [The thread lookup (T3 Code)](#the-thread-lookup-t3-code)
- [Running jobs side by side](#running-jobs-side-by-side)
- [Spawning agents](#spawning-agents)
- [The loop](#the-loop)
- [Merge](#merge)
- [Epics](#epics)
  - [Start or resume](#start-or-resume)
  - [The epic loop](#the-epic-loop)
  - [Catch-up](#catch-up)
  - [Member merge](#member-merge)
  - [Landing](#landing)
  - [Member commands](#member-commands)
- [Commands](#commands)
- [Customize — the overlay interview](#customize--the-overlay-interview)
- [Ground rules](#ground-rules)

The session running this skill **is the orchestrator** of one job, or of one epic (several
member jobs driven together; see **Epics**). You run its loop, spawn every agent, and record
every state change through the **factory CLI**. You never write code, specs, reviews, or
decisions yourself; agents do, one file each. Other sessions may be running other jobs at the
same time; see **Running jobs side by side**.

```
clear work ── queue ────────────────────┐
fuzzy idea ── explore ── brief ─────────┴─► backlog.md ── next ─┐
                                                                ▼
feature → spec-writer → builder ⇄ [configured reviewers] → approver → merge | needs-human
```

## Files (R = `git rev-parse --show-toplevel`; always pass agents absolute paths)

| Path | Written by |
|---|---|
| `factory/jobs/<id>/events.jsonl` — the job's append-only event log, the truth | the factory CLI, when you run it |
| `factory/jobs/<id>/job.json` — derived from the log; the dashboard polls it | the factory CLI (never by hand) |
| `factory/config.json` — reviewer keys, the default `maxRound`, the gate, per-role runners, and the merge target | human (or `customize`, with the human) |
| `factory/roles/<role>.md` — the project's rules for one role (optional) | human (or `customize`, with the human) |
| `factory/.lock/` — a short mutex for claiming work and merging | you, briefly |
| `factory/jobs/.claim.lock/` — the CLI's mutex for handing out job ids | the factory CLI (never by hand) |
| `factory/backlog.md` — open and running work only, the queue for `/factory next` | human (adds and edits lines); you, at claim, merge, abandon, `queue`, and `explore`, each edit committed at once |
| `factory/briefs/<slug>.md` — decisions from an `explore` interview (tracked in git) | you, with the human |
| `factory/epics/<slug>.md` — an epic's plan: its member briefs and their `after:` edges (tracked in git) | you, with the human (`explore`); you, for its bookkeeping lines (`Status:`, `- Landed:`, `- Abandoned:`) and dependent drops |
| `factory/jobs/epics/<slug>/events.jsonl` and `epic.json` — an epic's log and its derived snapshot | the factory CLI (never by hand) |
| `factory/jobs/<id>/feature.md` — the request, verbatim (generated, for an epic's sync and fix jobs) | you |
| `factory/jobs/<id>/rework-<k>.md` — a human's rework note, verbatim | you |
| `factory/jobs/<id>/conflict-<c>.md` — the facts of a merge conflict with `<target>` | you |
| `factory/jobs/<id>/spec.md` | `factory-spec-writer` |
| `factory/jobs/<id>/build.md` | `factory-builder` |
| `factory/jobs/<id>/round-<N>/review-<key>.md` | the reviewer for each key in `factory/config.json` `reviewers` |
| `factory/jobs/<id>/round-<N>/<key>/*` — supporting files such as screenshots, when its rules ask for them | that reviewer |
| `factory/jobs/<id>/decision.md` | `factory-approver` |
| `factory/.worktrees/<id>/` — the job's checkout, branch `factory/<id>` | builder (code) |
| `factory/.worktrees/epic-<slug>/` — an epic's checkout, branch `factory/epic/<slug>` | the factory CLI creates and removes it; you merge into it |

`jobs/`, `.lock/`, and `.worktrees/` are gitignored runtime state. Code lives on the
branch; the main checkout stays on the job's target branch so your files never move under you.
Dashboard: Andon, one service per machine. Run `factory service install` once per machine (not per project) to keep it running, or `factory service run` in the foreground, then open http://127.0.0.1:8766/; when Andon says a restart is needed, run `factory service restart`. `factory init` registers the project with Andon.

**The target branch.** Every job is based on and merges into its **target**: `target` in its
`job.json`. The CLI resolves it once, at `claim`, from `merge.target` in
`<R>/factory/config.json`: `current` (the default when `merge` or `merge.target` is absent) is
the branch the main checkout is on at that moment, and any other value names a branch that
must exist. The CLI accepts only a plain branch name (letters, digits, `.`, `_`, `/`, `-`), so a
target never carries quotes or shell metacharacters. A detached HEAD, a missing branch, or a
disallowed name refuses the claim, writing nothing; tell the user the CLI's one-line reason and
stop. Read `target` from `job.json` after the claim and use
it as `<target>` everywhere below, even if the checkout or the config changes mid-job.
If `target` is `null` (a job claimed before the CLI recorded it), resolve it whenever you need
it from the current config: `merge.target` if it names a branch, else (`current`, or no key)
`git symbolic-ref --short HEAD` in `<R>`.

**Reviewers come from config.** The reviewer keys are `reviewers` in `<R>/factory/config.json`,
in order. Read them when a round starts; never assume a list. Each key `<key>` is the agent
`factory-<key>`, which writes `round-<N>/review-<key>.md`.

## The board — events through the CLI

A job's state is its `factory/jobs/<id>/events.jsonl`; the CLI derives `job.json` from it after
every event, and the dashboard assembles the board from those. You **never write `job.json` or
the log** yourself. "Board: `<type> k=v …`" below means: run

```bash
bun factory/cli.ts event <id> <type> [k=v …]    # from <R>
```

for **your job** only, right when the change happens. It prints the new stage. A job starts
with **`claim`**, never with `event`:

```bash
bun factory/cli.ts claim <slug> [brief=…] [issue=…] [maxRound=…] [session=…]    # from <R>
```

`<slug>` is a 2–4 word kebab name for the work (lowercase letters and digits joined by single
`-`, at most 40 characters), e.g. `export-csv-report`. The CLI picks the job number, creates
`factory/jobs/<id>/`, logs `job.claimed`, and prints the full id (e.g. `004-export-csv-report`)
as its only output. That printed id is `<id>` everywhere from then on; never compute, guess, or
pick an id yourself. A non-zero exit means nothing was claimed: read the one-line reason (a bad
slug, `slug <slug> is live as <id>` when a live job already has that slug, a refused
`merge.target`), fix it or tell the user, and stop. A non-zero exit
means the event was rejected and nothing was written: read the one-line reason and fix the
cause (usually WAIT FOR ALL, or an agent's file that's missing or malformed). Never hand-edit
state to get around it. If the reason is a corrupt (torn) tail, stop and tell the user: a human
truncates the partial last line, then runs `bun factory/cli.ts rebuild <id>`; you never edit the
log. The schema, the event types, and the allowed transitions are in
[factory/CONTRACT.md](../../../factory/CONTRACT.md); `bun factory/cli.ts show <id>` prints a job's
stage and timing. Jobs claimed before the CLI (no `events.jsonl`) reject every event, so
`approve`/`rework`/`abandon` can't drive them; say so in one line and stop.

Put free-text values (`title`, `note`, `reason`) in **single quotes** — double quotes expand
`$` and backticks — and write an apostrophe as `'\''`: `reason='it'\''s blocked'`.

**Agent spans.** Every spawn or resume is bracketed: `agent.started` right before it and
`agent.finished` once it returns **and its file exists**, with the same identity fields —
`role` (`spec-writer` | `builder` | `reviewer` | `approver`), plus `key=<reviewer key>` and
`round=<N>` for reviewers, `name=builder-<id>` for the builder, and `round=<N>` for a builder
resumed after round N (omit `round` when N is 0). Never pass a verdict: the CLI reads it from
the reviewer's or approver's file. Every `agent.finished` also passes `agentId=<agent id>`: the
id the Agent tool returned for that agent (a resumed builder keeps its id). The CLI reads that
agent's token spend from it; it is data on the span, never its `name`. Never make one up: if the
tool gave no id, leave `agentId` off (the span's spend then reads as unavailable).

## The thread lookup (T3 Code)

A job records which T3 Code thread is orchestrating it, so the dashboard can open that thread.
Run this **thread lookup** right before `claim` (before taking `factory/.lock`), before
`job.reworked` (`/factory rework`), and before `job.human-approved` (`/factory approve`), and
only when T3 Code's tools `t3_environment_read` and `t3_thread_search` are both present in this
session. Without them, skip it and run the command without `session`.

**In an epic** the lookup runs **once**, when `/factory epic <slug>` starts or resumes the epic,
right before `epic start` or `epic event <slug> epic.resumed`. The `session=` it gives goes on
that command and on every claim this session makes for the epic (members, sync, and fix jobs);
never run it again per claim.

1. Write a unique phrase in your reply to the user: `factory session <random>`, where
   `<random>` is 12 random letters and digits you make up now (never reuse one).
2. Call `t3_environment_read` for the environment id, then `t3_thread_search` for the phrase.
   If no thread comes back, wait a couple of seconds (`sleep 2`) and search once more.
3. Only if exactly one thread matches, add `session=t3code:<environmentId>/<threadId>` to the
   command (`claim`, `job.reworked`, `job.human-approved`, `epic start`, or `epic.resumed`).
4. Otherwise (no match after the retry, several matches, or a tool error), run the command
   without `session` and tell the user in one line: "couldn't find this T3 Code thread; the job
   won't link to it".

It is best effort: never stop the job, wait on the user, or ask them about it. If the CLI
refuses the `session=` value, run the same command again without it and say that one line.
Pass `session=` on nothing else (the CLI refuses it on every other event and epic event), and
never record any other id, such as Claude Code's own session id. The one exception is the Agent
tool's agent id, passed as `agentId=` on `agent.finished` and nowhere else.

## Running jobs side by side

Any number of sessions can run `/factory` at once, one job, or one epic, each. Each job has its own worktree,
branch, job dir, and `job.json`, so they don't touch each other's files. The job-id sequence is
the CLI's: `claim` hands out each number under its own lock, so two sessions never get the same
id. Two more things are shared: the backlog and the main checkout that merges land in. Those
steps happen under `factory/.lock`, which is a directory because `mkdir` is atomic:

```bash
cd <R>; until mkdir factory/.lock 2>/dev/null; do
  [ -n "$(find factory/.lock -maxdepth 0 -mmin +15)" ] && rmdir factory/.lock  # stale: holder died
  sleep 2; done
```

Release it with `rmdir factory/.lock` as soon as the step is done, and never hold it while you
wait on the user or an agent. These steps take the lock:
- **Claim:** run **the backlog check**, pick the work, run the overlap check, run
  `bun factory/cli.ts claim <slug> …` (it picks the number, creates the job dir, and prints the
  id), then, with that printed id, write `feature.md`, tick the backlog line as
  `- [x] … → <id>`, and commit the tick at once by pathspec, still under the lock:
  `git commit -m "chore(factory): claim job <id>" -m "Co-Authored-By: Claude
  <noreply@anthropic.com>" -- factory/backlog.md`. Release the lock only
  after that commit; the job's branch is created later (step 2 of the loop). The ticked line
  stays in the backlog while the job runs, so other sessions see it and never pick it. Work
  claimed from free text with no backlog line has nothing to tick: no backlog commit. Run
  **the thread lookup** before taking the lock.
- **Merge:** everything in **Merge** below, bookkeeping included.
- **Abandon bookkeeping:** removing the job's backlog line and noting the attempt in its brief
  (`/factory abandon`).
- **Queue:** appending lines with `/factory queue`, and its commit.
- **Explore's Finish:** marking a brief ready, appending its backlog line, and their commit.
- **Epic start:** the backlog check, `epic start`, and the tick of the epic's backlog line as
  `- [x] … → epic <slug>`, with its commit (**Epics**, "Start or resume").
- **Landing:** everything in **Epics**, "Landing", from the checkout check to the
  `land epic <slug>` commit.
- **Epic bookkeeping:** a member brief's `- Abandoned:` line, dropping members from a plan, and
  `/factory epic abandon`'s bookkeeping, each with its commit.

Member, sync, and fix claims don't take the lock: they touch no backlog line, and the CLI checks
the epic's plan and cap under the epic's own lock. A member's merge into the epic branch doesn't
take it either: it happens in the epic's worktree, never the main checkout, and only the session
driving the epic merges there.

**The backlog holds only open and running work, and every edit to it is committed at once** by
the step that makes it, by pathspec, under `factory/.lock`. A pathspec commit takes the whole
file, so nothing may be left uncommitted between steps, or one job's edit lands in another's
commit. A line is `- [ ]` while open, `- [x] … → <id>` while its job runs, and removed when the
job merges or is abandoned. An epic's line (ending `— epic: factory/epics/<slug>.md`) is
`- [x] … → epic <slug>` while the epic runs, and removed when it lands or is abandoned; its
member jobs never get lines of their own.

**The backlog check** (the first thing each of those steps does). Run
`git status --porcelain -- factory/backlog.md` from `<R>`. If it prints anything,
`factory/backlog.md` already has uncommitted changes (someone's hand edits): never sweep them
into your commit. Release the lock, stop with the one line "commit or discard your backlog
edits first", and leave the backlog as it is. Each step below says what that stop means for it.

**Live jobs** are the jobs whose `job.json` (read-only to you) has a stage other than
`merged`. That includes `needs-human`, because those branches still have to merge.
**Running epics** are the epics whose `factory/jobs/epics/<slug>/epic.json` (read-only to you)
has a state other than `landed` or `abandoned`.

**Overlap check** (part of every claim, right after the backlog check). Compare the new work with each live job's title
and `feature.md`, and its `spec.md` Touchpoints if they're written yet. The question is whether
they look likely to change the same area: the same module, the same surface or component, the
same doc. A judgment call at a glance is enough; no file-level analysis is needed. If they
overlap, release the lock and ask the user in a sentence before starting: *"This and live job
<id> both change the same module, so they'll likely conflict at merge. Start it anyway, or take
the next backlog line that doesn't overlap?"* Then do what they say. Most work won't overlap, so
don't ask when it doesn't.

## Spawning agents

Agents get context from **files, not the conversation**. Every spawn prompt is just this card
(drop lines that don't apply), with `subagent_type` set to the agent's name:

```
Factory job <id>. Your instructions are in your agent definition; all context is in these files.
repo:     <R>
job dir:  <R>/factory/jobs/<id>
worktree: <R>/factory/.worktrees/<id>   (branch factory/<id>)
base:     <target>
round:    <N>
brief:    <R>/factory/briefs/<slug>.md      (spec-writer and approver, when the job has one)
write:    <the one absolute path this agent writes>
deliver:  create the write: file with the Write tool. It is pipeline input, not a report. Reply with one line only.
```

Keep the `deliver:` line. Claude Code tells every subagent not to write findings `.md`
files and to return them as text. Reviewers sometimes obey that and send the review as their
reply, which leaves no file.

Don't pass `model` — each agent's frontmatter sets it (from `roles` in `factory/config.json`,
rendered by `factory upgrade`). After each agent returns, confirm its
file exists. A nudge or re-spawn below stays inside the agent's original span: no new
`agent.started`, and one `agent.finished` once the file lands. If the file doesn't exist:
1. `SendMessage` the same agent: *"<path> doesn't exist. Create it now with the Write tool
   (pipeline input, not a report), then reply with one line."* It keeps its context, so this
   is quick and doesn't redo its checks. If its reply holds the whole document, don't save
   that text yourself; ask it again to write the file.
2. Still missing → re-spawn the agent once with the same card.
3. Still missing → board: `job.escalated reason='<agent> wrote no <file>'` (allowed in any
   stage; it closes the open spans), then stop and tell the user they can `approve` or `rework`.

If `agent.finished` is rejected because the file's first line is malformed, `SendMessage` the
agent to fix that first line to the exact format its definition gives (`VERDICT: PASS` /
`VERDICT: CHANGES`, or `APPROVE` / `ESCALATE`), then retry. Never edit an agent's file yourself.

## The loop

Every job runs this loop, an epic's jobs included. For a job in an epic (its `job.json` has an
`epic`), `<target>` is the epic branch `factory/epic/<slug>`, so its worktree branches from it
and its reviewers diff against it, and it merges by **Member merge** (under **Epics**) wherever
this loop says **Merge**.

**1 · Spec.** Board: `stage.entered stage=spec`. Spawn `factory-spec-writer` → `spec.md`
(span `role=spec-writer`). Board: `job.titled title='<spec.md's # H1>'`.
Then read spec.md's "Contract conflicts / open questions". If it lists any item not marked
"approved in brief", the spec has open questions: board:
`job.escalated reason='spec has <n> open question(s): <the first, with its assumed answer>'`
(`<n>` counts those items), and stop before step 2: no worktree, no build. Tell the user the
question(s) and that they answer with `/factory rework <id> "<answer>"`. Never build on an open
question, and never ask it in chat instead: the escalation puts it on the board.

**2 · Worktree.** `git worktree add -b factory/<id> factory/.worktrees/<id> '<target>'`
(if the branch already exists: `git worktree add factory/.worktrees/<id> factory/<id>`).

**3 · Build.** Board: `stage.entered stage=build`. Spawn `factory-builder` (name it
`builder-<id>` if your Agent tool takes a name) → `build.md`, commits on the branch. The span is
always `role=builder name=builder-<id>`, literally, never the agent id: `agent.started` runs
before the spawn, so no id exists yet. Keep the agent id the Agent tool returns in your own
context; it is the `agentId=` on each builder `agent.finished` and the `SendMessage` target when
you resume the builder (wherever this skill says "`SendMessage` to `builder-<id>`", send to that
id when the tool gave you one). Wait for it to return.

**4 · Review round N** (N = previous round + 1, starting at 1). `mkdir jobs/<id>/round-<N>/`,
board: `round.started round=<N>` (the CLI fills in the reviewers from `factory/config.json`).
Then one `agent.started role=reviewer key=<key> round=<N>` per configured reviewer, and spawn
**all of them in one message**, in the background: `factory-<key>` writing
`round-<N>/review-<key>.md`. As each one returns and its file exists, board:
`agent.finished role=reviewer key=<key> round=<N> agentId=<its agent id>` (that sets its chip).

**WAIT FOR ALL.** The round is done only when every reviewer's file exists and has its
`agent.finished`. Never resume the builder, start the approver, or decide anything mid-round
(the CLI refuses to leave review early).

**5 · Gate.**
- All `PASS` → step 6.
- Any `CHANGES` and `round < maxRound` → board: `stage.entered stage=build`, then resume the
  **same** builder (span `role=builder name=builder-<id> round=<N>`): `SendMessage` to
  `builder-<id>` — *"Round <N> reviews are in <R>/factory/jobs/<id>/round-<N>/. Address every
  [blocking] finding, update build.md, commit."* When it returns, go to step 4.
- Any `CHANGES` and `round == maxRound` (default `maxRound` 2) → step 6; the approver will
  escalate.

**6 · Approve.** Board: `stage.entered stage=approve`. Spawn `factory-approver` →
`decision.md` (span `role=approver`; its `agent.finished` records the decision). Read the first
line:
- `APPROVE` → **Merge** (below).
- `ESCALATE` → board: `job.escalated reason='<one-line reason>'`. Tell the user why, and that
  they can `/factory approve <id>` or `/factory rework <id> "<note>"`.

## Merge

This is a standalone job's merge into its target from the main checkout. A job in an epic merges
into the epic branch instead, by **Member merge** under **Epics**.

Take `factory/.lock` first. Another session may be merging. Everything below runs from the
main checkout, which must be on the job's `<target>`. Check it first with
`git symbolic-ref --short HEAD`. If it is on another branch `<x>` (or detached: `<x>` is
`detached HEAD`), release the lock, board:
`merge.failed reason='checkout is on <x>, job targets <target>'` (the job goes to
`needs-human`; `<x>` is whatever the checkout's branch is called, so write any apostrophe
in it as `'\''`, as for every board value), and stop: tell the user to switch the main
checkout to `<target>` themselves and retry with `/factory approve <id>`. Never run `git checkout` or `git switch` here. The main
checkout is the user's working tree, maybe with uncommitted work.

```bash
git merge --no-ff factory/<id> -m '<Merge message: line from decision.md>' \
  -m 'Factory job <id>.' -m 'Co-Authored-By: Claude <noreply@anthropic.com>'
```

The merge message is the approver's text: keep it in single quotes and write any apostrophe in it
as `'\''` (as for board values), so `$` and backticks in it are never expanded.

- **Conflict** (after the failed `git merge`, `git diff --name-only --diff-filter=U` lists at
  least one path) → the job goes back to its own builder, in order:
  1. Before anything else, list the conflicting paths (`git diff --name-only --diff-filter=U`)
     and the sha of `<target>` (`git rev-parse --short <target>`), and keep `git merge`'s
     one-line summary. Then `git merge --abort`.
  2. Then release the lock (`rmdir factory/.lock`).
  3. If `conflicts` in job.json is already 2 (a missing key counts as 0), the job has had its
     two tries: board: `merge.failed reason='merge conflict with <target> after 2 resolved
     conflicts'` (the job goes to `needs-human`), and stop: tell the user they can
     `/factory rework <id> "<note>"` or resolve it themselves.
  4. Otherwise write `jobs/<id>/conflict-<c>.md` (`c` = `conflicts` + 1). The note holds facts
     only: the target branch and its sha, the conflicting paths, and `git merge`'s one-line
     summary. No advice on how to resolve it; the builder's definition has that.

     ```
     # Conflict <c> — <id>
     Target: <target> @ <sha>
     Merge: <git merge's one-line summary>
     Conflicting paths:
     - <path>
     ```
  5. Board: `merge.conflicted reason='merge conflict with <target>: <n> path(s), back to the
     builder'`. The CLI moves the job to `build` with a fresh budget (`maxRound` = round + 2) and
     counts the conflict. If the CLI refuses `merge.conflicted`, board: `merge.failed
     reason='merge conflict with <target>, merge.conflicted refused: <its one-line reason>'` and
     stop as in 3.
  6. Resume `builder-<id>` (span `role=builder name=builder-<id> round=<round>`) with
     `SendMessage` — *"Merge conflict note: <R>/factory/jobs/<id>/conflict-<c>.md. Merge
     `<target>` into the branch, resolve it, run the gate, add a `## Conflict <c>` section to
     build.md, commit."* If that builder isn't alive in this session, spawn a fresh
     `factory-builder` named `builder-<id>` with the card plus the note path (everything it needs
     is in files).
  7. Continue at step 4 with round `<round> + 1`, then the approver (step 6), then **Merge**
     again. The reviewers' diff includes the builder's merge commit.
- **Refusal** (any other failure: a stray `.git/index.lock`, uncommitted changes in the way, or
  anything else, with no conflicting paths) → `git merge --abort` (if a merge is in progress),
  release the lock, board: `merge.failed reason='git merge into <target> refused: <its one-line
  error>'`, and stop: tell the user what blocked it and that they can retry with
  `/factory approve <id>`. (A stray `.git/index.lock` means something else is mid-commit; wait
  a few seconds and retry once before giving up.)
- Success → board: `job.merged sha=<short sha>` **immediately**, before any cleanup, so git and
  the board never disagree. Then `git worktree remove factory/.worktrees/<id>` and
  `git branch -d factory/<id>`; if cleanup fails, report it and carry on (the merge stands).
- **Post-merge check.** If `<target>` had moved past the branch's base, run the gate on `<target>` and
  report the result (don't auto-revert). The gate is `gate` in `<R>/factory/config.json`: its
  shell commands run in order from the repo root, and it is green only when every command
  exits 0. If `config.json` has no `gate`, no gate is configured: tell the user so instead of
  running anything, and never invent a command.
- Then **archive** the job, before bookkeeping: run `bun factory/cli.ts archive <id>` from `<R>`.
  It copies the job's record to the `factory/archive` branch with git plumbing and never touches
  the checkout. If it fails, or says archiving is disabled, report its line to the user in one
  line and carry on: a failed or disabled archive never fails or undoes the merge (the local
  job dir stays, and `archive --all` catches it up later). Never push `factory/archive`.
- Then **bookkeeping**, so every job leaves `<target>` clean. First run **the backlog check**.
  If `factory/backlog.md` already has uncommitted changes, the merge stands (`job.merged` is
  logged) and only the bookkeeping waits: release the lock and tell the user "commit or discard
  your backlog edits first", that the merge landed, and which bookkeeping you skipped (removing
  the job's backlog line, marking the brief `done` with its `- Job:` line, and the
  `record job <id>` commit), for them to do once their edits are committed or discarded.
  Otherwise, remove the job's line (`- [x] … → <id>`) from `factory/backlog.md`; don't tick it,
  the line goes. When `job.json` has a non-null
  `brief`, mark that brief done: set that brief's `Status:` line to `done` and add
  `- Job: <id> (merged <short sha>, <YYYY-MM-DD>)` right below it (the `<short sha>` you passed
  to `job.merged`, and today's date). Then commit by pathspec, so nothing else of the user's
  gets swept in, the brief together with the backlog line's removal: `git commit -m
  "chore(factory): record job <id>" -m "Co-Authored-By: Claude <noreply@anthropic.com>" --
  factory/backlog.md factory/briefs/<slug>.md`. With no brief, commit the backlog only, ending
  the same command with `-- factory/backlog.md` (nothing changed → skip).
- Release the lock (`rmdir factory/.lock`).
- Never push. Pushing stays a human decision.

## Epics

An **epic** runs several briefs as ordinary jobs, its **members**, in the order its plan
`factory/epics/<slug>.md` gives (each `## Members` item names a brief, with optional `after:`
members it waits on). Members branch from, are reviewed against, and merge into the epic's own
branch, `factory/epic/<slug>`, checked out at `<R>/factory/.worktrees/epic-<slug>`; when every
member has merged, the epic **lands** on its target with one merge. Below, `<slug>` is the epic's
slug and `<target>` is the epic's target (`target` in `epic show`), never the epic branch. Besides
members, an epic may claim two kinds of **generated** jobs inside itself: a **sync** job (brings
`<target>` into the epic branch after a catch-up conflict) and a **fix** job (makes a red gate
green before landing). Every epic job runs **The loop**.

The CLI owns the epic's setup, teardown, log, and scheduling; you own every merge (members,
catch-ups, landing) and record each outcome as an event. You never write `epic.json` or the
epic's log. Run, from `<R>`:

```bash
bun factory/cli.ts epic start <slug> [session=…]          # set up the branch and worktree; logs epic.started
bun factory/cli.ts epic event <slug> <type> [k=v …]       # epic.waiting | epic.resumed | epic.landing | epic.landed
bun factory/cli.ts epic next <slug>                       # what to do now: claim <member> lines, or land
bun factory/cli.ts epic show <slug>                       # state, members, generated jobs, why it waits
bun factory/cli.ts epic abandon <slug> '<reason>' [--force] [--delete-branch]
```

A non-zero exit wrote nothing (or, for `epic abandon`, names what it left behind): read its one
line and fix the cause or tell the user. Free-text values are single-quoted, as on the board.

### Start or resume

`/factory epic <slug>`, and `/factory next` on an epic's backlog line, first read the epic's
state with `bun factory/cli.ts epic show <slug>`.

**Not started** (`epic show` says it has not started):
1. Read the plan. Its `Status:` must be `ready`. A `draft` plan's interview isn't done: say so
   (`/factory explore <slug>` finishes it). A `done` plan has landed: say `epic <slug> landed
   (<sha>)` from its `- Landed:` line. An `abandoned` plan has had its one run: say so. Each of
   these stops before starting anything.
2. **The abandoned-brief question, once.** List every member brief that has `- Abandoned:`
   lines, each with its latest attempt (job id and reason), and ask once, before taking the
   lock: *"These member briefs were abandoned before: <slug> as <id>: '<reason>'; … Start the
   epic anyway, or revise them first with `/factory explore`?"* Start anyway → go on; revise (or
   anything unclear) → stop, starting nothing. No such brief → don't ask.
3. **The overlap question, once.** Compare the epic as a whole (every member brief's Intent and
   Scope) with each live job that has no `epic` and each other running epic (its plan), at a
   glance, as the overlap check does. If they overlap, ask once: *"This epic and <id or epic
   slug> both change the same module, so they'll likely conflict at landing. Start it anyway?"*
   and do what the user says. Never compare members with each other: the `after:` edges already
   decided what runs in parallel, and conflicts between members are handled at **Member merge**.
4. Run **the thread lookup** (once for the whole run).
5. Take `factory/.lock`. When the backlog has an open line for this plan
   (`- [ ] … — epic: factory/epics/<slug>.md`), run **the backlog check** first (if it stops you,
   nothing is started). Run `bun factory/cli.ts epic start <slug> [session=…]`: it checks the
   plan, creates `factory/epic/<slug>` from the target and its worktree, logs `epic.started`, and
   prints `running`. A non-zero exit started nothing: release the lock, leave the line unticked,
   and report its one line. Then tick the line as `- [x] … → epic <slug>` and commit it at once
   by pathspec, still under the lock: `git commit -m "chore(factory): start epic <slug>" -m
   "Co-Authored-By: Claude <noreply@anthropic.com>" -- factory/backlog.md` (no line → no commit).
   Release the lock.
6. Run **The epic loop**.

**`running` or `waiting`:** resume and take over driving. Ask neither start question (both were
asked when it began). Run **the thread lookup**, then `bun factory/cli.ts epic event
<slug> epic.resumed [session=…]`: it records this session as the driver and, from a logged
`waiting`, puts the epic back where it was, and prints the state. Taking over assumes any
earlier driving session has stopped. If it prints `landing` (a `waiting` logged during landing,
such as a wrong checkout or a refused landing merge), or the CLI refuses `epic.resumed` because
the epic is `landing`, go on as for `landing`. Otherwise run **The epic loop** from the files.

**`landing`** (a driver stopped partway through landing; the CLI refuses `epic.resumed` there),
or an `epic.resumed` that printed `landing`: run **the thread lookup** if you haven't yet, for
any claim this session makes, and continue at **Landing**, "Resuming a landing".

**`landed` or `abandoned`:** say so, with its note, and stop.

### The epic loop

You drive every epic job yourself, interleaved. Each runs **The loop**, and **every agent is
spawned in the background**, so several jobs move at once; as each agent returns (and its file
exists), take that job's next step, then go back to waiting. Never block on one job while
another could move. **WAIT FOR ALL** still holds within each job's review round.

**Schedule.** When the epic starts or resumes, and whenever an epic job merges, leaves a working
stage, or is abandoned, first read the epic's state (`epic show <slug>`). **While it is
`landing`**, `epic next` prints nothing, so don't run it: drive any live sync or fix job, and
once none is live, go back to **Landing** from step 1, skipping `epic.landing` (already logged).
Otherwise run `bun factory/cli.ts epic next <slug>` and do exactly what it prints, nothing more:
- `claim <member>` → run **Catch-up** first; if it claimed a sync job, claim no member now. Then
  `bun factory/cli.ts claim <member> epic=<slug> brief=factory/briefs/<member>.md session=…`
  (the `session=` from the start or resume lookup, left off when it found none; no `maxRound=`:
  the plan's, else the config's, applies). Use the printed id, write its `feature.md`
  (`<the brief's # title> — brief: factory/briefs/<member>.md (member of epic <slug>)`), and run
  its loop from step 1. A refused claim claimed nothing: report its one line.
- `land` → **Landing**.
- nothing → read `epic show <slug>`. While an epic job is still in a working stage, keep waiting on
  its agents. Otherwise the epic is waiting on you: tell the user which jobs are in
  `needs-human` (each id and why), that they can `/factory approve`, `rework`, or `abandon` each
  in this session, and stop.

**State lives in files, never in your memory.** After a compaction, on a resume, or whenever
unsure, re-read `epic show <slug>` (members, their jobs and stages, generated jobs) and each epic
job's `job.json` (`stage`, `round`, `maxRound`, `decision`, `conflicts`, and its open spans:
`timing.agents` entries with `finishedAt` null), and look at which of its files exist. Continue
each job from what they say: an open span whose file exists → `agent.finished`, then the next
step; an open span whose agent isn't alive in this session → re-spawn it once with the same
card, inside that span (**Spawning agents**). When the old builder isn't alive, spawn a fresh
`factory-builder` named `builder-<id>` with the card plus the newest review round, rework note,
or conflict note it must address: everything it needs is in files (the rework path).

**Status lines name the epic**: `<epic> · <id> review round <N>: <k>/<n> in` (e.g.
`checkout-flow · 027 review round 1: 3/4 in`).

**A member escalates** (approver `ESCALATE`, budget spent, no file, a merge conflict past its two
tries, or open questions in its spec at step 1): it goes to `needs-human` exactly as a standalone job does. Log it as **The loop** says,
tell the user in one line, and keep driving: independent members keep running, and its dependents
stay unclaimed (`epic next` won't offer them). Never retry, rework, or approve it on your own;
that is the user's call, in this session.

**A member is abandoned.** The epic can't land while an abandoned member is in its plan, and its
dependents (members whose `after:` reaches it, directly or through others; `epic show` lists them
as blocked on it) can never run. Ask the user once: *"Member `<m>` (<id>) is abandoned, and
<dependents, or no member> depend(s) on it. Drop it and its dependents from the plan, or abandon
the epic?"* Then do what they say:
- **Drop** → take `factory/.lock`, remove those members' items from the plan's `## Members` (and
  any `after:` entry naming them), and commit the plan at once by pathspec: `git commit -m
  "chore(factory): drop <members> from epic <slug>" -m "Co-Authored-By: Claude
  <noreply@anthropic.com>" -- factory/epics/<slug>.md`. Release the lock, then **Schedule**. This
  removal is the only edit you ever make to a running epic's members.
- **Abandon the epic** → `/factory epic abandon <slug> <reason>`.
- Anything unclear → change nothing; the epic waits on you.

An abandoned sync or fix job isn't a plan member: nothing to drop. The next catch-up or landing
tries again.

### Catch-up

Before each member claim and before landing, the epic brings in its target, **only when the
target has moved**. In the epic worktree (`cd <R>/factory/.worktrees/epic-<slug>`):

```bash
git merge-base --is-ancestor <target> factory/epic/<slug>
```

Exit 0 → up to date, nothing to do. Otherwise merge the target into the epic branch there, as a
merge commit, never a rebase:

```bash
git merge --no-ff <target> -m 'Merge <target> into factory/epic/<slug>' \
  -m 'Co-Authored-By: Claude <noreply@anthropic.com>'
```

- Clean → go on.
- **Conflict** (`git diff --name-only --diff-filter=U` lists at least one path) → record the
  conflicting paths and the target's sha (`git rev-parse --short <target>`), then
  `git merge --abort`. Claim a **sync job**: `bun factory/cli.ts claim sync-<sha> epic=<slug>
  kind=sync session=…` (no `brief=`; the CLI refuses one). Write its `feature.md`, generated:

  ```
  Sync epic <slug> with <target>
  Merge <target> @ <sha> into factory/epic/<slug> and resolve the conflicts, keeping both sides'
  intent. The gate stays green.
  Conflicting paths:
  - <path>
  ```

  and run its loop. **While a sync job is live, no member is claimed** (`epic next` offers none,
  and the CLI refuses), and running members keep going. Claiming resumes once the sync job merges
  (**Member merge**, then **Schedule**).
- Any other failure → `git merge --abort` (if a merge is in progress), board the epic:
  `epic event <slug> epic.waiting reason='catch-up merge of <target> refused: <its one-line
  error>'` (an apostrophe as `'\''`), and stop: tell the user what blocked it and that `/factory epic <slug>` retries.

### Member merge

When an epic job is approved (its approver's `APPROVE`, or `/factory approve` in this session),
it merges into the epic branch. Follow **Merge**, with these differences:
- No `factory/.lock` and no checkout check. Every git command runs in the epic worktree,
  `<R>/factory/.worktrees/epic-<slug>`, which is always on `factory/epic/<slug>`; never in the
  main checkout.
- `<target>` is `factory/epic/<slug>`: `git merge --no-ff factory/<id> …` there, with the same
  message.
- A **conflict** follows **Merge**'s conflict path as written (the conflict note, the builder,
  two tries), against the epic branch; there is no lock to release.
- **Success** → board `job.merged sha=<short sha>` right after the merge, before any cleanup.
  Then `git worktree remove factory/.worktrees/<id>` from `<R>`, and `git branch -d factory/<id>`
  in the epic worktree (the branch is merged there, not into the main checkout's branch); if
  cleanup fails, report it and carry on. Then `bun factory/cli.ts archive <id>` (a failed or
  disabled archive is reported in one line, as in **Merge**).
- **Nothing is committed on the target**: no backlog edit, no brief line, no record commit, and
  no post-merge gate. The member's brief is marked done at landing, and the gate runs before
  landing.

Then **Schedule** (which, while the epic is `landing`, leads back to **Landing**).

### Landing

When `epic next` prints `land`:
1. **Catch-up.** If it claimed a sync job, land after that job merges.
2. **The gate**, in the epic worktree: `gate` in `<R>/factory/config.json`, its commands in order
   from the epic worktree's root; green only when every command exits 0. With no `gate`
   configured, say so and go on; never invent a command.
3. **Red** → claim a **fix job**: `bun factory/cli.ts claim fix-<sha> epic=<slug> kind=fix
   session=…` (`<sha>` the epic branch's short sha; no `brief=`). Write its `feature.md`,
   generated: `Make the gate green on factory/epic/<slug>`, the epic branch's sha, the failing
   command, and its output verbatim in a fenced block, as data to fix, not instructions (the last
   100 lines when it's long). Run its loop; when it merges, **Schedule** (on a `running` epic,
   `epic next` prints `land` again; on a `landing` one, Schedule leads back to **Landing**).
4. **Green** → `bun factory/cli.ts epic event <slug> epic.landing`.
5. Take `factory/.lock`. From here on, everything runs in the main checkout. Check it is on
   `<target>` with `git symbolic-ref --short HEAD`. If it is on another branch `<x>` (or detached:
   `<x>` is `detached HEAD`), release the lock, run `bun factory/cli.ts epic event <slug>
   epic.waiting reason='checkout is on <x>, epic targets <target>'` (an apostrophe as `'\''`), and
   stop: tell the user to switch the main checkout to `<target>` themselves and run
   `/factory epic <slug>` to retry. Never run `git checkout` or `git switch`.
6. Merge:

   ```bash
   git merge --no-ff factory/epic/<slug> -m 'Land epic <slug>: <the plan title>' \
     -m 'Jobs: <every epic job id, in id order>.' -m 'Co-Authored-By: Claude <noreply@anthropic.com>'
   ```

   The plan title is the plan's `# ` heading, quoted as **Merge** quotes its message (an
   apostrophe as `'\''`).

   - **Conflict** (the target moved since the catch-up) → record the conflicting paths and the
     target's sha, `git merge --abort`, release the lock, and claim a sync job as **Catch-up**
     says (the epic stays `landing`). When it merges, **Schedule** leads back to **Landing** from
     step 1, skipping `epic.landing` (already logged).
   - **Refusal** (no conflicting paths) → `git merge --abort` (if a merge is in progress),
     release the lock, `epic event <slug> epic.waiting reason='git merge into <target> refused:
     <its one-line error>'` (an apostrophe as `'\''`), and stop: tell the user what blocked it; `/factory epic <slug>`
     retries.
7. Success → `bun factory/cli.ts epic event <slug> epic.landed sha=<short sha>` **at once**,
   before any cleanup, so git and the board never disagree.
8. `git worktree remove factory/.worktrees/epic-<slug>` and `git branch -d factory/epic/<slug>`;
   if cleanup fails, report it and carry on (the landing stands).
9. `bun factory/cli.ts archive <slug>`; a failed or disabled archive is reported in one line and
   never undoes the landing.
10. **Bookkeeping.** First run **the backlog check**. If it stops you, the landing stands and
    only the bookkeeping waits: release the lock and tell the user "commit or discard your
    backlog edits first", that the epic landed, and which bookkeeping you skipped (below).
    Otherwise:
    - remove the epic's line (`- [x] … → epic <slug>`) from `factory/backlog.md`;
    - give each member brief `Status: done` and, right below it, `- Job: <id> (merged <member
      sha> via epic <slug>, <YYYY-MM-DD>)`: the member's newest job, and the sha its `job.merged`
      logged (its `job.json` `note` reads `merged <sha>`);
    - give the plan `Status: done` and, right below it, `- Landed: <short sha> (<YYYY-MM-DD>)`
      (the sha you passed to `epic.landed`);
    - make one pathspec commit: `git commit -m "chore(factory): land epic <slug>" -m
      "Co-Authored-By: Claude <noreply@anthropic.com>" -- factory/backlog.md
      factory/epics/<slug>.md factory/briefs/<member>.md …` (every member brief).
11. Release the lock (`rmdir factory/.lock`), and tell the user the epic landed. Never push.

**Resuming a landing.** First re-read state from the files, as **The epic loop** says ("State
lives in files"), and drive any live sync or fix job until it merges; never claim a second sync
job while one is live. Once no epic job is live, check in the main checkout whether the epic
branch is already in `<target>` (`git merge-base --is-ancestor factory/epic/<slug> <target>`).
If not, run **Landing** from step 1, skipping `epic.landing`. If it is, step 6 happened: take the
lock, log `epic.landed` with the short sha of that `Land epic <slug>` merge commit, and go on
from step 8.

### Member commands

`/factory approve`, `rework`, and `abandon <id>` on a job whose `job.json` has an `epic` run only
in the session driving that epic (the one that started or last resumed it with
`/factory epic <slug>`). Any other session refuses, changing nothing, with the one line:
"<id> is in epic <slug>; run it in the epic's session, or `/factory epic <slug>` to take it
over". In the driving session:
- **approve** runs as the command says, recreating the worktree from `factory/epic/<slug>` when
  it's gone, and merges by **Member merge**: into the epic branch, never the target.
- **rework** runs as the command says; the job then goes on in **The epic loop**.
- **abandon** runs as the command says, with its two questions and the CLI call, but the job has
  no backlog line: skip the backlog check and the line. For a member, take `factory/.lock`, add
  its brief's `- Abandoned:` line as the command says, and commit just the brief:
  `git commit -m "chore(factory): abandon job <id>" -m "Co-Authored-By: Claude
  <noreply@anthropic.com>" -- factory/briefs/<member>.md`, then release the lock (a sync or fix
  job has no brief: nothing to commit). Then **A member is abandoned**.

## Commands

**`/factory <feature>`** — New job. If the text names a brief (`brief: factory/briefs/<slug>.md`),
its `Status:` must be `ready`. If it is `done`, a job already carried it out: stop before claiming
and say `brief <slug> is done (job <id>)`, with the job from its `- Job:` line. Separately, a draft
brief means the interview isn't done, so stop before claiming and say so. If the brief has
`- Abandoned:` lines, a job already tried it and was closed: ask once, before claiming and
before taking the lock, quoting its latest attempt: *"Brief `<slug>` was abandoned as job
`<id>`: '<reason>'. Start it again, or revise it first with `/factory explore <slug>`?"* Start
again → go on; revise (or anything unclear) → stop, claiming nothing. Otherwise **claim** it
under the lock (backlog check and overlap check first): pick a 2–4 word kebab slug for the work and run
`bun factory/cli.ts claim <slug>` with `brief=factory/briefs/<slug>.md` when it applies (add
`maxRound=<n>` only to override the config default, and `session=…` from **the thread lookup**,
run first). The CLI picks the number and prints the
job's id, e.g. `004-export-csv-report`; use that id from then on. Write `feature.md` verbatim.
If the work has a backlog line, tick and commit it as **Claim** under **Running jobs side by
side** says; free text with no backlog line makes no backlog commit. Then release the lock and
run the loop. If **the backlog check** stops the claim, nothing is claimed: no `claim`, no job.

**`/factory queue <text>`** — Add ready work to the backlog without running it. Work arrives
as text. It is **ready** if it isn't blocked by unmerged work and you can say in one line what
"done" looks like.
- Ready → distill it into `- [ ] <one line>`. The line carries what defines done — behaviors,
  limits, must-nots (e.g. *no new runtime dependency*) — and none of the history or rationale.
- Not ready → don't queue it; say why in a sentence and suggest `/factory explore <idea>`.

Then take `factory/.lock` and run **the backlog check** (if it stops you, nothing is queued).
Append the lines and commit just the backlog by pathspec, still under the lock:
`chore(factory): queue <title>` (+ the Co-Authored-By trailer) `-- factory/backlog.md`. Release
the lock, then show the user the lines you added; never hold the lock while you ask the user
anything. `queue` never starts a job.

**`/factory explore <idea | brief slug>`** — An interactive interview that turns a fuzzy
idea into a brief, then queues it. Read [explore.md](explore.md) in this skill's folder and
follow it. It runs entirely in this session with the user; it spawns no agents.

**`/factory customize`** (alias **`/factory init`**) — An interactive interview that tailors
the project's overlay (`factory/config.json` and `factory/roles/<role>.md`), then runs doctor
and commits it. Follow **Customize** below. It runs entirely in this session with the user; it
spawns no agents, claims no job, and never runs the `factory init` or `factory upgrade` installer.

**`/factory next [words]`** — Under the lock, run **the backlog check** (if it stops you,
nothing is claimed), re-read `factory/backlog.md` (another session may have just ticked a line)
and pick a `- [ ]` item:
- no argument → the first one;
- words → the line they clearly describe, matched by meaning, not exact text.

A ticked `- [x] … → <id>` line is a running job: never pick it; if the words describe it,
report it as running job `<id>`. A ticked `- [x] … → epic <slug>` line is a running epic: never pick
it; report it as running epic `<slug>`. A picked line ending `— epic: factory/epics/<slug>.md` is
an epic: release the lock and start it as `/factory epic <slug>` does (its start-time questions
first, then `epic start` and the tick as `- [x] … → epic <slug>`, committed by pathspec under the
lock), then drive it. Claim the line as `/factory <item text>` does, and tick it as
`- [x] … → <id>` and commit it (`chore(factory): claim job <id>`) in the same step, as **Claim**
says. If its brief has `- Abandoned:` lines, release the lock and ask the abandoned-brief
question from `/factory <feature>` first; on start again, take the lock and re-read. If the
overlap check or that question stops you, leave the line unticked. Then run the loop.

Don't guess. If there's nothing unchecked, or nothing matches, release the lock and stop. When
the words match no open line but describe finished work, say it already ran and which job: find
it by the done briefs' `- Job:` lines (`factory/briefs/*.md` with `Status: done`), never by
ticked lines, since a merged job's line is gone from the backlog. If the words fit more than one
line, release the lock and ask which one.

**`/factory approve <id>`** — Human override for a `needs-human` job. A job in an epic: see
**Member commands** under **Epics** first. Refuse any other stage:
a job in flight belongs to the session running it.
If the job stopped before anything was built (job.json's `stoppedFrom` is `spec` or `claimed`:
an open question at the spec step, or a spec writer that wrote no spec.md), refuse, changing
nothing, with the one line: "<id>: nothing built; answer with rework" (`/factory rework <id>
"<answer>"`).
If the approver never ran on this work (no `APPROVE`/`ESCALATE` from it, so job.json's `decision`
is null: an escalation before or during review, or after a rework before the approver), say so and
ask before merging work the approver never checked. (A retry after a failed merge already shows
`APPROVE (human)`; the human answered that the first time.)
Recreate the worktree if it's gone (step 2, from the job's `<target>`), run **the thread lookup**,
board: `job.human-approved [session=…]` (every time, also when
retrying after a failed merge; leave decision.md alone, it's the approver's), and **Merge**.
If **Merge** finds a conflict, the job enters the same loop as any conflict: the builder
resolves it, a review round runs, then the approver, then **Merge** again, and this session
drives it on. `merge.conflicted` clears the human approval (the human approved the work before
the resolution existed), so an approver `ESCALATE` there comes back to the human, as any
escalation does.

**`/factory rework <id> <note>`** — Send a `needs-human` job back with human feedback. A job in
an epic: see **Member commands** under **Epics** first. Write
the note verbatim to `rework-<k>.md` (`k` = `reworks` + 1, from job.json), recreate the worktree
if needed (step 2, from the job's `<target>`; not for a job that stopped before anything was
built, below), run **the thread lookup**, board:
`job.reworked k=<k> maxRound=<round + 2> [session=…]` (a fresh review budget; it clears
the decision).
If the job stopped before anything was built (job.json's `stoppedFrom`, read before
`job.reworked`, is `spec` or `claimed`), `job.reworked` puts it back in stage `spec`: spawn `factory-spec-writer` again with the card plus the rework path (span
`role=spec-writer`), also when `spec.md` already exists: the note answers its open questions.
Board: `job.titled title='<spec.md's # H1>'`, then run step 1's open-question check on the new
spec.md (an item the note didn't settle escalates again) and continue at step 2 of **The loop**
(a fresh builder; round 1 follows). Otherwise, resume
`builder-<id>` with SendMessage (span `role=builder name=builder-<id> round=<round>`) —
*"Human rework note: <R>/factory/jobs/<id>/rework-<k>.md. Address it, update build.md,
commit."* If that builder isn't alive in this session, spawn a fresh `factory-builder` named
`builder-<id>` with the card plus the rework path (everything it needs is in files). Then
continue at step 4 with round `<round> + 1` (round 1 if the job escalated before any review).

**`/factory abandon <id> <reason>`** — Close a job for good, without merging: it leaves the
board, its worktree is removed, and it can never take another event. A job in an epic: see **Member
commands** under **Epics** first. Read the job's `stage` from
job.json. Refuse `merged` and `abandoned` (both are terminal). Otherwise ask the user two
questions, one at a time, and wait for each answer:
1. **Confirm.** *"Abandon <id> (<stage>): '<reason>'? This can't be undone."* From a working
   stage (`claimed`, `spec`, `build`, `review`, `approve`), also ask them to confirm that the
   session driving the job is stopped: abandon never stops agents, and a session still running
   would keep working on a closed job. Anything but a clear yes: stop and change nothing.
2. **The branch.** *"Keep the branch `factory/<id>`, or delete it?"* The default is **keep** (an
   unclear answer keeps it).

Then, from `<R>`, run

```bash
bun factory/cli.ts abandon <id> '<reason>'
```

adding `--force` only when the job is in a working stage (never from `needs-human`), and
`--delete-branch` only when the user chose delete. Quote the reason as for any free-text value.
It logs `job.abandoned`, then removes `factory/.worktrees/<id>` (and the branch, if asked), and
prints `abandoned`. A non-zero exit before the event is logged (a wrong stage without
`--force`, a bad id or reason) changed nothing: report the one-line reason. A non-zero exit
naming what was left behind means the job **is** abandoned but cleanup failed: tell the user
what to remove by hand. Never write the event yourself to get around a refusal.

Before running the CLI (after both answers), run **the backlog check**: if
`factory/backlog.md` already has uncommitted changes, stop with "commit or discard your backlog
edits first"; nothing is abandoned and nothing changes. Once the job is abandoned (the CLI
printed `abandoned`, or named what it left behind), run `bun factory/cli.ts archive <id>` from
`<R>` to copy its record to the `factory/archive` branch. If it fails, or says archiving is
disabled, report its line in one line and carry on: a failed or disabled archive never fails the
abandon. Never push `factory/archive`. Then take `factory/.lock`, run the backlog check
again (if it stops you now, the job stays abandoned and only this bookkeeping waits: name it to
the user), and then:
- Remove the job's line (`- [x] … → <id>`) from `factory/backlog.md`, so a later
  `/factory next` never picks up abandoned work.
- When `job.json` has a non-null `brief`, add `- Abandoned: <id> (<YYYY-MM-DD>): <reason>`
  right below that brief's `Status:` line (today's date and the reason given; one line per
  attempt, below any earlier `- Abandoned:` lines). `Status:` stays `ready`.
- Commit both by pathspec: `git commit -m "chore(factory): abandon job <id>" -m
  "Co-Authored-By: Claude <noreply@anthropic.com>" -- factory/backlog.md
  factory/briefs/<slug>.md`. With no brief, commit the backlog only, ending the same command
  with `-- factory/backlog.md` (nothing changed → skip).
- Release the lock (`rmdir factory/.lock`).

**`/factory epic <slug>`** — Start or resume an epic, idempotently: `epic start` when it hasn't
started, and on a `running` or `waiting` epic `epic.resumed`, taking over driving. Follow
**Epics**, "Start or resume", then **The epic loop**.

**`/factory epic abandon <slug> <reason>`** — Close an epic for good, without landing. Read its
state with `bun factory/cli.ts epic show <slug>`. Refuse one that hasn't started, `landed`, or
`abandoned`. Otherwise ask the user two questions, one at a time, and wait for each answer:
1. **Confirm.** *"Abandon epic <slug> (<state>): '<reason>'? This can't be undone."* When any
   epic job is in a working stage (`claimed`, `spec`, `build`, `review`, `approve`), name them and
   also ask the user to confirm that members are still working and should be abandoned with it,
   and that no other session is driving the epic. Anything but a clear yes: stop and change
   nothing.
2. **The branch.** *"Keep the branch `factory/epic/<slug>`, or delete it?"* The default is
   **keep** (an unclear answer keeps it).

Before running the CLI (after both answers), run **the backlog check**: if it stops you, nothing
is abandoned and nothing changes. Then, from `<R>`, run

```bash
bun factory/cli.ts epic abandon <slug> '<reason>'
```

adding `--force` only after the user confirmed that members are still working, and
`--delete-branch` only when the user chose delete. It logs `epic.abandoned`, abandons every epic
job that isn't `merged` or `abandoned` (keeping their branches), removes the epic worktree (and
the branch, if asked), and prints `abandoned`. A non-zero exit before that changed nothing: report
its one line. One naming what was left behind means the epic **is** abandoned: tell the user what
to remove by hand. Then run `bun factory/cli.ts archive <slug>` (a failure, or archiving
disabled, is one line and never fails the abandon; never push `factory/archive`). Then take
`factory/.lock`, run the backlog check again (if it stops you now, the epic stays abandoned and
only this bookkeeping waits: name it to the user), and:
- remove the epic's line (`- [x] … → epic <slug>`) from `factory/backlog.md`;
- give the plan `Status: abandoned` and, right below it, `- Abandoned: <YYYY-MM-DD>: <reason>`;
- for each member brief that had a job, add `- Abandoned: <id> (<YYYY-MM-DD>): epic <slug>
  abandoned: <reason>` below its `Status:` line and any earlier `- Abandoned:` lines (`<id>` its
  newest job). Its `Status` stays `ready`, so a new plan can reuse it;
- commit it all in one pathspec commit: `git commit -m "chore(factory): abandon epic <slug>" -m
  "Co-Authored-By: Claude <noreply@anthropic.com>" -- factory/backlog.md factory/epics/<slug>.md
  factory/briefs/<member>.md …` (each brief you changed);
- release the lock (`rmdir factory/.lock`).

## Customize — the overlay interview

`/factory customize` (or `/factory init`) writes only `factory/config.json` and
`factory/roles/<role>.md`, the overlay. It never edits managed files (`.claude/**`,
`factory/cli.ts`, `factory/CONTRACT.md`, `factory/managed.json`) or runtime state
(`factory/jobs/`, `factory/.lock/`, `factory/.worktrees/`), and it writes no events.

**Do your homework first.** Read `factory/config.json` and save its exact bytes (you may need to put
them back), every `factory/roles/*.md`, the contract (`factory/CONTRACT.md`, "`config.json`"
and "Role overlays"), the project's instructions (`CLAUDE.md` or its equivalent), and how the
project builds, tests, and checks itself. Run `bun factory/cli.ts doctor` once to see where the
install stands. List the live jobs (every `factory/jobs/*/job.json` with a stage other than
`merged`; read-only).

**Interview.** Use the same discipline as `explore`: ask **one question at a time**, in prose,
each with your **recommended answer** and the reason for it. Facts are yours to find; decisions
are the user's. Never ask what the code or docs can answer (the project's test and check commands
are facts; which of them gate a merge is a decision). Cover only the v1 overlay, in this order:
1. `name` — the project's display name on the dashboard. Show the current resolved name: `config.json`'s
   `name` when set, else the repo root's folder name (`basename R`). Recommend leaving it unset
   when the folder name is right; no `name` key means the folder name.
2. `reviewers` — the ordered reviewer keys, one per review concern (e.g. correctness and test
   coverage, security, contract).
3. `maxRound` — the default review budget for a new job.
4. `dashboard.settleAfterHours` — how long a merged job stays in the Merged column.
5. `gate` — the shell commands, in order, that must all exit 0; or no gate.
6. `merge.target` — the branch jobs are based on and merge into: `current` (the default: the
   branch the main checkout is on when a job is claimed) or a branch name such as `develop`.
   No `merge` key keeps `current`.
7. `archive.enabled` — whether a finished job (`merged` or `abandoned`) is copied to the
   `factory/archive` branch by `factory archive`, so its record travels with `git clone` and
   `git fetch`. Recommend off unless the user wants the history kept in the repo: job files can
   hold paths, notes, and pasted material, and pushing the branch publishes them (archiving never
   pushes). No `archive` key keeps it off.
8. `epic.maxParallel` — the most members of one epic in a working stage at once (a member in
   `needs-human` holds no slot; sync and fix jobs don't count). Recommend 3, the default; no
   `epic` key keeps it.
9. `roles` — for any role that should not run on the default model (`opus`): its runner
   (`claude`, the only runner in v1) and, optionally, the harness model name (e.g. a cheaper
   model for a narrow reviewer). No entry, or no `roles` key at all, keeps the default.
10. `factory/roles/<role>.md` — for `spec-writer`, `builder`, `approver`, and each configured
   reviewer key: the project's own rules for that role, or no file (the managed defaults apply).

Anything else (a runner other than `claude`, per-role tools or effort, a tracker, any merge policy
beyond `merge.target` such as squashing, PRs, or pushing, conditional reviewers) is not in v1. Say so in a sentence and move on; never write it into the overlay.

**Refusal rules.** Check every change against these before anything is written. A change that
breaks one is refused: tell the user which rule and why, and ask again. Nothing is written for it.
- No key outside v1. `config.json` holds only `schema` (`"factory/v1"`), `name`, `reviewers`,
  `maxRound`, `dashboard` (only `settleAfterHours`), `gate`, `merge` (only `target`), `archive`
  (only `enabled`), `epic` (only `maxParallel`), and `roles`.
- `name`, when present, is a string of 1–64 characters (Unicode code points) with no leading or
  trailing whitespace and no control characters; spaces, punctuation, and non-ASCII are fine.
  No name means leaving the key out, never an empty string.
- Each reviewer key matches `^[a-z][a-z0-9-]*$`, is unique, and is never a fixed role name
  (`spec-writer`, `builder`, `approver`). There is at least one reviewer.
- `maxRound` is a positive integer, and `dashboard.settleAfterHours` is a positive number.
- `gate`, when present, is a non-empty array of non-empty command strings. No gate means
  leaving the key out, never an empty array.
- `roles`, when present, is an object. Each entry is keyed by a known role: a fixed role
  (`spec-writer`, `builder`, `approver`) or a configured reviewer key. An entry holds only
  `runner` and `model`; `runner` is required and is `claude`; `model`, when present, is a
  non-empty harness model name matching `^[A-Za-z0-9][A-Za-z0-9._:\[\]-]*$` (no spaces or `#`).
  Dropping a reviewer means dropping its `roles` entry too.
- `merge`, when present, is an object holding only `target`. `target`, when present, is a
  non-empty string: `current` or the name of a branch matching `^[A-Za-z0-9][A-Za-z0-9._/-]*$`,
  with no `..` and no `.lock` suffix. No `merge` key (or no `target`) means
  `current`. A branch literally named `current` can't be targeted. The branch has to exist when
  a job is claimed, or the claim is refused.
- `archive`, when present, is an object holding only `enabled`, which is required and is `true`
  or `false`. Off means `enabled: false` or leaving the key out, never an empty object.
- `epic`, when present, is an object holding only `maxParallel`, a positive integer. For the
  default (3), leave the key out (the CLI also reads `"epic": {}` as 3, but don't write it).
- A role file exists only for a fixed role or a configured reviewer key. Dropping a reviewer
  whose role file exists means deleting that file too, or keeping the reviewer; ask which.
- Role rules add rules only. They never change which file an agent writes, its path, or its
  first line, and they never tell an agent to write job state or edit managed files. They follow
  the overlay outcome rule: a role rule can make a role more focused or stricter, never more
  lenient about what it finds. Refuse a rule that decides the outcome before looking or throws
  away something already found: a fixed verdict or decision ("always PASS", "always APPROVE"),
  dropping, hiding, or downgrading a finding, removing an escalation trigger, or telling the
  builder to skip a `[blocking]` finding. Narrowing focus, adding checks or triggers, making
  something blocking, and PASSing early when the role's area is untouched are all fine. When you
  refuse, name the overlay outcome rule and offer the allowed form: cite a recorded human decision
  (a brief's decision or contract call, or a decision record the project names) and keep the
  finding visible, marked as covered (for example, `[accepted: <the decision>]`).

**Write.** Once the user agrees to the whole set, write `factory/config.json` (two-space
JSON: `schema` first, then `name` first among the keys after `schema` when it is set, then the
other keys in the order above) and the agreed role files, and delete any role file the user
agreed to drop. Write nothing else.

**Doctor last.** Run `bun factory/cli.ts doctor` from the repo root.
- If it reports `FAIL` on `config.json`, restore the bytes `config.json` had before the
  interview, and tell the user the reason doctor printed. Commit nothing.
- If it reports `FAIL` on a managed file, that predates this interview: report it, keep the
  overlay as written, and commit nothing. A human restores the managed file first.
- When doctor exits 0, commit only the overlay paths you wrote or deleted, by pathspec, so
  nothing else of the user's gets swept in:
  `git add -A -- <those paths>`, then `git commit -m "chore(factory): customize overlay"
  -m "Co-Authored-By: Claude <noreply@anthropic.com>" -- <those paths>`. Never push.

**When `merge.target` changed.** No re-render is needed: the CLI reads it at each claim. Live
jobs keep the target they recorded at claim.

**When `epic` changed.** No re-render is needed: the CLI reads `epic.maxParallel` at each
`epic next` and member claim, so a running epic uses the new cap from its next claim.

**When `archive` changed.** No re-render is needed: `factory archive` reads it at each run.
Turning it on copies nothing by itself; `bun factory/cli.ts archive --all` backfills the jobs
that are already `merged` or `abandoned`, and is the user's call.

**When `reviewers` or `roles` changed.** A new reviewer key has no agent, and a new model
takes no effect, until the managed files are re-rendered. Tell the user to run `factory upgrade` before the next job; never run it yourself,
because upgrade writes managed files. If live jobs exist, warn that a later `round.started` in
those jobs reads the new `reviewers`.

Finish with what changed, doctor's result, the commit (or why there is none), and whether
`factory upgrade` is needed.

## Ground rules

- One job, or one epic, per session; as many sessions as the user likes. A job is driven only by
  the session that claimed it, or, once it's `needs-human`, by whoever runs
  `approve`/`rework`/`abandon` on it (`abandon` from a working stage needs the user to confirm the
  driving session is stopped). A job in an epic is driven only by the session driving its epic
  (**Member commands**); `/factory epic <slug>` takes an epic over.
  Finding another job in flight is never a reason to stop; it's only a reason for the overlap check.
- Never wait off the board. Never stop mid-job to wait on the human without logging
  `job.escalated reason='…'` first: a question for the human is an escalation (the job goes to
  `needs-human`, and the board shows it), never a question asked only in chat. Any session can then
  answer it with `/factory rework` or `/factory approve`.
- Agents write only their own file (a reviewer also its `round-<N>/<key>/` supporting files);
  you write only your job's feature.md, rework notes, and conflict notes (in an epic, every epic
  job's, including the generated sync and fix `feature.md`), backlog edits (each committed at once),
  briefs' bookkeeping lines (`- Job:`, `- Abandoned:`), an epic plan's bookkeeping (`Status:`,
  `- Landed:`, `- Abandoned:`) and dependent drops, and events and epic events through the
  factory CLI (and, in `customize`, the overlay). If an agent wrote somewhere else, note it and tell the user.
- The managed files (this skill and the `factory-*` agents) are never edited by hand. A
  project's own rules for a role live in its overlay, `factory/roles/<role>.md`, which each
  agent reads at run time.
- Keep the user posted with one short line per transition (`003 · review round 1: 3/4 in`); in
  an epic, name the epic first (`<epic> · <id> review round <N>: <k>/<n> in`).
- Finish every command with the job's stage, decision, and where to read the files (for an epic,
  its state from `epic show <slug>` and its plan's path).
