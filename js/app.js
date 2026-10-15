import store, { loadError } from "./store/index.js";
import { organiserPin, appName } from "./config.js";
import * as S from "./stats.js";
import * as C from "./charts.js";

const esc = C.esc;
const $app = document.getElementById("app");
const EMOJIS = ["✈️", "🏖️", "🏔️", "🏕️", "🚗", "🎉", "🌍", "🏙️", "🎿", "🚢", "☀️", "🍕"];

// ── Local (this-device) state ────────────────────────────────────────────────
const local = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};
const isOrganiser = () => local.get("ho-organiser", false) === true;
/** Which username this device is using in each group: { [groupId]: memberKey } */
const myKeys = () => local.get("ho-me", {});
function setMyKey(gid, key) {
  const all = myKeys();
  if (key) all[gid] = key; else delete all[gid];
  local.set("ho-me", all);
}
function me(group) {
  const key = myKeys()[group?.id];
  return key && group?.members?.[key] ? { key, name: group.members[key].name } : null;
}
/** "Sam Smith" → "sam-smith". This is the identity — names are case-insensitive. */
const userKey = (name) => name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40);

// ── App state ────────────────────────────────────────────────────────────────
const state = {
  route: { name: "home" },
  groups: null,
  groupData: null, // { group, questions } for the open group
  sub: { key: null, unsub: null },
  drafts: {}, // unsaved answers, keyed by question id
  open: new Set(), // expanded <details> on the results page
  formShownFor: null, // forms render once so live updates don't wipe what you're typing
  error: null,
};

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "new") return { name: "groupForm" };
  if (parts[0] === "g" && parts[1]) {
    const gid = parts[1];
    if (parts[2] === "results") return { name: "group", gid, tab: "results" };
    if (parts[2] === "manage") return { name: "group", gid, tab: "manage" };
    if (parts[2] === "edit") return { name: "groupForm", gid };
    if (parts[2] === "q") return { name: "questionForm", gid, qid: parts[3] === "new" ? null : parts[3] };
    return { name: "group", gid, tab: "answer" };
  }
  return { name: "home" };
}
const go = (hash) => { location.hash = hash; };

function subscribe(key, start) {
  if (state.sub.key === key) return;
  state.sub.unsub?.();
  state.sub = { key, unsub: start() };
}

function onRoute() {
  state.route = parseRoute();
  state.formShownFor = null;
  state.error = null;
  if ($app.contains(document.activeElement)) document.activeElement.blur(); // new page — always redraw
  const { gid, name } = state.route;
  if (name === "home" || (name === "groupForm" && !gid)) {
    subscribe("groups", () => store.subscribeGroups((groups) => { state.groups = groups; render(); }, onStoreError));
  } else {
    if (state.sub.key !== "g:" + gid) state.groupData = null;
    subscribe("g:" + gid, () => store.subscribeGroup(gid, (data) => { state.groupData = data; render(); }, onStoreError));
  }
  render();
  window.scrollTo(0, 0);
}

function onStoreError(e) {
  console.error(e);
  state.error = e.code === "permission-denied"
    ? "The database refused access. Check your Firestore rules (see README)."
    : `Couldn't reach the database: ${e.message}`;
  render();
}

// ── Rendering ────────────────────────────────────────────────────────────────
let pendingRender = false;
function render() {
  // Never rebuild the page while someone is typing — it would close the iPhone keyboard.
  const a = document.activeElement;
  if (a && $app.contains(a) && a.matches("input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea")) {
    pendingRender = true;
    return;
  }
  pendingRender = false;
  const r = state.route;
  let html;
  if (r.name === "home") html = homeView();
  else if (r.name === "groupForm") {
    if (state.formShownFor === location.hash) return;
    html = groupFormView();
  } else if (r.name === "questionForm") {
    if (state.formShownFor === location.hash) return;
    html = questionFormView();
  } else html = groupView();
  $app.innerHTML = html;
}
$app.addEventListener("focusout", () => setTimeout(() => {
  if (pendingRender && !$app.contains(document.activeElement)) render();
}, 0));

const loading = () => `<div class="center muted"><div class="spinner"></div></div>`;
const errorBox = () => (state.error ? `<div class="banner error">${esc(state.error)}</div>` : "");

function header({ title, back, actions = "" }) {
  return `<header class="topbar">
    ${back ? `<a class="icon-btn" href="${back}" aria-label="Back">‹</a>` : `<span class="icon-btn spacer"></span>`}
    <h1>${esc(title)}</h1>
    <div class="topbar-actions">${actions}</div>
  </header>`;
}

const settingsBtn = `<button class="icon-btn" data-action="settings" aria-label="Settings">⚙︎</button>`;

