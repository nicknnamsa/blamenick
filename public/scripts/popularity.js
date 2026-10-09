// Nick popularity: total different visitors over time, drawn as an SVG area chart.

import { counted } from "./visit.js";

const SVG = "http://www.w3.org/2000/svg";
const H = 180;
const PAD = { top: 12, right: 8, bottom: 26, left: 34 };

const root = document.getElementById("popularity");
const chart = root.querySelector(".pop-chart");
const tip = root.querySelector(".pop-tip");
const totalEl = root.querySelector(".pop-total");
const todayEl = root.querySelector(".pop-today");
const table = root.querySelector(".pop-table tbody");

let days = [];

const fmtDay = (iso, opts = { day: "numeric", month: "short" }) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", opts);
const plural = (n, word) => `${n.toLocaleString("en-GB")} ${word}${n === 1 ? "" : "s"}`;

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
  const W = chart.clientWidth || 300;
  const last = days[days.length - 1];
  const step = niceStep(last.total);
  const maxY = Math.max(step, Math.ceil(last.total / step) * step);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (days.length === 1 ? plotW / 2 : (i / (days.length - 1)) * plotW);
  const y = (v) => PAD.top + plotH - (v / maxY) * plotH;

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img" });
  svg.setAttribute(
    "aria-label",
    `${plural(last.total, "visitor")} since ${fmtDay(days[0].day)}. Full numbers in the table below.`
  );

  for (let v = 0; v <= maxY; v += step) {
    svg.append(el("line", { class: "grid", x1: PAD.left, x2: W - PAD.right, y1: y(v), y2: y(v) }));
    const label = el("text", { class: "axis", x: PAD.left - 8, y: y(v) + 4, "text-anchor": "end" });
    label.textContent = v.toLocaleString("en-GB");
    svg.append(label);
  }

  const firstLabel = el("text", { class: "axis", x: x(0), y: H - 6, "text-anchor": days.length === 1 ? "middle" : "start" });
  firstLabel.textContent = fmtDay(days[0].day);
  svg.append(firstLabel);
  if (days.length > 1) {
    const lastLabel = el("text", { class: "axis", x: x(days.length - 1), y: H - 6, "text-anchor": "end" });
    lastLabel.textContent = "Today";
    svg.append(lastLabel);
  }

  const pts = days.map((d, i) => [x(i), y(d.total)]);
  if (pts.length > 1) {
    const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px},${py}`).join("");
    svg.append(el("path", { class: "area", d: `${line}L${pts.at(-1)[0]},${y(0)}L${pts[0][0]},${y(0)}Z` }));
    svg.append(el("path", { class: "line", d: line }));
  }
  const endDot = el("circle", { class: "dot", cx: pts.at(-1)[0], cy: pts.at(-1)[1], r: 4.5 });
  svg.append(endDot);

  const cross = el("line", { class: "cross", y1: PAD.top, y2: y(0), visibility: "hidden" });
  const hoverDot = el("circle", { class: "dot", r: 4.5, visibility: "hidden" });
  svg.append(cross, hoverDot);

  // Whole plot is the hit target: snap to the nearest day.
  const hit = el("rect", { x: PAD.left, y: 0, width: plotW, height: H, fill: "transparent" });
  svg.append(hit);

  const show = (i) => {
    const [px, py] = pts[i];
    const d = days[i];
    cross.setAttribute("x1", px);
    cross.setAttribute("x2", px);
    hoverDot.setAttribute("cx", px);
    hoverDot.setAttribute("cy", py);
    cross.setAttribute("visibility", "visible");
    hoverDot.setAttribute("visibility", "visible");
    tip.innerHTML = `<span class="tip-day"></span><strong></strong><span class="tip-new"></span>`;
    tip.children[0].textContent = fmtDay(d.day, { weekday: "short", day: "numeric", month: "short" });
    tip.children[1].textContent = plural(d.total, "person");
    tip.children[2].textContent = `+${d.new} new that day`;
    tip.hidden = false;
    const left = Math.min(Math.max(px, 70), W - 70);
    tip.style.left = `${left}px`;
    tip.style.top = `${py}px`;
  };
  const hide = () => {
    cross.setAttribute("visibility", "hidden");
    hoverDot.setAttribute("visibility", "hidden");
    tip.hidden = true;
  };
  hit.addEventListener("pointermove", (e) => {
    const box = svg.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = days.length === 1 ? 0 : Math.round(((px - PAD.left) / plotW) * (days.length - 1));
    show(Math.min(days.length - 1, Math.max(0, i)));
  });
  hit.addEventListener("pointerleave", hide);

  chart.append(svg);
}

function fillTable() {
  table.innerHTML = "";
  for (const d of [...days].reverse()) {
    const tr = document.createElement("tr");
    for (const v of [fmtDay(d.day), d.new, d.total]) {
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
    ({ days } = await res.json());
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

  const last = days[days.length - 1];
  totalEl.textContent = last.total.toLocaleString("en-GB");
  todayEl.textContent = last.new ? `+${last.new.toLocaleString("en-GB")} new today` : "No new faces yet today";
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
