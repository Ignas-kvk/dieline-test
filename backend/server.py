from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from collections import Counter

import fitz  # PyMuPDF
import math
import json
import tempfile
from typing import Optional, Tuple, Dict, Any, List

PT_TO_CM = 2.54 / 72.0
CROP_PAD_PT = 3.0
ITEM_HIT_PAD_PT = 2.0

app = FastAPI(title="PDF Dieline Calculator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
    x = (1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0] + 3 * (1 - t) * t ** 2 * p2[0] + t ** 3 * p3[0]
    y = (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1] + 3 * (1 - t) * t ** 2 * p2[1] + t ** 3 * p3[1]
    return (x, y)

def path_length_points(items: List[tuple], curve_steps: int = 40) -> float:
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
            L += 2.0 * (rect.width + rect.height)

    return L

# -------------------------
# Color helpers
# -------------------------
def rgb255_to_rgb01(c: Dict[str, int]) -> Tuple[float, float, float]:
    return (c["r"] / 255.0, c["g"] / 255.0, c["b"] / 255.0)

def color_close(c: Tuple[float, float, float], target: Tuple[float, float, float], tol: float) -> bool:
    return math.sqrt((c[0] - target[0]) ** 2 + (c[1] - target[1]) ** 2 + (c[2] - target[2]) ** 2) <= tol

# -------------------------
# SVG conversion
# -------------------------
def fmt_cm(v_pt: float, offset_pt: float) -> str:
    return f"{(v_pt - offset_pt) * PT_TO_CM:.3f}"

def items_to_svg_paths_cm(items: List[tuple], min_x: float, min_y: float) -> List[str]:
    out = []
    for it in items:
        op = it[0]

        if op == "l":
            p1, p2 = it[1], it[2]
            d = (
                f"M {fmt_cm(p1[0], min_x)} {fmt_cm(p1[1], min_y)} "
                f"L {fmt_cm(p2[0], min_x)} {fmt_cm(p2[1], min_y)}"
            )
            out.append(d)

        elif op == "c":
            p0, p1, p2, p3 = it[1], it[2], it[3], it[4]
            d = (
                f"M {fmt_cm(p0[0], min_x)} {fmt_cm(p0[1], min_y)} "
                f"C {fmt_cm(p1[0], min_x)} {fmt_cm(p1[1], min_y)} "
                f"{fmt_cm(p2[0], min_x)} {fmt_cm(p2[1], min_y)} "
                f"{fmt_cm(p3[0], min_x)} {fmt_cm(p3[1], min_y)}"
            )
            out.append(d)

        elif op == "re":
            r = it[1]
            x0, y0, x1, y1 = r.x0, r.y0, r.x1, r.y1
            d = (
                f"M {fmt_cm(x0, min_x)} {fmt_cm(y0, min_y)} "
                f"L {fmt_cm(x1, min_x)} {fmt_cm(y0, min_y)} "
                f"L {fmt_cm(x1, min_x)} {fmt_cm(y1, min_y)} "
                f"L {fmt_cm(x0, min_x)} {fmt_cm(y1, min_y)} Z"
            )
            out.append(d)

    return out

# -------------------------
# Crop helpers
# -------------------------
def make_crop_rect(page: fitz.Page, crop: Optional[Dict[str, Any]]) -> Optional[fitz.Rect]:
    if not isinstance(crop, dict):
        return None

    use_crop = bool(crop.get("useCrop", True))
    if not use_crop:
        return None

    if not all(k in crop for k in ("x0", "y0", "x1", "y1")):
        return None

    x0 = float(crop["x0"])
    y0 = float(crop["y0"])
    x1 = float(crop["x1"])
    y1 = float(crop["y1"])

    return fitz.Rect(
        min(x0, x1) - CROP_PAD_PT,
        min(y0, y1) - CROP_PAD_PT,
        max(x0, x1) + CROP_PAD_PT,
        max(y0, y1) + CROP_PAD_PT,
    )

def item_points(it: tuple) -> List[Tuple[float, float]]:
    op = it[0]
    if op == "l":
        return [it[1], it[2]]
    if op == "c":
        return [it[1], it[2], it[3], it[4]]
    if op == "re":
        r = it[1]
        return [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)]
    return []

def item_rect(it: tuple) -> Optional[fitz.Rect]:
    pts = item_points(it)
    if not pts:
        return None

    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]

    r = fitz.Rect(min(xs), min(ys), max(xs), max(ys))

    if r.width < ITEM_HIT_PAD_PT * 2:
        cx = (r.x0 + r.x1) / 2.0
        r.x0 = cx - ITEM_HIT_PAD_PT
        r.x1 = cx + ITEM_HIT_PAD_PT

    if r.height < ITEM_HIT_PAD_PT * 2:
        cy = (r.y0 + r.y1) / 2.0
        r.y0 = cy - ITEM_HIT_PAD_PT
        r.y1 = cy + ITEM_HIT_PAD_PT

    return r

def point_in_rect(p: Tuple[float, float], r: fitz.Rect) -> bool:
    return (r.x0 <= p[0] <= r.x1) and (r.y0 <= p[1] <= r.y1)

def item_intersects_crop(it: tuple, crop_rect: Optional[fitz.Rect]) -> bool:
    if crop_rect is None:
        return True

    r = item_rect(it)
    if r is None:
        return False

    if crop_rect.intersects(r):
        return True

    for p in item_points(it):
        if point_in_rect(p, crop_rect):
            return True

    return False

