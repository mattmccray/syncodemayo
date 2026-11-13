<!-- factory 0.6.1 · managed file, do not edit: it is replaced on upgrade. Project rules go in the overlay: factory/config.json and factory/roles/<role>.md -->
# /factory explore — interview an idea into a brief

The factory's agents can't talk to the user, so the thinking that needs a human happens here,
before the line starts. You and the user reach a shared understanding of one feature. You
record it as a **brief**, and the brief binds the spec-writer and approver later. Spend
questions on decisions, not on facts.

## Start

- **Free text idea** → new brief. Slug: 2–4 kebab words. If the idea points at earlier
  thinking (a backlog line, a design note, a plan doc), read that too. Decisions already made
  there are starting points to *confirm*, not questions to re-ask.
- **An existing brief's slug** → resume it. Re-read it, summarize where it stands in a few
  lines, and pick up at its first open question. If it has `- Abandoned:` lines, show its
  abandoned attempts in that summary (each job id, date, and reason), so the next attempt
  doesn't repeat what went wrong. If its `Status:` is `done`, don't reopen it,
  since a job already carried it out: name the job that carried it out (its `- Job:` line),
  and offer a new brief that lists the old one under `Sources:`.
- **An epic plan's slug** (`factory/epics/<slug>.md` exists) → resume the plan. Re-read it and
  its member briefs, and summarize where it stands in a few lines. By its state:
  - `draft` → pick up at its first unfinished member, in plan order (the first whose brief is
    missing or not `ready`). When every member is ready, go to **The plan's Finish**.
  - started and not over (`bun factory/cli.ts epic show <slug>` reads `running`, `waiting`, or
    `landing`), or `ready` and not yet started → **add members**: interview each new brief as a
    member (**Finish**, "A member of an epic"), and agree its `after:` edges with the user. Its
    item goes into `## Members` in its own Finish commit, never before, since the epic may claim
    it at its next scheduling step. Never remove, reorder, or rewrite the members already there.
  - `done` → don't reopen it: an epic already landed it. Name its `- Landed:` line, and offer a
    new plan that lists the old one under `Sources:`.
  - `abandoned` → don't reopen it either: a plan has one run. Offer a new plan; its member
    briefs stay `ready` and can be grouped again.

Do your homework before the first question. Read the project's instructions (`CLAUDE.md` or
its equivalent) and any decision records or contracts they name as binding, and the project's
role rules under `factory/roles/` (the spec-writer's and approver's rules say what makes a job
escalate). Read the code it would touch. Anything you can look up, look up.

## Interview

Follow the user's `grilling` discipline:
- Ask **one question at a time**, in prose. No multiple-choice menus.
- Give your **recommended answer** with each question, and the reason for it.
- Walk the decision tree in dependency order, settling the choices that decide other choices first.
- **Facts are yours to find; decisions are the user's.** Never ask what the code or docs can answer.

Make one extra pass for the things that make the approver escalate after a whole build, and
raise each one as a question while it's still cheap to settle:
- a public interface, data format, or contract the project treats as fixed or versioned
- a binding decision the project has recorded, and anything it lists as deferred (anti-scope
  for now)
- an escalation trigger in the project's approver rules (`factory/roles/approver.md`, if it exists)

When the idea collides with one of them, put it to the user plainly. The choices are narrowing
the idea, dropping that part, or amending the contract (or a decision). An amendment the user
chooses becomes a **contract call** in the brief.

**Size check.** A brief is **one factory job**: one branch, one reviewable diff. If the idea is
bigger than that, propose splitting it into several briefs, in dependency order. Agree the
split with the user, then interview them one at a time.

When the split gives two or more briefs, **propose running them as an epic** by default: one
plan, one backlog line, driven to done by `/factory epic <slug>`, with members that don't depend
on each other running in parallel. Declining keeps today's way: separate briefs, each with its
own backlog line. On agreement, write the plan (**Write the plan**) before the first member's
interview: `Status: draft`, an Intent, and a `## Members` list of the brief slugs with the
`after:` edges you propose from what each one touches; the user confirms or changes the edges.
Then interview the members one at a time, in plan order.

**Grouping existing briefs.** When the idea names existing briefs to run together, the plan can
group them. Each must be `ready`. Refuse a brief that is running (a live job carries it, or its
backlog line is ticked) or `done`, and say why; it stays out of the plan. The grouped briefs'
backlog lines are replaced by the epic's one line in **The plan's Finish** commit.

## Write the brief as you go

