"""Train a RandomForestRegressor on a synthetic Indian car-resale dataset.

Generates a realistic mock dataset, preprocesses categorical features with
one-hot encoding, fits a RandomForestRegressor in a sklearn Pipeline, and
saves the trained pipeline + metadata to drivevalue/model.joblib.
"""
import os
import numpy as np
import pandas as pd
import joblib

from sklearn.ensemble import RandomForestRegressor
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

CURRENT_YEAR = 2026
RNG = np.random.default_rng(42)

BRANDS = {
    "Maruti": (450000, 0.85), "Hyundai": (550000, 0.95), "Honda": (650000, 1.05),
    "Toyota": (800000, 1.20), "Tata": (520000, 0.90), "Mahindra": (700000, 1.00),
    "Ford": (550000, 0.90), "Renault": (480000, 0.80), "Volkswagen": (750000, 1.15),
    "Skoda": (820000, 1.15), "BMW": (3500000, 2.40), "Mercedes": (4200000, 2.60),
    "Audi": (3800000, 2.30), "Kia": (700000, 1.05), "Nissan": (520000, 0.90),
    "Chevrolet": (420000, 0.75), "Jeep": (1200000, 1.40), "MG": (900000, 1.10),
    "Volvo": (2800000, 1.90), "Lexus": (3600000, 2.20),
}
FUELS = ["Petrol", "Diesel", "CNG", "LPG", "Electric"]
TRANS = ["Manual", "Automatic"]
OWNERS = ["First", "Second", "Third", "Fourth", "Test Drive"]

FUEL_F = {"Petrol": 1.00, "Diesel": 1.10, "CNG": 0.90, "LPG": 0.85, "Electric": 1.30}
TRANS_F = {"Manual": 1.00, "Automatic": 1.15}
OWNER_F = {"First": 1.00, "Second": 0.85, "Third": 0.72, "Fourth": 0.60, "Test Drive": 1.05}


def generate_dataset(n: int = 5000) -> pd.DataFrame:
    rows = []
    brand_names = list(BRANDS.keys())
    for _ in range(n):
        brand = RNG.choice(brand_names, p=_brand_probs())
        base, brand_factor = BRANDS[brand]
        year = int(RNG.integers(2005, CURRENT_YEAR + 1))
        age = CURRENT_YEAR - year

        fuel = RNG.choice(FUELS, p=[0.55, 0.30, 0.08, 0.02, 0.05])
        transmission = RNG.choice(TRANS, p=[0.70, 0.30])
        owner = RNG.choice(OWNERS, p=[0.55, 0.28, 0.10, 0.05, 0.02])

        # plausible km by age
        km_driven = max(500, int(RNG.normal(loc=12000 * max(1, age), scale=8000)))
        km_driven = min(km_driven, 350000)

        mileage = float(np.clip(RNG.normal(18, 4), 6, 32))
        engine = int(np.clip(RNG.normal(1300, 350), 600, 4000))

        # ground-truth price
        depreciation = 0.88 ** age
        km_factor = max(0.45, 1.0 - (km_driven / 300000.0))
        mileage_factor = float(np.clip(1.0 + (mileage - 18.0) * 0.012, 0.85, 1.20))
        engine_factor = float(np.clip(1.0 + ((engine - 1200.0) / 1200.0) * 0.18, 0.80, 1.80))

        price = (
            base
            * depreciation
            * km_factor
            * FUEL_F[fuel]
            * TRANS_F[transmission]
            * OWNER_F[owner]
            * mileage_factor
            * engine_factor
        )
        # market noise
        price *= float(RNG.normal(1.0, 0.07))
        price = max(35000.0, price)

        rows.append({
            "brand": brand, "year": year, "fuel": fuel,
            "transmission": transmission, "km_driven": km_driven,
            "owner": owner, "mileage": round(mileage, 1), "engine": engine,
            "age": age, "price": round(price, 2),
        })
    return pd.DataFrame(rows)


def _brand_probs():
    weights = np.array([
        0.20, 0.14, 0.09, 0.07, 0.10, 0.08, 0.04, 0.04, 0.04, 0.03,
        0.02, 0.015, 0.02, 0.05, 0.025, 0.02, 0.01, 0.02, 0.005, 0.005,
    ])
    return weights / weights.sum()


def build_pipeline() -> Pipeline:
    cat_cols = ["brand", "fuel", "transmission", "owner"]
    num_cols = ["year", "age", "km_driven", "mileage", "engine"]

    preprocess = ColumnTransformer(
        transformers=[
            ("cat", OneHotEncoder(handle_unknown="ignore"), cat_cols),
            ("num", StandardScaler(), num_cols),
        ]
    )

    model = RandomForestRegressor(
        n_estimators=220,
        max_depth=20,
        min_samples_split=4,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
    )

    return Pipeline([("preprocess", preprocess), ("model", model)])


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(here, "model.joblib")
    csv_path = os.path.join(here, "car_data.csv")

    print("→ Generating synthetic dataset (5000 rows)…")
    df = generate_dataset(5000)
    df.to_csv(csv_path, index=False)
    print(f"  saved {csv_path}")

    feature_cols = ["brand", "year", "age", "fuel", "transmission",
                    "km_driven", "owner", "mileage", "engine"]
    X = df[feature_cols]
    y = df["price"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    print("→ Training RandomForestRegressor…")
    pipe = build_pipeline()
    pipe.fit(X_train, y_train)

    preds = pipe.predict(X_test)
    mae = mean_absolute_error(y_test, preds)
    r2 = r2_score(y_test, preds)
    rel_mae = float(np.mean(np.abs(preds - y_test) / np.maximum(y_test, 1)))

    print(f"  MAE: ₹{mae:,.0f}")
    print(f"  R²:  {r2:.4f}")
    print(f"  Mean relative error: {rel_mae*100:.2f}%")

    artifact = {
        "pipeline": pipe,
        "feature_cols": feature_cols,
        "metrics": {"mae": float(mae), "r2": float(r2), "rel_mae": rel_mae},
        "trained_at_year": CURRENT_YEAR,
    }
    joblib.dump(artifact, out_path)
    print(f"→ Saved model → {out_path}")


if __name__ == "__main__":
    main()
