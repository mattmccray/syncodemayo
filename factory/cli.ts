// factory 0.6.1 · managed file, do not edit: it is replaced on upgrade. Project settings go in the overlay: factory/config.json
// packages/cli/src/core.ts
import { readFile as readFile6 } from "fs/promises";
import { dirname as dirname8, join as join10, resolve as resolve7 } from "path";

// packages/contract/src/contract.ts
var WORKING_STAGES = ["claimed", "spec", "build", "review", "approve"];
var workingStage = (stage) => WORKING_STAGES.find((w) => w === stage) ?? null;
var reworkStage = (stoppedFrom) => stoppedFrom === "spec" || stoppedFrom === "claimed" ? "spec" : "build";
var JOB_KINDS = ["member", "sync", "fix"];
var DEFAULT_MAX_PARALLEL = 3;
function epicMaxParallel(config) {
  return config.epic?.maxParallel ?? DEFAULT_MAX_PARALLEL;
}
function archiveEnabled(config) {
  return config.archive?.enabled === true;
}
var CURRENT_TARGET = "current";
var BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
function isTargetBranch(name) {
  return BRANCH_PATTERN.test(name) && !name.includes("..") && !name.includes("//") && !name.includes("/.") && !name.endsWith("/") && !name.endsWith(".") && !name.endsWith(".lock");
}
function mergeTarget(config) {
  return config.merge?.target ?? CURRENT_TARGET;
}
var MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:\[\]-]*$/;
var RUNNERS = ["claude"];
var SCHEMA = "factory/v1";
var JOB_ID = /^\d{3}-[a-z0-9-]+$/;
var isJobId = (id) => JOB_ID.test(id);
var SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
var SLUG_MAX = 40;
var JOB_NUMBER_MAX = 999;
function checkSlug(slug) {
  if (slug.length > SLUG_MAX)
    throw new Error(`slug ${JSON.stringify(slug)} is ${slug.length} characters (at most ${SLUG_MAX})`);
  if (!SLUG_PATTERN.test(slug))
    throw new Error(`slug ${JSON.stringify(slug)} must match ${SLUG_PATTERN.source}`);
}
function checkEpicSlug(slug) {
  if (slug.length > SLUG_MAX)
    throw new Error(`epic slug ${JSON.stringify(slug)} is ${slug.length} characters (at most ${SLUG_MAX})`);
  if (!SLUG_PATTERN.test(slug))
    throw new Error(`epic slug ${JSON.stringify(slug)} must match ${SLUG_PATTERN.source}`);
  if (JOB_ID.test(slug))
    throw new Error(`epic slug ${JSON.stringify(slug)} must not look like a job id (^\\d{3}-[a-z0-9-]+$)`);
}
function isEpicSlug(slug) {
  try {
    checkEpicSlug(slug);
    return true;
  } catch {
    return false;
  }
}
var epicBranch = (slug) => `factory/epic/${slug}`;
var SESSION_APP = "t3code";
var SESSION_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
function parseSession(value) {
  const want = `want ${SESSION_APP}:<environmentId>/<threadId>, each id 1-64 of [A-Za-z0-9-]`;
  if (typeof value !== "string")
    throw new Error(`field 'session' must be a string (${want})`);
  const colon = value.indexOf(":");
  if (colon < 0)
    throw new Error(`field 'session' has no ':' (${want})`);
  const app = value.slice(0, colon);
  if (app !== SESSION_APP)
    throw new Error(`field 'session' app must be "${SESSION_APP}" (${want})`);
  const ids = value.slice(colon + 1).split("/");
  if (ids.length !== 2)
    throw new Error(`field 'session' must have exactly one '/' (${want})`);
  const [environment = "", thread = ""] = ids;
  if (!SESSION_ID_PATTERN.test(environment))
    throw new Error(`field 'session' environment id is malformed (${want})`);
  if (!SESSION_ID_PATTERN.test(thread))
    throw new Error(`field 'session' thread id is malformed (${want})`);
  return { app: SESSION_APP, environment, thread };
}
function isSession(v) {
  return isRecord(v) && Object.keys(v).length === 3 && v.app === SESSION_APP && typeof v.environment === "string" && SESSION_ID_PATTERN.test(v.environment) && typeof v.thread === "string" && SESSION_ID_PATTERN.test(v.thread);
}
var REVIEWER_KEY = /^[a-z][a-z0-9-]*$/;
var RESERVED_KEYS = ["spec-writer", "builder", "approver"];
var ROLES = ["spec-writer", "builder", "reviewer", "approver"];
var ENTERED = ["spec", "build", "approve"];
var isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var isPosInt = (v) => typeof v === "number" && Number.isInteger(v) && v > 0;
function noExtraKeys(obj, allowed, what) {
  const extra = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (extra.length)
    throw new Error(`${what}: unknown key ${extra.map((k) => `'${k}'`).join(", ")}`);
}
function parseConfig(raw) {
  if (!isRecord(raw))
    throw new Error("config: must be a JSON object");
  noExtraKeys(raw, ["schema", "name", "reviewers", "maxRound", "dashboard", "gate", "roles", "merge", "archive", "epic"], "config");
  if (raw.schema !== SCHEMA)
    throw new Error(`config: schema must be "${SCHEMA}"`);
  const { reviewers, maxRound, dashboard } = raw;
  if (!Array.isArray(reviewers) || reviewers.length === 0)
    throw new Error("config: reviewers must be a non-empty array");
  const keys = [];
  for (const k of reviewers) {
    if (typeof k !== "string" || !REVIEWER_KEY.test(k))
      throw new Error(`config: bad reviewer key ${JSON.stringify(k)} (want ^[a-z][a-z0-9-]*$)`);
    if (RESERVED_KEYS.includes(k))
      throw new Error(`config: reviewer key '${k}' is reserved`);
    if (keys.includes(k))
      throw new Error(`config: duplicate reviewer key '${k}'`);
    keys.push(k);
  }
  if (!isPosInt(maxRound))
    throw new Error("config: maxRound must be a positive integer");
  if (!isRecord(dashboard))
    throw new Error("config: dashboard must be an object");
  noExtraKeys(dashboard, ["settleAfterHours"], "config.dashboard");
  const settle = dashboard.settleAfterHours;
  if (typeof settle !== "number" || !(settle > 0))
    throw new Error("config: dashboard.settleAfterHours must be a positive number");
  const config = { schema: SCHEMA, reviewers: keys, maxRound, dashboard: { settleAfterHours: settle } };
  if (raw.name !== undefined)
    config.name = parseName(raw.name);
  if (raw.gate !== undefined)
    config.gate = parseGate(raw.gate);
  if (raw.roles !== undefined)
    config.roles = parseRoles(raw.roles, keys);
  if (raw.merge !== undefined)
    config.merge = parseMerge(raw.merge);
  if (raw.archive !== undefined)
    config.archive = parseArchive(raw.archive);
  if (raw.epic !== undefined)
    config.epic = parseEpic(raw.epic);
  return config;
}
function parseEpic(epic) {
  if (!isRecord(epic))
    throw new Error("config: epic must be an object { maxParallel? }");
  noExtraKeys(epic, ["maxParallel"], "config.epic");
  if (epic.maxParallel === undefined)
    return {};
  if (!isPosInt(epic.maxParallel))
    throw new Error("config: epic.maxParallel must be a positive integer");
  return { maxParallel: epic.maxParallel };
}
function parseArchive(archive) {
  if (!isRecord(archive))
    throw new Error("config: archive must be an object { enabled }");
  noExtraKeys(archive, ["enabled"], "config.archive");
  if (typeof archive.enabled !== "boolean")
    throw new Error("config: archive.enabled must be true or false");
  return { enabled: archive.enabled };
}
function parseMerge(merge) {
  if (!isRecord(merge))
    throw new Error("config: merge must be an object { target? }");
  noExtraKeys(merge, ["target"], "config.merge");
  if (merge.target === undefined)
    return {};
  const target = merge.target;
  if (typeof target !== "string" || target.trim() === "") {
    throw new Error(`config: merge.target must be "${CURRENT_TARGET}" or a non-empty branch name`);
  }
  if (!isTargetBranch(target)) {
    throw new Error(`config: merge.target ${JSON.stringify(target)} is not an allowed branch name (want ${BRANCH_PATTERN.source}, no '..', no '.lock' suffix)`);
  }
  return { target };
}
var NAME_MAX = 64;
var CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
function parseName(name) {
  if (typeof name !== "string")
    throw new Error("config: name must be a string");
  const length = [...name].length;
  if (length === 0)
    throw new Error("config: name must not be empty");
  if (length > NAME_MAX)
    throw new Error(`config: name is ${length} characters (at most ${NAME_MAX})`);
  if (CONTROL.test(name))
    throw new Error("config: name must not contain control characters");
  if (name.trim() !== name)
    throw new Error("config: name must not have leading or trailing whitespace");
  return name;
}
function parseRoles(roles, reviewers) {
  if (!isRecord(roles))
    throw new Error("config: roles must be an object mapping a role name to { runner, model? }");
  const out = {};
  for (const [name, entry] of Object.entries(roles)) {
    const what = `config: roles.${REVIEWER_KEY.test(name) ? name : JSON.stringify(name)}`;
    if (!RESERVED_KEYS.includes(name) && !reviewers.includes(name)) {
      throw new Error(`${what}: unknown role (want ${[...RESERVED_KEYS, ...reviewers].join(", ")})`);
    }
    if (!isRecord(entry))
      throw new Error(`${what}: must be an object { runner, model? }`);
    noExtraKeys(entry, ["runner", "model"], what);
    if (entry.runner === undefined)
      throw new Error(`${what}: runner is required`);
    const runner = RUNNERS.find((r) => r === entry.runner);
    if (runner === undefined)
      throw new Error(`${what}: runner must be ${RUNNERS.map((r) => `"${r}"`).join(" or ")}`);
    const parsed = { runner };
    if (entry.model !== undefined) {
      const model = entry.model;
      if (typeof model !== "string" || !MODEL_PATTERN.test(model)) {
        throw new Error(`${what}: model must be a non-empty string matching ${MODEL_PATTERN.source}`);
      }
      parsed.model = model;
    }
    out[name] = parsed;
  }
  return out;
}
function parseGate(gate) {
  if (!Array.isArray(gate) || gate.length === 0)
    throw new Error("config: gate must be a non-empty array of command strings");
  const commands = [];
  for (const [i, c] of gate.entries()) {
    if (typeof c !== "string" || c.trim() === "")
      throw new Error(`config: gate[${i}] must be a non-empty command string`);
    commands.push(c);
  }
  return commands;
}
function str(f, k) {
  const v = f[k];
  if (typeof v !== "string" || v === "")
    throw new Error(`missing or non-string field '${k}'`);
  return v;
}
function optStr(f, k) {
  return f[k] === undefined ? undefined : str(f, k);
}
function nullableStr(f, k) {
  return f[k] === undefined || f[k] === null ? null : str(f, k);
}
function posInt(f, k) {
  const v = f[k];
  if (!isPosInt(v))
    throw new Error(`field '${k}' must be a positive integer`);
  return v;
}
function oneOf(f, k, allowed) {
  const v = str(f, k);
  const hit = allowed.find((a) => a === v);
  if (hit === undefined)
    throw new Error(`field '${k}' must be one of ${allowed.join("|")}`);
  return hit;
}
function reviewerKey(f, k) {
  const v = str(f, k);
  if (!REVIEWER_KEY.test(v))
    throw new Error(`bad reviewer key '${v}'`);
  return v;
}
function agentIdentity(f) {
  const role = oneOf(f, "role", ROLES);
  const name = optStr(f, "name");
  const id = { role };
  if (role === "reviewer") {
    id.key = reviewerKey(f, "key");
    id.round = posInt(f, "round");
  } else if (f.key !== undefined)
    throw new Error(`field 'key' is only for role 'reviewer'`);
  else if (f.round !== undefined)
    id.round = posInt(f, "round");
  if (name !== undefined)
    id.name = name;
  return id;
}
function parseEventInput(type, fields, ctx) {
  const allow = (...keys) => noExtraKeys(fields, keys, `${type}: extra field`);
  switch (type) {
    case "job.claimed": {
      allow("brief", "issue", "maxRound", "session", "epic", "kind");
      if (!ctx)
        throw new Error("job.claimed: needs the job id and config from the CLI");
      if (ctx.target !== undefined && !isTargetBranch(ctx.target))
        throw new Error(`job.claimed: target ${JSON.stringify(ctx.target)} is not an allowed branch name`);
      const maxRound = fields.maxRound === undefined ? ctx.config.maxRound : posInt(fields, "maxRound");
      const claimed = { type, schema: SCHEMA, id: ctx.id, maxRound, brief: nullableStr(fields, "brief"), issue: nullableStr(fields, "issue") };
      if (ctx.target !== undefined)
        claimed.target = ctx.target;
      if (fields.session !== undefined)
        claimed.session = parseSession(fields.session);
      const kind = fields.kind === undefined ? undefined : oneOf(fields, "kind", JOB_KINDS);
      if (fields.epic === undefined) {
        if (kind !== undefined)
          throw new Error(`job.claimed: kind=${kind} needs epic=<slug>`);
        return claimed;
      }
      const epic = str(fields, "epic");
      checkEpicSlug(epic);
      claimed.epic = epic;
      claimed.kind = kind ?? "member";
      if (claimed.kind === "member" && claimed.brief === null)
        throw new Error(`job.claimed: a member claim needs brief=factory/briefs/<member>.md`);
      if (claimed.kind !== "member" && claimed.brief !== null)
        throw new Error(`job.claimed: a ${claimed.kind} job takes no brief=`);
      if (ctx.target !== undefined && ctx.target !== epicBranch(epic))
        throw new Error(`job.claimed: a job in epic ${epic} targets ${epicBranch(epic)}, not ${ctx.target}`);
      return claimed;
    }
    case "job.titled":
      allow("title");
      return { type, title: str(fields, "title") };
    case "stage.entered":
      allow("stage");
      return { type, stage: oneOf(fields, "stage", ENTERED) };
    case "round.started": {
      allow("round", "reviewers");
      if (fields.reviewers === undefined && !ctx)
        throw new Error(`round.started: field 'reviewers' needs the config from the CLI`);
      const list = fields.reviewers === undefined && ctx ? ctx.config.reviewers : fields.reviewers;
      if (!Array.isArray(list) || list.length === 0)
        throw new Error(`field 'reviewers' must be a non-empty array`);
      const reviewers = list.map((r) => reviewerKey({ r }, "r"));
      if (new Set(reviewers).size !== reviewers.length)
        throw new Error(`field 'reviewers' has duplicates`);
      return { type, round: posInt(fields, "round"), reviewers };
    }
    case "agent.started":
      allow("role", "key", "round", "name");
      return { type, ...agentIdentity(fields) };
    case "agent.finished": {
      allow("role", "key", "round", "name", "agentId");
      const finished = { type, ...agentIdentity(fields) };
      if (fields.agentId !== undefined) {
        if (typeof fields.agentId !== "string")
          throw new Error(`field 'agentId' must be a string`);
        finished.agentId = fields.agentId;
      }
      return finished;
    }
    case "job.noted":
      allow("note");
      return { type, note: str(fields, "note") };
    case "job.escalated":
      allow("reason");
      return { type, reason: str(fields, "reason") };
    case "job.reworked": {
      allow("k", "maxRound", "session");
      const reworked = { type, k: posInt(fields, "k"), maxRound: posInt(fields, "maxRound") };
      if (fields.session !== undefined)
        reworked.session = parseSession(fields.session);
      return reworked;
    }
    case "job.human-approved": {
      allow("session");
      const approved = { type };
      if (fields.session !== undefined)
        approved.session = parseSession(fields.session);
      return approved;
    }
    case "merge.failed":
      allow("reason");
      return { type, reason: str(fields, "reason") };
    case "merge.conflicted":
      allow("reason");
      return { type, reason: str(fields, "reason") };
    case "job.merged":
      allow("sha");
      return { type, sha: str(fields, "sha") };
    case "job.abandoned":
      allow("reason");
      return { type, reason: str(fields, "reason") };
    default:
      if (type.startsWith("epic."))
        throw new Error(`${type} is an epic event, not a job event: run epic event <slug> ${type} \u2026`);
      throw new Error(`unknown event type '${type}'`);
  }
}
var CONFLICT_LIMIT = 2;
function derive(prior) {
  const s = { stage: null, round: 0, maxRound: 0, reviewers: [], finished: new Set, humanApproved: false, conflicts: 0, stoppedFrom: null };
  for (const e of prior) {
    switch (e.type) {
      case "job.claimed":
        s.stage = "claimed";
        s.maxRound = e.maxRound;
        break;
      case "stage.entered":
        s.stage = e.stage;
        break;
      case "round.started":
        s.stage = "review";
        s.round = e.round;
        s.reviewers = e.reviewers;
        s.finished = new Set;
        break;
      case "agent.finished":
        if (e.role === "reviewer" && e.key !== undefined && e.verdict !== undefined && e.round === s.round)
          s.finished.add(e.key);
        break;
      case "job.escalated":
        s.stoppedFrom = stoppedAt(s.stage);
        s.stage = "needs-human";
        s.humanApproved = false;
        break;
      case "job.reworked":
        s.stage = reworkStage(s.stoppedFrom);
        s.stoppedFrom = null;
        s.maxRound = e.maxRound;
        s.humanApproved = false;
        break;
      case "job.human-approved":
        s.humanApproved = true;
        break;
      case "merge.failed":
        if (s.stage !== "needs-human")
          s.stoppedFrom = stoppedAt(s.stage);
        s.stage = "needs-human";
        s.humanApproved = false;
        break;
      case "merge.conflicted":
        s.stage = "build";
        s.maxRound = s.round + 2;
        s.humanApproved = false;
        s.conflicts += 1;
        break;
      case "job.merged":
        s.stage = "merged";
        break;
      case "job.abandoned":
        s.stage = "abandoned";
        break;
      default:
        break;
    }
  }
  return s;
}
var stoppedAt = (stage) => stage === null ? null : workingStage(stage);
function fail(msg) {
  throw new Error(msg);
}
function checkTransition(prior, next, opts = {}) {
  const s = derive(prior);
  const { stage } = s;
  if (stage === null) {
    if (next.type !== "job.claimed")
      fail(`no log yet: only job.claimed is allowed, got ${next.type}`);
    if (!JOB_ID.test(next.id))
      fail(`job id '${next.id}' must match ^\\d{3}-[a-z0-9-]+$`);
    if (next.schema !== SCHEMA)
      fail(`schema must be "${SCHEMA}"`);
    if (!isPosInt(next.maxRound))
      fail("maxRound must be a positive integer");
    return;
  }
  if (stage === "merged" || stage === "abandoned")
    fail(`job is ${stage} (terminal): ${next.type} not allowed`);
  const bad = () => fail(`${next.type} not allowed from stage '${stage}'`);
  switch (next.type) {
    case "job.claimed":
      return bad();
    case "job.noted":
    case "job.titled":
    case "agent.started":
    case "agent.finished":
      return;
    case "stage.entered": {
      if (next.stage === "spec")
        return stage === "claimed" ? undefined : bad();
      if (next.stage === "build") {
        if (stage === "spec")
          return;
        if (stage !== "review")
          return bad();
        requireComplete(s);
        if (s.round >= s.maxRound)
          fail(`round ${s.round} has reached maxRound ${s.maxRound}: cannot enter build again`);
        return;
      }
      if (stage !== "review")
        return bad();
      return requireComplete(s);
    }
    case "round.started":
      if (stage !== "build")
        return bad();
      if (next.round !== s.round + 1)
        fail(`round must be previous + 1 (${s.round + 1}), got ${next.round}`);
      return;
    case "job.escalated":
      return stage === "needs-human" ? bad() : undefined;
    case "merge.failed":
      if (stage === "approve")
        return;
      if (stage === "needs-human" && s.humanApproved)
        return;
      return bad();
    case "merge.conflicted":
      if (stage !== "approve" && !(stage === "needs-human" && s.humanApproved))
        return bad();
      if (s.conflicts >= CONFLICT_LIMIT) {
        fail(`merge.conflicted refused: this job has already conflicted ${s.conflicts} times (the limit is ${CONFLICT_LIMIT}); log merge.failed instead`);
      }
      return;
    case "job.merged":
      if (stage === "approve" || stage === "needs-human" && s.humanApproved)
        return;
      return stage === "needs-human" ? fail("job.merged from needs-human requires job.human-approved first") : bad();
    case "job.reworked":
      return stage === "needs-human" ? undefined : bad();
    case "job.human-approved":
      return stage === "needs-human" ? undefined : bad();
    case "job.abandoned":
      if (stage === "needs-human" || opts.force === true)
        return;
      return fail(`job.abandoned from working stage '${stage}' requires force (abandon --force)`);
  }
}
function requireComplete(s) {
  const waiting = s.reviewers.filter((r) => !s.finished.has(r));
  if (waiting.length)
    fail(`round ${s.round} is not complete, waiting on: ${waiting.join(", ")}`);
}
// packages/contract/src/usage.ts
var AGENT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
var isAgentId = (id) => AGENT_ID_PATTERN.test(id);
var isRecord2 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var isCount = (v) => typeof v === "number" && Number.isInteger(v) && v >= 0;
var COUNT_KEYS = ["model", "input", "output", "cacheWrite", "cacheRead"];
function readUsage(v) {
  if (!isRecord2(v))
    return null;
  const keys = Object.keys(v);
  if (keys.length === 1 && typeof v.unavailable === "string" && v.unavailable !== "")
    return { unavailable: v.unavailable };
  if (keys.length !== COUNT_KEYS.length || !COUNT_KEYS.every((k) => keys.includes(k)))
    return null;
  const { model, input, output, cacheWrite, cacheRead } = v;
  if (model !== null && typeof model !== "string")
    return null;
  if (!isCount(input) || !isCount(output) || !isCount(cacheWrite) || !isCount(cacheRead))
    return null;
  return { model, input, output, cacheWrite, cacheRead };
}
function unavailable(text) {
  const line = (text.split(`
`)[0] ?? "").trim();
  return { unavailable: line === "" ? "unknown reason" : line };
}
var JOB_STRETCH_STARTS = ["job.claimed", "job.reworked", "job.human-approved"];
var JOB_STRETCH_ENDS = ["job.escalated", "merge.failed", "job.merged", "job.abandoned"];
var EPIC_STRETCH_STARTS = ["epic.started", "epic.resumed"];
var EPIC_STRETCH_ENDS = ["epic.waiting", "epic.landed", "epic.abandoned"];
function openStretch(events, starts, ends) {
  let from = null;
  for (const e of events) {
    if (ends.includes(e.type))
      from = null;
    else if (from === null && starts.includes(e.type))
      from = e.ts;
  }
  return from;
}
function totalOf(usages) {
  const t = { status: "exact", input: 0, output: 0, cacheWrite: 0, cacheRead: 0, spans: usages.length, unknown: 0 };
  let counted = 0;
  let unavailableSpans = 0;
  for (const u of usages) {
    if (u === null)
      t.unknown += 1;
    else if ("unavailable" in u) {
      t.unknown += 1;
      unavailableSpans += 1;
    } else {
      counted += 1;
      t.input += u.input;
      t.output += u.output;
      t.cacheWrite += u.cacheWrite;
      t.cacheRead += u.cacheRead;
    }
  }
  if (t.unknown === 0)
    t.status = "exact";
  else if (counted > 0)
    t.status = "partial";
  else
    t.status = unavailableSpans > 0 ? "unavailable" : "not recorded";
  return t;
}
var tokensOf = (t) => t.input + t.output + t.cacheWrite + t.cacheRead;
function stretchUsages(events, starts, ends) {
  const out = [];
  let open = false;
  for (const e of events) {
    if (ends.includes(e.type)) {
      if (open || e.orchestrator !== undefined)
        out.push(readUsage(e.orchestrator));
      open = false;
    } else if (starts.includes(e.type))
      open = true;
  }
  return out;
}

