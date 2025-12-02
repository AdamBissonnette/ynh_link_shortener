import Database from 'better-sqlite3';
import path from 'path';

const DB_FILE = path.join(__dirname, '..', 'data', 'app.db');

// Initialize database connection
export const db = new Database(DB_FILE);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Create links table
db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    slug TEXT PRIMARY KEY,
    destination TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  )
`);

// Create IP blacklist table
db.exec(`
  CREATE TABLE IF NOT EXISTS ip_blacklist (
    ip TEXT PRIMARY KEY,
    reason TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  )
`);

// Create hits table with rate limiting
// Note: minute_key is now a regular column (not generated) to support configurable rate limit windows
db.exec(`
  CREATE TABLE IF NOT EXISTS hits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    slug TEXT NOT NULL,
    ip TEXT,
    timestamp TEXT NOT NULL,
    user_agent TEXT,
    browser TEXT,
    os TEXT,
    device TEXT,
    referer TEXT,
    accept_language TEXT,
    query_params TEXT,
    session_id TEXT,
    visitor_id TEXT,
    extra TEXT,
    minute_key TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    
    UNIQUE(minute_key)
  )
`);

// Create index on minute_key for faster lookups
db.exec(`CREATE INDEX IF NOT EXISTS idx_hits_minute_key ON hits(minute_key)`);

// Note: If you have an existing database with minute_key as a GENERATED column,
// you must run the migration script: node migrate-minute-key.js

// Migration for existing DBs
try { db.exec(`ALTER TABLE hits ADD COLUMN session_id TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE hits ADD COLUMN visitor_id TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE hits ADD COLUMN extra TEXT`); } catch (_) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_hits_session ON hits(session_id)`); } catch (_) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_hits_visitor ON hits(visitor_id)`); } catch (_) {}

// Create indexes for common queries
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_hits_slug ON hits(slug);
  CREATE INDEX IF NOT EXISTS idx_hits_type ON hits(type);
  CREATE INDEX IF NOT EXISTS idx_hits_timestamp ON hits(timestamp);
  CREATE INDEX IF NOT EXISTS idx_hits_created_at ON hits(created_at);
  CREATE INDEX IF NOT EXISTS idx_hits_ip ON hits(ip);
  CREATE INDEX IF NOT EXISTS idx_hits_session ON hits(session_id);
  CREATE INDEX IF NOT EXISTS idx_hits_visitor ON hits(visitor_id);
`);

// API tokens table for external access
db.exec(`
  CREATE TABLE IF NOT EXISTS api_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    scopes TEXT NOT NULL, -- comma-separated list: links,hits,blacklist,export,stats
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    last_used_at INTEGER
  )
`);

// Logs table for performance and error monitoring
db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    level TEXT NOT NULL, -- info, warn, error
    message TEXT NOT NULL,
    path TEXT,
    method TEXT,
    status_code INTEGER,
    duration_ms REAL,
    ip TEXT,
    error_stack TEXT,
    extra TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
  CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
  CREATE INDEX IF NOT EXISTS idx_logs_status ON logs(status_code);
  CREATE INDEX IF NOT EXISTS idx_logs_path ON logs(path);
