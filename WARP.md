# WARP.md - Link Shortener YunoHost Package

This file provides guidance to WARP (warp.dev) when working with this YunoHost application package.

## Project Overview

This is a YunoHost packaging of the Link Shortener application - a high-performance TypeScript-based link shortening and analytics service. The package adapts the standalone link_shortener application to run seamlessly within the YunoHost ecosystem.

## Architecture

### Base Application
- **Language**: TypeScript (compiled to JavaScript)
- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Database**: SQLite (better-sqlite3)
- **Build Process**: TypeScript compilation via `npm run build`
- **Entry Point**: `dist/server.js` (compiled from `src/server.ts`)

### YunoHost Integration
- **Packaging Format**: 2.0
- **Helpers Version**: 2.1
- **Service Management**: systemd
- **Reverse Proxy**: nginx
- **Multi-Instance**: Supported

## Directory Structure

```
ynh_link_shortener/
├── app/                      # Link shortener source code (copied during packaging)
│   ├── src/                  # TypeScript source
│   │   ├── server.ts         # Main application
│   │   └── db.ts             # Database schema
│   ├── public/               # Static files (admin UI, tracking script)
│   ├── package.json          # Dependencies
│   └── tsconfig.json         # TypeScript config
├── scripts/                  # YunoHost lifecycle scripts
│   ├── install               # Installation script
│   ├── upgrade               # Upgrade script
│   ├── remove                # Removal script
│   ├── backup                # Backup script
│   ├── restore               # Restore script
│   └── change_url            # URL change handler
├── conf/                     # Configuration templates
│   ├── nginx.conf            # Nginx reverse proxy config
│   └── systemd.service       # Systemd service definition
├── doc/                      # Documentation
│   ├── DESCRIPTION.md        # Brief description for catalog
│   └── ADMIN.md              # Admin documentation
├── manifest.toml             # YunoHost app manifest
├── README.md                 # Package documentation
└── WARP.md                   # This file
```

## Installation Flow

1. **Node.js Installation**: Automatic via `[resources.nodejs]` in manifest
2. **Source Copy**: App source from `../app/*` to `$install_dir`
3. **Dependency Installation**: `npm install` (includes devDependencies)
4. **TypeScript Build**: `npm run build` creates `dist/` directory
5. **Cleanup**: `npm prune --production` removes devDependencies
6. **Configuration**: `.env` file created with YunoHost settings
7. **Permissions**: `chmod -R o-rwx` and `chown $app:www-data`
8. **System Setup**: nginx and systemd configs deployed
9. **Service Start**: systemd service started

## Key Configuration

### manifest.toml Variables

The manifest defines these install-time questions:
- `domain` - Domain where app is installed
- `path` - URL path (default: `/`)
- `admin_password` - Admin interface password
- `admin_path` - Admin UI path (default: `/derp`)
- `root_redirect` - Where `/` redirects
- `not_found_redirect` - 404 redirect target

These become bash variables in scripts and can be referenced with `$variable_name`.

### Environment File (.env)

Created by install script at `$install_dir/.env`:
```bash
PORT=$port                          # Assigned by YunoHost
ADMIN_PASSWORD=$admin_password      # From install questions
ADMIN_PATH=$admin_path
ROOT_REDIRECT=$root_redirect
NOT_FOUND_REDIRECT=$not_found_redirect
ALLOWED_ADMIN_IPS=*                 # Trust nginx to pass real IP
COOKIE_SECURE=true                  # HTTPS is enforced by YunoHost
SESSION_WINDOW_MIN=30
USER_COOKIE_MAX_DAYS=730
RATE_LIMIT_WINDOW=60
```

The app uses `dotenv` to load these at runtime.

### Systemd Service

Key aspects of `conf/systemd.service`:
- **ExecStart**: `__NODEJS_DIR__/node dist/server.js` (not npm start!)
- **WorkingDirectory**: `__INSTALL_DIR__/` (where .env is located)
- **Environment**: `NODE_ENV=production`, `PATH` with Node.js
- **Security Hardening**: Extensive sandboxing (PrivateTmp, ProtectSystem, etc.)
- **Restart Policy**: `on-failure` with 10s delay

### Nginx Configuration

Key aspects of `conf/nginx.conf`:
- **Proxy Target**: `http://localhost:__PORT__/`
- **Critical Headers**:
  - `X-Forwarded-For` - Real client IP (for tracking)
  - `X-Real-IP` - Also real client IP
  - `X-Forwarded-Proto`, `X-Forwarded-Host` - HTTPS context
- **WebSocket Support**: Upgrade headers included
- **Timeouts**: 30s (fast redirects expected)
- **Security Headers**: X-Frame-Options, X-Content-Type-Options, etc.

## Data Persistence

### SQLite Database
- **Location**: `$install_dir/data/app.db`
- **Contains**: Links, hits (analytics), IP blacklist, API tokens, logs
- **Backed Up**: Yes, automatically via YunoHost backup system
- **Migration**: Auto-created on first run

### Configuration
- **Location**: `$install_dir/.env`
- **Backed Up**: Yes
- **Preserved**: During upgrades (not overwritten)

## Upgrade Process

The upgrade script (`scripts/upgrade`):
1. Stops the service
2. (Optionally) Updates source files via `ynh_setup_source --keep=".env data/"`
3. Runs `npm install` (full, including devDependencies)
4. Rebuilds TypeScript: `npm run build`
5. Prunes devDependencies: `npm prune --production`
6. Updates nginx and systemd configs
7. Restarts the service

**Critical**: The `--keep` parameter preserves `.env` and `data/` during source updates.

