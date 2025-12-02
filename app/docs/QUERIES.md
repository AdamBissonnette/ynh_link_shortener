# SQLite Query Examples

The hit tracking data is stored in `data/hits.db`. Here are some useful queries for analytics:

## Basic Queries

### View all hits
```sql
SELECT * FROM hits ORDER BY created_at DESC LIMIT 100;
```

### Count hits by slug
```sql
SELECT slug, COUNT(*) as count 
FROM hits 
GROUP BY slug 
ORDER BY count DESC;
```

### Count hits by referer
```sql
SELECT referer, COUNT(*) as count 
FROM hits 
GROUP BY referer 
ORDER BY count DESC;
```

## Attribution Queries

### View hits with query parameters (UTM tracking, etc.)
```sql
SELECT slug, query_params, referer, timestamp 
FROM hits 
WHERE query_params IS NOT NULL 
ORDER BY created_at DESC;
```

### Count conversions by UTM source
```sql
SELECT 
  json_extract(query_params, '$.utm_source') as utm_source,
  COUNT(*) as count
FROM hits 
WHERE query_params IS NOT NULL 
  AND json_extract(query_params, '$.utm_source') IS NOT NULL
GROUP BY utm_source
ORDER BY count DESC;
```

### Count conversions by UTM campaign
```sql
SELECT 
  json_extract(query_params, '$.utm_campaign') as campaign,
  COUNT(*) as count
FROM hits 
WHERE query_params IS NOT NULL 
  AND json_extract(query_params, '$.utm_campaign') IS NOT NULL
GROUP BY campaign
ORDER BY count DESC;
```

### Full attribution breakdown (source + campaign + referer)
```sql
SELECT 
  slug,
  json_extract(query_params, '$.utm_source') as source,
  json_extract(query_params, '$.utm_campaign') as campaign,
  json_extract(query_params, '$.utm_medium') as medium,
  referer,
  COUNT(*) as count
FROM hits 
WHERE query_params IS NOT NULL
GROUP BY slug, source, campaign, medium, referer
ORDER BY count DESC;
```

## Time-based Queries

### Hits in the last 24 hours
```sql
SELECT * FROM hits 
WHERE created_at > strftime('%s', 'now', '-1 day')
ORDER BY created_at DESC;
```

### Hits by hour (last 7 days)
```sql
SELECT 
  strftime('%Y-%m-%d %H:00', timestamp) as hour,
  COUNT(*) as count
FROM hits
WHERE created_at > strftime('%s', 'now', '-7 days')
GROUP BY hour
ORDER BY hour DESC;
```

### Daily hit counts
```sql
SELECT 
  DATE(timestamp) as date,
  COUNT(*) as count
FROM hits
GROUP BY date
ORDER BY date DESC;
```

## Device & Browser Analytics

### Hits by browser
```sql
SELECT browser, COUNT(*) as count 
FROM hits 
GROUP BY browser 
ORDER BY count DESC;
```

### Hits by device type
```sql
SELECT device, COUNT(*) as count 
FROM hits 
GROUP BY device 
ORDER BY count DESC;
```

### Mobile vs Desktop breakdown by slug
```sql
SELECT 
  slug,
  SUM(CASE WHEN device = 'mobile' THEN 1 ELSE 0 END) as mobile,
  SUM(CASE WHEN device = 'desktop' THEN 1 ELSE 0 END) as desktop,
  COUNT(*) as total
FROM hits
GROUP BY slug;
```

## Advanced Queries

### Top referers by slug
```sql
SELECT slug, referer, COUNT(*) as count 
FROM hits 
WHERE referer != 'Direct'
GROUP BY slug, referer 
ORDER BY slug, count DESC;
```

### Unique IPs per slug
```sql
SELECT slug, COUNT(DISTINCT ip) as unique_visitors
FROM hits
GROUP BY slug
ORDER BY unique_visitors DESC;
```

### Conversion rate by referer (for a specific slug)
```sql
SELECT 
  referer,
  COUNT(*) as clicks,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM hits WHERE slug = 'example'), 2) as percentage
FROM hits
WHERE slug = 'example'
GROUP BY referer
ORDER BY clicks DESC;
```

## Running Queries

### From command line
```bash
sqlite3 data/hits.db "YOUR_QUERY_HERE"
```

### With better formatting
```bash
sqlite3 -header -column data/hits.db "YOUR_QUERY_HERE"
```

### Export to CSV
```bash
sqlite3 -header -csv data/hits.db "YOUR_QUERY_HERE" > output.csv
```

### Interactive mode
```bash
sqlite3 data/hits.db
# Then type queries at the prompt
# Use .quit to exit
```
