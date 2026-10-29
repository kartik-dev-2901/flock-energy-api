# Legacy Portal Protocol Notes

## Purpose

This document records the behavior observed while inspecting the legacy Urja Meter Ops portal at `https://urja-ops.flockenergy.tech`. It describes the requests used by the current API integration and distinguishes verified observations from assumptions.

The portal was inspected in read-only fashion. No write or mutation operations are part of this integration.

## Authentication

### Observed login flow

- Login request: `POST /login`
- Form encoding: `application/x-www-form-urlencoded`
- Observed form fields: `email`, `password`
- The successful browser request returned HTTP `200 OK`.
- The response body was a JSON redirect object similar to:

  ```json
  {
    "type": "redirect",
    "status": 303,
    "location": "/meters"
  }
  ```

- The response set a session cookie named `__Secure-better-auth.session_token`.
- Observed cookie attributes included `Path=/`, `HttpOnly`, `Secure`, `SameSite=Lax`, and `Max-Age=3600`.
- The browser's login request included `Origin`, `Referer`, and `X-SvelteKit-Action: true` headers.

### Integration behavior

The Node.js portal client submits the login form, extracts the session cookie from the response, and sends it with subsequent portal requests. The cookie value is kept in process memory and must not be committed, logged, or documented.

A session can expire. The client attempts to log in again if an energy request receives HTTP `401` or `403`, then retries the energy request once.

### Security notes

- Portal credentials are configured through environment variables, not hardcoded in source files.
- `.env` must remain untracked by Git; `.env.example` should contain placeholders only.
- Do not copy browser cookies, passwords, tokens, or signing secrets into source code, documentation, issue reports, or logs.
- The portal's `keys` response was not used for authentication or integration.

## Meter listing and search

### Observed request

- Request: `GET /portal/meters/search?q=&page=1`
- An HTTP `200 OK` response was observed.
- The endpoint accepts `q` and `page` query parameters.
- The portal UI showed 403 meters during inspection.

Observed meter fields included:

- `meterId`
- `serialNo`
- `make`
- `phaseType`
- `installStatus`
- `dtCode`

Some portal records may expose status fields with different names; source values should be preserved rather than guessed or silently rewritten.

### Local index

The assignment's meter export was downloaded through the portal UI. The export response was observed in the form:

```json
{
  "data": ["... meter records ..."],
  "total": 403
}
```

The downloaded local JSON file was also encountered as an array of meter records, so the service accepts either a top-level array or an object containing a `data` array.

Each exported meter record observed included fields such as:

- `meterId`, `serialNo`, `make`, `phaseType`
- `installStatus`, `installType`, `build`, `dtCode`
- `hierarchy`, containing zone, circle, division, subdivision, substation, feeder, and DT objects
- `geo`, containing numeric `lat` and `lng` values

The API currently loads this export as a local in-memory index for meter listing, search, and detail lookup. It does not query the portal for each list or detail request.

The exported dataset contained 403 records at the time of inspection. This is a snapshot, not a guarantee that the portal will always contain exactly 403 meters.

## Meter detail data

### Observed page and data request

- A detail page was opened at `/meters/J100000`.
- The associated SvelteKit data request used a path similar to `/meters/J100000/__data.json?x-sveltekit-invalidated=001`.
- The response used SvelteKit's compact reference-array serialization rather than a plain, conventional JSON object.

Observed detail fields included `meterId`, `serialNo`, `make`, `phaseType`, `installStatus`, `installType`, and hierarchy information such as zone, circle, division, subdivision, substation, feeder, and DT.

Because the SvelteKit data response is framework-specific, the API uses the exported meter dataset for detail lookup instead of depending on that internal serialization.

## Energy readings

### Observed request

- Request pattern: `GET /portal/meters/{meterId}/energy`
- A successful request for meter `J100000` returned HTTP `200 OK`.
- The response contained a `data` array.
- Each observed reading had these fields:

  - `timestamp`: string, for example `24/06/2026 00:00`
  - `kwh`: string representing a numeric value
  - `kvah`: string representing a numeric value
  - `voltR`: string representing a numeric value

- The displayed readings were at regular intervals in the examples inspected, including 30-minute intervals.
- The values appeared to be cumulative for `kwh` and `kvah`, but this interpretation has not been independently verified. The API preserves the portal's values rather than asserting a stronger meaning.
- The returned timestamps observed during testing were from June 2026. Successful retrieval means the portal returned the readings; it does not establish that the measurements are real-time.

### API integration behavior

The API fetches energy readings from the portal when the energy endpoint is requested. Unlike meter listing and detail lookup, energy readings are not sourced from the local meter export.

The API validates the expected response structure before returning readings. An unexpected upstream structure or failed portal request is returned to API clients as an upstream error rather than exposing portal internals.

## Geographic data

### Observed request

- Request pattern: `GET /portal/meters/{meterId}/geo`
- A successful request for meter `J100000` returned HTTP `200 OK`.
- The response contained `data.latitude` and `data.longitude` as strings.

The meter export also contained a `geo` object with numeric `lat` and `lng` values. The current API can use the export's coordinates for local meter metadata. The separate geo endpoint has been inspected but is not currently required by the implemented API routes.

## Export behavior

The portal UI's “Export all meters” action displayed a confirmation indicating that 403 meters had been exported. The related network request used a path including `export?page=1` and returned HTTP `200 OK`.

The response observed in Network was an object containing `data` and `total`; the downloaded JSON file used by the local service was also observed in array form. The service accommodates both shapes.

The export is treated as a read-only snapshot. Refreshing the snapshot is a manual operation in the current implementation.

## Current API design decisions

- Meter listing, search, and detail lookup use a local in-memory index built from the export.
- Energy readings are fetched from the portal on demand.
- Portal authentication and cookie handling are isolated in `src/portal-client.js`.
- Portal credentials and session cookie values are not returned to API consumers.
- Input and upstream response validation are applied at the API boundary.
- The implementation avoids depending on the portal's SvelteKit internal page-data serialization for normal meter detail responses.
- The API does not perform write operations against the portal.

## Verification summary

The following behavior was verified during development:

- Browser login succeeds and sets a session cookie.
- The meter search endpoint returns JSON and the portal UI showed 403 meters.
- The meter export contains the observed meter metadata and hierarchy.
- The meter detail page exposes additional hierarchy and installation information.
- The geo endpoint returns latitude and longitude.
- The energy endpoint returns timestamped readings for a meter.
- The Node.js client successfully logged in and fetched energy readings for `J100000`.
- The Express energy route returned those readings through the local API.
- The initial automated API test suite passed six tests; the energy tests should be strengthened to avoid conditional assertions before final submission.
