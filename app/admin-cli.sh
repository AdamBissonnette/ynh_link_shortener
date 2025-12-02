#!/bin/bash
# Simple CLI tool for managing links
# Usage: ./admin-cli.sh [command] [args...]

API_URL="${API_URL:-http://localhost:3000}"
PASSWORD="${ADMIN_PASSWORD:-changeme}"

case "$1" in
  add)
    if [ -z "$2" ] || [ -z "$3" ]; then
      echo "Usage: $0 add <slug> <destination>"
      exit 1
    fi
    curl -X POST "$API_URL/admin/links" \
      -H "Authorization: Bearer $PASSWORD" \
      -H "Content-Type: application/json" \
      -d "{\"slug\": \"$2\", \"destination\": \"$3\"}"
    echo
    ;;
  
  remove|delete|rm)
    if [ -z "$2" ]; then
      echo "Usage: $0 remove <slug>"
      exit 1
    fi
    curl -X DELETE "$API_URL/admin/links/$2" \
      -H "Authorization: Bearer $PASSWORD"
    echo
    ;;
  
  list|ls)
    curl "$API_URL/admin/links" \
      -H "Authorization: Bearer $PASSWORD" | jq
    ;;
  
  stats)
    QUERY=""
    if [ ! -z "$2" ]; then
      QUERY="?slug=$2"
    fi
    curl "$API_URL/admin/stats$QUERY" \
      -H "Authorization: Bearer $PASSWORD" | jq
    ;;
  
  export)
    QUERY=""
    if [ ! -z "$2" ]; then
      QUERY="?slug=$2"
    fi
    OUTPUT="${3:-hits-$(date +%s).csv}"
    curl "$API_URL/admin/export/csv$QUERY" \
      -H "Authorization: Bearer $PASSWORD" \
      -o "$OUTPUT"
    echo "Exported to $OUTPUT"
    ;;
  
  health)
    curl "$API_URL/health" | jq
    ;;
  
  *)
    echo "Link Shortener Admin CLI"
    echo
    echo "Commands:"
    echo "  add <slug> <destination>  - Add or update a link"
    echo "  remove <slug>             - Remove a link"
    echo "  list                      - List all links"
    echo "  stats [slug]              - Show statistics"
    echo "  export [slug] [file]      - Export hits to CSV"
    echo "  health                    - Check service health"
    echo
    echo "Environment variables:"
    echo "  API_URL         - API endpoint (default: http://localhost:3000)"
    echo "  ADMIN_PASSWORD  - Admin password (default: changeme)"
    exit 1
    ;;
esac
