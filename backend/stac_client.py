"""
stac_client.py — Real Satellite Data Fetcher v2
Uses Microsoft Planetary Computer STAC API (no key required for basic access!)
Also uses AWS Earth Search as fallback (completely free, no key ever needed)
"""

import requests
from datetime import datetime, timedelta

# ── STAC API Endpoints ──
PLANETARY_COMPUTER_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
AWS_EARTH_SEARCH_URL   = "https://earth-search.aws.element84.com/v1"

# ── India Watershed Bounding Boxes ──
BBOXES = {
    # Benchmark Watersheds & Rivers
    "rajasthan":   [73.5,  25.0,  76.5, 28.0],
    "arvari":      [76.1,  27.0,  76.6, 27.4],  # Alwar, Rajasthan community watershed
    "alwar":       [76.3,  27.2,  76.9, 27.8],  # Alwar Arvari watershed cradle
    "bundelkhand": [78.2,  24.2,  80.5, 26.0],  # MP/UP drought-prone plateau
    "narmada":     [76.0,  21.8,  79.5, 23.2],  # Narmada sub-basin
    "pune":        [73.5,  18.2,  74.4, 19.0],  # Deccan plateau watershed
    "maharashtra": [73.0,  18.0,  76.0, 20.5],
    "ralegan":     [74.3,  18.9,  74.5, 19.1],  # Ralegan Siddhi model watershed
    "hiware":      [74.7,  19.0,  74.9, 19.2],  # Hiware Bazar model watershed
    "kaveri":      [76.5,  10.8,  79.8, 12.5],  # Cauvery basin
    "godavari":    [77.0,  18.5,  81.5, 20.0],
    "assam":       [89.5,  25.5,  92.5, 27.5],
    "punjab":      [73.0,  29.5,  76.5, 32.5],
    "bengaluru":   [77.3,  12.8,  77.8, 13.2],
    "bellandur":   [77.6,  12.9,  77.7, 12.95], # Bellandur Lake catchment
    "uttarakhand": [78.0,  29.5,  80.5, 31.5],
    "chilika":     [85.0,  19.5,  85.8, 20.2],
    "delhi":       [76.8,  28.4,  77.4, 28.9],
    "mumbai":      [72.7,  18.9,  73.1, 19.3],

    # High-Priority Disaster & Hazard Zones
    "chamoli":     [79.2,  30.2,  79.9, 30.8],  # Chamoli flash flood / Rishi Ganga
    "joshimath":   [79.5,  30.5,  79.7, 30.6],  # Joshimath subsidence zone
    "kedarnath":   [79.0,  30.7,  79.1, 30.8],  # Mandakini valley flash flood
    "wayanad":     [75.9,  11.5,  76.3, 11.9],  # Wayanad Western Ghats landslide zone
    "meppadi":     [76.0,  11.5,  76.2, 11.6],  # Meppadi landslide runout
    "mandi":       [76.8,  31.6,  77.1, 31.8],  # Beas river flash flood
    "shimla":      [77.0,  31.0,  77.3, 31.2],
    "kullu":       [77.0,  31.8,  77.3, 32.1],
    "ladakh":      [76.5,  33.5,  78.5, 35.0],  # Cold desert high altitude
    "kashmir":     [74.0,  33.5,  75.5, 34.5],  # Jhelum river basin

    # Drought & Ground Water Depletion Zones
    "marathwada":  [75.0,  18.0,  77.5, 20.0],  # Drought-stressed Marathwada
    "vidarbha":    [77.5,  19.5,  80.0, 21.5],  # Vidarbha agricultural drought
    "aurangabad":  [75.1,  19.7,  75.5, 20.0],  # Chhatrapati Sambhajinagar
    "solapur":     [75.7,  17.5,  76.2, 17.9],
    "latur":       [76.4,  18.2,  76.8, 18.6],  # Latur drought crisis zone
    "rayalaseema": [77.0,  13.5,  79.5, 16.0],  # Arid Rayalaseema
    "anantapur":   [77.4,  14.5,  77.8, 14.8],  # Semi-arid rain-shadow
    "kurnool":     [77.8,  15.6,  78.3, 16.0],

    # Fluvial, Island & Coastal Estuarine Zones
    "majuli":      [94.0,  26.8,  94.4, 27.1],  # Brahmaputra river island siltation
    "sundarbans":  [88.5,  21.6,  89.2, 22.4],  # Mangrove delta & saline ingress
    "chambal":     [76.5,  25.5,  79.0, 27.0],  # Chambal ravines & gully erosion
    "kutch":       [69.0,  23.0,  71.0, 24.5],  # Rann of Kutch saline wetlands
    "gir":         [70.5,  21.0,  71.2, 21.5],  # Gir dry deciduous forest canopy
    "thar":        [70.0,  25.5,  72.5, 28.0],  # Thar desert sand dunes
    "jaisalmer":   [70.5,  26.7,  71.5, 27.5],
    "jodhpur":     [72.8,  26.1,  73.3, 26.5],
    "udaipur":     [73.5,  24.4,  74.0, 24.8],  # Aravalli lake catchments
    "idukki":      [76.8,   9.7,  77.2, 10.1],  # Western Ghats reservoir catchment
}