// packages/contract/src/epic.ts
var PLAN_STATUSES = ["draft", "ready", "done", "abandoned"];
var isSlug = (s) => s.length <= SLUG_MAX && SLUG_PATTERN.test(s);
var ITEM = /^- `([^`]*)`(.*)$/;
var AFTER = /\bafter:/g;
var AFTER_LIST = /\bafter:\s*(`[^`]*`(?:\s*,\s*`[^`]*`)*)/;
var MAX_ROUND = /\bmaxRound:/g;
var MAX_ROUND_VALUE = /\bmaxRound:\s*([1-9]\d*)(?!\w|\.\d)/;
var STATUS = /^- Status:(.*)$/;
function statusLine(text) {
  for (const line of text.split(`
`)) {
    if (line.startsWith("## "))
      return null;
    const m = STATUS.exec(line.trimEnd());
    if (m)
      return (m[1] ?? "").trim();
  }
  return null;
}
function parsePlan(text) {
  const plan = { status: null, statusError: null, members: [], errors: [] };
  const status = statusLine(text);
  if (status === null)
    plan.statusError = 'has no "- Status:" line';
  else {
    const hit = PLAN_STATUSES.find((s) => s === status);
    if (hit === undefined)
      plan.statusError = `has an unknown status (want ${PLAN_STATUSES.join("|")})`;
    else
      plan.status = hit;
  }
  const lines = text.split(`
`);
  const start = lines.findIndex((l) => l.trimEnd() === "## Members");
  if (start < 0) {
    plan.errors.push('has no "## Members" section');
    return plan;
  }
  const items = [];
  for (let i = start + 1;i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^#{1,2} /.test(line))
      break;
    if (line.startsWith("- ") || line === "-" || line.startsWith("* ") || line.startsWith("+ ") || /^\d+[.)] /.test(line))
      items.push({ n: i + 1, text: line });
    else if (/^\s/.test(line) && line.trim() !== "" && items.length > 0) {
      const last = items[items.length - 1];
      if (last)
        last.text += ` ${line.trim()}`;
    }
  }
  const seen = new Set;
  for (const { n, text: item } of items) {
    const where = `## Members line ${n}`;
    const m = ITEM.exec(item);
    if (!m) {
      plan.errors.push(`${where} is malformed (want "- \`<brief slug>\`" first)`);
      continue;
    }
    const slug = m[1] ?? "";
    const rest = m[2] ?? "";
    if (!isSlug(slug)) {
      plan.errors.push(`${where}: member slug must match ${SLUG_PATTERN.source} (at most ${SLUG_MAX} characters)`);
      continue;
    }
    if (seen.has(slug)) {
      plan.errors.push(`${where}: member ${slug} is listed twice`);
      continue;
    }
    let after = [];
    const afters = rest.match(AFTER)?.length ?? 0;
    if (afters > 1) {
      plan.errors.push(`${where}: member ${slug} has more than one after:`);
      continue;
    }
    if (afters === 1) {
      const a = AFTER_LIST.exec(rest);
      if (!a) {
        plan.errors.push(`${where}: member ${slug} has a malformed after: (want after: \`<slug>\`[, \`<slug>\`])`);
        continue;
      }
      after = [...(a[1] ?? "").matchAll(/`([^`]*)`/g)].map((x) => x[1] ?? "");
      const bad = after.find((s) => !isSlug(s));
      if (bad !== undefined) {
        plan.errors.push(`${where}: member ${slug} has an after: entry that is not a slug`);
        continue;
      }
      if (new Set(after).size !== after.length) {
        plan.errors.push(`${where}: member ${slug} lists an after: member twice`);
        continue;
      }
    }
    let maxRound = null;
    const rounds = rest.match(MAX_ROUND)?.length ?? 0;
    if (rounds > 1) {
      plan.errors.push(`${where}: member ${slug} has more than one maxRound:`);
      continue;
    }
    if (rounds === 1) {
      const r = MAX_ROUND_VALUE.exec(rest);
      const value = r ? Number(r[1]) : Number.NaN;
      if (!Number.isSafeInteger(value) || value < 1) {
        plan.errors.push(`${where}: member ${slug} has a malformed maxRound: (want a positive integer)`);
        continue;
      }
      maxRound = value;
    }
    seen.add(slug);
    plan.members.push({ slug, after, maxRound });
  }
  if (items.length === 0)
    plan.errors.push('"## Members" lists no members');
  return plan;
}
function planGraphError(members) {
  const names = new Set(members.map((m) => m.slug));
  for (const m of members) {
    const missing = m.after.find((a) => !names.has(a));
    if (missing !== undefined)
      return `member ${m.slug} is after ${missing}, which is not a member`;
  }
  const bySlug = new Map(members.map((m) => [m.slug, m]));
  const state = new Map;
  const stack = [];
  const visit = (slug) => {
    if (state.get(slug) === "done")
      return null;
    if (state.get(slug) === "visiting")
      return [...stack.slice(stack.indexOf(slug)), slug];
    state.set(slug, "visiting");
    stack.push(slug);
    for (const a of bySlug.get(slug)?.after ?? []) {
      const cycle = visit(a);
      if (cycle)
        return cycle;
    }
    stack.pop();
    state.set(slug, "done");
    return null;
  };
  for (const m of members) {
    const cycle = visit(m.slug);
    if (cycle)
      return `the after: edges form a cycle: ${cycle.join(" -> ")}`;
  }
  return null;
}
var planPath = (slug) => `factory/epics/${slug}.md`;
var briefPath = (member) => `factory/briefs/${member}.md`;
async function planStartProblem(slug, text, readBrief) {
  const what = `plan ${planPath(slug)}`;
  if (text === null)
    return `${what} is missing`;
  const plan = parsePlan(text);
  if (plan.statusError !== null)
    return `${what} ${plan.statusError}`;
  if (plan.status !== "ready")
    return `${what} is ${plan.status ?? "unknown"}, not ready`;
  const [parse] = plan.errors;
  if (parse !== undefined)
    return `${what} ${parse}`;
  const graph = planGraphError(plan.members);
  if (graph !== null)
    return `${what}: ${graph}`;
  for (const m of plan.members) {
    const brief = await readBrief(m.slug);
    if (brief === null)
      return `${what}: member brief ${briefPath(m.slug)} is missing`;
    const status = statusLine(brief);
    if (status !== "ready")
      return `${what}: member brief ${briefPath(m.slug)} is ${status === null ? 'without a "- Status:" line' : JSON.stringify(status)}, not ready`;
  }
  return null;
}
var EPIC_EVENT_TYPES = ["epic.started", "epic.waiting", "epic.resumed", "epic.landing", "epic.landed", "epic.abandoned"];
function parseEpicEventInput(type, fields, ctx) {
  const allow = (...keys) => noExtraKeys(fields, keys, `${type}: extra field`);
  switch (type) {
    case "epic.started": {
      allow("session");
      if (!ctx)
        throw new Error("epic.started: needs the slug and target from the CLI");
      checkEpicSlug(ctx.slug);
      if (!isTargetBranch(ctx.target))
        throw new Error(`epic.started: target ${JSON.stringify(ctx.target)} is not an allowed branch name`);
      const started = { type, schema: "factory/v1", slug: ctx.slug, target: ctx.target };
      if (fields.session !== undefined)
        started.session = parseSession(fields.session);
      return started;
    }
    case "epic.waiting":
      allow("reason");
      return { type, reason: str(fields, "reason") };
    case "epic.resumed": {
      allow("session");
      const resumed = { type };
      if (fields.session !== undefined)
        resumed.session = parseSession(fields.session);
      return resumed;
    }
    case "epic.landing":
      allow();
      return { type };
    case "epic.landed":
      allow("sha");
      return { type, sha: str(fields, "sha") };
    case "epic.abandoned":
      allow("reason");
      return { type, reason: str(fields, "reason") };
    default:
      throw new Error(`unknown epic event type '${type}' (want ${EPIC_EVENT_TYPES.join("|")})`);
  }
}
function isEpicEvent(v) {
  return typeof v === "object" && v !== null && "ts" in v && typeof v.ts === "string" && "type" in v && typeof v.type === "string";
}
function logged(prior) {
  const s = { state: null, resumeTo: "running" };
  for (const e of prior) {
    switch (e.type) {
      case "epic.started":
        s.state = "running";
        break;
      case "epic.waiting":
        if (s.state === "running" || s.state === "landing")
          s.resumeTo = s.state;
        s.state = "waiting";
        break;
      case "epic.resumed":
        if (s.state === "waiting")
          s.state = s.resumeTo;
        break;
      case "epic.landing":
        s.state = "landing";
        break;
      case "epic.landed":
        s.state = "landed";
        break;
      case "epic.abandoned":
        s.state = "abandoned";
        break;
      default:
        break;
    }
  }
  return s;
}
var loggedEpicState = (prior) => logged(prior).state;
function checkEpicTransition(prior, next, landBlock = null) {
  const { state } = logged(prior);
  if (state === null) {
    if (next.type !== "epic.started")
      throw new Error(`no epic log yet: only epic.started (epic start) is allowed, got ${next.type}`);
    return;
  }
  if (state === "landed" || state === "abandoned")
    throw new Error(`epic is ${state} (terminal): ${next.type} not allowed`);
  const bad = () => {
    throw new Error(`${next.type} not allowed from epic state '${state}'`);
  };
  switch (next.type) {
    case "epic.started":
      throw new Error("epic has already started: one run per plan");
    case "epic.waiting":
      return state === "running" || state === "landing" ? undefined : bad();
    case "epic.resumed":
      return state === "running" || state === "waiting" ? undefined : bad();
    case "epic.landing":
      if (state !== "running")
        return bad();
      if (landBlock !== null)
        throw new Error(`epic.landing refused: ${landBlock}`);
      return;
    case "epic.landed":
      return state === "landing" ? undefined : bad();
    case "epic.abandoned":
      return;
  }
}
var WORKING = ["claimed", "spec", "build", "review", "approve"];
var isWorking = (stage) => WORKING.includes(stage);
var isLiveStage = (stage) => stage !== "merged" && stage !== "abandoned";
var memberJobs = (jobs, member) => jobs.filter((j) => j.kind === "member" && j.brief === briefPath(member)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function viewEpic(log, members, jobs) {
  const newest = new Map;
  for (const m of members) {
    const mine = memberJobs(jobs, m.slug);
    const last = mine[mine.length - 1];
    if (last)
      newest.set(m.slug, last);
  }
  const merged = (slug) => newest.get(slug)?.stage === "merged";
  const out = members.map((m) => {
    const job = newest.get(m.slug);
    const base = { slug: m.slug, after: [...m.after], job: job?.id ?? null, stage: job?.stage ?? null, blockedOn: [] };
    if (job) {
      const state = job.stage === "merged" ? "merged" : job.stage === "abandoned" ? "abandoned" : job.stage === "needs-human" ? "needs-human" : "running";
      return { ...base, state };
    }
    const blockedOn = m.after.filter((a) => !merged(a)).map((a) => ({ member: a, job: newest.get(a)?.id ?? null }));
    return { ...base, state: blockedOn.length > 0 ? "blocked" : "queued", blockedOn };
  });
  const generated = jobs.filter((j) => j.kind !== "member").sort((a, b) => a.id < b.id ? -1 : 1);
  const liveSync = generated.find((j) => j.kind === "sync" && isLiveStage(j.stage)) ?? null;
  const liveGenerated = generated.filter((j) => isLiveStage(j.stage));
  const claimable = liveSync === null ? out.filter((m) => m.state === "queued").map((m) => m.slug) : [];
  const workingMembers = jobs.filter((j) => j.kind === "member" && isWorking(j.stage)).length;
  let landBlock = null;
  const unmerged = out.filter((m) => m.state !== "merged");
  if (out.length === 0)
    landBlock = "the plan lists no members";
  else if (unmerged.length > 0)
    landBlock = `not every member has merged (${unmerged.map((m) => `${m.slug}: ${m.state}`).join(", ")})`;
  else if (liveGenerated.length > 0)
    landBlock = `${liveGenerated.map((j) => `${j.kind} job ${j.id}`).join(", ")} ${liveGenerated.length === 1 ? "is" : "are"} live`;
  return { logged: loggedEpicState(log), members: out, generated, claimable, workingMembers, liveSync, landBlock };
}
function projectEpic(log, members, jobs, planError = null) {
  const first = log[0];
  if (!first || first.type !== "epic.started")
    throw new Error("epic log must start with epic.started");
  const view = viewEpic(log, members, jobs);
  const snap = {
    schema: "factory/v1",
    slug: first.slug,
    branch: epicBranch(first.slug),
    target: first.target,
    plan: planPath(first.slug),
    planError,
    state: "running",
    waitingOn: null,
    note: "",
    session: isSession(first.session) ? { app: first.session.app, environment: first.session.environment, thread: first.session.thread } : null,
    sha: null,
    members: view.members,
    generated: view.generated.map((j) => ({ id: j.id, kind: j.kind, stage: j.stage })),
    counts: { queued: 0, blocked: 0, running: 0, merged: 0, "needs-human": 0, abandoned: 0 },
    startedAt: first.ts,
    endedAt: null,
    updated: first.ts,
    orchestrator: totalOf(stretchUsages(log, EPIC_STRETCH_STARTS, EPIC_STRETCH_ENDS))
  };
  for (const e of log.slice(1)) {
    snap.updated = e.ts;
    switch (e.type) {
      case "epic.waiting":
        snap.note = e.reason;
        break;
      case "epic.resumed":
        snap.note = "";
        if (isSession(e.session))
          snap.session = { app: e.session.app, environment: e.session.environment, thread: e.session.thread };
        break;
      case "epic.landed":
        snap.sha = e.sha;
        snap.note = `landed ${e.sha}`;
        snap.endedAt = e.ts;
        break;
      case "epic.abandoned":
        snap.note = e.reason;
        snap.endedAt = e.ts;
        break;
      default:
        break;
    }
  }
  for (const j of jobs)
    if (j.updated !== null && j.updated > snap.updated)
      snap.updated = j.updated;
  for (const m of view.members)
    snap.counts[m.state] += 1;
  const state = view.logged ?? "running";
  snap.state = state;
  if (state === "waiting")
    snap.waitingOn = "you";
  else if ((state === "running" || state === "landing") && membersWait(view, jobs)) {
    snap.state = "waiting";
    snap.waitingOn = "members";
  }
  return snap;
}
function membersWait(view, jobs) {
  if (jobs.some((j) => isWorking(j.stage)))
    return false;
  if (!jobs.some((j) => j.stage === "needs-human"))
    return false;
  return view.claimable.length === 0 && view.landBlock !== null;
}
function epicNext(view, maxParallel) {
  if (view.logged !== "running")
    return [];
  if (view.landBlock === null)
    return ["land"];
  const room = Math.max(0, maxParallel - view.workingMembers);
  return view.claimable.slice(0, room).map((m) => `claim ${m}`);
}
function memberClaimRefusal(view, member, maxParallel) {
  const m = view.members.find((x) => x.slug === member);
  if (m === undefined)
    return `${briefPath(member)} is not listed in the plan's ## Members`;
  if (m.job !== null && m.state !== "abandoned")
    return `member ${member} already has job ${m.job} (${m.stage ?? "unknown"})`;
  const waits = m.after.filter((a) => view.members.find((x) => x.slug === a)?.state !== "merged");
  if (waits.length > 0) {
    const named = waits.map((a) => {
      const job = view.members.find((x) => x.slug === a)?.job ?? null;
      return job === null ? a : `${a} (${job})`;
    });
    return `member ${member} waits on ${named.join(", ")}, not yet merged`;
  }
  if (view.liveSync !== null)
    return `sync job ${view.liveSync.id} is live: no member is claimed until it is merged or abandoned`;
  if (view.workingMembers >= maxParallel)
    return `${view.workingMembers} members are working, at epic.maxParallel ${maxParallel}`;
  return null;
}
var HOUR_MS = 3600000;
var time = (now) => typeof now === "number" ? now : now.getTime();
function endedBefore(endedAt, hours, now) {
  if (endedAt === null)
    return false;
  const ended = Date.parse(endedAt);
  return !Number.isNaN(ended) && time(now) - ended > hours * HOUR_MS;
}
function isEpicSettled(epic, hours, now) {
  if (epic.state === "abandoned")
    return true;
  return epic.state === "landed" && endedBefore(epic.endedAt, hours, now);
}
function isSettled(job, hours, now, epic) {
  if (job.stage === "abandoned")
    return true;
  if (job.stage !== "merged")
    return false;
  if (job.epic === undefined || job.epic === null)
    return endedBefore(job.endedAt, hours, now);
  if (epic === undefined || epic === null || epic.state !== "landed" && epic.state !== "abandoned")
    return false;
  return isEpicSettled(epic, hours, now);
}
// packages/contract/src/epicstore.ts
import { appendFile, lstat, mkdir as mkdir2, readFile, readdir, rename, rm as rm2, rmdir, writeFile } from "fs/promises";
import { dirname, join } from "path";

// packages/contract/src/lock.ts
import { mkdir, rm, stat } from "fs/promises";
var LOCK_STALE_MS = 30000;
var LOCK_RETRY_MS = 25;
var isNotFound = (e) => typeof e === "object" && e !== null && ("code" in e) && e.code === "ENOENT";
var isExists = (e) => typeof e === "object" && e !== null && ("code" in e) && e.code === "EEXIST";
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function acquire(lock) {
  for (;; ) {
    try {
      await mkdir(lock);
      return;
    } catch (e) {
      if (!isExists(e))
        throw e;
      try {
        if (Date.now() - (await stat(lock)).mtimeMs > LOCK_STALE_MS)
          await rm(lock, { recursive: true, force: true });
      } catch (s) {
        if (!isNotFound(s))
          throw s;
      }
      await sleep(LOCK_RETRY_MS);
    }
  }
}
async function release(lock) {
  await rm(lock, { recursive: true, force: true });
}
async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (e) {
    if (isNotFound(e))
      return false;
    throw e;
  }
}