// ── Home: all groups ─────────────────────────────────────────────────────────
function homeView() {
  const org = isOrganiser();
  const groups = state.groups;
  const demo = store.mode === "local"
    ? `<div class="banner">${loadError ? "Couldn't connect to Firebase, so this is" : "This is"} <b>demo mode</b> — groups are only saved on this phone. Add your Firebase details in <code>js/config.js</code> to share with friends.</div>`
    : "";
  let list;
  if (!groups) list = loading();
  else if (!groups.length)
    list = `<div class="empty"><div class="empty-emoji">🧳</div><p>No groups yet.</p>
      ${org ? `<a class="btn primary" href="#/new">Create the first group</a>` : `<p class="muted">The organiser hasn't made any groups yet — check back soon.</p>`}</div>`;
  else
    list = `<ul class="group-list">${groups
      .map((g) => {
        const n = Object.keys(g.members || {}).length;
        const mine = me(g);
        return `<li><a class="group-card" href="#/g/${g.id}">
          <span class="group-emoji">${esc(g.emoji || "✈️")}</span>
          <span class="group-text"><b>${esc(g.name)}</b>
            <small>${n} ${n === 1 ? "person" : "people"}${g.description ? " · " + esc(g.description) : ""}</small></span>
          ${mine ? `<span class="pill ok">You're in</span>` : `<span class="pill">Join</span>`}
        </a></li>`;
      })
      .join("")}</ul>`;
  return `${header({ title: appName, actions: settingsBtn })}
    <main class="page">
      ${errorBox()}${demo}
      <div class="section-head"><h2>Groups</h2>${org && groups?.length ? `<a class="btn small primary" href="#/new">＋ New group</a>` : ""}</div>
      ${list}
    </main>`;
}

