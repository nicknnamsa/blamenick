# blamenick.com

A new small game most weeks, made by Nick.

- `public/`: the static site. `/` is the hub; each game gets its own folder (`/killer-clues/`).
- `src/`: the Cloudflare Worker. It serves `public/` and handles the `/api` routes: `/api/killer-clues/today` returns only today's clue, `/api/visit` and `/api/popularity` run the visitor counter (stored in D1).
- `data/killer-clues.js`: every case. It sits outside `public/`, so future clues are never sent to the browser.

## Run it locally

```sh
npm install
npm run dev        # http://localhost:8787
```

## Deploy

Pushing to `main` on GitHub deploys automatically (Cloudflare Workers Builds runs `npx wrangler deploy`).
