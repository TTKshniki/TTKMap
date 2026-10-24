# TTKMap Frontend

React + TypeScript interface for organizers and visitors.

## Structure

- `src/app/` — top-level app shell, router, layout
- `src/shared/` — API client, coordinates, geometry, routing, conflict resolution
- `src/features/` — feature modules (organizer, plan editor, panorama viewer, visitor)

## Key Modules

### API Client (`shared/api.ts`)

Typed client for all OpenAPI endpoints. Handles CSRF tokens in memory, ETag/If-Match for optimistic concurrency, and structured error responses.

```typescript
const client = new ApiClient();
await client.login(email, password);
const maps = await client.listMaps();
```

### Conflict Resolution (`shared/conflicts.ts`)

Preserves local changes on 412 VERSION_CONFLICT. Stores drafts in sessionStorage.

```typescript
const handler = preserveLocalChanges(localDoc, (local, serverRevision) => {
  saveDraft({ mapId, document: local, baseRevision: serverRevision, timestamp: Date.now() });
  showConflictDialog();
});
await handler(() => client.saveMapDocument(mapId, doc, revision));
```

### Coordinates (`shared/coordinates.ts`)

Plan uses local units with `(0,0)` at upper-left, X right, Y down. Panorama yaw is `[-180,180)` degrees, pitch `[-90,90]`.

### Geometry (`shared/geometry.ts`)

Distance, bounding box, polygon area/centroid, point-in-polygon tests.

### Router (`shared/router.ts`, `app/Router.tsx`)

Minimal pattern-based router with dynamic segments and accessible navigation.

## Development

```bash
npm install
npm run dev    # starts dev server on :5173 with /api proxy to :8000
npm run test   # runs vitest
npm run build  # production build
```

## Accessibility

- Skip-to-content link on every page
- Semantic HTML and ARIA landmarks
- Keyboard navigation
- Focus management in modals
- WCAG 2.1 AA contrast (slate base, sky/orange accents)