// ── Group page ───────────────────────────────────────────────────────────────
function groupView() {
  const r = state.route;
  const data = state.groupData;
  if (!data) return `${header({ title: "", back: "#/" })}<main class="page">${errorBox()}${loading()}</main>`;
  const { group, questions } = data;
  if (!group)
    return `${header({ title: "Not found", back: "#/" })}<main class="page"><div class="empty"><div class="empty-emoji">🤷</div>
      <p>This group doesn't exist any more.</p><a class="btn" href="#/">Back to groups</a></div></main>`;

  const org = isOrganiser();
  const mine = me(group);
  const members = S.memberList(group);
  const canSeeResults = org || group.resultsVisible;
  let tab = r.tab;
  if ((tab === "results" && !canSeeResults) || (tab === "manage" && !org)) tab = "answer";

  const tabs = [
    ["answer", "Questions", `#/g/${group.id}`],
    canSeeResults && ["results", "Results", `#/g/${group.id}/results`],
    org && ["manage", "Manage", `#/g/${group.id}/manage`],
  ].filter(Boolean);

  let body;
  if (tab === "results") body = resultsTab(group, questions, members);
  else if (tab === "manage") body = manageTab(group, questions, members);
  else body = mine ? answerTab(group, questions, mine) : joinCard(group, members);

  return `${header({ title: group.name, back: "#/", actions: `<button class="icon-btn" data-action="share" aria-label="Share link">⤴︎</button>` })}
    <main class="page">
      ${errorBox()}
      <section class="hero">
        <div class="hero-emoji">${esc(group.emoji || "✈️")}</div>
        <div>
          <h2>${esc(group.name)}</h2>
          ${group.description ? `<p class="muted">${esc(group.description)}</p>` : ""}
          <p class="muted small">${members.length} ${members.length === 1 ? "person" : "people"} · ${questions.length} ${questions.length === 1 ? "question" : "questions"}
          ${mine ? ` · you're <b>${esc(mine.name)}</b> <button class="link" data-action="leave">switch</button>` : ""}</p>
        </div>
      </section>
      ${tabs.length > 1 ? `<nav class="tabs">${tabs.map(([k, label, href]) => `<a href="${href}" class="${k === tab ? "active" : ""}">${label}</a>`).join("")}</nav>` : ""}
      ${body}
    </main>`;
}

function joinCard(group, members) {
  return `<section class="card">
      <h3>Join this group</h3>
      <p class="muted">Pick a username so everyone knows who answered what. No password needed.</p>
      <form novalidate data-form="join" class="row-form">
        <input name="name" placeholder="Your name" maxlength="24" autocomplete="nickname" autocapitalize="words" required>
        <button class="btn primary">Join</button>
      </form>
    </section>
    ${members.length ? `<section class="card">
      <h3>Already joined?</h3>
      <p class="muted">Tap your name to carry on where you left off.</p>
      <div class="chips">${members.map((m) => `<button class="chip" data-action="pick-me" data-key="${esc(m.key)}">${esc(m.name)}</button>`).join("")}</div>
    </section>` : ""}`;
}

// ── Answering ────────────────────────────────────────────────────────────────
function answerTab(group, questions, mine) {
  if (!questions.length)
    return `<div class="empty"><div class="empty-emoji">📝</div><p>No questions yet.</p>
      <p class="muted">${isOrganiser() ? `Add some from the <a href="#/g/${group.id}/manage">Manage</a> tab.` : "The organiser will post some soon."}</p></div>`;
  const todo = questions.filter((q) => !q.responses?.[mine.key] && !q.closed).length;
  return `<p class="status-line">${todo ? `<b>${todo}</b> ${todo === 1 ? "question" : "questions"} left to answer` : "✓ You're all caught up — you can still change your answers."}</p>
    ${questions.map((q, i) => questionCard(q, i, mine)).join("")}`;
}

function toRaw(q, value) {
  if (value === undefined || value === null) return null;
  if (q.type === "number") return String(value);
  if (q.type === "range") return { low: String(value.low), high: String(value.high) };
  if (q.type === "choice") {
    const opts = new Set(q.options || []);
    const other = value.find((v) => !opts.has(v));
    return { selected: value.filter((v) => opts.has(v)).concat(other !== undefined ? ["__other"] : []), other: other ?? "" };
  }
  return value;
}

function questionCard(q, i, mine) {
  const saved = q.responses?.[mine.key];
  const raw = state.drafts[q.id] ?? toRaw(q, saved?.value);
  const dis = q.closed ? "disabled" : "";
  return `<form novalidate class="card question" data-form="answer" data-qid="${q.id}">
    <div class="q-top"><span class="q-num">${i + 1}</span>
      <span class="pill type">${S.TYPES[q.type]?.label || q.type}</span>
      ${q.closed ? `<span class="pill">Closed</span>` : saved ? `<span class="pill ok">✓ Answered</span>` : ""}</div>
    <h3>${esc(q.title)}</h3>
    ${q.help ? `<p class="muted">${esc(q.help)}</p>` : ""}
    <fieldset ${dis}>${answerInput(q, raw)}</fieldset>
    <p class="form-error" hidden></p>
    ${q.closed ? (saved ? `<p class="muted small">Your answer: ${esc(S.describe(q, saved.value))}</p>` : "")
      : `<div class="q-actions">
        ${saved ? `<button type="button" class="btn ghost small" data-action="clear-answer" data-qid="${q.id}">Clear</button>` : ""}
        <button class="btn primary">${saved ? "Update answer" : "Submit"}</button></div>`}
  </form>`;
}

function affix(q, input) {
  return `<div class="affix">${q.prefix ? `<span>${esc(q.prefix)}</span>` : ""}${input}${q.suffix ? `<span>${esc(q.suffix)}</span>` : ""}</div>`;
}

function answerInput(q, raw) {
  switch (q.type) {
    case "number": {
      const attrs = `${Number.isFinite(q.min) ? `min="${q.min}"` : ""} ${Number.isFinite(q.max) ? `max="${q.max}"` : ""}`;
      return affix(q, `<input name="n" type="number" inputmode="decimal" step="any" ${attrs} value="${esc(raw ?? "")}" placeholder="Enter a number">`);
    }
    case "range": {
      const min = q.min ?? 0, max = q.max ?? 100, step = q.step || 1;
      const low = raw?.low ?? "", high = raw?.high ?? "";
      const slider = (name, v, fallback) =>
        `<input type="range" data-sync="${name}" min="${min}" max="${max}" step="${step}" value="${esc(v === "" ? fallback : v)}" aria-label="${name === "low" ? "From" : "To"}">`;
      return `<div class="range-input">
        <label><span>From</span>${affix(q, `<input name="low" type="number" inputmode="decimal" step="any" min="${min}" max="${max}" value="${esc(low)}" placeholder="${S.fmt({}, min)}">`)}</label>
        ${slider("low", low, min)}
        <label><span>To</span>${affix(q, `<input name="high" type="number" inputmode="decimal" step="any" min="${min}" max="${max}" value="${esc(high)}" placeholder="${S.fmt({}, max)}">`)}</label>
        ${slider("high", high, max)}
        <p class="muted small">Between ${esc(S.fmt(q, min))} and ${esc(S.fmt(q, max))}</p>
      </div>`;
    }
    case "choice": {
      const sel = new Set(raw?.selected || []);
      const kind = q.multiple ? "checkbox" : "radio";
      const opts = (q.options || []).map((o) =>
        `<label class="option"><input type="${kind}" name="pick" value="${esc(o)}" ${sel.has(o) ? "checked" : ""}><span>${esc(o)}</span></label>`);
      if (q.allowOther)
        opts.push(`<label class="option other"><input type="${kind}" name="pick" value="__other" ${sel.has("__other") ? "checked" : ""}>
          <input name="other" placeholder="Something else…" maxlength="60" value="${esc(raw?.other ?? "")}"></label>`);
      return `${q.multiple ? `<p class="muted small">Pick as many as you like</p>` : ""}<div class="options">${opts.join("")}</div>`;
    }
    default:
      return `<textarea name="t" rows="3" maxlength="500" placeholder="Your answer">${esc(raw ?? "")}</textarea>`;
  }
}

/** Read an answer form → { raw, value } or { raw, error }. */
function readAnswer(form, q) {
  const f = new FormData(form);
  const num = (s) => (s === "" || s === null ? NaN : Number(s));
  switch (q.type) {
    case "number": {
      const raw = String(f.get("n") ?? "");
      const v = num(raw);
      if (!Number.isFinite(v)) return { raw, error: "Enter a number." };
      if (Number.isFinite(q.min) && v < q.min) return { raw, error: `Must be at least ${S.fmt(q, q.min)}.` };
      if (Number.isFinite(q.max) && v > q.max) return { raw, error: `Must be at most ${S.fmt(q, q.max)}.` };
      return { raw, value: v };
    }
    case "range": {
      const raw = { low: String(f.get("low") ?? ""), high: String(f.get("high") ?? "") };
      let low = num(raw.low), high = num(raw.high);
      if (!Number.isFinite(low) || !Number.isFinite(high)) return { raw, error: "Fill in both ends of your range." };
      if (low > high) [low, high] = [high, low];
      if ((Number.isFinite(q.min) && low < q.min) || (Number.isFinite(q.max) && high > q.max))
        return { raw, error: `Keep it between ${S.fmt(q, q.min)} and ${S.fmt(q, q.max)}.` };
      return { raw, value: { low, high } };
    }
    case "choice": {
      const selected = f.getAll("pick").map(String);
      const other = String(f.get("other") ?? "").trim();
      const raw = { selected, other: String(f.get("other") ?? "") };
      const value = selected.filter((s) => s !== "__other");
      if (selected.includes("__other")) {
        if (!other) return { raw, error: "Type your other answer." };
        value.push(other);
      }
      if (!value.length) return { raw, error: "Pick an option." };
      return { raw, value };
    }
    default: {
      const raw = String(f.get("t") ?? "");
      if (!raw.trim()) return { raw, error: "Write an answer first." };
      return { raw, value: raw.trim() };
    }
  }
}

// ── Results roundup ──────────────────────────────────────────────────────────
function resultsTab(group, questions, members) {
  if (!members.length || !questions.length)
    return `<div class="empty"><div class="empty-emoji">📊</div><p>Nothing to show yet.</p>
      <p class="muted">${!questions.length ? "Add some questions first." : "Once people join and answer, the results appear here live."}</p></div>`;
  const answers = questions.reduce((n, q) => n + S.answeredSplit(q, members).done.length, 0);
  const possible = members.length * questions.length;
  const finished = members.filter((m) => questions.every((q) => q.responses?.[m.key])).length;
  const isOpen = (id) => (state.open.has(id) ? "open" : "");

  const people = members
    .map((m) => {
      const done = questions.filter((q) => q.responses?.[m.key]);
      return `<details class="person" data-id="p:${esc(m.key)}" ${isOpen("p:" + m.key)}>
        <summary><span class="person-name">${esc(m.name)}</span>
          <span class="person-bar">${C.progress(done.length, questions.length, `${m.name} answered ${done.length} of ${questions.length}`)}</span>
          <span class="person-count">${done.length}/${questions.length}</span></summary>
        <dl>${questions.map((q) => `<dt>${esc(q.title)}</dt><dd>${q.responses?.[m.key] ? esc(S.describe(q, q.responses[m.key].value)) : `<span class="muted">Not answered</span>`}</dd>`).join("")}</dl>
      </details>`;
    })
    .join("");

  return `${C.tiles([
      { label: "People", value: members.length },
      { label: "All done", value: `${finished}/${members.length}`, sub: "answered everything" },
      { label: "Complete", value: `${Math.round((answers / possible) * 100)}%`, sub: `${answers} of ${possible} answers` },
    ])}
    <section class="card">
      <h3>Who's answered</h3>
      <p class="muted small">Tap someone to see all their answers.</p>
      <div class="people">${people}</div>
    </section>
    ${questions.map((q, i) => questionResults(q, i, members)).join("")}`;
}

/** Round an average to something sensible: whole numbers unless the slider step is finer. */
const roundTo = (v, step) => (step && step < 1 ? Math.round(v * 100) / 100 : Math.round(v));

function questionResults(q, i, members) {
  const { done, waiting } = S.answeredSplit(q, members);
  const entries = done.map((m) => ({ name: m.name, value: q.responses[m.key].value }));
  let viz = "";
  if (!entries.length) viz = `<p class="muted">No answers yet.</p>`;
  else if (q.type === "number") {
    const st = S.numberStats(entries.map((e) => e.value));
    const rows = entries.map((e) => ({ name: e.name, value: e.value })).sort((a, b) => b.value - a.value);
    viz = C.tiles([
      { label: "Average", value: S.fmt(q, st.mean) },
      { label: "Median", value: S.fmt(q, st.median) },
      { label: "Lowest", value: S.fmt(q, st.min) },
      { label: "Highest", value: S.fmt(q, st.max) },
    ]) + C.numberBars(q, rows, rows.length > 1 ? st.mean : undefined);
  } else if (q.type === "range") {
    const rows = entries.map((e) => ({ name: e.name, low: e.value.low, high: e.value.high })).sort((a, b) => a.low - b.low || a.high - b.high);
    const st = S.rangeStats(rows);
    const agree = st.count > 1
      ? st.everyone
        ? { label: "Works for everyone", value: S.fmtRange(q, st.sweet.low, st.sweet.high) }
        : { label: `Best overlap (${st.sweet.count} of ${st.count})`, value: st.sweet.count > 1 ? S.fmtRange(q, st.sweet.low, st.sweet.high) : "No overlap" }
      : null;
    viz = C.tiles([
      agree,
      { label: "Average range", value: S.fmtRange(q, roundTo(st.avgLow, q.step), roundTo(st.avgHigh, q.step)) },
    ].filter(Boolean)) + C.rangeBars(q, rows, st);
  } else if (q.type === "choice") {
    const rows = S.choiceStats(q, entries);
    const top = rows[0];
    const tied = rows.filter((r) => r.names.length === top.names.length);
    viz = C.tiles([{
      label: tied.length > 1 ? "Tied favourites" : "Most popular",
      value: tied.map((r) => r.label).join(" / "),
      sub: `${top.names.length} of ${entries.length} ${entries.length === 1 ? "person" : "people"}`,
    }]) + C.choiceBars(rows, entries.length);
  } else {
    viz = `<ul class="quotes">${entries.map((e) => `<li><b>${esc(e.name)}</b><p>${esc(e.value)}</p></li>`).join("")}</ul>`;
  }
  return `<section class="card result">
    <div class="q-top"><span class="q-num">${i + 1}</span><span class="pill type">${S.TYPES[q.type]?.label}</span>${q.closed ? `<span class="pill">Closed</span>` : ""}</div>
    <h3>${esc(q.title)}</h3>
    <div class="answered"><span><b>${done.length}</b> of ${members.length} answered</span>${C.progress(done.length, members.length, "Answered")}</div>
    ${waiting.length ? `<p class="muted small">Waiting on: ${waiting.map((m) => esc(m.name)).join(", ")}</p>` : ""}
    ${viz}
  </section>`;
}

// ── Organiser: manage group ──────────────────────────────────────────────────
function manageTab(group, questions, members) {
  const qs = questions
    .map((q, i) => {
      const n = S.answeredSplit(q, members).done.length;
      return `<li class="manage-q">
        <div><b>${esc(q.title)}</b><small>${S.TYPES[q.type]?.label} · ${n}/${members.length} answered${q.closed ? " · closed" : ""}</small></div>
        <div class="manage-btns">
          <button class="icon-btn small" data-action="move" data-qid="${q.id}" data-dir="-1" ${i === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
          <button class="icon-btn small" data-action="move" data-qid="${q.id}" data-dir="1" ${i === questions.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
          <details class="menu"><summary class="icon-btn small" aria-label="More">⋯</summary><div class="menu-pop">
            <a href="#/g/${group.id}/q/${q.id}">Edit</a>
            <button data-action="toggle-closed" data-qid="${q.id}">${q.closed ? "Reopen answers" : "Close answers"}</button>
            <button class="danger" data-action="delete-q" data-qid="${q.id}">Delete</button>
          </div></details>
        </div></li>`;
    })
    .join("");
  return `<section class="card">
      <div class="section-head"><h3>Questions</h3><a class="btn small primary" href="#/g/${group.id}/q/new">＋ Add</a></div>
      ${questions.length ? `<ul class="manage-list">${qs}</ul>` : `<p class="muted">No questions yet. Add a word, number, range or multiple-choice question.</p>`}
    </section>
    <section class="card">
      <h3>People (${members.length})</h3>
      ${members.length ? `<ul class="manage-list">${members.map((m) => `<li class="manage-q"><div><b>${esc(m.name)}</b>
        <small>Joined ${new Date(m.joinedAt).toLocaleDateString()}</small></div>
        <button class="btn ghost small danger" data-action="remove-member" data-key="${esc(m.key)}">Remove</button></li>`).join("")}</ul>`
        : `<p class="muted">Nobody yet. Share the link with ⤴︎ at the top.</p>`}
    </section>
    <section class="card">
      <h3>Settings</h3>
      <label class="switch-row"><span>Let everyone see the results<small>Otherwise only you (the organiser) can</small></span>
        <input type="checkbox" class="switch" data-action="results-visible" ${group.resultsVisible ? "checked" : ""}></label>
      <div class="btn-row">
        <a class="btn" href="#/g/${group.id}/edit">Edit group</a>
        <button class="btn danger" data-action="delete-group">Delete group</button>
      </div>
    </section>`;
}

// ── Forms: group & question editors ──────────────────────────────────────────
function requireOrganiser(back) {
  return `${header({ title: "Organiser only", back })}<main class="page"><div class="empty"><div class="empty-emoji">🔒</div>
    <p>Only the organiser can do this.</p><button class="btn" data-action="settings">Unlock organiser mode</button></div></main>`;
}

function groupFormView() {
  const { gid } = state.route;
  const back = gid ? `#/g/${gid}/manage` : "#/";
  if (!isOrganiser()) return requireOrganiser(back);
  if (gid && !state.groupData) return `${header({ title: "", back })}<main class="page">${loading()}</main>`;
  const g = gid ? state.groupData.group : {};
  if (gid && !g) return `${header({ title: "Not found", back: "#/" })}<main class="page"><p class="muted">This group was deleted.</p></main>`;
  state.formShownFor = location.hash;
  const emoji = g.emoji || EMOJIS[0];
  return `${header({ title: gid ? "Edit group" : "New group", back })}
    <main class="page"><form novalidate class="card form" data-form="group">
      <label>Name<input name="name" required maxlength="40" value="${esc(g.name || "")}" placeholder="e.g. Summer 2027 trip"></label>
      <label>Description <span class="muted">(optional)</span><input name="description" maxlength="80" value="${esc(g.description || "")}" placeholder="e.g. Planning our post-exams holiday"></label>
      <fieldset><legend>Icon</legend><div class="emoji-pick">
        ${EMOJIS.map((e) => `<label><input type="radio" name="emoji" value="${e}" ${e === emoji ? "checked" : ""}><span>${e}</span></label>`).join("")}
      </div></fieldset>
      <label class="switch-row"><span>Let everyone see the results<small>You can change this later</small></span>
        <input type="checkbox" class="switch" name="resultsVisible" ${g.resultsVisible ? "checked" : ""}></label>
      <p class="form-error" hidden></p>
      <button class="btn primary block">${gid ? "Save changes" : "Create group"}</button>
    </form></main>`;
}

function questionFormView() {
  const { gid, qid } = state.route;
  const back = `#/g/${gid}/manage`;
  if (!isOrganiser()) return requireOrganiser(back);
  if (!state.groupData) return `${header({ title: "", back })}<main class="page">${loading()}</main>`;
  const q = qid ? state.groupData.questions.find((x) => x.id === qid) : { type: "text" };
  if (!q) return `${header({ title: "Not found", back })}<main class="page"><p class="muted">This question was deleted.</p></main>`;
  state.formShownFor = location.hash;
  const locked = qid && Object.keys(q.responses || {}).length > 0; // can't change type once answered
  const v = (x) => (x === undefined || x === null ? "" : esc(x));
  const options = q.options?.length ? q.options : ["", ""];
  return `${header({ title: qid ? "Edit question" : "New question", back })}
    <main class="page"><form novalidate class="card form" data-form="question" data-type="${q.type}">
      <fieldset><legend>Type of answer</legend>
        <div class="segmented">${Object.entries(S.TYPES).map(([k, t]) =>
          `<label><input type="radio" name="type" value="${k}" ${q.type === k ? "checked" : ""} ${locked && q.type !== k ? "disabled" : ""}>
            <span><i>${t.icon}</i>${t.label}</span></label>`).join("")}</div>
        <p class="muted small type-blurb">${locked ? "The type can't be changed once people have answered." : ""}</p>
      </fieldset>
      <label>Question<input name="title" required maxlength="120" value="${v(q.title)}" placeholder="e.g. What's your budget?"></label>
      <label>Extra details <span class="muted">(optional)</span><input name="help" maxlength="200" value="${v(q.help)}" placeholder="e.g. Including flights"></label>

      <div class="only" data-for="number range">
        <div class="grid2">
          <label>Before number <span class="muted">(e.g. £)</span><input name="prefix" maxlength="4" value="${v(q.prefix)}"></label>
          <label>After number <span class="muted">(e.g. nights)</span><input name="suffix" maxlength="12" value="${v(q.suffix)}"></label>
        </div>
      </div>
      <div class="only" data-for="number">
        <div class="grid2">
          <label>Minimum <span class="muted">(optional)</span><input name="nmin" type="number" inputmode="decimal" step="any" value="${q.type === "number" ? v(q.min) : ""}"></label>
          <label>Maximum <span class="muted">(optional)</span><input name="nmax" type="number" inputmode="decimal" step="any" value="${q.type === "number" ? v(q.max) : ""}"></label>
        </div>
      </div>
      <div class="only" data-for="range">
        <div class="grid3">
          <label>Lowest<input name="rmin" type="number" inputmode="decimal" step="any" value="${q.type === "range" ? v(q.min) : "0"}"></label>
          <label>Highest<input name="rmax" type="number" inputmode="decimal" step="any" value="${q.type === "range" ? v(q.max) : "1000"}"></label>
          <label>Slider step<input name="rstep" type="number" inputmode="decimal" step="any" min="0" value="${q.type === "range" ? v(q.step || 1) : "10"}"></label>
        </div>
      </div>
      <div class="only" data-for="choice">
        <fieldset><legend>Options</legend>
          <div class="option-edit">${options.map((o) => optionRow(o)).join("")}</div>
          <button type="button" class="btn ghost small" data-action="add-option">＋ Add option</button>
        </fieldset>
        <label class="switch-row"><span>Allow picking more than one</span><input type="checkbox" class="switch" name="multiple" ${q.multiple ? "checked" : ""}></label>
        <label class="switch-row"><span>Allow "something else" answers</span><input type="checkbox" class="switch" name="allowOther" ${q.allowOther ? "checked" : ""}></label>
      </div>
      <p class="form-error" hidden></p>
      <button class="btn primary block">${qid ? "Save question" : "Post question"}</button>
    </form></main>`;
}

const optionRow = (value = "") =>
  `<div class="option-row"><input name="option" maxlength="60" value="${esc(value)}" placeholder="Option">
    <button type="button" class="icon-btn small" data-action="remove-option" aria-label="Remove option">✕</button></div>`;

function readQuestionForm(form) {
  const f = new FormData(form);
  const type = f.get("type");
  const str = (k) => String(f.get(k) ?? "").trim();
  const num = (k) => (str(k) === "" ? null : Number(str(k)));
  const q = { type, title: str("title"), help: str("help") };
  if (!q.title) return { error: "Write the question." };
  if (type === "number" || type === "range") Object.assign(q, { prefix: str("prefix"), suffix: str("suffix") });
  if (type === "number") {
    Object.assign(q, { min: num("nmin"), max: num("nmax") });
    if (q.min !== null && q.max !== null && q.min >= q.max) return { error: "Minimum must be less than maximum." };
  }
  if (type === "range") {
    Object.assign(q, { min: num("rmin"), max: num("rmax"), step: num("rstep") || 1 });
    if (q.min === null || q.max === null) return { error: "Set the lowest and highest values for the range." };
    if (q.min >= q.max) return { error: "Lowest must be less than highest." };
    if (q.step <= 0) return { error: "Slider step must be more than 0." };
  }
  if (type === "choice") {
    const opts = [...new Set(f.getAll("option").map((o) => String(o).trim()).filter(Boolean))];
    if (opts.length < 2) return { error: "Add at least two options." };
    Object.assign(q, { options: opts, multiple: f.has("multiple"), allowOther: f.has("allowOther") });
  }
  return { q };
}

// ── Modal & toast ────────────────────────────────────────────────────────────
function modal(html) {
  closeModal();
  const el = document.createElement("div");
  el.className = "modal-back";
  el.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-close]")) closeModal(); });
  document.body.appendChild(el);
  el.querySelector("input")?.focus();
  return el;
}
function closeModal() { document.querySelector(".modal-back")?.remove(); }

let toastTimer;
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

function showSettings() {
  const org = isOrganiser();
  const el = modal(`<h3>Settings</h3>
    <p class="muted small">${store.mode === "firebase" ? "✓ Connected to the shared database." : "Demo mode — data is only saved on this device."}</p>
    ${org
      ? `<p>🔓 Organiser mode is <b>on</b> on this device.</p>
         <div class="btn-row"><button class="btn" data-action="lock">Turn off</button><button class="btn primary" data-close>Done</button></div>`
      : `<form novalidate data-modal-form="pin"><label>I'm the organiser<input name="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="Organiser PIN"></label>
         <p class="form-error" hidden></p>
         <div class="btn-row"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Unlock</button></div></form>`}`);
  el.querySelector('[data-action="lock"]')?.addEventListener("click", () => {
    local.set("ho-organiser", false);
    closeModal(); state.formShownFor = null; render(); toast("Organiser mode off");
  });
  el.querySelector('[data-modal-form="pin"]')?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (String(new FormData(e.target).get("pin")) === String(organiserPin)) {
      local.set("ho-organiser", true);
      closeModal(); state.formShownFor = null; render(); toast("Organiser mode on");
    } else showError(e.target, "That PIN isn't right.");
  });
}

