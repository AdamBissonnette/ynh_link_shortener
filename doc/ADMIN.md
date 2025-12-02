## Admin Access

After installation, access the admin interface at:

```
https://your-domain.com/derp
```

(Or whatever admin path you specified during installation)

## Admin Authentication

The admin interface is protected by:
- Bearer token authentication (password you set during installation)
- The admin web UI prompts for this password

## Managing Links

### Via Web Interface
- Navigate to the admin UI
- Use the "Links" tab to:
  - Add new short links
  - Update existing destinations
  - Delete links
  - View hit counts

### Via API
You can also manage links programmatically using the admin API with bearer token authentication:

```bash
# Add/update a link
curl -X POST https://your-domain.com/admin/links \
  -H "Authorization: Bearer YOUR_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"slug":"example","destination":"https://example.com"}'

# List all links
curl https://your-domain.com/admin/links \
  -H "Authorization: Bearer YOUR_PASSWORD"
```

## API Tokens

For external integrations, create scoped API tokens instead of using your admin password:

1. Go to the "API Tokens" tab in the admin UI
2. Create a token with specific scopes (links, hits, blacklist, export)
3. Use the token in your external applications

## Database Backup

The SQLite database is located at:
```
/var/www/link_shortener/data/app.db
```

It's included in YunoHost backups automatically. You can also download it directly from the admin interface "Export" tab.

## Viewing Analytics

- **Recent Hits**: See the last 100 hits with full details
- **Stats**: Aggregated statistics by slug or type
- **Export**: Download all data as CSV
- **Logs**: View performance logs and errors

## Configuration

The application configuration is stored in `/var/www/link_shortener/.env`. To change settings after installation, you can edit this file and restart the service:

```bash
sudo systemctl restart link_shortener
```