def filter_items_by_crop(items: List[tuple], crop_rect: Optional[fitz.Rect]) -> List[tuple]:
    if crop_rect is None:
        return items
    return [it for it in items if item_intersects_crop(it, crop_rect)]

# -------------------------
# Core calculation
# -------------------------
def calc_page(
    pdf_path: str,
    page_index: int,
    crop: Optional[Dict[str, Any]],
    mode: str,
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
    crop_rect = make_crop_rect(page, crop)

    results = {
        "combined": {"paths": 0, "length_cm": 0.0},
        "cut": {"paths": 0, "length_cm": 0.0},
        "bend": {"paths": 0, "length_cm": 0.0},
        "page": {
            "width_pt": page_rect.width,
            "height_pt": page_rect.height,
        },
        "debug": {
            "crop_rect": None,
            "matched_drawings": 0,
            "matched_items": 0,
        },
    }

    if crop_rect:
        results["debug"]["crop_rect"] = {
            "x0": crop_rect.x0,
            "y0": crop_rect.y0,
            "x1": crop_rect.x1,
            "y1": crop_rect.y1,
        }

    combined_rgb = rgb255_to_rgb01(combined_color) if combined_color else None
    cut_rgb = rgb255_to_rgb01(cut_color) if cut_color else None
    bend_rgb = rgb255_to_rgb01(bend_color) if bend_color else None

    min_x = float("inf")
    min_y = float("inf")
    max_x = float("-inf")
    max_y = float("-inf")

    matched_items_combined: List[List[tuple]] = []
    matched_items_cut: List[List[tuple]] = []
    matched_items_bend: List[List[tuple]] = []

    for d in page.get_drawings():
        raw_items = d.get("items", [])
        if not raw_items:
            continue

        c = d.get("color")
        if not c:
            continue

        items = filter_items_by_crop(raw_items, crop_rect)
        if not items:
            continue

        L_pt = path_length_points(items, curve_steps)
        L_cm = L_pt * PT_TO_CM
        if L_cm < min_path_cm:
            continue

        c01 = (float(c[0]), float(c[1]), float(c[2]))
        match_kind = None

        if mode == "combined":
            if combined_rgb and color_close(c01, combined_rgb, color_tol):
                results["combined"]["paths"] += len(items)
                results["combined"]["length_cm"] += L_cm
                match_kind = "combined"

        elif mode == "separate":
            if cut_rgb and color_close(c01, cut_rgb, color_tol):
                results["cut"]["paths"] += len(items)
                results["cut"]["length_cm"] += L_cm
                match_kind = "cut"
            elif bend_rgb and color_close(c01, bend_rgb, color_tol):
                results["bend"]["paths"] += len(items)
                results["bend"]["length_cm"] += L_cm
                match_kind = "bend"

        if not match_kind:
            continue

        results["debug"]["matched_drawings"] += 1
        results["debug"]["matched_items"] += len(items)

        if match_kind == "combined":
            matched_items_combined.append(items)
        elif match_kind == "cut":
            matched_items_cut.append(items)
        elif match_kind == "bend":
            matched_items_bend.append(items)

        for it in items:
            for p in item_points(it):
                min_x = min(min_x, p[0])
                min_y = min(min_y, p[1])
                max_x = max(max_x, p[0])
                max_y = max(max_y, p[1])

    doc.close()

    if min_x != float("inf"):
        results["bbox"] = {
            "width_cm": (max_x - min_x) * PT_TO_CM,
            "height_cm": (max_y - min_y) * PT_TO_CM,
        }

        paths_svg = {}

        if mode == "combined":
            combined_paths: List[str] = []
            for items in matched_items_combined:
                combined_paths.extend(items_to_svg_paths_cm(items, min_x, min_y))
            paths_svg["combined"] = combined_paths
        else:
            cut_paths: List[str] = []
            bend_paths: List[str] = []
            for items in matched_items_cut:
                cut_paths.extend(items_to_svg_paths_cm(items, min_x, min_y))
            for items in matched_items_bend:
                bend_paths.extend(items_to_svg_paths_cm(items, min_x, min_y))
            paths_svg["cut"] = cut_paths
            paths_svg["bend"] = bend_paths

        results["paths_svg"] = paths_svg

    if mode == "combined":
        results.pop("cut")
        results.pop("bend")
    else:
        results.pop("combined")

    return results

# -------------------------
# Stroke colors endpoint
# -------------------------
@app.post("/stroke-colors")
async def stroke_colors(
    file: UploadFile = File(...),
    payload: str = Form(...),
):
    data = json.loads(payload)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(await file.read())
        pdf_path = tmp.name

    doc = fitz.open(pdf_path)
    page = doc[max(0, int(data.get("page", 1)) - 1)]

    crop_rect = make_crop_rect(page, data.get("crop"))

    cnt = Counter()

    for d in page.get_drawings():
        raw_items = d.get("items", [])
        if not raw_items:
            continue

        c = d.get("color")
        if not c:
            continue

        items = filter_items_by_crop(raw_items, crop_rect)
        if not items:
            continue

        key = (
            round(float(c[0]), 3),
            round(float(c[1]), 3),
            round(float(c[2]), 3),
        )
        cnt[key] += len(items)

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
# Calculate endpoint
# -------------------------
@app.post("/calculate")
async def calculate(
    file: UploadFile = File(...),
    payload: str = Form(...),
):
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