// packages/contract/src/epicstore.ts
function epicDir(root, slug) {
  checkEpicSlug(slug);
  return join(root, "jobs", "epics", slug);
}
var epicLogPath = (root, slug) => join(epicDir(root, slug), "events.jsonl");
function parseEpicLog(text) {
  const lines = text.split(`
`);
  if (lines[lines.length - 1] === "")
    lines.pop();
  return lines.map((line, i) => {
    let raw;
    try {
      raw = JSON.parse(line);
    } catch {
      throw new Error(`epic events.jsonl line ${i + 1} is not valid JSON`);
    }
    if (!isEpicEvent(raw))
      throw new Error(`epic events.jsonl line ${i + 1} is not an epic event`);
    return raw;
  });
}
async function readText(path) {
  try {
    return await readFile(path, "utf8");
  } catch (e) {
    if (isNotFound(e))
      return null;
    throw e;
  }
}
async function readEpicLog(root, slug) {
  const text = await readText(epicLogPath(root, slug));
  return text === null ? [] : parseEpicLog(text);
}
async function readForAppend(root, slug) {
  const raw = await readText(epicLogPath(root, slug)) ?? "";
  if (raw !== "" && !raw.endsWith(`
`))
    throw new Error(`epic ${slug}: events.jsonl does not end with a newline (corrupt tail); refusing to append`);
  return parseEpicLog(raw);
}
async function readRegular(path, rel) {
  let st;
  try {
    st = await lstat(path);
  } catch (e) {
    if (isNotFound(e))
      return null;
    throw e;
  }
  if (!st.isFile())
    throw new Error(`${rel} is not a regular file (a symlink is never followed)`);
  return readFile(path, "utf8");
}
function readPlan(root, slug) {
  checkEpicSlug(slug);
  return readRegular(join(root, "epics", `${slug}.md`), planPath(slug));
}
function readBrief(root, member) {
  if (member.length > SLUG_MAX || !SLUG_PATTERN.test(member))
    return Promise.resolve(null);
  return readRegular(join(root, "briefs", `${member}.md`), briefPath(member));
}
async function epicPlanProblem(root, slug) {
  return planStartProblem(slug, await readPlan(root, slug), (m) => readBrief(root, m));
}
var isRecord3 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function agentIdsIn(timing) {
  const ids = [];
  if (!isRecord3(timing) || !Array.isArray(timing.agents))
    return ids;
  for (const a of timing.agents) {
    if (isRecord3(a) && typeof a.agentId === "string" && isAgentId(a.agentId) && !ids.includes(a.agentId))
      ids.push(a.agentId);
  }
  return ids;
}
async function readEpicJobs(root, slug) {
  let names;
  try {
    names = (await readdir(join(root, "jobs"), { withFileTypes: true })).filter((d) => d.isDirectory() && isJobId(d.name)).map((d) => d.name).sort();
  } catch (e) {
    if (isNotFound(e))
      return [];
    throw e;
  }
  const out = [];
  for (const id of names) {
    let raw;
    try {
      raw = JSON.parse(await readFile(join(root, "jobs", id, "job.json"), "utf8"));
    } catch {
      continue;
    }
    if (!isRecord3(raw) || raw.epic !== slug || typeof raw.stage !== "string")
      continue;
    const kind = JOB_KINDS.find((k) => k === raw.kind) ?? "member";
    out.push({
      id,
      stage: raw.stage,
      kind,
      brief: typeof raw.brief === "string" ? raw.brief : null,
      updated: typeof raw.updated === "string" ? raw.updated : null,
      agentIds: agentIdsIn(raw.timing)
    });
  }
  return out;
}
async function loadEpic(root, slug, log) {
  const events = log ?? await readEpicLog(root, slug);
  const text = await readPlan(root, slug);
  let members = [];
  let planError = null;
  if (text === null)
    planError = `plan ${planPath(slug)} is missing`;
  else {
    const plan = parsePlan(text);
    members = plan.members;
    const [first] = plan.errors;
    if (first !== undefined)
      planError = `plan ${planPath(slug)} ${first}`;
  }
  const jobs = await readEpicJobs(root, slug);
  return { log: events, members, planError, jobs, view: viewEpic(events, members, jobs) };
}
async function writeEpicSnapshot(root, slug, snap) {
  const file = join(epicDir(root, slug), "epic.json");
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(snap, null, 2)}
`);
  await rename(tmp, file);
}
var project = (i) => projectEpic(i.log, i.members, i.jobs, i.planError);
async function withEpicLock(root, slug, fn) {
  const dir = epicDir(root, slug);
  if (!await exists(dir))
    throw new Error(`epic ${slug} has not started (no jobs/epics/${slug}/)`);
  const lock = join(dir, ".events.lock");
  await acquire(lock);
  try {
    return await fn();
  } finally {
    await release(lock);
  }
}
async function startEpic(root, slug, input, now = () => new Date, setup = async () => async () => {
  return;
}) {
  const dir = epicDir(root, slug);
  if (input.type !== "epic.started" || input.slug !== slug)
    throw new Error(`epic ${slug}: start needs epic.started for ${slug}`);
  const parent = join(root, "jobs", "epics");
  const madeParent = await mkdir2(parent, { recursive: true });
  try {
    await mkdir2(dir);
  } catch (e) {
    if (madeParent !== undefined)
      await removeEmpty(parent, madeParent);
    if (isExists(e))
      throw new Error(`epic ${slug} has already started: one run per plan`);
    throw e;
  }
  const lock = join(dir, ".events.lock");
  await acquire(lock);
  let ok = false;
  let undo = null;
  try {
    const prior = await readForAppend(root, slug);
    checkEpicTransition(prior, input);
    undo = await setup();
    const event = { ts: now().toISOString(), ...input };
    await appendFile(epicLogPath(root, slug), `${JSON.stringify(event)}
`);
    const snap = project(await loadEpic(root, slug));
    await writeEpicSnapshot(root, slug, snap);
    ok = true;
    return snap;
  } catch (e) {
    const reason = (e instanceof Error ? e.message : String(e)).split(`
