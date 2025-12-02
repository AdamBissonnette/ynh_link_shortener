# Link Shortener for YunoHost

A high-performance link shortening and analytics tracking service packaged for YunoHost.

**Version:** 1.0.0~ynh1

## Overview

Link Shortener is a TypeScript-based application that provides fast URL shortening with comprehensive analytics tracking. It uses SQLite for data storage and includes rate limiting, IP blacklisting, bot detection, and a clean admin interface.

### Features

- ✅ **Ultra-fast redirects** - O(1) lookups with in-memory caching
- ✅ **Built-in analytics** - Track visits, referrers, UTM parameters, browsers, devices
- ✅ **Rate limiting** - Prevent spam with per-IP-per-minute deduplication  
- ✅ **IP blacklisting** - Block abusive traffic
- ✅ **Bot detection** - Automatic bot identification via isbot library
- ✅ **Pixel tracking** - 1x1 transparent tracking pixel for emails/webpages
- ✅ **Client-side analytics** - Lightweight tracking script for page views
- ✅ **Web admin interface** - Manage links, view analytics, export data
- ✅ **API tokens** - Scoped programmatic access for external integrations
- ✅ **TypeScript** - Full type safety and code quality
- ✅ **SQLite database** - Simple, fast, zero configuration

## Installation

### Using YunoHost Admin Panel

1. Go to your YunoHost admin panel
2. Navigate to "Applications" > "Install"
3. Search for "Link Shortener" or provide the repository URL
4. Follow the installation wizard

### Using Command Line

```bash
sudo yunohost app install https://github.com/yourusername/ynh_link_shortener
```

Or, if you have a local copy:

```bash
sudo yunohost app install /path/to/ynh_link_shortener
```

## Configuration

During installation, you'll be asked for:

- **Domain**: Your YunoHost domain where the app will be installed
- **Path**: URL path (default: `/` for root domain)
- **Admin Password**: Password to access the admin interface
- **Admin Path**: URL path for admin interface (default: `/derp` for obscurity)
- **Root Redirect**: Where to redirect requests to `/` (your main website)
- **404 Redirect**: Where to redirect unknown short links

### Post-Installation Configuration

After installation, you can modify settings by editing:
```
/var/www/link_shortener/.env
```

Then restart the service:
```bash
sudo systemctl restart link_shortener
```

## Usage

### Creating Short Links

Access the admin interface at:
```
https://your-domain.com/derp
```

Use the web interface or API to create short links:

```bash
curl -X POST https://your-domain.com/admin/links \
  -H "Authorization: Bearer YOUR_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"slug":"example","destination":"https://example.com"}'
```

### Using Short Links

Redirect users:
```
https://your-domain.com/l/example
```

Pixel tracking (for emails):
```html
<img src="https://your-domain.com/p/example" width="1" height="1" />
```

### Analytics

View analytics in the admin interface:
- Recent hits with full details
- Aggregated statistics
- Export data as CSV
- Download entire database

## Documentation

- [Admin Guide](./doc/ADMIN.md) - Detailed admin documentation
- [Original App Docs](https://github.com/yourusername/link_shortener) - Full documentation of the base application

## Architecture

This YunoHost package includes:
- **Node.js 20** runtime
- **TypeScript** compilation during installation
- **Express** web server
- **SQLite** database (stored in `data/app.db`)
- **Systemd** service with security hardening
- **Nginx** reverse proxy configuration

### File Locations

- **App Directory**: `/var/www/link_shortener/`
- **Database**: `/var/www/link_shortener/data/app.db`
- **Configuration**: `/var/www/link_shortener/.env`
- **Nginx Config**: `/etc/nginx/conf.d/$domain.d/link_shortener.conf`
- **Systemd Service**: `/etc/systemd/system/link_shortener.service`

## Backup and Restore

YunoHost automatically backs up:
- Application files (source code, built JavaScript)
- SQLite database with all links and analytics
- Configuration file (.env)
- System configurations (nginx, systemd)

Restore using:
```bash
sudo yunohost backup restore <backup_name>
```

## Upgrading

```bash
sudo yunohost app upgrade link_shortener
```

The upgrade process:
1. Stops the service
2. Updates application files
3. Rebuilds TypeScript
4. Preserves database and configuration
5. Restarts the service

## Removing

```bash
sudo yunohost app remove link_shortener
```

This removes all application files, configurations, and the database.
**Note:** Make a backup first if you want to preserve your data!

## Troubleshooting

### Service Won't Start

Check service status:
```bash
sudo systemctl status link_shortener
```

View logs:
```bash
sudo journalctl -u link_shortener -n 50
```

### Can't Access Admin Interface

1. Verify the admin path in `/var/www/link_shortener/.env`
2. Check nginx configuration
3. Ensure the service is running

### Database Issues

The SQLite database is at `/var/www/link_shortener/data/app.db`. Check permissions:
```bash
ls -la /var/www/link_shortener/data/
```

Should be owned by `link_shortener:www-data` with mode `750`.

## Additional Information

### System Requirements

- **Disk**: ~100MB (including dependencies)
- **RAM**: ~500MB during build, ~150MB runtime
- **YunoHost**: >= 12.1.17

### Multi-Instance Support

Yes - you can install multiple instances of Link Shortener on different domains or paths.

### Security Considerations

- Admin interface is password-protected
- All cookies are set as Secure (HTTPS-only) by default
- Rate limiting prevents spam
- Systemd service runs with security hardening (sandboxing, capability restrictions)
- Real client IPs are preserved via `X-Forwarded-For` and `X-Real-IP` headers

## Links

- **Report a bug**: https://github.com/yourusername/ynh_link_shortener/issues
- **App website**: https://github.com/yourusername/link_shortener
- **YunoHost website**: https://yunohost.org/

## License

This YunoHost package is licensed under MIT.
The Link Shortener application itself is also MIT licensed.
