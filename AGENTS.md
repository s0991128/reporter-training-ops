# Repository Guidelines

## Project Structure
This is a framework-free browser app. `index.html` is the entry point; `css/style.css` is the only stylesheet. `data/tasks.json` is the task-definition Single Source of Truth and `data/tasks.schema.json` documents its shape. Runtime modules live under `js/`; `server/server.js` provides the optional Node.js 24 local server and `/api/health`. `Dockerfile` is the container entry point and deliberately has no dependency-install step because the app has no external packages. Specifications are in `docs/`; deterministic tests are in `tests/`.

## Run And Test
Because task data is loaded with `fetch`, serve the repository over HTTP rather than opening `index.html` with `file://`:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000`. With Node.js 24 LTS installed, run the full suite with:

```powershell
npm test
```

For local development, use `HOST=127.0.0.1` and `npm start`; Docker sets `HOST=0.0.0.0` explicitly. Verify the server with `Invoke-RestMethod http://localhost:8080/api/health`.

## Style And Naming
Use two-space indentation, semicolons, single-quoted JavaScript strings, and `camelCase` names. Keep modules focused and use named exports. Prefer DOM event delegation for dynamic task cards and escape user-provided text before inserting HTML. Do not add a framework, bundler, external dependency, or duplicate stylesheet without a clear repository-wide decision.

## Data And Privacy
Do not put trainee names, phone numbers, resident registration numbers, bank-account numbers, API keys, or other personal data in source, JSON, backup, test fixtures, or browser state. Store only task-definition data in `data/tasks.json`; store completion status, timestamps, memos, settings, and budget operations in localStorage. Task Master edits are candidates until exported and reviewed. Never commit `.env` files or generated backups.

## Commits And Pull Requests
Use concise imperative commits, for example `Add v0.7 task master groundwork`. Pull requests should explain behavior changes, list validation/tests run, identify data-schema changes, and include screenshots for UI changes. Never commit generated backups, personal data, or temporary local-server files.

## Agent Notes
Inspect the existing structure before editing. Preserve unrelated user changes, keep the existing visual language, run `npm test` and a browser smoke test after changes, and update `README.md` and the relevant specification when behavior or data contracts change. Keep the local server loopback-only by default; set `HOST=0.0.0.0` only for a container runtime that needs external access.
