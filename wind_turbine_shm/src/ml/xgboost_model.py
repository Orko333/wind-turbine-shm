"""
XGBoost-класифікатор стану пошкодження та регресор DEL.

Надаються дві моделі:
  1. DamageClassifier — 3-класова класифікація (Здоровий / Попередження / Критичний).
  2. DELRegressor     — регресія еквівалентного навантаження пошкодження [МПа].

XGBoost обраний тому що:
  - Ефективно обробляє табличні дані SCADA без нормалізації.
  - Надає важливість ознак «з коробки» (Gain, Cover, значення SHAP).
  - Стійкий до пропущених значень (відмови датчиків) нативно.
  - На порядки швидший інференс порівняно з нейронними мережами.

Обидві моделі обгорнуті сумісним з sklearn API для легкої інтеграції в пайплайн.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    accuracy_score,
    f1_score,
    mean_squared_error,
    mean_absolute_error,
    r2_score,
)
from pathlib import Path
from typing import Optional, Tuple
from loguru import logger
import joblib


class DamageClassifier:
    """
    XGBoost-класифікатор стану пошкодження башти турбіни (кілька класів).

    Класи:
      0 — Здоровий   (D < 0.3)
      1 — Попередження (0.3 ≤ D < 0.7)
      2 — Критичний  (D ≥ 0.7)

    Вхідні ознаки: будь-яка комбінація SCADA-статистик та/або ВЧ-ознак сигналу.
    """

    LABEL_NAMES = {0: "Healthy", 1: "Warning", 2: "Critical"}

    def __init__(
        self,
        n_estimators: int = 400,
        max_depth: int = 6,
        learning_rate: float = 0.05,
        subsample: float = 0.8,
        colsample_bytree: float = 0.8,
        use_gpu: bool = False,
        class_weights: Optional[dict] = None,
        seed: int = 42,
    ) -> None:
        tree_method = "gpu_hist" if use_gpu else "hist"
        self.model = xgb.XGBClassifier(
            n_estimators=n_estimators,
            max_depth=max_depth,
            learning_rate=learning_rate,
            subsample=subsample,
            colsample_bytree=colsample_bytree,
            tree_method=tree_method,
            objective="multi:softprob",
            num_class=3,
            eval_metric="mlogloss",
            random_state=seed,
            early_stopping_rounds=30,
            verbosity=0,
        )
        self._class_weights = class_weights
        self._feature_names: list[str] = []
        self._is_fitted = False

    # ------------------------------------------------------------------ #
    #  Навчання                                                           #
    # ------------------------------------------------------------------ #

    def fit(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        feature_names: Optional[list[str]] = None,
    ) -> "DamageClassifier":
        """
        Навчити XGBoost-класифікатор з ранньою зупинкою за валідаційним log-loss.

        Параметри
        ----------
        X_train, X_val : двовимірні матриці ознак.
        y_train, y_val : одновимірні масиви цілочисельних міток (0, 1 або 2).
        feature_names   : необов'язковий список рядків із назвами ознак.
        """
        if feature_names:
            self._feature_names = feature_names

        sample_weight = None
        if self._class_weights:
            sample_weight = np.array([self._class_weights.get(int(y), 1.0) for y in y_train])

        self.model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            sample_weight=sample_weight,
            verbose=False,
        )
        self._is_fitted = True
        logger.info(
            f"XGBoost-класифікатор навчено. Краща ітерація: {self.model.best_iteration}, "
            f"val log-loss: {self.model.best_score:.4f}"
        )
        return self

    def cross_validate(
        self,
        X: np.ndarray,
        y: np.ndarray,
        cv: int = 5,
    ) -> dict:
        """
        Стратифікована k-кратна крос-валідація (для вибору гіперпараметрів).

        Повертає середнє та стандартне відхилення оцінки F1-macro.
        """
        cv_model = xgb.XGBClassifier(
            n_estimators=self.model.n_estimators,
            max_depth=self.model.max_depth,
            learning_rate=self.model.learning_rate,
            subsample=self.model.subsample,
            objective="multi:softprob",
            num_class=3,
            eval_metric="mlogloss",
            verbosity=0,
        )
        skf = StratifiedKFold(n_splits=cv, shuffle=True, random_state=42)
        scores = cross_val_score(cv_model, X, y, cv=skf, scoring="f1_macro")
        result = {"f1_macro_mean": float(scores.mean()), "f1_macro_std": float(scores.std())}
        logger.info(f"CV F1-macro: {result['f1_macro_mean']:.4f} ± {result['f1_macro_std']:.4f}")
        return result

    # ------------------------------------------------------------------ #
    #  Інференс                                                           #
    # ------------------------------------------------------------------ #

    def predict(self, X: np.ndarray) -> np.ndarray:
        """Повернути прогнозовані мітки класів (0, 1, 2)."""
        self._check_fitted()
        return self.model.predict(X)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Повернути імовірності класів (N, 3)."""
        self._check_fitted()
        return self.model.predict_proba(X)

    def predict_label(self, X: np.ndarray) -> list[str]:
        """Повернути зрозумілі людині назви класів."""
        preds = self.predict(X)
        return [self.LABEL_NAMES[int(p)] for p in preds]

    # ------------------------------------------------------------------ #
    #  Оцінка                                                             #
    # ------------------------------------------------------------------ #

    def evaluate(
        self,
        X: np.ndarray,
        y: np.ndarray,
    ) -> dict:
        """Повернути повний набір метрик класифікації."""
        y_pred = self.predict(X)
        acc = accuracy_score(y, y_pred)
        f1 = f1_score(y, y_pred, average="macro", zero_division=0)
        cm = confusion_matrix(y, y_pred)
        present_labels = sorted(set(y) | set(y_pred))
        target_names = [self.LABEL_NAMES[i] for i in present_labels if i in self.LABEL_NAMES]
        report = classification_report(y, y_pred, labels=present_labels, target_names=target_names, zero_division=0)

        logger.info(f"Точність на тесті: {acc:.4f} | F1-macro: {f1:.4f}")
        logger.info(f"\n{report}")

        return {
            "accuracy": float(acc),
            "f1_macro": float(f1),
            "confusion_matrix": cm.tolist(),
            "classification_report": report,
        }

    # ------------------------------------------------------------------ #
    #  Важливість ознак                                                   #
    # ------------------------------------------------------------------ #

    def feature_importance(self, importance_type: str = "gain") -> pd.Series:
        """
        Повернути важливість ознак XGBoost.

        importance_type : "gain" (за замовч.) | "weight" | "cover"
          - "gain" — середній інформаційний приріст на розгалуження (рекомендовано).
        """
        self._check_fitted()
        scores = self.model.get_booster().get_score(importance_type=importance_type)
        if self._feature_names:
            series = pd.Series(scores).reindex(self._feature_names, fill_value=0.0)
        else:
            series = pd.Series(scores)
        return series.sort_values(ascending=False)

    # ------------------------------------------------------------------ #
    #  Збереження та завантаження                                         #
    # ------------------------------------------------------------------ #

    def save(self, path: str) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        joblib.dump({"model": self.model, "feature_names": self._feature_names}, path)
        logger.info(f"DamageClassifier збережено до {path}")

    @classmethod
    def load(cls, path: str) -> "DamageClassifier":
        state = joblib.load(path)
        obj = cls()
        obj.model = state["model"]
        obj._feature_names = state["feature_names"]
        obj._is_fitted = True
        return obj

    def _check_fitted(self) -> None:
        if not self._is_fitted:
            raise RuntimeError("Модель не навчена. Спочатку викличте fit().")


