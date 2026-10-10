// Killer Clues: one clue a day, name the killer.

import { shareText, copiedLine, makeCard } from "./share.js";
import { counted } from "/scripts/visit.js";

const STORE_KEY = "killer-clues:v1";
const RANKS = ["Chief Inspector", "Inspector", "Sergeant", "Constable"];
const GONE_COLD = "Case gone cold";
const PASTELS = ["#9E3B2F", "#DDDAE2", "#C8C3D0", "#FDFCFE", "#9E3B2F", "#C8C3D0"];

const $ = (id) => document.getElementById(id);
const el = {
  caseLine: $("case-line"),
  clue: $("clue"),
  form: $("guess-form"),
  boxes: $("boxes"),
  feedback: $("feedback"),
  ruledWrap: $("ruled-out-wrap"),
  ruled: $("ruled-out"),
  hints: $("hints"),
  hintList: $("hint-list"),
  hintButtons: [...document.querySelectorAll("[data-hint]")],
  giveUp: $("give-up"),
  solved: $("solved"),
  verdict: $("verdict"),
  explanation: $("explanation"),
  rank: $("rank"),
  tally: $("tally"),
  share: $("share"),
  shareNote: $("share-note"),
  streak: $("streak"),
  countdown: $("countdown"),
  helpDialog: $("help-dialog"),
  statsDialog: $("stats-dialog"),
  confetti: $("confetti"),
  stamp: $("stamp"),
  folderLabel: $("folder-label"),
  sideShare: $("side-share"),
  sideShareLabel: $("side-share-label"),
  sideShareNote: $("side-share-note"),
  evidence: $("evidence"),
  evidenceLine: $("evidence-line"),
  evidenceText: $("evidence-text"),
  evidenceSave: $("evidence-save"),
  casebook: document.querySelector(".side-right"),
  sideCountdown: $("side-countdown"),
};

// ---- Saved progress (this browser only) ----

function loadStore() {
  try {
    return { games: {}, seenHelp: false, ...JSON.parse(localStorage.getItem(STORE_KEY)) };
  } catch {
    return { games: {}, seenHelp: false };
  }
}
const store = loadStore();
function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch {}
}

// ---- Anonymous play reports (for the admin page) ----
// Uses the same random browser id as the visitor counter. Nothing personal.

function visitorId() {
  try { return localStorage.getItem("blamenick:visitor"); } catch { return null; }
}

function report({ leaving = false } = {}) {
  const visitor = visitorId();
  if (!visitor || !record || !game) return;
  const body = JSON.stringify({
    visitor,
    case: record.case,
    date: today,
    status: game.status,
    hints: game.hints,
    guesses: game.guesses.length,
    seconds: Math.round(game.seconds ?? 0),
  });
  if (leaving && navigator.sendBeacon) {
    navigator.sendBeacon("/api/killer-clues/play", new Blob([body], { type: "application/json" }));
  } else {
    fetch("/api/killer-clues/play", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
  }
}

// Time spent: only ticks while the case is open and the tab is in view.
function startClock() {
  let ticks = 0;
  setInterval(() => {
    if (!game || game.status !== "playing" || document.visibilityState !== "visible") return;
    game.seconds = (game.seconds ?? 0) + 1;
    if (++ticks % 10 === 0) saveStore();
  }, 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden" || !game) return;
    saveStore();
    if (game.status === "playing") report({ leaving: true });
  });
}

// ---- Dates ----

function isoDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dayBefore(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return isoDate(new Date(y, m - 1, d - 1));
}
const today = isoDate(new Date());

// ---- State for today ----

let record = null;   // today's clue from the API
let game = null;     // { case, guesses: [], hints, status: "playing" | "solved" | "gaveup" }
let inputs = [];

const normalise = (s) => s.toUpperCase().replace(/[^A-Z]/g, "");

function rankFor(g) {
  return g.status === "gaveup" ? GONE_COLD : RANKS[g.hints];
}

