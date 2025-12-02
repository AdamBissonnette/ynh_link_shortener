# Production Deployment Checklist

## Pre-Deployment

### Security Configuration

- [ ] Generate strong admin password: `openssl rand -hex 32`
- [ ] Update `.env` with production `ADMIN_PASSWORD`
- [ ] Set `ALLOWED_ADMIN_IPS` to specific trusted IPs (never use `*` in production)
- [ ] Set `COOKIE_SECURE=true` (requires HTTPS)
- [ ] Choose obscure `ADMIN_PATH` (not `/derp`)
- [ ] Configure `ROOT_REDIRECT` and `NOT_FOUND_REDIRECT` URLs
- [ ] Set appropriate `RATE_LIMIT_WINDOW` (60 seconds recommended)

### Environment Setup

```bash
# Example production .env
PORT=3000
ADMIN_PASSWORD=<strong-random-password>
ALLOWED_ADMIN_IPS=203.0.113.42,198.51.100.89
ADMIN_PATH=/admin-xyz-secret
ROOT_REDIRECT=https://yoursite.com
NOT_FOUND_REDIRECT=https://yoursite.com
SESSION_WINDOW_MIN=30
USER_COOKIE_MAX_DAYS=730
COOKIE_SECURE=true
RATE_LIMIT_WINDOW=60
```

### Build and Install

```bash
# Install dependencies
npm ci --production

# Build TypeScript
npm run build

# Test that it starts
npm start
```

## Reverse Proxy Setup

### Nginx Example

```nginx
server {
    listen 443 ssl http2;
    server_name goto.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy Example

```
goto.example.com {
    reverse_proxy localhost:3000
}
```

## Process Management

### Systemd Service

Create `/etc/systemd/system/link-shortener.service`:

```ini
[Unit]
Description=Link Shortener Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/link-shortener
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /var/www/link-shortener/dist/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable link-shortener
sudo systemctl start link-shortener
sudo systemctl status link-shortener
```

### PM2 Alternative

```bash
pm2 start dist/server.js --name link-shortener
pm2 save
pm2 startup
```

## Monitoring Setup

### Health Check Monitoring

Configure external monitoring (UptimeRobot, Pingdom, etc.):
- **URL**: `https://goto.example.com/health`
- **Method**: GET
- **Expected**: HTTP 200 with `"status":"healthy"`
- **Alert**: On 503 status or `"status":"degraded"`
- **Check interval**: 5 minutes

### Log Monitoring

```bash
# View recent errors
curl -H "Authorization: Bearer YOUR_PASSWORD" \
  https://goto.example.com/admin/logs?limit=50&level=error

# Monitor logs
journalctl -u link-shortener -f  # systemd
pm2 logs link-shortener           # pm2
```

## Backup Strategy

### Automated Backup Script

Create `/usr/local/bin/backup-linkshortener.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/link-shortener"
DB_PATH="/var/www/link-shortener/data/app.db"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"
cp "$DB_PATH" "$BACKUP_DIR/app_${DATE}.db"

# Keep only last 30 days
find "$BACKUP_DIR" -name "app_*.db" -mtime +30 -delete
```

Add to crontab:
```bash
# Backup every 6 hours
0 */6 * * * /usr/local/bin/backup-linkshortener.sh
```

### Cloud Backup

Consider syncing to cloud storage:
```bash
# Example: sync to S3
aws s3 sync /var/backups/link-shortener s3://your-bucket/link-shortener/
```

## Firewall Configuration

```bash
# Allow only HTTPS from Cloudflare (if using)
ufw allow from 173.245.48.0/20 to any port 443
ufw allow from 103.21.244.0/22 to any port 443
# ... add all Cloudflare IP ranges

# Or allow HTTPS from anywhere
ufw allow 443/tcp

# Block direct access to Node.js port
ufw deny 3000/tcp
```

## Post-Deployment

### Verification Checklist

- [ ] Admin interface loads at your `ADMIN_PATH`
- [ ] Can login with production password
- [ ] Links redirect correctly
- [ ] `/health` endpoint returns healthy status
- [ ] External monitoring is receiving health checks
- [ ] Create test link and verify it tracks hits
- [ ] Test API token creation and usage
- [ ] Verify logs are being written
- [ ] Check that backups are running
- [ ] Confirm rate limiting works (try rapid requests)
- [ ] Test 404 handling
- [ ] Verify favicon loads without errors

### Performance Baseline

Record initial metrics:
```bash
# Check response time
curl -w "@-" -o /dev/null -s https://goto.example.com/health << 'EOF'
    time_namelookup:  %{time_namelookup}s\n
       time_connect:  %{time_connect}s\n
    time_appconnect:  %{time_appconnect}s\n
   time_pretransfer:  %{time_pretransfer}s\n
      time_redirect:  %{time_redirect}s\n
 time_starttransfer:  %{time_starttransfer}s\n
                    ----------\n
         time_total:  %{time_total}s\n
EOF
```

Expected: Total time < 100ms for redirects

## Maintenance

### Regular Tasks

**Daily:**
- Check `/health` endpoint status
- Review error logs if any

**Weekly:**
- Review hit statistics
- Check disk space: `df -h`
- Verify backups are completing

**Monthly:**
- Rotate API tokens if needed
- Review and prune old hits if database is large
- Update dependencies: `npm outdated`
- Review blocked IPs and remove if needed

### Updates

```bash
# Pull latest code
git pull

# Install dependencies
npm ci --production

# Rebuild
npm run build

# Restart service
sudo systemctl restart link-shortener  # or pm2 restart
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs
journalctl -u link-shortener -n 50
pm2 logs link-shortener --lines 50

# Check if port is in use
sudo lsof -i :3000

# Check permissions
ls -la /var/www/link-shortener/data/
```

### High Memory Usage

SQLite is very memory efficient. If you see high memory:
- Check for memory leaks with `pm2 monit`
- Review hit count: `sqlite3 data/app.db "SELECT COUNT(*) FROM hits"`
- Consider archiving old hits

### Database Locked Errors

SQLite uses WAL mode which prevents most locks. If you see locks:
- Ensure only one process is accessing the database
- Check for zombie processes: `ps aux | grep node`
- Restart the service

### Can't Access Admin Panel

- Verify your IP is in `ALLOWED_ADMIN_IPS`
- Check admin password is correct
- Clear browser localStorage and try again
- Check firewall rules: `sudo ufw status`

## Security Incident Response

If you suspect compromise:

1. **Immediately** change `ADMIN_PASSWORD`
2. Revoke all API tokens
3. Review `/admin/logs` for suspicious activity
4. Check hits database for unusual patterns
5. Review and update IP blacklist
6. Rotate any secrets or credentials
7. Consider restoring from backup if data integrity is questionable

## Scaling Considerations

This service handles 10K+ requests/second on modest hardware. If you need more:

- **Use CDN**: Put Cloudflare in front for caching and DDoS protection
- **Read replicas**: SQLite supports read-only connections for analytics
- **Archive old data**: Move hits older than 90 days to cold storage
- **Horizontal scaling**: Run multiple instances behind load balancer (requires shared database)

For serious scale (>1M requests/day), consider migrating to PostgreSQL.
