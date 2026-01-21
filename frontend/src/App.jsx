import React, { useEffect, useMemo, useRef, useState } from "react";
import pdfjsLib from "./pdfWorker.js";
import { calculateDieline, detectStrokeColors } from "./api.js";


function rgbToHex({ r, g, b }) {
  const h = (n) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function swatchStyle(c) {
  return {
    display: "inline-block",
    width: 18,
    height: 18,
    borderRadius: 6,
    background: `rgb(${c.r},${c.g},${c.b})`,
    border: "1px solid #2a2a2f",
    marginRight: 8,
    verticalAlign: "middle"
  };
}

export default function App() {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);

  const [file, setFile] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageViewport, setPageViewport] = useState(null);

  const [mode, setMode] = useState("combined"); // combined | separate
  const [colorTol, setColorTol] = useState(0.08);
  const [minPathCm, setMinPathCm] = useState(0.0);
  const [curveSteps, setCurveSteps] = useState(40);

  // crop in SCREEN coords (px) for drawing
  const [useCrop, setUseCrop] = useState(true);
  const [cropScreen, setCropScreen] = useState(null); // {x0,y0,x1,y1}
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef(null);

  // picked colors (from canvas pixel)
  const [combinedColor, setCombinedColor] = useState(null);
  const [cutColor, setCutColor] = useState(null);
  const [bendColor, setBendColor] = useState(null);
  const [activePicker, setActivePicker] = useState("combined"); // combined|cut|bend

  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");

    const [vectorColors, setVectorColors] = useState([]);
    const [detectBusy, setDetectBusy] = useState(false);

  // Load PDF
  useEffect(() => {
    async function load() {
      setResult(null);
      setInfo("");
      setCropScreen(null);
      setCombinedColor(null);
      setCutColor(null);
      setBendColor(null);
      setVectorColors([]);

      if (!file) {
        setPdfDoc(null);
        return;
      }
      const bytes = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
      setPdfDoc(doc);
    }
    load();
  }, [file]);

  // Render page 1
  useEffect(() => {
    async function render() {
      if (!pdfDoc || !canvasRef.current) return;
      const page = await pdfDoc.getPage(1);

      const desiredWidth = 900; // display width in px
      const viewport0 = page.getViewport({ scale: 1.0 });
      const scale = desiredWidth / viewport0.width;
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      setPageViewport({ page, viewport, scale });
      setInfo("Tip: drag to create crop box. Then click a line to pick color.");
    }
    render();
  }, [pdfDoc]);

  const cropPdf = useMemo(() => {
    // Convert cropScreen -> PDF coords (points) using PDF.js viewport helpers
    if (!cropScreen || !pageViewport) return null;

    const { viewport } = pageViewport;

    // screen coords relative to canvas top-left
    const x0 = Math.min(cropScreen.x0, cropScreen.x1);
    const y0 = Math.min(cropScreen.y0, cropScreen.y1);
    const x1 = Math.max(cropScreen.x0, cropScreen.x1);
    const y1 = Math.max(cropScreen.y0, cropScreen.y1);

    // PDF.js can convert viewport -> PDF coords via convertToPdfPoint
    const p0 = viewport.convertToPdfPoint(x0, y0);
    const p1 = viewport.convertToPdfPoint(x1, y1);

    // convertToPdfPoint gives [x, y] in PDF coord space
    return {
      x0: Math.min(p0[0], p1[0]),
      y0: Math.min(p0[1], p1[1]),
      x1: Math.max(p0[0], p1[0]),
      y1: Math.max(p0[1], p1[1])
    };
  }, [cropScreen, pageViewport]);

  function onMouseDown(e) {
    if (!overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    dragStart.current = { x, y };
    setCropScreen({ x0: x, y0: y, x1: x, y1: y });
    setIsDragging(true);
  }

  function onMouseMove(e) {
    if (!isDragging || !dragStart.current || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, rect.width);
    const y = clamp(e.clientY - rect.top, 0, rect.height);
    setCropScreen((prev) => prev ? ({ ...prev, x1: x, y1: y }) : prev);
  }

  function onMouseUp() {
    setIsDragging(false);
    dragStart.current = null;
  }

  function pickColor(e) {
    // Click picks a pixel color from the rendered canvas
    if (!canvasRef.current || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = Math.floor(e.clientX - rect.left);
    const y = Math.floor(e.clientY - rect.top);

    const ctx = canvasRef.current.getContext("2d", { willReadFrequently: true });
    const pixel = ctx.getImageData(x, y, 1, 1).data; // [r,g,b,a]
    const c = { r: pixel[0], g: pixel[1], b: pixel[2] };

    if (mode === "combined") {
      setCombinedColor(c);
      setActivePicker("combined");
    } else {
      if (activePicker === "cut") setCutColor(c);
      if (activePicker === "bend") setBendColor(c);
    }
  }
async function onDetectColors() {
  if (!file) return;

  // For detection: if useCrop is ON, require cropPdf; otherwise scan whole page
  if (useCrop && !cropPdf) {
    setInfo("Draw a crop box first (or turn off crop) before detecting vector colors.");
    return;
  }

  const payload = {
    page: 1,
    crop: useCrop ? { ...cropPdf, useCrop: true } : { useCrop: false }
  };

  try {
    setDetectBusy(true);
    setInfo("Detecting vector stroke colors…");
    const res = await detectStrokeColors({ file, payload });
    setVectorColors(res.colors || []);
    setInfo("Colors detected. Click a swatch to set the line color.");
  } catch (err) {
    setInfo(`Error detecting colors: ${String(err.message || err)}`);
  } finally {
    setDetectBusy(false);
  }
}

  async function onCalculate() {
    if (!file) return;

if (useCrop && !cropPdf) {
  setInfo("Please draw a crop box around the dieline first (or turn off crop).");
  return;
}


    if (mode === "combined" && !combinedColor) {
      setInfo("Click a dieline stroke to pick the combined color.");
      return;
    }
    if (mode === "separate" && (!cutColor || !bendColor)) {
      setInfo("Pick BOTH colors: Cut and Bend (use the picker selector).");
      return;
    }

    const payload = {
      page: 1,
      crop: useCrop ? { ...cropPdf, useCrop: true } : { useCrop: false },
      mode,
      combinedColor: mode === "combined" ? combinedColor : null,
      cutColor: mode === "separate" ? cutColor : null,
      bendColor: mode === "separate" ? bendColor : null,
      colorTol: Number(colorTol),
      minPathCm: Number(minPathCm),
      curveSteps: Number(curveSteps)
    };

    try {
      setBusy(true);
      setInfo("Calculating…");
      const res = await calculateDieline({ file, payload });
      setResult(res);
      setInfo("Done.");
    } catch (err) {
      setInfo(`Error: ${String(err.message || err)}`);
    } finally {
      setBusy(false);
    }
  }

  const cropStyle = useMemo(() => {
    if (!cropScreen) return null;
    const x = Math.min(cropScreen.x0, cropScreen.x1);
    const y = Math.min(cropScreen.y0, cropScreen.y1);
    const w = Math.abs(cropScreen.x1 - cropScreen.x0);
    const h = Math.abs(cropScreen.y1 - cropScreen.y0);
    if (w < 3 || h < 3) return null;
    return { left: x, top: y, width: w, height: h };
  }, [cropScreen]);

  return (
    <div className="container">
      <h1>Dieline Calculator (PDF)</h1>
      <div className="row">
        <div className="card">
          <label>Upload PDF</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <hr />

          <label>Mode</label>
          <select value={mode} onChange={(e) => {
            const m = e.target.value;
            setMode(m);
            setResult(null);
            setInfo("");
            // keep existing crop, but reset pickers appropriately
            if (m === "combined") {
              setCutColor(null);
              setBendColor(null);
              setActivePicker("combined");
            } else {
              setCombinedColor(null);
              setActivePicker("cut");
            }
          }}>
            <option value="combined">1 color picker (cuts+bends combined)</option>
            <option value="separate">2 color pickers (cuts vs bends)</option>
          </select>

          <hr />
<hr />
<label>
  <input
    type="checkbox"
    checked={useCrop}
    onChange={(e) => setUseCrop(e.target.checked)}
    style={{ width: "auto", marginRight: 8 }}
  />
  Use crop (when off: scan whole page)
</label>
<div className="small" style={{ marginTop: 6 }}>
  If enabled, drag a crop box around the dieline. If disabled, no crop is required.
</div>
<hr />

<button disabled={!file || detectBusy} onClick={onDetectColors}>
  {detectBusy ? "Detecting…" : "Detect vector colors"}
</button>

<div className="small" style={{ marginTop: 10 }}>
  {vectorColors.length === 0
    ? "No vector colors detected yet. Click “Detect vector colors”."
    : "Click a color below to set it:"}
</div>

{vectorColors.length > 0 && (
  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
    {vectorColors.map((c, idx) => (
      <button
        key={idx}
        type="button"
        style={{
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 10,
          borderRadius: 10,
          border: "1px solid #2a2a2f",
          background: "#0f0f12",
          color: "#f2f2f2",
          cursor: "pointer"
        }}
        onClick={() => {
          if (mode === "combined") {
            setCombinedColor({ r: c.r, g: c.g, b: c.b });
            setActivePicker("combined");
          } else {
            if (activePicker === "cut") setCutColor({ r: c.r, g: c.g, b: c.b });
            if (activePicker === "bend") setBendColor({ r: c.r, g: c.g, b: c.b });
          }
          setInfo(`Selected vector color RGB(${c.r},${c.g},${c.b})`);
        }}
      >
        <span style={swatchStyle(c)} />
        <span className="small">
          <b>{rgbToHex(c)}</b> — RGB({c.r},{c.g},{c.b}) — strokes: {c.count}
        </span>
      </button>
    ))}
  </div>
)}

          {mode === "combined" ? (
            <>
              <label>Picked dieline color</label>
              <div className="small">
                {combinedColor ? (
                  <>
                    <span className="badge">{rgbToHex(combinedColor)}</span>
                    RGB({combinedColor.r},{combinedColor.g},{combinedColor.b})
                  </>
                ) : "Not picked yet (click a dieline line on the preview)"}
              </div>
            </>
          ) : (
            <>
              <label>Active picker</label>
              <select value={activePicker} onChange={(e) => setActivePicker(e.target.value)}>
                <option value="cut">Pick CUT color</option>
                <option value="bend">Pick BEND color</option>
              </select>

              <div style={{ marginTop: 10 }} className="small">
                <div>
                  <span className="badge">CUT</span>{" "}
                  {cutColor ? `${rgbToHex(cutColor)}  RGB(${cutColor.r},${cutColor.g},${cutColor.b})` : "not picked"}
                </div>
                <div style={{ marginTop: 6 }}>
                  <span className="badge">BEND</span>{" "}
                  {bendColor ? `${rgbToHex(bendColor)}  RGB(${bendColor.r},${bendColor.g},${bendColor.b})` : "not picked"}
                </div>
              </div>
            </>
          )}

          <hr />

          <label>Color tolerance (0.03–0.15 typical)</label>
          <input
            type="number"
            step="0.01"
            value={colorTol}
            onChange={(e) => setColorTol(e.target.value)}
          />

          <label style={{ marginTop: 10 }}>Min single-path length (cm) to ignore tiny strokes</label>
          <input
            type="number"
            step="0.1"
            value={minPathCm}
            onChange={(e) => setMinPathCm(e.target.value)}
          />

          <label style={{ marginTop: 10 }}>Curve steps (accuracy vs speed)</label>
          <input
            type="number"
            step="1"
            value={curveSteps}
            onChange={(e) => setCurveSteps(e.target.value)}
          />

          <hr />
          <button disabled={!file || busy} onClick={onCalculate}>
            {busy ? "Calculating…" : "Calculate"}
          </button>

          <div className="small" style={{ marginTop: 10 }}>
            {info}
          </div>

          {result && (
            <>
              <hr />
              <div className="small">
                <div><b>Results</b></div>
                {mode === "combined" ? (
                  <div style={{ marginTop: 8 }}>
                    Paths: <b>{result.combined.paths}</b><br />
                    Length: <b>{result.combined.length_cm.toFixed(2)} cm</b>
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    CUT — Paths: <b>{result.cut.paths}</b>, Length: <b>{result.cut.length_cm.toFixed(2)} cm</b><br />
                    BEND — Paths: <b>{result.bend.paths}</b>, Length: <b>{result.bend.length_cm.toFixed(2)} cm</b><br />
                    <div style={{ marginTop: 6 }}>
                      TOTAL — Length: <b>{(result.cut.length_cm + result.bend.length_cm).toFixed(2)} cm</b>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="card">
          <div className="small" style={{ marginBottom: 10 }}>
            1) Drag to crop the dieline area. 2) Click a line to pick color(s). 3) Calculate.
          </div>

          <div className="canvasWrap">
            <canvas ref={canvasRef} />
<div
  className="overlay"
  ref={overlayRef}
  onMouseDown={useCrop ? onMouseDown : undefined}
  onMouseMove={useCrop ? onMouseMove : undefined}
  onMouseUp={useCrop ? onMouseUp : undefined}
  onDoubleClick={pickColor}
  title="Drag to crop. Double-click on a dieline stroke to pick the color."
/>

            {useCrop && cropStyle && <div className="cropBox" style={cropStyle} />}
          </div>

          <div className="small" style={{ marginTop: 10 }}>
            <b>Controls:</b><br />
            - Drag mouse to create crop box<br />
            - <b>Double-click</b> on a dieline stroke to pick color (avoids accidental pick while cropping)
          </div>
        </div>
      </div>
    </div>
  );
}
