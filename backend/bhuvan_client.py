"""
bhuvan_client.py — ISRO Bhuvan OGC WMS & Geospatial Data Integration
Connects directly to official ISRO Bhuvan Geo-portal WMS services for India:
- Watershed Boundaries (cite:bhuvan_watershed)
- National Waterbodies (basemap:waterbody_DEM)
- Land Use / Land Cover (basemap:AN_LULC)
- Drainage Networks
"""

import urllib.parse
from typing import Dict, Any, List

BHUVAN_WMS_VEC_URL = "https://bhuvan-vec1.nrsc.gov.in/bhuvan/wms"
BHUVAN_WMS_RASTER_URL = "https://bhuvan-raster.nrsc.gov.in/bhuvan/wms"

# Official Bhuvan OGC Layer Identifiers verified from GetCapabilities
BHUVAN_LAYERS = {
    "watershed": {
        "layer_name": "cite:bhuvan_watershed",
        "title": "ISRO Bhuvan Watershed Boundaries (PMKSY-WDC)",
        "service_url": BHUVAN_WMS_VEC_URL,
        "format": "image/png",
        "transparent": True,
    },
    "waterbodies": {
        "layer_name": "basemap:waterbody_DEM",
        "title": "ISRO Bhuvan Water Bodies & Surface Water",
        "service_url": BHUVAN_WMS_VEC_URL,
        "format": "image/png",
        "transparent": True,
    },
    "lulc": {
        "layer_name": "basemap:AN_LULC",
        "title": "ISRO Bhuvan National Land Use / Land Cover (1:50,000)",
        "service_url": BHUVAN_WMS_VEC_URL,
        "format": "image/png",
        "transparent": True,
    },
    "drainage": {
        "layer_name": "nuis:AND_PB_drainage_line",
        "title": "ISRO Bhuvan National Drainage Network",
        "service_url": BHUVAN_WMS_VEC_URL,
        "format": "image/png",
        "transparent": True,
    }
}

def get_bhuvan_wms_config(layer_key: str = "watershed") -> Dict[str, Any]:
    """Returns Cesium-compatible WebMapService configuration for official Bhuvan layers."""
    cfg = BHUVAN_LAYERS.get(layer_key, BHUVAN_LAYERS["watershed"])
    return {
        "url": cfg["service_url"],
        "layers": cfg["layer_name"],
        "parameters": {
            "service": "WMS",
            "version": "1.1.1",
            "request": "GetMap",
            "format": cfg["format"],
            "transparent": "true",
            "srs": "EPSG:4326"
        },
        "attribution": "© ISRO / NRSC Bhuvan Geospatial Services (Govt of India)"
    }

def build_bhuvan_getmap_url(layer_key: str, bbox: List[float], width: int = 512, height: int = 512) -> str:
    """
    Builds a direct GetMap image URL for a given bounding box [min_lon, min_lat, max_lon, max_lat].
    """
    cfg = BHUVAN_LAYERS.get(layer_key, BHUVAN_LAYERS["watershed"])
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "LAYERS": cfg["layer_name"],
        "STYLES": "",
        "SRS": "EPSG:4326",
        "BBOX": f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}",
        "WIDTH": str(width),
        "HEIGHT": str(height),
        "FORMAT": cfg["format"],
        "TRANSPARENT": "TRUE"
    }
    return f"{cfg['service_url']}?{urllib.parse.urlencode(params)}"
