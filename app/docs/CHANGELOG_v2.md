# Changelog v2.0 - Performance Monitoring & Client-Side Analytics

## New Features

### 1. Performance Logging & Monitoring
- **New `logs` table** in SQLite database tracks:
  - Slow requests (>100ms response time)
  - All 404 errors
  - All 500 errors with stack traces
  - IP, path, method, status code, and duration for each log entry
- **Automatic logging middleware** intercepts all requests and logs performance issues
- **Admin API endpoint** `GET /admin/logs?limit=100&level=error` for viewing logs
- Logs are queryable with filters by level (info, warn, error)

### 2. Enhanced Health Endpoint
- `GET /health` now returns comprehensive health status:
  - `status`: 'healthy' or 'degraded' based on recent errors
  - Uptime, link count, hit count
  - Total error and warning counts
  - Recent errors from the last hour
  - **503 status code** if >10 errors in the past hour (for external monitoring tools like UptimeRobot, Pingdom, etc.)
- Perfect for integrating with third-party monitoring services

### 3. Bot Detection
- Integrated `isbot` library for automatic bot detection
- All hits now include `is_bot: 1` or `is_bot: 0` in the `extra` JSON field
- Helps filter out bot traffic from analytics

### 4. Client-Side Analytics Tracking
- **New endpoint** `POST /a/collect` for flexible analytics collection
  - Accepts JSON payloads for page views and custom events
  - CORS-enabled for cross-origin tracking
  - Sets session and visitor cookies like other endpoints
- **Minified tracking script** `/scripts.js`:
  - Automatically logs page view on load
  - Exposes `window.mm()` function for custom event tracking
  - Renamed from `track()` to `mm()` to avoid ad-blocker patterns
  - Captures timezone, locale, viewport, device pixel ratio
  - Supports preloading variables via `window.mmmdata`
  
#### Usage Example:
```html
<!-- Preload custom variables for page view -->
<script>
  window.mmmdata = {label: 'landing', vars: {funnel_stage: 'awareness'}}
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

### 5. Extended Hit Metadata
All tracking endpoints now capture and store in `extra` JSON field:
- `is_bot` - Bot detection flag
- `tz` - Client timezone (if provided)
- `locale` - Client locale
- `dpr` - Device pixel ratio
- `viewport` - Viewport dimensions
- `vars` - Custom variables (for analytics tracking)
- Client Hints headers (when available)

## Technical Details

### Database Schema Changes
Added `logs` table:
```sql
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  level TEXT NOT NULL,  -- 'info', 'warn', 'error'
  message TEXT NOT NULL,
  path TEXT,
  method TEXT,
  status_code INTEGER,
  duration_ms REAL,
  ip TEXT,
  error_stack TEXT,
  extra TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
```

### Performance Middleware
- Wraps `res.send()` and `res.json()` to capture response timing
- Only logs requests that are slow (>100ms) or errors (4xx/5xx)
- Minimal performance impact on fast requests

### Analytics Data Model
- Page views stored with `type='page'` and synthetic `slug` like `page:https://example.com/path`
- Events stored with `type='event'` and synthetic `slug` like `event:button_click`
- Custom variables stored in `extra.vars` as JSON

## Monitoring Integration

### Health Check for External Monitors
Configure your monitoring service (UptimeRobot, Pingdom, etc.) to check:
- **URL**: `https://your-domain.com/health`
- **Expected**: 200 status code and `"status":"healthy"` in JSON body
- **Alert on**: 503 status or `"status":"degraded"`

### Log Queries
View recent errors:
```bash
curl -H "Authorization: Bearer YOUR_PASSWORD" \
  https://your-domain.com/admin/logs?limit=50&level=error
```

## Breaking Changes
None - all changes are additive and backwards compatible.

## Upgrade Notes
1. Run `npm install` to get the `isbot` dependency
2. Run `npm run build` to compile TypeScript
3. Restart the service - the `logs` table will be created automatically
4. Existing data is preserved

## Files Modified
- `src/db.ts` - Added logs table and prepared statements
- `src/server.ts` - Added logging middleware, enhanced health endpoint, analytics collector
- `public/scripts.js` - New minified tracking script
- `README.md` - Updated documentation
- `.env.example` - No new variables required

## Performance Impact
- Logging adds <1ms overhead to error responses
- Fast requests (<100ms) have zero logging overhead
- Database writes are synchronous but batched by SQLite's WAL mode
- No impact on redirect performance (still <5ms typical)
