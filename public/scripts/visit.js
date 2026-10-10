// Checks in once a day, so the home page can show how many different people
// came by each day. The id is random and means nothing on its own.

const KEY = "blamenick:visitor";
const DAY_KEY = "blamenick:checked-in";

async function checkIn() {
  const today = new Date().toISOString().slice(0, 10); // UTC, like the server
  let id = null;
  try {
    id = localStorage.getItem(KEY);
    if (id && localStorage.getItem(DAY_KEY) === today) return;
  } catch {
    return; // no storage, so we couldn't remember them anyway
  }

  id ??= crypto.randomUUID();
  try {
    const res = await fetch("/api/visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
      keepalive: true,
    });
    if (res.ok) {
      localStorage.setItem(KEY, id);
      localStorage.setItem(DAY_KEY, today);
    }
  } catch {}
}

// Resolves once today's visit has been recorded (or skipped).
export const counted = checkIn();