`);

// Types
export interface Link {
  slug: string;
  destination: string;
  created_at: number;
  updated_at: number;
}

export interface Hit {
  id: number;
  type: string;
  slug: string;
  ip: string;
  timestamp: string;
  user_agent: string;
  browser: string;
  os: string;
  device: string;
  referer: string;
  accept_language: string;
  query_params: string | null;
  session_id: string | null;
  visitor_id: string | null;
  extra: string | null;
  created_at: number;
}

export interface IPBlacklist {
  ip: string;
  reason: string | null;
  created_at: number;
}

export interface APITokenRow {
  id: number;
  name: string;
  token: string;
  scopes: string; // comma-separated
  created_at: number;
  last_used_at: number | null;
}

export interface LogRow {
  id: number;
  timestamp: string;
  level: string;
  message: string;
  path: string | null;
  method: string | null;
  status_code: number | null;
  duration_ms: number | null;
  ip: string | null;
  error_stack: string | null;
  extra: string | null;
  created_at: number;
}

// Prepared statements for links
export const linkStatements = {
  insert: db.prepare<[string, string]>(`
    INSERT INTO links (slug, destination) 
    VALUES (?, ?)
    ON CONFLICT(slug) DO UPDATE SET 
      destination = excluded.destination,
      updated_at = strftime('%s', 'now')
  `),
  
  delete: db.prepare<[string]>(`
    DELETE FROM links WHERE slug = ?
  `),
  
  get: db.prepare<[string]>(`
    SELECT * FROM links WHERE slug = ?
  `),
  
  getAll: db.prepare(`
    SELECT * FROM links ORDER BY created_at DESC
  `),
  
  exists: db.prepare<[string]>(`
    SELECT 1 FROM links WHERE slug = ? LIMIT 1
  `)
};

// Prepared statements for IP blacklist
export const blacklistStatements = {
  insert: db.prepare<[string, string | null]>(`
    INSERT INTO ip_blacklist (ip, reason) VALUES (?, ?)
    ON CONFLICT(ip) DO UPDATE SET reason = excluded.reason
  `),
  
  delete: db.prepare<[string]>(`
    DELETE FROM ip_blacklist WHERE ip = ?
  `),
  
  isBlacklisted: db.prepare<[string]>(`
    SELECT 1 FROM ip_blacklist WHERE ip = ? LIMIT 1
  `),
  
  getAll: db.prepare(`
    SELECT * FROM ip_blacklist ORDER BY created_at DESC
  `)
};

// Prepared statements for API tokens
export const tokenStatements = {
  create: db.prepare<[string, string, string]>(`
    INSERT INTO api_tokens (name, token, scopes) VALUES (?, ?, ?)
  `),
  delete: db.prepare<[number]>(`
    DELETE FROM api_tokens WHERE id = ?
  `),
  list: db.prepare(`
    SELECT * FROM api_tokens ORDER BY created_at DESC
  `),
  getByToken: db.prepare<[string]>(`
    SELECT * FROM api_tokens WHERE token = ? LIMIT 1
  `),
  touch: db.prepare<[number, number]>(`
    UPDATE api_tokens SET last_used_at = ? WHERE id = ?
  `)
};

// Prepared statements for logs
export const logStatements = {
  insert: db.prepare<[
    string, string, string, string | null, string | null, number | null,
    number | null, string | null, string | null, string | null
  ]>(`
    INSERT INTO logs (
      timestamp, level, message, path, method, status_code,
      duration_ms, ip, error_stack, extra
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  
  getRecent: db.prepare<[number]>(`
    SELECT * FROM logs ORDER BY created_at DESC LIMIT ?
  `),
  
  getByLevel: db.prepare<[string, number]>(`
    SELECT * FROM logs WHERE level = ? ORDER BY created_at DESC LIMIT ?
  `),
  
  countByLevel: db.prepare<[string]>(`
    SELECT COUNT(*) as count FROM logs WHERE level = ?
  `),
  
  getErrorsSince: db.prepare<[string]>(`
    SELECT * FROM logs WHERE level = 'error' AND timestamp > ? ORDER BY created_at DESC
  `)
};

// Prepared statements for hits
export const hitStatements = {
  insert: db.prepare<[
    string, string, string, string, string, string, string, string,
    string, string, string | null, string | null, string | null, string | null, string | null
  ]>(`
    INSERT INTO hits (
      type, slug, ip, timestamp, user_agent, browser, os, device,
      referer, accept_language, query_params, session_id, visitor_id, extra, minute_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(minute_key) DO NOTHING
  `),
  
  getCount: db.prepare<[string, string]>(`
    SELECT COUNT(*) as count FROM hits WHERE slug = ? AND type = ?
  `),
  
  getAll: db.prepare(`
    SELECT * FROM hits ORDER BY created_at DESC
  `),
  
  getBySlug: db.prepare<[string]>(`
    SELECT * FROM hits WHERE slug = ? ORDER BY created_at DESC
  `),
  
  getByType: db.prepare<[string]>(`
    SELECT * FROM hits WHERE type = ? ORDER BY created_at DESC
  `),
  
  getBySlugAndType: db.prepare<[string, string]>(`
    SELECT * FROM hits WHERE slug = ? AND type = ? ORDER BY created_at DESC
  `),
  
  getRecent: db.prepare<[number]>(`
    SELECT * FROM hits ORDER BY created_at DESC LIMIT ?
  `),
  
  getTotalCount: db.prepare(`
    SELECT COUNT(*) as count FROM hits
  `),
  
  deleteBySlug: db.prepare<[string]>(`
    DELETE FROM hits WHERE slug = ?
  `)
};

// Helper function to migrate existing links from JSON
export function migrateLinksFromJSON(linksData: Record<string, string>) {
  const insertMany = db.transaction((links: [string, string][]) => {
    for (const [slug, destination] of links) {
      linkStatements.insert.run(slug, destination);
    }
  });
  
  const entries = Object.entries(linksData) as [string, string][];
  insertMany(entries);
}
