// Killer Clues cases and plays, stored in D1.
//
// Each case is pinned to a day number: day 0 is START_DATE, day 1 the day
// after, and so on (the player sees it as Case day+1). A day with no case of
// its own replays an older one, so there is always something to play.
//
// The first time the table is used it's filled from data/killer-clues.js.
// After that, cases are added and edited from /admin.

import { clues as seed, START_DATE } from "../data/killer-clues.js";

const DAY = 86_400_000;
const HOUR = 3_600_000;

export const TYPES = ["anagram", "double meaning", "hidden", "reversal", "deletion", "saying", "other"];

export function dayIndex(isoDate) {
  return Math.round((Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${START_DATE}T00:00:00Z`)) / DAY);
}

export function dateFor(index) {
  return new Date(Date.parse(`${START_DATE}T00:00:00Z`) + index * DAY).toISOString().slice(0, 10);
}

// The furthest-ahead day that is already "today" somewhere (UTC+14).
// Cases up to here may be on someone's screen, so they can't be moved.
export function lockedThrough(now = Date.now()) {
  return dayIndex(new Date(now + 14 * HOUR).toISOString().slice(0, 10));
}

// Runs once per Worker instance; later calls reuse the same promise.
let ready = null;
export function ensureTables(db) {
  ready ??= createTables(db).catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

async function createTables(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS kc_cases (
      day INTEGER PRIMARY KEY,
      clue TEXT NOT NULL,
      answer TEXT NOT NULL,
      type TEXT NOT NULL,
      highlight TEXT NOT NULL,
      hints TEXT NOT NULL,
      explanation TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS kc_plays (
      visitor TEXT NOT NULL,
      case_no INTEGER NOT NULL,
      day TEXT NOT NULL,
      status TEXT NOT NULL,
      hints INTEGER NOT NULL DEFAULT 0,
      guesses INTEGER NOT NULL DEFAULT 0,
      seconds INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (visitor, case_no)
    )`),
  ]);

  const { n } = await db.prepare("SELECT COUNT(*) AS n FROM kc_cases").first();
  if (n === 0) {
    await db.batch(seed.map((c, i) => insert(db, i, c)));
  }
}

function insert(db, day, c) {
  return db
    .prepare("INSERT OR IGNORE INTO kc_cases (day, clue, answer, type, highlight, hints, explanation) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(day, c.clue, c.answer, c.type, JSON.stringify(c.highlight), JSON.stringify(c.hints), c.explanation);
}

function fromRow(row) {
  return {
    day: row.day,
    clue: row.clue,
    answer: row.answer,
    type: row.type,
    highlight: JSON.parse(row.highlight),
    hints: JSON.parse(row.hints),
    explanation: row.explanation,
  };
}

export async function allCases(db) {
  const { results } = await db.prepare("SELECT * FROM kc_cases ORDER BY day").all();
  return results.map(fromRow);
}

// The case for a given day. A day without its own case replays an older one.
export async function caseForDay(db, index) {
  const row = await db.prepare("SELECT * FROM kc_cases WHERE day = ?").bind(index).first();
  if (row) return { ...fromRow(row), replay: false };
  const { results } = await db.prepare("SELECT * FROM kc_cases WHERE day < ? ORDER BY day").bind(index).all();
  if (!results.length) return null;
  return { ...fromRow(results[index % results.length]), replay: true };
}

// ---- Editing (admin only) ----

// Cleans up a case sent from the admin form, or explains what's wrong.
export function cleanCase(input) {
  const text = (v) => (typeof v === "string" ? v.trim() : "");
  const c = {
    clue: text(input.clue),
    answer: text(input.answer).toUpperCase(),
    type: TYPES.includes(input.type) ? input.type : "other",
    highlight: (Array.isArray(input.highlight) ? input.highlight : []).map(text).filter(Boolean).slice(0, 6),
    hints: (Array.isArray(input.hints) ? input.hints : []).map(text).slice(0, 3),
    explanation: text(input.explanation),
  };
  if (!c.clue) return { error: "The clue is empty." };
  if (!/^[A-Z]{2,15}$/.test(c.answer)) return { error: "The answer must be 2 to 15 letters, with no spaces or punctuation." };
  if (c.hints.length !== 3 || c.hints.some((h) => !h)) return { error: "All three hints are needed." };
  if (!c.explanation) return { error: "Add an explanation for the end screen." };
  return { case: c };
}

// New cases go on the next free day that hasn't gone live anywhere yet.
export async function addCase(db, c) {
  const { last } = await db.prepare("SELECT MAX(day) AS last FROM kc_cases").first();
  const day = Math.max((last ?? -1) + 1, lockedThrough() + 1, 0);
  await insert(db, day, c).run();
  return day;
}

export async function updateCase(db, day, c) {
  await db
    .prepare("UPDATE kc_cases SET clue = ?, answer = ?, type = ?, highlight = ?, hints = ?, explanation = ? WHERE day = ?")
    .bind(c.clue, c.answer, c.type, JSON.stringify(c.highlight), JSON.stringify(c.hints), c.explanation, day)
    .run();
}

// Swap a case with its neighbour. Both must still be in the future.
export async function moveCase(db, day, direction) {
  const locked = lockedThrough();
  const neighbour = await db
    .prepare(direction === "up"
      ? "SELECT day FROM kc_cases WHERE day < ? ORDER BY day DESC LIMIT 1"
      : "SELECT day FROM kc_cases WHERE day > ? ORDER BY day ASC LIMIT 1")
    .bind(day)
    .first();
  if (day <= locked) return { error: "That case has already gone live, so it can't move." };
  if (!neighbour) return { error: "It can't go any further." };
  if (neighbour.day <= locked) return { error: "The case before it has already gone live." };
  // Park one row at -1 so the primary key never clashes mid-swap.
  await db.batch([
    db.prepare("UPDATE kc_cases SET day = -1 WHERE day = ?").bind(day),
    db.prepare("UPDATE kc_cases SET day = ? WHERE day = ?").bind(day, neighbour.day),
    db.prepare("UPDATE kc_cases SET day = ? WHERE day = -1").bind(neighbour.day),
  ]);
  return { ok: true };
}

// Remove a future case and pull the later ones forward a day.
export async function deleteCase(db, day) {
  if (day <= lockedThrough()) return { error: "That case has already gone live, so it can't be deleted." };
  const { results } = await db.prepare("SELECT day FROM kc_cases WHERE day > ? ORDER BY day").bind(day).all();
  await db.batch([
    db.prepare("DELETE FROM kc_cases WHERE day = ?").bind(day),
    ...results.map((r) => db.prepare("UPDATE kc_cases SET day = ? WHERE day = ?").bind(r.day - 1, r.day)),
  ]);
  return { ok: true };
}
