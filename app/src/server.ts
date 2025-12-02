import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import UAParser from 'ua-parser-js';
import { isbot } from 'isbot';
import { linkStatements, hitStatements, blacklistStatements, migrateLinksFromJSON, Link, tokenStatements, APITokenRow, logStatements } from './db';

const app = express();
app.use(express.json());

// Performance logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const originalSend = res.send;
  const originalJson = res.json;
  
  // Wrap send/json to capture when response completes
  const logRequest = () => {
    const duration = Date.now() - start;
    const ip = getClientIP(req);
    const status = res.statusCode;
    const path = req.path;
    const method = req.method;
    
    // Log slow requests (>100ms) or errors
    if (duration > 100 || status >= 400) {
      const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
      const message = `${method} ${path} - ${status} - ${duration}ms`;
      
      try {
        logStatements.insert.run(
          new Date().toISOString(),
          level,
          message,
          path,
          method,
          status,
          duration,
          ip,
          null,
          null
        );
      } catch (err) {
        console.error('Error logging request:', err);
      }
      
      if (level === 'error') {
        console.error(`[ERROR] ${message} - IP: ${ip}`);
      } else if (level === 'warn') {
        console.warn(`[WARN] ${message} - IP: ${ip}`);
      }
    }
  };
  
  res.send = function(body) {
    logRequest();
    return originalSend.call(this, body);
  };
  
  res.json = function(body) {
    logRequest();
    return originalJson.call(this, body);
  };
  
  next();
});

// Admin UI path (configurable, defaults to /derp)
const ADMIN_PATH = process.env.ADMIN_PATH || '/derp';
app.use(ADMIN_PATH, express.static(path.join(__dirname, '..', 'public')));

// Session cookie configuration
const SESSION_WINDOW_MIN = Math.max(1, parseInt(process.env.SESSION_WINDOW_MIN || '30', 10));
const USER_COOKIE_MAX_DAYS = Math.max(1, parseInt(process.env.USER_COOKIE_MAX_DAYS || '730', 10));
const COOKIE_SECURE = (process.env.COOKIE_SECURE || 'false').toLowerCase() === 'true';

// Rate limiting configuration (in seconds, 0 = disabled)
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60', 10);

// Configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const ALLOWED_ADMIN_IPS = (process.env.ALLOWED_ADMIN_IPS || '127.0.0.1').split(',');
const DATA_DIR = path.join(__dirname, '..', 'data');
const LINKS_FILE = path.join(DATA_DIR, 'links.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Migrate existing links from JSON if exists
if (fs.existsSync(LINKS_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
    migrateLinksFromJSON(data);
    console.log(`Migrated ${Object.keys(data).length} links from JSON to database`);
    // Backup and remove old file
    fs.renameSync(LINKS_FILE, LINKS_FILE + '.backup');
  } catch (err) {
    console.error('Error migrating links:', err);
  }
}

// Log startup info
const links = linkStatements.getAll.all() as Link[];
const hitCount = (hitStatements.getTotalCount.get() as { count: number }).count;
console.log(`Loaded ${links.length} links and ${hitCount} hits from database`);

// Middleware to extract IP address
function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] as string ||
         req.socket.remoteAddress ||
         req.ip ||
         'unknown';
}

// Middleware to parse user agent
interface ParsedUA {
  browser: string;
  os: string;
  device: string;
}

function parseUserAgent(req: Request): ParsedUA {
  const parser = new UAParser(req.headers['user-agent']);
  const result = parser.getResult();
  return {
    browser: `${result.browser.name || 'Unknown'} ${result.browser.version || ''}`.trim(),
    os: `${result.os.name || 'Unknown'} ${result.os.version || ''}`.trim(),
    device: result.device.type || 'desktop'
  };
}

// Input sanitization helpers
function sanitizeString(input: string | undefined | null, maxLength: number = 255): string {
  if (!input) return '';
  // Convert to string and truncate
  const str = String(input).slice(0, maxLength);
  // Remove null bytes and other dangerous characters
  return str.replace(/\x00/g, '');
}