`)[0] ?? "";
    const left = undo === null ? null : await undo().then(() => null, (u) => u instanceof Error ? u.message : String(u));
    throw left === null ? e : new Error(`${reason}; ${left}`);
  } finally {
    await release(lock);
    if (!ok) {
      await rm2(dir, { recursive: true, force: true });
      if (madeParent !== undefined)
        await removeEmpty(parent, madeParent);
    }
  }
}
async function removeEmpty(dir, made) {
  for (let d = dir;d.length >= made.length; d = dirname(d)) {
    if (!await rmdir(d).then(() => true, () => false))
      return;
  }
}
async function withEpicUsage(prior, input, ts, jobs, reader) {
  if (reader === undefined)
    return input;
  if (input.type !== "epic.waiting" && input.type !== "epic.landed" && input.type !== "epic.abandoned")
    return input;
  const from = openStretch(prior, EPIC_STRETCH_STARTS, EPIC_STRETCH_ENDS);
  if (from === null)
    return input;
  const ids = [...new Set(jobs.flatMap((j) => j.agentIds ?? []))];
  let orchestrator;
  try {
    orchestrator = await reader.orchestrator(ids, { from, to: ts });
  } catch (e) {
    orchestrator = unavailable(`usage reader failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { ...input, orchestrator };
}
async function appendEpicEvent(root, slug, input, now = () => new Date, opts = {}) {
  return withEpicLock(root, slug, async () => {
    const prior = await readForAppend(root, slug);
    if (prior.length === 0)
      throw new Error(`epic ${slug} has not started (no epic.started)`);
    const inputs = await loadEpic(root, slug, prior);
    checkEpicTransition(prior, input, inputs.view.landBlock);
    opts.check?.(inputs);
    const ts = now().toISOString();
    const event = { ts, ...await withEpicUsage(prior, input, ts, inputs.jobs, opts.usage) };
    await appendFile(epicLogPath(root, slug), `${JSON.stringify(event)}
`);
    const snap = project(await loadEpic(root, slug));
    await writeEpicSnapshot(root, slug, snap);
    return snap;
  });
}
async function rebuildLocked(root, slug) {
  const inputs = await loadEpic(root, slug);
  if (inputs.log.length === 0)
    throw new Error(`epic ${slug}: no events.jsonl to rebuild from`);
  const snap = project(inputs);
  await writeEpicSnapshot(root, slug, snap);
  return snap;
}
function rebuildEpic(root, slug) {
  return withEpicLock(root, slug, () => rebuildLocked(root, slug));
}
async function epicSlugs(root) {
  try {
    return (await readdir(join(root, "jobs", "epics"), { withFileTypes: true })).filter((d) => d.isDirectory() && isEpicSlug(d.name)).map((d) => d.name).sort();
  } catch (e) {
    if (isNotFound(e))
      return [];
    throw e;
  }
}
async function claimIntoEpic(root, claimed, maxParallel, maxRoundGiven, append) {
  const slug = claimed.epic;
  if (slug === undefined)
    throw new Error("claimIntoEpic: the claim names no epic");
  return withEpicLock(root, slug, async () => {
    const prior = await readForAppend(root, slug);
    const state = loggedEpicState(prior);
    if (state === null)
      throw new Error(`epic ${slug} has not started (no epic.started)`);
    if (state === "landed" || state === "abandoned")
      throw new Error(`epic ${slug} is ${state}: no job is claimed into it`);
    const inputs = await loadEpic(root, slug, prior);
    let next = claimed;
    if ((claimed.kind ?? "member") === "member") {
      const m = /^factory\/briefs\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/.exec(claimed.brief ?? "");
      if (!m)
        throw new Error(`a member claim needs brief=factory/briefs/<member>.md, got ${JSON.stringify(claimed.brief)}`);
      const member = m[1] ?? "";
      if (inputs.planError !== null && inputs.members.length === 0)
        throw new Error(inputs.planError);
      const refusal = memberClaimRefusal(inputs.view, member, maxParallel);
      if (refusal !== null)
        throw new Error(`epic ${slug}: ${refusal}`);
      const planRound = inputs.members.find((x) => x.slug === member)?.maxRound ?? null;
      if (!maxRoundGiven && planRound !== null)
        next = { ...claimed, maxRound: planRound };
    }
    const out = await append(next);
    await rebuildLocked(root, slug).catch(() => {
      return;
    });
    return out;
  });
}
// packages/contract/src/project.ts
var ROLE_STAGE = { "spec-writer": "spec", builder: "build", reviewer: "review", approver: "approve" };
var USAGE_STAGES = ["spec", "build", "review", "approve"];
var ms = (from, to) => Date.parse(to) - Date.parse(from);
function enterStage(s, stage, ts) {
  if (s.stage === stage && s.timing.stages.length > 0)
    return;
  const open = s.timing.stages[s.timing.stages.length - 1];
  if (open && open.exitedAt === null) {
    open.exitedAt = ts;
    open.ms = ms(open.enteredAt, ts);
  }
  s.stage = stage;
  s.stageEnteredAt = ts;
  s.timing.stages.push({ stage, round: s.round, enteredAt: ts, exitedAt: null, ms: null });
}
function sameAgent(a, role, key, round, name) {
  return a.role === role && a.key === key && a.round === round && a.name === name;
}
function closeOpenAgents(s, ts, by, ctx) {
  for (const a of s.timing.agents) {
    if (a.finishedAt === null) {
      a.finishedAt = ts;
      a.ms = ms(a.startedAt, ts);
      ctx.closedBy.set(a, by);
    }
  }
}
function openAgentStart(snap, id) {
  const key = id.key ?? null;
  const round = id.round ?? null;
  const name = id.name ?? null;
  for (let i = snap.timing.agents.length - 1;i >= 0; i--) {
    const a = snap.timing.agents[i];
    if (a && a.finishedAt === null && sameAgent(a, id.role, key, round, name))
      return a.startedAt;
  }
  return null;
}
var storedSession = (v) => isSession(v) ? { app: v.app, environment: v.environment, thread: v.thread } : null;
function apply(s, e, ctx) {
  s.updated = e.ts;
  switch (e.type) {
    case "job.claimed":
      return;
    case "job.titled":
      s.title = e.title;
      return;
    case "stage.entered":
      enterStage(s, e.stage, e.ts);
      return;
    case "round.started": {
      if (s.round > 0)
        s.history.push({ round: s.round, reviews: s.reviews });
      s.round = e.round;
      s.reviews = Object.fromEntries(e.reviewers.map((k) => [k, "pending"]));
      enterStage(s, "review", e.ts);
      return;
    }
    case "agent.started": {
      const name = e.name ?? null;
      if (e.role === "builder" && name !== null)
        s.builder = name;
      const started = {
        role: e.role,
        key: e.key ?? null,
        round: e.round ?? null,
        name,
        startedAt: e.ts,
        finishedAt: null,
        ms: null,
        verdict: null,
        agentId: null,
        usage: null
      };
      s.timing.agents.push(started);
      ctx.rounds.set(started, s.round);
      return;
    }
    case "agent.finished": {
      const key = e.key ?? null;
      const round = e.round ?? null;
      const name = e.name ?? null;
      const verdict = e.verdict ?? null;
      let span;
      for (let i = s.timing.agents.length - 1;i >= 0; i--) {
        const a = s.timing.agents[i];
        if (a && a.finishedAt === null && sameAgent(a, e.role, key, round, name)) {
          span = a;
          break;
        }
      }
      if (!span) {
        span = { role: e.role, key, round, name, startedAt: e.ts, finishedAt: null, ms: null, verdict: null, agentId: null, usage: null };
        s.timing.agents.push(span);
        ctx.rounds.set(span, s.round);
      }
      span.finishedAt = e.ts;
      span.ms = ms(span.startedAt, e.ts);
      span.verdict = verdict;
      span.agentId = typeof e.agentId === "string" && isAgentId(e.agentId) ? e.agentId : null;
      span.usage = readUsage(e.usage);
      if (e.role === "reviewer" && key !== null && (verdict === "PASS" || verdict === "CHANGES")) {
        if (round === s.round && Object.hasOwn(s.reviews, key))
          s.reviews[key] = verdict;
      } else if (e.role === "approver" && (verdict === "APPROVE" || verdict === "ESCALATE")) {
        s.decision = verdict;
      }
      return;
    }
    case "job.noted":
      s.note = e.note;
      return;
    case "job.escalated":
      closeOpenAgents(s, e.ts, "escalation", ctx);
      s.note = e.reason;
      s.stoppedBy = "escalated";
      s.stoppedFrom = workingStage(s.stage);
      enterStage(s, "needs-human", e.ts);
      return;
    case "merge.failed":
      s.note = e.reason;
      s.stoppedBy = "merge-failed";
      if (s.stage !== "needs-human")
        s.stoppedFrom = workingStage(s.stage);
      enterStage(s, "needs-human", e.ts);
      return;
    case "merge.conflicted":
      s.conflicts += 1;
      s.maxRound = s.round + 2;
      s.note = e.reason;
      s.decision = null;
      enterStage(s, "build", e.ts);
      return;
    case "job.reworked": {
      const next = reworkStage(s.stoppedFrom);
      s.reworks = e.k;
      s.stoppedBy = null;
      s.stoppedFrom = null;
      s.maxRound = e.maxRound;
      s.decision = null;
      s.note = "";
      s.session = storedSession(e.session) ?? s.session;
      enterStage(s, next, e.ts);
      return;
    }
    case "job.human-approved":
      s.decision = "APPROVE (human)";
      s.session = storedSession(e.session) ?? s.session;
      return;
    case "job.merged":
      s.endedAt = e.ts;
      s.note = `merged ${e.sha}`;
      enterStage(s, "merged", e.ts);
      return;
    case "job.abandoned":
      closeOpenAgents(s, e.ts, "abandon", ctx);
      s.endedAt = e.ts;
      s.note = e.reason;
      enterStage(s, "abandoned", e.ts);
      return;
  }
}
function project2(events) {
  const first = events[0];
  if (!first || first.type !== "job.claimed")
    throw new Error("event log must start with job.claimed");
  const snapshot = {
    schema: first.schema,
    id: first.id,
    title: first.id,
    branch: `factory/${first.id}`,
    target: typeof first.target === "string" ? first.target : null,
    builder: null,
    stage: "claimed",
    round: 0,
    maxRound: first.maxRound,
    reviews: {},
    history: [],
    reworks: 0,
    conflicts: 0,
    decision: null,
    note: "",
    stoppedBy: null,
    stoppedFrom: null,
    brief: first.brief,
    issue: first.issue,
    session: storedSession(first.session),
    epic: typeof first.epic === "string" ? first.epic : null,
    kind: typeof first.epic === "string" ? JOB_KINDS.find((k) => k === first.kind) ?? "member" : null,
    startedAt: first.ts,
    stageEnteredAt: first.ts,
    endedAt: null,
    updated: first.ts,
    timing: { stages: [{ stage: "claimed", round: 0, enteredAt: first.ts, exitedAt: null, ms: null }], agents: [] },
    usage: { stages: [], rounds: [], job: totalOf([]), orchestrator: null }
  };
  const ctx = { rounds: new Map, closedBy: new Map };
  for (const e of events.slice(1))
    apply(snapshot, e, ctx);
  snapshot.usage = rollUp(snapshot, events, ctx);
  return snapshot;
}
var recordsUsage = (events) => events.some((e) => e.type === "agent.finished" && e.usage !== undefined || ("orchestrator" in e) && e.orchestrator !== undefined);
function rollUp(s, events, ctx) {
  if (recordsUsage(events))
    for (const [a, by] of ctx.closedBy)
      a.usage = { unavailable: `closed by ${by}` };
  const rounds = ctx.rounds;
  const closed = s.timing.agents.filter((a) => a.finishedAt !== null);
  const stages = USAGE_STAGES.flatMap((stage) => {
    const spans = closed.filter((a) => ROLE_STAGE[a.role] === stage);
    return spans.length === 0 ? [] : [{ stage, total: totalOf(spans.map((a) => a.usage)) }];
  });
  const roundOf = (a) => a.round ?? rounds.get(a) ?? 0;
  const roundNumbers = [...new Set(closed.map(roundOf))].sort((a, b) => a - b);
  const byRound = roundNumbers.map((round) => ({ round, total: totalOf(closed.filter((a) => roundOf(a) === round).map((a) => a.usage)) }));
  const stretches = s.epic === null ? stretchUsages(events, JOB_STRETCH_STARTS, JOB_STRETCH_ENDS) : null;
  const orchestrator = stretches === null ? null : totalOf(stretches);
  const job = totalOf([...closed.map((a) => a.usage), ...stretches ?? []]);
  return { stages, rounds: byRound, job, orchestrator };
}
// packages/contract/src/store.ts
import { appendFile as appendFile2, mkdir as mkdir3, readFile as readFile2, readdir as readdir2, rename as rename2, rmdir as rmdir2, stat as stat2, writeFile as writeFile2 } from "fs/promises";
import { existsSync } from "fs";
import { join as join2 } from "path";
var JOB_ID2 = /^\d{3}-[a-z0-9-]+$/;
function jobDir(root, id) {
  if (!JOB_ID2.test(id))
    throw new Error(`job id '${id}' must match ^\\d{3}-[a-z0-9-]+$`);
  return join2(root, "jobs", id);
}
var logPath = (root, id) => join2(jobDir(root, id), "events.jsonl");
function parseLine(line, n) {
  let raw;
  try {
    raw = JSON.parse(line);
  } catch {
    throw new Error(`events.jsonl line ${n} is not valid JSON`);
  }
  if (!isEvent(raw))
    throw new Error(`events.jsonl line ${n} is not a factory event`);
  return raw;
}
function isEvent(v) {
  return typeof v === "object" && v !== null && "ts" in v && typeof v.ts === "string" && "type" in v && typeof v.type === "string";
}
async function readLog(root, id) {
  let text;
  try {
    text = await readFile2(logPath(root, id), "utf8");
  } catch (e) {
    if (isNotFound(e))
      return [];
    throw e;
  }
  return parseLog(text);
}
function parseLog(text) {
  const lines = text.split(`
`);
  if (lines[lines.length - 1] === "")
    lines.pop();
  return lines.map((line, i) => parseLine(line, i + 1));
}
async function readVerdict(path, allowed) {
  let text;
  try {
    text = await readFile2(path, "utf8");
  } catch (e) {
    if (isNotFound(e))
      throw new Error(`${path}: missing`);
    throw e;
  }
  const first = text.split(`
`).map((l) => l.trim()).find((l) => l !== "") ?? "";
  const hit = allowed.find((a) => a === first);
  if (hit === undefined)
    throw new Error(`${path}: first line must be one of ${allowed.map((a) => `"${a}"`).join(", ")}`);
  return hit.replace(/^VERDICT: /, "");
}
var REVIEW_VERDICTS = ["PASS", "CHANGES"];
var DECISION_VERDICTS = ["APPROVE", "ESCALATE"];
async function withVerdict(root, id, input) {
  if (input.type !== "agent.finished")
    return input;
  if (input.role === "reviewer") {
    const path = join2(jobDir(root, id), `round-${input.round}`, `review-${input.key}.md`);
    const v = await readVerdict(path, REVIEW_VERDICTS.map((x) => `VERDICT: ${x}`));
    const verdict = REVIEW_VERDICTS.find((x) => x === v);
    if (verdict === undefined)
      throw new Error(`${path}: unreachable verdict '${v}'`);
    return { ...input, verdict };
  }
  if (input.role === "approver") {
    const path = join2(jobDir(root, id), "decision.md");
    const v = await readVerdict(path, DECISION_VERDICTS);
    const verdict = DECISION_VERDICTS.find((x) => x === v);
    if (verdict === undefined)
      throw new Error(`${path}: unreachable verdict '${v}'`);
    return { ...input, verdict };
  }
  return input;
}
async function withLock(dir, create, fn) {
  let created = false;
  if (create)
    created = await mkdir3(dir, { recursive: true }) !== undefined;
  else if (!await exists(dir))
    throw new Error(`${dir.split("/").pop()}: no such job`);
  const lock = join2(dir, ".events.lock");
  await acquire(lock);
  let ok = false;
  try {
    const out = await fn();
    ok = true;
    return out;
  } finally {
    await release(lock);
    if (created && !ok)
      await rmdir2(dir).catch(() => {
        return;
      });
  }
}
async function writeSnapshot(root, id, snap) {
  const file = join2(jobDir(root, id), "job.json");
  const tmp = `${file}.tmp`;
  await writeFile2(tmp, `${JSON.stringify(snap, null, 2)}
`);
  await rename2(tmp, file);
}
async function safely(read) {
  try {
    return await read();
  } catch (e) {
    return unavailable(`usage reader failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
async function withUsage(prior, input, ts, reader) {
  if (input.type === "agent.finished") {
    const { agentId, ...rest } = input;
    if (agentId !== undefined && !isAgentId(agentId)) {
      return reader === undefined ? rest : { ...rest, usage: { unavailable: "agentId is not a safe id (want ^[A-Za-z0-9_-]+$)" } };
    }
    if (reader === undefined)
      return input;
    if (agentId === undefined)
      return { ...input, usage: { unavailable: "no agentId on agent.finished" } };
    const from = prior.length === 0 ? null : openAgentStart(project2(prior), input);
    if (from === null)
      return { ...input, usage: { unavailable: "no open agent.started for this span" } };
    return { ...input, usage: await safely(() => reader.agent(agentId, { from, to: ts })) };
  }
  if (reader === undefined || !JOB_STRETCH_ENDS.includes(input.type))
    return input;
  const first = prior[0];
  if (first === undefined || first.type !== "job.claimed" || first.epic !== undefined)
    return input;
  const from = openStretch(prior, JOB_STRETCH_STARTS, JOB_STRETCH_ENDS);
  if (from === null)
    return input;
  const orchestrator = await safely(() => reader.orchestrator(agentIdsOf(prior), { from, to: ts }));
  switch (input.type) {
    case "job.escalated":
    case "merge.failed":
    case "job.merged":
    case "job.abandoned":
      return { ...input, orchestrator };
    default:
      return input;
  }
}
function agentIdsOf(events) {
  const ids = [];
  for (const e of events)
    if (e.type === "agent.finished" && typeof e.agentId === "string" && isAgentId(e.agentId) && !ids.includes(e.agentId))
      ids.push(e.agentId);
  return ids;
}
async function appendEvent(root, id, input, now = () => new Date, opts = {}) {
  const snap = await appendJobEvent(root, id, input, now, opts);
  if (snap.epic !== null)
    await refreshEpic(root, snap.epic);
  return snap;
}
async function refreshEpic(root, epic) {
  await rebuildEpic(root, epic).catch(() => {
    return;
  });
}
function appendJobEvent(root, id, input, now, opts) {
  return withLock(jobDir(root, id), input.type === "job.claimed", async () => {
    const prior = await readLog(root, id);
    if (prior.length === 0 && await exists(join2(jobDir(root, id), "job.json"))) {
      throw new Error(`${id} is a legacy job (no events.jsonl); not modifiable`);
    }
    const raw = prior.length === 0 ? "" : await readFile2(logPath(root, id), "utf8");
    if (raw !== "" && !raw.endsWith(`
`))
      throw new Error(`${id}: events.jsonl does not end with a newline (corrupt tail); refusing to append`);
    const checked = await withVerdict(root, id, input);
    checkTransition(prior, checked, opts);
    const ts = now().toISOString();
    const event = { ts, ...await withUsage(prior, checked, ts, opts.usage) };
    await appendFile2(logPath(root, id), `${JSON.stringify(event)}
`);
    const snap = project2(await readLog(root, id));
    await writeSnapshot(root, id, snap);
    return snap;
  });
}
async function rebuildAll(root, id) {
  const ids = id !== undefined ? [id] : await listEventedJobs(root);
  const done = [];
  const named = new Set;
  for (const j of ids) {
    const snap = await withLock(jobDir(root, j), false, async () => {
      const log = await readLog(root, j);
      if (log.length === 0)
        throw new Error(`${j}: no events.jsonl to rebuild from`);
      const s = project2(log);
      await writeSnapshot(root, j, s);
      return s;
    });
    if (snap.epic !== null)
      named.add(snap.epic);
    done.push(j);
  }
  const epics = id !== undefined ? [...named].filter((e) => existsSync(join2(root, "jobs", "epics", e))) : await epicSlugs(root);
  for (const e of epics)
    await rebuildEpic(root, e);
  return { jobs: done, epics };
}
async function listEventedJobs(root) {
  let entries;
  try {
    entries = (await readdir2(join2(root, "jobs"), { withFileTypes: true })).filter((d) => d.isDirectory() && JOB_ID2.test(d.name)).map((d) => d.name);
  } catch (e) {
    if (isNotFound(e))
      return [];
    throw e;
  }
  const out = [];
  for (const name of entries.sort()) {
    try {
      await stat2(logPath(root, name));
      out.push(name);
    } catch (e) {
      if (!isNotFound(e))
        throw e;
    }
  }
  return out;
}
function claimedInput(id, input) {
  const ctx = { id, config: input.config };
  if (input.target !== undefined)
    ctx.target = input.target;
  return parseEventInput("job.claimed", input.fields, ctx);
}
function checkClaim(slug, input) {
  checkSlug(slug);
  claimedInput(`000-${slug}`, input);
}
async function jobDirs(root) {
  try {
    return (await readdir2(join2(root, "jobs"), { withFileTypes: true })).filter((d) => d.isDirectory() && JOB_ID2.test(d.name)).map((d) => d.name).sort();
  } catch (e) {
    if (isNotFound(e))
      return [];
    throw e;
  }
}
async function isLive(root, id) {
  let raw;
  try {
    raw = JSON.parse(await readFile2(join2(jobDir(root, id), "job.json"), "utf8"));
  } catch {
    return false;
  }
  if (typeof raw !== "object" || raw === null || !("stage" in raw) || typeof raw.stage !== "string")
    return false;
  return raw.stage !== "merged" && raw.stage !== "abandoned";
}
async function claimJob(root, slug, input, now = () => new Date, opts = {}) {
  checkClaim(slug, input);
  const jobs = join2(root, "jobs");
  await mkdir3(jobs, { recursive: true });
  const lock = join2(jobs, ".claim.lock");
  await acquire(lock);
  try {
    const dirs = await jobDirs(root);
    for (const d of dirs) {
      if (d.slice(4) === slug && await isLive(root, d))
        throw new Error(`slug ${slug} is live as ${d}`);
    }
    const archived = opts.archived === undefined ? [] : (await opts.archived()).filter((d) => JOB_ID2.test(d));
    const highest = [...dirs, ...archived].reduce((n, d) => Math.max(n, Number(d.slice(0, 3))), 0);
    if (highest >= JOB_NUMBER_MAX)
      throw new Error(`job number ${JOB_NUMBER_MAX} is taken: no job numbers are left`);
    const id = `${String(highest + 1).padStart(3, "0")}-${slug}`;
    const claimed = claimedInput(id, input);
    if (claimed.type !== "job.claimed" || claimed.epic === undefined) {
      const snapshot = await appendJobEvent(root, id, claimed, now, {});
      return { id, snapshot };
    }
    const snapshot = await claimIntoEpic(root, claimed, epicMaxParallel(input.config), input.fields.maxRound !== undefined, (c) => appendJobEvent(root, id, c, now, {}));
    return { id, snapshot };
  } finally {
    await release(lock);
  }
}
// packages/contract/src/fields.ts
var INT_KEYS = ["round", "maxRound", "k"];
function parseFields(args) {
  const out = {};
  for (const a of args) {
    const eq = a.indexOf("=");
    if (eq < 1)
      throw new Error(`bad field '${a}' (want key=value)`);
    const k = a.slice(0, eq);
    const v = a.slice(eq + 1);
    if (INT_KEYS.includes(k)) {
      if (!/^-?\d+$/.test(v))
        throw new Error(`field '${k}' must be an integer, got '${v}'`);
      out[k] = Number(v);
    } else if (k === "reviewers") {
      let parsed;
      try {
        parsed = JSON.parse(v);
      } catch {
        throw new Error(`field 'reviewers' must be a JSON array`);
      }
      if (!Array.isArray(parsed))
        throw new Error(`field 'reviewers' must be a JSON array`);
      out[k] = parsed;
    } else
      out[k] = v === "null" ? null : v;
  }
  return out;
}
// packages/contract/src/show.ts
function duration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60)
    return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)
    return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function span(ms, openSince, now) {
  return ms !== null ? duration(ms) : `running ${duration(now.getTime() - Date.parse(openSince))}`;
}
function formatShow(snap, now) {
  const out = [`${snap.id}  ${snap.stage}${snap.title ? `  ${snap.title}` : ""}`];
  for (const s of snap.timing.stages) {
    const head = `stage  ${s.stage}${s.round ? ` r${s.round}` : ""}`;
    out.push(s.stage === "merged" || s.stage === "abandoned" ? head : `${head}  ${span(s.ms, s.enteredAt, now)}`);
  }
  for (const a of snap.timing.agents) {
    const who = [a.role, a.key, a.round !== null ? `r${a.round}` : null, a.name].filter((x) => x !== null).join(" ");
    out.push(`agent  ${who}  ${span(a.ms, a.startedAt, now)}${a.verdict ? `  ${a.verdict}` : ""}`);
  }
  return [...out, ...formatUsage(snap)];
}
function compactTokens(n) {
  if (n < 1000)
    return String(n);
  if (n < 999950)
    return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1e6).toFixed(1)}M`;
}
var plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function usageSummary(t, unit = ["span", "spans"]) {
  const sum = compactTokens(tokensOf(t));
  switch (t.status) {
    case "exact":
      return `= ${sum}`;
    case "partial":
      return `\u2265 ${sum}, ${plural(t.unknown, `${unit[0]} unknown`, `${unit[1]} unknown`)}`;
    case "unavailable":
      return `unavailable (${plural(t.unknown, unit[0], unit[1])})`;
    case "not recorded":
      return "not recorded";
  }
}
var NONE = "-";
function spanRow(a) {
  const id = [a.role, a.key ?? NONE, a.round === null ? NONE : String(a.round)];
  const u = a.usage;
  if (u === null)
    return [...id, a.finishedAt === null ? "running" : "not recorded", NONE, NONE, NONE, NONE];
  if ("unavailable" in u)
    return [...id, `unavailable: ${u.unavailable}`, NONE, NONE, NONE, NONE];
  return [...id, u.model ?? NONE, String(u.input), String(u.output), String(u.cacheWrite), String(u.cacheRead)];
}
function totalRow(label, t, summary) {
  const counted = t.status === "exact" || t.status === "partial";
  const n = (v) => !counted ? NONE : t.status === "partial" ? `\u2265 ${v}` : String(v);
  return [label, "", "", summary, n(t.input), n(t.output), n(t.cacheWrite), n(t.cacheRead)];
}
function formatUsage(snap) {
  const u = snap.usage;
  const orchestrator = u.orchestrator;
  if (snap.timing.agents.length === 0 && (orchestrator === null || orchestrator.spans === 0))
    return [];
  const rows = [["role", "key", "round", "model", "input", "output", "cache write", "cache read"]];
  for (const a of snap.timing.agents)
    rows.push(spanRow(a));
  for (const s of u.stages)
    rows.push(totalRow(`stage ${s.stage}`, s.total, usageSummary(s.total)));
  for (const r of u.rounds)
    rows.push(totalRow(`round ${r.round}`, r.total, usageSummary(r.total)));
  if (orchestrator === null)
    rows.push(["orchestrator", "", "", `in epic ${snap.epic ?? ""} (epic show)`, "", "", "", ""]);
  else if (orchestrator.spans === 0)
    rows.push(["orchestrator", "", "", "no stretch ended yet", "", "", "", ""]);
  else
    rows.push(totalRow("orchestrator", orchestrator, usageSummary(orchestrator, ["stretch", "stretches"])));
  rows.push(totalRow("job", u.job, usageSummary(u.job)));
  const widths = rows[0]?.map((_, i) => Math.max(...rows.map((r) => (r[i] ?? "").length))) ?? [];
  return ["usage", ...rows.map((r) => `  ${r.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ")}`.trimEnd())];
}
// packages/contract/src/manifest.ts
var SCHEMA2 = "factory/v1";
var SHA256_HEX = /^[0-9a-f]{64}$/;
var isRecord4 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function checkManifestPath(p) {
  if (p === "")
    return "empty path";
  if (p.includes("\x00"))
    return "path contains a NUL byte";
  if (p.includes("\\"))
    return "path must use forward slashes";
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p))
    return "path must be repo-relative, not absolute";
  if (p.split("/").some((seg) => seg === ".."))
    return "path must not contain '..'";
  return null;
}
function parseManifest(raw) {
  if (!isRecord4(raw))
    throw new Error("must be a JSON object");
  const extra = Object.keys(raw).filter((k) => !["schema", "version", "files"].includes(k));
  if (extra.length)
    throw new Error(`unknown key ${extra.map((k) => `'${k}'`).join(", ")}`);
  if (raw.schema !== SCHEMA2)
    throw new Error(`schema must be "${SCHEMA2}"`);
  if (typeof raw.version !== "string" || raw.version === "")
    throw new Error("version must be a non-empty string");
  if (!isRecord4(raw.files))
    throw new Error("files must be an object");
  const files = {};
  for (const [path, hash] of Object.entries(raw.files)) {
    const why = checkManifestPath(path);
    if (why !== null)
      throw new Error(`${JSON.stringify(path)}: ${why}`);
    if (typeof hash !== "string" || !SHA256_HEX.test(hash))
      throw new Error(`${JSON.stringify(path)}: hash must be 64 lowercase hex characters (sha256)`);
    files[path] = hash;
  }
  return { schema: SCHEMA2, version: raw.version, files };
}
// packages/cli/src/abandon.ts
import { stat as stat3 } from "fs/promises";
import { dirname as dirname3, join as join4, relative as relative2, resolve as resolve2 } from "path";

