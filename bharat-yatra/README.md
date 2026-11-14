# Bharat Yatra — front end + back end

Two pieces:

- `public/index.html` — the whole app. One self-contained file: UI, planner, budget,
  itinerary, photo booth, translator, scanner, assistant. No build step, no framework.
- `server.js` — a dependency-free Node server that serves the app and proxies every
  Sarvam call, holding the API key server-side.

## Run it

```bash
export SARVAM_API_KEY=sk_...      # your key from dashboard.sarvam.ai
node server.js                    # or: npm start
# open http://localhost:8787
```

That is all. The page detects it is being served and routes every AI call through
this server automatically — you do not have to paste a key into the browser.

## Without a server

`public/index.html` also works opened directly from disk. In that case press
**Connect Sarvam** in the app and paste your key into the dialog; it is kept in
session storage and never written into the file. This is fine for your own machine.
Do not publish a copy that has a key baked in.

## What the server does

| Route | Behaviour |
|---|---|
| `GET /health` | `{ok, key: "set"|"missing"}` — quick check |
| `GET /*` | serves files from `public/` |
| `POST /v1/chat/completions` etc. | streamed straight through to `https://api.sarvam.ai`, with the key added |

It passes the request body through untouched, so streaming chat (SSE), audio from
text-to-speech and the Document AI job flow all work exactly as they do directly.
Both `/v1/...` and `/api/v1/...` are accepted.

## Deploying

Any Node host works — Render, Railway, Fly, a VPS. Set `SARVAM_API_KEY` in the
environment, keep `PORT` as your host gives it, and point the health check at
`/health`. Because the key never leaves the server, the page can be public.

## Files

```
server.js          the back end (no dependencies)
package.json
.env.example
public/index.html  the front end (the entire app)
```
