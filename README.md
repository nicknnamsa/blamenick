# blamenick.com

A new small game most weeks, made by Nick.

- `public/`: the static site. `/` is the hub; each game gets its own folder (`/killer-clues/`).
- `src/`: the Cloudflare Worker. It serves `public/` and handles the `/api` routes: `/api/killer-clues/today` returns only today's clue, `/api/killer-clues/play` records anonymous results, `/api/visit` and `/api/popularity` run the visitor counter, and `/api/admin/*` powers the admin page. Everything is stored in D1.
- `data/killer-clues.js`: the first Killer Clues cases. They seed the database the first time it's used; after that, cases are added, edited and reordered at `/admin`.
- `public/admin/`: the admin page (stats per game, case editor). Not linked anywhere.

## Run it locally

```sh
npm install
npm run dev        # http://localhost:8787
```

For `/admin` locally, put `ADMIN_PASSWORD=...` in `.dev.vars` (it's gitignored).

## Admin password

The live password is a Worker secret, never in the repo. To change it:

```sh
npx wrangler secret put ADMIN_PASSWORD
```

## Deploy

Pushing to `main` on GitHub deploys automatically (Cloudflare Workers Builds runs `npx wrangler deploy`).
