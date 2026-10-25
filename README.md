# ShareServer interactive prototype

This repository contains the first runnable ShareServer project. It is an
interactive control-console prototype based on the
[ShareServer PRD](docs/features/share-server/prd.md), not a production
ShareServer implementation. It also includes a persistent local sharing metadata
service connected to GoodBuddy's Device Sharing application and a local
OpenAI-compatible model gateway that forwards requests to configured upstreams.

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
- Overview with service links; planned modules show pending-service notices.
- Sharing center at `/capabilities`: real device and publication metadata,
  filters, source declarations and separate search/read/download flags; no content
  operations or organization ownership checks are connected.
- Local model gateway at `/model-gateway`: persistent upstreams and model aliases,
  encrypted upstream credentials, scoped client access keys, real model discovery,
  request testing, JSON/SSE forwarding, and metadata audits.
- `/documents` connects to the optional Office module in the unified Node/Hono backend for DOCX
  upload, ONLYOFFICE editing, persistent versions and save callbacks.
  [Office deployment](docs/office-deployment.md) includes the Compose overlay.
  `/distribution` remains a placeholder; gateway models are not delivered to GoodBuddy.
- Responsive navigation, dark and light themes, filters, details,
  forms, confirmations, and keyboard-accessible dialogs.
- Production build and a non-root container image.

