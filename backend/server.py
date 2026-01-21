from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from collections import Counter

import fitz  # PyMuPDF
import math
import json
import tempfile
from typing import Optional, Tuple, Dict, Any, List

PT_TO_CM = 2.54 / 72.0

app = FastAPI(title="PDF Dieline Calculator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------
# Geometry
# -------------------------
def dist(p1, p2) -> float:
    return math.hypot(p2[0] - p1[0], p2[1] - p1[1])

def cubic_point(p0, p1, p2, p3, t: float):
    x = (1-t)**3*p0[0] + 3*(1-t)**2*t*p1[0] + 3*(1-t)*t**2*p2[0] + t**3*p3[0]
    y = (1-t)**3*p0[1] + 3*(1-t)**2*t*p1[1] + 3*(1-t)*t**2*p2[1] + t**3*p3[1]
    return (x, y)

def path_length_points(items: List[tuple], curve_steps: int = 40) -> float:
    """
    Compute stroke path length in PDF points.
    Handles:
      - 'l' line
      - 'c' cubic bezier (approximated)
      - 're' rectangle
    """
    L = 0.0
    for it in items:
        op = it[0]
        if op == "l":
            L += dist(it[1], it[2])
        elif op == "c":
            p0, p1, p2, p3 = it[1], it[2], it[3], it[4]
            prev = p0
            for i in range(1, curve_steps + 1):
                t = i / curve_steps
                cur = cubic_point(p0, p1, p2, p3, t)
                L += dist(prev, cur)
                prev = cur
        elif op == "re":
            rect = it[1]
            w = rect.width
            h = rect.height
            L += 2.0 * (w + h)
    return L

# -------------------------
# Color helpers
# -------------------------
def rgb255_to_rgb01(c: Dict[str, int]) -> Tuple[float, float, float]:
    return (c["r"] / 255.0, c["g"] / 255.0, c["b"] / 255.0)

def color_close(c: Tuple[float, float, float], target: Tuple[float, float, float], tol: float) -> bool:
    return math.sqrt((c[0]-target[0])**2 + (c[1]-target[1])**2 + (c[2]-target[2])**2) <= tol

# -------------------------
# Core calc
# -------------------------
def calc_page(
    pdf_path: str,
    page_index: int,
    crop: Optional[Dict[str, Any]],
    mode: str,  # "combined" or "separate"
    combined_color: Optional[Dict[str, int]],
    cut_color: Optional[Dict[str, int]],
    bend_color: Optional[Dict[str, int]],
    color_tol: float,
    curve_steps: int,
    min_path_cm: float,
) -> Dict[str, Any]:
    doc = fitz.open(pdf_path)
    page = doc[page_index]
    page_rect = page.rect

    # --- Crop handling ---
    # Frontend sends crop in PDF.js PDF-coordinates (origin bottom-left).
    # PyMuPDF uses top-left origin. So we flip Y when crop is enabled.
    crop_rect = None

    use_crop = True
    if isinstance(crop, dict) and "useCrop" in crop:
        use_crop = bool(crop["useCrop"])

    if isinstance(crop, dict) and use_crop:
        # ensure required keys exist
        if all(k in crop for k in ("x0", "y0", "x1", "y1")):
            h = page.rect.height

            x0 = float(crop["x0"])
            y0 = float(crop["y0"])
            x1 = float(crop["x1"])
            y1 = float(crop["y1"])

            # flip Y for PyMuPDF coordinate system
            y0p = h - y0
            y1p = h - y1

            # normalize rectangle
            crop_rect = fitz.Rect(
                min(x0, x1), min(y0p, y1p),
                max(x0, x1), max(y0p, y1p),
            )



    def keep_by_crop(d_rect: Optional[fitz.Rect]) -> bool:
        if not crop_rect:
            return True
        if d_rect is None:
            return True
        return crop_rect.intersects(d_rect)

    results = {
        "combined": {"paths": 0, "length_cm": 0.0},
        "cut": {"paths": 0, "length_cm": 0.0},
        "bend": {"paths": 0, "length_cm": 0.0},
        "page": {
            "width_pt": page_rect.width,
            "height_pt": page_rect.height,
        },
    }

    combined_rgb = rgb255_to_rgb01(combined_color) if combined_color else None
    cut_rgb = rgb255_to_rgb01(cut_color) if cut_color else None
    bend_rgb = rgb255_to_rgb01(bend_color) if bend_color else None

    for d in page.get_drawings():
        items = d.get("items", [])
        if not items:
            continue
        c = d.get("color")
        if not c:
            continue

        d_rect = d.get("rect")
        if not keep_by_crop(d_rect):
            continue

        # Length first (then filter by min_path_cm after cm conversion)
        L_pt = path_length_points(items, curve_steps=curve_steps)
        L_cm = L_pt * PT_TO_CM
        if L_cm < min_path_cm:
            continue

        c01 = (float(c[0]), float(c[1]), float(c[2]))

        if mode == "combined":
            if combined_rgb and color_close(c01, combined_rgb, color_tol):
                results["combined"]["paths"] += 1
                results["combined"]["length_cm"] += L_cm

        elif mode == "separate":
            if cut_rgb and color_close(c01, cut_rgb, color_tol):
                results["cut"]["paths"] += 1
                results["cut"]["length_cm"] += L_cm
            elif bend_rgb and color_close(c01, bend_rgb, color_tol):
                results["bend"]["paths"] += 1
                results["bend"]["length_cm"] += L_cm

    doc.close()

    # Clean up unused keys based on mode (for nicer response)
    if mode == "combined":
        results.pop("cut")
        results.pop("bend")
    else:
        results.pop("combined")

    return results


@app.post("/stroke-colors")
async def stroke_colors(
    file: UploadFile = File(...),
    payload: str = Form(...),
):
    """
    payload JSON (same structure as calculate, but only needs page + crop):
    {
      "page": 1,
      "crop": {"x0":..,"y0":..,"x1":..,"y1":..,"useCrop": true} OR {"useCrop": false}
    }
    """
    data = json.loads(payload)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(await file.read())
        pdf_path = tmp.name

    doc = fitz.open(pdf_path)
    page = doc[max(0, int(data.get("page", 1)) - 1)]

    crop = data.get("crop")
    crop_rect = None

    use_crop = True
    if isinstance(crop, dict) and "useCrop" in crop:
        use_crop = bool(crop["useCrop"])

    if isinstance(crop, dict) and use_crop and all(k in crop for k in ("x0", "y0", "x1", "y1")):
        # PDF.js coords are bottom-left origin; PyMuPDF is top-left => flip Y
        h = page.rect.height
        x0, y0, x1, y1 = map(float, (crop["x0"], crop["y0"], crop["x1"], crop["y1"]))
        y0p, y1p = h - y0, h - y1
        crop_rect = fitz.Rect(min(x0, x1), min(y0p, y1p), max(x0, x1), max(y0p, y1p))

    def keep_by_crop(r: Optional[fitz.Rect]) -> bool:
        if not crop_rect:
            return True
        if r is None:
            return True
        return crop_rect.intersects(r)

    cnt = Counter()

    for d in page.get_drawings():
        items = d.get("items", [])
        if not items:
            continue
        c = d.get("color")
        if not c:
            continue
        if not keep_by_crop(d.get("rect")):
            continue

        # Bucket similar colors together to avoid tiny float differences
        key = (round(float(c[0]), 3), round(float(c[1]), 3), round(float(c[2]), 3))
        cnt[key] += 1

    doc.close()

    colors = []
    for (r, g, b), count in cnt.most_common(20):
        colors.append({
            "r": int(round(r * 255)),
            "g": int(round(g * 255)),
            "b": int(round(b * 255)),
            "count": count
        })

    return {"colors": colors}


# -------------------------
# API
# -------------------------
@app.post("/calculate")
async def calculate(
    file: UploadFile = File(...),
    payload: str = Form(...),  # JSON string
):
    """
    payload JSON:
    {
      "page": 1,
      "crop": {"x0":..,"y0":..,"x1":..,"y1":..},
      "mode": "combined" | "separate",
      "combinedColor": {"r":..,"g":..,"b":..},     # if combined
      "cutColor": {"r":..,"g":..,"b":..},          # if separate
      "bendColor": {"r":..,"g":..,"b":..},         # if separate
      "colorTol": 0.08,
      "curveSteps": 40,
      "minPathCm": 0.0
    }
    """
    data = json.loads(payload)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(await file.read())
        pdf_path = tmp.name

    page_1based = int(data.get("page", 1))
    page_index = max(0, page_1based - 1)

    mode = data.get("mode", "combined")
    if mode not in ("combined", "separate"):
        return {"error": "mode must be combined or separate"}

    res = calc_page(
        pdf_path=pdf_path,
        page_index=page_index,
        crop=data.get("crop"),
        mode=mode,
        combined_color=data.get("combinedColor"),
        cut_color=data.get("cutColor"),
        bend_color=data.get("bendColor"),
        color_tol=float(data.get("colorTol", 0.08)),
        curve_steps=int(data.get("curveSteps", 40)),
        min_path_cm=float(data.get("minPathCm", 0.0)),
    )

    return res

@app.get("/health")
def health():
    return {"ok": True}