// packages/cli/src/paths.ts
import { realpath } from "fs/promises";
import { basename, dirname as dirname2, isAbsolute, join as join3, posix, relative, resolve, sep } from "path";
var isNotFound2 = (e) => typeof e === "object" && e !== null && ("code" in e) && e.code === "ENOENT";
function assertInside(repoReal, p) {
  const back = relative(repoReal, p);
  if (back === "" || back === ".." || back.startsWith(`..${sep}`) || isAbsolute(back)) {
    throw new Error("resolves outside the repo");
  }
}
async function locate(repo, rel) {
  const why = checkManifestPath(rel);
  if (why !== null)
    throw new Error(why);
  const repoReal = await realpath(repo);
  const abs = resolve(repoReal, rel);
  const rest = [basename(abs)];
  let dir = dirname2(abs);
  let dirReal = null;
  while (dirReal === null) {
    try {
      dirReal = await realpath(dir);
    } catch (e) {
      if (!isNotFound2(e) || dirname2(dir) === dir)
        throw e;
      rest.unshift(basename(dir));
      dir = dirname2(dir);
    }
  }
  const at = join3(dirReal, ...rest);
  assertInside(repoReal, at);
  try {
    assertInside(repoReal, await realpath(at));
  } catch (e) {
    if (!isNotFound2(e))
      throw e;
  }
  return at;
}

// packages/cli/src/git.ts
var REDIRECTS = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_COMMON_DIR"];
function gitEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !REDIRECTS.includes(k))
      env[k] = v;
  }
  return { ...env, ...extra };
}
async function runGit(repo, args, opts = {}) {
  const what = opts.what ?? "git";
  let proc;
  try {
    proc = Bun.spawn(["git", "-C", repo, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: opts.input === undefined ? "ignore" : new Blob([opts.input]),
      env: gitEnv(opts.env)
    });
  } catch (e) {
    throw new Error(`${what}: cannot run git: ${e instanceof Error ? e.message : String(e)}`);
  }
  const [raw, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, out: raw.trim(), raw, err: err.trim().split(`
`)[0] ?? "" };
}
var git = (repo, args, what = "merge.target") => runGit(repo, args, { what });
function allowed(configured, branch) {
  if (!isTargetBranch(branch)) {
    throw new Error(`merge.target '${configured}': branch ${JSON.stringify(branch)} is not an allowed target name (want ${BRANCH_PATTERN.source}, no '..', no '.lock' suffix)`);
  }
  return branch;
}
async function resolveTarget(repo, configured) {
  if (configured === CURRENT_TARGET) {
    const r = await git(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    if (r.code === 0 && r.out !== "")
      return allowed(configured, r.out);
    if (r.code === 1)
      throw new Error(`merge.target '${CURRENT_TARGET}': the checkout at ${repo} has a detached HEAD (no branch to target)`);
    throw new Error(`merge.target '${CURRENT_TARGET}': git failed in ${repo}: ${r.err || `exit ${r.code}`}`);
  }
  allowed(configured, configured);
  const r = await git(repo, ["show-ref", "--verify", "--quiet", `refs/heads/${configured}`]);
  if (r.code === 0)
    return configured;
  if (r.code === 1)
    throw new Error(`merge.target '${configured}': no branch refs/heads/${configured} in ${repo}`);
  throw new Error(`merge.target '${configured}': git failed in ${repo}: ${r.err || `exit ${r.code}`}`);
}
async function removeWorktree(repo, path) {
  const r = await git(repo, ["worktree", "remove", "--force", path], "abandon");
  return r.code === 0 ? null : r.err || `exit ${r.code}`;
}
async function deleteBranch(repo, branch) {
  const has = await git(repo, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], "abandon");
  if (has.code === 1)
    return null;
  if (has.code !== 0)
    return has.err || `exit ${has.code}`;
  const r = await git(repo, ["branch", "-D", branch], "abandon");
  return r.code === 0 ? null : r.err || `exit ${r.code}`;
}
async function branchExists(repo, branch, what = "epic") {
  const r = await git(repo, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], what);
  if (r.code === 0)
    return true;
  if (r.code === 1)
    return false;
  throw new Error(`${what}: git failed in ${repo}: ${r.err || `exit ${r.code}`}`);
}
async function addWorktree(repo, path, branch, from) {
  const r = await git(repo, ["worktree", "add", "--quiet", "-b", branch, path, from], "epic start");
  return r.code === 0 ? null : r.err || `exit ${r.code}`;
}

// packages/cli/src/abandon.ts
var isDir = async (path) => {
  try {
    return (await stat3(path)).isDirectory();
  } catch (e) {
    if (isNotFound2(e))
      return false;
    throw e;
  }
};
async function abandonJob(root, args) {
  if (!isJobId(args.id))
    throw new Error(`job id '${args.id}' must match ^\\d{3}-[a-z0-9-]+$`);
  const input = parseEventInput("job.abandoned", { reason: args.reason });
  const snap = await appendEvent(root, args.id, input, undefined, args.usage === undefined ? { force: args.force } : { force: args.force, usage: args.usage });
  const repo = dirname3(resolve2(root));
  const branch = `factory/${args.id}`;
  const worktree = relative2(repo, join4(resolve2(root), ".worktrees", args.id));
  const left = [];
  if (await isDir(join4(repo, worktree))) {
    const why = await removeWorktree(repo, worktree);
    if (why !== null)
      left.push(`worktree ${worktree} (${why})`);
  }
  if (args.deleteBranch) {
    if (snap.branch !== branch)
      left.push(`branch ${snap.branch} (not ${branch}; not deleted)`);
    else if (left.length > 0)
      left.push(`branch ${branch} (its worktree is still there)`);
    else {
      const why = await deleteBranch(repo, branch);
      if (why !== null)
        left.push(`branch ${branch} (${why})`);
    }
  }
  return { snap, left };
}