function sanitizeQueryParams(params: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(params)) {
    // Truncate keys to 50 chars
    const safeKey = sanitizeString(key, 50);
    if (!safeKey) continue;
    
    // Truncate values to 200 chars for query params
    if (typeof value === 'string') {
      sanitized[safeKey] = sanitizeString(value, 200);
    } else if (Array.isArray(value)) {
      sanitized[safeKey] = value.slice(0, 10).map(v => sanitizeString(String(v), 200));
    } else {
      sanitized[safeKey] = sanitizeString(String(value), 200);
    }
  }
  return sanitized;
}

function sanitizeJSON(obj: Record<string, any>, maxDepth: number = 3): Record<string, any> {
  if (maxDepth <= 0) return {};
  
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const safeKey = sanitizeString(key, 50);
    if (!safeKey) continue;
    
    if (typeof value === 'string') {
      sanitized[safeKey] = sanitizeString(value, 500);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[safeKey] = value;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[safeKey] = sanitizeJSON(value, maxDepth - 1);
    } else if (Array.isArray(value)) {
      sanitized[safeKey] = value.slice(0, 20).map(v => 
        typeof v === 'string' ? sanitizeString(v, 200) : v
      );
    }
  }
  return sanitized;
}

// Cookie helpers
function getCookie(req: Request, name: string): string | undefined {
  const raw = req.headers['cookie'];
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const [k, v] = part.trim().split('=');
    if (decodeURIComponent(k) === name) return v ? decodeURIComponent(v) : '';
  }
  return undefined;
}

// Track a hit (with spam protection via DB constraint)
function trackHit(type: 'redirect' | 'pixel', slug: string, req: Request, sessionId?: string | null, visitorId?: string | null): void {
  const ip = getClientIP(req);
  
  // Check IP blacklist
  const isBlocked = blacklistStatements.isBlacklisted.get(ip);
  if (isBlocked) {
    console.log(`[BLOCKED] ${type.toUpperCase()} ${slug} - ${ip} (blacklisted)`);
    return;
  }
  
  const ua = parseUserAgent(req);
  const referer = sanitizeString((req.headers['referer'] || req.headers['referrer'] || 'Direct') as string, 500);
  const acceptLanguage = sanitizeString((req.headers['accept-language'] || 'Unknown') as string, 100);
  const userAgent = sanitizeString((req.headers['user-agent'] || 'Unknown') as string, 500);
  const timestamp = new Date().toISOString();
  
  // Capture query parameters as JSON string (sanitized)
  const queryParams = Object.keys(req.query).length > 0 
    ? JSON.stringify(sanitizeQueryParams(req.query)) 
    : null;
  
  // Build extra JSON (client hints, optional tz/locale override)
  const extraObj: Record<string, any> = { is_bot: isbot(userAgent) ? 1 : 0 };
  const chUa = req.headers['sec-ch-ua'];
  const chPlat = req.headers['sec-ch-ua-platform'];
  const chMobile = req.headers['sec-ch-ua-mobile'];
  const dnt = req.headers['dnt'];
  const accept = req.headers['accept'];
  if (chUa) extraObj['ch_ua'] = sanitizeString(chUa as string, 200);
  if (chPlat) extraObj['ch_platform'] = sanitizeString(chPlat as string, 50);
  if (chMobile) extraObj['ch_mobile'] = sanitizeString(chMobile as string, 10);
  if (dnt) extraObj['dnt'] = sanitizeString(dnt as string, 10);
  if (accept) extraObj['accept'] = sanitizeString(accept as string, 200);
  if (req.query.tz) extraObj['tz'] = sanitizeString(req.query.tz as string, 50);
  if (req.query.locale) extraObj['locale'] = sanitizeString(req.query.locale as string, 20);
  const extraJson = Object.keys(extraObj).length ? JSON.stringify(extraObj) : null;

  // Generate rate limit key based on configured window
  let minuteKey: string | null = null;
  if (RATE_LIMIT_WINDOW > 0) {
    const date = new Date(timestamp);
    const windowSeconds = Math.floor(date.getTime() / 1000 / RATE_LIMIT_WINDOW) * RATE_LIMIT_WINDOW;
    minuteKey = `${ip}|${slug}|${windowSeconds}`;
  }

  // Insert into database (will be ignored if duplicate within rate limit window)
  try {
    const result = hitStatements.insert.run(
      type,
      slug,
      ip,
      timestamp,
      userAgent,
      ua.browser,
      ua.os,
      ua.device,
      referer,
      acceptLanguage,
      queryParams,
      sessionId || null,
      visitorId || null,
      extraJson,
      minuteKey
    );
    
    // Only log if actually inserted (not rate-limited)
    if (result.changes > 0) {
      const queryString = queryParams ? ` - Params: ${queryParams}` : '';
      console.log(`[${type.toUpperCase()}] ${slug} - ${ip} - ${ua.browser} on ${ua.os} - Referer: ${referer}${queryString}`);
    }
  } catch (err) {
    console.error('Error tracking hit:', err);
  }
}