function showError(form, msg) {
  const p = form.querySelector(".form-error");
  if (!p) return toast(msg);
  p.textContent = msg;
  p.hidden = !msg;
}

async function busy(form, fn) {
  const btns = form ? form.querySelectorAll("button") : [];
  btns.forEach((b) => (b.disabled = true));
  try { return await fn(); }
  catch (e) { console.error(e); form ? showError(form, e.message || "Something went wrong.") : toast(e.message || "Something went wrong."); }
  finally { btns.forEach((b) => (b.disabled = false)); }
}

// ── Events ───────────────────────────────────────────────────────────────────
$app.addEventListener("submit", async (e) => {
  const form = e.target;
  const kind = form.dataset.form;
  if (!kind) return;
  e.preventDefault();
  showError(form, "");
  const gid = state.route.gid;
  const group = state.groupData?.group;

  if (kind === "join") {
    const name = String(new FormData(form).get("name") || "").trim().replace(/\s+/g, " ");
    const key = userKey(name);
    if (!key) return showError(form, "Use at least one letter or number.");
    const existing = group.members?.[key];
    if (existing && !confirm(`"${existing.name}" is already in this group. Is that you?`)) return;
    await busy(form, async () => {
      await store.joinGroup(gid, key, existing?.name || name);
      setMyKey(gid, key);
      document.activeElement?.blur();
      render();
      toast(`Welcome, ${existing?.name || name}!`);
    });
  }

  if (kind === "answer") {
    const q = state.groupData.questions.find((x) => x.id === form.dataset.qid);
    const mine = me(group);
    if (!q || !mine) return;
    const { raw, value, error } = readAnswer(form, q);
    state.drafts[q.id] = raw;
    if (error) return showError(form, error);
    await busy(form, async () => {
      await store.setResponse(gid, q.id, mine.key, value);
      delete state.drafts[q.id];
      document.activeElement?.blur();
      toast("Answer saved ✓");
    });
  }

  if (kind === "group") {
    const f = new FormData(form);
    const data = {
      name: String(f.get("name")).trim(),
      description: String(f.get("description")).trim(),
      emoji: String(f.get("emoji") || EMOJIS[0]),
      resultsVisible: f.has("resultsVisible"),
    };
    if (!data.name) return showError(form, "Give the group a name.");
    await busy(form, async () => {
      if (gid) { await store.updateGroup(gid, data); go(`#/g/${gid}/manage`); toast("Saved"); }
      else { const id = await store.createGroup(data); go(`#/g/${id}/manage`); toast("Group created"); }
    });
  }

  if (kind === "question") {
    const { q, error } = readQuestionForm(form);
    if (error) return showError(form, error);
    const qid = state.route.qid;
    await busy(form, async () => {
      if (qid) await store.updateQuestion(gid, qid, q);
      else await store.addQuestion(gid, q);
      go(`#/g/${gid}/manage`);
      toast(qid ? "Question saved" : "Question posted");
    });
  }
});

