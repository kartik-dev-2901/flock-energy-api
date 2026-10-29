# Flock Energy Meter API

A Node.js and Express API that provides a clean interface over the legacy Urja Meter Ops portal. Meter listing, search, and metadata lookup use a local meter-export snapshot; energy readings are fetched from the portal on demand.

## Features

- Health check endpoint.
- Meter listing, search, and pagination.
- Meter detail lookup by meter ID.
- Energy readings fetched from the portal using a session-based login.
- Input validation and consistent JSON error responses.
- Automated API tests using Vitest and Supertest.

## Tech stack

- Node.js (ES modules)
- Express
- Zod
- Vitest
- Supertest

## Requirements

- Node.js 22 or a compatible recent Node.js release with native `fetch` support.
- npm.
- Access to the Urja Meter Ops portal and valid credentials for the configured account.

## Setup

1. Clone the repository:

   ```bash
   git clone <your-public-repository-url>
   cd flock-energy-api
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a local `.env` file in the project root:

   ```env
   PORT=3000
   PORTAL_BASE_URL=https://urja-ops.flockenergy.tech
   PORTAL_EMAIL=your_portal_email
   PORTAL_PASSWORD=your_portal_password
   ```

   Replace the credential placeholders with your authorized portal credentials. Do not commit `.env` or share session cookies. The repository should contain `.env.example` with placeholders only.

4. Ensure the meter export is present at:

   ```text
   data/meter-export.json
   ```

   The service loads this file as its local meter index during startup.

5. Start the development server:

   ```bash
   npm run dev
   ```

   Or start the server normally:

   ```bash
   npm start
   ```

   The examples below assume the server is listening on `http://localhost:3000`.

## API endpoints

### `GET /health`

Checks that the API process is running.

Example:

```bash
curl http://localhost:3000/health
```

Example response:

```json
{
  "status": "ok",
  "service": "flock-energy-api"
}
```

### `GET /api/v1/meters`

Lists meters from the local export, with optional search and pagination.

Query parameters:

| Parameter | Type | Default | Constraints | Description |
|---|---|---:|---|---|
| `q` | string | `""` | Optional | Search text |
| `page` | integer | `1` | Minimum `1` | 1-based page number |
| `limit` | integer | `20` | `1`–`100` | Maximum number of results per page |

Examples:

```bash
curl "http://localhost:3000/api/v1/meters"
curl "http://localhost:3000/api/v1/meters?q=J100000"
curl "http://localhost:3000/api/v1/meters?page=1&limit=10"
```

Invalid query parameters return HTTP `400` with an `INVALID_QUERY` error. The successful response body is produced by `listMeters()` in `src/meter.service.js`.

### `GET /api/v1/meters/{meterId}`

Returns metadata for a meter in the local index.

Example:

```bash
curl http://localhost:3000/api/v1/meters/J100000
```

Successful response shape:

```json
{
  "data": {
    "meterId": "J100000"
  }
}
```

The example shows the response shape; actual meter records include additional fields from the export.

- `400 INVALID_METER_ID`: the path parameter is invalid.
- `404 METER_NOT_FOUND`: the meter is not present in the local index.

### `GET /api/v1/meters/{meterId}/energy`

Fetches energy readings from the legacy portal on demand.

Example:

```bash
curl http://localhost:3000/api/v1/meters/J100000/energy
```

Example response:

```json
{
  "meterId": "J100000",
  "count": 2,
  "data": [
    {
      "timestamp": "24/06/2026 00:00",
      "kwh": "48439.16",
      "kvah": "52314.29",
      "voltR": "229"
    },
    {
      "timestamp": "24/06/2026 00:30",
      "kwh": "48439.58",
      "kvah": "52314.75",
      "voltR": "220"
    }
  ]
}
```

The values and timestamps above are illustrative examples of the portal's observed response format, not a guarantee of the latest available readings. The portal returns the measurement values as strings, and this API preserves them as strings.

- `400 INVALID_METER_ID`: the path parameter is invalid.
- `404 METER_NOT_FOUND`: the meter is not present in the local index.
- `502 INVALID_UPSTREAM_RESPONSE`: the portal response does not match the expected structure.
- `502 UPSTREAM_ERROR`: the portal request fails.

Energy readings returned by the portal during development were timestamped in June 2026. Fetching them now does not imply that the measurements are real-time.

## Run tests

Run the automated test suite:

```bash
npm test
```

Run Vitest in watch mode:

```bash
npm run test:watch
```

The current test suite covers the health endpoint, meter listing, query validation, missing meters, energy retrieval, and upstream failure behavior. The energy tests should be reviewed to ensure their assertions always exercise the intended path.

## Project structure

```text
flock-energy-api/
├── src/
│   ├── app.js                # Express app and API routes
│   ├── app.test.js           # API tests
│   ├── meter.service.js      # Local meter index, search, and lookup
│   ├── portal-client.js      # Portal login and energy requests
│   └── server.js             # Starts the HTTP server
├── scripts/
│   └── test-portal.js        # Manual portal integration check
├── data/
│   └── meter-export.json     # Local meter export snapshot
├── .env.example              # Environment variable template
├── .gitignore
├── openapi.json              # OpenAPI 3.1 specification
├── PROTOCOL.md               # Observed legacy portal behavior
├── package.json
└── README.md
```

Your exact repository may differ slightly as files are added or renamed.

## Architecture and data flow

- **Meter list, search, and details:** served from an in-memory index built from `data/meter-export.json`.
- **Energy readings:** fetched from the portal when the energy endpoint is called.
- **Authentication:** credentials are loaded from environment variables. The portal client obtains a session cookie and keeps it in process memory; the cookie value is not part of API responses.
- **Validation:** Zod validates query parameters, meter IDs, and the expected energy response structure.
- **Read-only behavior:** the integration uses portal login and read endpoints; it does not intentionally perform portal data mutations.

See [`PROTOCOL.md`](./PROTOCOL.md) for observed portal request patterns, response formats, and authentication details. See [`openapi.json`](./openapi.json) for the API contract.

## Assumptions and design choices

- The downloaded meter export is treated as the local source for meter metadata.
- The export can appear as an array or as an object containing a `data` array; the meter service supports both shapes.
- The local meter index is loaded at process startup, so listing and detail requests do not need to call the portal for every request.
- Energy data is requested from the portal on demand rather than stored in the local export.
- Portal timestamps and measurement values are preserved in the format observed. The API does not convert measurement strings or infer units/semantics beyond the field names.
- Portal endpoints and session behavior are implementation details and may change.

## Security

- Keep `.env` out of version control.
- Commit `.env.example` only with placeholder values.
- Never commit passwords, session cookies, tokens, or signing secrets.
- Avoid logging credential or cookie values.
- Use only authorized credentials and keep the portal integration read-only.

## Further improvements

Possible future improvements include refreshing the local meter export on a controlled schedule, more specific upstream error classification, stronger integration tests, and additional validation based on authoritative measurement documentation.
