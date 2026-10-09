# blamenick.com

A new small game most weeks, made by Nick.

- `public/`: the static site. `/` is the hub; each game gets its own folder (`/killer-clues/`).
- `functions/`: Cloudflare Pages Functions. `/api/killer-clues/today` returns only today's clue.
- `data/killer-clues.js`: every case. It sits outside `public/`, so future clues are never sent to the browser.

## Run it locally

```sh
npm install
npm run dev        # http://localhost:8788
```

## Deploy

Connect this repo in Cloudflare Pages (build command: none, output directory: `public`),
or run `npm run deploy`.
