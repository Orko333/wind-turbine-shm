"""Seed demo user and turbines for development testing."""

import sys
import os

sys.path.insert(0, "/app")

from src.database.config import SessionLocal, init_db
from src.database.models import User, Turbine
from src.auth.security import hash_password
from datetime import datetime, timezone

DEMO_USER = {
    "username": "engineer",
    "email": "engineer@example.com",
    "password": "Password123!",
}

DEMO_TURBINES = [
    {"turbine_id": "WT-001", "name": "Wind Turbine 001", "location": "North Field",   "manufacturer": "Vestas",    "model": "V150-4.5",  "rated_power_kw": 4500, "alert_level": "GREEN"},
    {"turbine_id": "WT-002", "name": "Wind Turbine 002", "location": "North Field",   "manufacturer": "Vestas",    "model": "V150-4.5",  "rated_power_kw": 4500, "alert_level": "GREEN"},
    {"turbine_id": "WT-003", "name": "Wind Turbine 003", "location": "South Ridge",   "manufacturer": "Siemens",   "model": "SG 5.0-145","rated_power_kw": 5000, "alert_level": "YELLOW"},
    {"turbine_id": "WT-004", "name": "Wind Turbine 004", "location": "South Ridge",   "manufacturer": "Siemens",   "model": "SG 5.0-145","rated_power_kw": 5000, "alert_level": "GREEN"},
    {"turbine_id": "WT-005", "name": "Wind Turbine 005", "location": "East Hill",     "manufacturer": "GE",        "model": "Haliade-X", "rated_power_kw": 6000, "alert_level": "ORANGE"},
    {"turbine_id": "WT-006", "name": "Wind Turbine 006", "location": "East Hill",     "manufacturer": "GE",        "model": "Haliade-X", "rated_power_kw": 6000, "alert_level": "GREEN"},
    {"turbine_id": "WT-007", "name": "Wind Turbine 007", "location": "West Coast",    "manufacturer": "Nordex",    "model": "N163/5.X",  "rated_power_kw": 5700, "alert_level": "RED"},
    {"turbine_id": "WT-008", "name": "Wind Turbine 008", "location": "West Coast",    "manufacturer": "Nordex",    "model": "N163/5.X",  "rated_power_kw": 5700, "alert_level": "GREEN"},
]

def seed():
    init_db()
    db = SessionLocal()
    try:
        # Створити demo user if not exists
        user = db.query(User).filter(User.email == DEMO_USER["email"]).first()
        if not user:
            user = User(
                username=DEMO_USER["username"],
                email=DEMO_USER["email"],
                hashed_password=hash_password(DEMO_USER["password"]),
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"Created user: {user.email}")
        else:
            print(f"User already exists: {user.email}")

        # Створити turbines
        for td in DEMO_TURBINES:
            existing = db.query(Turbine).filter(Turbine.turbine_id == td["turbine_id"]).first()
            if not existing:
                turbine = Turbine(
                    turbine_id=td["turbine_id"],
                    owner_id=user.id,
                    name=td["name"],
                    location=td["location"],
                    manufacturer=td["manufacturer"],
                    model=td["model"],
                    rated_power_kw=td["rated_power_kw"],
                    alert_level=td["alert_level"],
                    cumulative_damage=0.12,
                    damage_fraction=0.12,
                    rul_days=round(365 * 10 * (1 - 0.12), 0),
                    installation_date=datetime(2018, 6, 1, tzinfo=timezone.utc),
                )
                db.add(turbine)
                print(f"Created turbine: {td['turbine_id']}")
            else:
                print(f"Turbine already exists: {td['turbine_id']}")

        db.commit()
        print("Seeding complete.")
    finally:
        db.close()

if __name__ == "__main__":
    seed()
