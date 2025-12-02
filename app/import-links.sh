#!/bin/bash

# Import links from CSV to link shortener API
# Usage: ./import-links.sh links.csv
# CSV format: slug,destination (no header)

set -e

API_URL="${API_URL:-https://goto.adamnant.com}"
API_TOKEN="${API_TOKEN:-5c26f0a4e3f4ee6ef91bdd7e31561c56a5db5f492724abc9}"

if [ $# -eq 0 ]; then
    echo "Usage: $0 <csv_file>"
    echo ""
    echo "CSV format (no header):"
    echo "  slug,destination"
    echo ""
    echo "Example:"
    echo "  gh,https://github.com"
    echo "  docs,https://example.com/docs"
    echo ""
    echo "Environment variables:"
    echo "  API_URL    - API endpoint (default: https://goto.adamnant.com)"
    echo "  API_TOKEN  - API token for authentication"
    exit 1
fi

CSV_FILE="$1"

if [ ! -f "$CSV_FILE" ]; then
    echo "Error: File '$CSV_FILE' not found"
    exit 1
fi

echo "Importing links from $CSV_FILE to $API_URL..."
echo ""

success=0
failed=0

while IFS=, read -r slug destination; do
    # Skip empty lines
    if [ -z "$slug" ] || [ -z "$destination" ]; then
        continue
    fi
    
    # Trim whitespace
    slug=$(echo "$slug" | xargs)
    destination=$(echo "$destination" | xargs)
    
    echo -n "Creating '$slug' -> '$destination'... "
    
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/links" \
        -H "Authorization: Bearer $API_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"slug\":\"$slug\",\"destination\":\"$destination\"}")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        echo "✓"
        ((success++))
    else
        echo "✗ (HTTP $http_code)"
        echo "  Response: $body"
        ((failed++))
    fi
done < "$CSV_FILE"

echo ""
echo "Import complete!"
echo "  Success: $success"
echo "  Failed:  $failed"

if [ $failed -gt 0 ]; then
    exit 1
fi
