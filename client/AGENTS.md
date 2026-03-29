# Repository Guidelines

## Project Structure & Module Organization
- Repo root lives in the `assets/` directory.
- `client/` is the Vite + React frontend. Source lives in `client/src/` (notable folders: `components/`, `pages/`, `store/`, `hooks/`, `contexts/`, `lib/`, `assets/`).
- `java/` contains backend reactors under `java/src/`.
- `py/` contains Python helpers.
- `mcp/` contains MCP-related code.
- `test/` holds Java tests under `test/reactors/`.
- `portals/` is generated frontend output; do not edit by hand.

## Build, Test, and Development Commands
Run from repo root (`assets/`) unless noted.
- `pnpm install` installs root dev tooling (Biome, pre-commit).
- `pnpm --dir client install` installs frontend dependencies.
- `pnpm dev` runs the Vite dev server for the React app.
- `pnpm --dir client build` builds the frontend into `portals/`.
- `pnpm fix` runs Biome format + lint and pre-commit hooks.
- `mvn test` runs all Java tests.
- `mvn test -Dtest=ReactorTestSuite` or `mvn test -Dtest=HelloReactorTest` runs targeted tests.

## Coding Style & Naming Conventions
- JS/TS/CSS/JSON/HTML are formatted by Biome (4-space indent per `biome.json`).
- Java formatting is enforced by the Google Java Formatter pre-commit hook.
- Python uses `black`, `isort`, and `mypy`.
- Follow existing naming patterns (e.g., `HomePage.tsx`, `routes.constants.ts`) and keep React components in `PascalCase`.

## Testing Guidelines
- Java tests live in `test/reactors/` and typically extend `BaseReactorTest`.
- Add new reactor tests to `ReactorTestSuite.java` and cover 3–5 scenarios.
- CI runs `mvn test` in a Java 21 Maven container.
- No frontend test runner is configured yet; add one and update this guide if needed.

## Commit & Pull Request Guidelines
- Recent history uses short, descriptive commit messages; no strict prefix pattern is evident.
- A Commitizen `commit-msg` hook is configured, so prefer Conventional Commits (e.g., `feat: add reactor tests`).
- PRs should include a concise summary, test commands run, and screenshots for UI changes. Call out any config/env updates.

## Configuration Notes
- Frontend env files live in `client/.env` and `client/.env.local`. Required keys: `ENDPOINT`, `MODULE`, `APP`; optional dev keys: `CLIENT_ACCESS_KEY`, `CLIENT_SECRET_KEY`.
- Ensure `java/project.properties` exists (can be empty) for backend initialization.