$app.addEventListener("input", (e) => {
  const form = e.target.closest("form");
  // Keep sliders and number boxes for a range answer in sync.
  if (e.target.dataset.sync) form.elements[e.target.dataset.sync].value = e.target.value;
  if (form?.dataset.form === "answer" && e.target.name in { low: 1, high: 1 }) {
    const s = form.querySelector(`[data-sync="${e.target.name}"]`);
    if (s && e.target.value !== "") s.value = e.target.value;
  }
  if (form?.dataset.form === "answer") {
    // Typing in "something else" ticks it for you.
    if (e.target.name === "other" && e.target.value) {
      const box = form.querySelector('input[name="pick"][value="__other"]');
      if (box) box.checked = true;
    }
    const q = state.groupData?.questions.find((x) => x.id === form.dataset.qid);
    if (q) state.drafts[q.id] = readAnswer(form, q).raw;
  }
});

$app.addEventListener("change", async (e) => {
  const t = e.target;
  const form = t.closest("form");
  if (form?.dataset.form === "answer") {
    const q = state.groupData?.questions.find((x) => x.id === form.dataset.qid);
    if (q) state.drafts[q.id] = readAnswer(form, q).raw;
  }
  if (form?.dataset.form === "question" && t.name === "type") {
    form.dataset.type = t.value;
    form.querySelector(".type-blurb").textContent = S.TYPES[t.value].blurb;
  }
  if (t.dataset.action === "results-visible") {
    await busy(null, () => store.updateGroup(state.route.gid, { resultsVisible: t.checked }));
    toast(t.checked ? "Everyone can see results" : "Results are organiser-only");
  }
});

