# App shell ownership

The frontend-core owner owns routing, authentication state, shared API client and `App.tsx`. Feature agents add screens under `src/features/<feature>/` and export them through `index.ts`; they do not edit this shell or duplicate contract types.
