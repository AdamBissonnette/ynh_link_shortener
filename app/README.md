# Link Shortener

A high-performance link shortening and pixel tracking service built with **TypeScript**, **Node.js**, **Express**, and **SQLite**. Features include rate limiting, IP blacklisting, UTM parameter tracking, and a clean admin web interface.

## Features

✅ **Ultra-fast redirects** - O(1) lookups with in-memory caching  
✅ **Built-in rate limiting** - Prevents spam with per-IP-per-minute deduplication  
✅ **IP blacklisting** - Block abusive traffic  
✅ **UTM parameter tracking** - Capture query parameters for attribution analysis  
✅ **Session & visitor tracking** - Long-lived cookies for attribution across sessions  
✅ **Bot detection** - Automatic bot identification via `isbot` library  
✅ **Client-side analytics** - Lightweight tracking script for page views and events  
✅ **Performance logging** - Automatic monitoring of slow requests, 404s, and 500 errors  
✅ **Enhanced health endpoint** - Reports service health with error monitoring for external monitoring tools  
✅ **API tokens** - Scoped programmatic access for external integrations  
✅ **Web admin interface** - Manage links, view hits, export data  
✅ **TypeScript** - Full type safety and better code quality  
✅ **SQLite database** - Single file, zero configuration  
✅ **Pixel tracking** - Transparent 1x1 tracking pixel endpoint

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env to set PORT, ADMIN_PASSWORD, ALLOWED_ADMIN_IPS

# Build TypeScript
npm run build

# Start server
npm start

# Or run in development mode with auto-reload
npm run dev
```

Then open `http://localhost:3000/derp` (or your configured `ADMIN_PATH`) to access the admin interface.

## Documentation

- **[Quick Start Guide](docs/QUICKSTART.md)** - Detailed setup instructions
- **[Production Deployment](docs/PRODUCTION.md)** - Complete production checklist and best practices
- **[Security Guide](docs/SECURITY.md)** - Input validation, authentication, and best practices
- **[Analytics Queries](docs/QUERIES.md)** - SQL examples for analyzing your data
- **[Changelog](docs/CHANGELOG.md)** - Version history and changes

## Production Deployment

Before deploying to production, ensure you:

1. **Change default password**: Set a strong `ADMIN_PASSWORD` in `.env`
2. **Restrict admin IPs**: Set `ALLOWED_ADMIN_IPS` to specific trusted IPs
3. **Enable secure cookies**: Set `COOKIE_SECURE=true` when behind HTTPS
4. **Configure rate limiting**: Set `RATE_LIMIT_WINDOW` (in seconds, 0 to disable)
5. **Set up monitoring**: Point external monitoring at `/health` endpoint
6. **Enable HTTPS**: Use a reverse proxy (Caddy/Nginx) with TLS
7. **Backup database**: Regularly backup `data/app.db`
8. **Use systemd/pm2**: Set up automatic restart on failure

See [docs/SECURITY.md](docs/SECURITY.md) for detailed production best practices.

## Architecture

### Unified SQLite Database

All data is stored in a single SQLite database (`data/app.db`) with three tables:

**`links`** - Link mappings
- `slug` (PRIMARY KEY) - Short link identifier
- `destination` - Target URL
- `created_at`, `updated_at` - Timestamps

**`hits`** - Analytics data
- `id` - Auto-incrementing primary key
- `type` - 'redirect' or 'pixel'
- `slug` - Link that was accessed
- `ip`, `user_agent`, `browser`, `os`, `device` - Client info
- `referer`, `accept_language` - Request headers
- `query_params` - JSON string of URL parameters (UTM tracking, etc.)
- `timestamp`, `created_at` - Timestamps
- `minute_key` (UNIQUE) - Generated column for rate limiting

**`ip_blacklist`** - Blocked IPs
- `ip` (PRIMARY KEY) - IP address to block
- `reason` - Optional description
- `created_at` - Timestamp

**`api_tokens`** - External API access tokens
- `id` - Auto-incrementing primary key
- `name` - Human-readable token name
- `token` - Unique token string
- `scopes` - Comma-separated scope list
- `created_at`, `last_used_at` - Timestamps

