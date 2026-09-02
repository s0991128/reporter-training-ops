# Repository Guidelines

## Project Structure & Module Organization
This repository currently has no tracked source files, so treat the layout below as the default convention for new work:

- `src/` for application code
- `tests/` for automated tests
- `assets/` for images, sample data, or other static files
- `docs/` for reference material or process notes

Keep feature code grouped by domain rather than by file type. Use clear file names such as `src/scheduler.py` or `src/components/TaskList.tsx`.

## Build, Test, and Development Commands
No build or test scripts are defined yet. When you add them, document the exact command in `README.md` and keep the names consistent:

- `npm run dev` or `make dev` for local development
- `npm test` or `pytest` for the test suite
- `npm run build` or `make build` for production packaging

Prefer adding scripts to a project manifest so contributors can run the same commands everywhere.

## Coding Style & Naming Conventions
Use the style rules that match the language you introduce, and keep them consistent across the repository:

- 2 spaces for indentation unless the language standard says otherwise
- `camelCase` for variables and functions in JavaScript/TypeScript
- `snake_case` for Python modules and functions
- `PascalCase` for classes and UI components

If you add formatters or linters, record them in the repo and run them before opening a PR.

## Testing Guidelines
Place tests close to the behavior they cover or under `tests/`. Name tests after the unit under test, for example `task-list.test.ts` or `test_scheduler.py`. Prefer small, deterministic tests, and add coverage for bug fixes rather than only happy paths.

## Commit & Pull Request Guidelines
Git history is not available in this environment, so no existing commit convention could be confirmed. Use concise imperative commits such as `Add retry handling` or `Fix date parsing`.

For pull requests, include:

- A short summary of the change
- Any related issue or task link
- Screenshots or sample output for UI or behavior changes
- Notes on testing performed

## Agent Notes
When making changes here, keep edits focused, update this guide if new tooling is added, and avoid introducing extra structure unless the project starts to require it.