// Authentication middleware for admin routes
function authAdmin(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIP(req);
  
  // Check IP whitelist
  if (!ALLOWED_ADMIN_IPS.includes(ip) && !ALLOWED_ADMIN_IPS.includes('*')) {
    res.status(403).json({ error: 'IP not allowed' });
    return;
  }
  
  // Check password
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }
  
  const password = auth.substring(7);
  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }
  
  next();
}

// Serve tracking script from root
app.get('/scripts.js', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'scripts.js'));
});

// Serve favicon (no tracking)
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'favicon.ico'));
});

// Root redirect (configurable, defaults to example.com)
const ROOT_REDIRECT = process.env.ROOT_REDIRECT || 'https://example.com';
app.get('/', (req, res) => {
  trackHit('redirect', '__root__', req);
  res.redirect(302, ROOT_REDIRECT);
});

// Enhanced health check with error monitoring
app.get('/health', (req, res) => {
  const links = linkStatements.getAll.all() as Link[];
  const hitCount = (hitStatements.getTotalCount.get() as { count: number }).count;
  
  // Check for recent errors (last hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentErrors = logStatements.getErrorsSince.all(oneHourAgo) as any[];
  
  const errorCount = (logStatements.countByLevel.get('error') as { count: number })?.count || 0;
  const warnCount = (logStatements.countByLevel.get('warn') as { count: number })?.count || 0;
  
  const health = {
    status: recentErrors.length === 0 ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    links: links.length,
    hits: hitCount,
    errors_total: errorCount,
    warnings_total: warnCount,
    errors_last_hour: recentErrors.length,
    recent_errors: recentErrors.slice(0, 5).map((e: any) => ({
      timestamp: e.timestamp,
      message: e.message,
      path: e.path
    }))
  };
  
  res.status(recentErrors.length > 10 ? 503 : 200).json(health);
});

// Redirect endpoint - main link shortener
app.get('/l/:slug', (req, res) => {
  const { slug } = req.params;
  const link = linkStatements.get.get(slug) as Link | undefined;
  
  if (!link) {
    return res.status(404).send('Link not found');
  }
  // Long-lived user cookie
  const uidName = 'ls_uid';
  let visitorId = getCookie(req, uidName);
  if (!visitorId || !/^[A-Za-z0-9_-]{16,}$/.test(visitorId)) {
    visitorId = require('crypto').randomBytes(18).toString('base64url');
  }
  const uidDirectives = [
    `${uidName}=${encodeURIComponent(visitorId as string)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${USER_COOKIE_MAX_DAYS * 24 * 60 * 60}`
  ];
  if (COOKIE_SECURE) uidDirectives.push('Secure');
  // Session cookie: set or refresh for this visitor window
  const sessName = 'ls_sess';
  let sessionId = getCookie(req, sessName);
  if (!sessionId || !/^[A-Za-z0-9_-]{16,}$/.test(sessionId)) {
    sessionId = require('crypto').randomBytes(16).toString('base64url');
  }
  const sessDirectives = [
    `${sessName}=${encodeURIComponent(sessionId as string)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_WINDOW_MIN * 60}`
  ];
  if (COOKIE_SECURE) sessDirectives.push('Secure');
  res.setHeader('Set-Cookie', [uidDirectives.join('; '), sessDirectives.join('; ')]);

  trackHit('redirect', slug, req, sessionId, visitorId);
  res.redirect(302, link.destination);
});

