function sanitizeApiUrl(raw?: string): string {
  const url = (raw || "").trim();
  if (!url || url === "https://jaldrishti-backend.onrender.com" || url === "http://jaldrishti-backend.onrender.com") {
    return "https://jaldrishti-backend-4rh0.onrender.com";
  }
  return url.replace(/\/+$/, "");
}

export const API_BASE = sanitizeApiUrl(process.env.NEXT_PUBLIC_API_URL);

export interface ChatRequest {
  query: string;
  location?: string;
  date?: string;
  language?: string;
  geojson?: any;
  ai_provider?: string;
  base64_image?: string;
}

export interface ChatResponse {
  // AI report
  reply: string;
  module?: string;
  module_label?: string;
  location?: string;

  // Geo-pinning — the KEY fields for real map overlay
  image_url?: string | null;       // Real STAC thumbnail URL
  bbox?: number[] | null;          // [min_lon, min_lat, max_lon, max_lat]
  center_lat?: number | null;
  center_lon?: number | null;

  // Scene metadata
  scene_id?: string;
  sensor?: string;
  scene_date?: string;
  cloud_cover?: number;
  stac_source?: string;

  // GEE computed metrics
  ndvi_score?: number | null;
  area_km2?: number | null;
  gee_tile_url?: string | null;
  compare_years?: number[] | null;
  grounding_boxes?: any[];
  stats?: any;
}

export async function sendChatMessage(payload: ChatRequest): Promise<ChatResponse> {
  const cleanPayload: Record<string, any> = { query: payload.query };
  if (payload.location) cleanPayload.location = payload.location;
  if (payload.date) cleanPayload.date = payload.date;
  if (payload.language) cleanPayload.language = payload.language;
  if (payload.geojson) cleanPayload.geojson = payload.geojson;
  if (payload.ai_provider) cleanPayload.ai_provider = payload.ai_provider;
  if (payload.base64_image) cleanPayload.base64_image = payload.base64_image;

  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Bypass-Tunnel-Reminder": "true" 
    },
    body: JSON.stringify(cleanPayload),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

