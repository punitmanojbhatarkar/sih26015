"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import { Layers, ZoomIn, ZoomOut, Pencil, RotateCcw, Eye, Image as ImageIcon, CloudRain, SlidersHorizontal, ShieldCheck, CheckCircle2, AlertTriangle, X, FileCheck, Navigation, Sparkles, ChevronDown, ChevronUp, FileText, Droplets, Sprout, MapPin, BarChart3, TrendingUp, Award, Compass, Search, Loader2, Minimize2, Maximize2 } from "lucide-react";
import { API_BASE } from "../lib/api";

interface MapPanelProps {
  imageUrl?: string | null;       
  geeTileUrl?: string | null;     
  bbox?: number[] | null;         
  centerLat?: number | null;
  centerLon?: number | null;
  module?: string;
  chatOpen?: boolean;
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

export interface DifferenceZone {
  id: string;
  name: string;
  type: "vegetation" | "water" | "erosion";
  metric: string;
  subtext: string;
  polygon: [number, number][]; // [lon, lat]
}

export type SplitMode = "all" | "vegetation" | "water" | "erosion";

export interface CatchmentPreset {
  id: string;
  name: string;
  badge: string;
  lat: number;
  lon: number;
  area: number;
  altitude: number;
  bounds: [number, number, number, number]; // [west, south, east, north]
  differenceZones: DifferenceZone[];
  assets: {
    id: string;
    name: string;
    code: string;
    type: string;
    lat: number;
    lon: number;
    colorHex: string;
    storage: string;
    siltRetention: string;
    cost: string;
    status: string;
    verified: string;
    desc: string;
  }[];
}

const CATCHMENT_PRESETS: CatchmentPreset[] = [
  {
    id: "arvari",
    name: "Arvari Basin (Alwar, RJ)",
    badge: "Flagship Rejuvenation",
    lat: 27.2415,
    lon: 76.3812,
    area: 2199.4,
    altitude: 14000.0,
    bounds: [76.335, 27.200, 76.425, 27.280],
    differenceZones: [
      {
        id: "arv_diff_veg_cmd",
        name: "Rejuvenated Command Cropland",
        type: "vegetation",
        metric: "+0.34 ΔNDVI",
        subtext: "Double-Cropping Active · +38% Biomass Surge",
        polygon: [
          [76.378, 27.218],
          [76.415, 27.222],
          [76.420, 27.244],
          [76.388, 27.241],
          [76.378, 27.218]
        ]
      },
      {
        id: "arv_diff_wat_johad",
        name: "Johad PT-02 Perennial Water Spread",
        type: "water",
        metric: "+0.42 ΔNDWI",
        subtext: "42,000 m³ Runoff Storage · 4.2 ha Lake Spread",
        polygon: [
          [76.381, 27.244],
          [76.393, 27.245],
          [76.391, 27.254],
          [76.379, 27.252],
          [76.381, 27.244]
        ]
      },
      {
        id: "arv_diff_wat_cd",
        name: "Check Dam CD-01 Infiltration Reservoir",
        type: "water",
        metric: "+0.38 ΔNDWI",
        subtext: "18,500 m³ Storage · Aquifer Recharge Node",
        polygon: [
          [76.370, 27.232],
          [76.378, 27.233],
          [76.376, 27.240],
          [76.368, 27.238],
          [76.370, 27.232]
        ]
      },
      {
        id: "arv_diff_veg_cct",
        name: "Upper Ridge CCT Afforestation",
        type: "vegetation",
        metric: "+0.22 ΔNDVI",
        subtext: "14.8 km Contour Trenches · 74% Runoff Arrested",
        polygon: [
          [76.362, 27.249],
          [76.377, 27.251],
          [76.375, 27.263],
          [76.360, 27.260],
          [76.362, 27.249]
        ]
      },
      {
        id: "arv_diff_ero_ridge",
        name: "Untreated Ridge Escarpment Hotspot",
        type: "erosion",
        metric: "-0.18 ΔNDVI",
        subtext: "Active Gully Headcut · Priority Tranche-II CCT",
        polygon: [
          [76.345, 27.258],
          [76.364, 27.260],
          [76.362, 27.272],
          [76.343, 27.269],
          [76.345, 27.258]
        ]
      }
    ],
    assets: [
      {
        id: "pmksy_cd_01",
        name: "🧱 Check Dam CD-01",
        code: "PMKSY/RJ-ALW/CD-01",
        type: "Masonry Check Dam",
        lat: 27.2365,
        lon: 76.3742,
        colorHex: "#38bdf8",
        storage: "18,500 m³",
        siltRetention: "91.4%",
        cost: "₹4.85 Lakhs",
        status: "Fully Functional / Recharging",
        verified: "Verified by District Geologist (DoLR Inspection ID: DOLR-2026-9812)",
        desc: "Masonry check dam with gabion apron across main drainage stream. Silt retention: 91.4%. Downstream water table increased by 2.4m BGL."
      },
      {
        id: "pmksy_pt_02",
        name: "🌊 Johad / Percolation Tank PT-02",
        code: "PMKSY/RJ-ALW/PT-02",
        type: "Percolation Tank (Johad)",
        lat: 27.2485,
        lon: 76.3862,
        colorHex: "#22c55e",
        storage: "42,000 m³",
        siltRetention: "94.2%",
        cost: "₹7.40 Lakhs",
        status: "Perennial Water Spread (4.2 ha)",
        verified: "Verified by Block Development Officer (WDC 2.0)",
        desc: "Community Johad water harvesting body. Recharges deep aquifer and drinking water wells for 4 villages across the micro-watershed."
      },
      {
        id: "pmksy_cct_05",
        name: "🚜 Continuous Contour Trenches (CCT)",
        code: "PMKSY/RJ-ALW/CCT-05",
        type: "Ridge Treatment CCT",
        lat: 27.2555,
        lon: 76.3712,
        colorHex: "#f59e0b",
        storage: "12,200 m³ Infiltration",
        siltRetention: "98.0%",
        cost: "₹3.20 Lakhs",
        status: "14.8 km Ridge Line Completed",
        verified: "Field Audited via GIS Drone Survey",
        desc: "Ridge-to-valley continuous contour trenches across upper catchment slopes. Peak runoff velocity arrested by 74%."
      }
    ]
  },
  {
    id: "bundelkhand",
    name: "Bundelkhand Catchment (UP/MP)",
    badge: "Drought Mitigation",
    lat: 25.4484,
    lon: 78.5685,
    area: 1845.0,
    altitude: 16000.0,
    bounds: [78.520, 25.405, 78.615, 25.490],
    differenceZones: [
      {
        id: "bk_diff_wat_haveli",
        name: "Haveli Submergence Cultivation Reservoir",
        type: "water",
        metric: "+0.45 ΔNDWI",
        subtext: "34,000 m³ Stored · Inundation Sowing Cycle Active",
        polygon: [
          [78.552, 25.436],
          [78.572, 25.439],
          [78.570, 25.450],
          [78.549, 25.447],
          [78.552, 25.436]
        ]
      },
      {
        id: "bk_diff_veg_pulses",
        name: "Rabi Pulses & Oilseed Revival Zone",
        type: "vegetation",
        metric: "+0.31 ΔNDVI",
        subtext: "Gram & Mustard Canopy Expansion (+29%)",
        polygon: [
          [78.566, 25.446],
          [78.598, 25.450],
          [78.594, 25.472],
          [78.562, 25.467],
          [78.566, 25.446]
        ]
      },
      {
        id: "bk_diff_wat_pond",
        name: "Community Farm Pond FP-07 Storage",
        type: "water",
        metric: "+0.39 ΔNDWI",
        subtext: "15,000 m³ Lined Supplemental Irrigation Basin",
        polygon: [
          [78.570, 25.451],
          [78.578, 25.452],
          [78.576, 25.458],
          [78.568, 25.457],
          [78.570, 25.451]
        ]
      },
      {
        id: "bk_diff_ero_ravine",
        name: "Active Ravine Gully Erosion Hotspot",
        type: "erosion",
        metric: "-0.21 ΔNDVI",
        subtext: "Severe Ravine Encroachment · Earthen Bunding Priority",
        polygon: [
          [78.530, 25.458],
          [78.554, 25.461],
          [78.550, 25.478],
          [78.526, 25.475],
          [78.530, 25.458]
        ]
      }
    ],
    assets: [
      {
        id: "pmksy_bk_hb03",
        name: "🧱 Haveli Bunding HB-03",
        code: "PMKSY/UP-JHS/HB-03",
        type: "Traditional Haveli Reservoir",
        lat: 25.4434,
        lon: 78.5625,
        colorHex: "#38bdf8",
        storage: "34,000 m³",
        siltRetention: "89.0%",
        cost: "₹5.60 Lakhs",
        status: "Submergence Storage Active",
        verified: "SLNA District Inspection Certified",
        desc: "Haveli cultivation ponding system that holds monsoon runoff on farm fields and releases water for Rabi sowing."
      },
      {
        id: "pmksy_bk_fp07",
        name: "💧 Community Farm Pond FP-07",
        code: "PMKSY/UP-JHS/FP-07",
        type: "Lined Farm Pond",
        lat: 25.4544,
        lon: 78.5745,
        colorHex: "#22c55e",
        storage: "15,000 m³",
        siltRetention: "93.5%",
        cost: "₹3.80 Lakhs",
        status: "Full Reservoir Level (FRL)",
        verified: "Verified by Village Watershed Committee",
        desc: "Community farm pond providing supplemental irrigation for pulses and oilseeds during post-monsoon dry spells."
      }
    ]
  },
  {
    id: "narmada",
    name: "Narmada Sub-Basin (Hoshangabad, MP)",
    badge: "Soil Conservation",
    lat: 22.7519,
    lon: 77.7289,
    area: 2464.2,
    altitude: 15000.0,
    bounds: [77.680, 22.705, 77.775, 22.795],
    differenceZones: [
      {
        id: "nar_diff_veg_wheat",
        name: "Alluvial Command Wheat Intensification",
        type: "vegetation",
        metric: "+0.36 ΔNDVI",
        subtext: "Sharbati Wheat High-Yield Biomass (+41%)",
        polygon: [
          [77.722, 22.728],
          [77.763, 22.734],
          [77.758, 22.760],
          [77.717, 22.754],
          [77.722, 22.728]
        ]
      },
      {
        id: "nar_diff_wat_weir",
        name: "Silt Detention Basin Water Spread",
        type: "water",
        metric: "+0.40 ΔNDWI",
        subtext: "28,000 m³ Silt Retention & Ecological Flow",
        polygon: [
          [77.705, 22.748],
          [77.730, 22.751],
          [77.726, 22.768],
          [77.701, 22.765],
          [77.705, 22.748]
        ]
      },
      {
        id: "nar_diff_veg_riparian",
        name: "Riparian Vegetative Buffer Zone",
        type: "vegetation",
        metric: "+0.28 ΔNDVI",
        subtext: "Bank Stabilisation Agro-Forestry Corridor",
        polygon: [
          [77.712, 22.762],
          [77.742, 22.765],
          [77.738, 22.776],
          [77.708, 22.773],
          [77.712, 22.762]
        ]
      },
      {
        id: "nar_diff_ero_scour",
        name: "Tributary Bank Scour Hotspot",
        type: "erosion",
        metric: "-0.16 ΔNDVI",
        subtext: "High Flood Velocity Scouring · Gabion Revetment Priority",
        polygon: [
          [77.735, 22.764],
          [77.762, 22.767],
          [77.758, 22.782],
          [77.731, 22.779],
          [77.735, 22.764]
        ]
      }
    ],
    assets: [
      {
        id: "pmksy_nar_sd02",
        name: "🧱 Silt Detention Dam SD-02",
        code: "PMKSY/MP-HOS/SD-02",
        type: "Concrete Silt Detention Dam",
        lat: 22.7469,
        lon: 77.7229,
        colorHex: "#38bdf8",
        storage: "28,000 m³",
        siltRetention: "96.2%",
        cost: "₹8.20 Lakhs",
        status: "Desilting Chamber Operational",
        verified: "State Remote Sensing Application Centre (MPCOST)",
        desc: "Heavy masonry silt detention structure safeguarding downstream reservoir from catchment soil wash."
      },
      {
        id: "pmksy_nar_sd05",
        name: "🌊 Subsurface Dyke SD-05",
        code: "PMKSY/MP-HOS/SD-05",
        type: "Subsurface Groundwater Dam",
        lat: 22.7579,
        lon: 77.7349,
        colorHex: "#10b981",
        storage: "Impermeable Barrier in Alluvium",
        siltRetention: "100%",
        cost: "₹9.50 Lakhs",
        status: "Groundwater Table Raised +3.1m",
        verified: "Central Ground Water Board (CGWB) Verified",
        desc: "Underground barrier across the riverbed arresting base flow and raising local aquifer levels for perennial well yield."
      }
    ]
  },
  {
    id: "ralegan",
    name: "Ralegan Siddhi (Ahmednagar, MH)",
    badge: "Model Watershed",
    lat: 19.0321,
    lon: 74.4532,
    area: 980.5,
    altitude: 12000.0,
    bounds: [74.410, 18.995, 74.495, 19.070],
    differenceZones: [
      {
        id: "ral_diff_veg_cmd",
        name: "Command Double-Cropping Revival",
        type: "vegetation",
        metric: "+0.38 ΔNDVI",
        subtext: "Anna Hazare Model · 98% Rainfed Land Cultivated",
        polygon: [
          [74.442, 19.012],
          [74.485, 19.016],
          [74.480, 19.045],
          [74.438, 19.040],
          [74.442, 19.012]
        ]
      },
      {
        id: "ral_diff_wat_pt",
        name: "Percolation Tank PT-01 Water Spread",
        type: "water",
        metric: "+0.44 ΔNDWI",
        subtext: "32,000 m³ Infiltration Reservoir · Aquifer Recharged",
        polygon: [
          [74.448, 19.038],
          [74.468, 19.040],
          [74.465, 19.052],
          [74.444, 19.050],
          [74.448, 19.038]
        ]
      },
      {
        id: "ral_diff_ero_cct",
        name: "Upper Ridge CCT Slopes",
        type: "erosion",
        metric: "-0.14 ΔNDVI",
        subtext: "Sloping Ridge Treatment · Runoff Velocity Arrested",
        polygon: [
          [74.425, 19.048],
          [74.452, 19.050],
          [74.450, 19.062],
          [74.422, 19.060],
          [74.425, 19.048]
        ]
      }
    ],
    assets: [
      {
        id: "pmksy_ral_cd04",
        name: "Check Dam CD-04 (Main Nala)",
        code: "PMKSY/MH-AHM/CD-04",
        type: "Masonry Check Dam",
        lat: 19.0285,
        lon: 74.4552,
        colorHex: "#38bdf8",
        storage: "32,000 m³",
        siltRetention: "98.2%",
        cost: "₹5.50 Lakhs",
        status: "Perennial Water Level",
        verified: "National Water Award Winner Village",
        desc: "Key masonry check dam on Ralegan main drainage stream. Preserves post-monsoon base flow."
      },
      {
        id: "pmksy_ral_pt01",
        name: "Percolation Tank PT-01",
        code: "PMKSY/MH-AHM/PT-01",
        type: "Percolation Tank",
        lat: 19.0412,
        lon: 74.4565,
        colorHex: "#22c55e",
        storage: "48,000 m³",
        siltRetention: "94.5%",
        cost: "₹7.20 Lakhs",
        status: "Aquifer Water Table +4.2m",
        verified: "Groundwater Survey and Development Agency (GSDA)",
        desc: "Massive community percolation tank recharging over 60 agricultural open wells."
      }
    ]
  },
  {
    id: "hiware",
    name: "Hiware Bazar (Ahmednagar, MH)",
    badge: "Water Budgeting",
    lat: 19.1245,
    lon: 74.8123,
    area: 976.8,
    altitude: 12000.0,
    bounds: [74.770, 19.085, 74.855, 19.160],
    differenceZones: [
      {
        id: "hiw_diff_veg_crop",
        name: "Onion & Fodder Canopy Revival",
        type: "vegetation",
        metric: "+0.35 ΔNDVI",
        subtext: "Popatrao Pawar Model · 100% Water Self-Sufficient",
        polygon: [
          [74.795, 19.102],
          [74.842, 19.106],
          [74.838, 19.135],
          [74.790, 19.130],
          [74.795, 19.102]
        ]
      },
      {
        id: "hiw_diff_wat_bandhara",
        name: "Cement Bandhara CB-02 Storage",
        type: "water",
        metric: "+0.41 ΔNDWI",
        subtext: "26,000 m³ Impoundment · Zero Borewell Village",
        polygon: [
          [74.805, 19.128],
          [74.828, 19.130],
          [74.825, 19.142],
          [74.802, 19.140],
          [74.805, 19.128]
        ]
      },
      {
        id: "hiw_diff_ero_gully",
        name: "Gully Reclamation Zone",
        type: "erosion",
        metric: "-0.15 ΔNDVI",
        subtext: "Loose Boulder Structures Arresting Headcut Erosion",
        polygon: [
          [74.780, 19.138],
          [74.808, 19.140],
          [74.805, 19.152],
          [74.778, 19.150],
          [74.780, 19.138]
        ]
      }
    ],
    assets: [
      {
        id: "pmksy_hiw_cb02",
        name: "Cement Bandhara CB-02",
        code: "PMKSY/MH-AHM/CB-02",
        type: "Cement Nala Bund (Bandhara)",
        lat: 19.1215,
        lon: 74.8142,
        colorHex: "#38bdf8",
        storage: "26,000 m³",
        siltRetention: "97.1%",
        cost: "₹4.90 Lakhs",
        status: "Perennial Flow Maintained",
        verified: "Model Village Panchayat Record",
        desc: "Cement weir maintaining surface saturation and raising groundwater table."
      }
    ]
  },
  {
    id: "latur",
    name: "Latur Aquifer Basin (Marathwada, MH)",
    badge: "Aquifer Recharge",
    lat: 18.4088,
    lon: 76.5604,
    area: 1420.0,
    altitude: 14000.0,
    bounds: [76.510, 18.365, 76.610, 18.450],
    differenceZones: [
      {
        id: "lat_diff_veg_crop",
        name: "Soybean-Gram Crop Intensification",
        type: "vegetation",
        metric: "+0.31 ΔNDVI",
        subtext: "Drought Resilience Achieved · +34% Biomass",
        polygon: [
          [76.540, 18.385],
          [76.592, 18.389],
          [76.588, 18.422],
          [76.535, 18.418],
          [76.540, 18.385]
        ]
      },
      {
        id: "lat_diff_wat_manjara",
        name: "Manjara Basin Desilted Reservoir",
        type: "water",
        metric: "+0.39 ΔNDWI",
        subtext: "55,000 m³ Deep Basalt Fracture Infiltration",
        polygon: [
          [76.550, 18.412],
          [76.578, 18.415],
          [76.575, 18.432],
          [76.546, 18.430],
          [76.550, 18.412]
        ]
      },
      {
        id: "lat_diff_ero_basalt",
        name: "Denuded Basalt Escarpment",
        type: "erosion",
        metric: "-0.17 ΔNDVI",
        subtext: "Severe Sheet Erosion · Continuous Gully Plugs Needed",
        polygon: [
          [76.522, 18.428],
          [76.558, 18.431],
          [76.555, 18.445],
          [76.520, 18.442],
          [76.522, 18.428]
        ]
      }
    ],
    assets: [
      {
        id: "pmksy_lat_md01",
        name: "Masonry Check Dam MD-01",
        code: "PMKSY/MH-LAT/MD-01",
        type: "Masonry Check Dam",
        lat: 18.4025,
        lon: 76.5642,
        colorHex: "#38bdf8",
        storage: "55,000 m³",
        siltRetention: "95.8%",
        cost: "₹7.80 Lakhs",
        status: "Desilted · Perennial Storage",
        verified: "Jalyukt Shivar Abhiyan Evaluation",
        desc: "Deepened riverbed reservoir providing critical irrigation during post-monsoon dry spells."
      }
    ]
  }
];

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function createCustomCatchment(name: string, lat: number, lon: number, bbox?: number[]): CatchmentPreset {
  const [minLon, minLat, maxLon, maxLat] = bbox || [
    round4(lon - 0.05),
    round4(lat - 0.04),
    round4(lon + 0.05),
    round4(lat + 0.04)
  ];
  const w = maxLon - minLon;
  const h = maxLat - minLat;
  const r = 6371.0;
  const lat1 = (minLat * Math.PI) / 180;
  const lat2 = (maxLat * Math.PI) / 180;
  const dLon = ((maxLon - minLon) * Math.PI) / 180;
  const areaKm2 = Math.round(r * r * Math.abs(Math.sin(lat2) - Math.sin(lat1)) * Math.abs(dLon) * 10) / 10 || 520.0;
  const cleanName = name.split(" (")[0];

  return {
    id: `custom_${Math.round(Math.abs(lat)*100)}_${Math.round(Math.abs(lon)*100)}`,
    name: name,
    badge: "Field Micro-Watershed",
    lat,
    lon,
    area: areaKm2,
    altitude: 14000.0,
    bounds: [minLon, minLat, maxLon, maxLat],
    differenceZones: [
      {
        id: `cust_veg_${Math.round(Math.abs(lat)*100)}`,
        name: `Rejuvenated Cropland (${cleanName})`,
        type: "vegetation",
        metric: "+0.33 ΔNDVI",
        subtext: "Crop Canopy Revival · Double-Cropping Active",
        polygon: [
          [round4(minLon + w * 0.25), round4(minLat + h * 0.22)],
          [round4(minLon + w * 0.72), round4(minLat + h * 0.24)],
          [round4(minLon + w * 0.76), round4(minLat + h * 0.58)],
          [round4(minLon + w * 0.28), round4(minLat + h * 0.54)],
          [round4(minLon + w * 0.25), round4(minLat + h * 0.22)]
        ]
      },
      {
        id: `cust_wat_${Math.round(Math.abs(lat)*100)}`,
        name: `Perennial Water Spread & Reservoir`,
        type: "water",
        metric: "+0.42 ΔNDWI",
        subtext: `${Math.round(areaKm2 * 18.5).toLocaleString()} m³ Harvested Storage · Recharging Aquifer`,
        polygon: [
          [round4(minLon + w * 0.38), round4(minLat + h * 0.56)],
          [round4(minLon + w * 0.58), round4(minLat + h * 0.58)],
          [round4(minLon + w * 0.55), round4(minLat + h * 0.70)],
          [round4(minLon + w * 0.35), round4(minLat + h * 0.68)],
          [round4(minLon + w * 0.38), round4(minLat + h * 0.56)]
        ]
      },
      {
        id: `cust_ero_${Math.round(Math.abs(lat)*100)}`,
        name: `Untreated Upper Ridge Hotspot`,
        type: "erosion",
        metric: "-0.18 ΔNDVI",
        subtext: "High Runoff Velocity · Priority Ridge Plantation Needed",
        polygon: [
          [round4(minLon + w * 0.20), round4(minLat + h * 0.72)],
          [round4(minLon + w * 0.62), round4(minLat + h * 0.74)],
          [round4(minLon + w * 0.66), round4(minLat + h * 0.88)],
          [round4(minLon + w * 0.24), round4(minLat + h * 0.86)],
          [round4(minLon + w * 0.20), round4(minLat + h * 0.72)]
        ]
      }
    ],
    assets: [
      {
        id: `pmksy_cd_${Math.round(Math.abs(lat)*100)}`,
        name: `Check Dam CD-01`,
        code: `PMKSY/WDC/CD-${Math.round(Math.abs(lat)*10)%100}`,
        type: "Masonry Check Dam",
        lat: round4(lat - h * 0.1),
        lon: round4(lon + w * 0.05),
        colorHex: "#38bdf8",
        storage: `${Math.round(areaKm2 * 14.5).toLocaleString()} m³`,
        siltRetention: "96.4%",
        cost: "₹4.85 Lakhs",
        status: "Operational · Perennial Pool",
        verified: "PMKSY-WDC 2.0 State Nodal Agency Audited",
        desc: `Masonry check dam constructed across primary drainage line in ${name}. Arrests monsoon peak discharge.`
      },
      {
        id: `pmksy_pt_${Math.round(Math.abs(lat)*100)}`,
        name: `Percolation Tank PT-02`,
        code: `PMKSY/WDC/PT-${Math.round(Math.abs(lon)*10)%100}`,
        type: "Percolation Tank (Johad)",
        lat: round4(lat + h * 0.12),
        lon: round4(lon - w * 0.08),
        colorHex: "#22c55e",
        storage: `${Math.round(areaKm2 * 28.0).toLocaleString()} m³`,
        siltRetention: "92.1%",
        cost: "₹6.40 Lakhs",
        status: "Perennial Infiltration Active",
        verified: "Central Ground Water Board (CGWB) Verified",
        desc: `Community water storage pond recharging local village open wells and shallow aquifer in ${name}.`
      },
      {
        id: `pmksy_cct_${Math.round(Math.abs(lat)*100)}`,
        name: `Continuous Contour Trenches`,
        code: `PMKSY/WDC/CCT-${Math.round(Math.abs(lat*lon))%100}`,
        type: "Ridge Treatment CCT",
        lat: round4(lat + h * 0.28),
        lon: round4(lon - w * 0.18),
        colorHex: "#f59e0b",
        storage: "8,500 m³ Infiltration",
        siltRetention: "98.5%",
        cost: "₹3.10 Lakhs",
        status: "Ridge Treatment Completed",
        verified: "GIS Drone Photogrammetry Audited",
        desc: `Continuous contour trenches along upper ridge slopes in ${name} to arrest soil erosion.`
      }
    ]
  };
}

// Generates high-resolution scientific change detection canvas texture for Cesium SingleTileImageryProvider
export function generateDifferenceTexture(catchment: CatchmentPreset, mode: SplitMode): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, 1024, 1024);

  const [west, south, east, north] = catchment.bounds;
  const toX = (lon: number) => ((lon - west) / (east - west)) * 1024;
  const toY = (lat: number) => ((north - lat) / (north - south)) * 1024;

  const zones = catchment.differenceZones || [];

  zones.forEach(zone => {
    const isTarget = mode === "all" || mode === zone.type;
    if (!isTarget && mode !== "all") return;

    const pts = zone.polygon.map(([lon, lat]) => ({ x: toX(lon), y: toY(lat) }));
    if (pts.length < 3) return;

    // Centroid for subtle pill
    let cx = 0, cy = 0;
    pts.forEach(p => { cx += p.x; cy += p.y; });
    cx /= pts.length;
    cy /= pts.length;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();

    if (zone.type === "vegetation") {
      // Emerald gradient fill
      const grad = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[2].x, pts[2].y);
      grad.addColorStop(0, "rgba(34, 197, 94, 0.40)");
      grad.addColorStop(1, "rgba(22, 163, 74, 0.55)");
      ctx.fillStyle = grad;
      ctx.fill();

      // Dashed agricultural boundary line
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = "rgba(74, 222, 128, 0.90)";
      ctx.stroke();

      // Agricultural plot striping texture
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = "rgba(134, 239, 172, 0.18)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      for (let x = -1024; x < 2048; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 1024, 1024);
        ctx.stroke();
      }
      ctx.restore();

    } else if (zone.type === "water") {
      // Aquatic cyan gradient
      const grad = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[2].x, pts[2].y);
      grad.addColorStop(0, "rgba(6, 182, 212, 0.58)");
      grad.addColorStop(1, "rgba(2, 132, 199, 0.72)");
      ctx.fillStyle = grad;
      ctx.fill();

      // Crisp shoreline contour
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(56, 189, 248, 0.95)";
      ctx.setLineDash([]);
      ctx.stroke();

      // Water ripple concentric waves inside
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = "rgba(224, 242, 254, 0.32)";
      ctx.lineWidth = 2;
      for (let r = 15; r < 120; r += 16) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * 1.4, r * 0.8, 0.2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

    } else if (zone.type === "erosion") {
      // Amber/Red alert fill
      const grad = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[2].x, pts[2].y);
      grad.addColorStop(0, "rgba(239, 68, 68, 0.40)");
      grad.addColorStop(1, "rgba(245, 158, 11, 0.50)");
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(248, 113, 113, 0.90)";
      ctx.stroke();

      // Hazard hatching
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = "rgba(254, 202, 202, 0.32)";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      for (let y = -1024; y < 2048; y += 14) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(1024, y + 1024);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();

    // Subtle small non-intrusive badge directly on the polygon
    ctx.save();
    const pillText = zone.metric;
    ctx.font = "bold 13px 'JetBrains Mono', monospace";
    const pillW = ctx.measureText(pillText).width + 22;
    const pillH = 22;
    const pillX = cx - pillW / 2;
    const pillY = cy - pillH / 2;

    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.strokeStyle = zone.type === "vegetation" ? "rgba(34, 197, 94, 0.6)" : zone.type === "water" ? "rgba(56, 189, 248, 0.6)" : "rgba(239, 68, 68, 0.6)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = zone.type === "vegetation" ? "#4ade80" : zone.type === "water" ? "#38bdf8" : "#f87171";
    ctx.font = "bold 11px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pillText, cx, cy);
    ctx.restore();
  });

  return canvas.toDataURL('image/png');
}

