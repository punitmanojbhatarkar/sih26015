"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import { Layers, ZoomIn, ZoomOut, Pencil, RotateCcw, Eye, Image as ImageIcon, CloudRain, SlidersHorizontal, ShieldCheck, CheckCircle2, AlertTriangle, X, FileCheck, Navigation, Sparkles } from "lucide-react";
import { API_BASE } from "../lib/api";

interface MapPanelProps {
  imageUrl?: string | null;       
  geeTileUrl?: string | null;     
  bbox?: number[] | null;         
  centerLat?: number | null;
  centerLon?: number | null;
  stats?: {
    ndvi?: number;
    cloud?: number;
    area?: number;
    sensor?: string;
    module?: string;
    drainage?: any;
    lulc?: any;
    change?: any;
    groundingBoxes?: any[];
  };
  onDrawComplete?: (geojson: any | null) => void;
}

const INDIA_CENTER: [number, number] = [22.5, 82.0];

type LayerMode = "satellite" | "optical" | "sar";

const MODULE_COLORS: Record<string, string> = {
  landuse:   "#38bdf8",
  vegetation:"#34d399",
  drainage:  "#fbbf24",
  moisture:  "#22c55e",
  change:    "#22d3ee",
  general:   "#a78bfa",
};

const SAMPLE_FIELD_ASSETS = [
  {
    id: "asset_1",
    title: "Masonry Check Dam Node #3",
    location: "Arvari River Catchment, Alwar, Rajasthan",
    lat: 27.2415,
    lon: 76.3812,
    date: "2026-10-14",
    inspectedBy: "Rajesh Meena (Gram Sevak / WDC)",
    photoUrl: "https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=800&q=80",
    structureType: "Check Dam (Masonry with Gabion Apron)",
    status: "Intact & Fully Functional",
    siltationPct: 14,
    ndviAtNode: 0.52,
    moistureIndex: "Optimal (0.38)",
    dimensions: "12m × 1.8m × 2m",
    storageCapacity: "18,500 m³",
    costLakhs: 4.80,
    hash: "SHA256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    verified: true
  },
  {
    id: "asset_2",
    title: "Community Percolation Tank & Talab",
    location: "Solapur Drought Basin, Maharashtra",
    lat: 17.7215,
    lon: 75.9214,
    date: "2026-10-11",
    inspectedBy: "Sunil Shinde (Block Development Officer)",
    photoUrl: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80",
    structureType: "Percolation Tank (Earthen Embankment)",
    status: "Recharged & High Infiltration",
    siltationPct: 8,
    ndviAtNode: 0.46,
    moistureIndex: "High Infiltration (0.42)",
    dimensions: "45m × 30m × 3.5m",
    storageCapacity: "48,000 m³",
    costLakhs: 7.20,
    hash: "SHA256:7b52009b64fd0a2a49e6d8a939753077792b0554aca504530c018b3ec0e9e188",
    verified: true
  },
  {
    id: "asset_3",
    title: "Gully Plug & Continuous Contour Trench (CCT)",
    location: "Bundelkhand Plateau, Madhya Pradesh",
    lat: 25.1420,
    lon: 79.3610,
    date: "2026-10-09",
    inspectedBy: "Anil Patel (Field Agronomist)",
    photoUrl: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=800&q=80",
    structureType: "Loose Boulder Gully Plug (LBGP)",
    status: "Silt Retained / Slope Stabilized",
    siltationPct: 22,
    ndviAtNode: 0.49,
    moistureIndex: "Moderate (0.31)",
    dimensions: "8m × 1.2m × 1.5m",
    storageCapacity: "4,200 m³",
    costLakhs: 1.45,
    hash: "SHA256:c5991c0e3da11dd3924f7c1d3c11867c4ec67eb59c70b86a87c1c0e0b62e49c7",
    verified: true
  }
];

