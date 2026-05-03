"""
Скрипт: генерація синтетичних наборів даних SCADA та HF-сигналів.

Використання:
    python scripts/generate_data.py --years 10 --output data/synthetic
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
from loguru import logger
from src.data.generator import SCADADataGenerator, TurbineParameters, WeibullWindModel


def main(years: int, output_dir: str, seed: int) -> None:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    n_records = years * 365 * 144  # записів по 10 хвилин на рік

    turbine = TurbineParameters()
    wind_model = WeibullWindModel(shape_k=2.1, scale_c=8.5, turbulence_intensity=0.12)

    gen = SCADADataGenerator(turbine=turbine, wind_model=wind_model, fs=100.0, seed=seed)

    logger.info(f"Генерація {n_records} записів SCADA ({years} років)...")
    scada_df = gen.generate_scada(n_records=n_records, add_fault_events=True)
    scada_path = out / "scada_data.parquet"
    scada_df.to_parquet(scada_path, index=False)
    logger.info(f"Дані SCADA збережено: {scada_path} ({len(scada_df)} рядків)")

    logger.info("Генерація вікон високочастотних сигналів...")
    hf_df = gen.generate_hf_dataset(scada_df, max_windows=2000)
    hf_path = out / "hf_windows.parquet"
    hf_df.to_parquet(hf_path, index=False)
    logger.info(f"HF-вікна збережено: {hf_path} ({len(hf_df)} рядків)")

    # Виведення розподілу класів
    counts = hf_df["damage_class"].value_counts().sort_index()
    for cls, cnt in counts.items():
        logger.info(f"  Клас {cls}: {cnt} зразків ({cnt/len(hf_df)*100:.1f}%)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Генерація синтетичного набору даних SHM для турбіни.")
    parser.add_argument("--years",  type=int, default=10, help="Роки симуляції (за замовчуванням: 10)")
    parser.add_argument("--output", type=str, default="data/synthetic", help="Вихідна директорія")
    parser.add_argument("--seed",   type=int, default=42, help="Зерно генератора випадкових чисел")
    args = parser.parse_args()
    main(args.years, args.output, args.seed)