// Public analytics collector (no redirect). Accepts JSON body.
app.post('/a/collect', (req: Request, res: Response) => {
  // CORS for lightweight use across sites
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Derive type and label (sanitized)
  const body = typeof req.body === 'object' && req.body ? req.body as any : {};
  const atype = sanitizeString(body.type || 'page', 20); // 'page' | 'event'
  const label = sanitizeString(body.label || '', 100);
  const url = sanitizeString(body.url || req.headers['referer'] || '', 500);
  const slug = atype === 'event' ? `event:${label||'generic'}` : `page:${url.slice(0,200)}`;

  // Set cookies like pixel path so sessions/users are tracked consistently
  const uidName = 'ls_uid';
  let visitorId = getCookie(req, uidName);
  if (!visitorId || !/^[A-Za-z0-9_-]{16,}$/.test(visitorId)) {
    visitorId = require('crypto').randomBytes(18).toString('base64url');
  }
  const uidDirectives = [
    `${uidName}=${encodeURIComponent(visitorId as string)}`,
    'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${USER_COOKIE_MAX_DAYS * 24 * 60 * 60}`
  ];
  if (COOKIE_SECURE) uidDirectives.push('Secure');

  const sessName = 'ls_sess';
  let sessionId = getCookie(req, sessName);
  if (!sessionId || !/^[A-Za-z0-9_-]{16,}$/.test(sessionId)) {
    sessionId = require('crypto').randomBytes(16).toString('base64url');
  }
  const sessDirectives = [
    `${sessName}=${encodeURIComponent(sessionId as string)}`,
    'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_WINDOW_MIN * 60}`
  ];
  if (COOKIE_SECURE) sessDirectives.push('Secure');
  res.setHeader('Set-Cookie', [uidDirectives.join('; '), sessDirectives.join('; ')]);

  // Build extra (sanitized)
  const extra: Record<string, any> = { is_bot: isbot((req.headers['user-agent']||'') as string) ? 1 : 0 };
  if (body.title) extra.title = sanitizeString(body.title, 200);
  if (body.tz) extra.tz = sanitizeString(body.tz, 50);
  if (body.locale) extra.locale = sanitizeString(body.locale, 20);
  if (body.vars && typeof body.vars === 'object') {
    extra.vars = sanitizeJSON(body.vars);
  }
  const original = body as any;
  if (original.dpr) extra.dpr = typeof original.dpr === 'number' ? original.dpr : parseFloat(original.dpr) || 1;
  if (original.viewport) extra.viewport = sanitizeString(original.viewport, 50);
  const extraJson = JSON.stringify(extra);

  // Generate rate limit key
  const timestamp = new Date().toISOString();
  const ip = getClientIP(req);
  let minuteKey: string | null = null;
  if (RATE_LIMIT_WINDOW > 0) {
    const date = new Date(timestamp);
    const windowSeconds = Math.floor(date.getTime() / 1000 / RATE_LIMIT_WINDOW) * RATE_LIMIT_WINDOW;
    minuteKey = `${ip}|${slug}|${windowSeconds}`;
  }

  // Record hit
  try {
    hitStatements.insert.run(
      atype, // type
      slug,  // slug surrogate
      ip,
      timestamp,
      (req.headers['user-agent']||'Unknown') as string,
      parseUserAgent(req).browser,
      parseUserAgent(req).os,
      parseUserAgent(req).device,
      (req.headers['referer'] || req.headers['referrer'] || 'Direct') as string,
      (req.headers['accept-language'] || 'Unknown') as string,
      null, // query_params
      sessionId || null,
      visitorId || null,
      extraJson,
      minuteKey
    );
  } catch (e) {
    // fall through; still return ok so beacons don't retry forever
  }
  res.json({ ok: true });
});

