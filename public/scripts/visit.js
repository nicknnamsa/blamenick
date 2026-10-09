// Counts each browser once, so the home page can show how many different
// people have visited. The id is random and means nothing on its own.

const KEY = "blamenick:visitor";

async function countMe() {
  let saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    return; // no storage, so we couldn't remember them anyway
  }
  if (saved) return;

  const id = crypto.randomUUID();
  try {
    const res = await fetch("/api/visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
      keepalive: true,
    });
    if (res.ok) localStorage.setItem(KEY, id);
  } catch {}
}

// Resolves once this visit has been recorded (or skipped).
export const counted = countMe();