// packages/cli/src/archive.ts
import { lstat as lstat2, mkdtemp, readFile as readFile3, readdir as readdir3, rm as rm3 } from "fs/promises";
import { tmpdir } from "os";
import { join as join5 } from "path";
var ARCHIVE_BRANCH = "factory/archive";
var ARCHIVE_REF = `refs/heads/${ARCHIVE_BRANCH}`;
var WHAT = "archive";
var MAX_ATTEMPTS = 50;
var HEX_SHA = /^[0-9a-f]{4,64}$/;
var sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
async function git2(repo, args, opts = {}) {
  const r = await runGit(repo, args, { what: WHAT, ...opts });
  if (r.code !== 0)
    throw new Error(`${WHAT}: git ${args[0] ?? ""} failed: ${r.err || `exit ${r.code}`}`);
  return r;
}
async function archiveTip(repo) {
  const r = await runGit(repo, ["rev-parse", "--verify", "--quiet", `${ARCHIVE_REF}^{commit}`], { what: WHAT });
  if (r.code === 0 && r.out !== "")
    return r.out;
  if (r.code === 1)
    return null;
  throw new Error(`${WHAT}: git rev-parse failed in ${repo}: ${r.err || `exit ${r.code}`}`);
}
async function lsTree(repo, treeish) {
  const r = await git2(repo, ["ls-tree", "-z", treeish]);
  const out = [];
  for (const line of r.raw.split("\x00")) {
    if (line === "")
      continue;
    const tab = line.indexOf("\t");
    const [mode, type, sha] = line.slice(0, tab).split(" ");
    if (tab < 0 || mode === undefined || type === undefined || sha === undefined)
      throw new Error(`${WHAT}: unexpected git ls-tree line`);
    out.push({ mode, type, sha, name: line.slice(tab + 1) });
  }
  return out;
}
var mkTreeLine = (e) => `${e.mode} ${e.type} ${e.sha}	${e.name}`;
async function mkTree(repo, entries, env) {
  const input = entries.map((e) => `${mkTreeLine(e)}\x00`).join("");
  return (await git2(repo, ["mktree", "-z"], { input, env })).out;
}
async function archivedIds(repo) {
  const tip = await archiveTip(repo);
  if (tip === null)
    return [];
  return (await lsTree(repo, tip)).filter((e) => e.type === "tree" && isJobId(e.name)).map((e) => e.name).sort();
}
async function isDir2(path) {
  try {
    return (await lstat2(path)).isDirectory();
  } catch (e) {
    if (isNotFound2(e))
      return false;
    throw e;
  }
}
async function exists2(path) {
  try {
    await lstat2(path);
    return true;
  } catch (e) {
    if (isNotFound2(e))
      return false;
    throw e;
  }
}
async function legacySnapshot(dir) {
  let raw;
  try {
    raw = JSON.parse(await readFile3(join5(dir, "job.json"), "utf8"));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || !("stage" in raw) || typeof raw.stage !== "string")
    return null;
  const endedAt = "endedAt" in raw && typeof raw.endedAt === "string" ? raw.endedAt : null;
  return { stage: raw.stage, endedAt };
}
async function readLocalJob(root, id) {
  if (!isJobId(id))
    throw new Error(`job id '${id}' must match ^\\d{3}-[a-z0-9-]+$`);
  const dir = join5(root, "jobs", id);
  if (!await isDir2(dir)) {
    if (await exists2(dir))
      throw new Error(`${id}: not a directory (a symlinked job dir is never followed); not archived`);
    throw new Error(`${id}: no such job`);
  }
  const log = await readLog(root, id);
  if (log.length === 0 && await exists2(join5(dir, "events.jsonl")))
    throw new Error(`${id}: events.jsonl is empty; not archived`);
  if (log.length === 0) {
    const snap = await legacySnapshot(dir);
    if (snap === null)
      throw new Error(`${id}: no events.jsonl and no readable job.json; not archived`);
    return { id, dir, legacy: true, stage: snap.stage, claimed: null, mergedSha: null, endedAt: snap.endedAt, epic: null };
  }
  const [first] = log;
  if (first === undefined || first.type !== "job.claimed")
    throw new Error(`${id}: events.jsonl does not start with job.claimed; not archived`);
  const claimed = { id: first.id, ts: first.ts };
  let mergedSha = null;
  for (const e of log)
    if (e.type === "job.merged")
      mergedSha = e.sha;
  const snap = project2(log);
  return { id, dir, legacy: false, stage: snap.stage, claimed, mergedSha, endedAt: snap.endedAt, epic: snap.epic };
}
var isTerminal = (job) => job.stage === "merged" || job.stage === "abandoned";
function skipTop(name, isDirectory, legacy) {
  if (isDirectory)
    return name.endsWith(".lock");
  return name === "job.json" && !legacy || name === "job.json.tmp";
}
async function buildTree(repo, dir, top, legacy, env) {
  const entries = await readdir3(dir, { withFileTypes: true });
  const files = [];
  const tree = [];
  for (const e of entries) {
    if (top && skipTop(e.name, e.isDirectory(), legacy))
      continue;
    if (e.isFile())
      files.push(e.name);
    else if (e.isDirectory()) {
      const sha = await buildTree(repo, join5(dir, e.name), false, legacy, env);
      if (sha !== null)
        tree.push({ mode: "040000", type: "tree", sha, name: e.name });
    }
  }
  if (files.length > 0) {
    const shas = (await git2(repo, ["hash-object", "-w", "--no-filters", "--", ...files.map((f) => join5(dir, f))], { env })).out.split(`
`);
    if (shas.length !== files.length)
      throw new Error(`${WHAT}: git hash-object returned ${shas.length} ids for ${files.length} files`);
    files.forEach((name, i) => tree.push({ mode: "100644", type: "blob", sha: shas[i] ?? "", name }));
  }
  if (tree.length === 0)
    return null;
  return mkTree(repo, tree, env);
}
async function jobTree(repo, job, env) {
  const sha = await buildTree(repo, job.dir, true, job.legacy, env);
  if (sha === null)
    throw new Error(`${job.id}: nothing to archive (no files)`);
  return sha;
}
function alternate(path) {
  if (!path.includes(":") && !path.startsWith('"'))
    return path;
  return `"${path.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}
async function scratchTree(repo, job) {
  const objects = (await git2(repo, ["rev-parse", "--path-format=absolute", "--git-path", "objects"])).out;
  const scratch = await mkdtemp(join5(tmpdir(), "factory-archive-"));
  try {
    return await buildTree(repo, job.dir, true, job.legacy, { GIT_OBJECT_DIRECTORY: scratch, GIT_ALTERNATE_OBJECT_DIRECTORIES: alternate(objects) });
  } finally {
    await rm3(scratch, { recursive: true, force: true });
  }
}
async function trialTree(repo, job) {
  const sha = await scratchTree(repo, job);
  if (sha === null)
    throw new Error(`${job.id}: nothing to archive (no files)`);
  return sha;
}
async function archivedTrees(repo) {
  const tip = await archiveTip(repo);
  const out = new Map;
  if (tip === null)
    return out;
  for (const e of await lsTree(repo, tip))
    if (e.type === "tree" && isJobId(e.name))
      out.set(e.name, e.sha);
  return out;
}
async function matchesArchived(repo, job, archived) {
  return await scratchTree(repo, job) === archived;
}
async function archivedClaim(repo, tree) {
  const log = (await lsTree(repo, tree)).find((e) => e.name === "events.jsonl" && e.type === "blob");
  if (log === undefined)
    return null;
  const text = (await git2(repo, ["cat-file", "blob", log.sha])).raw;
  const first = text.split(`
`)[0] ?? "";
  let raw;
  try {
    raw = JSON.parse(first);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || !("type" in raw) || raw.type !== "job.claimed")
    return null;
  if (!("id" in raw) || typeof raw.id !== "string" || !("ts" in raw) || typeof raw.ts !== "string")
    return null;
  return { id: raw.id, ts: raw.ts };
}
var describeClaim = (c) => c === null ? "no job.claimed" : `job.claimed id=${c.id} ts=${c.ts}`;
function commitMessage(job) {
  const trailers = [`Factory-Job: ${job.id}`];
  if (job.stage === "merged" && job.mergedSha !== null)
    trailers.push(`Merged-As: ${job.mergedSha}`);
  return ["-m", `chore(factory): archive job ${job.id}`, "-m", trailers.join(`
`)];
}
async function archiveJob(repo, job, force) {
  if (!isTerminal(job))
    throw new Error(`${job.id} is ${job.stage ?? "unreadable"}: only merged or abandoned jobs are archived`);
  if (job.mergedSha !== null && !HEX_SHA.test(job.mergedSha))
    throw new Error(`${job.id}: job.merged sha is not a hex commit id (${HEX_SHA.source}); not archived`);
  if (!job.legacy && job.claimed === null)
    throw new Error(`${job.id}: events.jsonl does not start with job.claimed; not archived`);
  let lastErr = "";
  for (let attempt = 0;attempt < MAX_ATTEMPTS; attempt++) {
    const tip = await archiveTip(repo);
    const top = tip === null ? [] : await lsTree(repo, tip);
    const existing = top.find((e) => e.name === job.id);
    if (existing !== undefined && existing.type !== "tree")
      throw new Error(`${job.id}: ${ARCHIVE_BRANCH} has ${job.id} as a ${existing.type}, not a directory; nothing written`);
    if (existing !== undefined && !job.legacy) {
      const there = await archivedClaim(repo, existing.sha);
      if (there === null || there.id !== job.claimed?.id || there.ts !== job.claimed.ts) {
        throw new Error(`${job.id}: ${ARCHIVE_BRANCH} already holds a different job at ${job.id}/ (archived: ${describeClaim(there)}; local: ${describeClaim(job.claimed)}); nothing written`);
      }
    }
    if (existing !== undefined) {
      const trial = await trialTree(repo, job);
      if (trial === existing.sha)
        return { kind: "unchanged" };
      if (job.legacy) {
        throw new Error(`${job.id}: ${ARCHIVE_BRANCH} already holds a different job at ${job.id}/ (archived: tree ${existing.sha.slice(0, 7)}; local legacy job: tree ${trial.slice(0, 7)}); nothing written`);
      }
      if (!force)
        throw new Error(`${job.id}: changed since it was archived on ${ARCHIVE_BRANCH}; run archive ${job.id} --force to add a new commit`);
    }
    const tree = await jobTree(repo, job);
    const root = await mkTree(repo, [...top.filter((e) => e.name !== job.id), { mode: "040000", type: "tree", sha: tree, name: job.id }]);
    const commit = (await git2(repo, ["commit-tree", root, ...tip === null ? [] : ["-p", tip], ...commitMessage(job)])).out;
    const r = await runGit(repo, ["update-ref", "-m", `archive job ${job.id}`, ARCHIVE_REF, commit, tip ?? ""], { what: WHAT });
    if (r.code === 0)
      return { kind: "archived", commit };
    lastErr = r.err || `exit ${r.code}`;
    await sleep2(5 + Math.floor(Math.random() * 25));
  }
  throw new Error(`${job.id}: ${ARCHIVE_BRANCH} kept moving; gave up after ${MAX_ATTEMPTS} tries (${lastErr})`);
}
async function localJobIds(root) {
  try {
    return (await readdir3(join5(root, "jobs"), { withFileTypes: true })).filter((d) => d.isDirectory() && isJobId(d.name)).map((d) => d.name).sort();
  } catch (e) {
    if (isNotFound2(e))
      return [];
    throw e;
  }
}
var EPICS_DIR = "epics";
async function readLocalEpic(root, slug) {
  checkEpicSlug(slug);
  const dir = join5(root, "jobs", "epics", slug);
  if (!await isDir2(dir)) {
    if (await exists2(dir))
      throw new Error(`epic ${slug}: not a directory (a symlinked epic dir is never followed); not archived`);
    throw new Error(`epic ${slug}: no such epic`);
  }
  const log = await readEpicLog(root, slug);
  const [first] = log;
  if (first === undefined)
    throw new Error(`epic ${slug}: no events.jsonl, or an empty one; not archived`);
  if (first.type !== "epic.started")
    throw new Error(`epic ${slug}: events.jsonl does not start with epic.started; not archived`);
  let landedSha = null;
  let endedAt = null;
  for (const e of log) {
    if (e.type === "epic.landed") {
      landedSha = e.sha;
      endedAt = e.ts;
    } else if (e.type === "epic.abandoned")
      endedAt = e.ts;
  }
  return {
    slug,
    dir,
    state: loggedEpicState(log),
    started: { slug: first.slug, ts: first.ts },
    landedSha,
    endedAt,
    files: [
      { name: "events.jsonl", path: join5(dir, "events.jsonl") },
      { name: "plan.md", path: join5(root, "epics", `${slug}.md`) }
    ]
  };
}
var isEpicTerminal = (epic) => epic.state === "landed" || epic.state === "abandoned";
async function checkEpicFiles(epic) {
  for (const f of epic.files) {
    let st;
    try {
      st = await lstat2(f.path);
    } catch (e) {
      if (!isNotFound2(e))
        throw e;
      if (f.name === "plan.md")
        throw new Error(`epic ${epic.slug}: plan factory/epics/${epic.slug}.md is missing; not archived`);
      throw new Error(`epic ${epic.slug}: ${f.name} is missing; not archived`);
    }
    if (!st.isFile())
      throw new Error(`epic ${epic.slug}: ${f.name === "plan.md" ? `plan factory/epics/${epic.slug}.md` : f.name} is not a regular file; not archived`);
  }
}
async function filesTree(repo, files, env) {
  const shas = (await git2(repo, ["hash-object", "-w", "--no-filters", "--", ...files.map((f) => f.path)], { env })).out.split(`
`);
  if (shas.length !== files.length)
    throw new Error(`${WHAT}: git hash-object returned ${shas.length} ids for ${files.length} files`);
  return mkTree(repo, files.map((f, i) => ({ mode: "100644", type: "blob", sha: shas[i] ?? "", name: f.name })), env);
}
async function scratchEpicTree(repo, epic) {
  const objects = (await git2(repo, ["rev-parse", "--path-format=absolute", "--git-path", "objects"])).out;
  const scratch = await mkdtemp(join5(tmpdir(), "factory-archive-"));
  try {
    return await filesTree(repo, epic.files, { GIT_OBJECT_DIRECTORY: scratch, GIT_ALTERNATE_OBJECT_DIRECTORIES: alternate(objects) });
  } finally {
    await rm3(scratch, { recursive: true, force: true });
  }
}
async function archivedEpicTrees(repo) {
  const out = new Map;
  const tip = await archiveTip(repo);
  if (tip === null)
    return out;
  const epics = (await lsTree(repo, tip)).find((e) => e.name === EPICS_DIR && e.type === "tree");
  if (epics === undefined)
    return out;
  for (const e of await lsTree(repo, epics.sha))
    if (e.type === "tree" && isEpicSlug(e.name))
      out.set(e.name, e.sha);
  return out;
}
async function matchesArchivedEpic(repo, epic, archived) {
  await checkEpicFiles(epic);
  return await scratchEpicTree(repo, epic) === archived;
}
async function archivedEpicLog(repo, slug) {
  checkEpicSlug(slug);
  const tree = (await archivedEpicTrees(repo)).get(slug);
  if (tree === undefined)
    return null;
  const log = (await lsTree(repo, tree)).find((e) => e.name === "events.jsonl" && e.type === "blob");
  if (log === undefined)
    return null;
  return parseEpicLog((await git2(repo, ["cat-file", "blob", log.sha])).raw);
}
async function archivedStart(repo, tree) {
  const log = (await lsTree(repo, tree)).find((e) => e.name === "events.jsonl" && e.type === "blob");
  if (log === undefined)
    return null;
  const first = (await git2(repo, ["cat-file", "blob", log.sha])).raw.split(`
`)[0] ?? "";
  let raw;
  try {
    raw = JSON.parse(first);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || !("type" in raw) || raw.type !== "epic.started")
    return null;
  if (!("slug" in raw) || typeof raw.slug !== "string" || !("ts" in raw) || typeof raw.ts !== "string")
    return null;
  return { slug: raw.slug, ts: raw.ts };
}
var describeStart = (s) => s === null ? "no epic.started" : `epic.started slug=${s.slug} ts=${s.ts}`;
async function archiveEpic(repo, epic, force) {
  const name = `epic ${epic.slug}`;
  if (!isEpicTerminal(epic))
    throw new Error(`${name} is ${epic.state ?? "unreadable"}: only landed or abandoned epics are archived`);
  if (epic.landedSha !== null && !HEX_SHA.test(epic.landedSha))
    throw new Error(`${name}: epic.landed sha is not a hex commit id (${HEX_SHA.source}); not archived`);
  await checkEpicFiles(epic);
  let lastErr = "";
  for (let attempt = 0;attempt < MAX_ATTEMPTS; attempt++) {
    const tip = await archiveTip(repo);
    const top = tip === null ? [] : await lsTree(repo, tip);
    const dir = top.find((e) => e.name === EPICS_DIR);
    if (dir !== undefined && dir.type !== "tree")
      throw new Error(`${name}: ${ARCHIVE_BRANCH} has ${EPICS_DIR} as a ${dir.type}, not a directory; nothing written`);
    const sub = dir === undefined ? [] : await lsTree(repo, dir.sha);
    const existing = sub.find((e) => e.name === epic.slug);
    if (existing !== undefined && existing.type !== "tree")
      throw new Error(`${name}: ${ARCHIVE_BRANCH} has ${EPICS_DIR}/${epic.slug} as a ${existing.type}, not a directory; nothing written`);
    if (existing !== undefined) {
      const there = await archivedStart(repo, existing.sha);
      if (there === null || there.slug !== epic.started.slug || there.ts !== epic.started.ts) {
        throw new Error(`${name}: ${ARCHIVE_BRANCH} already holds a different epic at ${EPICS_DIR}/${epic.slug}/ (archived: ${describeStart(there)}; local: ${describeStart(epic.started)}); nothing written`);
      }
      if (await scratchEpicTree(repo, epic) === existing.sha)
        return { kind: "unchanged" };
      if (!force)
        throw new Error(`${name}: changed since it was archived on ${ARCHIVE_BRANCH}; run archive ${epic.slug} --force to add a new commit`);
    }
    const tree = await filesTree(repo, epic.files);
    const epics = await mkTree(repo, [...sub.filter((e) => e.name !== epic.slug), { mode: "040000", type: "tree", sha: tree, name: epic.slug }]);
    const root = await mkTree(repo, [...top.filter((e) => e.name !== EPICS_DIR), { mode: "040000", type: "tree", sha: epics, name: EPICS_DIR }]);
    const trailers = [`Factory-Epic: ${epic.slug}`];
    if (epic.state === "landed" && epic.landedSha !== null)
      trailers.push(`Landed-As: ${epic.landedSha}`);
    const message = ["-m", `chore(factory): archive epic ${epic.slug}`, "-m", trailers.join(`
`)];
    const commit = (await git2(repo, ["commit-tree", root, ...tip === null ? [] : ["-p", tip], ...message])).out;
    const r = await runGit(repo, ["update-ref", "-m", `archive epic ${epic.slug}`, ARCHIVE_REF, commit, tip ?? ""], { what: WHAT });
    if (r.code === 0)
      return { kind: "archived", commit };
    lastErr = r.err || `exit ${r.code}`;
    await sleep2(5 + Math.floor(Math.random() * 25));
  }
  throw new Error(`${name}: ${ARCHIVE_BRANCH} kept moving; gave up after ${MAX_ATTEMPTS} tries (${lastErr})`);
}

// packages/cli/src/doctor.ts
import { createHash } from "crypto";
import { readFile as readFile4, readdir as readdir4 } from "fs/promises";
import { dirname as dirname4, join as join6, resolve as resolve3 } from "path";
var firstLine = (e) => (e instanceof Error ? e.message : String(e)).split(`
`)[0] ?? "";
var ok = (what) => ({ ok: true, line: `ok    ${what}` });
var bad = (what, why) => ({ ok: false, line: `FAIL  ${what}: ${why}` });
async function readText2(path) {
  try {
    return await readFile4(path, "utf8");
  } catch (e) {
    if (isNotFound2(e))
      return null;
    throw e;
  }
}
async function checkConfig(root) {
  let text;
  try {
    text = await readText2(join6(root, "config.json"));
  } catch (e) {
    return bad("config.json", firstLine(e));
  }
  if (text === null)
    return bad("config.json", "missing");
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return bad("config.json", "not valid JSON");
  }
  try {
    parseConfig(raw);
  } catch (e) {
    return bad("config.json", firstLine(e));
  }
  return ok("config.json");
}
async function safeRead(repo, rel) {
  const at = await locate(repo, rel);
  try {
    return await readFile4(at);
  } catch (e) {
    if (isNotFound2(e))
      return null;
    throw e;
  }
}
async function checkManaged(root) {
  let text;
  try {
    text = await readText2(join6(root, "managed.json"));
  } catch (e) {
    return [bad("managed.json", firstLine(e))];
  }
  if (text === null)
    return [{ ok: true, line: "note  unstamped install: no managed.json, hash checks skipped" }];
  let manifest;
  try {
    manifest = parseManifest(JSON.parse(text));
  } catch (e) {
    return [bad("managed.json", e instanceof SyntaxError ? "not valid JSON" : firstLine(e))];
  }
  const repo = dirname4(resolve3(root));
  const out = [ok(`managed.json (version ${manifest.version})`)];
  for (const [rel, want] of Object.entries(manifest.files)) {
    try {
      const data = await safeRead(repo, rel);
      if (data === null) {
        out.push(bad(rel, "missing"));
        continue;
      }
      const got = createHash("sha256").update(data).digest("hex");
      out.push(got === want ? ok(rel) : bad(rel, "changed (sha256 mismatch)"));
    } catch (e) {
      out.push(bad(rel, firstLine(e)));
    }
  }
  return out;
}
async function checkJobNumbers(root) {
  let names;
  try {
    names = (await readdir4(join6(root, "jobs"), { withFileTypes: true })).filter((d) => d.isDirectory() && isJobId(d.name)).map((d) => d.name);
  } catch (e) {
    if (isNotFound2(e))
      return [];
    return [bad("jobs/", firstLine(e))];
  }
  const byNumber = new Map;
  for (const name of names.sort()) {
    const n = name.slice(0, 3);
    byNumber.set(n, [...byNumber.get(n) ?? [], name]);
  }
  return [...byNumber.entries()].filter(([, ids]) => ids.length > 1).map(([n, ids]) => ({ ok: true, line: `note: job number ${n} is used by ${ids.join(", ")}` }));
}
async function checkPlans(root) {
  let entries;
  try {
    entries = (await readdir4(join6(root, "epics"), { withFileTypes: true })).filter((d) => d.name.endsWith(".md")).sort((a, b) => a.name < b.name ? -1 : 1);
  } catch (e) {
    if (isNotFound2(e))
      return [];
    return [bad("factory/epics/", firstLine(e))];
  }
  const out = [];
  for (const e of entries) {
    const rel = `factory/epics/${e.name}`;
    if (!e.isFile()) {
      out.push(bad(rel, "not a regular file (a symlink is never followed)"));
      continue;
    }
    const slug = e.name.slice(0, -".md".length);
    let plan;
    try {
      plan = parsePlan(await readFile4(join6(root, "epics", e.name), "utf8"));
    } catch (err) {
      out.push(bad(rel, firstLine(err)));
      continue;
    }
    if (plan.status === "done" || plan.status === "abandoned")
      continue;
    let slugError = null;
    try {
      checkEpicSlug(slug);
    } catch (err) {
      slugError = firstLine(err);
    }
    if (plan.status === "draft") {
      const notes = [...slugError === null ? [] : [slugError], ...plan.errors];
      if (notes.length === 0)
        out.push(ok(`${rel} (draft)`));
      for (const n of notes)
        out.push({ ok: true, line: `note  ${rel}: ${n}` });
      continue;
    }
    if (slugError !== null) {
      out.push(bad(rel, slugError));
      continue;
    }
    try {
      const problem = await epicPlanProblem(root, slug);
      out.push(problem === null ? ok(rel) : bad(rel, problem));
    } catch (err) {
      out.push(bad(rel, firstLine(err)));
    }
  }
  return out;
}
async function doctor(root) {
  return [await checkConfig(root), ...await checkManaged(root), ...await checkJobNumbers(root), ...await checkPlans(root)];
}

// packages/cli/src/epic.ts
import { lstat as lstat3 } from "fs/promises";
import { dirname as dirname6, join as join8, relative as relative3, resolve as resolve5 } from "path";

// packages/cli/src/usage-claude.ts
import { readFile as readFile5, readdir as readdir5, stat as stat4 } from "fs/promises";
import { homedir } from "os";
import { basename as basename2, dirname as dirname5, join as join7, resolve as resolve4 } from "path";
function transcriptRoot(env = process.env) {
  const config = env.CLAUDE_CONFIG_DIR;
  const base = config !== undefined && config !== "" ? config : join7(env.HOME !== undefined && env.HOME !== "" ? env.HOME : homedir(), ".claude");
  return join7(base, "projects");
}
var projectFolder = (dir) => resolve4(dir).replace(/[^A-Za-z0-9]/g, "-");
var isRecord5 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var count = (v) => typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;

class Tally {
  window;
  messages = new Map;
  lines = 0;
  recognized = 0;
  constructor(window) {
    this.window = window;
  }
  add(text) {
    const from = Date.parse(this.window.from);
    const to = Date.parse(this.window.to);
    for (const line of text.split(`
`)) {
      if (line.trim() === "")
        continue;
      this.lines += 1;
      let raw;
      try {
        raw = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isRecord5(raw) || typeof raw.timestamp !== "string")
        continue;
      const at = Date.parse(raw.timestamp);
      if (Number.isNaN(at))
        continue;
      this.recognized += 1;
      if (at < from || at > to)
        continue;
      const message = raw.message;
      if (!isRecord5(message) || typeof message.id !== "string" || !isRecord5(message.usage))
        continue;
      const u = message.usage;
      const seen = this.messages.get(message.id);
      const model = typeof message.model === "string" && message.model !== "" ? message.model : null;
      const next = {
        model: seen?.model ?? model,
        input: Math.max(seen?.input ?? 0, count(u.input_tokens)),
        output: Math.max(seen?.output ?? 0, count(u.output_tokens)),
        cacheWrite: Math.max(seen?.cacheWrite ?? 0, count(u.cache_creation_input_tokens)),
        cacheRead: Math.max(seen?.cacheRead ?? 0, count(u.cache_read_input_tokens))
      };
      this.messages.set(message.id, next);
    }
  }
  get size() {
    return this.messages.size;
  }
  get unrecognized() {
    return this.lines > 0 && this.recognized === 0;
  }
  usage() {
    const total = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    const byModel = new Map;
    for (const m of this.messages.values()) {
      total.input += m.input;
      total.output += m.output;
      total.cacheWrite += m.cacheWrite;
      total.cacheRead += m.cacheRead;
      if (m.model !== null && m.model !== "<synthetic>")
        byModel.set(m.model, (byModel.get(m.model) ?? 0) + m.output);
    }
    let model = null;
    let most = -1;
    for (const [name, out] of byModel) {
      if (out > most) {
        model = name;
        most = out;
      }
    }
    return { model, ...total };
  }
}
async function isFile(path) {
  try {
    return (await stat4(path)).isFile();
  } catch (e) {
    if (isNotFound2(e))
      return false;
    throw e;
  }
}
async function dirsIn(path) {
  try {
    return (await readdir5(path, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch (e) {
    if (isNotFound2(e))
      return [];
    throw e;
  }
}
async function findAgentTranscript(root, repo, agentId) {
  if (!isAgentId(agentId))
    return null;
  const preferred = projectFolder(repo);
  const all = await dirsIn(root);
  const order = [...all.filter((p) => p === preferred), ...all.filter((p) => p !== preferred)];
  for (const project of order) {
    for (const session of await dirsIn(join7(root, project))) {
      const path = join7(root, project, session, "subagents", `agent-${agentId}.jsonl`);
      if (await isFile(path))
        return path;
    }
  }
  return null;
}
var sessionTranscript = (agentTranscript) => {
  const sessionDir = dirname5(dirname5(agentTranscript));
  return join7(dirname5(sessionDir), `${basename2(sessionDir)}.jsonl`);
};
async function readText3(path) {
  try {
    return await readFile5(path, "utf8");
  } catch (e) {
    if (isNotFound2(e))
      return null;
    throw e;
  }
}
function claudeUsageReader(opts) {
  const root = transcriptRoot(opts.env);
  return {
    async agent(agentId, window) {
      if (!isAgentId(agentId))
        return unavailable("agentId is not a safe id (want ^[A-Za-z0-9_-]+$)");
      const path = await findAgentTranscript(root, opts.repo, agentId);
      if (path === null)
        return unavailable(`no Claude Code transcript for agent ${agentId}`);
      const text = await readText3(path);
      if (text === null)
        return unavailable(`no Claude Code transcript for agent ${agentId}`);
      const tally = new Tally(window);
      tally.add(text);
      if (tally.unrecognized)
        return unavailable("Claude Code transcript format not recognized");
      if (tally.size === 0)
        return unavailable("no assistant messages inside the span");
      return tally.usage();
    },
    async orchestrator(agentIds, window) {
      const ids = agentIds.filter(isAgentId);
      if (ids.length === 0)
        return unavailable("no agent ids recorded to find the orchestrating session");
      const sessions = [];
      for (const id of ids) {
        const path = await findAgentTranscript(root, opts.repo, id);
        if (path === null)
          continue;
        const session = sessionTranscript(path);
        if (!sessions.includes(session))
          sessions.push(session);
      }
      if (sessions.length === 0)
        return unavailable("no Claude Code session found from the agent ids");
      const tally = new Tally(window);
      for (const session of sessions) {
        const text = await readText3(session);
        if (text === null)
          return unavailable("an orchestrating session transcript is missing");
        tally.add(text);
      }
      if (tally.unrecognized)
        return unavailable("Claude Code transcript format not recognized");
      return tally.usage();
    }
  };
}

// packages/cli/src/epic.ts
var EPIC_USAGE = {
  epic: "usage: epic start|event|next|show|abandon <slug> \u2026",
  epicStart: "usage: epic start <slug> [session=t3code:<environmentId>/<threadId>]",
  epicEvent: "usage: epic event <slug> <type> [field=value \u2026]",
  epicNext: "usage: epic next <slug>",
  epicShow: "usage: epic show <slug>",
  epicAbandon: 'usage: epic abandon <slug> "<reason>" [--force] [--delete-branch]'
};
var usageReader = (io) => claudeUsageReader({ repo: dirname6(resolve5(io.root)), env: io.env ?? process.env });
var WORKING2 = ["claimed", "spec", "build", "review", "approve"];
async function pathExists(path) {
  try {
    await lstat3(path);
    return true;
  } catch (e) {
    if (isNotFound2(e))
      return false;
    throw e;
  }
}
async function sameCommit(repo, a, b) {
  const [x, y] = await Promise.all([a, b].map((r) => runGit(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${r}^{commit}`], { what: "epic start" })));
  return x !== undefined && y !== undefined && x.code === 0 && y.code === 0 && x.out === y.out;
}
var worktreeOf = (repo, root, slug) => relative3(repo, join8(resolve5(root), ".worktrees", `epic-${slug}`));
async function runEpic(rest, io, config) {
  const [sub, ...args] = rest;
  switch (sub) {
    case "start":
      return start(args, io, config);
    case "event":
      return event(args, io);
    case "next":
      return next(args, io, config);
    case "show":
      return show(args, io);
    case "abandon":
      return abandon(args, io);
    default:
      throw new Error(EPIC_USAGE.epic);
  }
}
async function start(args, io, config) {
  const [slug, ...kv] = args;
  if (slug === undefined || slug === "")
    throw new Error(EPIC_USAGE.epicStart);
  checkEpicSlug(slug);
  const fields = parseFields(kv);
  const problem = await epicPlanProblem(io.root, slug);
  if (problem !== null)
    throw new Error(`epic start ${slug}: ${problem}`);
  const repo = dirname6(resolve5(io.root));
  const target = await resolveTarget(repo, mergeTarget(config));
  const input = parseEpicEventInput("epic.started", fields, { slug, target });
  const branch = epicBranch(slug);
  const worktree = worktreeOf(repo, io.root, slug);
  const setup = async () => {
    if (await branchExists(repo, branch))
      throw new Error(`epic start ${slug}: branch ${branch} already exists`);
    if (await pathExists(join8(repo, worktree)))
      throw new Error(`epic start ${slug}: ${worktree} already exists`);
    const cleanup = async (deleteIt) => {
      const left = [];
      if (await isDir(join8(repo, worktree))) {
        const w = await removeWorktree(repo, worktree);
        if (w !== null)
          left.push(`worktree ${worktree} (${w})`);
      }
      if (deleteIt && left.length === 0) {
        const b = await deleteBranch(repo, branch);
        if (b !== null)
          left.push(`branch ${branch} (${b})`);
      }
      return left;
    };
    const undo = async () => {
      const left = await cleanup(true);
      if (left.length > 0)
        throw new Error(`epic start ${slug} failed, and its rollback left behind: ${left.join("; ")}`);
    };
    const why = await addWorktree(repo, worktree, branch, target);
    if (why !== null) {
      const ours = await branchExists(repo, branch) && await sameCommit(repo, branch, target);
      const left = await cleanup(ours);
      throw new Error(`epic start ${slug}: git worktree add failed: ${why}${left.length > 0 ? `; rollback left behind: ${left.join("; ")}` : ""}`);
    }
    return undo;
  };
  const snap = await startEpic(io.root, slug, input, undefined, setup);
  io.stdout(snap.state);
  return 0;
}
async function event(args, io) {
  const [slug, type, ...kv] = args;
  if (!slug || !type)
    throw new Error(EPIC_USAGE.epicEvent);
  checkEpicSlug(slug);
  if (type === "epic.started")
    throw new Error(`epic.started is written only by epic start: run ${EPIC_USAGE.epicStart.replace("usage: ", "")}`);
  if (type === "epic.abandoned")
    throw new Error(`epic.abandoned is written only by epic abandon: run ${EPIC_USAGE.epicAbandon.replace("usage: ", "")}`);
  const input = parseEpicEventInput(type, parseFields(kv));
  io.stdout((await appendEpicEvent(io.root, slug, input, undefined, { usage: usageReader(io) })).state);
  return 0;
}
async function next(args, io, config) {
  const [slug, ...extra] = args;
  if (!slug || extra.length > 0)
    throw new Error(EPIC_USAGE.epicNext);
  checkEpicSlug(slug);
  const inputs = await loadEpic(io.root, slug);
  if (inputs.log.length === 0)
    throw new Error(`epic ${slug} has not started`);
  for (const line of epicNext(inputs.view, epicMaxParallel(config)))
    io.stdout(line);
  return 0;
}
async function show(args, io) {
  const [slug, ...extra] = args;
  if (!slug || extra.length > 0)
    throw new Error(EPIC_USAGE.epicShow);
  checkEpicSlug(slug);
  for (const line of formatEpicShow(await rebuildEpic(io.root, slug)))
    io.stdout(line);
  return 0;
}
function formatEpicShow(snap) {
  const out = [`epic ${snap.slug}  ${snap.state}  ${snap.branch} -> ${snap.target}`];
  if (snap.waitingOn === "you")
    out.push(`waiting on you: ${snap.note}`);
  if (snap.waitingOn === "members") {
    const stuck = [...snap.members.filter((m) => m.state === "needs-human").map((m) => `${m.slug} (${m.job ?? ""})`), ...snap.generated.filter((g) => g.stage === "needs-human").map((g) => `${g.kind} ${g.id}`)];
    out.push(`waiting on members: nothing else can run; needs-human: ${stuck.join(", ")}`);
  }
  if (snap.state === "abandoned" || snap.state === "landed")
    out.push(`note: ${snap.note}`);
  if (snap.planError !== null)
    out.push(`plan: ${snap.planError}`);
  out.push(epicUsageLine(snap));
  for (const m of snap.members) {
    const parts = [`member ${m.slug}`, m.state];
    if (m.job !== null)
      parts.push(m.job);
    if (m.state === "running" && m.stage !== null)
      parts.push(m.stage);
    if (m.state === "blocked")
      parts.push(`blocked on ${m.blockedOn.map((b) => b.job === null ? b.member : `${b.member} (${b.job})`).join(", ")}`);
    out.push(parts.join("  "));
  }
  for (const g of snap.generated)
    out.push(`${g.kind} ${g.id}  ${g.stage}`);
  return out;
}
function epicUsageLine(snap) {
  const o = snap.orchestrator;
  if (o.spans === 0)
    return "orchestrator usage: no stretch ended yet";
  const summary = usageSummary(o, ["stretch", "stretches"]);
  if (o.status !== "exact" && o.status !== "partial")
    return `orchestrator usage: ${summary}`;
  const ge = o.status === "partial" ? "\u2265 " : "";
  return `orchestrator usage: ${summary}  (input ${ge}${o.input}, output ${ge}${o.output}, cache write ${ge}${o.cacheWrite}, cache read ${ge}${o.cacheRead})`;
}
function parseAbandon(args) {
  const [slug, reason, ...flags] = args;
  if (slug === undefined || reason === undefined || reason === "" || flags.length > 2)
    throw new Error(EPIC_USAGE.epicAbandon);
  const known = ["--force", "--delete-branch"];
  if (flags.some((f) => !known.includes(f)) || new Set(flags).size !== flags.length)
    throw new Error(EPIC_USAGE.epicAbandon);
  return { slug, reason, force: flags.includes("--force"), deleteBranch: flags.includes("--delete-branch") };
}
async function abandon(args, io) {
  const a = parseAbandon(args);
  checkEpicSlug(a.slug);
  const input = parseEpicEventInput("epic.abandoned", { reason: a.reason });
  await appendEpicEvent(io.root, a.slug, input, undefined, {
    usage: usageReader(io),
    check: ({ jobs }) => {
      const working = jobs.filter((j) => WORKING2.includes(j.stage));
      if (working.length > 0 && !a.force) {
        throw new Error(`epic ${a.slug}: ${working.map((j) => `${j.id} (${j.stage})`).join(", ")} ${working.length === 1 ? "is" : "are"} in a working stage; stop ${working.length === 1 ? "its session" : "their sessions"} and pass --force`);
      }
    }
  });
  const left = [];
  for (const j of await readEpicJobs(io.root, a.slug)) {
    if (j.stage === "merged" || j.stage === "abandoned")
      continue;
    try {
      const r = await abandonJob(io.root, { id: j.id, reason: `epic ${a.slug} abandoned: ${a.reason}`, force: a.force, deleteBranch: false });
      left.push(...r.left);
    } catch (e) {
      left.push(`job ${j.id} (${(e instanceof Error ? e.message : String(e)).split(`
`)[0] ?? ""})`);
    }
  }
  const repo = dirname6(resolve5(io.root));
  const worktree = worktreeOf(repo, io.root, a.slug);
  const branch = epicBranch(a.slug);
  let worktreeLeft = false;
  if (await isDir(join8(repo, worktree))) {
    const why = await removeWorktree(repo, worktree);
    if (why !== null) {
      worktreeLeft = true;
      left.push(`worktree ${worktree} (${why})`);
    }
  }
  if (a.deleteBranch) {
    if (worktreeLeft)
      left.push(`branch ${branch} (its worktree is still there)`);
    else {
      const why = await deleteBranch(repo, branch);
      if (why !== null)
        left.push(`branch ${branch} (${why})`);
    }
  }
  if (left.length > 0)
    throw new Error(`epic ${a.slug} is abandoned, but cleanup left behind: ${left.join("; ")}`);
  io.stdout("abandoned");
  return 0;
}