// Pixel tracking endpoint
app.get('/p/:slug', (req, res) => {
  const { slug } = req.params;
  // Also set/refresh cookies, since pixel can be embedded on pages we control
  const uidName = 'ls_uid';
  let visitorId = getCookie(req, uidName);
  if (!visitorId || !/^[A-Za-z0-9_-]{16,}$/.test(visitorId)) {
    visitorId = require('crypto').randomBytes(18).toString('base64url');
  }
  const uidDirectives = [
    `${uidName}=${encodeURIComponent(visitorId as string)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${USER_COOKIE_MAX_DAYS * 24 * 60 * 60}`
  ];
  if (COOKIE_SECURE) uidDirectives.push('Secure');

  const sessName = 'ls_sess';
  let sessionId = getCookie(req, sessName);
  if (!sessionId || !/^[A-Za-z0-9_-]{16,}$/.test(sessionId)) {
    sessionId = require('crypto').randomBytes(16).toString('base64url');
  }
  const sessDirectives = [
    `${sessName}=${encodeURIComponent(sessionId as string)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_WINDOW_MIN * 60}`
  ];
  if (COOKIE_SECURE) sessDirectives.push('Secure');
  res.setHeader('Set-Cookie', [uidDirectives.join('; '), sessDirectives.join('; ')]);

  trackHit('pixel', slug, req, sessionId, visitorId);
  
  // Serve 1x1 transparent PNG
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  
  res.set({
    'Content-Type': 'image/png',
    'Content-Length': pixel.length.toString(),
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Expires': '0',
    'Pragma': 'no-cache'
  });
  
  res.send(pixel);
});

// Admin API - Add/Update link
app.post('/admin/links', authAdmin, (req, res) => {
  const rawSlug = req.body.slug;
  const rawDestination = req.body.destination;
  
  if (!rawSlug || !rawDestination) {
    return res.status(400).json({ error: 'slug and destination are required' });
  }
  
  // Validate and sanitize
  const slug = sanitizeString(rawSlug, 100);
  const destination = sanitizeString(rawDestination, 2000);
  
  // Validate slug format (alphanumeric, dashes, underscores only)
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return res.status(400).json({ error: 'slug must contain only letters, numbers, dashes, and underscores' });
  }
  
  // Validate destination is a valid URL
  try {
    new URL(destination);
  } catch {
    return res.status(400).json({ error: 'destination must be a valid URL' });
  }
  
  try {
    linkStatements.insert.run(slug, destination);
    res.json({ success: true, slug, destination });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save link' });
  }
});

// Admin API - Remove link
app.delete('/admin/links/:slug', authAdmin, (req, res) => {
  const { slug } = req.params;
  
  try {
    const result = linkStatements.delete.run(slug);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }
    
    res.json({ success: true, slug });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete link' });
  }
});

// Admin API - List links
app.get('/admin/links', authAdmin, (req, res) => {
  const links = linkStatements.getAll.all() as Link[];
  const linksList = links.map(link => ({
    slug: link.slug,
    destination: link.destination,
    created_at: link.created_at,
    updated_at: link.updated_at,
    hits: (hitStatements.getCount.get(link.slug, 'redirect') as { count: number }).count
  }));
  
  res.json({ links: linksList });
});

// Admin API - Get stats
app.get('/admin/stats', authAdmin, (req, res) => {
  const { slug, type } = req.query;
  
  // Fetch hits based on filters
  let filteredHits;
  if (slug && type) {
    filteredHits = hitStatements.getBySlugAndType.all(slug as string, type as string);
  } else if (slug) {
    filteredHits = hitStatements.getBySlug.all(slug as string);
  } else if (type) {
    filteredHits = hitStatements.getByType.all(type as string);
  } else {
    filteredHits = hitStatements.getAll.all();
  }
  
  // Aggregate stats
  const stats: any = {
    total: filteredHits.length,
    byType: {},
    bySlug: {},
    byIP: {},
    byBrowser: {},
    byOS: {},
    byDevice: {},
    byReferer: {},
    recent: filteredHits.slice(0, 100)
  };
  
  filteredHits.forEach((hit: any) => {
    stats.byType[hit.type] = (stats.byType[hit.type] || 0) + 1;
    stats.bySlug[hit.slug] = (stats.bySlug[hit.slug] || 0) + 1;
    stats.byIP[hit.ip] = (stats.byIP[hit.ip] || 0) + 1;
    stats.byBrowser[hit.browser] = (stats.byBrowser[hit.browser] || 0) + 1;
    stats.byOS[hit.os] = (stats.byOS[hit.os] || 0) + 1;
    stats.byDevice[hit.device] = (stats.byDevice[hit.device] || 0) + 1;
    stats.byReferer[hit.referer] = (stats.byReferer[hit.referer] || 0) + 1;
  });
  
res.json(stats);
});