The UI uses official shadcn/ui conventions and Radix primitives. Its information
architecture was informed by the MIT-licensed
[`satnaing/shadcn-admin`](https://github.com/satnaing/shadcn-admin), but this
project does not copy that template or include its Clerk integration and sample
business pages.

## Not included yet

Legacy snapshot and acknowledgement endpoints remain in the backend but are no
longer used by the console. Initialization and login, organization isolation, organization authorization, device
WebSocket connections, task routing, relay, package storage, federation, and
auditable mutations remain production implementation work. Office now has a unified
Node/Hono implementation for private-network DOCX editing and persistent save callbacks;
broader deployment acceptance, object storage, organization access control,
and cross-platform Desktop acceptance remain pending. DOCX Desktop tabs and local
writeback are implemented; see the linked Office progress records. Model hosting, inference and device delivery
are not implemented. B1 gateway code is implemented with
Bearer key authentication and model scopes, but acceptance is partial; GoodBuddy
Desktop, browser UI and a full tool-result roundtrip remain unverified for B1.
Organization authentication and quotas remain unimplemented. See the
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

Run from the repository root. The development launcher creates and reuses a
persistent master key under the current user's home directory. For first-time
Windows PowerShell setup:

```powershell
npm ci
$env:SHARESERVER_GATEWAY_BASE_URL = 'http://127.0.0.1:8787/api/v1/gateway/v1'
npm run dev
```

The automatic key is outside `SHARESERVER_DATA_DIR` (default `./data`) and is
reused on later starts. To manage the key explicitly, create one with
`npm run gateway:init-key -- <file>` and set `SHARESERVER_MASTER_KEY_FILE`
before starting the service. Back up the key separately from `data/`; restoring
encrypted credentials requires the same master key.

Open `http://127.0.0.1:5174`. Vite proxies `/api` to the Hono service on port
`8787` by default. When the launcher loads `SHARESERVER_PORT`, it passes the
derived API port to Vite so the proxy follows the API child. Vite accepts `/api`
requests only from loopback sockets, even if its listen address is changed.

## Local GoodBuddy integration

With `npm run dev` running here, run `npm run dev` in the adjacent GoodBuddy
checkout. Open Device Sharing from its application center, save the server URL
(`http://127.0.0.1:8787`), register the device, and publish a metadata entry.
Open `http://127.0.0.1:5174/capabilities?view=local` to view actual records.
Organization fixture tabs have been removed. Revoke in GoodBuddy and refresh the Web directory.

Records persist in `data/sharing.json`; override the directory with
`SHARESERVER_DATA_DIR`. Use one process per data directory. This API is a local
development service without device authentication, restricted to direct loopback
administration: device IDs identify records, not owners.
Source modes and permission flags are declarations only; no knowledge content,
file synchronization, remote execution, or organization authorization is provided.
The [technical design](docs/features/share-server/technical-design.md#41-本地共享目录契约已实现)
defines the actual HTTP contract. The readiness response additionally reports this
local-service boundary and keeps `productionReady: false`.

## Local model gateway

The gateway runs independently of GoodBuddy and has no Desktop source dependency.
Open `/model-gateway` in the Web console. A new store starts with no upstreams,
models or audits; mutations persist in `data/gateway.json` under
`SHARESERVER_DATA_DIR` (default `./data`). Use one process and one store per data
directory. It retains the newest 200 chat audits, containing metadata only, never
prompts, response content or credentials. Missing token usage remains unknown.

Add an upstream with its name, HTTP/HTTPS Base URL, OpenAI Chat Completions
protocol and API Key (or no authentication). Credentials are encrypted with
AES-256-GCM and never returned by the API. Editing defaults to `keep`; `replace`
sets a new secret and `clear` removes it. Selecting no authentication does not
delete a saved credential. `credentialConfigured` reports stored configuration,
not connectivity or successful decryption.

The master key is supplied by `SHARESERVER_MASTER_KEY_FILE`, or alternatively
`SHARESERVER_MASTER_KEY` containing 64 hexadecimal characters; do not set both.
Missing or incorrect keys report credential unavailability and never regenerate
the key over existing ciphertext.

Persisted legacy `apiKeyEnv` references remain readable and callable. Replace
them explicitly through the upstream editor to use managed credentials. The
variable-name/prefix UI and `/import-env` endpoint have been removed. For legacy
references or authorized development testing only, an env file can be loaded:

```text
npm run dev -- --env-file=../goodbuddy/.env.deepseek.local
```

`scripts/dev.mjs` passes values loaded from this file only to the API child, not
Vite; existing process variables take precedence. Restart the API after environment
changes. The adjacent path is optional test input, not a repository dependency.
Use preexisting personal configurations only for explicitly authorized environment
testing; the gateway does not automatically read or migrate GoodBuddy settings.

Use **Discover models** to request the upstream model list, add or edit an alias
mapping, and explicitly send a real test request. Discovery and testing contact the upstream; chat may incur
charges. Manual mapping is also available.

For an OpenAI-compatible client, use Base URL
`http://127.0.0.1:8787/api/v1/gateway/v1`, protocol `openai-chat-completions`,
a configured model alias and a newly created gateway access key as the client's
API Key. The console shows `SHARESERVER_GATEWAY_BASE_URL`; it does not infer a
public address from Vite or request Host headers. Supported
client endpoints are `/models` and `/chat/completions`; chat supports JSON or SSE,
tool-call data and upstream usage. Responses and Anthropic APIs are not supported, and the
gateway does not execute tools. Requests are limited to 1 MiB, upstream responses
to 16 MiB, and the default request timeout is 120 seconds. Exact stream limits and
API contracts are in [technical design section 4.2](docs/features/share-server/technical-design.md#42-本地模型网关契约已实现).

Both client endpoints require a Bearer access key. Create a key for selected
model record IDs; renaming an alias preserves its scope. The full key is shown
only at creation, and only its SHA-256 digest is stored. Missing, invalid or
revoked keys return 401; unauthorized models return 403. Model lists include only
authorized, enabled models with enabled upstreams and usable credentials. Audits
link the access key ID, which identifies a calling configuration, not a user.

Management and the legacy sharing API require a direct loopback socket. For these
requests, the API rejects `Forwarded`, `X-Forwarded-*` and `X-Real-IP` headers and checks Origin;
Origin alone is not authorization. Web tests use local-only `/api/v1/gateway/test`,
not a Bearer bypass on client endpoints. Reverse-proxy and container administration
are unsupported until B2 login exists; a proxy's loopback connection must not be
treated as an administrator. Nonlocal clients must reach the API inference
endpoints directly with a key, not through Vite. Use HTTPS for external deployment;
HTTP carries keys without transport encryption. Organization isolation and quotas
remain pending. Dated verification is in [progress](docs/features/share-server/progress.md).

## Run the production build

```text
cd goodbuddy-shareserver
npm run build
npm start
```

The API listens on `http://127.0.0.1:8787`. Serve `dist/web/` through the separate
Web container below (port 8088), with `/api/` proxied to the backend.

Use the same master-key and gateway Base URL environment settings as development
when starting the build. A successful build does not imply production readiness.

Build output is `dist/web/` for the console and `dist/server/` for the backend.
`npm start` runs only `dist/server/server/src/index.js` from the repository root.
The backend preserves the source directory structure under
its output directory so compiled imports can resolve root `shared/` modules.

Set `SHARESERVER_PORT` to use another listen port. Local runs bind to
`127.0.0.1` by default; `SHARESERVER_HOST` changes the listen interface, not the
management boundary. Do not expose the prototype as a production service.

## Container

For ONLYOFFICE with separate Web and unified ShareServer backend containers, follow
[Office deployment](docs/office-deployment.md). It uses the existing Compose file
plus `docker/compose.office.yaml`; the standalone commands below do not enable Office.

Container configuration lives in `docker/`. The existing commands below build and
start the image, but B1 does not support container/proxy administration: published
ports usually reach the API from a non-loopback socket and management returns 403.
The supplied Compose file does not configure the master-key file. Managed
credentials require a separate secret mount outside `/app/data` and its environment
setting; container management must wait for B2. Run from the repository root:

```text
mkdir -p data
sudo chown 1000:1000 data
docker compose -f docker/compose.yaml up -d --build
docker compose -f docker/compose.yaml ps
docker compose -f docker/compose.yaml logs -f shareserver
```

Open `http://127.0.0.1:8088`. The API container runs as the non-root `node` user
and stores sharing and gateway metadata in `/app/data`, bind-mounted from the project's
`./data` directory. Compose also starts a PostgreSQL 16 service with the persistent
`postgres-data` volume and exposes its connection string to ShareServer as
`DATABASE_URL`. When `DATABASE_URL` is set, both Stores use PostgreSQL JSONB state and
create the `shareserver_state` table at startup. Existing JSON files are imported once
when their database state is absent; the data directory remains mounted for encrypted
credential keys and that one-time import.
Existing local `data/sharing.json` is used directly and must be readable by UID 1000.
Gateway configuration and its bounded audit metadata use `data/gateway.json` in
the same mount; upstream credentials are encrypted there and access keys are
stored as digests. The master key must be supplied and backed up separately.

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
does not add organization login or relax B1's socket restrictions.
The image health check verifies HTTP availability, not storage writability or
production readiness.

## Validation

```text
npm test
npm run typecheck
npm run lint
npm run build
```
