A high-performance link shortening and analytics tracking service built with TypeScript, Node.js, Express, and SQLite.

## Features

- **Ultra-fast redirects** with in-memory caching
- **Built-in analytics** tracking visits, referrers, UTM parameters
- **IP blacklisting** to block abusive traffic
- **Rate limiting** to prevent spam (one hit per IP per link per minute)
- **Bot detection** via isbot library
- **Pixel tracking** for email/webpage analytics
- **Web admin interface** for managing links and viewing analytics
- **API tokens** for programmatic access
- **TypeScript** for type safety and reliability
- **SQLite database** - simple, fast, zero configuration

All link data and analytics are stored in a single SQLite database for easy backup and portability.