// Admin API - API Token management
app.get('/admin/tokens', authAdmin, (req, res) => {
  const tokens = tokenStatements.list.all() as APITokenRow[];
  res.json({ tokens });
});

app.post('/admin/tokens', authAdmin, (req, res) => {
  const { name, scopes } = req.body as { name?: string; scopes?: string[] };
  if (!name || !Array.isArray(scopes) || scopes.length === 0) {
    return res.status(400).json({ error: 'name and scopes[] are required' });
  }
  
  // Sanitize token name
  const safeName = sanitizeString(name, 100);
  
  // Validate scopes
  const validScopes = ['links', 'hits', 'blacklist', 'export', 'stats'];
  const safeScopes = scopes.filter(s => validScopes.includes(s));
  if (safeScopes.length === 0) {
    return res.status(400).json({ error: 'at least one valid scope is required' });
  }
  
  const scopeStr = safeScopes.join(',');
  const token = require('crypto').randomBytes(24).toString('hex');
  try {
    tokenStatements.create.run(safeName, token, scopeStr);
    res.json({ success: true, token, name: safeName, scopes: safeScopes });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create token' });
  }
});

app.delete('/admin/tokens/:id', authAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  const result = tokenStatements.delete.run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Token not found' });
  res.json({ success: true, id });
});

// Admin API - Get recent hits
app.get('/admin/hits', authAdmin, (req, res) => {
  const limit = parseInt(req.query.limit as string || '100', 10);
  const hits = hitStatements.getRecent.all(limit);
  res.json({ hits });
});