Create `factory/briefs/<slug>.md` after the first answer, and update it after every decision.
That way an interrupted session can resume. While questions remain it says `Status: draft`.
Only the factory's Merge step writes the `- Job:` line, and sets `Status: done`, when the job
that carried the brief out merges (for an epic's member, the epic's landing does, in the
`via epic` form). Only `/factory abandon` writes an `- Abandoned:` line (and
`/factory epic abandon`, for an epic's members), one per abandoned attempt, and the status stays
`ready`. Never write any of them here.

```
# <Title>

- Status: draft | ready | done
- Job: <id> (merged <short sha>, <YYYY-MM-DD>)   (written only at merge)
- Job: <id> (merged <sha> via epic <slug>, <YYYY-MM-DD>)   (an epic member's form, written only at landing)
- Abandoned: <id> (<YYYY-MM-DD>): <reason>   (optional; written only by /factory abandon, one per attempt)
- Sources: <earlier thinking you read, e.g. a plan doc's path> | —
- Date: <YYYY-MM-DD>

## Intent
Two or three sentences in the user's terms: what changes for them, and why it matters.

## Decisions
1. <the question, short> → **<the answer>**. Why: <the user's reason, or the reason they accepted>.

## Scope
- In: …
- Out: … (what you explicitly agreed not to do)

## Acceptance sketch
Observable outcomes, in plain language. The spec-writer turns these into testable criteria.

## Contract calls
None. Otherwise list each one:
"<the contract change or decision amendment>", approved by the user on <date>. The job must
update the doc that records it (the brief names it) to match.

## Open
None. A ready brief has none.
```

## Write the plan

An epic's plan is `factory/epics/<slug>.md` (its own slug, 2–4 kebab words, not a brief's).
Create it when the user agrees to an epic, and update it as members and edges are settled. It
says `Status: draft` until **The plan's Finish**. Only the epic's landing writes `- Landed:` and
sets `Status: done`, and only `/factory epic abandon` writes its `- Abandoned:` line and sets
`Status: abandoned`. Never write any of them here, and never write a member's live state
(running, blocked, waiting) into the plan.

```
# <Title>

- Status: draft | ready | done | abandoned
- Landed: <short sha> (<YYYY-MM-DD>)   (written only at landing)
- Abandoned: <YYYY-MM-DD>: <reason>   (written only by /factory epic abandon)
- Sources: <the idea, and briefs or plan docs it grew from> | —
- Date: <YYYY-MM-DD>

## Intent
Two or three sentences in the user's terms: what the whole set changes, and why together.

## Members
- `<slug>` — <one line on what this brief delivers>
- `<slug>` — <one line> after: `<slug>`
- `<slug>` — <one line> after: `<slug>`, `<slug>` maxRound: 3
```

Each member item starts with its brief's slug in backticks. `after:` lists the members it waits
on (members with no path between them run in parallel), and `maxRound:` optionally gives its job
a larger review budget; each at most once per item, and neither word anywhere else in the item.

## Finish

1. Play the brief back to the user in a few lines and ask whether you've got it right. Don't
   mark it ready until they confirm.
2. Take `factory/.lock`, the shared mutex (the `mkdir` loop under **Running jobs side by
   side** in SKILL.md), since other sessions may be editing the backlog. Run SKILL.md's
   **backlog check** first: if `git status --porcelain -- factory/backlog.md` prints anything,
   `factory/backlog.md` already has uncommitted changes, so release the lock and stop with the
   one line "commit or discard your backlog edits first" (the brief stays as it is, not ready).
3. Set `Status: ready`. Append a backlog line:
   `- [ ] Title — <one line on what done looks like> — brief: factory/briefs/<slug>.md`
4. Commit the brief and the backlog line together by pathspec, still under the lock:
   `git add -- factory/backlog.md factory/briefs/<slug>.md`, then
   `git commit -m "specs(factory): add brief <slug>"` (+ the Co-Authored-By trailer)
   `-- factory/backlog.md factory/briefs/<slug>.md`. Then release the lock
   (`rmdir factory/.lock`).
5. Only after the release, ask whether to run it now. If yes, continue as
   `/factory next <the brief's title>`, which picks that line even if it isn't first.

**A member of an epic** finishes differently, with no backlog line of its own:
1. Play the brief back as in step 1, and wait for the user to confirm.
2. Take `factory/.lock`. Set the brief's `Status: ready`, and make sure the plan lists it in
   `## Members` with its agreed `after:` edges.
3. Commit the brief and the plan together by pathspec, still under the lock:
   `git add -- factory/briefs/<slug>.md factory/epics/<epic>.md`, then
   `git commit -m "specs(factory): add brief <slug> (epic <epic>)"` (+ the Co-Authored-By
   trailer) `-- factory/briefs/<slug>.md factory/epics/<epic>.md`. Release the lock, and go on
   to the next unfinished member. For a started epic, that is the end:
   it picks new members up at its next scheduling step.

**The plan's Finish**, once every member brief is `ready`:
1. Play the plan back: its members, their `after:` edges, and what runs in parallel. Don't mark
   it ready until the user confirms.
2. Take `factory/.lock` and run the **backlog check**, as in step 2 (if it stops you, the plan
   stays as it is, a draft).
3. Set the plan's `Status: ready`. Append one backlog line:
   `- [ ] <Title> — <one line on what done looks like> — epic: factory/epics/<slug>.md`
   When the plan groups existing briefs, remove their `- [ ]` lines in the same edit.
4. Commit by pathspec, still under the lock: `git add -- factory/backlog.md
   factory/epics/<slug>.md`, then `git commit -m "specs(factory): add epic <slug>"` (+ the
   Co-Authored-By trailer) `-- factory/backlog.md factory/epics/<slug>.md`. Then release the
   lock (`rmdir factory/.lock`).
5. Only after the release, ask whether to run it now. If yes, continue as
   `/factory epic <slug>`.