// packages/cli/src/prune.ts
import { lstat as lstat4, mkdir as mkdir4, rm as rm4 } from "fs/promises";
import { dirname as dirname7, join as join9, resolve as resolve6 } from "path";
var LOCK = ".events.lock";
var IN_FLIGHT = `an event is in flight (${LOCK})`;
var isSystemError = (e) => typeof e === "object" && e !== null && ("code" in e);
var lineOf = (e) => (e instanceof Error ? e.message : String(e)).split(`
`)[0] ?? "";
async function exists3(path) {
  try {
    await lstat4(path);
    return true;
  } catch (e) {
    if (isNotFound2(e))
      return false;
    throw e;
  }
}
function epicFacts(io, repo) {
  const cache = new Map;
  const read = async (slug) => {
    if (!isEpicSlug(slug))
      return null;
    if (await exists3(join9(io.root, "jobs", "epics", slug))) {
      try {
        const epic = await readLocalEpic(io.root, slug);
        return { state: epic.state, endedAt: epic.endedAt };
      } catch (e) {
        if (isSystemError(e))
          throw e;
        return null;
      }
    }
    const log = await archivedEpicLog(repo, slug);
    if (log === null || log.length === 0)
      return null;
    const end = [...log].reverse().find((e) => e.type === "epic.landed" || e.type === "epic.abandoned");
    return { state: loggedEpicState(log), endedAt: end?.ts ?? null };
  };
  return (slug) => {
    let hit = cache.get(slug);
    if (hit === undefined) {
      hit = read(slug);
      cache.set(slug, hit);
    }
    return hit;
  };
}
async function check(io, id, trees, hours, now, facts) {
  if (await exists3(join9(io.root, "jobs", id, LOCK)))
    return { kind: "keep", reason: IN_FLIGHT };
  let job;
  try {
    job = await readLocalJob(io.root, id);
  } catch (e) {
    if (isSystemError(e))
      throw e;
    const text = lineOf(e);
    return { kind: "keep", reason: text.startsWith(`${id}: `) ? text.slice(id.length + 2) : text };
  }
  if (!isTerminal(job))
    return { kind: "keep", reason: `not merged or abandoned (${job.stage ?? "unreadable"})` };
  let epic = null;
  if (job.epic !== null) {
    epic = await facts(job.epic);
    if (epic === null)
      return { kind: "keep", reason: `its epic ${job.epic} is not found` };
    if (epic.state !== "landed" && epic.state !== "abandoned")
      return { kind: "keep", reason: `its epic ${job.epic} is not landed or abandoned (${epic.state ?? "unreadable"})` };
  }
  if (!isSettled(job, hours, now, epic))
    return { kind: "keep", reason: "not settled" };
  const tree = trees.get(id);
  if (tree === undefined)
    return { kind: "keep", reason: "not archived" };
  return { kind: "candidate", job, tree };
}
async function compareAndRemove(dir, same) {
  const lock = join9(dir, LOCK);
  try {
    await mkdir4(lock);
  } catch (e) {
    if (typeof e === "object" && e !== null && "code" in e && e.code === "EEXIST")
      return { kind: "keep", reason: IN_FLIGHT };
    throw e;
  }
  let equal;
  try {
    equal = await same();
  } catch (e) {
    await rm4(lock, { recursive: true, force: true });
    throw e;
  }
  if (!equal) {
    await rm4(lock, { recursive: true, force: true });
    return { kind: "keep", reason: "differs from its archived tree" };
  }
  await rm4(dir, { recursive: true });
  return { kind: "prune" };
}
async function checkEpic(io, slug, trees, hours, now) {
  if (await exists3(join9(io.root, "jobs", "epics", slug, LOCK)))
    return { kind: "keep", reason: IN_FLIGHT };
  let epic;
  try {
    epic = await readLocalEpic(io.root, slug);
  } catch (e) {
    if (isSystemError(e))
      throw e;
    const text = lineOf(e);
    return { kind: "keep", reason: text.startsWith(`epic ${slug}: `) ? text.slice(`epic ${slug}: `.length) : text };
  }
  if (!isEpicTerminal(epic))
    return { kind: "keep", reason: `not landed or abandoned (${epic.state ?? "unreadable"})` };
  if (!isEpicSettled(epic, hours, now))
    return { kind: "keep", reason: "not settled" };
  const tree = trees.get(slug);
  if (tree === undefined)
    return { kind: "keep", reason: "not archived" };
  return { kind: "candidate", epic, tree };
}
async function pruneAll(io, settleAfterHours) {
  const repo = dirname7(resolve6(io.root));
  const now = (io.now ?? (() => new Date))();
  const trees = await archivedTrees(repo);
  const epicTrees = await archivedEpicTrees(repo);
  const facts = epicFacts(io, repo);
  let removed = 0;
  let kept = 0;
  let failed = 0;
  for (const id of await localJobIds(io.root)) {
    try {
      const first = await check(io, id, trees, settleAfterHours, now, facts);
      const decision = first.kind === "candidate" ? await compareAndRemove(first.job.dir, () => matchesArchived(repo, first.job, first.tree)) : first;
      if (decision.kind === "prune") {
        removed++;
        io.stdout(`pruned ${id}`);
      } else {
        kept++;
        io.stdout(`kept ${id}: ${decision.reason}`);
      }
    } catch (e) {
      failed++;
      const text = lineOf(e);
      io.stderr(text.startsWith(`${id}: `) ? text : `${id}: ${text}`);
    }
  }
  for (const slug of await epicSlugs(io.root)) {
    const name = `epic ${slug}`;
    try {
      const first = await checkEpic(io, slug, epicTrees, settleAfterHours, now);
      const decision = first.kind === "candidate" ? await compareAndRemove(first.epic.dir, () => matchesArchivedEpic(repo, first.epic, first.tree)) : first;
      if (decision.kind === "prune") {
        removed++;
        io.stdout(`pruned ${name}`);
      } else {
        kept++;
        io.stdout(`kept ${name}: ${decision.reason}`);
      }
    } catch (e) {
      failed++;
      const text = lineOf(e);
      io.stderr(text.startsWith(`${name}: `) ? text : `${name}: ${text}`);
    }
  }
  io.stdout(`prune: removed ${removed}, kept ${kept}, failed ${failed}`);
  return failed === 0 ? 0 : 1;
}