def _fix_s3_url(url: str, scene_id: str = None) -> str:
    """
    Convert s3://bucket/key -> https://bucket.s3.amazonaws.com/key
    If it's a directory path (no image extension), append the quick-look suffix.
    """
    if not url:
        return url
    if url.startswith("s3://"):
        parts = url[5:].split("/", 1)
        bucket = parts[0]
        key    = parts[1] if len(parts) > 1 else ""
        url    = f"https://{bucket}.s3.amazonaws.com/{key}"
    # If path has no image extension, it's a scene directory — append quick-look
    ext = url.split("?")[0].lower().split(".")[-1]
    if ext not in ("jpg", "jpeg", "png", "webp", "tif", "tiff"):
        url = url.rstrip("/") + "/preview/quick-look.png"
    return url


def _best_thumbnail(assets: dict) -> str | None:
    """Extract the best publicly accessible thumbnail from a STAC assets dict."""
    for key in ["thumbnail", "rendered_preview", "overview", "visual", "preview"]:
        href = assets.get(key, {}).get("href")
        if href:
            fixed = _fix_s3_url(href)
            print(f"Thumbnail [{key}]: {fixed[:80]}")
            return fixed
    return None


def search_sentinel2(bbox: list, date_from: str = None, date_to: str = None, max_cloud: int = 40) -> dict:
    """
    Search for Sentinel-2 optical imagery via AWS Earth Search (FREE, no key needed).
    Returns the best (least cloudy) scene thumbnail URL.
    """
    try:
        payload = {
            "collections": ["sentinel-2-l2a"],
            "bbox": bbox,
            "limit": 10,
        }
        if date_from and date_to:
            payload["datetime"] = f"{date_from}T00:00:00Z/{date_to}T23:59:59Z"

        resp = requests.post(f"{AWS_EARTH_SEARCH_URL}/search", json=payload, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        features = data.get("features", [])
        if not features:
            return {"success": False, "error": "No scenes found", "image_url": None}

        # Filter and sort by cloud cover
        valid_features = []
        for feat in features:
            cc = feat.get("properties", {}).get("eo:cloud_cover", 100)
            valid_features.append((cc, feat))

        valid_features.sort(key=lambda x: x[0])
        best = valid_features[0][1]
        props  = best.get("properties", {})
        assets = best.get("assets", {})

        thumb_url = _best_thumbnail(assets)

        return {
            "success":     True,
            "scene_id":    best.get("id"),
            "cloud_cover": round(props.get("eo:cloud_cover", 0), 1),
            "date":        props.get("datetime", "")[:10],
            "sensor":      "Sentinel-2 L2A (10m-20m MSI)",
            "image_url":   thumb_url,
            "bbox":        best.get("bbox"),
        }

    except requests.exceptions.Timeout:
        return {"success": False, "error": "STAC API timeout", "image_url": None}
    except Exception as e:
        return {"success": False, "error": str(e), "image_url": None}


def search_sentinel1_sar(bbox: list, date_from: str, date_to: str) -> dict:
    """
    Search for Sentinel-1 SAR imagery via AWS Earth Search.
    SAR penetrates clouds — perfect for flood detection!
    """
    try:
        payload = {
            "collections": ["sentinel-1-grd"],
            "bbox": bbox,
            "datetime": f"{date_from}T00:00:00Z/{date_to}T23:59:59Z",
            "limit": 5,
        }
        resp = requests.post(f"{AWS_EARTH_SEARCH_URL}/search", json=payload, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        features = data.get("features", [])
        if not features:
            return search_sentinel1_planetary_computer(bbox, date_from, date_to)

        best   = features[0]
        props  = best.get("properties", {})
        assets = best.get("assets", {})

        thumb_url = _best_thumbnail(assets)

        # If we still have no HTTPS thumbnail, try Planetary Computer
        if not thumb_url:
            pc_result = search_sentinel1_planetary_computer(bbox, date_from, date_to)
            if pc_result.get("image_url"):
                thumb_url = pc_result["image_url"]

        return {
            "success":      True,
            "scene_id":     best.get("id"),
            "cloud_cover":  0,
            "date":         props.get("datetime", "")[:10],
            "sensor":       "Sentinel-1 SAR (GRD)",
            "image_url":    thumb_url,
            "polarization": props.get("sar:polarizations", ["VV", "VH"]),
            "bbox":         best.get("bbox"),
        }

    except Exception as e:
        return {"success": False, "error": str(e), "image_url": None}


def search_sentinel1_planetary_computer(bbox: list, date_from: str, date_to: str) -> dict:
    """Fallback: Search Sentinel-1 RTC on Microsoft Planetary Computer."""
    try:
        payload = {
            "collections": ["sentinel-1-rtc"],
            "bbox": bbox,
            "datetime": f"{date_from}T00:00:00Z/{date_to}T23:59:59Z",
            "limit": 3,
        }
        resp = requests.post(f"{PLANETARY_COMPUTER_URL}/search", json=payload, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        features = data.get("features", [])
        if not features:
            return {"success": False, "error": "No SAR scenes found", "image_url": None}

        best   = features[0]
        props  = best.get("properties", {})
        assets = best.get("assets", {})
        thumb_url = _best_thumbnail(assets)

        return {
            "success":     True,
            "scene_id":    best.get("id"),
            "cloud_cover": 0,
            "date":        props.get("datetime", "")[:10],
            "sensor":      "Sentinel-1 RTC",
            "image_url":   thumb_url,
            "bbox":        best.get("bbox"),
        }
    except Exception as e:
        return {"success": False, "error": str(e), "image_url": None}


def fetch_satellite_image(lon: float, lat: float, date_range: str = None, use_sar: bool = False) -> dict:
    """Main function called by FastAPI."""
    if not date_range:
        today    = datetime.utcnow()
        past     = today - timedelta(days=30)
        date_from = past.strftime("%Y-%m-%d")
        date_to   = today.strftime("%Y-%m-%d")
    else:
        date_from, date_to = date_range.split("/")

    bbox = [lon - 0.5, lat - 0.5, lon + 0.5, lat + 0.5]

    if use_sar:
        return search_sentinel1_sar(bbox, date_from, date_to)
    else:
        return search_sentinel2(bbox, date_from, date_to, max_cloud=30)


def get_bbox_for_location(location_name: str) -> list:
    """Returns the bounding box for a known India location."""
    name = location_name.lower()
    for key, bbox in BBOXES.items():
        if key in name:
            return bbox
    return [68.0, 8.0, 97.0, 37.0]


def get_real_weather(lat: float, lon: float) -> dict:
    try:
        url = (f"https://api.open-meteo.com/v1/forecast"
               f"?latitude={lat}&longitude={lon}"
               f"&current=temperature_2m,precipitation,rain"
               f"&timezone=Asia/Kolkata")
        r = requests.get(url, timeout=6)
        if r.status_code == 200:
            return r.json().get("current", {})
    except Exception:
        pass
    return {}
