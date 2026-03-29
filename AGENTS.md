# Repository Guidelines

## Project Structure & Module Organization
This repository root is the `assets/` app workspace. Keep changes scoped to the relevant layer:
- `client/`: Vite + React frontend. Main code is in `client/src/` (`components/`, `pages/`, `store/`, `hooks/`, `contexts/`, `lib/`).
- `java/src/`: Java reactors and backend utilities.
- `py/`: Python helper scripts invoked by reactors.
- `test/reactors/`: JUnit test suite and shared test base classes.
- `portals/`: generated frontend build output (do not edit manually).
- `classes/` and `test-classes/`: Maven compilation outputs.

## Build, Test, and Development Commands
Run from repository root unless noted.
- `pnpm install`: install root tooling (Biome, Husky, lint-staged).
- `pnpm --dir client install`: install frontend dependencies.
- `pnpm dev`: run the frontend dev server (`client` Vite app).
- `pnpm --dir client build`: production build to `portals/`.
- `pnpm fix`: run Biome format/lint and pre-commit checks across the repo.
- `mvn test`: run all Java tests.
- `mvn test -Dtest=ReactorTestSuite` or `mvn test -Dtest=HelloReactorTest`: run targeted reactor tests.
- `pnpm javadoc`: generate and serve JavaDoc locally.

## Coding Style & Naming Conventions
- JS/TS/CSS/JSON/HTML are formatted/linted with Biome (`biome.json`), using 4-space indentation.
- Prefer React component names in `PascalCase` (`HomePage.tsx`) and supporting modules in clear `camelCase`/descriptive names (`chatSlice.ts`, `routes.constants.ts`).
- Java code is auto-formatted via Google Java Format in pre-commit hooks.
- Python code uses `black`, `isort`, and `mypy`.

## Testing Guidelines
- Java tests use JUnit Jupiter + Mockito.
- Add tests under `test/reactors/` with class names ending in `Test`.
- New reactor tests should extend `BaseReactorTest` and be added to `ReactorTestSuite`.
- Run `mvn test` before opening a PR; for new reactors, cover main path plus edge cases.

## Commit & Pull Request Guidelines
- Commit messages are validated by Commitizen at `commit-msg`; use Conventional Commit style (`feat:`, `fix:`, `chore:`).
- Keep commits focused and include tests with behavior changes.
- PRs should include: summary, affected paths, commands run (for example `pnpm fix`, `mvn test`), and screenshots for UI changes.
- CI workflows run pre-commit checks and unit tests on PRs to `default-app`.

## Configuration & Security Tips
- Frontend env values are loaded from `client/.env` and `client/.env.local` (for example `ENDPOINT`, `MODULE`, `APP`).
- Do not commit secrets (for example `CLIENT_ACCESS_KEY`/`CLIENT_SECRET_KEY`).
- Ensure `java/project.properties` exists for backend initialization (it can be empty locally).
