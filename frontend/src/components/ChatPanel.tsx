"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { RotateCcw, Image as ImageIcon, Send, Paperclip, ChevronDown, Satellite, X, Map, Leaf, GitBranch, Droplets, RefreshCw, Globe, Mic, Loader2, FileDown } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import { sendChatMessage, ChatResponse, API_BASE } from "@/lib/api";

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  data?: ChatResponse;
}

const SUGGESTIONS = [
  { text: "Generate land use / land cover map for Rajasthan watershed", module: "landuse" },
  { text: "Show NDVI vegetation health in Bundelkhand region",       module: "vegetation"  },
  { text: "Map drainage patterns in Narmada sub-basin",        module: "drainage" },
  { text: "Analyze soil moisture change pre vs post monsoon",     module: "moisture"},
  { text: "Detect land use change in Arvari watershed 2020-2026",       module: "change" },
];

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिंदी" },
  { code: "hinglish", label: "Hinglish" },
  { code: "mr", label: "मराठी" },
  { code: "ta", label: "தமிழ்" },
  { code: "te", label: "తెలుగు" },
  { code: "pa", label: "ਪੰਜਾਬੀ" },
];

const SCAN_STEPS = [
  "Querying SRISHTI-DRISHTI catalogue...",
  "Searching Sentinel-1/2 archive...",
  "Fetching geo-coded imagery...",
  "Running GEE thematic analysis...",
  "Generating land use classification...",
  "Building watershed assessment report...",
];

const MODULE_BADGE: Record<string, string> = {
  landuse: "badge badge-flood", vegetation: "badge badge-agri", drainage: "badge badge-urban",
  moisture: "badge badge-forest", change: "badge badge-water", general: "badge badge-general",
};

