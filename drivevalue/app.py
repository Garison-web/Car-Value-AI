import os
import math
import logging
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS

import numpy as np
import pandas as pd
import joblib

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)
log = logging.getLogger("drivevalue")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

CURRENT_YEAR = 2026
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model.joblib")

# ───── Load trained model ─────
MODEL = None
FEATURE_COLS = None
MODEL_METRICS = None
try:
    artifact = joblib.load(MODEL_PATH)
    MODEL = artifact["pipeline"]
    FEATURE_COLS = artifact["feature_cols"]
    MODEL_METRICS = artifact.get("metrics", {})
    log.info("Loaded model: R²=%.3f MAE=₹%.0f",
             MODEL_METRICS.get("r2", 0), MODEL_METRICS.get("mae", 0))
except FileNotFoundError:
    log.warning("model.joblib not found — run `python3 drivevalue/train_model.py`")
except Exception as e:
    log.error("Failed to load model: %s", e)


# ───── Heuristic fallback (used only if model is missing) ─────
BRAND_FACTORS = {
    "maruti": 0.85, "hyundai": 0.95, "honda": 1.05, "toyota": 1.20,
    "tata": 0.90, "mahindra": 1.00, "ford": 0.90, "renault": 0.80,
    "volkswagen": 1.15, "skoda": 1.15, "bmw": 2.40, "mercedes": 2.60,
    "audi": 2.30, "kia": 1.05, "nissan": 0.90, "chevrolet": 0.75,
    "jeep": 1.40, "mg": 1.10, "volvo": 1.90, "lexus": 2.20,
}
FUEL_FACTORS = {"petrol": 1.00, "diesel": 1.10, "cng": 0.90, "lpg": 0.85, "electric": 1.30}
TRANSMISSION_FACTORS = {"manual": 1.00, "automatic": 1.15}
OWNER_FACTORS = {"first": 1.00, "second": 0.85, "third": 0.72,
                 "fourth": 0.60, "test drive": 1.05}


def heuristic_price(payload: dict) -> float:
    brand = str(payload.get("brand", "")).strip().lower()
    year = int(payload.get("year", CURRENT_YEAR))
    fuel = str(payload.get("fuel", "petrol")).strip().lower()
    transmission = str(payload.get("transmission", "manual")).strip().lower()
    km = float(payload.get("km_driven", 0))
    owner = str(payload.get("owner", "first")).strip().lower()
    mileage = float(payload.get("mileage", 18))
    engine = float(payload.get("engine", 1200))

    age = max(0, CURRENT_YEAR - year)
    base = 600000.0
    depreciation = math.pow(0.88, age)
    km_factor = max(0.45, 1.0 - (km / 300000.0))
    mileage_factor = max(0.85, min(1.20, 1.0 + (mileage - 18.0) * 0.012))
    engine_factor = max(0.80, min(1.80, 1.0 + ((engine - 1200.0) / 1200.0) * 0.18))
    price = (base * depreciation * km_factor *
             BRAND_FACTORS.get(brand, 1.0) *
             FUEL_FACTORS.get(fuel, 1.0) *
             TRANSMISSION_FACTORS.get(transmission, 1.0) *
             OWNER_FACTORS.get(owner, 0.85) *
             mileage_factor * engine_factor)
    return max(35000.0, price)


def normalize_payload(data: dict) -> dict:
    """Title-case categoricals to match training labels."""
    return {
        "brand": str(data.get("brand", "")).strip().title(),
        "model": str(data.get("model", "")).strip(),
        "year": int(data.get("year", CURRENT_YEAR)),
        "fuel": str(data.get("fuel", "")).strip().title(),
        "transmission": str(data.get("transmission", "")).strip().title(),
        "km_driven": int(float(data.get("km_driven", 0))),
        "owner": str(data.get("owner", "")).strip().title(),
        "mileage": float(data.get("mileage", 0)),
        "engine": int(float(data.get("engine", 0))),
    }


