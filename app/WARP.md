# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

A high-performance link shortening and pixel tracking service built with Node.js and Express. The service uses in-memory Maps for ultra-fast O(1) lookups with persistent JSON storage and batched writes to balance performance with data durability.

## Common Commands

### Setup
```bash
npm install
cp .env.example .env
# Edit .env to configure PORT, ADMIN_PASSWORD, and ALLOWED_ADMIN_IPS
```

### Running the Service
```bash
# Production mode
npm start

# Development mode with auto-reload
npm run dev
```

### Using the Admin CLI
The `admin-cli.sh` script provides a convenient interface to the admin API:
```bash
# Make it executable first
chmod +x admin-cli.sh

# Set environment variables (optional)
export API_URL=http://localhost:3000
export ADMIN_PASSWORD=changeme

# Commands
./admin-cli.sh add <slug> <destination>
./admin-cli.sh remove <slug>
./admin-cli.sh list
./admin-cli.sh stats [slug]
./admin-cli.sh export [slug] [output-file]
./admin-cli.sh health
```

**Note:** The CLI requires `jq` for JSON parsing. Install with `brew install jq` on macOS.

### Testing Admin Endpoints Manually
```bash
# Add a link
curl -X POST http://localhost:3000/admin/links \
  -H "Authorization: Bearer changeme" \
  -H "Content-Type: application/json" \
  -d '{"slug": "test", "destination": "https://example.com"}'

# List links
curl http://localhost:3000/admin/links \
  -H "Authorization: Bearer changeme"

# Get stats
curl http://localhost:3000/admin/stats \
  -H "Authorization: Bearer changeme"
```

## Architecture

### Data Flow
1. **Link Lookup**: Request → In-memory Map lookup (O(1)) → 302 redirect or 404
2. **Tracking**: All accesses create hit records with IP, UA parsing, referrer, timestamp
3. **Persistence**: Links saved immediately; hits batched every 5 seconds to avoid I/O blocking

### Key Components

#### In-Memory Storage
- **`links` Map**: Stores slug → destination mappings for instant redirects
- **`hits` Array**: Accumulates tracking data before batch writes
- Both are loaded from JSON files on startup and persisted back to disk

#### Request Processing
- **IP Extraction** (`getClientIP`): Respects `X-Forwarded-For` and `X-Real-IP` headers for proxy compatibility
- **User Agent Parsing** (`parseUserAgent`): Uses `ua-parser-js` to extract browser, OS, and device type
- **Hit Tracking** (`trackHit`): Creates comprehensive analytics records and logs to console

#### Admin Security
- **Password Protection**: Bearer token authentication via `Authorization` header
- **IP Whitelisting**: Restricts admin endpoints to specified IPs (configurable in `.env`)
- Both checks must pass in `authAdmin` middleware

#### Batched Writes
The `saveHits()` function uses a debounced setTimeout pattern to batch writes every 5 seconds. This prevents disk I/O from blocking the event loop while ensuring data durability.

### Storage Schema

#### `data/links.json`
```json
{
  "slug1": "https://destination1.com",
  "slug2": "https://destination2.com"
}
```

#### `data/hits.json`
Array of hit objects:
```json
[
  {
    "type": "redirect",
    "slug": "example",
    "ip": "192.168.1.1",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "userAgent": "Mozilla/5.0...",
    "browser": "Chrome 120",
    "os": "Mac OS 14",
    "device": "desktop",
    "referer": "https://source.com",
    "acceptLanguage": "en-US,en;q=0.9"
  }
]
```

### Endpoints

#### Public Endpoints
- `GET /l/:slug` - Link redirect (tracked)
- `GET /p/:slug` - 1x1 transparent tracking pixel
- `GET /health` - Health check (returns link count and hit count)

#### Admin Endpoints (require auth)
- `POST /admin/links` - Add/update link
- `DELETE /admin/links/:slug` - Remove link
- `GET /admin/links` - List all links with hit counts
- `GET /admin/stats?slug=X&type=Y` - Aggregated statistics
- `GET /admin/export/csv?slug=X&type=Y` - Export hits as CSV

## Development Guidelines

### Performance Considerations
- The service is optimized for minimal latency (<5ms typical redirect time)
- All link lookups use in-memory Maps (O(1) access)
- Hit writes are batched to prevent I/O blocking
- Keep dependencies minimal to reduce overhead

### Making Changes

#### Adding New Fields to Hits
When adding new tracking fields, update:
1. The `trackHit()` function to capture the data
2. CSV export headers and row mapping in `/admin/export/csv` endpoint
3. Consider adding aggregation in `/admin/stats` endpoint

#### Adding New Admin Endpoints
Follow the existing pattern:
1. Add `authAdmin` middleware to protect the route
2. Return consistent JSON format: `{success: true, data: ...}` or `{error: "message"}`
3. Update the admin CLI script if appropriate

#### Modifying Persistence
The batched write pattern in `saveHits()` is critical for performance. If changing persistence:
- Maintain the debounce pattern to avoid excessive disk writes
- Ensure data is persisted on graceful shutdown (consider adding SIGTERM handler)
- Test with high traffic to verify no data loss

### Environment Configuration
Always use `.env` for configuration (never commit `.env`):
- `PORT` - Server port (default: 3000)
- `ADMIN_PASSWORD` - Required for admin API access (change from default!)
- `ALLOWED_ADMIN_IPS` - Comma-separated IPs (use `*` only for development)

### Deployment
For production deployments:
1. Set strong `ADMIN_PASSWORD` in `.env`
2. Restrict `ALLOWED_ADMIN_IPS` to specific trusted addresses
3. Use reverse proxy (nginx/Apache) with HTTPS
4. Firewall the Node.js port (only allow reverse proxy)
5. Set up systemd service for auto-restart (see README for example config)
6. Regularly backup `data/` directory