$app.addEventListener("toggle", (e) => {
  const id = e.target.dataset?.id;
  if (id) e.target.open ? state.open.add(id) : state.open.delete(id);
}, true);

document.addEventListener("click", async (e) => {
  // Close any open ⋯ menu when tapping elsewhere.
  document.querySelectorAll("details.menu[open]").forEach((d) => { if (!d.contains(e.target)) d.open = false; });

  const btn = e.target.closest("[data-action]");
  if (!btn || btn.closest(".modal")) return;
  const { action, qid, key } = btn.dataset;
  const gid = state.route.gid;
  const data = state.groupData;

  switch (action) {
    case "settings": return showSettings();
    case "share": {
      const url = location.href.split("#")[0] + `#/g/${gid}`;
      const title = data?.group?.name || appName;
      if (navigator.share) return navigator.share({ title, text: `Join "${title}" and answer a few questions:`, url }).catch(() => {});
      await navigator.clipboard?.writeText(url).then(() => toast("Link copied"), () => prompt("Copy this link:", url));
      return;
    }
    case "pick-me": {
      const name = data.group.members[key]?.name;
      if (!name || !confirm(`Continue as ${name}?`)) return;
      setMyKey(gid, key);
      render();
      return toast(`Welcome back, ${name}!`);
    }
    case "leave":
      if (!confirm("Switch to a different username on this phone? Your answers stay saved.")) return;
      setMyKey(gid, null);
      return render();
    case "clear-answer": {
      const mine = me(data.group);
      if (!mine || !confirm("Clear your answer to this question?")) return;
      delete state.drafts[qid];
      await busy(btn.closest("form"), () => store.setResponse(gid, qid, mine.key, null));
      return toast("Answer cleared");
    }
    case "add-option": {
      const list = btn.closest("form").querySelector(".option-edit");
      list.insertAdjacentHTML("beforeend", optionRow());
      return list.lastElementChild.querySelector("input").focus();
    }
    case "remove-option": {
      const list = btn.closest(".option-edit");
      if (list.children.length > 1) btn.closest(".option-row").remove();
      else list.querySelector("input").value = "";
      return;
    }
    case "move": {
      const qs = data.questions;
      const i = qs.findIndex((q) => q.id === qid);
      const j = i + Number(btn.dataset.dir);
      if (j < 0 || j >= qs.length) return;
      // Swap order values (fall back to positions if two share one).
      const a = qs[i].order === qs[j].order ? j : qs[j].order;
      const b = qs[i].order === qs[j].order ? i : qs[i].order;
      return busy(null, () => Promise.all([store.updateQuestion(gid, qs[i].id, { order: a }), store.updateQuestion(gid, qs[j].id, { order: b })]));
    }
    case "toggle-closed": {
      const q = data.questions.find((x) => x.id === qid);
      await busy(null, () => store.updateQuestion(gid, qid, { closed: !q.closed }));
      return toast(q.closed ? "Answers reopened" : "Answers closed");
    }
    case "delete-q": {
      const q = data.questions.find((x) => x.id === qid);
      if (!confirm(`Delete "${q.title}" and all its answers?`)) return;
      await busy(null, () => store.deleteQuestion(gid, qid));
      return toast("Question deleted");
    }
    case "remove-member": {
      const m = data.group.members[key];
      if (!confirm(`Remove ${m.name} and all of their answers?`)) return;
      await busy(null, () => store.removeMember(gid, key));
      return toast(`${m.name} removed`);
    }
    case "delete-group": {
      if (!confirm(`Delete "${data.group.name}" and everything in it? This can't be undone.`)) return;
      await busy(null, async () => { await store.deleteGroup(gid); go("#/"); toast("Group deleted"); });
      return;
    }
  }
});

window.addEventListener("hashchange", onRoute);
onRoute();

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