class DELRegressor:
    """
    XGBoost-регресор для прогнозування еквівалентного навантаження пошкодження
    (DEL) [МПа] безпосередньо з SCADA-ознак — без потреби у високочастотних сигналах.

    Це сурогатна модель для фізичного пайплайну Rainflow/Miner,
    що дозволяє оцінювати DEL у реальному часі зі стандартних 10-хв SCADA-даних.
    """

    def __init__(
        self,
        n_estimators: int = 300,
        max_depth: int = 5,
        learning_rate: float = 0.05,
        seed: int = 42,
    ) -> None:
        self.model = xgb.XGBRegressor(
            n_estimators=n_estimators,
            max_depth=max_depth,
            learning_rate=learning_rate,
            subsample=0.8,
            colsample_bytree=0.8,
            objective="reg:squarederror",
            eval_metric="rmse",
            random_state=seed,
            early_stopping_rounds=25,
            verbosity=0,
        )
        self._is_fitted = False
        self._feature_names: list[str] = []

    def fit(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        feature_names: Optional[list[str]] = None,
    ) -> "DELRegressor":
        if feature_names:
            self._feature_names = feature_names
        self.model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
        self._is_fitted = True
        logger.info(f"DELRegressor навчено. Val RMSE: {self.model.best_score:.4f}")
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        if not self._is_fitted:
            raise RuntimeError("Модель не навчена.")
        return self.model.predict(X)

    def evaluate(self, X: np.ndarray, y: np.ndarray) -> dict:
        y_pred = self.predict(X)
        rmse = float(np.sqrt(mean_squared_error(y, y_pred)))
        mae = float(mean_absolute_error(y, y_pred))
        r2 = float(r2_score(y, y_pred))
        mape = float(np.mean(np.abs((y_pred - y) / (np.abs(y) + 1e-8))) * 100)
        logger.info(f"DEL Регресор — RMSE={rmse:.4f}, MAE={mae:.4f}, R²={r2:.4f}, MAPE={mape:.2f}%")
        return {"RMSE": rmse, "MAE": mae, "R2": r2, "MAPE": mape}

    def save(self, path: str) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        joblib.dump({"model": self.model, "feature_names": self._feature_names}, path)

    @classmethod
    def load(cls, path: str) -> "DELRegressor":
        state = joblib.load(path)
        obj = cls()
        obj.model = state["model"]
        obj._feature_names = state["feature_names"]
        obj._is_fitted = True
        return obj
