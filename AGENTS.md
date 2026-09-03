# Repository Guidelines

## Project Structure
This is a framework-free static web app. `index.html` is the entry point; `css/style.css` is the only stylesheet. `data/tasks.json` is the task-definition Single Source of Truth and `data/tasks.schema.json` documents its shape. Runtime modules live under `js/`: `app.js` wires the UI, `tasks.js` renders operations, `storage.js` manages localStorage v4, `schedule.js` and `alerts.js` handle dates and warnings, `budget*.js` handles v0.5 finance, `backup.js` handles v0.6 data movement, and `task-admin.js`, `csv.js`, and `data-quality.js` provide v0.7 master-data tooling. Specifications are in `docs/`; deterministic tests are in `tests/`.

## Run And Test
Because task data is loaded with `fetch`, serve the repository over HTTP rather than opening `index.html` with `file://`:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000`. With Node.js installed, run module tests with:

```powershell
node --experimental-default-type=module tests/task-master.test.js
node --experimental-default-type=module tests/alerts.test.js
node --experimental-default-type=module tests/budget.test.js
node --experimental-default-type=module tests/backup.test.js
```

## Style And Naming
Use two-space indentation, semicolons, single-quoted JavaScript strings, and `camelCase` names. Keep modules focused and use named exports. Prefer DOM event delegation for dynamic task cards and escape user-provided text before inserting HTML. Do not add a framework, build step, or duplicate stylesheet without a clear repository-wide decision.

## Data And Privacy
Do not put trainee names, phone numbers, resident registration numbers, bank-account numbers, or other personal data in source, JSON, backup, test fixtures, or browser state. Store only task-definition data in `data/tasks.json`; store completion status, timestamps, memos, settings, and budget operations in localStorage. Task Master edits are candidates until exported and reviewed.

## Commits And Pull Requests
Use concise imperative commits, for example `Add v0.7 task master groundwork`. Pull requests should explain behavior changes, list validation/tests run, identify data-schema changes, and include screenshots for UI changes. Never commit generated backups, personal data, or temporary local-server files.

## Agent Notes
Inspect the existing structure before editing. Preserve unrelated user changes, keep the existing visual language, run tests and a browser smoke test after changes, and update `README.md` and the relevant specification when behavior or data contracts change.
