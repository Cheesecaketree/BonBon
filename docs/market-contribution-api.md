# Self-hosting the market observation API

BonBon resolves markets exclusively from the dataset bundled into each static build. The observation API is a write-only intake and moderation service; it is never queried by the dashboard for market data.

## Run the service

### Option A: Docker Compose (Production / Self-hosting)

Copy `.env.api.example` to `.env.api`, replace the admin token with a long random value (at least 32 characters), and set every allowed BonBon origin exactly. Then run:

```sh
docker compose --env-file .env.api -f compose.api.yml up -d --build
curl http://127.0.0.1:8788/healthz
```

The service listens only on host loopback. Point a Cloudflare Tunnel ingress at `http://localhost:8788`, or remove the host port and attach `cloudflared` to the Compose network. Do not expose the container port directly to the internet. Configure the static build with:

```sh
VITE_MARKET_CONTRIBUTION_API_URL=https://market-observations.example npm run build
```

### Option B: Local Node.js Development

For local development without Docker, you can run the API directly using `npm`:

1. Create a `.env.local` file in the project root:
   ```sh
   VITE_MARKET_CONTRIBUTION_API_URL=http://127.0.0.1:8788
   ```
2. Start the API server in watch mode:
   ```sh
   ADMIN_TOKEN="a-sufficiently-long-secret-admin-token-at-least-32-chars" \
   ALLOWED_ORIGINS="http://localhost:5173" \
   npm run dev:api
   ```
3. In a separate terminal, start Vite:
   ```sh
   npm run dev
   ```

The public API accepts only `POST /v1/submissions`; it has no public read endpoint. `GET /healthz` returns service health. Admin endpoints require the bearer token from `ADMIN_TOKEN`.

Before submission, the browser removes observations whose complete parsed address already matches the bundled dataset. This avoids collecting confirmations that do not affect the dataset while preserving address differences and deliberate advanced-field corrections.

## Review observations

From a trusted checkout, set the API URL and the same admin token without writing either value into the repository:

```sh
MARKET_CONTRIBUTION_API_URL=https://market-observations.example \
MARKET_CONTRIBUTION_ADMIN_TOKEN=replace-with-the-admin-token \
npm run review:market-observations
```

The full-screen terminal review groups pending records by market ID, shows distinct submitted text, and keeps all suggested address fields visible together. Exact address confirmations for known markets are staged automatically. Press **1**–**9** to autofill the draft from the corresponding submitted observation. Every remaining screen uses the same one-key actions: **A** approve, **E** edit, **R** reject, **D** defer, arrow keys to navigate, and **Q** to quit. Editing uses Tab or arrow keys between fields, Ctrl+S to save, and Escape to cancel.

The final summary does not change anything until **C** is pressed. Approved new markets and deliberate corrections to existing markets are validated and written to `src/domain/receipts/known-markets.json` before API decisions are recorded. Deferred entries remain pending.

Review files are written to the ignored `.market-contributions/` directory. Run `npm test`, `npm run build`, and `npm run build:api` before committing the sorted dataset diff.

## Configuration & Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `ADMIN_TOKEN` | *(required)* | Secret bearer token for admin routes (minimum 32 characters). |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated list of permitted web application origins for CORS. |
| `HOST` | `127.0.0.1` | Network interface to bind to (`0.0.0.0` in Docker). |
| `PORT` | `8788` | Port number to listen on. |
| `DATABASE_PATH` | `./data/market-contributions.sqlite` | Filepath to the SQLite database file. |
| `TRUST_PROXY` | `false` | Set to `true` when running behind a trusted reverse proxy (e.g. Cloudflare Tunnel). |

## Operations and privacy

- Back up the named Docker volume `market-contribution-data` (or SQLite file); the SQLite database uses WAL mode, so use SQLite's backup mechanism or stop the container before copying database files.
- Retain the database as sensitive community-submission data. It contains reviewed receipt-header text, optional address fields, consent version, and moderation history.
- It does not store receipt PDFs, filenames, timestamps, receipt numbers, basket data, or client IP addresses.
- CORS is a browser boundary, not authentication. Keep admin credentials server-side and restrict the origin to Cloudflare Tunnel traffic.
- Public submissions are limited to 64 KiB and ten batches per client IP per hour. Rate-limit state is intentionally in memory and resets when the single API instance restarts.
- Rotate `ADMIN_TOKEN` if it is exposed. A static BonBon build contains only the public API URL, never this token.