**`logs`** - Performance and error monitoring
- `id` - Auto-incrementing primary key
- `timestamp` - ISO timestamp
- `level` - 'info', 'warn', or 'error'
- `message` - Log message
- `path`, `method`, `status_code` - Request details
- `duration_ms` - Request duration (for slow requests >100ms)
- `ip` - Client IP
- `error_stack` - Stack trace (for 500 errors)
- `extra` - JSON field for additional context
- `created_at` - Timestamp

### Rate Limiting

The `hits` table includes a **generated column** `minute_key` that creates a unique constraint on `(ip, slug, minute)`. This prevents spam by allowing only **one hit per IP per link per minute**.

Duplicate hits within the same minute are silently dropped via `ON CONFLICT DO NOTHING`, so the service remains fast even under spam attacks.

### Performance Considerations

**Why denormalized?**
- Link lookups are O(1) from the database
- Hit inserts are fast with prepared statements
- Most queries aggregate data anyway, so joins wouldn't help
- SQLite with WAL mode handles ~10,000 writes/second

**Why synchronous inserts?**
- For this scale, sync inserts are fine and simpler
- Rate limiting prevents spam from overwhelming the system
- If you need async processing later, add a queue (e.g., BullMQ)

**Why combined database?**
- Simpler connection management
- Atomic transactions across config and analytics
- Single file to backup

## API Endpoints

### Public Endpoints

**`GET /`** - Redirects to `ROOT_REDIRECT` (configurable)

**`GET /l/:slug`** - Redirect to destination URL (tracked)

**`GET /p/:slug`** - 1x1 transparent tracking pixel

**`POST /a/collect`** - Flexible analytics endpoint (no redirect)
- Accepts JSON payloads for page views and custom events
- Sets session and visitor cookies like other tracking endpoints
- CORS enabled for cross-origin requests
- See "Client-Side Analytics" section below for usage

**`GET /scripts.js`** - Lightweight client-side tracking script
- Minified JavaScript that automatically logs page views
- Exposes `window.mm()` for custom event tracking
- Captures timezone, locale, viewport, DPR, and custom variables

**`GET /health`** - Enhanced health check with error monitoring
- Returns `status: 'healthy'` or `'degraded'` based on recent errors
- Includes link/hit counts, uptime, error/warning totals
- Lists recent errors from the last hour
- Returns 503 status if >10 errors in the past hour (for external monitoring)

Unknown paths (for HTML clients) redirect to `NOT_FOUND_REDIRECT`. JSON clients receive a 404 JSON.
500 errors return a friendly HTML error page for browsers and JSON for API clients.

### Admin Endpoints (require Bearer token auth)

**`GET /admin/links`** - List all links with hit counts

**`POST /admin/links`** - Add or update a link
```json
{ "slug": "example", "destination": "https://example.com" }
```

**`DELETE /admin/links/:slug`** - Delete a link

**`GET /admin/hits?limit=100`** - Get recent hits

**`GET /admin/stats?slug=X&type=Y`** - Aggregated statistics

**`GET /admin/export/csv?slug=X&type=Y`** - Export hits as CSV

**`GET /admin/download/db`** - Download entire database

### API Tokens (programmatic access)
- `GET /admin/tokens` - List tokens
- `POST /admin/tokens` - Create token `{ name, scopes: [links|hits|blacklist|export] }`
- `DELETE /admin/tokens/:id` - Revoke token

Use tokens with the external API via `Authorization: Bearer <token>` or `?access_token=...`.

### Token-protected API
- `GET /api/links` (scope: links)
- `POST /api/links` (scope: links)
- `DELETE /api/links/:slug` (scope: links)
- `GET /api/hits?limit=100&slug=&type=` (scope: hits)
- `GET /api/stats?slug=&type=` (scope: hits)
- `GET /api/blacklist` (scope: blacklist)
- `POST /api/blacklist` (scope: blacklist)
- `DELETE /api/blacklist/:ip` (scope: blacklist)
- `GET /api/export/csv` (scope: export)

**`GET /admin/blacklist`** - List blacklisted IPs

**`POST /admin/blacklist`** - Add IP to blacklist
```json
{ "ip": "1.2.3.4", "reason": "Spam" }
```

**`DELETE /admin/blacklist/:ip`** - Remove IP from blacklist

**`GET /admin/logs?limit=100&level=error`** - View performance and error logs
- Automatically logs slow requests (>100ms), 404s, and 500 errors
- Filter by `level` (info, warn, error)

