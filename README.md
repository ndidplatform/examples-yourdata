# NDID Your Data — Example Implementation

_Last updated: 2026-09-18_

Example servers for **RP**, **IDP**, and **AS** roles in the Your Data flow, plus a **frontend** wizard for the RP.

> This example file is intended solely as a reference for developers building the Your Data APIs. Members must verify accuracy and recheck against the standards of the Your Data Project (e.g. UX Guideline, Operation Rules, Data Standards & Functional API for Your Data Services). This will be adjusted if any update.

---

## Backend (IDP, RP, AS1, AS2)

### Run with Docker

```bash
cd docker
docker build -f Dockerfile -t ndidplatform/your-data-examples:latest ..
docker compose -f docker-compose.dev.yml up
```

This builds one image containing all services and starts the mock NDID API, IDP, RP, AS1, AS2, and the frontend together — fully self-contained, no real NDID platform required.

### Run locally

Each backend service is a standalone Node/TypeScript server. Locally, they talk to the bundled mock NDID API instead of a real platform — start that first:

```bash
node test/mock-ndid-api.js
```

Then, in separate terminals:

```bash
cd idp/example1 && npm install && npm run dev
cd rp/example1  && npm install && npm run dev
cd as/example1  && npm install && npm run dev
cd as/example2  && npm install && npm run dev
```

`npm run dev` runs the TypeScript source directly with hot reload. To build and run the compiled output instead:

```bash
npm run build
npm start
```

Once all services are up, register the test identity on the IDP (needed once — this is done automatically by the `setup` service in Docker):

```bash
curl -X POST http://localhost:8000/identity \
  -H "Content-Type: application/json" \
  -d '{"namespace":"citizen_id","identifier":"1234567890123","mode":3}'
```

---

## Frontend

### Run with Docker

Included automatically in `docker compose -f docker-compose.dev.yml up` (see Backend → Docker above) — served at `http://localhost:5173`.

### Run locally

```bash
cd rp/example1/frontend
npm install
npm run dev
```

Or build and serve the production build:

```bash
npm run build
npm start
```

By default it talks to the RP at `http://localhost:9000`.

---

## Endpoints

### IDP (`http://localhost:8000`)

| Method | Path | Description |
|---|---|---|
| POST | `/identity` | Register a test identity |
| GET | `/identity/:namespace/:identifier` | Get identity info |
| GET | `/health` | Health check |

### RP (`http://localhost:9000`)

| Method | Path | Description |
|---|---|---|
| POST | `/pre-consent/create` | Start standard NDID (on-chain) pre-consent request |
| GET | `/pre-consent/data/:requestId` | Poll pre-consent request result |
| POST | `/complete-consent/create` | Start Your Data complete-consent request |
| GET | `/complete-consent/data/:requestId` | Poll complete-consent request result |
| POST | `/data-request/create` | Request data using an existing consent token |
| GET | `/data-request/data/:requestId` | Poll data-request result |
| POST | `/data-request/retry-decryption-key` | Retry fetching the decryption key for a data request |
| POST | `/revoke/create` | Revoke consent token(s) |
| GET | `/identity/:namespace/:identifier` | Get IDP list for an identity |
| GET | `/service-as-list/:service_id` | List AS nodes actually registered for a service (proxies the NDID utility API) |
| GET | `/health` | Health check |


### AS1 / AS2 (`http://localhost:10000` / `http://localhost:11000`)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/services` | List registered Your Data services |
| GET | `/error-codes` | List Your Data error codes |

The AS's actual pre-consent/complete-consent/data-request/revoke handling happens via NDID platform callbacks, not endpoints called directly by a developer — the RP is the entry point for those flows.

