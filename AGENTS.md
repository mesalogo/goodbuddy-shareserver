# ShareServer Agent Guide

## Scope and product status

This repository owns the independent ShareServer API and Web console.
The current implementation is an interactive prototype, not a production
identity, authorization, persistence, or task-routing service. Preserve this
distinction in code, UI, documentation, and validation reports.

## Implementation

- Frontend/backend separation means `web/` is the ShareServer frontend and
  `server/` is its unified Node.js/Hono backend. Office is a backend module,
  not a separate Python service. ONLYOFFICE Docs is an external editing engine.
- Treat LAN deployments with only a host IP and port, without DNS or a domain,
  as a normal supported path. Validate browser/Desktop access, plugin CORS,
  downloads and callbacks using IP URLs. Distinguish browser-visible URLs from
  container service URLs; never require domains or assume localhost is the server.
- Follow the existing TypeScript, Hono, React, Vite, and local UI components.
- Keep the service independently buildable. Do not import Electron or files
  from the GoodBuddy Desktop checkout.
- Use KISS and YAGNI. Do not add speculative recovery or security frameworks.
- Preserve user work and never commit credentials, local data, or generated
  output. Do not publish or push unless explicitly requested.
- Keep user-facing copy primarily in Simplified Chinese.
- Preserve cancellation, error context, accessibility, and prototype boundaries.

## Documentation

- `docs/features/share-server/README.md` is the feature entry point.
- PRD owns requirements; logic design owns state rules; UI design owns
  interactions; technical design owns implementation contracts; progress owns
  dated, verified facts. Do not duplicate their authoritative definitions.
- Update affected documentation when changing functionality.
- Cross-product network architecture remains in the adjacent GoodBuddy
  repository, as linked from the root README. Do not copy it into this repo.
- Consult the linked GoodBuddy UI design system before UI changes, while
  retaining the independent Web shell and existing local components.

## Validation

Run `npm ci` for a fresh checkout, then:

```text
npm test
npm run typecheck
npm run lint
npm run build
```

Validate affected behavior through the running service and UI when applicable.
Mocks and prototype acknowledgements do not establish production readiness.