// ---- Rendering ----

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function renderClue() {
  let html = escapeHtml(record.clue);
  const showKeyWords = game.hints >= 2 || game.status !== "playing";
  if (showKeyWords) {
    for (const phrase of record.highlight) {
      const pattern = escapeHtml(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      html = html.replace(new RegExp(pattern, "i"), (m) => `<mark>${m}</mark>`);
    }
  }
  el.clue.innerHTML = `${html} <span class="count">(${record.length})</span>`;
}

function buildBoxes() {
  el.boxes.innerHTML = "";
  inputs = [];
  for (let i = 0; i < record.length; i++) {
    const input = document.createElement("input");
    Object.assign(input, {
      className: "box",
      type: "text",
      maxLength: 2,
      autocomplete: "off",
      spellcheck: false,
      inputMode: "text",
    });
    input.setAttribute("autocapitalize", "characters");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("aria-label", `Letter ${i + 1} of ${record.length}`);
    input.addEventListener("input", () => onBoxInput(i));
    input.addEventListener("keydown", (e) => onBoxKey(e, i));
    input.addEventListener("paste", (e) => onPaste(e, i));
    input.addEventListener("focus", () => input.select());
    el.boxes.append(input);
    inputs.push(input);
  }
}

function lockFirstLetter() {
  const first = inputs[0];
  first.value = record.answer[0];
  first.readOnly = true;
  first.classList.add("locked");
}

function renderHints() {
  el.hintList.innerHTML = "";
  record.hints.slice(0, game.hints).forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    el.hintList.append(li);
  });
  el.hintButtons.forEach((btn, i) => {
    btn.hidden = i < game.hints;
    btn.disabled = i !== game.hints;
  });
  el.giveUp.hidden = game.hints < 3;
  renderSides();
}

function renderRuledOut() {
  const wrong = game.guesses.filter((g) => g !== normalise(record.answer));
  el.ruledWrap.hidden = wrong.length === 0;
  el.ruled.innerHTML = "";
  for (const g of wrong) {
    const li = document.createElement("li");
    li.textContent = g;
    el.ruled.append(li);
  }
}

function renderPlaying() {
  renderClue();
  renderHints();
  renderRuledOut();
  el.form.hidden = false;
  el.hints.hidden = false;
  if (game.hints >= 3) lockFirstLetter();
}

