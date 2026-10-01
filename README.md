# ShareServer interactive prototype

This repository contains the first runnable ShareServer project. It is an
interactive control-console prototype based on the
[ShareServer PRD](docs/features/share-server/prd.md), not a production
ShareServer implementation. It also includes a persistent local sharing metadata
service connected to GoodBuddy's Device Sharing application.

## Repository and documentation

- Clone: `git clone ssh://git@git.digiman.live:11022/root/goodbuddy-shareserver.git`
- [Feature documentation](docs/features/share-server/README.md): requirements,
  logic, UI, technical design, and verified implementation progress.
- [Shared network architecture](../goodbuddy/docs/architecture/share-network-architecture.md)
  remains authoritative in the GoodBuddy Desktop repository.
- [GoodBuddy UI design system](../goodbuddy/UI-DESIGN.md) supplies the shared
  design guidance, not an Electron runtime dependency.

For cross-repository documentation links, clone `goodbuddy` and
`goodbuddy-shareserver` next to each other. Building and running ShareServer
does not require the Desktop checkout.

Web sources, HTML entry, and Vite/TypeScript configuration live in `web/`;
Hono sources and tests live in `server/src/`, with `server/tsconfig.json`.
Shared types and fixtures remain in root `shared/`. The root package scripts,
`vitest.config.ts`, and ESLint configuration cover both applications; there are
no separate packages or workspaces.

Source and feature documentation were extracted from GoodBuddy commit
`ee804edcae828066614e03a3b37e6ba389b09323`, from `shareserver/` and
`docs/features/share-server/`. Earlier history remains in that repository.

## Included

- Hono HTTP service with health, readiness, prototype snapshot, and prototype
  action endpoints.
- Same-origin React, Vite, TypeScript, Tailwind CSS, and shadcn/ui-style Web
  console.
- Administrator views for overview, members, devices, capabilities, policies,
  approvals, releases, federation, tasks, audit, and settings.
- Member self-service views for personal devices, grants, and requests.
- Sharing center at the preserved `/capabilities` route: capability and knowledge
  catalogs, publisher/device views, URL filters and linked metadata details.
  Knowledge fixtures distinguish synced copies from remote retrieval and display
  separate search/read/download permissions; no content operations are connected.
- GoodBuddy service demos: `/model-gateway`, `/documents`, and `/distribution`.
  They simulate upstream routing policies and call audit, document ownership and
  recycle-bin permissions, OnlyOffice instance checks, and per-group configuration
  releases and rollback. State survives navigation between these routes but resets
  on refresh; these actions use browser memory only, with no network requests or
  local storage. Offline devices retain their applied version and remain pending.
- Responsive navigation, dark and light themes, search, filters, details,
  forms, confirmations, and keyboard-accessible dialogs.
- Production build and a non-root container image.

The UI uses official shadcn/ui conventions and Radix primitives. Its information
architecture was informed by the MIT-licensed
[`satnaing/shadcn-admin`](https://github.com/satnaing/shadcn-admin), but this
project does not copy that template or include its Clerk integration and sample
business pages.

## Not included yet

The existing snapshot records are read-only fixtures; the service demos mutate
only in-memory examples. The action endpoint returns an acknowledgement but does
not persist changes. PostgreSQL,
initialization and login, organization isolation, real authorization, device
WebSocket connections, task routing, relay, package storage, federation, and
auditable mutations remain production implementation work. The planned Office
editing integration also has no current implementation: ONLYOFFICE Docs,
object storage, document sessions, save callbacks, checkpoints, and Desktop
document tabs remain design work. Model inference, actual gateway forwarding,
document saving, and device delivery are not implemented. The OnlyOffice checks
use preset results and do not establish an editing session. See the
[ShareServer feature documentation](docs/features/share-server/README.md).

Daily work belongs in GoodBuddy; ShareServer provides the organization backend.
Its model gateway forwards to other model services and does not host models.
The agreed document model uses ShareServer as primary storage. Personal creators
may delete their documents or transfer ownership to the organization; after
transfer, organization permissions govern deletion, with no retained personal
delete right. Explicit local-source import/writeback remains a separate Office
mode: a server checkpoint does not confirm a Desktop or SSH source-file save.
Closing an editing session does not delete a server-stored primary document.

The readiness endpoint reports this explicitly:

```json
{
  "status": "ready",
  "mode": "interactive-prototype",
  "productionReady": false
}
```

## Run locally

```text
cd goodbuddy-shareserver
npm ci
npm run dev
```

Open `http://127.0.0.1:5174`. Vite proxies `/api` to the Hono service on port
`8787`.

## Local GoodBuddy integration

With `npm run dev` running here, run `npm run dev` in the adjacent GoodBuddy
checkout. Open Device Sharing from its application center, save the server URL
(`http://127.0.0.1:8787`), register the device, and publish a metadata entry.
Open `http://127.0.0.1:5174/capabilities?view=local` to view actual records separately
from the organization fixtures. Revoke in GoodBuddy and refresh the Web directory.

Records persist in `data/sharing.json`; override the directory with
`SHARESERVER_DATA_DIR`. Use one process per data directory. This API is a local,
unauthenticated development service: device IDs identify records, not owners.
Source modes and permission flags are declarations only; no knowledge content,
file synchronization, remote execution, or organization authorization is provided.
The [technical design](docs/features/share-server/technical-design.md#41-本地共享目录契约已实现)
defines the actual HTTP contract. The readiness response additionally reports this
local-service boundary and keeps `productionReady: false`.

## Run the production build

```text
cd goodbuddy-shareserver
npm run build
npm start
```

Open `http://127.0.0.1:8787`.

Build output is `dist/web/` for the console and `dist/server/` for the backend.
`npm start` runs `dist/server/server/src/index.js` from the repository root and
serves `dist/web/`. The backend preserves the source directory structure under
its output directory so compiled imports can resolve root `shared/` modules.

Set `SHARESERVER_PORT` to use another listen port. Local runs bind to
`127.0.0.1` by default; set `SHARESERVER_HOST` explicitly when a trusted reverse
proxy or container needs another interface. Do not expose the prototype as a
production service.

## Container

Container configuration lives in `docker/`. Run these commands from the repository
root to build and start the Web console and API together:

```text
mkdir -p data
sudo chown 1000:1000 data
docker compose -f docker/compose.yaml up -d --build
docker compose -f docker/compose.yaml ps
docker compose -f docker/compose.yaml logs -f shareserver
```

Open `http://127.0.0.1:8787`. The container runs as the non-root `node` user
and stores sharing metadata in `/app/data`, bind-mounted from the project's
`./data` directory. No named volume or additional database container is required.
Existing local `data/sharing.json` is used directly and must be readable by UID 1000.
Only sharing metadata is
persisted; the console's other demos retain their prototype behavior.

Stop with `docker compose -f docker/compose.yaml down`; the host directory survives
container recreation and removal with `down -v`. Run only one process per data directory, including
local development servers. The setup commands above make the directory writable
by the container's `node` user (UID/GID 1000). Compose requires the directory to
exist before startup.

To run without Compose:

```text
docker build -f docker/Dockerfile -t goodbuddy-shareserver-prototype .
docker run --rm -p 127.0.0.1:8787:8787 --mount type=bind,source="$(pwd)/data",target=/app/data goodbuddy-shareserver-prototype
```

Compose publishes port 8787 on all host interfaces; the standalone example
publishes only on the host loopback interface. Containerization
does not add authentication or authorization; this remains a local prototype.
The image health check verifies HTTP availability, not storage writability or
production readiness.

## Validation

```text
npm test
npm run typecheck
npm run lint
npm run build
```