## Testing Checklist

### Pre-Installation
- [ ] Manifest validates: `yunohost app check /path/to/package`
- [ ] Source code is in `app/` directory
- [ ] All scripts have execute permissions

### Post-Installation
- [ ] Service is running: `systemctl status link_shortener`
- [ ] Port is listening: `netstat -tlnp | grep $port`
- [ ] Health endpoint works: `curl http://localhost:$port/health`
- [ ] Nginx proxy works: `curl https://domain.com/health`
- [ ] Admin interface accessible: Visit `https://domain.com/derp`
- [ ] Can create short link via admin UI
- [ ] Short link redirect works: `https://domain.com/l/test`
- [ ] Analytics are tracked in database

### Backup/Restore
- [ ] Backup creates successfully: `yunohost backup create --apps link_shortener`
- [ ] Database included in backup
- [ ] Restore works: `yunohost backup restore <backup_name>`
- [ ] Service starts after restore
- [ ] Data persists after restore

### Upgrade
- [ ] Upgrade completes: `yunohost app upgrade link_shortener`
- [ ] Database preserved
- [ ] Configuration preserved
- [ ] Service restarts successfully

## Common Issues

### Service Won't Start
**Symptom**: `systemctl status link_shortener` shows failed state

**Check**:
1. `journalctl -u link_shortener -n 50` for error logs
2. TypeScript compiled? Check `$install_dir/dist/` exists
3. Node.js available? Check `__NODEJS_DIR__` path
4. Port conflict? `netstat -tlnp | grep $port`

### Build Fails
**Symptom**: `npm run build` fails during install/upgrade

**Causes**:
- Missing devDependencies (TypeScript, ts-node)
- Node version mismatch
- Out of memory (RAM too low)

**Solution**: Ensure RAM build requirement (500M) is met

### Can't Access Admin Interface
**Symptom**: 404 or unauthorized at admin path

**Check**:
1. Verify `ADMIN_PATH` in `.env`
2. Admin password correct?
3. Nginx config deployed? `cat /etc/nginx/conf.d/$domain.d/link_shortener.conf`
4. Service running?

### Analytics Not Working
**Symptom**: Redirects work but no hits tracked

**Check**:
1. Database exists? `ls -la $install_dir/data/app.db`
2. Permissions correct? `chown link_shortener:www-data data/app.db`
3. Real IP passed? Check nginx headers (X-Forwarded-For)

## Development Workflow

### Testing Locally (Development Machine)

You cannot fully test YunoHost packaging on macOS. However, you can:

1. **Test the base app**:
```bash
cd app/
npm install
npm run build
npm start
# Visit http://localhost:3000
```

2. **Validate manifest**:
```bash
# Use online validator or YunoHost test instance
```

### Testing on YunoHost Instance

**Recommended**: Use a YunoHost test VM or server

```bash
# Install from local directory
scp -r /path/to/ynh_link_shortener user@yunohost-server:/tmp/
ssh user@yunohost-server
sudo yunohost app install /tmp/ynh_link_shortener

# Check status
sudo systemctl status link_shortener
sudo journalctl -u link_shortener -f

# Test endpoints
curl https://your-domain.com/health
curl https://your-domain.com/l/test

# Remove when done
sudo yunohost app remove link_shortener
```

## Customization Points

### Changing Node.js Version
Edit `manifest.toml`:
```toml
[resources.nodejs]
version = "22"  # Change to desired LTS version
```

### Adjusting Resource Limits
Edit `manifest.toml`:
```toml
disk = "200M"        # If you expect large databases
ram.build = "1000M"  # For faster builds
ram.runtime = "200M" # If handling high traffic
```

### Adding More Install Questions
Edit `manifest.toml` `[install]` section:
```toml
[install.your_setting]
ask.en = "Your question?"
type = "string"
default = "default_value"
```

Then use `$your_setting` in scripts and configs.

### Modifying Security Hardening
Edit `conf/systemd.service` sandboxing directives (lines 29-53).
**Warning**: Loosening security reduces protection!

## Security Considerations

1. **Admin Password**: Strong passwords enforced during YunoHost install
2. **IP Tracking**: Real IPs preserved via `X-Forwarded-For` (critical for analytics and IP blacklisting)
3. **HTTPS**: Enforced by YunoHost/nginx, `COOKIE_SECURE=true` set
4. **Systemd Sandboxing**: Extensive restrictions (see systemd.service)
5. **Rate Limiting**: Built into app (one hit per IP per link per minute)
6. **ALLOWED_ADMIN_IPS**: Set to `*` because nginx handles IP filtering; app trusts `X-Forwarded-For`

## Links and References

- **Base Application**: `../link_shortener/` or https://github.com/yourusername/link_shortener
- **YunoHost Docs**: https://yunohost.org/packaging_apps
- **Manifest Schema**: https://github.com/YunoHost/apps/blob/master/schemas/manifest.v2.schema.json
- **Helpers Reference**: https://yunohost.org/packaging_apps_helpers

## Maintenance

### Updating the Base Application

When the link_shortener app is updated:

1. Update source in `app/` directory
2. Test locally first
3. Bump version in `manifest.toml`: `version = "X.Y.Z~ynh1"`
4. Test installation on YunoHost
5. Test upgrade from previous version
6. Update CHANGELOG if needed

### Version Numbering

Format: `BASE_VERSION~ynhPACKAGE_VERSION`

Example: `1.0.0~ynh2` means:
- Base app version: 1.0.0
- YunoHost package version: 2 (second revision)

Increment `~ynh#` for packaging-only changes.
Update base version when the app itself is updated.
