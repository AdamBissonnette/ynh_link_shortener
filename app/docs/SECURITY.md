# Security

## Input Sanitization & Validation

This service implements comprehensive input sanitization to prevent injection attacks and data corruption.

### Automatic Protections

#### SQL Injection Prevention
All database queries use **prepared statements** from `better-sqlite3`, which automatically escape parameters and prevent SQL injection attacks. User input never directly concatenates into SQL queries.

#### Input Sanitization
All user-provided data is sanitized through three helper functions:

**`sanitizeString(input, maxLength)`**
- Truncates strings to specified length
- Removes null bytes (`\x00`) and dangerous characters
- Used for all text fields

**`sanitizeQueryParams(params)`**
- Truncates parameter keys to 50 characters
- Truncates parameter values to 200 characters
- Limits arrays to 10 items
- Removes null bytes

**`sanitizeJSON(obj, maxDepth)`**
- Recursively sanitizes nested objects
- Limits object depth to prevent DoS
- Truncates string values to 500 characters
- Limits arrays to 20 items
- Only allows strings, numbers, booleans, objects, and arrays

### Field-Specific Limits

| Field Type | Max Length | Notes |
|------------|------------|-------|
| Slug | 100 chars | Alphanumeric, dashes, underscores only |
| Destination URL | 2000 chars | Must be valid URL |
| IP Address | 50 chars | IPv4 or IPv6 format validated |
| Blacklist Reason | 200 chars | Optional text field |
| Token Name | 100 chars | Alphanumeric and common symbols |
| Query Param Keys | 50 chars | Per parameter name |
| Query Param Values | 200 chars | Per parameter value |
| User Agent | 500 chars | Truncated from headers |
| Referer | 500 chars | Truncated from headers |
| Custom Variables (vars) | 500 chars | Per string value in vars object |
| Accept Language | 100 chars | Truncated from headers |
| Client Hints | 200 chars | Truncated from headers |
| Timezone | 50 chars | User-provided |
| Locale | 20 chars | User-provided |
| Page Title | 200 chars | From analytics |
| Event Label | 100 chars | From analytics |

### Validation Rules

#### Link Creation
- **Slug**: Must match `^[a-zA-Z0-9_-]+$` (letters, numbers, dash, underscore only)
- **Destination**: Must be a valid URL (validated with `new URL()`)

#### IP Blacklist
- **IP Address**: Must match IPv4 or IPv6 format regex
- Invalid formats are rejected with 400 error

#### API Tokens
- **Scopes**: Must be one of: `links`, `hits`, `blacklist`, `export`, `stats`
- Invalid scopes are filtered out

### Protected Endpoints

All admin endpoints (`/admin/*`) are protected by:
1. **IP whitelist**: Only specified IPs can access (configurable via `ALLOWED_ADMIN_IPS`)
2. **Bearer token authentication**: Requires admin password

All external API endpoints (`/api/*`) are protected by:
1. **API token authentication**: Requires valid token with appropriate scopes
2. **Scope validation**: Each endpoint checks for required scopes

### Rate Limiting

Database-level rate limiting prevents spam:
- **One hit per IP per slug per minute** via unique constraint
- Duplicate hits within the same minute are silently dropped
- No additional hits logged, preventing database bloat

### CORS Policy

- `/a/collect` endpoint: CORS enabled (`Access-Control-Allow-Origin: *`)
- All other endpoints: CORS disabled (same-origin only)

### Cookie Security

Session and visitor cookies are set with:
- `HttpOnly` flag (prevents JavaScript access)
- `SameSite=Lax` (CSRF protection)
- `Secure` flag when `COOKIE_SECURE=true` (HTTPS only)

### Best Practices

#### For Development
- Set `ALLOWED_ADMIN_IPS=*` only on local development machines
- Use strong `ADMIN_PASSWORD` even in development
- Never commit `.env` file to version control

#### For Production
- **Always** set `COOKIE_SECURE=true` when behind HTTPS
- Restrict `ALLOWED_ADMIN_IPS` to specific trusted IPs
- Use a strong, randomly generated `ADMIN_PASSWORD` (e.g., `openssl rand -hex 32`)
- Place service behind reverse proxy (Caddy/Nginx) for TLS termination
- Use Cloudflare or similar WAF for additional protection
- Regularly backup the `data/app.db` file
- Monitor the `/health` endpoint for errors
- Rotate API tokens periodically

#### Firewall Configuration
```bash
# Example: only allow HTTPS traffic from Cloudflare
ufw allow from 173.245.48.0/20 to any port 443
ufw allow from 103.21.244.0/22 to any port 443
# ... add all Cloudflare IP ranges
```

### Threat Model

**Protected Against:**
- ✅ SQL injection (prepared statements)
- ✅ XSS in stored data (sanitization)
- ✅ DoS via large inputs (truncation)
- ✅ DoS via nested objects (depth limits)
- ✅ CSRF on state-changing operations (SameSite cookies)
- ✅ Spam/abuse (rate limiting, IP blacklist)
- ✅ Unauthorized access (authentication, IP whitelist)

**Not Protected Against:**
- ❌ DDoS attacks (use Cloudflare or similar)
- ❌ Brute force password guessing (implement rate limiting if needed)
- ❌ Physical access to server (use encryption at rest)
- ❌ Compromised admin credentials (use strong passwords, rotate regularly)

### Reporting Security Issues

If you discover a security vulnerability, please email the maintainer directly rather than opening a public issue.
