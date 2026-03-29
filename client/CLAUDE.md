# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

This repo's root is the `assets/` directory. Key areas:
- `client/` — Vite + React frontend (this working directory)
- `java/` — Backend SEMOSS reactors
- `py/` — Python helpers
- `mcp/` — MCP-related code
- `portals/` — Generated build output; do not edit by hand

## Commands

Run from `client/` unless noted:

```bash
pnpm i                        # Install frontend deps
pnpm dev                      # Vite dev server with hot reload
pnpm --dir client build       # Production build → portals/  (run from assets/)
pnpm fix                      # Biome format + lint (run from assets/)
```

From `assets/` (repo root):
```bash
pnpm install                  # Install root dev tooling (Biome, pre-commit)
mvn test                      # All Java tests
mvn test -Dtest=HelloReactorTest   # Single Java test
```

No frontend test runner is configured yet.

## Environment Setup

Create `client/.env.local`:
```
CLIENT_APP="your-semoss-app-id"
```

Create `java/project.properties` (can be empty — required for backend initialization).

Vite exposes env vars with the `CLIENT_` prefix. The vars `ENDPOINT`, `MODULE`, and `APP` are derived at build time from the Vite config; `CLIENT_ACCESS_KEY` and `CLIENT_SECRET_KEY` are optional dev keys.

## Architecture

### SEMOSS Integration

The entire app runs inside SEMOSS — a platform that exposes an `InsightProvider` (from `@semoss/sdk`) and a `runPixel(pixelString)` function. Backend work is triggered by sending **pixel strings** to `runPixel`. The main Claude invocation lives in `src/store/thunks/callClaudeCode.ts` and constructs a `ClaudeCode(...)` pixel call.

After Claude completes, the thunk also calls `PublishProject(...)` and dispatches `chat/bumpIframeRefresh` to refresh the embedded app preview iframe.

### Context + Redux Hybrid

- **`AppContextProvider`** (`src/contexts/AppContext.tsx`) — Wraps the app; holds user login state, the `runPixel` function reference, and MCP response handlers. Provides these via `useAppContext()`.
- **Redux store** (`src/store/`) — Holds UI state across five slices:
  - `chatSlice` — Active messages, selected engine, roomId, system prompt, permission mode, iframe refresh counter
  - `mcpSlice` — MCP server config and user-selected MCPs
  - `createProjectSlice` — Project creation workflow state
  - `myProjectsSlice` — User's project list
  - `skillsSlice` — Skills and Claude.md configuration

Use the typed hooks from `src/store/hooks.ts`: `useAppDispatch()` and `useAppSelector()`.

### Routing

Hash-based routing (`createHashRouter`) with two layout wrappers:
1. **`InitializedLayout`** — Waits for SEMOSS SDK initialization before rendering children
2. **`AuthorizedLayout`** — Guards routes behind authentication; redirects to `/login` if unauthorized

Route constants are in `src/routes.constants.ts`.

### Adding UI Components

Uses **shadcn/ui** (new-york style) on top of Radix UI primitives with Tailwind CSS v4. To add a component:
```bash
pnpm dlx shadcn@latest add [component-name]
```
Generated components land in `src/components/ui/`. Use `cn()` from `src/lib/utils.ts` for conditional class merging.

## Coding Conventions

- Formatting: **Biome** (4-space indent). Run `pnpm fix` from `assets/` before committing.
- React components: `PascalCase` files and function names.
- File naming follows existing patterns: `HomePage.tsx`, `routes.constants.ts`, `chatSlice.ts`.
- Commits: Conventional Commits preferred (`feat:`, `fix:`, etc.) — a Commitizen hook is configured.
- TypeScript strict mode is **off**; however, prefer explicit types for new Redux state and thunk signatures.
