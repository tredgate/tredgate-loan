# Copilot Instructions for Tredgate Loan

This repository contains a small loan application management app used for GitHub Copilot training. It has a Vue 3 + TypeScript frontend and a thin Express + TypeScript backend with JSON-file storage and structured logs.

## Project Context

Tredgate Loan is a teaching app, not a product. Everything runs locally with Node.js and npm: no Docker, no database, no external services. See `README.md` for the architecture, API and log format.

## Coding Guidelines

### General Principles

- **KISS**: Keep it simple. Avoid over-engineering or introducing unnecessary complexity.
- **Small, focused changes**: Make atomic commits with clear, descriptive messages.
- **Readable code**: Prioritize clarity over cleverness.

### Technical Standards

- Use TypeScript types and interfaces for all domain objects; shared types live in `shared/loan.ts`.
- Keep functions small and focused on a single responsibility.
- Follow existing patterns in the codebase when making changes.

### Testing

- Always add or update tests when business logic or API behaviour changes.
- Tests should be easy to read and focused on behavior, not implementation.
- Use Vitest. Business rules are tested in `tests/loanRules.test.ts`, the HTTP API in `tests/api.test.ts` (it starts the app on a random port with a temporary data file).

### Architecture Constraints

- Business rules (validation, auto-decision, monthly payment) are pure functions in `shared/loanRules.ts`, used by both the server and the UI. Do not duplicate them elsewhere.
- The frontend talks to the backend only through `src/services/loanService.ts` (fetch to `/api`). No direct data access from components.
- Data is a JSON file managed only by `server/loanStore.ts`. Do not read or write the file anywhere else.
- Keep state management simple (Vue refs and reactivity). No heavy state management libraries.

### Backend Conventions

- Routes live in `server/app.ts`; use cases in `server/loanService.ts`.
- Throw `HttpError(status, message)` for expected failures (400, 404). The error handler in `server/errors.ts` maps errors to JSON responses; unexpected errors become 500 and are logged with their stack trace.
- Log with pino through `req.log` (a per-request child logger with a `reqId`). Never use `console.log` in server code.
- Express 5 handles rejected promises from async handlers; do not wrap handlers in try/catch just to forward errors.

### UI/Styling

- Use plain CSS, no CSS frameworks.
- Keep styles simple and consistent.
- Use scoped styles in Vue components.

## File Structure

- `shared/` - Domain types and business rules shared by frontend and backend
- `server/` - Express backend: routes, service, store, logger, config
- `server/data/` - Seed data (the live `loans.json` is generated and not committed)
- `src/components/` - Vue components
- `src/services/` - API client
- `tests/` - Vitest tests
- `docs/handbook/` - Fictional operations handbook: policy, operations, runbooks, reference, known issues. Keep it consistent with the code: a change in validation, decisions, API or logging must update the matching handbook document.
- `rag/` - Documentation search tool: chunks and indexes `docs/handbook`, answers `npm run rag -- "question"` with the relevant sections and a token report
- `logs/` - Runtime logs (generated, not committed)

## Commands

- `npm run dev` - Start frontend (port 5173) and backend (port 3000) together
- `npm start` - Build the frontend and serve it with the API from one process
- `npm run build` - Type-check all projects and build the frontend
- `npm run test` - Run tests
- `npm run lint` - Run ESLint
- `npm run data:reset` - Restore the data file from the seed
- `npm run rag -- "question"` - Find the handbook sections relevant to a question (`npm run rag:index` rebuilds the index)