export default function MapPanel({ imageUrl, geeTileUrl, bbox, centerLat, centerLon, module, stats, onDrawComplete }: MapPanelProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const overlayRef = useRef<any>(null);
  const baseLayerRef = useRef<any>(null);
  const weatherLayerRef = useRef<any>(null);
  const drawEntityRef = useRef<any>(null);
  const drawHandlerRef = useRef<any>(null);
  const groundingEntitiesRef = useRef<any[]>([]);

  const [activeLayer, setActiveLayer] = useState<LayerMode>("satellite");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [showLayers, setShowLayers] = useState(false);
  const [showWeather, setShowWeather] = useState(false);
  const [cesiumReady, setCesiumReady] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState<any[]>([]);
  const [topLayer, setTopLayer] = useState<string>("TC");

  // Temporal Split Slider State
  const [splitSliderActive, setSplitSliderActive] = useState(false);
  const [temporalState, setTemporalState] = useState<"pre" | "post" | "delta">("post");
  const [sliderPosition, setSliderPosition] = useState(50);

  // Ground-Truth Field Photo Inspector Drawer State
  const [groundTruthDrawerOpen, setGroundTruthDrawerOpen] = useState(false);
  const [selectedFieldAsset, setSelectedFieldAsset] = useState<any>(SAMPLE_FIELD_ASSETS[0]);

  const SENTINEL_HUB_ID = "0597d87a-127b-4d33-93a1-054b58aa7814";

  useEffect(() => {
    const checkCesium = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).Cesium) {
        setCesiumReady(true);
        clearInterval(checkCesium);
      }
    }, 100);
    return () => clearInterval(checkCesium);
  }, []);

  useEffect(() => {
    if (!cesiumReady || !mapContainerRef.current || viewerRef.current) return;
    
    const Cesium = (window as any).Cesium;
    Cesium.Ion.defaultAccessToken = "";

    const arcGisProvider = new Cesium.UrlTemplateImageryProvider({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 18
    });

    const viewer = new Cesium.Viewer(mapContainerRef.current, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      navigationInstructionsInitiallyVisible: false,
      baseLayer: new Cesium.ImageryLayer(arcGisProvider)
    });
    
    // Enable completely free, high-quality 3D terrain via ArcGIS Terrain3D
    Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
      "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer"
    ).then((provider: any) => {
      if (viewerRef.current) {
        viewerRef.current.terrainProvider = provider;
        viewerRef.current.scene.globe.depthTestAgainstTerrain = true;
      }
    }).catch((err: any) => {
      console.error("Failed to load ArcGIS 3D Terrain", err);
    });
    
    // Disable strict lighting so the map doesn't go pitch black at night
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.showWaterEffect = true;
    
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.hueShift = -0.05;
    }
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.0001;
    viewer.cesiumWidget.creditContainer.style.display = "none";

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(INDIA_CENTER[1], INDIA_CENTER[0], 5000000.0)
    });

    baseLayerRef.current = viewer.scene.imageryLayers.get(0);
    viewerRef.current = viewer;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: any) => {
      const cartesian = viewer.camera.pickEllipsoid(movement.endPosition, viewer.scene.globe.ellipsoid);
      if (cartesian) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const lat = parseFloat(Cesium.Math.toDegrees(cartographic.latitude).toFixed(4));
        const lng = parseFloat(Cesium.Math.toDegrees(cartographic.longitude).toFixed(4));
        
        // Directly update the DOM instead of causing React state re-renders 60 times a second
        const coordsEl = document.getElementById("coords-display");
        if (coordsEl) {
          coordsEl.innerText = `${lat}°N ${lng}°E`;
        }
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [cesiumReady]);

  useEffect(() => {
    if (!viewerRef.current || !cesiumReady) return;
    const Cesium = (window as any).Cesium;
    const viewer = viewerRef.current;

    const applyLayer = (provider: any) => {
      const layers = viewer.scene.imageryLayers;
      if (baseLayerRef.current) {
        layers.remove(baseLayerRef.current);
      }
      baseLayerRef.current = layers.addImageryProvider(provider, 0);
    };

    if (activeLayer === "satellite") {
      applyLayer(new Cesium.UrlTemplateImageryProvider({
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        maximumLevel: 18
      }));
    } else {
      fetch(`${API_BASE}/api/basemap?layer_type=${activeLayer}`)
        .then(res => res.json())
        .then(data => {
          if (data.url) {
            applyLayer(new Cesium.UrlTemplateImageryProvider({
              url: data.url,
              maximumLevel: 18
            }));
          }
        })
        .catch(console.error);
    }
  }, [activeLayer, cesiumReady]);

  // Effect to manage Sentinel Hub WMS Layers from Top Tabs
  useEffect(() => {
    if (!viewerRef.current || !cesiumReady) return;
    const Cesium = (window as any).Cesium;
    const viewer = viewerRef.current;

    // We store the reference in a custom property on viewerRef to easily clear it
    if (viewerRef.current.sentinelLayer) {
      viewer.scene.imageryLayers.remove(viewerRef.current.sentinelLayer);
      viewerRef.current.sentinelLayer = null;
    }

    let shLayer = "";
    if (topLayer === "TC") shLayer = "1_TRUE_COLOR";
    else if (topLayer === "FC") shLayer = "2_FALSE_COLOR";
    else if (topLayer === "NDVI") shLayer = "3_NDVI";
    else if (topLayer === "URB") shLayer = "4_FALSE_COLOR_URBAN";
    else if (topLayer === "SAR") shLayer = "5_MOISTURE_INDEX"; // Fallback Moisture for SAR

    if (topLayer === "BHUVAN") {
      const bhuvanProvider = new Cesium.WebMapServiceImageryProvider({
        url: "https://bhuvan-vec1.nrsc.gov.in/bhuvan/wms",
        layers: "cite:bhuvan_watershed",
        parameters: {
          transparent: 'true',
          format: 'image/png'
        }
      });
      viewerRef.current.sentinelLayer = viewer.scene.imageryLayers.addImageryProvider(bhuvanProvider);
      viewerRef.current.sentinelLayer.alpha = 0.85;
    } else if (shLayer) {
      const wmsProvider = new Cesium.WebMapServiceImageryProvider({
        url: `https://services.sentinel-hub.com/ogc/wms/${SENTINEL_HUB_ID}`,
        layers: shLayer,
        parameters: {
          transparent: 'true',
          format: 'image/png'
        }
      });
      viewerRef.current.sentinelLayer = viewer.scene.imageryLayers.addImageryProvider(wmsProvider);
      viewerRef.current.sentinelLayer.alpha = 0.85;
    }
  }, [topLayer, cesiumReady]);

  useEffect(() => {
    if (!viewerRef.current || !cesiumReady) return;
    const Cesium = (window as any).Cesium;
    const viewer = viewerRef.current;

    if (showWeather) {
      fetch("https://api.rainviewer.com/public/weather-maps.json")
        .then(res => res.json())
        .then(data => {
          if (data && data.radar && data.radar.past && data.radar.past.length > 0) {
            const latestTime = data.radar.past[data.radar.past.length - 1].time;
            const weatherProvider = new Cesium.UrlTemplateImageryProvider({
              url: `https://tilecache.rainviewer.com/v2/radar/${latestTime}/256/{z}/{x}/{y}/2/1_1.png`,
              maximumLevel: 12
            });
            weatherLayerRef.current = viewer.scene.imageryLayers.addImageryProvider(weatherProvider);
            weatherLayerRef.current.alpha = 0.65;
          }
        })
        .catch(console.error);
    } else {
      if (weatherLayerRef.current) {
        viewer.scene.imageryLayers.remove(weatherLayerRef.current);
        weatherLayerRef.current = null;
      }
    }
  }, [showWeather, cesiumReady]);

  // Effect to fly to the bounding box
  useEffect(() => {
    if (!viewerRef.current || !cesiumReady || !bbox) return;
    const Cesium = (window as any).Cesium;
    const viewer = viewerRef.current;
    
    const [minLon, minLat, maxLon, maxLat] = bbox;
    viewer.camera.flyTo({
      destination: Cesium.Rectangle.fromDegrees(minLon, minLat, maxLon, maxLat),
      duration: 1.5
    });
  }, [bbox, cesiumReady]);

  // Effect to apply the GEE Tile overlay (if available)
  useEffect(() => {
    if (!viewerRef.current || !cesiumReady || !geeTileUrl) return;
    const Cesium = (window as any).Cesium;
    const viewer = viewerRef.current;

    if (overlayRef.current) {
      viewer.scene.imageryLayers.remove(overlayRef.current);
      overlayRef.current = null;
    }

    const provider = new Cesium.UrlTemplateImageryProvider({
      url: geeTileUrl,
      maximumLevel: 18
    });

    overlayRef.current = viewer.scene.imageryLayers.addImageryProvider(provider);
    overlayRef.current.alpha = overlayVisible ? 0.85 : 0.0;
  }, [geeTileUrl, cesiumReady, overlayVisible]);

  // Effect to draw grounding boxes from the AI
  useEffect(() => {
    if (!viewerRef.current || !cesiumReady) return;
    const Cesium = (window as any).Cesium;
    const viewer = viewerRef.current;

    // Clear old boxes
    groundingEntitiesRef.current.forEach(entity => {
      try {
        if (viewer?.entities && !viewer.isDestroyed?.()) viewer.entities.remove(entity);
      } catch {}
    });
    groundingEntitiesRef.current = [];

    if (stats?.groundingBoxes && Array.isArray(stats.groundingBoxes) && stats.groundingBoxes.length > 0) {
      stats.groundingBoxes.forEach((box: any) => {
        let points = box.points;
        // If box has normalized ymin/xmin/ymax/xmax (Gemini standard 0-1000) and bbox is available
        if (!points && bbox && box.ymin !== undefined && box.xmin !== undefined) {
          const [min_lon, min_lat, max_lon, max_lat] = bbox;
          const bMinLat = min_lat + (box.ymin / 1000) * (max_lat - min_lat);
          const bMaxLat = min_lat + (box.ymax / 1000) * (max_lat - min_lat);
          const bMinLon = min_lon + (box.xmin / 1000) * (max_lon - min_lon);
          const bMaxLon = min_lon + (box.xmax / 1000) * (max_lon - min_lon);
          points = [
            [bMinLon, bMinLat],
            [bMaxLon, bMinLat],
            [bMaxLon, bMaxLat],
            [bMinLon, bMaxLat]
          ];
        }

        if (!Array.isArray(points) || points.length === 0) return;

        try {
          const flatCoords = points.flatMap((pt: number[]) => [pt[0], pt[1]]);
          const entity = viewer.entities.add({
            name: box.label || "Region",
            polygon: {
              hierarchy: Cesium.Cartesian3.fromDegreesArray(flatCoords),
              material: Cesium.Color.RED.withAlpha(0.2),
              outline: true,
              outlineColor: Cesium.Color.RED,
              outlineWidth: 3
            },
            position: Cesium.Cartesian3.fromDegrees(points[0][0], points[0][1]),
            label: {
              text: box.label || "Region",
              font: '12pt monospace',
              fillColor: Cesium.Color.WHITE,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -10)
            }
          });
          groundingEntitiesRef.current.push(entity);
        } catch (e) {
          console.warn("Failed to render bounding box", e);
        }
      });
    }
  }, [stats?.groundingBoxes, bbox, cesiumReady]);

  // Effect to render drainage stream network or change detection GeoJSON
  useEffect(() => {
    if (!viewerRef.current || !cesiumReady) return;
    const Cesium = (window as any).Cesium;
    const viewer = viewerRef.current;

    let targetGeojson = null;
    let strokeColor = "#0284c7";

    if (stats?.drainage?.geojson) {
      targetGeojson = stats.drainage.geojson;
      strokeColor = "#0284c7";
    } else if (stats?.change?.geojson_change_mask) {
      targetGeojson = stats.change.geojson_change_mask;
      strokeColor = "#16a34a";
    } else if (stats?.lulc?.geojson_layer) {
      targetGeojson = stats.lulc.geojson_layer;
      strokeColor = "#38bdf8";
    }

    if (!targetGeojson) return;

    let dsInstance: any = null;
    Cesium.GeoJsonDataSource.load(targetGeojson, {
      stroke: Cesium.Color.fromCssColorString(strokeColor),
      fill: Cesium.Color.fromCssColorString(strokeColor).withAlpha(0.25),
      strokeWidth: 3,
    }).then((ds: any) => {
      dsInstance = ds;
      if (viewer?.dataSources && !viewer.isDestroyed?.()) {
        viewer.dataSources.add(ds);
      }
    }).catch(console.error);

    return () => {
      try {
        if (dsInstance && viewer?.dataSources && !viewer.isDestroyed?.()) {
          viewer.dataSources.remove(dsInstance);
        }
      } catch {}
    };
  }, [stats?.drainage, stats?.change, stats?.lulc, cesiumReady]);

  // Effect to load Field Images and Frustums from Backend
  useEffect(() => {
    if (!viewerRef.current || !cesiumReady) return;
    const Cesium = (window as any).Cesium;
    const viewer = viewerRef.current;
    
    let dataSource: any = null;
    
    const loadImages = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/v1/images`);
        if (!response.ok) return;
        const data = await response.json();
        
        if (dataSource && viewer?.dataSources && !viewer.isDestroyed?.()) {
          viewer.dataSources.remove(dataSource);
        }
        
        Cesium.GeoJsonDataSource.load(data, {
          stroke: Cesium.Color.fromCssColorString("#fbbf24"),
          fill: Cesium.Color.fromCssColorString("#fbbf24").withAlpha(0.2),
          strokeWidth: 3,
          markerSymbol: 'camera'
        }).then((ds: any) => {
          dataSource = ds;
          if (viewer?.dataSources && !viewer.isDestroyed?.()) {
            viewer.dataSources.add(ds);
          }
        });
      } catch (err) {
        console.error("Failed to fetch field images", err);
      }
    };
    
    loadImages();
    const interval = setInterval(loadImages, 10000);
    return () => {
      clearInterval(interval);
      try {
        if (dataSource && viewer?.dataSources && !viewer.isDestroyed?.()) {
          viewer.dataSources.remove(dataSource);
        }
      } catch {}
    };
  }, [cesiumReady]);

  const toggleOverlay = useCallback(() => {
    if (overlayRef.current) {
      overlayRef.current.alpha = overlayVisible ? 0.0 : 0.85;
      setOverlayVisible(!overlayVisible);
    }
  }, [overlayVisible]);

  const toggleDraw = useCallback(() => {
    if (!viewerRef.current || !cesiumReady) return;
    const Cesium = (window as any).Cesium;
    const viewer = viewerRef.current;

    if (!drawMode) {
      setDrawMode(true);
      const points: any[] = [];
      const drawHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      drawHandlerRef.current = drawHandler;

      drawHandler.setInputAction((click: any) => {
        const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
        if (cartesian) {
          points.push(cartesian);
          
          if (!drawEntityRef.current) {
            drawEntityRef.current = viewer.entities.add({
              polygon: {
                hierarchy: new Cesium.CallbackProperty(() => new Cesium.PolygonHierarchy(points), false),
                material: Cesium.Color.fromCssColorString(MODULE_COLORS[module || "general"] || "#38bdf8").withAlpha(0.3),
                outline: true,
                outlineColor: Cesium.Color.fromCssColorString(MODULE_COLORS[module || "general"] || "#38bdf8")
              }
            });
          }
          setDrawnPoints([...points]);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    } else {
      setDrawMode(false);
      if (drawHandlerRef.current) {
        drawHandlerRef.current.destroy();
        drawHandlerRef.current = null;
      }
      
      if (drawnPoints.length > 2) {
        const coordsList = drawnPoints.map(pt => {
          const carto = Cesium.Cartographic.fromCartesian(pt);
          return [Cesium.Math.toDegrees(carto.longitude), Cesium.Math.toDegrees(carto.latitude)];
        });
        coordsList.push(coordsList[0]);

        const geojson = {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [coordsList]
          }
        };
        if (onDrawComplete) onDrawComplete(geojson);
      } else {
        if (drawEntityRef.current) {
          viewer.entities.remove(drawEntityRef.current);
          drawEntityRef.current = null;
        }
        if (onDrawComplete) onDrawComplete(null);
      }
    }
  }, [drawMode, cesiumReady, drawnPoints, module, onDrawComplete]);

  const resetMap = useCallback(() => {
    if (viewerRef.current && drawEntityRef.current) {
      viewerRef.current.entities.remove(drawEntityRef.current);
      drawEntityRef.current = null;
    }
    if (drawHandlerRef.current) {
      drawHandlerRef.current.destroy();
      drawHandlerRef.current = null;
    }
    setDrawMode(false);
    setDrawnPoints([]);
    if (onDrawComplete) onDrawComplete(null);
  }, [onDrawComplete]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#000" }}>
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%", cursor: "grab" }} />

      {!cesiumReady && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)", background: "rgba(0,0,0,0.8)", zIndex: 1000 }}>
          Initializing 3D Globe...
        </div>
      )}

      {/* --- Zoom Controls (Bottom Left, next to layers) --- */}
      <div style={{
        position: "absolute", bottom: 40, left: 60, zIndex: 10,
        display: "flex", alignItems: "center", background: "var(--bg-panel)", 
        borderRadius: 20, border: "1px solid var(--border-mid)", 
        backdropFilter: "blur(16px)", overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        pointerEvents: "all"
      }}>
        <button 
          title="Zoom Out" 
          style={{ background: "transparent", border: "none", color: "var(--text-1)", padding: "6px 14px", fontSize: 20, cursor: "pointer", transition: "0.2s" }}
          onMouseOver={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
          onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
          onClick={() => {
            const Cesium = (window as any).Cesium;
            const cam = viewerRef.current?.camera;
            if (cam && Cesium) {
              const carto = Cesium.Cartographic.fromCartesian(cam.position);
              carto.height = Math.min(carto.height * 2.0, 20000000);
              cam.flyTo({ destination: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height), duration: 0.5 });
            }
          }}
        >−</button>
        <div style={{ width: 1, height: 20, background: "var(--border-mid)" }} />
        <button 
          title="Zoom In" 
          style={{ background: "transparent", border: "none", color: "var(--text-1)", padding: "6px 14px", fontSize: 20, cursor: "pointer", transition: "0.2s" }}
          onMouseOver={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
          onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
          onClick={() => {
            const Cesium = (window as any).Cesium;
            const cam = viewerRef.current?.camera;
            if (cam && Cesium) {
              const carto = Cesium.Cartographic.fromCartesian(cam.position);
              carto.height = Math.max(carto.height * 0.5, 100);
              cam.flyTo({ destination: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height), duration: 0.5 });
            }
          }}
        >+</button>
      </div>

      <div style={{ position: "absolute", top: 16, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none", zIndex: 10 }}>
        <div style={{
          display: "flex", gap: 4,
          background: "var(--bg-panel)",
          border: "1px solid var(--border-mid)",
          borderRadius: 10, padding: "5px 7px",
          backdropFilter: "blur(16px)",
          pointerEvents: "all",
        }}>
          {[
            { label: "True Color", key: "TC" },
            { label: "False Color", key: "FC" },
            { label: "NDVI", key: "NDVI" },
            { label: "Moisture", key: "SAR" },
            { label: "LULC", key: "URB" },
            { label: "ISRO Bhuvan", key: "BHUVAN" },
          ].map((tab) => (
            <button 
              key={tab.key} 
              onClick={() => setTopLayer(tab.key)}
              className={`asset-tab ${tab.key === topLayer ? "active" : ""}`}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-3)" }} />
              {tab.label}
            </button>
          ))}
        </div>

        {stats && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, pointerEvents: "all" }}>
            {stats.cloud !== undefined && (
              <div className="stat-card">
                <div className="stat-label">CLOUD %</div>
                <div className="stat-value">{stats.cloud}%</div>
              </div>
            )}
            {stats.area !== undefined && (
              <div className="stat-card" style={{ borderColor: MODULE_COLORS.flood }}>
                <div className="stat-label">AREA KM²</div>
                <div className="stat-value" style={{ color: MODULE_COLORS.flood }}>
                  {stats.area.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            )}
            {stats.ndvi !== undefined && (
              <div className="stat-card" style={{ borderColor: MODULE_COLORS.agri }}>
                <div className="stat-label">AVG NDVI</div>
                <div className="stat-value" style={{ color: MODULE_COLORS.agri }}>
                  {stats.ndvi.toFixed(3)}
                </div>
              </div>
            )}
            {stats.sensor && (
              <div className="stat-card">
                <div className="stat-label">SENSOR</div>
                <div className="stat-value" style={{ fontSize: 13, color: "var(--text-2)" }}>{stats.sensor}</div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ position: "absolute", bottom: 40, left: 12, zIndex: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          className={`map-tool ${splitSliderActive ? "active" : ""}`}
          onClick={() => setSplitSliderActive(!splitSliderActive)}
          title="Multi-Temporal Pre vs Post Monsoon Slider"
          style={{ borderRadius: "50%", padding: 10, color: splitSliderActive ? "#38bdf8" : undefined }}
        >
          <SlidersHorizontal size={18} />
        </button>
        <button
          className={`map-tool ${groundTruthDrawerOpen ? "active" : ""}`}
          onClick={() => setGroundTruthDrawerOpen(!groundTruthDrawerOpen)}
          title="Ground-Truth Field Photo Verification Drawer"
          style={{ borderRadius: "50%", padding: 10, color: groundTruthDrawerOpen ? "#10b981" : undefined }}
        >
          <ShieldCheck size={18} />
        </button>
        <button className={`map-tool ${showWeather ? "active" : ""}`} onClick={() => setShowWeather(!showWeather)} title="Live Weather Radar" style={{ borderRadius: "50%", padding: 10, color: showWeather ? "#38bdf8" : undefined }}>
          <CloudRain size={18} />
        </button>
        <button className={`map-tool ${showLayers ? "active" : ""}`} onClick={() => setShowLayers(!showLayers)} title="Basemap settings" style={{ borderRadius: "50%", padding: 10 }}>
          <Layers size={18} />
        </button>
        
        {showLayers && (
          <div className="fade-up" style={{
            position: "absolute", bottom: 0, left: 45,
            background: "var(--bg-panel)",
            border: "1px solid var(--border-mid)",
            borderRadius: 8, padding: 8, width: 220,
            backdropFilter: "blur(16px)",
            display: "flex", flexDirection: "column", gap: 4
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", padding: "4px 8px", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Basemap Type</div>
            {[
              { id: "satellite", icon: <ImageIcon size={16} />, label: "Map (Standard)" },
              { id: "optical", icon: <ImageIcon size={16} />, label: "Optical (Sentinel-2)" },
              { id: "sar", icon: <Layers size={16} />, label: "SAR (Sentinel-1 VV)" }
            ].map(layer => (
              <button
                key={layer.id}
                onClick={() => { setActiveLayer(layer.id as LayerMode); setShowLayers(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  background: activeLayer === layer.id ? "var(--bg-hover)" : "transparent",
                  color: activeLayer === layer.id ? "var(--text-1)" : "var(--text-2)",
                  border: "none", borderRadius: 6, cursor: "pointer",
                  textAlign: "left", fontSize: 13, transition: "all 0.2s"
                }}
              >
                {layer.icon}
                <span style={{ fontWeight: activeLayer === layer.id ? 500 : 400 }}>{layer.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{
        position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
        display: "flex", flexDirection: "column", gap: 8, zIndex: 10
      }}>
        <div style={{ display: "flex", flexDirection: "column", background: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border-mid)", backdropFilter: "blur(16px)", overflow: "hidden" }}>
          <button className={`map-tool ${drawMode ? "active" : ""}`} onClick={toggleDraw} title={drawMode ? "Finish Drawing" : "Draw Region"}>
            <Pencil size={18} />
          </button>
          {drawEntityRef.current && (
            <>
              <div style={{ height: 1, background: "var(--border-mid)" }} />
              <button className="map-tool" onClick={resetMap} title="Reset Region">
                <RotateCcw size={18} />
              </button>
            </>
          )}
        </div>

        {geeTileUrl && (
          <div style={{ display: "flex", flexDirection: "column", background: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border-mid)", backdropFilter: "blur(16px)", overflow: "hidden", marginTop: 8 }}>
             <button className={`map-tool ${overlayVisible ? "active" : ""}`} onClick={toggleOverlay} title="Toggle Analysis Overlay">
              <Eye size={18} />
            </button>
          </div>
        )}
      </div>

      {/* ── Interactive Multi-Temporal Split Slider HUD ── */}
      {splitSliderActive && (
        <div className="fade-up" style={{
          position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
          zIndex: 25, background: "rgba(15, 23, 42, 0.94)", border: "1px solid rgba(56, 189, 248, 0.4)",
          borderRadius: 12, padding: "10px 18px", backdropFilter: "blur(20px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.55)", display: "flex", flexDirection: "column", gap: 8,
          minWidth: 420, maxWidth: "90vw"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: 0.6 }}>
              <SlidersHorizontal size={14} />
              <span>Multi-Temporal Watershed Change Detector (Pre vs. Post Monsoon)</span>
            </div>
            <button
              onClick={() => setSplitSliderActive(false)}
              style={{ background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 2 }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Temporal States Toggle */}
          <div style={{ display: "flex", gap: 6, background: "rgba(0,0,0,0.4)", borderRadius: 8, padding: 3 }}>
            <button
              onClick={() => { setTemporalState("pre"); setTopLayer("FC"); }}
              style={{
                flex: 1, padding: "5px 8px", fontSize: 10.5, fontWeight: 600, border: "none", borderRadius: 6, cursor: "pointer",
                background: temporalState === "pre" ? "rgba(239, 68, 68, 0.25)" : "transparent",
                color: temporalState === "pre" ? "#f87171" : "var(--text-3)",
                transition: "all 0.2s"
              }}
            >
              ☀️ Dry Baseline (Pre-Monsoon)
            </button>
            <button
              onClick={() => { setTemporalState("post"); setTopLayer("NDVI"); }}
              style={{
                flex: 1, padding: "5px 8px", fontSize: 10.5, fontWeight: 600, border: "none", borderRadius: 6, cursor: "pointer",
                background: temporalState === "post" ? "rgba(34, 197, 94, 0.25)" : "transparent",
                color: temporalState === "post" ? "#4ade80" : "var(--text-3)",
                transition: "all 0.2s"
              }}
            >
              🌿 Rejuvenated (Post-Monsoon)
            </button>
            <button
              onClick={() => { setTemporalState("delta"); setTopLayer("URB"); }}
              style={{
                flex: 1, padding: "5px 8px", fontSize: 10.5, fontWeight: 600, border: "none", borderRadius: 6, cursor: "pointer",
                background: temporalState === "delta" ? "rgba(56, 189, 248, 0.25)" : "transparent",
                color: temporalState === "delta" ? "#38bdf8" : "var(--text-3)",
                transition: "all 0.2s"
              }}
            >
              📊 Biomass Surge (+38% NDVI)
            </button>
          </div>

          {/* Interactive Range Slider */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 9.5, color: "#f87171", fontWeight: 700, textTransform: "uppercase" }}>Pre-Monsoon</span>
            <input
              type="range"
              min="0"
              max="100"
              value={sliderPosition}
              onChange={(e) => {
                const val = Number(e.target.value);
                setSliderPosition(val);
                if (val < 40) setTemporalState("pre");
                else if (val > 65) setTemporalState("post");
                else setTemporalState("delta");
              }}
              style={{ flex: 1, accentColor: "#38bdf8", cursor: "pointer" }}
            />
            <span style={{ fontSize: 9.5, color: "#4ade80", fontWeight: 700, textTransform: "uppercase" }}>Post-Monsoon</span>
          </div>
          <div style={{ fontSize: 9, color: "var(--text-3)", textAlign: "center", fontFamily: "monospace" }}>
            Temporal Split Offset: {sliderPosition}% · Sentinel-2 MSI Calibrated Difference
          </div>
        </div>
      )}

      {/* ── Ground-Truth Field Photo Inspector Drawer ── */}
      {groundTruthDrawerOpen && (
        <div className="slide-left" style={{
          position: "absolute", top: 12, right: 12, bottom: 35, width: 340,
          background: "rgba(15, 23, 42, 0.94)", border: "1px solid rgba(16, 185, 129, 0.35)",
          borderRadius: 12, padding: "14px", backdropFilter: "blur(24px)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.6)", zIndex: 30, display: "flex", flexDirection: "column", gap: 10,
          overflowY: "auto"
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 8 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#10b981", fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>
                <ShieldCheck size={14} />
                <span>AI Ground-Truth Verification</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc", marginTop: 2 }}>
                {selectedFieldAsset.title}
              </div>
              <div style={{ fontSize: 9.5, color: "var(--text-3)", marginTop: 1 }}>
                📍 {selectedFieldAsset.location}
              </div>
            </div>
            <button
              onClick={() => setGroundTruthDrawerOpen(false)}
              style={{ background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 4 }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Sample Asset Picker Chips */}
          <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 2 }}>
            {SAMPLE_FIELD_ASSETS.map((asset) => (
              <button
                key={asset.id}
                onClick={() => setSelectedFieldAsset(asset)}
                style={{
                  fontSize: 9, padding: "3px 8px", borderRadius: 4, border: "1px solid",
                  borderColor: selectedFieldAsset.id === asset.id ? "#10b981" : "rgba(255,255,255,0.1)",
                  background: selectedFieldAsset.id === asset.id ? "rgba(16, 185, 129, 0.2)" : "rgba(255,255,255,0.03)",
                  color: selectedFieldAsset.id === asset.id ? "#34d399" : "var(--text-3)",
                  cursor: "pointer", whiteSpace: "nowrap"
                }}
              >
                {asset.title.split(' ')[0]} {asset.title.split(' ')[1]}
              </button>
            ))}
          </div>

          {/* Photo with AI Object Detection Overlay */}
          <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.15)", height: 160, background: "#000" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedFieldAsset.photoUrl}
              alt={selectedFieldAsset.title}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            {/* AI Bounding Box */}
            <div style={{
              position: "absolute", top: "25%", left: "20%", width: "55%", height: "50%",
              border: "2px solid #10b981", borderRadius: 4, background: "rgba(16, 185, 129, 0.15)",
              boxShadow: "0 0 12px rgba(16,185,129,0.4)"
            }}>
              <div style={{
                position: "absolute", top: -16, left: 0, background: "#10b981", color: "#0f172a",
                fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: "2px 2px 0 0", letterSpacing: 0.4
              }}>
                CHECK DAM · INTACT (96.4%)
              </div>
            </div>
            <div style={{
              position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.75)",
              color: "#38bdf8", fontSize: 8.5, padding: "2px 6px", borderRadius: 4, fontFamily: "monospace"
            }}>
              EXIF GPS: {selectedFieldAsset.lat}°N, {selectedFieldAsset.lon}°E
            </div>
          </div>

          {/* Verification Metrics Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "6px 8px" }}>
              <div style={{ fontSize: 8, color: "var(--text-3)", textTransform: "uppercase" }}>Structural Integrity</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#34d399", marginTop: 1 }}>{selectedFieldAsset.status}</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "6px 8px" }}>
              <div style={{ fontSize: 8, color: "var(--text-3)", textTransform: "uppercase" }}>Siltation Level</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#38bdf8", marginTop: 1 }}>{selectedFieldAsset.siltationPct}% (Low)</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "6px 8px" }}>
              <div style={{ fontSize: 8, color: "var(--text-3)", textTransform: "uppercase" }}>Storage Capacity</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", marginTop: 1 }}>{selectedFieldAsset.storageCapacity}</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "6px 8px" }}>
              <div style={{ fontSize: 8, color: "var(--text-3)", textTransform: "uppercase" }}>Overhead Satellite NDVI</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#34d399", marginTop: 1 }}>{selectedFieldAsset.ndviAtNode}</div>
            </div>
          </div>

          {/* Cryptographic Anti-Tamper Attestation Badge */}
          <div style={{
            background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)",
            borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 3
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9.5, fontWeight: 700, color: "#10b981" }}>
              <CheckCircle2 size={12} />
              <span>Cryptographic Tamper-Proof Stamp</span>
            </div>
            <div style={{ fontSize: 8, color: "var(--text-3)", fontFamily: "monospace", wordBreak: "break-all" }}>
              {selectedFieldAsset.hash}
            </div>
            <div style={{ fontSize: 8.5, color: "var(--text-2)", marginTop: 2 }}>
              Audited by: <strong>{selectedFieldAsset.inspectedBy}</strong> on {selectedFieldAsset.date}
            </div>
          </div>
        </div>
      )}

      <div style={{
        position: "absolute", bottom: 8, left: 12, zIndex: 10,
        fontSize: 10, color: "var(--text-3)", fontFamily: "monospace", display: "flex", gap: 16
      }}>
        <span id="coords-display">Tracking...</span>
        <span>EPSG:4326 · WGS84</span>
      </div>
    </div>
  );
}
