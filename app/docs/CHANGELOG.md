# Changelog

## v2.0.0 - TypeScript Refactor (2025-11-29)

### 🚀 Major Changes

**TypeScript Migration**
- Converted entire codebase from JavaScript to TypeScript
- Full type safety with strict mode enabled
- Better IDE support and code quality

**Unified SQLite Database**
- Replaced JSON files with a single SQLite database (`data/app.db`)
- Three tables: `links`, `hits`, `ip_blacklist`
- Automatic migration from `links.json` on first startup
- WAL mode enabled for better concurrency

**Built-in Rate Limiting**
- Database-level spam prevention using generated columns
- One hit per IP per link per minute
- `ON CONFLICT DO NOTHING` for zero-overhead deduplication
- No additional dependencies required

**IP Blacklist Feature**
- Block abusive traffic by IP address
- Admin endpoints to manage blacklist
- Optional reason field for documentation
- Hits from blacklisted IPs are logged but not recorded

**Admin Web Interface**
- Clean, modern UI accessible at `http://localhost:3000`
- Tabs for Links, Hits, Blacklist, and Export
- Add/update/delete links with live hit counts
- View recent 100 hits with all tracking data
- Download database or export hits as CSV

### 🔧 Technical Improvements

**Database Schema**
- Indexed columns for fast queries
- Generated `minute_key` column for rate limiting
- Prepared statements for performance
- Timestamp fields for analytics

**Performance**
- Denormalized schema optimized for this use case
- Synchronous inserts (simpler, fast enough for scale)
- O(1) link lookups from database
- SQLite handles ~10k writes/second with WAL mode

**Code Organization**
```
src/
  ├── server.ts    # Main Express server
  └── db.ts        # Database schema and queries
public/
  └── index.html   # Admin web UI
dist/              # Compiled JavaScript
```

### 📝 API Changes

**New Endpoints**
- `GET /admin/hits?limit=100` - View recent hits
- `GET /admin/download/db` - Download entire database
- `GET /admin/blacklist` - List blacklisted IPs
- `POST /admin/blacklist` - Add IP to blacklist
- `DELETE /admin/blacklist/:ip` - Remove from blacklist

**Unchanged Endpoints**
- All existing endpoints remain compatible
- `GET /l/:slug` - Redirects
- `GET /p/:slug` - Tracking pixel
- `POST /admin/links` - Add/update links
- `DELETE /admin/links/:slug` - Delete links
- `GET /admin/stats` - Statistics
- `GET /admin/export/csv` - Export CSV

### 🎯 New Features

**Query Parameter Tracking**
- All URL parameters captured as JSON
- Perfect for UTM tracking (`utm_source`, `utm_campaign`, etc.)
- Stored in `query_params` column
- Queryable with SQLite JSON functions

**Enhanced Logging**
- Rate-limited hits are silently dropped (no spam in logs)
- Blacklisted IPs show `[BLOCKED]` prefix
- Query parameters logged when present

### 🔄 Migration

**Automatic**
- Existing `links.json` is migrated on first startup
- Original file backed up to `links.json.backup`
- Old `hits.json` file no longer used

**Manual Steps**
1. Run `npm install` to get new dependencies
2. Run `npm run build` to compile TypeScript
3. Start with `npm start` - migration happens automatically
4. Old JavaScript files moved to `old_js/` directory

### 📦 New Dependencies

```json
{
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^20.x",
    "@types/express": "^4.x",
    "@types/better-sqlite3": "^7.x",
    "@types/ua-parser-js": "^0.7.x",
    "ts-node": "^10.x"
  }
}
```

### 🎨 Architecture Decisions

**Why unified database?**
- Simpler connection management (one db instance)
- Atomic transactions across tables
- Single file to backup
- Easier deployment

**Why denormalized?**
- Link lookups are already fast
- Most queries aggregate anyway
- Joins wouldn't improve performance
- Simpler code, easier to understand

**Why synchronous inserts?**
- SQLite is fast enough for this scale
- Simpler code (no queue management)
- Rate limiting prevents spam
- Can add async processing later if needed

**Why database-level rate limiting?**
- No Redis or external dependencies
- Zero-overhead (DB constraint does the work)
- Can't be bypassed by code bugs
- Survives restarts automatically

### 🐛 Bug Fixes

- Fixed potential race conditions with batched writes
- Improved IP extraction for proxied requests
- Better error handling throughout

### 📚 Documentation

- New comprehensive README
- SQL query examples in QUERIES.md
- Architecture decisions documented
- Deployment guide included

### ⚠️ Breaking Changes

**None** - All existing API endpoints remain compatible. The only user-facing change is the move from JSON files to SQLite, which happens automatically.

### 🔜 Future Considerations

If you need to scale beyond ~10k hits/second:
- Add a queue (BullMQ, etc.) for async hit processing
- Normalize browser/OS data into lookup tables
- Consider PostgreSQL for better concurrency
- Add read replicas for analytics queries

For now, the current architecture is simple, fast, and maintainable.
