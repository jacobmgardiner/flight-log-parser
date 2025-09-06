# DJI Flight Parser Server

A tiny HTTP service that accepts a **DJI TXT flight log** upload and streams back the JSON produced by DJI’s official **FlightRecordParsingLib** (`FRSample`). This repo ships a single container that includes both the HTTP server and the compiled DJI parser. It uses DJI’s official parser binary under the hood and streams its stdout to the client. It's runnable via Docker or Docker Compose (pull prebuilt image or build locally).

> You need a DJI **App Key** from the DJI developer portal. The parser uses this key (as the official sample does) to decrypt the TXT file.

---

## Requirements

* Docker (and optionally Docker Compose)
* DJI App Key (`SDK_KEY`)

---

## Quick Start (use prebuilt image)

1. Create a `.env` file next to `docker-compose.yml`:

```ini
SDK_KEY=YOUR_DJI_APP_KEY
PORT=8787
# Optional tuning
# MAX_CONCURRENCY=2
# PARSE_TIMEOUT_MS=180000
# RATE_WINDOW_MS=60000
# RATE_MAX=30
# TRUST_PROXY=1
```

1. Start the service:

```bash
docker compose up -d
```

1. Parse a log (example):

```bash
curl -F "file=@/path/to/DJIFlightRecord.txt" http://localhost:8787/parse > out.json
```

1. Health check:

```bash
curl http://localhost:8787/healthz
```

---

## Development (build locally)

If you’re modifying the Dockerfile or want to pin a different DJI repo ref during the build, use the dev compose file which **builds** the image locally.

```bash
# Optionally pin the DJI repo ref used in the build stage
# (tag or commit SHA)
echo "DJI_REF=v1.0.6" >> .env

# Build & run
docker compose -f docker-compose.dev.yml up --build
```

The multi-stage Dockerfile will clone DJI’s repo at `DJI_REF`, build `FRSample`, and then assemble the runtime image with the compiled binary plus the server.

---

## API

### `POST /parse`

* **Content-Type**: `multipart/form-data`
* **Field**: `file=@/path/to/DJIFlightRecord.txt`
* **Response**: `application/json` (streamed)

**Errors**

* `400` — missing file
* `429` — too many requests (rate limited)
* `500` — parser error or `SDK_KEY` not set

**Example**

```bash
curl -F "file=@DJIFlightRecord_2025-09-01_10-00-00.txt" \
  http://localhost:8787/parse \
  | jq '.'
```

### `GET /healthz`

* Returns `200 OK` with body `ok`.

---

## Configuration

All configuration is via environment variables. See `.env.example`.

| Var                | Default  | Description                                     |
|--------------------|----------|-------------------------------------------------|
| `SDK_KEY`          | (none)   | **Required** DJI App Key                        |
| `PORT`             | `8787`   | Host port to expose                             |
| `MAX_CONCURRENCY`  | `2`      | Max concurrent parses (processes)               |
| `PARSE_TIMEOUT_MS` | `180000` | Kill a parse that runs longer than this         |
| `RATE_WINDOW_MS`   | `60000`  | Rate-limit window per IP (ms)                   |
| `RATE_MAX`         | `30`     | Allowed requests per window per IP              |
| `TRUST_PROXY`      | `1`      | `app.set('trust proxy', N)` for proper IPs      |
| `DJI_REF`          | `v1.0.6` | **Build-time** (dev compose only): DJI repo ref |

---

## How it works

* The server uses `multer` to stream uploads to `/tmp` (no memory buffering), then spawns `FRSample` with the file path.
* Parser stdout is **piped** directly to the HTTP response. Stderr is logged.
* A small in-process semaphore limits concurrent parses; a timeout kills long-running parses.
* Basic rate limiting is applied per client IP.

---

## Compose files

* **`docker-compose.yml`** — production: pulls the prebuilt image from the registry.
* **`docker-compose.dev.yml`** — development: builds the image locally from the Dockerfile.

Place both files at the repo root. Create your `.env` next to them.

---

## Security notes

* The container expects `SDK_KEY` at **runtime** (not baked into the image).
* Consider placing this behind a reverse proxy and adding authentication if you plan to expose it publicly.

---

## Compliance & Notices

- This server uses DJI’s official **FlightRecordParsingLib** to parse TXT logs.
- **API Key**: Do not share your DJI API key. Provide it at runtime via `SDK_KEY`. Your key may not be shared with third parties; use it solely to provide _your service_. [DJI API License]
- **Distribution**: You may distribute SDK **object code** inside your app/container, not SDK source. Include DJI’s copyright notice in your source. [DJI Developer Policy]
- **Privacy**: Provide a privacy policy and a deletion path for user data. See `PRIVACY.md`. [DJI Developer Policy]
- **Not affiliated**: This project is not affiliated with DJI. “DJI” and the DJI logo are trademarks of SZ DJI Technology Co., Ltd.

See also: `NOTICE`, `/licenses/*` in the image.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Acknowledgements

* DJI’s official [FlightRecordParsingLib](https://github.com/dji-sdk/FlightRecordParsingLib) for the binary parser.
