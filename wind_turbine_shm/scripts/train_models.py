"""
Скрипт: навчання всіх моделей ML (класифікатор XGBoost, регресор DEL, LSTM, автоенкодер).

Конвеєр:
  1. Завантаження попередньо згенерованих наборів даних SCADA та HF.
  2. Попередня обробка та розбивка (хронологічний поділ 70/15/15).
  3. Навчання XGBoost DamageClassifier + DELRegressor на ознаках SCADA.
  4. Навчання LSTM на послідовностях SCADA для передбачення індексу пошкодження.
  5. Навчання згорткового автоенкодера на вікнах HF-сигналу нормального стану.
  6. Оцінка всіх моделей на тестовій вибірці.
  7. Збереження моделей та масштабувальників у models/checkpoints/.

Використання:
    python scripts/train_models.py --data data/synthetic --epochs 80
"""

from __future__ import annotations

import argparse
import sys
import numpy as np
import pandas as pd
from pathlib import Path
import joblib
from loguru import logger

sys.path.insert(0, str(Path(__file__).parent.parent))

# Вимкнути DEBUG-повідомлення під час тренування
logger.remove()
logger.add(sys.stderr, level="INFO")

from src.data.loader import DataLoader
from src.data.preprocessor import SignalPreprocessor
from src.ml.features import FeatureExtractor
from src.ml.xgboost_model import DamageClassifier, DELRegressor
from src.ml.lstm_model import LSTMPredictor
from src.ml.autoencoder import AnomalyDetector
from src.ml.explainability import SHAPExplainer
from src.fatigue.miner import PalmgrenMinerAccumulator