function renderFinished({ celebrate = false } = {}) {
  const solved = game.status === "solved";
  renderClue();
  renderRuledOut();

  inputs.forEach((input, i) => {
    input.value = record.answer[i];
    input.readOnly = true;
    input.tabIndex = -1;
    input.classList.remove("locked");
    input.classList.add(solved ? "correct" : "revealed");
  });
  el.form.hidden = false;
  $("accuse").hidden = true;
  el.hints.hidden = true;
  el.feedback.textContent = "";
  document.activeElement?.blur();

  el.solved.hidden = false;
  el.solved.classList.toggle("cold", !solved);
  el.verdict.textContent = solved ? "Case closed." : "The case has gone cold.";
  el.stamp.textContent = solved ? "Case closed" : "Gone cold";
  el.stamp.className = `stamp ${solved ? "closed" : "cold"}${celebrate ? " thud" : ""}`;
  el.explanation.textContent = record.explanation;
  el.rank.textContent = rankFor(game);
  el.tally.textContent = tallyText();
  el.streak.textContent = streaks().current;
  renderSides();

  if (celebrate) {
    burst();
    el.solved.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function tallyText() {
  const h = game.hints, g = game.guesses.length;
  return `${h} ${h === 1 ? "hint" : "hints"}, ${g} ${g === 1 ? "guess" : "guesses"}`;
}

// ---- Letter box input ----

function editable(i) {
  return inputs[i] && !inputs[i].readOnly;
}

function focusBox(i) {
  if (inputs[i]) inputs[i].focus();
}

function onBoxInput(i) {
  const input = inputs[i];
  const letter = input.value.replace(/[^a-z]/gi, "").slice(-1).toUpperCase();
  input.value = letter;
  if (!letter) return;
  input.classList.remove("pop");
  void input.offsetWidth; // restart the animation
  input.classList.add("pop");
  if (i + 1 < inputs.length) focusBox(i + 1);
}

function onBoxKey(e, i) {
  if (e.key === "Backspace" && !inputs[i].value) {
    e.preventDefault();
    if (editable(i - 1)) {
      inputs[i - 1].value = "";
      focusBox(i - 1);
    }
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    focusBox(i - 1);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    focusBox(i + 1);
  }
}

function onPaste(e, start) {
  e.preventDefault();
  const letters = normalise(e.clipboardData.getData("text"));
  let i = start;
  for (const ch of letters) {
    while (i < inputs.length && !editable(i)) i++;
    if (i >= inputs.length) break;
    inputs[i++].value = ch;
  }
  focusBox(Math.min(i, inputs.length - 1));
}

function firstEditable() {
  return inputs.findIndex((input) => !input.readOnly);
}

// ---- Actions ----

function accuse(e) {
  e.preventDefault();
  if (game.status !== "playing") return;

  const guess = inputs.map((input) => input.value).join("");
  if (guess.length < record.length) {
    el.feedback.textContent = "Fill every box first, detective.";
    focusBox(inputs.findIndex((input) => !input.value));
    return;
  }

  if (normalise(guess) === normalise(record.answer)) {
    game.guesses.push(normalise(guess));
    game.status = "solved";
    saveStore();
    report();
    renderFinished({ celebrate: true });
    return;
  }

  if (game.guesses.includes(guess)) {
    el.feedback.textContent = "You've already ruled that one out.";
  } else {
    game.guesses.push(guess);
    saveStore();
    renderRuledOut();
    el.feedback.textContent = "Not this time, detective.";
  }

  el.boxes.classList.remove("shake");
  void el.boxes.offsetWidth;
  el.boxes.classList.add("shake");
  setTimeout(() => {
    el.boxes.classList.remove("shake");
    inputs.forEach((input) => { if (!input.readOnly) input.value = ""; });
    focusBox(firstEditable());
  }, 420);
}

function takeHint(i) {
  if (game.status !== "playing" || i !== game.hints) return;
  game.hints++;
  saveStore();
  renderClue();
  renderHints();
  if (game.hints === 3) {
    lockFirstLetter();
    focusBox(firstEditable());
  }
}

function giveUp() {
  if (game.status !== "playing") return;
  game.status = "gaveup";
  saveStore();
  report();
  renderFinished();
}

function summary() {
  if (!record || !game) return null;
  const answer = normalise(record.answer);
  return {
    caseNo: record.case,
    clue: record.clue,
    length: record.length,
    status: game.status,
    marks: game.guesses.map((g) => g === answer),
    hints: game.hints,
    rank: rankFor(game),
  };
}

// The picture is made ahead of time: phones only allow the share sheet
// straight after a tap, so there's no time to draw it then.
let card = null;
let cardKey = "";
function prepareCard() {
  const s = summary();
  const key = JSON.stringify(s);
  if (!s || key === cardKey) return;
  cardKey = key;
  makeCard(s).then((file) => { if (cardKey === key) card = file; }).catch(() => {});
}

const onPhone = () => Boolean(navigator.share) && matchMedia("(pointer: coarse)").matches;

// Phones get the share sheet (WhatsApp, Instagram, Messages…) with the
// picture attached; computers get the text copied and a peek at it.
async function share(note) {
  const s = summary();
  const text = shareText(s);
  if (onPhone()) {
    const withPicture = card && navigator.canShare?.({ files: [card] });
    try {
      await navigator.share(withPicture ? { files: [card], text } : { text });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    showEvidence(copiedLine(s), text);
    note.textContent = "";
  } catch {
    note.textContent = "Couldn't copy, sorry.";
  }
}

let evidenceTimer = null;
function showEvidence(line, text) {
  el.evidenceLine.textContent = line;
  el.evidenceText.textContent = text;
  el.evidenceSave.hidden = !card;
  el.evidence.hidden = false;
  el.evidence.classList.remove("in");
  void el.evidence.offsetWidth;
  el.evidence.classList.add("in");
  clearTimeout(evidenceTimer);
  evidenceTimer = setTimeout(hideEvidence, 6000);
}
function hideEvidence() {
  clearTimeout(evidenceTimer);
  el.evidence.hidden = true;
}
function savePicture() {
  if (!card) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(card);
  a.download = card.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function renderShareLabel() {
  const finished = game && game.status !== "playing";
  el.sideShareLabel.textContent = finished ? "Share your result" : "Challenge a friend";
}

// ---- Streaks and stats ----

function streaks() {
  const solvedOn = (d) => store.games[d]?.status === "solved";

  let current = 0;
  let day = solvedOn(today) ? today : dayBefore(today);
  while (solvedOn(day)) { current++; day = dayBefore(day); }

  let best = 0, run = 0, prev = null;
  for (const d of Object.keys(store.games).sort()) {
    if (!solvedOn(d)) { run = 0; prev = d; continue; }
    run = prev && dayBefore(d) === prev && solvedOn(prev) ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best };
}

function renderStats(root) {
  const finished = Object.values(store.games).filter((g) => g.status !== "playing");
  const { current, best } = streaks();
  const stat = (name) => root.querySelector(`[data-stat="${name}"]`);
  stat("played").textContent = finished.length;
  stat("current").textContent = current;
  stat("best").textContent = best;

  const counts = [...RANKS, GONE_COLD].map((name) => [name, finished.filter((g) => rankFor(g) === name).length]);
  const max = Math.max(1, ...counts.map(([, n]) => n));
  const list = stat("ranks");
  list.innerHTML = "";
  for (const [name, n] of counts) {
    const li = document.createElement("li");
    li.innerHTML = `<span></span><span class="bar"></span><span class="n"></span>`;
    li.children[0].textContent = name;
    li.children[1].style.width = `${(n / max) * 100}%`;
    li.children[2].textContent = n;
    list.append(li);
  }
}

function openStats() {
  renderStats(el.statsDialog);
  el.statsDialog.showModal();
}

// Side panels, shown on wide screens.
function renderSides() {
  renderStats(el.casebook);
  renderShareLabel();
  prepareCard();
}

// ---- Countdown to local midnight ----

let countdownTimer = null;
function startCountdown() {
  clearInterval(countdownTimer);
  const tick = () => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const left = Math.max(0, midnight - now);
    if (left === 0 || isoDate(now) !== today) return location.reload();
    const s = Math.floor(left / 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const text = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
    el.countdown.textContent = text;
    el.sideCountdown.textContent = text;
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

// ---- Pastel burst ----

function burst() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < 36; i++) {
    const dot = document.createElement("span");
    const angle = Math.random() * Math.PI * 2;
    const distance = 120 + Math.random() * 220;
    dot.className = "dot";
    dot.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
    dot.style.setProperty("--y", `${Math.sin(angle) * distance}px`);
    dot.style.setProperty("--size", `${8 + Math.random() * 10}px`);
    dot.style.setProperty("--color", PASTELS[i % PASTELS.length]);
    dot.style.animationDelay = `${Math.random() * 0.1}s`;
    el.confetti.append(dot);
    dot.addEventListener("animationend", () => dot.remove());
  }
}

// ---- Start ----

async function start() {
  el.form.addEventListener("submit", accuse);
  el.hintButtons.forEach((btn) => btn.addEventListener("click", () => takeHint(Number(btn.dataset.hint))));
  el.giveUp.addEventListener("click", giveUp);
  el.share.addEventListener("click", () => share(el.shareNote));
  el.sideShare.addEventListener("click", () => share(el.sideShareNote));
  $("share-btn").addEventListener("click", () => share(el.feedback));
  el.evidenceSave.addEventListener("click", savePicture);
  $("evidence-close").addEventListener("click", hideEvidence);
  $("help-btn").addEventListener("click", () => el.helpDialog.showModal());
  $("stats-btn").addEventListener("click", openStats);
  renderSides();
  startCountdown();

  try {
    const res = await fetch(`/api/killer-clues/today?date=${today}`);
    if (!res.ok) throw new Error((await res.json()).error);
    record = await res.json();
  } catch (err) {
    el.caseLine.textContent = "The case file is missing.";
    el.clue.textContent = err.message || "Couldn't load today's case. Try again in a moment.";
    return;
  }

  const dateLabel = new Date(`${record.date}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });
  el.caseLine.textContent = dateLabel;
  el.folderLabel.textContent = `Case ${record.case}`;

  game = store.games[today] ??= { case: record.case, guesses: [], hints: 0, status: "playing", seconds: 0 };
  saveStore();
  startClock();
  counted.then(() => report());

  buildBoxes();
  if (game.status === "playing") {
    renderPlaying();
    if (!store.seenHelp) {
      store.seenHelp = true;
      saveStore();
      el.helpDialog.showModal();
      el.helpDialog.addEventListener("close", () => focusBox(firstEditable()), { once: true });
    } else {
      focusBox(firstEditable());
    }
  } else {
    renderFinished();
  }
}

start();
