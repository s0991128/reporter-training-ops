# Repository Guidelines

## Project Structure & Module Organization
This is a framework-free browser app with an optional Node.js server. `index.html` is the entry point and `css/style.css` is the only stylesheet. The 117-row operational checklist is in `업무목록.csv`; the structured MVP task master remains in `data/tasks.json` with its schema in `data/tasks.schema.json`. Browser modules live in `js/`: `app.js` coordinates UI state, `checklist*.js` handles the CSV checklist, `handover*.js` handles handover mode, `schedule.js`, `alerts.js`, `budget*.js`, and `backup.js` provide domain features, and `gap*.js`/`ai-adapter.js` provide local and remote analysis flows. `server/` contains the static, health, and AI API server. Specifications are in `docs/`; deterministic tests are in `tests/`.

## Build, Test, and Development Commands
Use Node.js 24 LTS. Run the full suite with `npm test` and start the local server with `npm start`. The server defaults to `HOST=127.0.0.1` and port `8080`; verify it with `Invoke-RestMethod http://localhost:8080/api/health`. Python may serve the static app with `python -m http.server 8000`, but that mode does not provide server-side AI analysis. Docker sets `HOST=0.0.0.0` explicitly; do not use that binding for ordinary local work.

## Coding Style & Naming Conventions
Use two-space indentation, semicolons, single-quoted JavaScript strings, and `camelCase` for variables and functions. Keep modules focused, use named exports, escape user-provided HTML, and avoid new frameworks or dependencies. Preserve the existing visual language.

## Testing Guidelines
Tests are deterministic ESM scripts named `*.test.js`. `npm test` covers task data, alerts, budget, backup, checklist, handover, gap analysis, and server behavior. Add regression coverage for each bug fix and run a browser smoke test after UI changes.

## Security & Configuration
Never commit trainee personal data, API keys, `.env` files, backups, or generated artifacts. Set `OPENAI_API_KEY` only in the current shell or deployment secret store. The server reports whether a key exists but never returns its value. Review sensitive-data validation before changing AI request handling.

## Commit & Pull Request Guidelines
Use concise imperative commits such as `Fix local server binding`. Pull requests should summarize behavior, list tests, document schema or environment changes, and include screenshots for UI changes. Use `git pull --ff-only origin main` before daily work and never force-push shared history.

## Agent Notes
Inspect the current branch and remote changes before editing. Preserve unrelated work, update `README.md` and relevant specs, and never commit local operation backups.
