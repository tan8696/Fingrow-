import sys
import json
import urllib.request
import urllib.parse

def fetch_osm_data(lat: float, lon: float, category: str, radius: int = 5000):
    # Mapping business categories to OSM tags
    osm_tags = {
        "dairy": '["shop"="dairy"]',
        "grocery": '["shop"~"supermarket|convenience"]',
        "pharmacy": '["amenity"="pharmacy"]',
        "restaurant": '["amenity"~"restaurant|cafe|fast_food"]',
        "tailoring": '["shop"="tailor"]',
        "clothing": '["shop"="clothes"]'
    }
    
    tag = osm_tags.get(category.lower(), '["shop"]') # default to generic shop
    
    query = f"""
    [out:json];
    node{tag}(around:{radius},{lat},{lon});
    out 10;
    """
    
    url = "https://overpass-api.de/api/interpreter"
    data = query.encode('utf-8')
    
    try:
        req = urllib.request.Request(url, data=data)
        req.add_header('User-Agent', 'RuralBusinessAdvisory/1.0')
        req.add_header('Accept', 'application/json')
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            
        competitors = []
        for element in result.get('elements', []):
            competitors.append({
                'id': element.get('id'),
                'lat': element.get('lat'),
                'lon': element.get('lon'),
                'tags': element.get('tags', {})
            })
            
        output = {
            "query_lat": lat,
            "query_lon": lon,
            "category": category,
            "competitor_count": len(competitors),
            "competitors": competitors
        }
        print(json.dumps(output, indent=2))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: python fetch_data.py <lat> <lon> <category>"}))
        sys.exit(1)
        
    try:
        lat = float(sys.argv[1])
        lon = float(sys.argv[2])
        category = sys.argv[3]
        fetch_osm_data(lat, lon, category)
    except ValueError:
        print(json.dumps({"error": "Invalid lat/lon values"}))
        sys.exit(1)
