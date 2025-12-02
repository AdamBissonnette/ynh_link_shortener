#!/usr/bin/env python3
"""
Import links from CSV to link shortener API
Usage: python3 import-links.py links.csv
CSV format: slug,destination (no header)
"""

import sys
import csv
import json
import urllib.request
import urllib.error
from typing import Tuple

API_URL = "https://goto.adamnant.com"
API_TOKEN = "5c26f0a4e3f4ee6ef91bdd7e31561c56a5db5f492724abc9"


def create_link(slug: str, destination: str) -> Tuple[bool, str, int]:
    """Create a link via API. Returns (success, message, status_code)."""
    url = f"{API_URL}/api/links"
    
    headers = {
        "Authorization": f"Bearer {API_TOKEN}",
        "Content-Type": "application/json"
    }
    
    data = json.dumps({"slug": slug, "destination": destination}).encode('utf-8')
    
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    
    try:
        with urllib.request.urlopen(req) as response:
            status = response.status
            body = response.read().decode('utf-8')
            return True, body, status
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        return False, body, e.code
    except Exception as e:
        return False, str(e), 0


def import_csv(filename: str):
    """Import links from CSV file."""
    print(f"Importing links from {filename} to {API_URL}...")
    print()
    
    success_count = 0
    failed_count = 0
    
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            
            for row in reader:
                # Skip empty rows
                if not row or len(row) < 2:
                    continue
                
                slug = row[0].strip()
                destination = row[1].strip()
                
                if not slug or not destination:
                    continue
                
                print(f"Creating '{slug}' -> '{destination}'... ", end='', flush=True)
                
                success, message, status_code = create_link(slug, destination)
                
                if success and status_code == 200:
                    print("✓")
                    success_count += 1
                else:
                    print(f"✗ (HTTP {status_code})")
                    print(f"  Response: {message}")
                    failed_count += 1
    
    except FileNotFoundError:
        print(f"Error: File '{filename}' not found")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    
    print()
    print("Import complete!")
    print(f"  Success: {success_count}")
    print(f"  Failed:  {failed_count}")
    
    if failed_count > 0:
        sys.exit(1)


def print_usage():
    """Print usage information."""
    print("Usage: python3 import-links.py <csv_file>")
    print()
    print("CSV format (no header):")
    print("  slug,destination")
    print()
    print("Example:")
    print("  gh,https://github.com")
    print("  docs,https://example.com/docs")
    print()
    print("Configuration:")
    print(f"  API_URL: {API_URL}")
    print(f"  API_TOKEN: {API_TOKEN[:20]}...")
    print()
    print("To change these, edit the script variables at the top.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print_usage()
        sys.exit(1)
    
    csv_file = sys.argv[1]
    import_csv(csv_file)
