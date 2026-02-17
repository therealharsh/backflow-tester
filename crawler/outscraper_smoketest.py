#!/usr/bin/env python3
"""
Smoketest script for Outscraper API.

Tests the API connection and basic functionality with a single query.
"""

import os
import sys
from dotenv import load_dotenv
from outscraper import ApiClient


def main():
    """Run a simple test query to verify API functionality."""
    # Load environment
    load_dotenv()

    api_key = os.getenv('OUTSCRAPER_API_KEY')
    if not api_key:
        print("ERROR: OUTSCRAPER_API_KEY not found in environment")
        print("Please create a .env file with your API key:")
        print("  echo 'OUTSCRAPER_API_KEY=your_key_here' > .env")
        sys.exit(1)

    print("=" * 70)
    print("OUTSCRAPER SMOKETEST")
    print("=" * 70)
    print(f"API Key: {api_key[:10]}...")
    print()

    # Initialize client
    print("Initializing Outscraper client...")
    client = ApiClient(api_key=api_key)

    # Test query
    test_query = "backflow testing New York NY USA"
    limit = 10

    print(f"Test query: {test_query}")
    print(f"Limit: {limit}")
    print()
    print("Sending request to Outscraper...")

    try:
        # Try v2 method first
        if hasattr(client, 'google_maps_search_v2'):
            print("Using google_maps_search_v2 method")
            results = client.google_maps_search_v2(
                [test_query],
                limit=limit,
                language='en',
                region='US'
            )
        # Fall back to v1
        elif hasattr(client, 'google_maps_search'):
            print("Using google_maps_search method")
            results = client.google_maps_search(
                [test_query],
                limit=limit,
                language='en',
                region='US'
            )
        else:
            print("ERROR: Client has neither google_maps_search_v2 nor google_maps_search")
            sys.exit(1)

        print()
        print("=" * 70)
        print("SUCCESS!")
        print("=" * 70)

        # Parse results
        if results:
            # Handle nested list structure
            if isinstance(results, list) and len(results) > 0:
                first_batch = results[0]
                if isinstance(first_batch, list):
                    num_results = len(first_batch)
                    print(f"Number of results: {num_results}")

                    if num_results > 0:
                        print()
                        print("First result keys:")
                        first_place = first_batch[0]
                        if isinstance(first_place, dict):
                            for key in sorted(first_place.keys()):
                                print(f"  - {key}")

                            print()
                            print("Sample data from first result:")
                            sample_keys = ['name', 'address', 'phone', 'website', 'rating']
                            for key in sample_keys:
                                if key in first_place:
                                    value = first_place[key]
                                    if isinstance(value, str) and len(value) > 50:
                                        value = value[:47] + "..."
                                    print(f"  {key}: {value}")
                elif isinstance(first_batch, dict):
                    print(f"Number of results: 1")
                    print()
                    print("Result keys:")
                    for key in sorted(first_batch.keys()):
                        print(f"  - {key}")
        else:
            print("No results returned")

        print()
        print("=" * 70)
        print("Smoketest passed! Ready to run full scraper.")
        print("=" * 70)

    except Exception as e:
        print()
        print("=" * 70)
        print("ERROR")
        print("=" * 70)
        print(f"Failed to scrape: {str(e)}")
        print()
        print("Please check:")
        print("  1. Your API key is valid")
        print("  2. You have API credits remaining")
        print("  3. Your network connection is working")
        sys.exit(1)


if __name__ == "__main__":
    main()
