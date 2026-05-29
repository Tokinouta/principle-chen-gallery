# Galleria Principii Design Document

## Purpose

Galleria Principii is a small full-stack gallery application for browsing a curated Victorian-inspired artwork catalogue. The project is intentionally scoped as an MVP: it demonstrates a complete TypeScript frontend/backend workflow, a distinctive visual identity, tested public behavior, and a clean foundation for future features without introducing database, authentication, upload, or CMS complexity too early.

The product experience should feel less like a generic image grid and more like opening a printed museum catalogue: formal, tactile, ornamental, and legible.

## Design Principles

### 1. Catalogue Before Dashboard

The interface should read as a gallery catalogue, not a SaaS admin panel. Layout, typography, copy, and interaction language should reinforce the feeling of a curated collection.

Practical implications:

- Prefer terms like catalogue, viewing, collection, and gallery.
- Use decorative framing and measured spacing instead of dense utility layouts.
- Keep the primary page focused on browsing and selecting artworks.

### 2. Victorian, But Usable

The visual style is Victorian-inspired, not historically restrictive. Ornament should support atmosphere while preserving modern usability.

Practical implications:

- Use antique ivory, dark ink, oxblood, moss, and aged gold as the core palette.
- Use serif typography and ornamental dividers for tone.
- Keep contrast, focus states, and readable line lengths strong.
- Mark decorative symbols as `aria-hidden` when they add no semantic meaning.

### 3. Small Public Interfaces, Simple Internals

The backend exposes a tiny, stable API surface. The frontend consumes that API through one client module rather than scattering fetch logic across components.

Practical implications:

- API routes remain simple and behavior-oriented.
- `fetchArtworks()` is the frontend seam for catalogue retrieval.
- Runtime validation in the frontend protects the UI from invalid API payloads.

### 4. Behavior Is More Important Than Implementation Shape

Tests should verify what users or API consumers observe, not private implementation details.

Practical implications:

- API tests call Fastify through `buildApp().inject()`.
- Web tests use React Testing Library against visible UI behavior.
- E2E tests use accessible Playwright locators such as role, label, and text.

### 5. MVP Scope Discipline

The project deliberately avoids premature product surface area.

Out of scope for this version:

- Database persistence
- Image uploads
- Admin tooling
- Authentication
- User accounts
- Deployment/hosting automation
- CMS integration

These features can be added later when their requirements are clearer.

## Architecture Overview

The repository is an npm workspace with two applications:

```txt
apps/
  api/   Fastify + TypeScript backend
  web/   Vite + React + TypeScript frontend

e2e/     Playwright end-to-end tests
```

Root scripts coordinate both workspaces:

- `npm run dev` starts API and web together.
- `npm run typecheck` typechecks all workspaces.
- `npm run test` runs API and web unit/integration tests.
- `npm run build` builds both applications.
- `npm run test:e2e` runs Playwright tests.
- `npm run verify` runs the full verification pipeline.

## Backend Design

### Framework

The backend uses Fastify with TypeScript. Fastify was chosen because it gives a small, explicit HTTP layer with a test-friendly app/server split.

### App/Server Split

The backend separates app construction from network listening:

- `src/app.ts` builds and registers the Fastify app.
- `src/server.ts` starts the listener for local development/runtime.

This makes route behavior easy to test without opening real ports.

### Current API

#### `GET /health`

Returns a simple health payload:

```json
{ "ok": true }
```

#### `GET /api/artworks`

Returns the full artwork catalogue as an array.

#### `GET /api/artworks?search=rose`

Returns artworks matching the search term. Search is case-insensitive and checks:

- title
- artist
- medium
- period
- summary
- description

#### `GET /api/artworks/:id`

Returns one artwork by stable ID. Missing artwork IDs return:

```json
{ "error": "Artwork not found" }
```

with status `404`.

### Data Model

The MVP uses static in-memory artwork seed data in `apps/api/src/data/artworks.ts`.

Current `Artwork` shape:

```ts
export type Artwork = {
  id: string;
  title: string;
  artist: string;
  medium: string;
  period: string;
  year: number;
  summary: string;
  description: string;
};
```

The `id` is stable and URL-safe. It is the canonical identifier for detail lookup and future deep-linking.

## Frontend Design

### Framework

The frontend uses Vite, React, and TypeScript. The application is intentionally component-oriented without a router or global state library. Current state needs are local and simple:

- gallery loading status
- artwork catalogue
- search query
- selected artwork

### Main Flow

`App.tsx` owns the top-level experience:

1. Load artworks with `fetchArtworks()` on mount.
2. Show a loading state while the catalogue is being prepared.
3. Show an error state if the API request or payload validation fails.
4. Show search controls and the gallery grid when data is ready.
5. Filter visible artworks client-side as the user types.
6. Open a detail dialog when an artwork card is selected.

