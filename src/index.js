// The Worker. Files in public/ are served straight from Cloudflare's asset
// store; anything that isn't a file (the /api routes) lands here.

import * as today from "./api/killer-clues-today.js";
import * as visit from "./api/visit.js";
import * as popularity from "./api/popularity.js";
import * as play from "./api/killer-clues-play.js";
import * as community from "./api/community.js";
import { loginRoute, logoutRoute, statsRoute, casesRoute, communityRoute } from "./api/admin.js";

const routes = {
  "/api/killer-clues/today": today,
  "/api/killer-clues/play": play,
  "/api/killer-clues/community": community.listRoute,
  "/api/killer-clues/community/case": community.caseRoute,
  "/api/killer-clues/community/submit": community.submitRoute,
  "/api/killer-clues/community/result": community.resultRoute,
  "/api/visit": visit,
  "/api/popularity": popularity,
  "/api/admin/login": loginRoute,
  "/api/admin/logout": logoutRoute,
  "/api/admin/stats": statsRoute,
  "/api/admin/cases": casesRoute,
  "/api/admin/community": communityRoute,
};

export default {
  async fetch(request, env) {
    const route = routes[new URL(request.url).pathname];
    if (!route) return env.ASSETS.fetch(request);

    const method = request.method === "HEAD" ? "Get" : request.method[0] + request.method.slice(1).toLowerCase();
    const handler = route[`onRequest${method}`];
    if (!handler) return new Response("Method not allowed", { status: 405 });
    return handler({ request, env });
  },
};