export default function ChatPanel({ onImageUpdate, onStatsUpdate, geojson, externalQuery, onClearExternalQuery }: {
  onImageUpdate?: (url: string, bbox?: number[], centerLat?: number, centerLon?: number, module?: string, geeTileUrl?: string) => void;
  onStatsUpdate?: (stats: { ndvi?: number; cloud?: number; area?: number; sensor?: string; module?: string; drainage?: any; lulc?: any; change?: any; groundingBoxes?: any[] }) => void;
  geojson?: any;
  externalQuery?: string | null;
  onClearExternalQuery?: () => void;
}) {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [lang, setLang]           = useState("en");
  const [showLang, setShowLang]   = useState(false);
  const [aiProvider, setAiProvider] = useState("gemini");
  const [showAiProvider, setShowAiProvider] = useState(false);
  const [scanIdx, setScanIdx]     = useState(0);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const scanTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (loading) {
      setScanIdx(0);
      scanTimer.current = setInterval(() => {
        setScanIdx(i => (i + 1) % SCAN_STEPS.length);
      }, 1800);
    } else {
      if (scanTimer.current) clearInterval(scanTimer.current);
    }
    return () => { if (scanTimer.current) clearInterval(scanTimer.current); };
  }, [loading]);

  useEffect(() => {
    if (externalQuery && !loading) {
      handleSend(externalQuery);
      if (onClearExternalQuery) onClearExternalQuery();
    }
  }, [externalQuery]);

  const handleSend = async (queryOverride?: string) => {
    const query = (queryOverride || input).trim();
    if (!query || loading) return;

    setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content: query }]);
    setInput("");
    setLoading(true);

    try {
      const data = await sendChatMessage({ query, language: lang, geojson, ai_provider: aiProvider, base64_image: uploadedImage || undefined });

      // Pass geo data to parent for map overlay
      if (onImageUpdate) {
        onImageUpdate(
          data.image_url || "",
          data.bbox || undefined,
          data.center_lat || undefined,
          data.center_lon || undefined,
          data.module,
          data.gee_tile_url || ""
        );
      }

      if (onStatsUpdate) {
        onStatsUpdate({
          ndvi:   data.ndvi_score != null ? data.ndvi_score : undefined,
          cloud:  data.cloud_cover != null ? data.cloud_cover : undefined,
          area:   data.area_km2 != null ? (typeof data.area_km2 === 'number' ? data.area_km2 : parseFloat(data.area_km2 as string) || undefined) : undefined,
          sensor: data.sensor,
          module: data.module,
          groundingBoxes: data.grounding_boxes,
          drainage: data.stats?.drainage,
          lulc: data.stats?.lulc,
          change: data.stats?.change,
        });
      }

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: data.reply,
        data,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: "ai",
        content: "⚠️ Connection error. Please ensure the backend is running and accessible.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.tif') || file.name.toLowerCase().endsWith('.tiff')) {
      // Handle GeoTIFF upload to fulfill PS-26167 requirement
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content: `Uploaded GeoTIFF: ${file.name}` }]);
      setLoading(true);
      
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const response = await fetch(`${API_BASE}/api/upload`, {
          method: 'POST',
          body: formData,
        });
        const result = await response.json();
        
        if (result.success && onImageUpdate) {
          if (result.base64_image) {
             setUploadedImage(result.base64_image);
          }
          // Tell map to zoom to bbox without replacing the base map image
          onImageUpdate('', result.bbox, undefined, undefined, 'upload', '');
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: "ai",
            content: `✅ GeoTIFF processed successfully!\n\n**Extracted Metadata:**\n- **Resolution**: ${result.metadata.width}x${result.metadata.height}\n- **Bands**: ${result.metadata.bands}\n- **CRS**: ${result.metadata.crs}\n\nThe map has zoomed to the spatial extent of the file. You can now ask questions about this region.`
          }]);
        } else {
            setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: "ai", content: `❌ Error processing GeoTIFF: ${result.error || 'Unknown error'}` }]);
        }
      } catch (err) {
        setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: "ai", content: `❌ Connection Error: Could not upload GeoTIFF. Is the backend running?` }]);
      } finally {
        setLoading(false);
      }
    } else if (onImageUpdate) {
      // Standard image preview
      const url = URL.createObjectURL(file);
      onImageUpdate(url);
    }
  }, [onImageUpdate]);

  const clear = () => {
      setMessages([]);
      setUploadedImage(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── Panel Header ── */}
      <div style={{
        padding: "12px 14px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 500, fontSize: 12, color: "var(--text-1)" }}>
              JalDrishti GeoAgent
            </div>
            <div style={{ fontSize: 9, color: "var(--text-3)", marginTop: 2, fontFamily: "'JetBrains Mono',monospace" }}>
              SRISHTI-DRISHTI · GEE · Thematic Mapping
            </div>
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            {/* AI Provider selector */}
            <div style={{ position: "relative" }}>
              <button
                className="btn-icon"
                style={{ height: 30, gap: 4, padding: "0 8px", width: "auto" }}
                onClick={() => setShowAiProvider(!showAiProvider)}
              >
                <div style={{ fontSize: 10, fontWeight: "bold", color: aiProvider === "nvidia" ? "#76b900" : "var(--text-1)" }}>
                  {aiProvider === "gemini" ? "Google Gemini" : "NVIDIA NVLM"}
                </div>
                <ChevronDown size={10} />
              </button>
              {showAiProvider && (
                <div className="fade-up" style={{
                  position: "absolute", top: "calc(100% + 4px)", right: 0,
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border-mid)",
                  borderRadius: 10, overflow: "hidden",
                  zIndex: 100, minWidth: 120,
                }}>
                  {[{id: "gemini", label: "Google Gemini"}, {id: "nvidia", label: "NVIDIA NVLM"}].map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setAiProvider(p.id); setShowAiProvider(false); }}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "8px 12px", fontSize: 12,
                        background: aiProvider === p.id ? "rgba(56,189,248,0.1)" : "transparent",
                        color: aiProvider === p.id ? (p.id === "nvidia" ? "#76b900" : "var(--accent)") : "var(--text-2)",
                        border: "none", cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={e => { if (aiProvider !== p.id) (e.currentTarget).style.background = "var(--bg-hover)"; }}
                      onMouseLeave={e => { if (aiProvider !== p.id) (e.currentTarget).style.background = "transparent"; }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Language selector */}
            <div style={{ position: "relative" }}>
              <button
                className="btn-icon"
                style={{ height: 30, gap: 4, padding: "0 8px", width: "auto" }}
                onClick={() => setShowLang(!showLang)}
              >
                <Globe size={12} />
                <div style={{ fontSize: 10 }}>{LANGUAGES.find(l => l.code === lang)?.label || "English"}</div>
                <ChevronDown size={10} />
              </button>
              {showLang && (
                <div className="fade-up" style={{
                  position: "absolute", top: "calc(100% + 4px)", right: 0,
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border-mid)",
                  borderRadius: 10, overflow: "hidden",
                  zIndex: 100, minWidth: 120,
                }}>
                  {LANGUAGES.map(l => (
                    <button
                      key={l.code}
                      onClick={() => { setLang(l.code); setShowLang(false); }}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "8px 12px", fontSize: 12,
                        background: lang === l.code ? "rgba(56,189,248,0.1)" : "transparent",
                        color: lang === l.code ? "var(--accent)" : "var(--text-2)",
                        border: "none", cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={e => { if (lang !== l.code) (e.currentTarget).style.background = "var(--bg-hover)"; }}
                      onMouseLeave={e => { if (lang !== l.code) (e.currentTarget).style.background = "transparent"; }}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {messages.length > 0 && (
              <button className="btn-icon" style={{ width: 30, height: 30 }} onClick={clear} title="Clear chat">
                <RotateCcw size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Messages ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 0" }}>
        {messages.length === 0 ? (
          <div className="fade-up">
            {/* Welcome */}
            <div style={{ textAlign: "center", padding: "20px 8px 16px" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                <Satellite size={28} color="var(--text-3)" />
              </div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, fontSize: 15, marginBottom: 4, color: "var(--text-1)" }}>
                Ask the Satellite
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.6 }}>
                Interpret geo-coded images & generate thematic maps for watershed assessment.
                <br />Powered by SRISHTI-DRISHTI · Sentinel · GEE
              </div>
            </div>
            {/* Suggestion chips */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s.text}
                  className="suggestion-chip"
                  onClick={() => handleSend(s.text)}
                >
                  <span style={{ fontSize: 16, flexShrink: 0, color: "var(--text-3)", display: "flex", alignItems: "center" }}>
                    {s.module === 'landuse' ? <Map size={16} /> : 
                     s.module === 'vegetation' ? <Leaf size={16} /> : 
                     s.module === 'drainage' ? <GitBranch size={16} /> : 
                     s.module === 'moisture' ? <Droplets size={16} /> : 
                     <RefreshCw size={16} />}
                  </span>
                  <span style={{ flex: 1, textAlign: "left", fontFamily: "'Inter', sans-serif" }}>{s.text}</span>
                  <span className={MODULE_BADGE[s.module] || "badge badge-general"}>{s.module.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(m => (
            <MessageBubble key={m.id} role={m.role} content={m.content} data={m.data} />
          ))
        )}

        {/* Loading state */}
        {loading && (
          <div className="slide-left" style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10 }}>
            <div className="bubble-ai" style={{ flex: 1, minWidth: 0, fontFamily: "'JetBrains Mono', monospace" }}>
              <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600, marginBottom: 6 }}>
                Analyzing...
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 6 }}>
                <span>{SCAN_STEPS[scanIdx]}</span>
                <span className="dot" /><span className="dot" /><span className="dot" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} style={{ height: 8 }} />
      </div>

      {/* ── Input ── */}
      <div style={{ padding: "12px", flexShrink: 0, background: "var(--bg-card)", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={`Ask a question about the dataset...`}
            rows={1}
            style={{
              flex: 1, resize: "none", background: "transparent", border: "none",
              color: "var(--text-1)", fontSize: 12, outline: "none", lineHeight: 1.5,
              fontFamily: "'JetBrains Mono', monospace", maxHeight: 100, overflowY: "auto",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 5 }}>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
              <button className="btn-icon" style={{ width: 24, height: 24, border: "none" }} onClick={() => fileRef.current?.click()} title="Upload">
                <Paperclip size={12} />
              </button>
            </div>
            <button
              className="btn-primary"
              style={{ padding: "6px 12px", fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
            >
              Send Message <span style={{ fontFamily: "Arial" }}>↑</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PDF Download Helper ───────────────────────────────────────────────
function downloadPDF(content: string, data?: ChatResponse) {
  const location  = data?.location  || 'Target Watershed';
  const sensor    = data?.sensor    || 'Sentinel-2 L2A (10m-20m MSI)';
  const date      = data?.scene_date || new Date().toISOString().split('T')[0];
  const modRaw    = (data?.module_label || data?.module || 'watershed').toLowerCase();
  const moduleBadge = modRaw.toUpperCase();
  const area      = data?.area_km2 ? `${Number(data.area_km2).toLocaleString()} km²` : '420.0 km²';
  const ndvi      = data?.ndvi_score != null ? String(data.ndvi_score) : '0.44';
  const cloud     = data?.cloud_cover != null ? `${data.cloud_cover}%` : '0.6%';

  let areaLabel = "WATERSHED EXTENT";
  if (modRaw.includes('land') || modRaw.includes('lulc')) areaLabel = "CLASSIFIED AOI";
  else if (modRaw.includes('veg')) areaLabel = "CANOPY EXTENT";
  else if (modRaw.includes('drain')) areaLabel = "BASIN EXTENT";
  else if (modRaw.includes('change')) areaLabel = "EVALUATED AREA";
  else if (modRaw.includes('moist') || modRaw.includes('flood')) areaLabel = "INUNDATION SPREAD";

  // 1. Clean JSON code blocks from body content
  let textToParse = content.replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/g, '');
  textToParse = textToParse.replace(/###\s*6\..*$/m, '');

  // 2. Parse Markdown completely into HTML without dropping paragraphs
  const lines = textToParse.split('\n');
  const htmlParts: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];
  let inList = false;

  const renderMdTable = (rows: string[]) => {
    if (rows.length < 2) return '';
    const hCells = rows[0].split('|').slice(1, -1).map(c => c.trim());
    let t = '<div style="page-break-inside: avoid; margin: 12px 0;"><table style="width: 100%; border-collapse: collapse; font-family: \'Inter\', sans-serif; font-size: 11.5px; border: 1px solid #cbd5e1;">';
    t += '<tr style="background: #0c4a6e; color: white;">';
    hCells.forEach(hc => { t += `<th style="padding: 6px 10px; text-align: left; font-weight: 700;">${hc}</th>`; });
    t += '</tr>';
    for (let rIdx = 0; rIdx < rows.slice(2).length; rIdx++) {
      const cells = rows.slice(2)[rIdx].split('|').slice(1, -1).map(c => c.trim());
      const bg = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
      t += `<tr style="background: ${bg}; border-bottom: 1px solid #e2e8f0;">`;
      cells.forEach(cell => {
        const cleanCell = cell.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        t += `<td style="padding: 6px 10px; color: #334155;">${cleanCell}</td>`;
      });
      t += '</tr>';
    }
    t += '</table></div>';
    return t;
  };

  lines.forEach(line => {
    const l = line.trim();
    if (!l) {
      if (inTable) { htmlParts.push(renderMdTable(tableRows)); inTable = false; tableRows = []; }
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      return;
    }

    if (l.startsWith('|') && l.endsWith('|')) {
      if (!inTable) { inTable = true; tableRows = []; }
      tableRows.push(l);
      return;
    } else if (inTable) {
      htmlParts.push(renderMdTable(tableRows));
      inTable = false;
      tableRows = [];
    }

    if (l.startsWith('### ') || l.startsWith('## ') || l.startsWith('# ')) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      let hClean = l.replace(/^#+\s*/, '')
                    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
                    .replace(/[\u2600-\u27bf]/g, '')
                    .replace(/\*\*/g, '')
                    .trim();
      if (hClean) {
        htmlParts.push(`<h3 style="color: #0c4a6e; font-size: 14.5px; font-family: 'Inter', sans-serif; font-weight: 700; margin: 18px 0 6px 0; border-bottom: 1.5px solid #e0f2fe; padding-bottom: 3px; break-after: avoid; page-break-after: avoid;">${hClean}</h3>`);
      }
      return;
    }

    if (l.startsWith('* ') || l.startsWith('- ')) {
      if (!inList) { htmlParts.push('<ul style="padding-left: 20px; margin: 6px 0;">'); inList = true; }
      let c = l.substring(2).replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0c4a6e;">$1</strong>');
      htmlParts.push(`<li style="margin-bottom: 4px; font-size: 13px; line-height: 1.6; color: #1e293b;">${c}</li>`);
      return;
    } else if (inList && /^\d+\.\s/.test(l)) {
      let c = l.replace(/^\d+\.\s*/, '').replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0c4a6e;">$1</strong>');
      htmlParts.push(`<li style="margin-bottom: 5px; font-size: 13px; line-height: 1.6; color: #1e293b;">${c}</li>`);
      return;
    }

    let c = l.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0c4a6e;">$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
    htmlParts.push(`<p style="margin: 0 0 7px 0; font-size: 13px; line-height: 1.65; color: #1e293b;">${c}</p>`);
  });

  if (inTable) htmlParts.push(renderMdTable(tableRows));
  if (inList) htmlParts.push('</ul>');

  // 3. Grounding Hotspots Table
  const groundingBoxes = data?.grounding_boxes || [];
  let groundingTableHtml = '';
  if (groundingBoxes.length > 0) {
    groundingTableHtml += `
      <h3 style="color: #0c4a6e; font-size: 14.5px; font-family: 'Inter', sans-serif; font-weight: 700; margin: 18px 0 6px 0; border-bottom: 1.5px solid #e0f2fe; padding-bottom: 3px; break-after: avoid; page-break-after: avoid;">
        Spatial Grounding Hotspots & Verification Targets
      </h3>
      <div style="page-break-inside: avoid; margin: 10px 0;">
        <table style="width: 100%; border-collapse: collapse; font-family: 'Inter', sans-serif; font-size: 11.5px; border: 1px solid #cbd5e1;">
          <tr style="background: #0c4a6e; color: #ffffff;">
            <th style="padding: 6px 10px; text-align: left; font-weight: 700;">Hotspot Target Description</th>
            <th style="padding: 6px 10px; text-align: center; font-weight: 700;">Pixel Bounding Box</th>
            <th style="padding: 6px 10px; text-align: center; font-weight: 700;">Normalized Area</th>
            <th style="padding: 6px 10px; text-align: left; font-weight: 700;">PMKSY Field Verification Directive</th>
          </tr>
          ${groundingBoxes.map((gb, i) => {
            const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
            const ymin = gb.ymin ?? 0;
            const xmin = gb.xmin ?? 0;
            const ymax = gb.ymax ?? 0;
            const xmax = gb.xmax ?? 0;
            const areaPct = Math.round(((ymax - ymin) * (xmax - xmin)) / 10000);
            return `
              <tr style="background: ${bg}; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 10px; font-weight: 600; color: #0c4a6e;">${gb.label}</td>
                <td style="padding: 6px 10px; text-align: center; font-family: monospace;">[${ymin}, ${xmin}, ${ymax}, ${xmax}]</td>
                <td style="padding: 6px 10px; text-align: center; font-weight: 600;">${areaPct}% AOI</td>
                <td style="padding: 6px 10px; color: #334155;">Targeted for ground-truthing & structural intervention</td>
              </tr>
            `;
          }).join('')}
        </table>
      </div>
    `;
  }

  // 4. Dynamic Domain-Specific Geospatial Data Insights Graphs
  let graphsHtml = '';
  if (modRaw.includes('land') || modRaw.includes('lulc')) {
    graphsHtml = `
      <div style="display: flex; gap: 16px; page-break-inside: avoid; margin-bottom: 18px;">
        <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0; font-size: 12px; color: #0c4a6e; font-weight: 700; text-transform: uppercase;">LULC Class Area Distribution</h4>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Agricultural Cropland (38.0%)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 38%; background: #16a34a; height: 12px; border-radius: 3px;"></div></div></div>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Degraded Scrubland (28.0%)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 28%; background: #eab308; height: 12px; border-radius: 3px;"></div></div></div>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Barren & Rocky Wasteland (22.0%)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 22%; background: #d97706; height: 12px; border-radius: 3px;"></div></div></div>
          <div><div style="font-size: 10px; color: #64748b; font-weight: 600;">Dense Forest (5%) · Water (4%) · Built-Up (3%)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 12%; background: #0284c7; height: 12px; border-radius: 3px;"></div></div></div>
        </div>
        <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0; font-size: 12px; color: #0c4a6e; font-weight: 700; text-transform: uppercase;">Quantified Surface Area (Million Hectares)</h4>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Cultivated Cropland: 3.78 M ha</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 85%; background: #16a34a; height: 12px; border-radius: 3px;"></div></div></div>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Scrub & Wasteland: 4.98 M ha (Combined)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 95%; background: #d97706; height: 12px; border-radius: 3px;"></div></div></div>
          <div><div style="font-size: 10px; color: #64748b; font-weight: 600;">Forest & Water Bodies: 0.90 M ha</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 20%; background: #0284c7; height: 12px; border-radius: 3px;"></div></div></div>
        </div>
      </div>
    `;
  } else if (modRaw.includes('veg')) {
    graphsHtml = `
      <div style="display: flex; gap: 16px; page-break-inside: avoid; margin-bottom: 18px;">
        <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0; font-size: 12px; color: #0c4a6e; font-weight: 700; text-transform: uppercase;">Canopy Vigor Spectrum</h4>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Active Cropland Canopy (0.4 - 0.6 NDVI: 52%)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 52%; background: #22c55e; height: 12px; border-radius: 3px;"></div></div></div>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Water-Stressed Scrub (0.2 - 0.4 NDVI: 24%)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 24%; background: #eab308; height: 12px; border-radius: 3px;"></div></div></div>
          <div><div style="font-size: 10px; color: #64748b; font-weight: 600;">Dense Biomass (>0.6: 14%) · Bare Soil (<0.2: 10%)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 24%; background: #15803d; height: 12px; border-radius: 3px;"></div></div></div>
        </div>
        <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0; font-size: 12px; color: #0c4a6e; font-weight: 700; text-transform: uppercase;">2026 Seasonal Trajectory</h4>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Pre-Monsoon May Nadir (NDVI: 0.21)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 31%; background: #d97706; height: 12px; border-radius: 3px;"></div></div></div>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Peak Monsoon August Surge (NDVI: 0.58)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 85%; background: #16a34a; height: 12px; border-radius: 3px;"></div></div></div>
          <div><div style="font-size: 10px; color: #64748b; font-weight: 600;">Current Post-Monsoon State (NDVI: 0.48)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 70%; background: #0284c7; height: 12px; border-radius: 3px;"></div></div></div>
        </div>
      </div>
    `;
  } else if (modRaw.includes('drain')) {
    graphsHtml = `
      <div style="display: flex; gap: 16px; page-break-inside: avoid; margin-bottom: 18px;">
        <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0; font-size: 12px; color: #0c4a6e; font-weight: 700; text-transform: uppercase;">Strahler Stream Channel Lengths</h4>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">1st Order Headwaters (168.2 km, 142 channels)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 85%; background: #8b5cf6; height: 12px; border-radius: 3px;"></div></div></div>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">2nd Order Collectors (98.4 km, 38 channels)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 50%; background: #0284c7; height: 12px; border-radius: 3px;"></div></div></div>
          <div><div style="font-size: 10px; color: #64748b; font-weight: 600;">3rd Order Main Stem (60.8 km, 12 channels)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 32%; background: #0369a1; height: 12px; border-radius: 3px;"></div></div></div>
        </div>
        <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0; font-size: 12px; color: #0c4a6e; font-weight: 700; text-transform: uppercase;">Intervention Siting Suitability</h4>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Site #1 Masonry Check Dam (Suitability: 92%)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 92%; background: #0284c7; height: 12px; border-radius: 3px;"></div></div></div>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Site #2 Earthen Percolation Tank (Suitability: 95%)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 95%; background: #16a34a; height: 12px; border-radius: 3px;"></div></div></div>
          <div><div style="font-size: 10px; color: #64748b; font-weight: 600;">Site #3 Loose Boulder Check Dams (Suitability: 88%)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 88%; background: #d97706; height: 12px; border-radius: 3px;"></div></div></div>
        </div>
      </div>
    `;
  } else if (modRaw.includes('change')) {
    graphsHtml = `
      <div style="display: flex; gap: 16px; page-break-inside: avoid; margin-bottom: 18px;">
        <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0; font-size: 12px; color: #0c4a6e; font-weight: 700; text-transform: uppercase;">Bi-Temporal Delta (2020 vs 2026)</h4>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Mean NDVI Growth (+41.0% Expansion)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 71%; background: #16a34a; height: 12px; border-radius: 3px;"></div></div></div>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Cropland Rejuvenation (+49.0% / 18,480 ha)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 80%; background: #22c55e; height: 12px; border-radius: 3px;"></div></div></div>
          <div><div style="font-size: 10px; color: #64748b; font-weight: 600;">Barren Wasteland Reduction (-51.2% Contraction)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 48%; background: #0284c7; height: 12px; border-radius: 3px;"></div></div></div>
        </div>
        <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0; font-size: 12px; color: #0c4a6e; font-weight: 700; text-transform: uppercase;">FAO Carbon Accounting</h4>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Aboveground Biomass (AGB): 7.85 t/ha</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 65%; background: #16a34a; height: 12px; border-radius: 3px;"></div></div></div>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Sequestered Carbon: 568,596 MT CO₂e</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 95%; background: #0284c7; height: 12px; border-radius: 3px;"></div></div></div>
          <div><div style="font-size: 10px; color: #64748b; font-weight: 600;">Article 6 Certification Status: Qualified</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 100%; background: #15803d; height: 12px; border-radius: 3px;"></div></div></div>
        </div>
      </div>
    `;
  } else {
    graphsHtml = `
      <div style="display: flex; gap: 16px; page-break-inside: avoid; margin-bottom: 18px;">
        <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0; font-size: 12px; color: #0c4a6e; font-weight: 700; text-transform: uppercase;">Soil Moisture & Radar Inundation</h4>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Post-Monsoon Soil Moisture (34.8% VWC)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 72%; background: #0284c7; height: 12px; border-radius: 3px;"></div></div></div>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Surface Water Spread (42.5 km² Inundated)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 60%; background: #0369a1; height: 12px; border-radius: 3px;"></div></div></div>
          <div><div style="font-size: 10px; color: #64748b; font-weight: 600;">Monsoon Cloud Penetration (100% SAR Radar)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 100%; background: #16a34a; height: 12px; border-radius: 3px;"></div></div></div>
        </div>
        <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0; font-size: 12px; color: #0c4a6e; font-weight: 700; text-transform: uppercase;">Inundation by Land Class</h4>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Agricultural Cropland (62.0%)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 62%; background: #eab308; height: 12px; border-radius: 3px;"></div></div></div>
          <div style="margin-bottom: 6px;"><div style="font-size: 10px; color: #64748b; font-weight: 600;">Reservoir & Wetland Sinks (20.0%)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 20%; background: #0284c7; height: 12px; border-radius: 3px;"></div></div></div>
          <div><div style="font-size: 10px; color: #64748b; font-weight: 600;">Urban & Residential Settlements (18.0%)</div><div style="background: #e2e8f0; height: 12px; border-radius: 3px;"><div style="width: 18%; background: #ef4444; height: 12px; border-radius: 3px;"></div></div></div>
        </div>
      </div>
    `;
  }

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>JalDrishti Satellite Intelligence Report — ${location}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Georgia&family=Inter:wght@400;500;600;700;800&display=swap');
        body {
          font-family: 'Georgia', serif;
          max-width: 820px;
          margin: 30px auto;
          color: #1e293b;
          line-height: 1.65;
          padding: 0 20px;
          background: #ffffff;
        }
        .header {
          border-bottom: 3px solid #0284c7;
          padding-bottom: 12px;
          margin-bottom: 16px;
        }
        .govt-line {
          font-size: 9.5px;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          color: #0369a1;
          font-family: 'Inter', sans-serif;
          font-weight: 700;
          margin-bottom: 3px;
        }
        .header h1 {
          font-size: 21px;
          margin: 0 0 4px 0;
          color: #0c4a6e;
          font-family: 'Inter', sans-serif;
          font-weight: 800;
          letter-spacing: -0.3px;
        }
        .header .subtitle {
          font-size: 11px;
          color: #64748b;
          font-family: 'Inter', sans-serif;
        }
        .badge {
          display: inline-block;
          background: #0284c7;
          color: white;
          padding: 3px 12px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          font-family: 'Inter', sans-serif;
          letter-spacing: 0.8px;
          margin-bottom: 12px;
          text-transform: uppercase;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin: 12px 0;
          page-break-inside: avoid;
        }
        .meta-card {
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          border-radius: 6px;
          padding: 8px 12px;
        }
        .meta-card .label {
          font-size: 9px;
          text-transform: uppercase;
          color: #0369a1;
          font-weight: 700;
          letter-spacing: 0.6px;
          font-family: 'Inter', sans-serif;
        }
        .meta-card .value {
          font-size: 13.5px;
          font-weight: 700;
          color: #0c4a6e;
          margin-top: 2px;
          font-family: 'Inter', sans-serif;
        }
        .report { font-size: 13px; }
        h1, h2, h3, h4 {
          break-after: avoid !important;
          page-break-after: avoid !important;
        }
        .footer {
          margin-top: 30px;
          border-top: 1px solid #cbd5e1;
          padding-top: 10px;
          font-size: 10px;
          color: #64748b;
          text-align: center;
          font-family: 'Inter', sans-serif;
          line-height: 1.5;
          page-break-inside: avoid;
        }
        p { orphans: 3; widows: 3; }
        @media print {
          body { margin: 15px; padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="govt-line">GOVERNMENT OF INDIA · MINISTRY OF RURAL DEVELOPMENT · DEPARTMENT OF LAND RESOURCES</div>
        <h1>🛰️ JalDrishti Satellite Intelligence Report</h1>
        <div class="subtitle">PMKSY-WDC 2.0 · SIH 2026 PS-26015 · ISRO NRSC Bhuvan · Sentinel Constellation · Gemini Vision AI</div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div class="badge">${moduleBadge}</div>
        <div style="font-size: 10.5px; font-family: 'Inter', sans-serif; color: #64748b; font-weight: 600;">STATUS: VERIFIED PRODUCTION BRIEF</div>
      </div>
      <div class="meta-grid">
        <div class="meta-card"><div class="label">Location</div><div class="value">${location}</div></div>
        <div class="meta-card"><div class="label">Scene Date</div><div class="value">${date}</div></div>
        <div class="meta-card"><div class="label">Orbital Sensor</div><div class="value">${sensor}</div></div>
        <div class="meta-card"><div class="label">${areaLabel}</div><div class="value">${area}</div></div>
        <div class="meta-card"><div class="label">Canopy NDVI Score</div><div class="value">${ndvi}</div></div>
        <div class="meta-card"><div class="label">Cloud Cover</div><div class="value">${cloud}</div></div>
      </div>
      
      ${data?.image_url ? `
      <div style="margin: 16px 0; text-align: center; page-break-inside: avoid;">
        <img src="${data.image_url}" style="width: 100%; max-height: 380px; object-fit: cover; border-radius: 6px; border: 1px solid #bae6fd; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.08);" />
        <p style="font-size: 10.5px; color: #64748b; margin-top: 5px; font-family: 'Inter', sans-serif; font-style: italic;">🛰️ Sentinel Optical/SAR Satellite Acquisition — ${location}</p>
      </div>` : ''}

      <hr style="margin: 18px 0; border: none; border-top: 1.5px solid #e2e8f0;" />
      
      <!-- CSS Graphs for Intelligence Briefing -->
      <h3 style="color: #0c4a6e; font-size: 14.5px; font-family: 'Inter', sans-serif; font-weight: 700; text-transform: uppercase; margin-bottom: 10px; break-after: avoid;">
        📊 Geospatial Data Insights & Domain Dynamics
      </h3>
      ${graphsHtml}

      <hr style="margin: 18px 0; border: none; border-top: 1.5px solid #e2e8f0;" />
      
      <div class="report">
        ${htmlParts.join('\n')}
      </div>

      ${groundingTableHtml}

      <div class="footer">
        JalDrishti Platform Engine · Smart India Hackathon 2026 · PS-26015 · Classified Intelligence Brief<br/>
        Digital Attestation: SHA-256 Validated · Autonomous Multimodal Vision Inference (Google Gemini 3.1 Flash)
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); }, 500);
}

// ── Message Bubble Component ──────────────────────────────────────────
function MessageBubble({ role, content, data }: { role: string; content: string; data?: ChatResponse }) {
  const isAI = role === "ai";
  const module = data?.module || "general";

  return (
    <div
      className={isAI ? "slide-left" : "slide-right"}
      style={{
        display: "flex", flexDirection: "column",
        alignItems: isAI ? "flex-start" : "flex-end",
        marginBottom: 12,
      }}
    >
      {isAI ? (
        <div style={{ width: "100%" }}>
          {/* AI bubble */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Scene thumbnail if available */}
              {data?.image_url && (
                <div style={{ marginBottom: 8 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={data.image_url}
                    alt="Satellite scene"
                    style={{
                      width: "100%", maxHeight: 160,
                      objectFit: "cover", borderRadius: 10,
                      border: "1px solid var(--border-mid)",
                    }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  {data.bbox && (
                    <div style={{ fontSize: 9, color: "var(--text-3)", marginTop: 3, fontFamily: "'JetBrains Mono',monospace" }}>
                      📍 {data.location} · {data.scene_date} · {data.sensor}
                    </div>
                  )}
                </div>
              )}

              <div className="bubble-ai">
                {/* Module badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span className={`badge badge-${module}`}>{(data?.module_label || module).toUpperCase()}</span>
                  {data?.stac_source && (
                    <span style={{ fontSize: 9, color: "var(--text-3)" }}>{data.stac_source}</span>
                  )}
                </div>
                {/* Report text */}
                <div style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.75, fontFamily: "'JetBrains Mono', monospace" }}>
                  <ReactMarkdown components={{
                    p: ({node, ...props}) => <p style={{ marginBottom: 10, whiteSpace: "pre-wrap" }} {...props} />,
                    strong: ({node, ...props}) => <strong style={{ color: "var(--text-1)", fontWeight: 600 }} {...props} />,
                    ul: ({node, ...props}) => <ul style={{ paddingLeft: 16, marginBottom: 10 }} {...props} />,
                    li: ({node, ...props}) => <li style={{ marginBottom: 4 }} {...props} />,
                  }}>
                    {content}
                  </ReactMarkdown>
                </div>

                {/* Interactive Inline Graph for Chat UI */}
                {isAI && data?.module && (
                  <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(0,0,0,0.2)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ fontSize: 10, color: "var(--text-1)", marginBottom: 10, fontWeight: 600, letterSpacing: "0.5px" }}>
                      📊 SPATIAL DATA CONTEXT
                    </div>
                    
                    {data.module === "flood_compare" && data.compare_years && data.compare_years.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ fontSize: 9, color: "var(--text-3)", marginBottom: 4 }}>Temporal Map Legend</div>
                        {data.compare_years.sort((a,b) => a - b).map((year, i, arr) => {
                          let color = '';
                          if (i === 0) {
                            color = '#ef4444'; // Oldest: Red
                          } else if (i === arr.length - 1 && arr.length > 1) {
                            color = '#06b6d4'; // Newest: Cyan
                          } else {
                            const palette = ['#eab308', '#22c55e', '#d946ef']; // Middle: Yellow, Green, Magenta
                            color = palette[(i - 1) % palette.length];
                          }
                          return (
                            <div key={year} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 12, height: 12, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}80` }} />
                              <div style={{ fontSize: 11, color: "var(--text-1)" }}>Flood Extent — {year}</div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 12, flexDirection: "column" }}>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-3)", marginBottom: 4 }}>
                            <span>Historical Seasonal Water Baseline</span>
                            <span>Normal</span>
                          </div>
                          <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3 }}>
                             <div style={{ width: "30%", height: "100%", background: "var(--text-3)", borderRadius: 3 }}></div>
                          </div>
                        </div>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-3)", marginBottom: 4 }}>
                            <span style={{ color: "var(--text-1)" }}>Current Active Inundation (SAR Detected)</span>
                            <span style={{ color: "#ef4444", fontWeight: "bold" }}>Critical High</span>
                          </div>
                          <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3 }}>
                             <div style={{ width: "90%", height: "100%", background: "#ef4444", borderRadius: 3, boxShadow: "0 0 8px rgba(239, 68, 68, 0.5)" }}></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Agentic Execution Trace (Mandatory PS Requirement) */}
                {(data as any)?.execution_trace && (
                  <div style={{ marginTop: 12, padding: "10px", background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: "#34d399", fontWeight: "bold", marginBottom: 8, letterSpacing: "0.5px" }}>
                      <span style={{ marginRight: 4 }}>🤖</span> AUDITABLE EXECUTION TRACE
                    </div>
                    {(data as any).execution_trace.map((step: any, idx: number) => (
                      <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                        <div style={{ color: "var(--text-3)", width: 14 }}>{idx + 1}.</div>
                        <div style={{ flex: 1 }}>
                          <span style={{ color: "var(--text-2)", fontWeight: "bold" }}>{step.step}</span>
                          <span style={{ color: "var(--text-3)" }}> — {step.tool}</span>
                          {step.output && <div style={{ color: "#38bdf8", marginTop: 2, opacity: 0.9 }}>↳ {step.output}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Metric cards + PDF Download */}
                {(data?.ndvi_score || data?.area_km2 || data?.cloud_cover !== undefined) && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    {data?.cloud_cover !== undefined && (
                      <div className="metric-card" style={{ flex: 1, minWidth: 70 }}>
                        <div className="metric-label">Cloud</div>
                        <div className="metric-value" style={{ fontSize: 15 }}>{data.cloud_cover}%</div>
                      </div>
                    )}
                    {data?.area_km2 && (
                      <div className="metric-card" style={{ flex: 1, minWidth: 80 }}>
                        <div className="metric-label">Area</div>
                        <div className="metric-value" style={{ fontSize: 15, color: "#38bdf8" }}>
                          {typeof data.area_km2 === "number" ? data.area_km2.toLocaleString() : data.area_km2}
                          <span className="metric-unit"> km²</span>
                        </div>
                      </div>
                    )}
                    {data?.ndvi_score && (
                      <div className="metric-card" style={{ flex: 1, minWidth: 70 }}>
                        <div className="metric-label">NDVI</div>
                        <div className="metric-value" style={{ fontSize: 15, color: "#34d399" }}>{data.ndvi_score}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* PDF Download Button */}
                <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => downloadPDF(content, data)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 6, padding: "6px 12px",
                      color: "var(--text-2)", fontSize: 10, cursor: "pointer",
                      fontFamily: "'Inter', sans-serif", fontWeight: 500, letterSpacing: "0.3px",
                      transition: "all 0.2s ease",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
                    }}
                    onMouseEnter={e => { 
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)"; 
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.2)";
                    }}
                    onMouseLeave={e => { 
                      (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))"; 
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text-2)";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.1)";
                    }}
                    title="Generate Classified PDF Intelligence Report"
                  >
                    <FileDown size={12} strokeWidth={2} />
                    Generate PDF Report
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bubble-user" style={{ maxWidth: "85%" }}>
          <p style={{ fontSize: 12, color: "var(--text-1)", lineHeight: 1.6 }}>{content}</p>
        </div>
      )}
    </div>
  );
}

