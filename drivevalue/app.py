import os
import math
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)

CURRENT_YEAR = 2026

BRAND_FACTORS = {
    "maruti": 0.85, "hyundai": 0.95, "honda": 1.05, "toyota": 1.20,
    "tata": 0.90, "mahindra": 1.00, "ford": 0.90, "renault": 0.80,
    "volkswagen": 1.15, "skoda": 1.15, "bmw": 2.40, "mercedes": 2.60,
    "audi": 2.30, "kia": 1.05, "nissan": 0.90, "chevrolet": 0.75,
    "jeep": 1.40, "mg": 1.10, "volvo": 1.90, "lexus": 2.20,
}

FUEL_FACTORS = {
    "petrol": 1.00, "diesel": 1.10, "cng": 0.90, "lpg": 0.85, "electric": 1.30,
}

TRANSMISSION_FACTORS = {"manual": 1.00, "automatic": 1.15}

OWNER_FACTORS = {
    "first": 1.00, "second": 0.85, "third": 0.72, "fourth": 0.60, "test drive": 1.05,
}


def predict_price(payload: dict) -> dict:
    brand = str(payload.get("brand", "")).strip().lower()
    model = str(payload.get("model", "")).strip()
    year = int(payload.get("year", CURRENT_YEAR))
    fuel = str(payload.get("fuel", "petrol")).strip().lower()
    transmission = str(payload.get("transmission", "manual")).strip().lower()
    km_driven = float(payload.get("km_driven", 0))
    owner = str(payload.get("owner", "first")).strip().lower()
    mileage = float(payload.get("mileage", 18))
    engine = float(payload.get("engine", 1200))

    base = 600000.0

    age = max(0, CURRENT_YEAR - year)
    depreciation = math.pow(0.88, age)

    km_factor = max(0.45, 1.0 - (km_driven / 300000.0))

    brand_factor = BRAND_FACTORS.get(brand, 1.0)
    fuel_factor = FUEL_FACTORS.get(fuel, 1.0)
    trans_factor = TRANSMISSION_FACTORS.get(transmission, 1.0)
    owner_factor = OWNER_FACTORS.get(owner, 0.85)

    mileage_factor = 1.0 + ((mileage - 18.0) * 0.012)
    mileage_factor = max(0.85, min(1.20, mileage_factor))

    engine_factor = 1.0 + ((engine - 1200.0) / 1200.0) * 0.18
    engine_factor = max(0.80, min(1.80, engine_factor))

    price = (base * depreciation * km_factor * brand_factor *
             fuel_factor * trans_factor * owner_factor *
             mileage_factor * engine_factor)

    price = max(35000.0, price)
    price = round(price / 1000.0) * 1000

    low = int(price * 0.92)
    high = int(price * 1.10)

    return {
        "price": int(price),
        "price_formatted": format_inr(int(price)),
        "range_low": low,
        "range_high": high,
        "range_formatted": f"{format_inr(low)} – {format_inr(high)}",
        "summary": {
            "brand": brand.title() if brand else "—",
            "model": model or "—",
            "year": year,
            "fuel": fuel.title(),
            "transmission": transmission.title(),
            "km_driven": int(km_driven),
            "owner": owner.title(),
            "mileage": mileage,
            "engine": int(engine),
            "age": age,
        },
        "factors": {
            "depreciation": round(depreciation, 3),
            "km_factor": round(km_factor, 3),
            "brand_factor": brand_factor,
            "fuel_factor": fuel_factor,
            "transmission_factor": trans_factor,
            "owner_factor": owner_factor,
            "mileage_factor": round(mileage_factor, 3),
            "engine_factor": round(engine_factor, 3),
        },
    }


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


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/predict", methods=["POST"])
def api_predict():
    try:
        data = request.get_json(force=True, silent=True) or {}
        required = ["brand", "model", "year", "fuel", "transmission",
                    "km_driven", "owner", "mileage", "engine"]
        missing = [k for k in required if data.get(k) in (None, "")]
        if missing:
            return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400
        result = predict_price(data)
        return jsonify(result)
    except (ValueError, TypeError) as e:
        return jsonify({"error": f"Invalid input: {e}"}), 400


@app.route("/healthz")
def healthz():
    return {"ok": True}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
