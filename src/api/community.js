// Community cases: Killer Clues written by players.
//
//   GET  /api/killer-clues/community          approved cases (no answers)
//        ?sort=new|popular&limit=n
//   GET  /api/killer-clues/community/case     one approved case, ready to play
//        ?id=n
//   POST /api/killer-clues/community/submit   { visitor, author, clue, answer, type, highlight, explanation }
//   POST /api/killer-clues/community/result   { visitor, id, status }
//
// Submissions wait in a queue until Nick approves them at /admin.

import { ensureTables, cleanCase, standardHints, TYPES } from "../killer-clues.js";
import { json } from "../visitors.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 86_400_000;
const MAX_PENDING_PER_DAY = 5;

async function body(request) {
  try {
    return (await request.json()) ?? {};
  } catch {
    return {};
  }
}

const STATS = `
  (SELECT COUNT(*) FROM community_plays p WHERE p.case_id = c.id) AS plays,
  (SELECT COUNT(*) FROM community_plays p WHERE p.case_id = c.id AND p.status = 'solved') AS solved`;

export const listRoute = {
  async onRequestGet({ request, env }) {
    await ensureTables(env.DB);
    const params = new URL(request.url).searchParams;
    const popular = params.get("sort") === "popular";
    const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 60));
    const { results } = await env.DB.prepare(`
      SELECT c.id, c.author, c.clue, c.type, length(c.answer) AS length, c.approved_at AS approvedAt, ${STATS}
      FROM community_cases c
      WHERE c.status = 'approved'
      ORDER BY ${popular ? "plays DESC, c.approved_at DESC" : "c.approved_at DESC"}
      LIMIT ?
    `).bind(limit).all();
    return json({ cases: results }, 200, { "cache-control": "public, max-age=30" });
  },
};

export const caseRoute = {
  async onRequestGet({ request, env }) {
    await ensureTables(env.DB);
    const id = Number(new URL(request.url).searchParams.get("id"));
    const row = Number.isInteger(id)
      ? await env.DB.prepare("SELECT * FROM community_cases WHERE id = ? AND status = 'approved'").bind(id).first()
      : null;
    if (!row) return json({ error: "That case file has gone missing." }, 404);
    return json({
      id: row.id,
      author: row.author,
      clue: row.clue,
      answer: row.answer,
      length: row.answer.length,
      type: row.type,
      highlight: JSON.parse(row.highlight),
      hints: JSON.parse(row.hints),
      explanation: row.explanation,
    });
  },
};

export const submitRoute = {
  async onRequestPost({ request, env }) {
    await ensureTables(env.DB);
    const input = await body(request);
    if (typeof input.visitor !== "string" || !UUID.test(input.visitor)) {
      return json({ error: "Refresh the page and try again." }, 400);
    }

    const clue = typeof input.clue === "string" ? input.clue.trim() : "";
    if (clue.length > 160) return json({ error: "Keep the clue under 160 characters." }, 400);
    const author = (typeof input.author === "string" ? input.author.trim() : "").slice(0, 24) || "Anonymous detective";
    const answer = typeof input.answer === "string" ? input.answer.trim().toUpperCase() : "";
    const type = TYPES.includes(input.type) ? input.type : "other";
    const highlight = (Array.isArray(input.highlight) ? input.highlight : [])
      .filter((w) => typeof w === "string" && w.trim() && clue.toLowerCase().includes(w.trim().toLowerCase()))
      .map((w) => w.trim())
      .slice(0, 4);
    const explanation = (typeof input.explanation === "string" ? input.explanation.trim() : "").slice(0, 240)
      || `A case from ${author}.`;

    const { case: c, error } = cleanCase({
      clue,
      answer,
      type,
      highlight,
      hints: /^[A-Z]{2,15}$/.test(answer) ? standardHints(type, highlight, answer) : ["x", "x", "x"],
      explanation,
    });
    if (error) return json({ error }, 400);

    const visitor = input.visitor.toLowerCase();
    const { n } = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM community_cases WHERE visitor = ? AND created_at > ?")
      .bind(visitor, Date.now() - DAY)
      .first();
    if (n >= MAX_PENDING_PER_DAY) return json({ error: "That's plenty for one day, detective. Try again tomorrow." }, 429);

    const result = await env.DB.prepare(`
      INSERT INTO community_cases (visitor, author, clue, answer, type, highlight, hints, explanation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(visitor, author, c.clue, c.answer, c.type, JSON.stringify(c.highlight), JSON.stringify(c.hints), c.explanation, Date.now()).run();

    return json({ ok: true, id: result.meta.last_row_id });
  },
};

export const resultRoute = {
  async onRequestPost({ request, env }) {
    await ensureTables(env.DB);
    const { visitor, id, status } = await body(request);
    if (typeof visitor !== "string" || !UUID.test(visitor)) return json({ error: "Bad visitor." }, 400);
    if (!["playing", "solved", "gaveup"].includes(status)) return json({ error: "Bad status." }, 400);
    const exists = await env.DB.prepare("SELECT 1 FROM community_cases WHERE id = ? AND status = 'approved'").bind(Number(id)).first();
    if (!exists) return json({ error: "No such case." }, 404);
    await env.DB.prepare(`
      INSERT INTO community_plays (visitor, case_id, status) VALUES (?, ?, ?)
      ON CONFLICT (visitor, case_id) DO UPDATE SET
        status = CASE WHEN community_plays.status = 'playing' THEN excluded.status ELSE community_plays.status END
    `).bind(visitor.toLowerCase(), Number(id), status).run();
    return json({ ok: true });
  },
};

// ---- Admin ----

export async function communityForAdmin(db) {
  await ensureTables(db);
  const { results } = await db.prepare(`
    SELECT c.id, c.author, c.clue, c.answer, c.type, c.highlight, c.explanation, c.status,
           c.created_at AS createdAt, ${STATS}
    FROM community_cases c
    WHERE c.status != 'rejected'
    ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, c.created_at DESC
    LIMIT 300
  `).all();
  return results.map((r) => ({ ...r, highlight: JSON.parse(r.highlight) }));
}

export async function moderate(db, { action, id }) {
  const status = { approve: "approved", hide: "hidden", reject: "rejected" }[action];
  if (!status) return { error: "Unknown action." };
  await db
    .prepare("UPDATE community_cases SET status = ?, approved_at = CASE WHEN ? = 'approved' THEN COALESCE(approved_at, ?) ELSE approved_at END WHERE id = ?")
    .bind(status, status, Date.now(), Number(id))
    .run();
  return { ok: true };
}