// Admin API - Export hits as CSV
app.get('/admin/export/csv', authAdmin, (req, res) => {
  const { slug, type } = req.query;
  
  // Fetch hits based on filters
  let filteredHits;
  if (slug && type) {
    filteredHits = hitStatements.getBySlugAndType.all(slug as string, type as string);
  } else if (slug) {
    filteredHits = hitStatements.getBySlug.all(slug as string);
  } else if (type) {
    filteredHits = hitStatements.getByType.all(type as string);
  } else {
    filteredHits = hitStatements.getAll.all();
  }
  
  // Generate CSV
  const headers = ['ID', 'Type', 'Slug', 'IP', 'Timestamp', 'Browser', 'OS', 'Device', 'Referer', 'Language', 'Query Params', 'Session ID', 'Visitor ID', 'Extra'];
  const rows = (filteredHits as any[]).map(h => [
    h.id,
    h.type,
    h.slug,
    h.ip,
    h.timestamp,
    h.browser,
    h.os,
    h.device,
    h.referer,
    h.accept_language,
    h.query_params || '',
    h.session_id || '',
    h.visitor_id || '',
    h.extra || ''
  ]);
  
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  
  res.set({
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename="hits-${Date.now()}.csv"`
  });
  
  res.send(csv);
});

// Admin API - Download database
app.get('/admin/download/db', authAdmin, (req, res) => {
  const dbPath = path.join(__dirname, '..', 'data', 'app.db');
  res.download(dbPath, 'app.db');
});

// Admin API - View logs
app.get('/admin/logs', authAdmin, (req, res) => {
  const limit = parseInt(req.query.limit as string || '100', 10);
  const level = req.query.level as string | undefined;
  
  let logs;
  if (level && ['info', 'warn', 'error'].includes(level)) {
    logs = logStatements.getByLevel.all(level, limit);
  } else {
    logs = logStatements.getRecent.all(limit);
  }
  
  res.json({ logs });
});

// Admin API - IP Blacklist management
app.get('/admin/blacklist', authAdmin, (req, res) => {
  const blacklist = blacklistStatements.getAll.all();
  res.json({ blacklist });
});

app.post('/admin/blacklist', authAdmin, (req, res) => {
  const rawIp = req.body.ip;
  const rawReason = req.body.reason;
  
  if (!rawIp) {
    return res.status(400).json({ error: 'ip is required' });
  }
  
  // Sanitize inputs
  const ip = sanitizeString(rawIp, 50);
  const reason = rawReason ? sanitizeString(rawReason, 200) : null;
  
  // Basic IP validation (IPv4 or IPv6)
  const ipv4Regex = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
    return res.status(400).json({ error: 'invalid IP address format' });
  }
  
  try {
    blacklistStatements.insert.run(ip, reason);
    res.json({ success: true, ip, reason });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add to blacklist' });
  }
});

app.delete('/admin/blacklist/:ip', authAdmin, (req, res) => {
  const { ip } = req.params;
  
  try {
    const result = blacklistStatements.delete.run(ip);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'IP not found in blacklist' });
    }
    
    res.json({ success: true, ip });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove from blacklist' });
  }
});

// Token auth middleware for external API
function tokenAuth(requiredScopes: string[]) {
  return function(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization || '';
    let token = '';
    if (header.startsWith('Bearer ')) token = header.slice(7);
    if (!token && typeof req.query.access_token === 'string') token = req.query.access_token as string;
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const row = tokenStatements.getByToken.get(token) as APITokenRow | undefined;
    if (!row) return res.status(401).json({ error: 'Invalid token' });
    const scopes = new Set(row.scopes.split(',').map(s => s.trim()));
    for (const s of requiredScopes) {
      if (!scopes.has(s)) return res.status(403).json({ error: `Missing scope: ${s}` });
    }
    tokenStatements.touch.run(Math.floor(Date.now()/1000), row.id);
    (req as any).apiToken = row;
    next();
  };
}

// Public API (token-protected)
app.get('/api/links', tokenAuth(['links']), (req, res) => {
  const links = linkStatements.getAll.all() as Link[];
  res.json({ links });
});
app.post('/api/links', tokenAuth(['links']), (req, res) => {
  const rawSlug = req.body.slug;
  const rawDestination = req.body.destination;
  if (!rawSlug || !rawDestination) return res.status(400).json({ error: 'slug and destination are required' });
  
  // Validate and sanitize
  const slug = sanitizeString(rawSlug, 100);
  const destination = sanitizeString(rawDestination, 2000);
  
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return res.status(400).json({ error: 'slug must contain only letters, numbers, dashes, and underscores' });
  }
  
  try {
    new URL(destination);
  } catch {
    return res.status(400).json({ error: 'destination must be a valid URL' });
  }
  
  linkStatements.insert.run(slug, destination);
  res.json({ success: true });
});
app.delete('/api/links/:slug', tokenAuth(['links']), (req, res) => {
  const result = linkStatements.delete.run(req.params.slug);
  if (result.changes === 0) return res.status(404).json({ error: 'Link not found' });
  res.json({ success: true });
});

app.get('/api/hits', tokenAuth(['hits']), (req, res) => {
  const { limit = '100', slug, type } = req.query as Record<string,string>;
  let hits: any[];
  if (slug && type) hits = hitStatements.getBySlugAndType.all(slug, type);
  else if (slug) hits = hitStatements.getBySlug.all(slug);
  else if (type) hits = hitStatements.getByType.all(type);
  else hits = hitStatements.getRecent.all(parseInt(limit, 10));
  res.json({ hits });
});

app.get('/api/stats', tokenAuth(['hits']), (req, res) => {
  const { slug, type } = req.query as Record<string,string>;
  let filteredHits: any[];
  if (slug && type) filteredHits = hitStatements.getBySlugAndType.all(slug, type);
  else if (slug) filteredHits = hitStatements.getBySlug.all(slug);
  else if (type) filteredHits = hitStatements.getByType.all(type);
  else filteredHits = hitStatements.getAll.all();
  const stats: any = {
    total: filteredHits.length,
    byType: {}, bySlug: {}, byIP: {}, byBrowser: {}, byOS: {}, byDevice: {}, byReferer: {}
  };
  filteredHits.forEach((hit: any) => {
    stats.byType[hit.type] = (stats.byType[hit.type] || 0) + 1;
    stats.bySlug[hit.slug] = (stats.bySlug[hit.slug] || 0) + 1;
    stats.byIP[hit.ip] = (stats.byIP[hit.ip] || 0) + 1;
    stats.byBrowser[hit.browser] = (stats.byBrowser[hit.browser] || 0) + 1;
    stats.byOS[hit.os] = (stats.byOS[hit.os] || 0) + 1;
    stats.byDevice[hit.device] = (stats.byDevice[hit.device] || 0) + 1;
    stats.byReferer[hit.referer] = (stats.byReferer[hit.referer] || 0) + 1;
  });
  res.json(stats);
});

app.get('/api/export/csv', tokenAuth(['export']), (req, res) => {
  const { slug, type } = req.query as Record<string,string>;
  let filteredHits: any[];
  if (slug && type) filteredHits = hitStatements.getBySlugAndType.all(slug, type);
  else if (slug) filteredHits = hitStatements.getBySlug.all(slug);
  else if (type) filteredHits = hitStatements.getByType.all(type);
  else filteredHits = hitStatements.getAll.all();
  const headers = ['ID','Type','Slug','IP','Timestamp','Browser','OS','Device','Referer','Language','Query Params','Session ID','Visitor ID','Extra'];
const rows = filteredHits.map(h => [h.id,h.type,h.slug,h.ip,h.timestamp,h.browser,h.os,h.device,h.referer,h.accept_language,h.query_params||'',h.session_id||'',h.visitor_id||'',h.extra||'']);
  const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
  res.set({'Content-Type':'text/csv','Content-Disposition':`attachment; filename="hits-${Date.now()}.csv"`});
  res.send(csv);
});

app.get('/api/blacklist', tokenAuth(['blacklist']), (req, res) => {
  const list = blacklistStatements.getAll.all();
  res.json({ blacklist: list });
});
app.post('/api/blacklist', tokenAuth(['blacklist']), (req, res) => {
  const rawIp = req.body.ip;
  const rawReason = req.body.reason;
  if (!rawIp) return res.status(400).json({ error: 'ip is required' });
  
  const ip = sanitizeString(rawIp, 50);
  const reason = rawReason ? sanitizeString(rawReason, 200) : null;
  
  const ipv4Regex = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
    return res.status(400).json({ error: 'invalid IP address format' });
  }
  
  blacklistStatements.insert.run(ip, reason);
  res.json({ success: true });
});
app.delete('/api/blacklist/:ip', tokenAuth(['blacklist']), (req, res) => {
  const result = blacklistStatements.delete.run(req.params.ip);
  if (result.changes === 0) return res.status(404).json({ error: 'IP not found' });
  res.json({ success: true });
});

// 404 catch-all: redirect HTML clients, JSON for APIs
const NOT_FOUND_REDIRECT = process.env.NOT_FOUND_REDIRECT || process.env.ROOT_REDIRECT || 'https://example.com';
app.use((req, res) => {
  // Track 404 hits
  trackHit('redirect', `__404__:${req.path}`, req);
  
  // Log 404s to database
  try {
    logStatements.insert.run(
      new Date().toISOString(),
      'warn',
      `404 Not Found: ${req.method} ${req.path}`,
      req.path,
      req.method,
      404,
      null,
      getClientIP(req),
      null,
      null
    );
  } catch (err) {
    console.error('Error logging 404:', err);
  }
  
  if (req.accepts('html')) {
    return res.redirect(302, NOT_FOUND_REDIRECT);
  }
  res.status(404).json({ error: 'Not found' });
});

// 500 error handler: serve HTML page for browsers
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  
  // Log 500 errors to database
  try {
    logStatements.insert.run(
      new Date().toISOString(),
      'error',
      `500 Internal Error: ${req.method} ${req.path} - ${err.message || 'Unknown error'}`,
      req.path,
      req.method,
      500,
      null,
      getClientIP(req),
      err.stack || null,
      null
    );
  } catch (logErr) {
    console.error('Error logging 500:', logErr);
  }
  
  if (res.headersSent) return next(err);
  if (req.accepts('html')) {
    res.status(500).sendFile(path.join(__dirname, '..', 'public', '500.html'));
  } else {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Link shortener running on port ${PORT}`);
  console.log(`Admin password: ${ADMIN_PASSWORD}`);
  console.log(`Allowed admin IPs: ${ALLOWED_ADMIN_IPS.join(', ')}`);
});
