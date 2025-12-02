# Quick Reference

## Commands

```bash
# Development
npm run dev              # Run with ts-node (faster iteration)
npm run dev:watch        # Run with auto-reload

# Production
npm run build            # Compile TypeScript to dist/
npm start                # Build and start server

# Admin UI
open http://localhost:3000/derp
```

## Environment

```bash
# .env file
PORT=3000
ADMIN_PASSWORD=changeme
ALLOWED_ADMIN_IPS=*     # Use specific IPs in production!
ADMIN_PATH=/derp
ROOT_REDIRECT=https://example.com
NOT_FOUND_REDIRECT=https://example.com
```

## Quick API Examples

```bash
# Add a link
curl -X POST http://localhost:3000/admin/links \
  -H "Authorization: Bearer changeme" \
  -H "Content-Type: application/json" \
  -d '{"slug": "gh", "destination": "https://github.com"}'

# List links
curl http://localhost:3000/admin/links \
  -H "Authorization: Bearer changeme"

# Use link with UTM params
curl http://localhost:3000/l/gh?utm_source=twitter

# View recent hits
curl http://localhost:3000/admin/hits?limit=10 \
  -H "Authorization: Bearer changeme"

# Blacklist an IP
curl -X POST http://localhost:3000/admin/blacklist \
  -H "Authorization: Bearer changeme" \
  -H "Content-Type: application/json" \
  -d '{"ip": "1.2.3.4", "reason": "Spam"}'

# Export CSV
curl http://localhost:3000/admin/export/csv \
  -H "Authorization: Bearer changeme" > hits.csv

# Download database
curl http://localhost:3000/admin/download/db \
  -H "Authorization: Bearer changeme" > backup.db
```

## Database Queries

```bash
# Open database
sqlite3 data/app.db

# View all tables
.tables

# Count hits by slug
SELECT slug, COUNT(*) as hits 
FROM hits 
GROUP BY slug 
ORDER BY hits DESC;

# UTM source attribution
SELECT 
  json_extract(query_params, '$.utm_source') as source,
  COUNT(*) as count
FROM hits 
WHERE query_params IS NOT NULL
GROUP BY source;

# Recent hits with details
SELECT 
  timestamp, 
  slug, 
  ip, 
  referer, 
  query_params 
FROM hits 
ORDER BY created_at DESC 
LIMIT 10;
```

## Project Structure

```
link_shortener/
├── src/
│   ├── server.ts          # Main Express app
│   └── db.ts              # Database schema & queries
├── public/
│   └── index.html         # Admin web UI
├── data/
│   └── app.db             # SQLite database (auto-created)
├── dist/                  # Compiled JS (git-ignored)
└── .env                   # Environment config (git-ignored)
```

## Key Features

🔹 **Rate Limiting** - 1 hit per IP per link per minute (database-enforced)  
🔹 **IP Blacklist** - Block traffic from specific IPs  
🔹 **UTM Tracking** - All query params captured as JSON  
🔹 **Admin UI** - Full CRUD + analytics at http://localhost:3000  
🔹 **TypeScript** - Full type safety, better DX  
🔹 **SQLite** - Zero-config, single-file database

## Architecture Decisions

**Denormalized schema** - Faster for this use case, no joins needed  
**Synchronous inserts** - SQLite is fast enough, simpler code  
**Database rate limiting** - Zero-overhead via unique constraints  
**Combined database** - Links + hits + config in one file

## Performance

- **~10k writes/sec** with SQLite WAL mode
- **<5ms redirect latency** with prepared statements
- **Rate limiting** prevents spam from overwhelming system
- **No external dependencies** (no Redis, no message queue)

## Troubleshooting

**Can't access admin UI?**
- Check `ALLOWED_ADMIN_IPS` in .env (use `*` for dev)
- Verify password in .env matches Authorization header

**Links not migrating from JSON?**
- Check `data/links.json` exists
- Look for `links.json.backup` (migration completed)
- Check server logs for migration messages

**Rate limiting too aggressive?**
- Edit `src/db.ts` and change minute_key formula
- Rebuild with `npm run build`

**Need to scale?**
- Add async queue (BullMQ) for hit processing
- Consider PostgreSQL for higher concurrency
- Add read replicas for analytics queries

## Security Checklist

✅ Change `ADMIN_PASSWORD` from default  
✅ Set specific IPs in `ALLOWED_ADMIN_IPS` (not `*`)  
✅ Use HTTPS reverse proxy (nginx/Caddy)  
✅ Firewall Node.js port (only allow proxy)  
✅ Regular backups of `data/app.db`  
✅ Monitor logs for suspicious activity

## Useful Links

- README.md - Full documentation
- QUERIES.md - SQL query examples
- CHANGELOG.md - Version history and migration guide
- admin-cli.sh - CLI tool for managing links