### API Client

`apps/web/src/api/artworks.ts` contains the frontend API seam.

Responsibilities:

- Fetch `/api/artworks`.
- Respect `VITE_API_BASE_URL` when provided.
- Validate that the payload is an array of artwork-like objects.
- Throw an error when the API response is not usable.

The Vite dev server proxies `/api` to `http://localhost:3000`, so local development can use the same relative API path as the browser app.

### Component Responsibilities

- `SearchBox` renders the accessible search control.
- `GalleryGrid` renders a list of artwork cards.
- `ArtworkCard` renders each selectable artwork summary.
- `ArtworkDetail` renders the modal-style detail view.
- `LoadingState`, `ErrorState`, and `EmptyState` handle non-happy paths.

The current UI keeps routing out of scope. The detail view is a dialog, not a separate route.

## Visual Design System

### Tone

Museum catalogue meets Victorian print ephemera.

The visual system should feel:

- curated
- literary
- tactile
- ornate but controlled
- serious without becoming stiff

### Color Palette

Defined in `apps/web/src/styles/tokens.css`:

- Antique ivory paper: `--color-paper`
- Bright paper highlight: `--color-paper-bright`
- Dark ink: `--color-ink`
- Oxblood accent: `--color-oxblood`
- Moss accent: `--color-moss`
- Aged gold ornament: `--color-aged-gold`

The palette is intentionally warm and print-like. Oxblood and aged gold carry emphasis; dark ink carries readability.

### Typography

The project uses local serif font stacks rather than external font loading:

- Display: Georgia / Times-style serif
- Body: Iowan Old Style / Palatino-style serif

This avoids external font dependencies while preserving a literary catalogue tone.

### Layout

The page uses:

- a centered shell
- ornamental masthead
- framed panels
- responsive card grid
- mobile-safe spacing
- `overflow-x` safeguards to prevent horizontal scrolling

Desktop should feel like a generous catalogue spread. Mobile should collapse into a clear single-column browsing experience.

### Ornamentation

Ornaments appear through:

- decorative symbols
- double borders
- inset frames
- subtle paper textures
- radial and repeating gradients
- gold dividers
- engraved-card visual treatments

Ornament is decorative, not navigational. It must not obscure labels, controls, or content hierarchy.

## Accessibility Principles

The project treats accessibility as part of the visual design, not a separate pass.

Current accessibility choices:

- Search uses an accessible label: `Search artworks`.
- Artwork cards are keyboard-activatable buttons.
- Detail view uses `role="dialog"` and an accessible title.
- Focus styles are visible and high contrast.
- Decorative symbols are hidden from assistive technology where appropriate.
- E2E tests use accessible locators, which helps protect semantic UI structure.

Future accessibility improvements:

- Add Escape key support for closing the detail dialog.
- Trap focus inside the dialog while it is open.
- Restore focus to the selected artwork card after closing the dialog.

## Testing Strategy

### API Tests

API tests use Vitest and Fastify `app.inject()`.

They verify:

- health endpoint
- artwork list shape
- search behavior
- empty search results
- detail lookup
- 404 behavior

### Web Tests

Frontend tests use Vitest, jsdom, and React Testing Library.

They verify:

- successful catalogue load
- search filtering
- empty state
- API failure state
- detail view behavior

### E2E Tests

Playwright verifies the integrated app in desktop and mobile projects.

Covered flows:

- gallery loads with heading and known artwork
- search for `rose`
- no-match search state
- artwork detail view
- mobile no-horizontal-overflow smoke test

### Verification Contract

The project is considered healthy when this passes:

```sh
npm run verify
```

That command runs:

1. TypeScript checks
2. API and web tests
3. production builds
4. Playwright E2E tests

## Operational Notes

Run locally:

```sh
npm install
npm run dev
```

Open:

```txt
http://localhost:5173
```

API runs at:

```txt
http://localhost:3000
```

Useful API smoke checks:

```sh
curl http://localhost:3000/health
curl http://localhost:3000/api/artworks
curl http://localhost:3000/api/artworks/ophelia-study
```

## Future Direction

Good next increments, in likely order:

1. Add route-based detail pages such as `/artworks/:id`.
2. Add richer artwork metadata: dimensions, acquisition notes, tags, location, image attribution.
3. Add real artwork images or generated SVG plates.
4. Add sort/filter controls by period, medium, and year.
5. Add focus trapping and Escape-to-close for the detail dialog.
6. Introduce persistence only when catalogue editing becomes a real requirement.
7. Add deployment configuration once hosting target is known.

## Non-Goals

The project should not become a generic content platform prematurely. Until there is a concrete need, avoid adding:

- a database
- an ORM
- authentication
- admin panels
- file upload pipelines
- heavy UI frameworks
- global state libraries

The current strength of the project is that it is small, typed, expressive, and fully verified.
