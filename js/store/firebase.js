// Shared store backed by Firebase Cloud Firestore.
//
// Layout:
//   groups/{groupId}                       { name, description, emoji, createdAt,
//                                            resultsVisible, members: { key: { name, joinedAt } } }
//   groups/{groupId}/questions/{questionId} { type, title, ..., order, closed,
//                                            responses: { key: { value, at } } }

import { firebaseConfig } from "../config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
const { initializeApp } = await import(`${SDK}/firebase-app.js`);
const fs = await import(`${SDK}/firebase-firestore.js`);
const {
  getFirestore, collection, doc, onSnapshot, addDoc, setDoc, updateDoc,
  deleteDoc, getDoc, getDocs, writeBatch, deleteField, query, orderBy,
} = fs;

const db = getFirestore(initializeApp(firebaseConfig));
const groupRef = (gid) => doc(db, "groups", gid);
const questionsRef = (gid) => collection(db, "groups", gid, "questions");
const questionRef = (gid, qid) => doc(db, "groups", gid, "questions", qid);

export const mode = "firebase";

export function subscribeGroups(cb, onError) {
  return onSnapshot(
    query(collection(db, "groups"), orderBy("createdAt", "desc")),
    (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id }))),
    onError
  );
}

export function subscribeGroup(gid, cb, onError) {
  let group, questions;
  let groupLoaded = false;
  const push = () => {
    if (groupLoaded && questions) cb({ group, questions });
  };
  const u1 = onSnapshot(
    groupRef(gid),
    (d) => {
      groupLoaded = true;
      group = d.exists() ? { members: {}, ...d.data(), id: d.id } : null;
      push();
    },
    onError
  );
  const u2 = onSnapshot(
    query(questionsRef(gid), orderBy("order")),
    (snap) => {
      questions = snap.docs.map((d) => ({ responses: {}, ...d.data(), id: d.id }));
      push();
    },
    onError
  );
  return () => { u1(); u2(); };
}

export async function createGroup(data) {
  const ref = await addDoc(collection(db, "groups"), {
    members: {}, resultsVisible: false, createdAt: Date.now(), ...data,
  });
  return ref.id;
}

export async function updateGroup(gid, patch) {
  await updateDoc(groupRef(gid), patch);
}

export async function deleteGroup(gid) {
  const snap = await getDocs(questionsRef(gid));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(groupRef(gid));
  await batch.commit();
}

export async function joinGroup(gid, key, name) {
  const g = await getDoc(groupRef(gid));
  if (!g.exists()) throw new Error("That group no longer exists.");
  if (g.data().members?.[key]) return; // already a member — keep their original join date
  await updateDoc(groupRef(gid), { [`members.${key}`]: { name, joinedAt: Date.now() } })
    .catch((e) => {
      if (e.code === "not-found") throw new Error("That group no longer exists.");
      throw e;
    });
}

export async function removeMember(gid, key) {
  const snap = await getDocs(questionsRef(gid));
  const batch = writeBatch(db);
  batch.update(groupRef(gid), { [`members.${key}`]: deleteField() });
  snap.docs.forEach((d) => batch.update(d.ref, { [`responses.${key}`]: deleteField() }));
  await batch.commit();
}

export async function addQuestion(gid, data) {
  const snap = await getDocs(questionsRef(gid));
  const order = Math.max(0, ...snap.docs.map((d) => d.data().order || 0)) + 1;
  const ref = await addDoc(questionsRef(gid), {
    responses: {}, closed: false, createdAt: Date.now(), order, ...data,
  });
  return ref.id;
}

export async function updateQuestion(gid, qid, patch) {
  await updateDoc(questionRef(gid, qid), patch);
}

export async function deleteQuestion(gid, qid) {
  await deleteDoc(questionRef(gid, qid));
}

export async function setResponse(gid, qid, key, value) {
  await updateDoc(questionRef(gid, qid), {
    [`responses.${key}`]: value === null ? deleteField() : { value, at: Date.now() },
  }).catch((e) => {
    if (e.code === "not-found") throw new Error("That question no longer exists.");
    throw e;
  });
}