def main(data_dir: str, models_dir: str, epochs: int, seed: int) -> None:
    loader = DataLoader(data_dir=data_dir)
    checkpoints = Path(models_dir)
    checkpoints.mkdir(parents=True, exist_ok=True)

    # ── 1. Завантаження даних ─────────────────────────────────────────
    logger.info("Завантаження даних SCADA...")
    scada_df = loader.load_scada("scada_data.parquet")

    logger.info("Завантаження даних HF-вікон...")
    hf_df = loader.load_hf("hf_windows.parquet")

    # ── 2. Обчислення фізично обґрунтованих міток пошкодження ─────────
    logger.info("Обчислення фізично обґрунтованих міток накопиченого пошкодження...")
    miner = PalmgrenMinerAccumulator(n_bins=64)
    damage_series = miner.compute_from_moment_series(
        scada_df["tower_base_moment_kNm"].values, section_modulus_m3=0.35
    )
    scada_df["damage_index"] = damage_series

    # Використовуємо квантильні пороги: якщо всі записи < 0.3 (1 рік даних),
    # абсолютні пороги дали б лише клас 0. Відносні пороги (33/67 перцентиль)
    # гарантують наявність всіх трьох класів у навчальній вибірці.
    d_33 = float(np.percentile(damage_series, 33))
    d_67 = float(np.percentile(damage_series, 67))
    logger.info(f"Пороги класифікації: Healthy < {d_33:.6f} | Warning < {d_67:.6f} | Critical ≥ {d_67:.6f}")
    scada_df["damage_class"] = pd.cut(
        scada_df["damage_index"], bins=[-np.inf, d_33, d_67, np.inf], labels=[0, 1, 2]
    ).astype(int)

    # ── 3. Попередня обробка SCADA ─────────────────────────────────────
    logger.info("Попередня обробка даних SCADA...")
    preprocessor = SignalPreprocessor()
    scada_clean = preprocessor.fit_transform_scada(scada_df)
    preprocessor.save(str(checkpoints / "preprocessor.joblib"))
    joblib.dump(preprocessor._scaler, str(checkpoints / "scaler.joblib"))

    # ── 4. Розбивка ────────────────────────────────────────────────────
    train_sc, val_sc, test_sc = loader.train_val_test_split(scada_clean, shuffle=False)
    train_hf, val_hf, test_hf = loader.train_val_test_split(hf_df,     shuffle=True, seed=seed)

    # ── 5. Вилучення ознак ─────────────────────────────────────────────
    extractor = FeatureExtractor(fs=100.0)
    feature_cols = FeatureExtractor.SCADA_FEATURE_NAMES

    X_train = train_sc[feature_cols].values
    y_cls_train = train_sc["damage_class"].values.astype(int)
    y_dmg_train = train_sc["damage_index"].values.astype(np.float32)

    X_val  = val_sc[feature_cols].values
    y_cls_val   = val_sc["damage_class"].values.astype(int)
    y_dmg_val   = val_sc["damage_index"].values.astype(np.float32)

    X_test = test_sc[feature_cols].values
    y_cls_test  = test_sc["damage_class"].values.astype(int)
    y_dmg_test  = test_sc["damage_index"].values.astype(np.float32)

    # ── 6. Класифікатор XGBoost ───────────────────────────────────────
    logger.info("Навчання XGBoost DamageClassifier...")
    class_weights = loader.get_class_weights(y_cls_train)
    clf = DamageClassifier(n_estimators=400, class_weights=class_weights)
    clf.fit(X_train, y_cls_train, X_val, y_cls_val, feature_names=feature_cols)
    clf.save(str(checkpoints / "classifier.joblib"))

    clf_metrics = clf.evaluate(X_test, y_cls_test)
    logger.info(f"Класифікатор — Точність: {clf_metrics['accuracy']:.4f}, F1-macro: {clf_metrics['f1_macro']:.4f}")

    # ── 7. Регресор DEL ───────────────────────────────────────────────
    logger.info("Навчання XGBoost DELRegressor...")
    # Мітки DEL: індекс пошкодження, масштабований до діапазону [0, 200] МПа, як проксі DEL
    y_del_train = y_dmg_train * 200.0
    y_del_val   = y_dmg_val   * 200.0
    y_del_test  = y_dmg_test  * 200.0

    del_reg = DELRegressor(n_estimators=300)
    del_reg.fit(X_train, y_del_train, X_val, y_del_val, feature_names=feature_cols)
    del_reg.save(str(checkpoints / "del_regressor.joblib"))

    del_metrics = del_reg.evaluate(X_test, y_del_test)
    logger.info(f"Регресор DEL — RMSE: {del_metrics['RMSE']:.4f}, R²: {del_metrics['R2']:.4f}")

    # ── 8. LSTM ───────────────────────────────────────────────────────
    logger.info("Навчання передбачувача пошкодження LSTM...")
    seq_len = 24  # вікно ретроспективного перегляду на 4 години
    X_seq_train, y_seq_train = preprocessor.prepare_sequences(
        train_sc, feature_cols=feature_cols, target_col="damage_index", seq_len=seq_len
    )
    X_seq_val, y_seq_val = preprocessor.prepare_sequences(
        val_sc, feature_cols=feature_cols, target_col="damage_index", seq_len=seq_len
    )
    X_seq_test, y_seq_test = preprocessor.prepare_sequences(
        test_sc, feature_cols=feature_cols, target_col="damage_index", seq_len=seq_len
    )

    lstm = LSTMPredictor(
        input_size=len(feature_cols),
        seq_len=seq_len,
        hidden_size=128,
        num_layers=2,
        batch_size=64,
    )
    history = lstm.fit(
        X_seq_train, y_seq_train,
        X_seq_val, y_seq_val,
        epochs=epochs,
        patience=15,
        checkpoint_path=str(checkpoints / "lstm_best.pt"),
    )
    lstm.save(str(checkpoints / "lstm_final.pt"))

    lstm_metrics = lstm.evaluate(X_seq_test, y_seq_test)
    logger.info(
        f"LSTM — MAE: {lstm_metrics['MAE']:.6f}, RMSE: {lstm_metrics['RMSE']:.6f}, "
        f"R²: {lstm_metrics['R2']:.4f}"
    )

    # ── 9. Автоенкодер ────────────────────────────────────────────────
    if "accel_signal" in hf_df.columns:
        logger.info("Навчання згорткового автоенкодера...")
        signal_length = 1000

        def prep_signals(df_hf: pd.DataFrame) -> np.ndarray:
            signals = []
            for sig_list in df_hf["accel_signal"]:
                arr = np.array(sig_list, dtype=np.float32)
                if len(arr) < signal_length:
                    arr = np.pad(arr, (0, signal_length - len(arr)))
                else:
                    arr = arr[:signal_length]
                # Нормалізація в межах вікна
                arr = (arr - arr.mean()) / (arr.std() + 1e-8)
                signals.append(arr)
            return np.stack(signals)

        # Навчання лише на нормальних зразках (клас 0)
        healthy_train = train_hf[train_hf["damage_class"] == 0]
        healthy_val   = val_hf[val_hf["damage_class"] == 0]

        if len(healthy_train) >= 20 and len(healthy_val) >= 5:
            X_ae_train = prep_signals(healthy_train)
            X_ae_val   = prep_signals(healthy_val)

            ae = AnomalyDetector(signal_length=signal_length, latent_dim=32)
            ae.fit(X_ae_train, X_ae_val,
                   epochs=epochs,
                   checkpoint_path=str(checkpoints / "autoencoder_best.pt"))
            ae.save(str(checkpoints / "autoencoder_final.pt"))
            logger.info("Автоенкодер навчено та збережено.")
        else:
            logger.warning("Недостатньо нормальних зразків для навчання автоенкодера.")

    # ── 10. Пояснюваність SHAP ────────────────────────────────────────
    logger.info("Обчислення значень SHAP для класифікатора XGBoost...")
    shap_exp = SHAPExplainer(feature_names=feature_cols, class_names=["Норма", "Попередження", "Критичний"])
    shap_exp.fit_tree_explainer(clf.model, X_train[:500])
    shap_values = shap_exp.compute_shap_values(X_test[:200], class_index=2)

    importance = shap_exp.global_importance(shap_values)
    logger.info("Найважливіші ознаки за значенням SHAP:")
    for feat, val in importance.head(5).items():
        logger.info(f"  {feat}: {val:.4f}")

    shap_exp.plot_importance_bar(shap_values, top_k=8, save_path=str(checkpoints / "shap_importance.png"))
    shap_exp.plot_summary(X_test[:200], shap_values, save_path=str(checkpoints / "shap_summary.png"))
    import joblib as _jl
    _jl.dump(shap_exp, str(checkpoints / "shap_explainer.joblib"))
    logger.info("SHAPExplainer збережено.")

    logger.info("Усі моделі успішно навчено та збережено.")
    logger.info(f"Директорія контрольних точок: {checkpoints.resolve()}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Навчання всіх ML-моделей SHM.")
    parser.add_argument("--data",    type=str, default="data/synthetic",       help="Директорія з даними")
    parser.add_argument("--models",  type=str, default="models/checkpoints",   help="Вихідна директорія моделей")
    parser.add_argument("--epochs",  type=int, default=80,                     help="Максимальна кількість епох навчання")
    parser.add_argument("--seed",    type=int, default=42,                     help="Зерно генератора випадкових чисел")
    args = parser.parse_args()
    main(args.data, args.models, args.epochs, args.seed)
