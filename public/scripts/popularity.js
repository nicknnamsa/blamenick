// Nick popularity: how many different people came by each day, as SVG bars.

import { counted } from "./visit.js";

const SVG = "http://www.w3.org/2000/svg";
const H = 180;
const PAD = { top: 12, right: 8, bottom: 26, left: 34 };
const MAX_DAYS = 30;

const root = document.getElementById("popularity");
const chart = root.querySelector(".pop-chart");
const tip = root.querySelector(".pop-tip");
const totalEl = root.querySelector(".pop-total");
const todayEl = root.querySelector(".pop-today");
const table = root.querySelector(".pop-table tbody");

let days = [];
let total = 0;

const fmtDay = (iso, opts = { day: "numeric", month: "short" }) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", opts);
const people = (n) => `${n.toLocaleString("en-GB")} ${n === 1 ? "person" : "people"}`;

function niceStep(max) {
  const raw = Math.max(1, max / 3);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  return Math.max(1, step);
}

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function draw() {
  chart.innerHTML = "";
  const shown = days.slice(-MAX_DAYS);
  const W = chart.clientWidth || 300;
  const peak = Math.max(...shown.map((d) => d.people));
  const step = niceStep(peak);
  const maxY = Math.max(step, Math.ceil(peak / step) * step);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(shown.length, 7); // keep bars from getting huge early on
  const left = PAD.left + plotW - slot * shown.length; // newest day sits on the right
  const y = (v) => PAD.top + plotH - (v / maxY) * plotH;

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img" });
  const today = shown[shown.length - 1];
  svg.setAttribute("aria-label", `${people(today.people)} came by today. Daily numbers are in the table below.`);

  for (let v = 0; v <= maxY; v += step) {
    svg.append(el("line", { class: "grid", x1: PAD.left, x2: W - PAD.right, y1: y(v), y2: y(v) }));
    const label = el("text", { class: "axis", x: PAD.left - 8, y: y(v) + 4, "text-anchor": "end" });
    label.textContent = v.toLocaleString("en-GB");
    svg.append(label);
  }

  const first = el("text", { class: "axis", x: left + slot / 2, y: H - 6, "text-anchor": shown.length === 1 ? "middle" : "start" });
  first.textContent = shown.length === 1 ? "Today" : fmtDay(shown[0].day);
  svg.append(first);
  if (shown.length > 1) {
    const last = el("text", { class: "axis", x: W - PAD.right, y: H - 6, "text-anchor": "end" });
    last.textContent = "Today";
    svg.append(last);
  }

  shown.forEach((d, i) => {
    const x = left + i * slot;
    const h = Math.max(d.people ? 3 : 0, y(0) - y(d.people));
    const g = el("g", { class: "day" });
    g.append(el("rect", { x, y: PAD.top, width: slot, height: plotH, fill: "transparent" }));
    g.append(el("rect", {
      class: `bar${i === shown.length - 1 ? " today" : ""}`,
      x: x + slot * 0.16, y: y(0) - h, width: slot * 0.68, height: h, rx: 3,
    }));
    g.addEventListener("pointerenter", () => {
      tip.innerHTML = `<span class="tip-day"></span><strong></strong><span class="tip-new"></span>`;
      tip.children[0].textContent = fmtDay(d.day, { weekday: "short", day: "numeric", month: "short" });
      tip.children[1].textContent = people(d.people);
      tip.children[2].textContent = `${d.new} new`;
      tip.hidden = false;
      tip.style.left = `${Math.min(Math.max(x + slot / 2, 70), W - 70)}px`;
      tip.style.top = `${y(d.people)}px`;
    });
    g.addEventListener("pointerleave", () => { tip.hidden = true; });
    svg.append(g);
  });

  chart.append(svg);
}

function fillTable() {
  table.innerHTML = "";
  for (const d of [...days].reverse()) {
    const tr = document.createElement("tr");
    for (const v of [fmtDay(d.day), d.people, d.new]) {
      const td = document.createElement("td");
      td.textContent = v;
      tr.append(td);
    }
    table.append(tr);
  }
}

async function start() {
  await counted;
  try {
    const res = await fetch("/api/popularity");
    if (!res.ok) throw new Error();
    ({ days, total } = await res.json());
  } catch {
    root.classList.add("empty");
    totalEl.textContent = "?";
    todayEl.textContent = "The visitor counter is having a lie-down.";
    return;
  }
  if (!days.length) {
    root.classList.add("empty");
    totalEl.textContent = "0";
    todayEl.textContent = "Nobody yet. Be the first to blame Nick.";
    return;
  }

  const today = days[days.length - 1];
  totalEl.textContent = today.people.toLocaleString("en-GB");
  todayEl.textContent = `${today.people === 1 ? "person" : "people"} today · ${total.toLocaleString("en-GB")} all time`;
  fillTable();
  draw();

  let width = chart.clientWidth;
  new ResizeObserver(() => {
    if (chart.clientWidth !== width) {
      width = chart.clientWidth;
      draw();
    }
  }).observe(chart);
}

start();