def model_predict(p: dict) -> tuple[float, float]:
    """Return (mean_price, tree_std). Uses RF tree variance for confidence."""
    age = max(0, CURRENT_YEAR - p["year"])
    row = pd.DataFrame([{
        "brand": p["brand"], "year": p["year"], "age": age,
        "fuel": p["fuel"], "transmission": p["transmission"],
        "km_driven": p["km_driven"], "owner": p["owner"],
        "mileage": p["mileage"], "engine": p["engine"],
    }], columns=FEATURE_COLS)

    mean_price = float(MODEL.predict(row)[0])

    # Tree-level variance → uncertainty signal
    pre = MODEL.named_steps["preprocess"]
    rf = MODEL.named_steps["model"]
    Xt = pre.transform(row)
    if hasattr(Xt, "toarray"):
        Xt = Xt.toarray()
    tree_preds = np.array([t.predict(Xt)[0] for t in rf.estimators_])
    tree_std = float(tree_preds.std())
    return mean_price, tree_std


def confidence_from_std(price: float, std: float) -> int:
    """Lower coefficient of variation → higher confidence (72–96)."""
    if price <= 0:
        return 75
    cv = std / price          # typical RF cv on this data ~0.05–0.20
    score = 100.0 - (cv * 220.0)
    return int(max(72, min(96, round(score))))


def format_inr(amount: int) -> str:
    s = str(int(amount))
    if len(s) <= 3:
        return "₹" + s
    last3 = s[-3:]
    rest = s[:-3]
    parts = []
    while len(rest) > 2:
        parts.insert(0, rest[-2:])
        rest = rest[:-2]
    if rest:
        parts.insert(0, rest)
    return "₹" + ",".join(parts) + "," + last3


def round_price(p: float) -> int:
    return int(round(p / 1000.0) * 1000)


def build_response(payload: dict) -> dict:
    p = normalize_payload(payload)
    age = max(0, CURRENT_YEAR - p["year"])
    used_model = MODEL is not None

    if used_model:
        try:
            mean_price, tree_std = model_predict(p)
            confidence = confidence_from_std(mean_price, tree_std)
        except Exception as e:
            log.warning("Model predict failed (%s) — falling back to heuristic", e)
            mean_price = heuristic_price(payload)
            tree_std = mean_price * 0.10
            confidence = 80
            used_model = False
    else:
        mean_price = heuristic_price(payload)
        tree_std = mean_price * 0.10
        confidence = 80

    mean_price = max(35000.0, mean_price)
    price = round_price(mean_price)
    low = round_price(mean_price * 0.85)
    high = round_price(mean_price * 1.15)

    # ───── Market verdict: compare to an "average" same-brand/year car ─────
    baseline_payload = {
        "brand": p["brand"], "model": p["model"], "year": p["year"],
        "fuel": p["fuel"], "transmission": p["transmission"],
        "km_driven": max(5000, age * 12000),  # typical Indian usage
        "owner": "First",
        "mileage": 18.0,
        "engine": 1200,
    }
    try:
        baseline_price, _ = _safe_predict(baseline_payload)
    except Exception:
        baseline_price = mean_price
    baseline_price = max(35000.0, baseline_price)
    ratio = mean_price / baseline_price if baseline_price > 0 else 1.0
    diff_pct = round((ratio - 1.0) * 100)

    if ratio >= 1.07:
        verdict_key = "great"
        verdict_label = "Great Deal"
        verdict_sub = f"~{abs(diff_pct)}% above similar cars"
        verdict_emoji = "🔥"
    elif ratio >= 0.95:
        verdict_key = "fair"
        verdict_label = "Fair Market"
        verdict_sub = "In line with similar cars"
        verdict_emoji = "👍"
    elif ratio >= 0.85:
        verdict_key = "below"
        verdict_label = "Below Market"
        verdict_sub = f"~{abs(diff_pct)}% below similar cars"
        verdict_emoji = "💡"
    else:
        verdict_key = "low"
        verdict_label = "Underpriced"
        verdict_sub = f"~{abs(diff_pct)}% below similar cars"
        verdict_emoji = "⚠️"

    # Backward-compatible factors block for the existing frontend
    base = 600000.0
    depreciation = math.pow(0.88, age)
    km_factor = max(0.45, 1.0 - (p["km_driven"] / 300000.0))
    factors = {
        "depreciation": round(depreciation, 3),
        "km_factor": round(km_factor, 3),
        "brand_factor": BRAND_FACTORS.get(p["brand"].lower(), 1.0),
        "fuel_factor": FUEL_FACTORS.get(p["fuel"].lower(), 1.0),
        "transmission_factor": TRANSMISSION_FACTORS.get(p["transmission"].lower(), 1.0),
        "owner_factor": OWNER_FACTORS.get(p["owner"].lower(), 0.85),
        "mileage_factor": round(max(0.85, min(1.20, 1.0 + (p["mileage"] - 18.0) * 0.012)), 3),
        "engine_factor": round(max(0.80, min(1.80, 1.0 + ((p["engine"] - 1200.0) / 1200.0) * 0.18)), 3),
    }

    return {
        "price": price,
        "price_formatted": format_inr(price),
        "range_low": low,
        "range_high": high,
        "range_formatted": f"{format_inr(low)} – {format_inr(high)}",
        "confidence": confidence,
        "confidence_label": "High" if confidence >= 88 else "Medium" if confidence >= 80 else "Fair",
        "verdict": {
            "key": verdict_key,
            "label": verdict_label,
            "sub": verdict_sub,
            "emoji": verdict_emoji,
            "diff_pct": diff_pct,
            "baseline_price": round_price(baseline_price),
            "baseline_formatted": format_inr(round_price(baseline_price)),
        },
        "model_used": "RandomForestRegressor" if used_model else "heuristic",
        "model_metrics": MODEL_METRICS if used_model else None,
        "uncertainty_std": int(tree_std),
        "summary": {
            "brand": p["brand"] or "—",
            "model": p["model"] or "—",
            "year": p["year"],
            "fuel": p["fuel"],
            "transmission": p["transmission"],
            "km_driven": p["km_driven"],
            "owner": p["owner"],
            "mileage": p["mileage"],
            "engine": p["engine"],
            "age": age,
        },
        "factors": factors,
    }


