// Demo-mode store: everything lives in this browser's localStorage.
// Same API as the Firebase store so the app doesn't care which one it's using.

const KEY = "holiday-organiser-db";
const listeners = new Set();

function load() {
  try {
    const db = JSON.parse(localStorage.getItem(KEY));
    if (db && db.groups && db.questions) return db;
  } catch {}
  return { groups: {}, questions: {} };
}

function save(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
  emit();
}

function emit() {
  // Defer so callers never get re-entrant callbacks mid-update.
  queueMicrotask(() => listeners.forEach((fn) => fn()));
}

// Other tabs on the same device.
window.addEventListener("storage", (e) => {
  if (e.key === KEY) emit();
});

function watch(fn) {
  listeners.add(fn);
  fn();
  return () => listeners.delete(fn);
}

const id = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clone = (v) => JSON.parse(JSON.stringify(v));

export const mode = "local";

export function subscribeGroups(cb) {
  return watch(() => {
    const groups = Object.values(load().groups).map(clone);
    groups.sort((a, b) => b.createdAt - a.createdAt);
    cb(groups);
  });
}

export function subscribeGroup(gid, cb) {
  return watch(() => {
    const db = load();
    const group = db.groups[gid] ? clone(db.groups[gid]) : null;
    const questions = Object.values(db.questions[gid] || {}).map(clone);
    questions.sort((a, b) => a.order - b.order);
    cb({ group, questions });
  });
}

export async function createGroup(data) {
  const db = load();
  const gid = id();
  db.groups[gid] = { id: gid, members: {}, resultsVisible: false, createdAt: Date.now(), ...data };
  db.questions[gid] = {};
  save(db);
  return gid;
}

export async function updateGroup(gid, patch) {
  const db = load();
  if (!db.groups[gid]) return;
  Object.assign(db.groups[gid], patch);
  save(db);
}

export async function deleteGroup(gid) {
  const db = load();
  delete db.groups[gid];
  delete db.questions[gid];
  save(db);
}

export async function joinGroup(gid, key, name) {
  const db = load();
  const g = db.groups[gid];
  if (!g) throw new Error("That group no longer exists.");
  if (!g.members[key]) g.members[key] = { name, joinedAt: Date.now() };
  save(db);
}

export async function removeMember(gid, key) {
  const db = load();
  const g = db.groups[gid];
  if (!g) return;
  delete g.members[key];
  for (const q of Object.values(db.questions[gid] || {})) delete q.responses[key];
  save(db);
}

export async function addQuestion(gid, data) {
  const db = load();
  const qs = (db.questions[gid] ||= {});
  const qid = id();
  const order = Math.max(0, ...Object.values(qs).map((q) => q.order)) + 1;
  qs[qid] = { id: qid, responses: {}, closed: false, createdAt: Date.now(), order, ...data };
  save(db);
  return qid;
}

export async function updateQuestion(gid, qid, patch) {
  const db = load();
  const q = db.questions[gid]?.[qid];
  if (!q) return;
  Object.assign(q, patch);
  save(db);
}

export async function deleteQuestion(gid, qid) {
  const db = load();
  delete db.questions[gid]?.[qid];
  save(db);
}

export async function setResponse(gid, qid, key, value) {
  const db = load();
  const q = db.questions[gid]?.[qid];
  if (!q) throw new Error("That question no longer exists.");
  if (value === null) delete q.responses[key];
  else q.responses[key] = { value, at: Date.now() };
  save(db);
}