## Admin Web Interface

Access the admin UI at `http://localhost:3000/derp` (configurable via `ADMIN_PATH`) after starting the server.

Features:
- **Links Tab** - Add, update, and delete links with hit counts
- **Recent Hits Tab** - View the latest 100 hits with all tracking data
- **IP Blacklist Tab** - Manage blocked IPs
- **API Tokens Tab** - Generate and revoke API tokens for external access
- **Export Tab** - Download hits as CSV or download the entire database

## Client-Side Analytics

The service includes a lightweight tracking script (`/scripts.js`) for embedding on your own pages:

```html
<!-- Optional: preload variables for initial page view -->
<script>
  window.mmmdata = {label: 'landing', vars: {funnel_stage: 'awareness', plan: 'free'}}
</script>

<!-- Load tracking script -->
<script src="https://your-domain.com/scripts.js" async></script>

<!-- Track custom events -->
<script>
  mm('event', { 
    label: 'button_click', 
    vars: { category: 'nav', button_id: 'signup' } 
  });
</script>
```

**Features:**
- Automatic page view tracking on load
- Session and visitor cookies for attribution
- Bot detection via `isbot`
- Captures timezone, locale, viewport size, and device pixel ratio
- Custom variables via `window.mmmdata` or per-event `vars`
- Renamed to `mm()` to reduce ad-blocker interference

**Data captured:**
- All hits are stored in the `hits` table with `type='page'` or `type='event'`
- The `slug` field contains a synthetic identifier (e.g., `page:https://...` or `event:button_click`)
- Custom variables are stored in the `extra` JSON field under the `vars` key

## UTM Tracking & Attribution

All query parameters are automatically captured and stored as JSON in the `query_params` column. This is perfect for UTM tracking:

```
http://localhost:3000/l/signup?utm_source=twitter&utm_campaign=launch
```

Query the data with SQLite:
```sql
-- Count conversions by UTM source
SELECT 
  json_extract(query_params, '$.utm_source') as source,
  COUNT(*) as count
FROM hits 
WHERE query_params IS NOT NULL
GROUP BY source
ORDER BY count DESC;
```

See `QUERIES.md` for more analytics query examples.

## Configuration

Environment variables in `.env`:

```bash
PORT=3000
ADMIN_PASSWORD=changeme
ALLOWED_ADMIN_IPS=127.0.0.1,192.168.1.100
ADMIN_PATH=/derp                   # Admin UI path
ROOT_REDIRECT=https://example.com  # Where '/' redirects
NOT_FOUND_REDIRECT=https://example.com # Unknown paths (HTML clients) redirect here
SESSION_WINDOW_MIN=30              # Session cookie window (minutes)
USER_COOKIE_MAX_DAYS=730           # Long-lived user cookie lifetime (days)
COOKIE_SECURE=false                # Set 'true' in production behind HTTPS
# Use '*' for development only
```

## Development

```bash
# Run with auto-reload
npm run dev

# Build TypeScript
npm run build

# Watch mode
npm run dev:watch
```

## Deployment

1. Set a strong `ADMIN_PASSWORD` in `.env`
2. Restrict `ALLOWED_ADMIN_IPS` to trusted addresses
3. Use a reverse proxy (nginx/Caddy) with HTTPS
4. Firewall the Node.js port (only allow reverse proxy)
5. Set up a systemd service for auto-restart
6. Regularly backup `data/app.db`

Example systemd service:
```ini
[Unit]
Description=Link Shortener
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/link_shortener
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
```

## Project Structure

```
.
├── src/
│   ├── server.ts       # Main Express server
│   └── db.ts           # Database schema and prepared statements
├── public/
│   └── index.html      # Admin web interface
├── data/
│   └── app.db          # SQLite database (auto-created)
├── dist/               # Compiled JavaScript (auto-generated)
├── tsconfig.json       # TypeScript configuration
├── package.json        # Dependencies and scripts
├── QUERIES.md          # Example SQL queries for analytics
└── README.md           # This file
```

## Migration from JavaScript

If you have an existing `data/links.json` file, it will be automatically migrated to the database on first startup and backed up to `data/links.json.backup`.

The old `hits.json` file is no longer used - hits are now stored in the database with improved rate limiting.

## License

MIT
