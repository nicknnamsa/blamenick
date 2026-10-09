// Share text and the picture card for Killer Clues.
//
// `s` is a small summary of today's game:
//   { caseNo, clue, length, status, marks: [true|false...], hints, rank }
// where `marks` is one entry per guess (true for the right one).

const URL_TEXT = "https://blamenick.com/killer-clues";
const BODY = "(x_x)-|-<";

const QUIPS = {
  "Chief Inspector": "Elementary. Not a single hint.",
  Inspector: "One hint. Barely broke a sweat.",
  Sergeant: "Two hints. Got there with a nudge.",
  Constable: "All three hints. Got there. Eventually.",
  "Case gone cold": "The killer walked free.",
};

const BADGES = {
  "Chief Inspector": "🕵️",
  Inspector: "🔎",
  Sergeant: "🚓",
  Constable: "👮",
  "Case gone cold": "🧊",
};

function guessRow(s) {
  const shown = s.marks.slice(0, 8).map((ok) => (ok ? "✅" : "❌")).join("");
  const more = s.marks.length > 8 ? ` +${s.marks.length - 8}` : "";
  return shown + more + (s.status === "gaveup" ? "🧊" : "");
}

function hintRow(s) {
  return "💡".repeat(s.hints) + "⚪".repeat(3 - s.hints);
}

export function shareText(s) {
  if (!s) return `🔪 Killer Clues\n${BODY} somebody's dead. One clue, one killer, every day.\n${URL_TEXT}`;

  if (s.status === "playing") {
    return [
      `🔪 Killer Clues · Case ${s.caseNo}`,
      `${BODY}  Somebody's dead.`,
      `"${s.clue}" (${s.length})`,
      "Name the killer. I dare you.",
      URL_TEXT,
    ].join("\n");
  }

  return [
    `🔪 Killer Clues · Case ${s.caseNo}`,
    `${BODY}  ${s.status === "solved" ? "Case closed." : "Still dead. Nobody knows why."}`,
    `${BADGES[s.rank]} ${s.rank}`,
    `Guesses ${guessRow(s)}`,
    `Hints   ${hintRow(s)}`,
    `"${QUIPS[s.rank]}"`,
    URL_TEXT,
  ].join("\n");
}

// Toasts that pop up after copying, picked at random for a bit of fun.
const COPIED_SOLVED = ["Evidence bagged. Go and gloat.", "Copied. Rub it in.", "Copied. The group chat needs to know."];
const COPIED_COLD = ["Copied. Confess to your friends.", "Copied. Misery loves company."];
const COPIED_PLAYING = ["Copied. Send it to a suspect.", "Copied. Rope someone else in."];

export function copiedLine(s) {
  const pool = !s || s.status === "playing" ? COPIED_PLAYING : s.status === "solved" ? COPIED_SOLVED : COPIED_COLD;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---- Picture card (1080 × 1350, the shape Instagram likes) ----

const C = {
  plum: "#2E2440",
  soft: "#6B5F80",
  cream: "#FBF7F2",
  lavender: "#DDD6F7",
  blush: "#F7C9D4",
  mint: "#C9EBDA",
  sky: "#CDE3F7",
  butter: "#FBEAB0",
};

function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// The chalk outline, from the same shapes as the one on the page.
function drawBody(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = C.plum;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([1, 5]);
  ctx.beginPath();
  ctx.arc(18, 32, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.stroke(new Path2D("M26 32h40M34 32l10-15 12-6M34 32l12 14 10 8M66 32l20-12 22-4M66 32l22 12 20 8"));
  // x_x
  ctx.setLineDash([]);
  ctx.lineWidth = 1.4;
  ctx.stroke(new Path2D("M13 29l3 3M16 29l-3 3M20 29l3 3M23 29l-3 3"));
  ctx.restore();
}

export async function makeCard(s) {
  await Promise.all([
    document.fonts.load('600 80px "Fraunces"'),
    document.fonts.load('500 48px "Fraunces"'),
    document.fonts.load('800 40px "Nunito"'),
  ]).catch(() => {});

  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const solved = s.status === "solved";
  const cold = s.status === "gaveup";

  // Background with a few pastel dots, like the confetti on a solve.
  ctx.fillStyle = cold ? C.sky : solved ? C.mint : C.lavender;
  ctx.fillRect(0, 0, W, H);
  const dots = [C.blush, C.butter, C.cream, C.sky, C.lavender];
  for (let i = 0; i < 18; i++) {
    const a = (i * 137.5 * Math.PI) / 180;
    const r = 470 + (i % 3) * 40;
    ctx.beginPath();
    ctx.arc(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r * 1.2, 14 + (i % 4) * 6, 0, Math.PI * 2);
    ctx.fillStyle = dots[i % dots.length];
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.plum;
    ctx.stroke();
  }

  // The case file
  const cx = 90, cy = 110, cw = W - 180, ch = H - 220;
  ctx.fillStyle = C.plum;
  ctx.beginPath();
  ctx.roundRect(cx, cy + 14, cw, ch, 56);
  ctx.fill();
  ctx.fillStyle = C.cream;
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, 56);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = C.soft;
  ctx.font = '800 34px "Nunito", sans-serif';
  ctx.fillText(`CASE ${s.caseNo}`, W / 2, cy + 100);
  ctx.fillStyle = C.plum;
  ctx.font = '600 92px "Fraunces", serif';
  ctx.fillText("Killer Clues", W / 2, cy + 200);

  drawBody(ctx, W / 2 - 300, cy + 210, 5);

  let y = cy + 600;
  if (s.status === "playing") {
    ctx.font = '500 54px "Fraunces", serif';
    for (const line of wrap(ctx, `“${s.clue}” (${s.length})`, cw - 140)) {
      ctx.fillText(line, W / 2, y);
      y += 70;
    }
    y += 30;
    ctx.fillStyle = C.soft;
    ctx.font = '800 40px "Nunito", sans-serif';
    ctx.fillText("Name the killer. I dare you.", W / 2, y);
  } else {
    // Rank badge
    ctx.font = '600 72px "Fraunces", serif';
    const label = s.rank;
    const bw = ctx.measureText(label).width + 100;
    ctx.fillStyle = cold ? C.sky : C.blush;
    ctx.beginPath();
    ctx.roundRect(W / 2 - bw / 2, y - 76, bw, 110, 55);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = C.plum;
    ctx.stroke();
    ctx.fillStyle = C.plum;
    ctx.fillText(label, W / 2, y);

    y += 120;
    ctx.font = '64px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.fillText(guessRow(s), W / 2, y);
    y += 90;
    ctx.fillText(hintRow(s), W / 2, y);

    y += 90;
    ctx.fillStyle = C.soft;
    ctx.font = '800 40px "Nunito", sans-serif';
    ctx.fillText(QUIPS[s.rank], W / 2, y);
  }

  ctx.fillStyle = C.plum;
  ctx.font = '800 38px "Nunito", sans-serif';
  ctx.fillText("blamenick.com/killer-clues", W / 2, cy + ch - 60);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob && new File([blob], `killer-clues-case-${s.caseNo}.png`, { type: "image/png" });
}