# ───── Routes ─────
@app.route("/")
def index():
    return render_template("index.html")


def _predict_view():
    try:
        data = request.get_json(force=True, silent=True) or {}
        required = ["brand", "model", "year", "fuel", "transmission",
                    "km_driven", "owner", "mileage", "engine"]
        missing = [k for k in required if data.get(k) in (None, "")]
        if missing:
            return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400
        return jsonify(build_response(data))
    except (ValueError, TypeError) as e:
        return jsonify({"error": f"Invalid input: {e}"}), 400


@app.route("/api/predict", methods=["POST"])
def api_predict():
    return _predict_view()


@app.route("/predict", methods=["POST"])
def predict():
    return _predict_view()


@app.route("/api/curves", methods=["POST"])
def api_curves():
    """Return price-vs-year and price-vs-km curves for the given car."""
    try:
        data = request.get_json(force=True, silent=True) or {}
        p = normalize_payload(data)

        # Year curve: vary year from current_year-12 .. current_year
        year_points = []
        for y in range(CURRENT_YEAR - 12, CURRENT_YEAR + 1):
            variant = dict(p, year=y)
            mean_price, _ = _safe_predict(variant)
            year_points.append({"year": y, "price": round_price(mean_price)})

        # KM curve: 0 .. 200000 step 20000
        km_points = []
        for km in range(0, 200001, 20000):
            variant = dict(p, km_driven=km)
            mean_price, _ = _safe_predict(variant)
            km_points.append({"km": km, "price": round_price(mean_price)})

        return jsonify({"year_curve": year_points, "km_curve": km_points})
    except (ValueError, TypeError) as e:
        return jsonify({"error": f"Invalid input: {e}"}), 400


def _safe_predict(p: dict) -> tuple[float, float]:
    if MODEL is not None:
        try:
            return model_predict(p)
        except Exception:
            pass
    price = heuristic_price({
        "brand": p["brand"], "year": p["year"], "fuel": p["fuel"],
        "transmission": p["transmission"], "km_driven": p["km_driven"],
        "owner": p["owner"], "mileage": p["mileage"], "engine": p["engine"],
    })
    return price, price * 0.10


@app.route("/healthz")
def healthz():
    return {"ok": True, "model_loaded": MODEL is not None,
            "metrics": MODEL_METRICS}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