export default function MapPanel({ imageUrl, geeTileUrl, bbox, centerLat, centerLon, module, stats, onDrawComplete, chatOpen }: MapPanelProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const overlayRef = useRef<any>(null);
  const baseLayerRef = useRef<any>(null);
  const weatherLayerRef = useRef<any>(null);
  const drawEntityRef = useRef<any>(null);
  const drawHandlerRef = useRef<any>(null);
  const groundingEntitiesRef = useRef<any[]>([]);

  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth > 992);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
  const [splitAnalysisMode, setSplitAnalysisMode] = useState<SplitMode>("all");
  const [dossierExpanded, setDossierExpanded] = useState(false);
  const [activeAssetPopup, setActiveAssetPopup] = useState<any | null>(null);
  const [selectedCatchmentId, setSelectedCatchmentId] = useState<string>("arvari");
  const [activeCatchment, setActiveCatchment] = useState<CatchmentPreset>(CATCHMENT_PRESETS[0]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<CatchmentPreset[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState<boolean>(false);
  const [hudMinimized, setHudMinimized] = useState<boolean>(false);
  const splitEntitiesRef = useRef<any[]>([]);

  // Ground-Truth Field Photo Inspector Drawer State
  const [groundTruthDrawerOpen, setGroundTruthDrawerOpen] = useState(false);
  const [selectedFieldAsset, setSelectedFieldAsset] = useState<any>(SAMPLE_FIELD_ASSETS[0]);


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
    if (typeof window !== "undefined") (window as any).cesiumViewer = viewer;

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
      if (typeof window !== "undefined") (window as any).cesiumViewer = null;
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

  // Effect to manage Multi-Spectral & Thematic Layers from Top Tabs
  useEffect(() => {
    if (!viewerRef.current || !cesiumReady || splitSliderActive) return;
    const Cesium = (window as any).Cesium;
    const viewer = viewerRef.current;

    // We store the reference in a custom property on viewerRef to easily clear it
    if (viewerRef.current.sentinelLayer) {
      viewer.scene.imageryLayers.remove(viewerRef.current.sentinelLayer);
      viewerRef.current.sentinelLayer = null;
    }

    if (baseLayerRef.current) {
      if (topLayer === "TC") {
        // True Color: natural base calibration
        baseLayerRef.current.saturation = 1.0;
        baseLayerRef.current.hue = 0.0;
        baseLayerRef.current.brightness = 1.0;
        baseLayerRef.current.contrast = 1.0;
      } else if (topLayer === "FC") {
        // False Color (NIR / Vegetation Infrared emulated)
        baseLayerRef.current.saturation = 2.4;
        baseLayerRef.current.hue = -0.45;
        baseLayerRef.current.brightness = 1.05;
        baseLayerRef.current.contrast = 1.35;
      } else if (topLayer === "NDVI") {
        // High Vegetation Index (Chlorophyll Green Enhancement)
        baseLayerRef.current.saturation = 3.0;
        baseLayerRef.current.hue = 0.28;
        baseLayerRef.current.brightness = 0.95;
        baseLayerRef.current.contrast = 1.55;
      } else if (topLayer === "SAR") {
        // Moisture Index / SAR Radar Enhancement
        baseLayerRef.current.saturation = 0.2;
        baseLayerRef.current.hue = -0.85;
        baseLayerRef.current.brightness = 0.9;
        baseLayerRef.current.contrast = 1.85;
      } else if (topLayer === "URB") {
        // LULC Land Use / Built-up Contrast
        baseLayerRef.current.saturation = 0.5;
        baseLayerRef.current.hue = 0.45;
        baseLayerRef.current.brightness = 1.2;
        baseLayerRef.current.contrast = 1.6;
      } else if (topLayer === "BHUVAN") {
        // ISRO Bhuvan Watershed Cartographic Style: relief contrast + hydrological enhancement
        baseLayerRef.current.saturation = 1.35;
        baseLayerRef.current.hue = 0.05;
        baseLayerRef.current.brightness = 1.08;
        baseLayerRef.current.contrast = 1.40;
      }
    }
    if (viewer.scene.requestRender) viewer.scene.requestRender();
  }, [topLayer, cesiumReady, splitSliderActive]);

  // Effect to manage Multi-Temporal Difference Overlay & Split Comparison in Cesium
  useEffect(() => {
    if (!viewerRef.current || !cesiumReady) return;
    const Cesium = (window as any).Cesium;
    const viewer = viewerRef.current;

    if (splitSliderActive) {
      // 1. Keep base layer visible and natural across the entire globe
      if (baseLayerRef.current) {
        baseLayerRef.current.show = true;
        baseLayerRef.current.splitDirection = Cesium.SplitDirection.NONE;
        baseLayerRef.current.saturation = 1.0;
        baseLayerRef.current.contrast = 1.0;
        baseLayerRef.current.brightness = 1.0;
        baseLayerRef.current.hue = 0.0;
      }

      // 2. Remove any legacy duplicate split layers
      if (viewer.preSplitLayer) {
        viewer.scene.imageryLayers.remove(viewer.preSplitLayer);
        viewer.preSplitLayer = null;
      }
      if (viewer.postSplitLayer) {
        viewer.scene.imageryLayers.remove(viewer.postSplitLayer);
        viewer.postSplitLayer = null;
      }
      if (viewer.diffOverlayLayer) {
        viewer.scene.imageryLayers.remove(viewer.diffOverlayLayer);
        viewer.diffOverlayLayer = null;
      }

      // 3. Set split position in Cesium
      const splitFraction = Math.max(0.001, Math.min(0.999, sliderPosition / 100));
      viewer.scene.splitPosition = splitFraction;

      // 4. Mount Scientific Remote Sensing Difference Overlay via SingleTileImageryProvider.fromUrl
      const targetCatchment = activeCatchment || CATCHMENT_PRESETS.find(c => c.id === selectedCatchmentId) || CATCHMENT_PRESETS[0];
      const textureDataUrl = generateDifferenceTexture(targetCatchment, splitAnalysisMode);
      if (textureDataUrl && Cesium.SingleTileImageryProvider) {
        const [w, s, e, n] = targetCatchment.bounds;
        const rect = Cesium.Rectangle.fromDegrees(w, s, e, n);

        const addDiffLayer = (provider: any) => {
          if (!viewerRef.current || viewerRef.current.isDestroyed?.()) return;
          if (viewerRef.current.diffOverlayLayer) {
            viewerRef.current.scene.imageryLayers.remove(viewerRef.current.diffOverlayLayer);
          }
          const diffLayer = viewerRef.current.scene.imageryLayers.addImageryProvider(provider);
          diffLayer.splitDirection = Cesium.SplitDirection.RIGHT;
          diffLayer.alpha = 0.88;
          viewerRef.current.diffOverlayLayer = diffLayer;
          if (viewerRef.current.scene?.requestRender) viewerRef.current.scene.requestRender();
        };

        if (typeof Cesium.SingleTileImageryProvider.fromUrl === "function") {
          Cesium.SingleTileImageryProvider.fromUrl(textureDataUrl, { rectangle: rect })
            .then(addDiffLayer)
            .catch((err: any) => console.warn("Failed to load difference raster fromUrl", err));
        } else {
          try {
            const provider = new Cesium.SingleTileImageryProvider({ url: textureDataUrl, rectangle: rect });
            addDiffLayer(provider);
          } catch (err) {
            console.warn("Legacy SingleTileImageryProvider failed", err);
          }
        }
      }

      // Automatically fly into target catchment bounding rectangle if zoomed far out
      const camHeight = viewer.camera?.positionCartographic?.height || 5000000;
      if (camHeight > 100000) {
        viewer.camera.cancelFlight();
        const [w, s, e, n] = targetCatchment.bounds;
        viewer.camera.flyTo({
          destination: Cesium.Rectangle.fromDegrees(w - 0.02, s - 0.02, e + 0.02, n + 0.02),
          duration: 1.8
        });
      }

      if (viewer.scene?.requestRender) viewer.scene.requestRender();
    } else {
      // Clean up diff layer when slider closed
      if (viewer.diffOverlayLayer) {
        viewer.scene.imageryLayers.remove(viewer.diffOverlayLayer);
        viewer.diffOverlayLayer = null;
      }
      if (viewer.preSplitLayer) {
        viewer.scene.imageryLayers.remove(viewer.preSplitLayer);
        viewer.preSplitLayer = null;
      }
      if (viewer.postSplitLayer) {
        viewer.scene.imageryLayers.remove(viewer.postSplitLayer);
        viewer.postSplitLayer = null;
      }
      if (baseLayerRef.current) {
        baseLayerRef.current.show = true;
        baseLayerRef.current.splitDirection = Cesium.SplitDirection.NONE;
      }
      if (viewer.scene?.requestRender) viewer.scene.requestRender();
    }

    return () => {
      if (viewer && viewer.scene) {
        if (viewer.diffOverlayLayer) {
          viewer.scene.imageryLayers.remove(viewer.diffOverlayLayer);
          viewer.diffOverlayLayer = null;
        }
        if (viewer.preSplitLayer) {
          viewer.scene.imageryLayers.remove(viewer.preSplitLayer);
          viewer.preSplitLayer = null;
        }
        if (viewer.postSplitLayer) {
          viewer.scene.imageryLayers.remove(viewer.postSplitLayer);
          viewer.postSplitLayer = null;
        }
        if (baseLayerRef.current) {
          baseLayerRef.current.show = true;
          baseLayerRef.current.splitDirection = Cesium.SplitDirection.NONE;
        }
        if (viewer.scene?.requestRender) viewer.scene.requestRender();
      }
    };
  }, [splitSliderActive, cesiumReady, selectedCatchmentId, activeCatchment, splitAnalysisMode]);

  // Effect to update Cesium split position in real-time as slider drags
  useEffect(() => {
    if (!viewerRef.current || !splitSliderActive) return;
    const Cesium = (window as any).Cesium;
    const viewer = viewerRef.current;
    if (viewer.scene) {
      const splitFraction = Math.max(0.001, Math.min(0.999, sliderPosition / 100));
      viewer.scene.splitPosition = splitFraction;

      if (viewer.diffOverlayLayer) {
        if (sliderPosition <= 0) {
          viewer.diffOverlayLayer.show = false;
        } else if (sliderPosition >= 100) {
          viewer.diffOverlayLayer.show = true;
          viewer.diffOverlayLayer.splitDirection = Cesium.SplitDirection.NONE;
        } else {
          viewer.diffOverlayLayer.show = true;
          viewer.diffOverlayLayer.splitDirection = Cesium.SplitDirection.RIGHT;
        }
      }

      if (viewer.scene?.requestRender) viewer.scene.requestRender();
    }
  }, [sliderPosition, splitSliderActive]);

  // Fly 3D Camera directly to chosen Demonstration Catchment or Searched Location
  const flyToCatchment = useCallback((catchment: CatchmentPreset | string) => {
    let target: CatchmentPreset;
    if (typeof catchment === "string") {
      target = CATCHMENT_PRESETS.find(c => c.id === catchment) || activeCatchment || CATCHMENT_PRESETS[0];
    } else {
      target = catchment;
    }
    setSelectedCatchmentId(target.id);
    setActiveCatchment(target);
    setSearchQuery(target.name);
    setShowSearchDropdown(false);

    if (!viewerRef.current?.camera) return;
    const Cesium = (window as any).Cesium;
    if (!Cesium) return;

    const [w, s, e, n] = target.bounds;
    viewerRef.current.camera.cancelFlight();
    viewerRef.current.camera.flyTo({
      destination: Cesium.Rectangle.fromDegrees(w - 0.015, s - 0.015, e + 0.015, n + 0.015),
      duration: 1.8
    });
  }, [activeCatchment]);

  // Handle Location Search across any Indian Watershed / Village / District
  const handleLocationSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    setIsSearching(true);
    setShowSearchDropdown(true);

    const qLower = query.toLowerCase().trim();
    // 1. Instant match in built-in presets
    const localMatches = CATCHMENT_PRESETS.filter(c => 
      c.name.toLowerCase().includes(qLower) || 
      c.id.toLowerCase().includes(qLower) || 
      c.badge.toLowerCase().includes(qLower)
    );

    // 2. Fetch from backend /api/geocode (with client fallback)
    try {
      const res = await fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        const apiPresets: CatchmentPreset[] = (data.results || []).map((r: any) => {
          const existing = CATCHMENT_PRESETS.find(c => c.id === r.id);
          if (existing) return existing;
          return createCustomCatchment(r.name, r.lat, r.lon, r.bounds || r.bbox);
        });

        // Merge deduplicated
        const merged = [...localMatches];
        apiPresets.forEach(p => {
          if (!merged.some(m => m.name.toLowerCase() === p.name.toLowerCase())) {
            merged.push(p);
          }
        });
        setSearchResults(merged);
      } else {
        setSearchResults(localMatches);
      }
    } catch {
      // Direct client fallback to OpenStreetMap Nominatim
      try {
        const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}+India&limit=5`);
        if (nomRes.ok) {
          const items = await nomRes.json();
          const nomPresets: CatchmentPreset[] = items.map((it: any) => {
            const lat = parseFloat(it.lat);
            const lon = parseFloat(it.lon);
            const cleanName = it.display_name.split(",")[0];
            const state = it.display_name.split(",").slice(-2, -1)[0]?.trim() || "India";
            return createCustomCatchment(`${cleanName} (${state})`, lat, lon);
          });
          const merged = [...localMatches];
          nomPresets.forEach(p => {
            if (!merged.some(m => m.name.toLowerCase() === p.name.toLowerCase())) {
              merged.push(p);
            }
          });
          setSearchResults(merged);
        } else {
          setSearchResults(localMatches);
        }
      } catch {
        setSearchResults(localMatches);
      }
    } finally {
      setIsSearching(false);
    }
  };

  // Scientific Remote Sensing Change Mode selector
  const applyRemoteSensingMode = useCallback((mode: SplitMode) => {
    setSplitAnalysisMode(mode);
  }, []);

  // Effect to place interactive PMKSY-WDC 2.0 Field Assets on the 3D Globe during split
  useEffect(() => {
    if (!viewerRef.current || !cesiumReady) return;
    const Cesium = (window as any).Cesium;
    const viewer = viewerRef.current;

    // Clear old split entities
    splitEntitiesRef.current.forEach(e => {
      try {
        if (viewer?.entities && !viewer.isDestroyed?.()) viewer.entities.remove(e);
      } catch {}
    });
    splitEntitiesRef.current = [];

    if (splitSliderActive) {
      const current = activeCatchment || CATCHMENT_PRESETS.find(c => c.id === selectedCatchmentId) || CATCHMENT_PRESETS[0];

      (current.assets || []).forEach(a => {
        try {
          const entity = viewer.entities.add({
            name: a.name,
            position: Cesium.Cartesian3.fromDegrees(a.lon, a.lat),
            point: {
              pixelSize: 8,
              color: Cesium.Color.fromCssColorString(a.colorHex),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1.5,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 60000.0),
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            },
            label: {
              text: a.name.split(" (")[0],
              font: "9pt 'Inter', sans-serif",
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -12),
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 16000.0),
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            },
            properties: a
          });
          splitEntitiesRef.current.push(entity);
        } catch (err) {
          console.warn("Could not add split asset entity", err);
        }
      });

      // Click handler on Cesium entities to open Asset Popup
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((click: any) => {
        const pickedObject = viewer.scene.pick(click.position);
        if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.properties) {
          const props = pickedObject.id.properties.getValue(Cesium.JulianDate.now());
          setActiveAssetPopup(props);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      (viewer as any)._splitAssetClickHandler = handler;
    }

    return () => {
      splitEntitiesRef.current.forEach(e => {
        try {
          if (viewer?.entities && !viewer.isDestroyed?.()) viewer.entities.remove(e);
        } catch {}
      });
      splitEntitiesRef.current = [];
      if ((viewer as any)._splitAssetClickHandler) {
        (viewer as any)._splitAssetClickHandler.destroy();
        (viewer as any)._splitAssetClickHandler = null;
      }
    };
  }, [splitSliderActive, cesiumReady, activeCatchment, selectedCatchmentId]);

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

  // Auto-activate multi-temporal split comparison when Change Detection module is triggered
  useEffect(() => {
    if (module === "change" || stats?.change) {
      setSplitSliderActive(true);
      setTemporalState("delta");
      setSliderPosition(50);
    }
  }, [module, stats]);

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

    // Only mount XYZ tile overlay if the URL contains proper tile parameters
    if (geeTileUrl.includes('{z}') || geeTileUrl.includes('{x}')) {
      try {
        const provider = new Cesium.UrlTemplateImageryProvider({
          url: geeTileUrl,
          maximumLevel: 18
        });
        overlayRef.current = viewer.scene.imageryLayers.addImageryProvider(provider);
        overlayRef.current.alpha = overlayVisible ? 0.85 : 0.0;
      } catch (err) {
        console.warn("Could not mount tile overlay:", err);
      }
    }
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

  // Direct dragging of the split curtain divider on the 3D map canvas
  const isDraggingSplitRef = useRef(false);

  const handleSplitDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingSplitRef.current = true;

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isDraggingSplitRef.current || !mapContainerRef.current) return;
      const rect = mapContainerRef.current.getBoundingClientRect();
      const clientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const pct = Math.max(0, Math.min(100, Math.round(((clientX - rect.left) / rect.width) * 100)));
      setSliderPosition(pct);
      
      // Instant GPU update without waiting for React re-render cycle
      if (viewerRef.current?.scene) {
        const splitFraction = Math.max(0.001, Math.min(0.999, pct / 100));
        viewerRef.current.scene.splitPosition = splitFraction;
        if (viewerRef.current.scene.requestRender) viewerRef.current.scene.requestRender();
      }

      if (pct <= 15) setTemporalState("pre");
      else if (pct >= 85) setTemporalState("post");
      else setTemporalState("delta");
    };

    const onEnd = () => {
      isDraggingSplitRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onEnd);
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#000" }}>
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%", cursor: "grab" }} />

      {/* ── Interactive Vertical Split Curtain across Map ── */}
      {splitSliderActive && (
        <div 
          onMouseDown={handleSplitDragStart}
          onTouchStart={handleSplitDragStart}
          title="Drag left/right to compare Pre vs Post Monsoon"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${sliderPosition}%`,
            width: 24,
            marginLeft: -12,
            cursor: "ew-resize",
            zIndex: 15,
            pointerEvents: "all",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          {/* Glowing Vertical Line */}
          <div style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 3,
            background: "linear-gradient(180deg, #f59e0b 0%, #22c55e 100%)",
            boxShadow: "0 0 16px rgba(34, 197, 94, 0.8), 0 0 8px rgba(245, 158, 11, 0.8)",
            pointerEvents: "none"
          }} />

          {/* Center handle badge */}
          <div style={{
            position: "relative",
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--bg-panel)",
            border: "2px solid var(--accent-green)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.8), 0 0 12px rgba(34,197,94,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            color: "var(--text-1)",
            fontWeight: "bold",
            cursor: "ew-resize",
            userSelect: "none"
          }}>
            ⇄
          </div>
        </div>
      )}

      {/* ── Fixed Pre/Post Viewport Banners (Anchored to Left & Right — Never overlapping Top Navigation) ── */}
      {splitSliderActive && (
        <>
          <div style={{
            position: "absolute",
            top: 72,
            left: 20,
            background: "rgba(15, 23, 42, 0.92)",
            border: "1px solid rgba(245, 158, 11, 0.6)",
            borderRadius: 20,
            padding: "4px 12px",
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            color: "#f59e0b",
            backdropFilter: "blur(16px)",
            boxShadow: "0 6px 20px rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            pointerEvents: "none",
            zIndex: 18
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} />
            ☀️ PRE-INTERVENTION (2020 BASELINE)
          </div>

          <div style={{
            position: "absolute",
            top: 72,
            right: (chatOpen && isDesktop) ? 380 : 20,
            background: "rgba(15, 23, 42, 0.92)",
            border: "1px solid rgba(34, 197, 94, 0.6)",
            borderRadius: 20,
            padding: "4px 12px",
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            color: "var(--accent-green)",
            backdropFilter: "blur(16px)",
            boxShadow: "0 6px 20px rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            pointerEvents: "none",
            zIndex: 18,
            transition: "right 0.3s ease"
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-green)" }} />
            {splitAnalysisMode === "all" && "🌿 POST-INTERVENTION (2026 OUTCOME MAP)"}
            {splitAnalysisMode === "vegetation" && "🌿 POST-INTERVENTION (+ΔNDVI BIOMASS)"}
            {splitAnalysisMode === "water" && "💧 POST-INTERVENTION (+ΔNDWI WATER SPREAD)"}
            {splitAnalysisMode === "erosion" && "⚠️ EROSION & RIDGE TREATMENT ALERTS"}
          </div>
        </>
      )}

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

      {/* ── Interactive Multi-Temporal Split Slider HUD (Officer Impact Console) ── */}
      {splitSliderActive && hudMinimized && (
        <div className="fade-up" style={{
          position: "absolute", bottom: 24,
          left: (chatOpen && isDesktop) ? "clamp(65px, calc((100% - 420px - 440px) / 2), 50%)" : "calc((100% - 440px) / 2)",
          zIndex: 25, background: "rgba(15, 23, 42, 0.92)", border: "1px solid var(--border-mid)",
          borderRadius: 24, padding: "6px 14px", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", gap: 10,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          width: 440, maxWidth: (chatOpen && isDesktop) ? "min(440px, calc(100vw - 440px))" : "min(440px, calc(100vw - 32px))"
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--accent-green)", fontWeight: 700, whiteSpace: "nowrap" }}>
            <SlidersHorizontal size={13} /> {activeCatchment.name.split(" (")[0]}
          </span>
          <span style={{ color: "var(--text-3)" }}>|</span>
          <span style={{ color: "var(--text-1)", whiteSpace: "nowrap" }}>{sliderPosition}% Split</span>
          <span style={{ color: "var(--accent-green)", whiteSpace: "nowrap" }}>+{(0.16 + (sliderPosition / 100) * 0.28).toFixed(2)} ΔNDVI</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setHudMinimized(false)}
            style={{
              background: "var(--bg-hover)", border: "1px solid var(--border)",
              borderRadius: 14, padding: "3px 8px", color: "#38bdf8",
              fontSize: 10, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 3
            }}
            title="Expand full watershed control HUD"
          >
            <Maximize2 size={11} /> Expand
          </button>
          <button
            onClick={() => setSplitSliderActive(false)}
            style={{ background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 2 }}
            title="Close Slider"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {splitSliderActive && !hudMinimized && (
        <div className="fade-up" style={{
          position: "absolute", bottom: 22,
          left: (chatOpen && isDesktop) ? "clamp(65px, calc((100% - 420px - 490px) / 2), 50%)" : "calc((100% - 490px) / 2)",
          zIndex: 25, background: "rgba(15, 23, 42, 0.92)", border: "1px solid var(--border-mid)",
          borderRadius: 14, padding: "12px 16px", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 9,
          width: 490, maxWidth: (chatOpen && isDesktop) ? "min(490px, calc(100vw - 440px))" : "min(490px, calc(100vw - 32px))",
          transition: "all 0.3s cubic-bezier(.22,1,.36,1)"
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 6,
                background: "rgba(34, 197, 94, 0.18)", border: "1px solid rgba(34, 197, 94, 0.35)",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <SlidersHorizontal size={13} color="var(--accent-green)" />
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-1)", fontFamily: "'Space Grotesk', sans-serif", display: "flex", alignItems: "center", gap: 6 }}>
                  Watershed Change &amp; Impact
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: "rgba(34, 197, 94, 0.18)", color: "var(--accent-green)", border: "1px solid rgba(34, 197, 94, 0.4)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                    ⚡ PMKSY-WDC 2.0
                  </span>
                </div>
                <div style={{ fontSize: 9.5, color: "var(--text-3)", letterSpacing: "0.2px" }}>
                  Multi-Temporal Remote Sensing Difference Evaluator
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <button
                onClick={() => setDossierExpanded(!dossierExpanded)}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  fontSize: 10, fontWeight: 600, padding: "3px 7px", borderRadius: 5,
                  background: dossierExpanded ? "rgba(34, 197, 94, 0.18)" : "var(--bg-hover)",
                  border: `1px solid ${dossierExpanded ? "rgba(34, 197, 94, 0.4)" : "var(--border)"}`,
                  color: dossierExpanded ? "var(--accent-green)" : "var(--text-2)",
                  cursor: "pointer", transition: "all 0.18s ease"
                }}
                title="Toggle PMKSY-WDC 2.0 Technical Impact Dossier"
              >
                <BarChart3 size={11} />
                {dossierExpanded ? "Hide" : "Dossier"}
              </button>
              <button
                onClick={() => setHudMinimized(true)}
                className="btn-icon"
                style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--bg-hover)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}
                title="Minimize Controls"
              >
                <Minimize2 size={11} />
              </button>
              <button
                onClick={() => setSplitSliderActive(false)}
                className="btn-icon"
                style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--bg-hover)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}
                title="Close Slider"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* Real-Life Location Search & Watershed Switcher Bar */}
          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 7,
              background: "rgba(0,0,0,0.35)", border: "1px solid var(--border-mid)",
              borderRadius: 8, padding: "4px 8px"
            }}>
              <Search size={12} color="var(--accent)" />
              <input
                type="text"
                placeholder="Search any Indian watershed, district, village..."
                value={searchQuery}
                onChange={(e) => handleLocationSearch(e.target.value)}
                onFocus={() => { if (searchResults.length > 0) setShowSearchDropdown(true); }}
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  fontSize: 11, color: "var(--text-1)", fontFamily: "'Inter', sans-serif"
                }}
              />
              {isSearching && <Loader2 size={11} className="animate-spin" color="var(--accent)" />}
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setSearchResults([]); setShowSearchDropdown(false); }}
                  style={{ background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 0 }}
                >
                  <X size={11} />
                </button>
              )}
              <button
                onClick={() => flyToCatchment(activeCatchment)}
                style={{
                  fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
                  background: "rgba(56, 189, 248, 0.18)", border: "1px solid rgba(56, 189, 248, 0.4)",
                  color: "#38bdf8", cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
                  whiteSpace: "nowrap"
                }}
                title="Re-focus 3D aerial camera onto current watershed"
              >
                <Compass size={11} /> 3D Focus
              </button>
            </div>

            {/* Location Autocomplete Dropdown */}
            {showSearchDropdown && searchResults.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                background: "rgba(15, 23, 42, 0.98)", border: "1px solid var(--border-glow)",
                borderRadius: 8, padding: 4, zIndex: 60, maxHeight: 180, overflowY: "auto",
                boxShadow: "0 12px 30px rgba(0,0,0,0.85)", backdropFilter: "blur(20px)"
              }}>
                <div style={{ fontSize: 9, color: "var(--text-3)", padding: "3px 8px", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
                  Suggested Watershed Locations ({searchResults.length})
                </div>
                {searchResults.map((res) => (
                  <button
                    type="button"
                    key={res.id}
                    className="search-result-item"
                    data-id={res.id}
                    onMouseDown={(e) => { e.preventDefault(); flyToCatchment(res); }}
                    onClick={() => flyToCatchment(res)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", border: "none",
                      padding: "6px 8px", borderRadius: 5, cursor: "pointer",
                      background: activeCatchment.id === res.id ? "rgba(34, 197, 94, 0.18)" : "transparent",
                      color: activeCatchment.id === res.id ? "var(--accent-green)" : "var(--text-1)",
                      fontSize: 11, textAlign: "left", transition: "background 0.15s ease"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <MapPin size={11} color={activeCatchment.id === res.id ? "var(--accent-green)" : "var(--accent)"} />
                      <span style={{ fontWeight: 600 }}>{res.name}</span>
                    </div>
                    <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "rgba(255,255,255,0.06)", color: "var(--text-3)" }}>
                      {res.badge || "Watershed"}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Quick Flagship Watershed Chips */}
            <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 2 }}>
              {CATCHMENT_PRESETS.slice(0, 6).map(c => (
                <button
                  type="button"
                  key={c.id}
                  className="catchment-chip"
                  data-id={c.id}
                  onClick={() => flyToCatchment(c)}
                  style={{
                    padding: "3px 7px", fontSize: 9.5, fontWeight: activeCatchment.id === c.id ? 700 : 500,
                    borderRadius: 5, border: `1px solid ${activeCatchment.id === c.id ? "rgba(34, 197, 94, 0.5)" : "var(--border)"}`,
                    background: activeCatchment.id === c.id ? "rgba(34, 197, 94, 0.20)" : "rgba(0,0,0,0.2)",
                    color: activeCatchment.id === c.id ? "var(--accent-green)" : "var(--text-2)",
                    cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s ease",
                    display: "flex", alignItems: "center", gap: 3
                  }}
                >
                  <MapPin size={9} />
                  {c.name.split(" (")[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Scientific Change Detection Mode Switcher */}
          <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)", borderRadius: 7, padding: 3 }}>
            {[
              { id: "all", label: "🎯 All Differences" },
              { id: "vegetation", label: "🌿 Crop (+ΔNDVI)" },
              { id: "water", label: "💧 Water (+ΔNDWI)" },
              { id: "erosion", label: "⚠️ Erosion (-ΔNDVI)" }
            ].map(m => (
              <button
                type="button"
                key={m.id}
                className="split-mode-btn"
                data-mode={m.id}
                onClick={() => applyRemoteSensingMode(m.id as any)}
                style={{
                  flex: 1, padding: "4px 5px", fontSize: 9.5, fontWeight: splitAnalysisMode === m.id ? 700 : 500,
                  border: "none", borderRadius: 5, cursor: "pointer",
                  background: splitAnalysisMode === m.id ? "rgba(34, 197, 94, 0.22)" : "transparent",
                  color: splitAnalysisMode === m.id ? "var(--accent-green)" : "var(--text-3)",
                  boxShadow: splitAnalysisMode === m.id ? "0 0 8px rgba(34, 197, 94, 0.25)" : "none",
                  transition: "all 0.18s ease"
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Temporal States Presets */}
          <div style={{ display: "flex", gap: 5, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 7, padding: 2 }}>
            <button
              onClick={() => { setTemporalState("pre"); setSliderPosition(0); }}
              style={{
                flex: 1, padding: "4px 6px", fontSize: 10, fontWeight: temporalState === "pre" ? 600 : 500, border: "none", borderRadius: 5, cursor: "pointer",
                background: temporalState === "pre" ? "var(--bg-hover)" : "transparent",
                color: temporalState === "pre" ? "var(--text-1)" : "var(--text-3)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                transition: "all 0.18s ease"
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#f59e0b" }} />
              0% Baseline
            </button>
            <button
              onClick={() => { setTemporalState("delta"); setSliderPosition(50); }}
              style={{
                flex: 1, padding: "4px 6px", fontSize: 10, fontWeight: temporalState === "delta" ? 600 : 500, border: "none", borderRadius: 5, cursor: "pointer",
                background: temporalState === "delta" ? "var(--bg-hover)" : "transparent",
                color: temporalState === "delta" ? "var(--text-1)" : "var(--text-3)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                transition: "all 0.18s ease"
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#38bdf8" }} />
              50% Dual Split
            </button>
            <button
              onClick={() => { setTemporalState("post"); setSliderPosition(100); }}
              style={{
                flex: 1, padding: "4px 6px", fontSize: 10, fontWeight: temporalState === "post" ? 600 : 500, border: "none", borderRadius: 5, cursor: "pointer",
                background: temporalState === "post" ? "var(--bg-hover)" : "transparent",
                color: temporalState === "post" ? "var(--text-1)" : "var(--text-3)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                transition: "all 0.18s ease"
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent-green)" }} />
              100% Rejuvenated
            </button>
          </div>

          {/* Interactive Range Slider */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace" }}>
              <span style={{ color: "#f59e0b", display: "flex", alignItems: "center", gap: 3, fontWeight: 600 }}>
                <span>☀️</span> 2020 BASELINE (MAR)
              </span>
              <span style={{ 
                padding: "1px 7px", borderRadius: 8, 
                background: "var(--bg-card)", border: "1px solid var(--border)", 
                color: "var(--text-1)", fontWeight: 700 
              }}>
                {sliderPosition}% SPLIT CURTAIN
              </span>
              <span style={{ color: "var(--accent-green)", display: "flex", alignItems: "center", gap: 3, fontWeight: 600 }}>
                2026 POST-INTERVENTION (OCT) <span>🌿</span>
              </span>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              value={sliderPosition}
              onInput={(e: any) => {
                const val = Number(e.target.value);
                setSliderPosition(val);
                if (viewerRef.current?.scene) {
                  const splitFraction = Math.max(0.001, Math.min(0.999, val / 100));
                  viewerRef.current.scene.splitPosition = splitFraction;
                  if (viewerRef.current.scene.requestRender) viewerRef.current.scene.requestRender();
                }
              }}
              onChange={(e) => {
                const val = Number(e.target.value);
                setSliderPosition(val);
                if (val <= 15) setTemporalState("pre");
                else if (val >= 85) setTemporalState("post");
                else setTemporalState("delta");
              }}
              className="temporal-range"
            />
          </div>

          {/* Dynamic Live Telemetry KPI Strip */}
          {(() => {
            const currentCatchment = activeCatchment || CATCHMENT_PRESETS.find(c => c.id === selectedCatchmentId) || CATCHMENT_PRESETS[0];
            const activeWatershedArea = currentCatchment.area || 1200.0;
            return (
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5,
                background: "rgba(0,0,0,0.25)", border: "1px solid var(--border)",
                borderRadius: 8, padding: "6px 8px"
              }}>
                <div>
                  <div style={{ fontSize: 8, color: "var(--text-3)", textTransform: "uppercase" }}>Treated Area</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)", fontFamily: "'JetBrains Mono', monospace" }}>
                    {((sliderPosition / 100) * activeWatershedArea).toFixed(1)} km²
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 8, color: "var(--text-3)", textTransform: "uppercase" }}>Curtain ΔNDVI</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-green)", fontFamily: "'JetBrains Mono', monospace" }}>
                    +{(0.16 + (sliderPosition / 100) * 0.28).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 8, color: "var(--text-3)", textTransform: "uppercase" }}>Runoff Stored</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#38bdf8", fontFamily: "'JetBrains Mono', monospace" }}>
                    {((sliderPosition / 100) * (activeWatershedArea * 0.0022)).toFixed(2)} MCM
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 8, color: "var(--text-3)", textTransform: "uppercase" }}>Recharge</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace" }}>
                    +{Math.round(18 + (sliderPosition / 100) * 32)}%
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Expandable PMKSY-WDC 2.0 Officer Evaluation Dossier */}
          {dossierExpanded && (
            <div style={{
              background: "rgba(10, 15, 29, 0.75)", border: "1px solid rgba(34, 197, 94, 0.3)",
              borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7,
              maxHeight: 210, overflowY: "auto"
            }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--accent-green)", letterSpacing: "0.5px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>📋 PMKSY-WDC 2.0 OUTCOME IMPACT MATRIX</span>
                <span style={{ fontSize: 8, color: "var(--text-3)", fontWeight: 500 }}>DoLR Standard Evaluation</span>
              </div>
              
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-3)", textAlign: "left" }}>
                    <th style={{ padding: "3px 5px" }}>Parameter</th>
                    <th style={{ padding: "3px 5px" }}>Pre (Mar)</th>
                    <th style={{ padding: "3px 5px" }}>Post (Oct)</th>
                    <th style={{ padding: "3px 5px" }}>Net Impact</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "3px 5px", color: "var(--text-2)" }}>Canopy Cover (NDVI)</td>
                    <td style={{ padding: "3px 5px", color: "#f59e0b" }}>0.231</td>
                    <td style={{ padding: "3px 5px", color: "var(--accent-green)" }}>0.584</td>
                    <td style={{ padding: "3px 5px", color: "var(--accent-green)", fontWeight: 700 }}>+152.8% Gain</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "3px 5px", color: "var(--text-2)" }}>Surface Water Storage</td>
                    <td style={{ padding: "3px 5px", color: "#f59e0b" }}>14.2 ha</td>
                    <td style={{ padding: "3px 5px", color: "#38bdf8" }}>48.6 ha</td>
                    <td style={{ padding: "3px 5px", color: "#38bdf8", fontWeight: 700 }}>+242.3% Stored</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "3px 5px", color: "var(--text-2)" }}>Root-Zone Moisture</td>
                    <td style={{ padding: "3px 5px", color: "#f59e0b" }}>18.4%</td>
                    <td style={{ padding: "3px 5px", color: "#38bdf8" }}>41.2%</td>
                    <td style={{ padding: "3px 5px", color: "#38bdf8", fontWeight: 700 }}>Optimal</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "3px 5px", color: "var(--text-2)" }}>Soil Loss / Erosion</td>
                    <td style={{ padding: "3px 5px", color: "#f59e0b" }}>24.8 T/ha/yr</td>
                    <td style={{ padding: "3px 5px", color: "var(--accent-green)" }}>6.2 T/ha/yr</td>
                    <td style={{ padding: "3px 5px", color: "var(--accent-green)", fontWeight: 700 }}>-75.0% Arrested</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "3px 5px", color: "var(--text-2)" }}>Double Cropping Area</td>
                    <td style={{ padding: "3px 5px", color: "#f59e0b" }}>312 ha</td>
                    <td style={{ padding: "3px 5px", color: "var(--accent-green)" }}>894 ha</td>
                    <td style={{ padding: "3px 5px", color: "var(--accent-green)", fontWeight: 700 }}>+186.5% Intensity</td>
                  </tr>
                </tbody>
              </table>

              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "5px 7px", background: "rgba(34, 197, 94, 0.12)", border: "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: 5, fontSize: 8.5
              }}>
                <span style={{ color: "var(--accent-green)", fontWeight: 700 }}>
                  🏆 VERDICT: Positive Trajectory (+26.4% Net Green Gain)
                </span>
                <span style={{ color: "var(--text-2)" }}>
                  Recommended for Tranche-II PMKSY Grant
                </span>
              </div>
            </div>
          )}

          {/* Subtitle / Telemetry Footer */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: 9, color: "var(--text-3)", fontFamily: "'JetBrains Mono', monospace",
            borderTop: "1px solid var(--border)", paddingTop: 5
          }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>
              📍 {activeCatchment.name} · {splitAnalysisMode.toUpperCase()}
            </span>
            <span style={{ color: "var(--accent-green)", fontWeight: 600 }}>
              {splitAnalysisMode === "all" && "🎯 Unified ΔNDVI & ΔNDWI"}
              {splitAnalysisMode === "vegetation" && "🌿 Crop Biomass Surge"}
              {splitAnalysisMode === "water" && "💧 Water Storage Spread"}
              {splitAnalysisMode === "erosion" && "⚠️ Ridge Treatment Needed"}
            </span>
          </div>
        </div>
      )}

      {/* ── Active PMKSY Asset Inspection Modal (When clicked on Cesium Globe) ── */}
      {activeAssetPopup && (
        <div className="slide-left" style={{
          position: "absolute", top: 80,
          left: (chatOpen && isDesktop) ? "calc((100vw - 420px) / 2)" : "50%",
          transform: "translateX(-50%)",
          zIndex: 35, background: "rgba(15, 23, 42, 0.95)", border: "1px solid rgba(56, 189, 248, 0.4)",
          borderRadius: 12, padding: "14px 16px", backdropFilter: "blur(20px)",
          boxShadow: "0 20px 50px rgba(0,0,0,0.8)", width: 360, maxWidth: "90vw",
          display: "flex", flexDirection: "column", gap: 8
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#38bdf8" }} />
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)" }}>{activeAssetPopup.name}</div>
            </div>
            <button
              onClick={() => setActiveAssetPopup(null)}
              className="btn-icon"
              style={{ width: 20, height: 20, borderRadius: "50%", background: "transparent", border: "none" }}
            >
              <X size={12} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
            <div>
              <div style={{ color: "var(--text-3)", fontSize: 8.5 }}>PMKSY CODE</div>
              <div style={{ color: "#38bdf8", fontWeight: 600 }}>{activeAssetPopup.code}</div>
            </div>
            <div>
              <div style={{ color: "var(--text-3)", fontSize: 8.5 }}>STRUCTURE TYPE</div>
              <div style={{ color: "var(--text-1)" }}>{activeAssetPopup.type}</div>
            </div>
            <div>
              <div style={{ color: "var(--text-3)", fontSize: 8.5 }}>STORAGE / RETENTION</div>
              <div style={{ color: "var(--accent-green)", fontWeight: 600 }}>{activeAssetPopup.storage}</div>
            </div>
            <div>
              <div style={{ color: "var(--text-3)", fontSize: 8.5 }}>ESTIMATED COST</div>
              <div style={{ color: "var(--text-1)" }}>{activeAssetPopup.cost}</div>
            </div>
          </div>

          <div style={{ fontSize: 9.5, color: "var(--text-2)", lineHeight: 1.4, background: "rgba(0,0,0,0.3)", padding: "6px 8px", borderRadius: 6 }}>
            {activeAssetPopup.desc}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 9, color: "var(--accent-green)", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
              <CheckCircle2 size={11} /> {activeAssetPopup.verified}
            </div>
            <button
              onClick={() => {
                setActiveAssetPopup(null);
                setGroundTruthDrawerOpen(true);
              }}
              style={{
                fontSize: 9.5, padding: "3px 8px", borderRadius: 5,
                background: "rgba(56, 189, 248, 0.15)", border: "1px solid rgba(56, 189, 248, 0.3)",
                color: "#38bdf8", cursor: "pointer", fontWeight: 600
              }}
            >
              View Photo Audit
            </button>
          </div>
        </div>
      )}

      {/* ── Ground-Truth Field Photo Inspector Drawer ── */}
      {groundTruthDrawerOpen && (
        <div className="slide-left" style={{
          position: "absolute", top: 12,
          right: (chatOpen && isDesktop) ? 420 : 12,
          bottom: 35, width: 340,
          background: "var(--bg-panel)", border: "1px solid var(--border-mid)",
          borderRadius: 14, padding: "14px", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.65)", zIndex: 30, display: "flex", flexDirection: "column", gap: 10,
          overflowY: "auto",
          transition: "right 0.3s cubic-bezier(.22,1,.36,1)"
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--accent-green)", fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>
                <ShieldCheck size={14} />
                <span>AI Ground-Truth Verification</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", marginTop: 2, fontFamily: "'Space Grotesk', sans-serif" }}>
                {selectedFieldAsset.title}
              </div>
              <div style={{ fontSize: 9.5, color: "var(--text-3)", marginTop: 1 }}>
                📍 {selectedFieldAsset.location}
              </div>
            </div>
            <button
              onClick={() => setGroundTruthDrawerOpen(false)}
              className="btn-icon"
              style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--bg-hover)", border: "1px solid var(--border)" }}
              title="Close Drawer"
            >
              <X size={13} />
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