// packages/cli/src/core.ts
var usageReader2 = (io) => claudeUsageReader({ repo: dirname8(resolve7(io.root)), env: io.env ?? process.env });
var USAGE = {
  claim: "usage: claim <slug> [brief=\u2026] [issue=\u2026] [maxRound=\u2026] [session=t3code:<environmentId>/<threadId>] [epic=<slug> [kind=member|sync|fix]]",
  event: "usage: event <id> <type> [field=value \u2026]",
  rebuild: "usage: rebuild <id> | --all",
  show: "usage: show <id>",
  abandon: 'usage: abandon <id> "<reason>" [--force] [--delete-branch]',
  archive: "usage: archive <id> | --all [--force]",
  prune: "usage: prune",
  ...EPIC_USAGE,
  all: "usage: claim <slug> [k=v \u2026] | event <id> <type> [k=v \u2026] | rebuild <id>|--all | show <id>"
};
async function dispatchCore(argv, io, usage = USAGE.all) {
  const [cmd, ...rest] = argv;
  if (cmd === "doctor") {
    const findings = await doctor(io.root);
    for (const f of findings)
      io.stdout(f.line);
    return findings.every((f) => f.ok) ? 0 : 1;
  }
  const config = parseConfig(JSON.parse(await readFile6(join10(io.root, "config.json"), "utf8")));
  switch (cmd) {
    case "claim": {
      const [slug, ...kv] = rest;
      if (slug === undefined)
        throw new Error(USAGE.claim);
      checkSlug(slug);
      const fields = parseFields(kv);
      checkClaim(slug, { fields, config });
      const repo = dirname8(resolve7(io.root));
      const epic = typeof fields.epic === "string" ? fields.epic : undefined;
      const target = epic === undefined ? await resolveTarget(repo, mergeTarget(config)) : await epicTarget(io.root, repo, epic);
      io.stdout((await claimJob(io.root, slug, { fields, config, target }, undefined, { archived: () => archivedIds(repo) })).id);
      return 0;
    }
    case "event": {
      const [id, type, ...kv] = rest;
      if (!id || !type)
        throw new Error(USAGE.event);
      if (type === "job.claimed")
        throw new Error(`job.claimed is written only by claim: run ${USAGE.claim.replace("usage: ", "")}`);
      const fields = parseFields(kv);
      io.stdout((await appendEvent(io.root, id, parseEventInput(type, fields, { id, config }), undefined, { usage: usageReader2(io) })).stage);
      return 0;
    }
    case "rebuild": {
      const [target] = rest;
      if (!target)
        throw new Error(USAGE.rebuild);
      const { jobs, epics } = await rebuildAll(io.root, target === "--all" ? undefined : target);
      io.stdout(`rebuilt ${jobs.length}: ${jobs.join(" ")}`);
      if (epics.length > 0)
        io.stdout(`rebuilt epics ${epics.length}: ${epics.join(" ")}`);
      return 0;
    }
    case "show": {
      const [id] = rest;
      if (!id)
        throw new Error(USAGE.show);
      const log = await readLog(io.root, id);
      if (log.length === 0)
        throw new Error(`${id}: no events.jsonl (legacy or unknown job)`);
      for (const line of formatShow(project2(log), (io.now ?? (() => new Date))()))
        io.stdout(line);
      return 0;
    }
    case "abandon":
      return abandon2(rest, io);
    case "epic":
      return runEpic(rest, io, config);
    case "archive": {
      const args = parseArchive2(rest);
      if (!archiveEnabled(config))
        throw new Error('archiving is disabled: config.json has no "archive": { "enabled": true }; nothing written');
      return args.all ? archiveAll(io, args.force) : archiveOne(io, args.target, args.force);
    }
    case "prune": {
      if (rest.length > 0)
        throw new Error(USAGE.prune);
      if (!archiveEnabled(config))
        throw new Error('archiving is disabled: config.json has no "archive": { "enabled": true }; nothing removed');
      return pruneAll(io, config.dashboard.settleAfterHours);
    }
    default:
      throw new Error(usage);
  }
}
async function epicTarget(root, repo, epic) {
  if ((await readEpicLog(root, epic)).length === 0)
    throw new Error(`epic ${epic} has not started (no epic.started)`);
  const branch = epicBranch(epic);
  if (!await branchExists(repo, branch))
    throw new Error(`epic ${epic}: no branch refs/heads/${branch}`);
  return branch;
}
function parseAbandon2(rest) {
  const [id, reason, ...flags] = rest;
  if (id === undefined || reason === undefined || reason === "" || flags.length > 2)
    throw new Error(USAGE.abandon);
  const known = ["--force", "--delete-branch"];
  if (flags.some((f) => !known.includes(f)) || new Set(flags).size !== flags.length)
    throw new Error(USAGE.abandon);
  return { id, reason, force: flags.includes("--force"), deleteBranch: flags.includes("--delete-branch") };
}
async function abandon2(rest, io) {
  const args = parseAbandon2(rest);
  const { snap, left } = await abandonJob(io.root, { ...args, usage: usageReader2(io) });
  if (left.length > 0)
    throw new Error(`${args.id} is abandoned, but cleanup left behind: ${left.join("; ")}`);
  io.stdout(snap.stage);
  return 0;
}
function parseArchive2(rest) {
  const force = rest.filter((a) => a === "--force").length;
  const others = rest.filter((a) => a !== "--force");
  const [target] = others;
  if (force > 1 || others.length !== 1 || target === undefined || target === "")
    throw new Error(USAGE.archive);
  if (target.startsWith("-") && target !== "--all")
    throw new Error(USAGE.archive);
  return { all: target === "--all", target, force: force === 1 };
}
async function archiveOne(io, id, force) {
  if (!isJobId(id) && isEpicSlug(id)) {
    const epic = await readLocalEpic(io.root, id);
    const outcome = await archiveEpic(dirname8(resolve7(io.root)), epic, force);
    io.stdout(outcome.kind === "archived" ? `archived epic ${id} ${outcome.commit.slice(0, 7)}` : `epic ${id}: already archived (unchanged)`);
    return 0;
  }
  const job = await readLocalJob(io.root, id);
  const outcome = await archiveJob(dirname8(resolve7(io.root)), job, force);
  io.stdout(outcome.kind === "archived" ? `archived ${id} ${outcome.commit.slice(0, 7)}` : `${id}: already archived (unchanged)`);
  return 0;
}
async function archiveAll(io, force) {
  const repo = dirname8(resolve7(io.root));
  let archived = 0;
  let unchanged = 0;
  let skipped = 0;
  let failed = 0;
  for (const id of await localJobIds(io.root)) {
    try {
      const job = await readLocalJob(io.root, id);
      if (!isTerminal(job)) {
        skipped++;
        continue;
      }
      const outcome = await archiveJob(repo, job, force);
      if (outcome.kind === "unchanged")
        unchanged++;
      else {
        archived++;
        io.stdout(`archived ${id} ${outcome.commit.slice(0, 7)}`);
      }
    } catch (e) {
      failed++;
      io.stderr((e instanceof Error ? e.message : String(e)).split(`
`)[0] ?? "");
    }
  }
  for (const slug of await epicSlugs(io.root)) {
    try {
      const epic = await readLocalEpic(io.root, slug);
      if (!isEpicTerminal(epic)) {
        skipped++;
        continue;
      }
      const outcome = await archiveEpic(repo, epic, force);
      if (outcome.kind === "unchanged")
        unchanged++;
      else {
        archived++;
        io.stdout(`archived epic ${slug} ${outcome.commit.slice(0, 7)}`);
      }
    } catch (e) {
      failed++;
      io.stderr((e instanceof Error ? e.message : String(e)).split(`
`)[0] ?? "");
    }
  }
  io.stdout(`archive --all: archived ${archived}, unchanged ${unchanged}, skipped ${skipped} (not merged or abandoned), failed ${failed}`);
  return failed === 0 ? 0 : 1;
}
async function guarded(io, body) {
  try {
    return await body();
  } catch (e) {
    io.stderr((e instanceof Error ? e.message : String(e)).split(`
`)[0] ?? "");
    return 1;
  }
}
function runCore(argv, io) {
  return guarded(io, () => dispatchCore(argv, io));
}

// packages/cli/src/installed.ts
process.exitCode = await runCore(process.argv.slice(2), {
  root: import.meta.dir,
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line)
});
