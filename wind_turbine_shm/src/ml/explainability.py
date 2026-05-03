"""
Модуль пояснюваного ШІ (XAI) на основі SHAP (SHapley Additive exPlanations).

Реалізує TreeSHAP для моделей XGBoost та GradientSHAP для нейронних мереж.

Значення SHAP пояснюють ЧОМУ модель прогнозує конкретний клас пошкодження або RUL,
роблячи систему інтерпретованою для операторів вітропарків, які мають обґрунтовувати
рішення про технічне обслуговування на основі діагностичних звітів.

Приклад використання:
    «Модель прогнозує статус КРИТИЧНИЙ тому що:
      - Амплітуда вібрації 1P: +45% внесок
      - RMS прискорення верхівки башти: +30% внесок
      - Температура мотогондоли: +25% внесок»

Джерела:
    Lundberg, S.M. & Lee, S.-I. (2017). A Unified Approach to Interpreting
    Model Predictions. NeurIPS 2017.
    Lundberg, S.M. et al. (2020). From local explanations to global understanding
    with explainable AI for trees. Nature Machine Intelligence.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import shap
from typing import Optional, Union
from loguru import logger
import matplotlib
matplotlib.use("Agg")  # неінтерактивний бекенд для серверного використання
import matplotlib.pyplot as plt


class SHAPExplainer:
    """
    Обгортка пояснюваності на основі SHAP, що підтримує моделі XGBoost та LSTM.

    Для XGBoost (TreeSHAP): точне, швидке обчислення через обхід дерева.
    Для нейронних мереж (DeepSHAP): апроксимація на основі градієнтів.

    Формує:
      - Масиви значень SHAP для окремих зразків
      - Зведення важливості ознак (середнє |SHAP|)
      - Водоспадні графіки для окремих прогнозів
      - Зведені (бджолиний рій) графіки для глобальної важливості
    """

    def __init__(
        self,
        feature_names: Optional[list[str]] = None,
        class_names: Optional[list[str]] = None,
    ) -> None:
        self.feature_names = feature_names or []
        self.class_names = class_names or ["Healthy", "Warning", "Critical"]
        self._explainer = None
        self._shap_values: Optional[np.ndarray] = None
        self._X_background: Optional[np.ndarray] = None

    # ------------------------------------------------------------------ #
    #  TreeSHAP для XGBoost                                              #
    # ------------------------------------------------------------------ #

    def fit_tree_explainer(
        self,
        xgb_model,
        X_background: np.ndarray,
    ) -> "SHAPExplainer":
        """
        Ініціалізувати TreeSHAP-пояснювач для моделі XGBoost.

        Параметри
        ----------
        xgb_model : навчений XGBClassifier або XGBRegressor.
        X_background : репрезентативний фоновий набір даних для базової лінії SHAP
            (зазвичай навчальна вибірка або її K-means-зведення).
        """
        self._X_background = X_background
        self._explainer = shap.TreeExplainer(
            xgb_model,
            data=X_background,
            feature_perturbation="interventional",
        )
        logger.info("TreeSHAP-пояснювач ініціалізовано.")
        return self

    def compute_shap_values(
        self,
        X: np.ndarray,
        class_index: Optional[int] = None,
    ) -> np.ndarray:
        """
        Обчислити значення SHAP для матриці ознак X.

        Для багатокласового XGBoost повертає значення для класу `class_index`
        (за замовчуванням: клас 2 — «Критичний»), оскільки він є найбільш
        операційно значущим для оператора.

        Повертає
        -------
        shap_values : масив (N, n_features)
        """
        if self._explainer is None:
            raise RuntimeError("Пояснювач не ініціалізовано. Спочатку викличте fit_tree_explainer().")

        raw = self._explainer.shap_values(X)

        if isinstance(raw, list):
            # Багатокласовий (старий API): список масивів (N, n_features), по одному на клас.
            default_idx = len(raw) - 1
            idx = class_index if class_index is not None else default_idx
            idx = max(0, min(idx, len(raw) - 1))
            self._shap_values = raw[idx]
        elif isinstance(raw, np.ndarray) and raw.ndim == 3:
            # Багатокласовий (новий API): масив форми (N, n_features, n_classes).
            n_classes = raw.shape[2]
            default_idx = n_classes - 1
            idx = class_index if class_index is not None else default_idx
            idx = max(0, min(idx, n_classes - 1))
            self._shap_values = raw[:, :, idx]
        else:
            # Бінарний або регресійний випадок: очікуємо (N, n_features).
            self._shap_values = raw

        return self._shap_values

    # ------------------------------------------------------------------ #
    #  Глобальна важливість ознак                                         #
    # ------------------------------------------------------------------ #

    def global_importance(self, shap_values: Optional[np.ndarray] = None) -> pd.Series:
        """
        Глобальна важливість ознак SHAP: mean(|SHAP value|) на ознаку.

        Це основна метрика для розуміння того, які SCADA-ознаки або ознаки сигналу
        глобально визначають прогнози стану пошкодження.
        """
        sv = shap_values if shap_values is not None else self._shap_values
        if sv is None:
            raise RuntimeError("Значення SHAP ще не обчислено.")

        importance = np.abs(sv).mean(axis=0)
        series = pd.Series(
            importance,
            index=self.feature_names if self.feature_names else [f"f{i}" for i in range(len(importance))],
            name="mean_abs_shap",
        )
        return series.sort_values(ascending=False)

    # ------------------------------------------------------------------ #
    #  Локальне пояснення для одного прогнозу                            #
    # ------------------------------------------------------------------ #

    def explain_sample(
        self,
        X_sample: np.ndarray,
        class_index: int = 2,
        top_k: int = 8,
    ) -> dict:
        """
        Пояснити окремий прогноз у форматі природної мови.

        Повертає словник з:
          - 'prediction_class': назва прогнозованого класу
          - 'top_features': список кортежів (назва_ознаки, shap_значення, напрямок)
          - 'explanation_text': зрозумілий людині рядок пояснення

        Пояснення відформатовано для відображення на панелі оператора.
        """
        if self._explainer is None:
            raise RuntimeError("Пояснювач не ініціалізовано.")

        X_2d = X_sample.reshape(1, -1) if X_sample.ndim == 1 else X_sample
        shap_vals = self.compute_shap_values(X_2d, class_index=class_index)[0]

        # Сортувати за абсолютним значенням SHAP
        top_idx = np.argsort(np.abs(shap_vals))[::-1][:top_k]
        names = self.feature_names if self.feature_names else [f"f{i}" for i in range(len(shap_vals))]

        top_features = []
        for i in top_idx:
            name = names[i]
            val = float(shap_vals[i])
            direction = "increases" if val > 0 else "decreases"
            top_features.append((name, val, direction))

        # Обчислити відносні внески
        total_abs = np.sum(np.abs(shap_vals)) + 1e-12
        contributions = [(n, v, d, abs(v) / total_abs * 100) for n, v, d in top_features]

        # Побудувати текст пояснення
        lines = [f"Prediction: {self.class_names[class_index]}"]
        lines.append("Key factors contributing to this prediction:")
        for name, val, direction, pct in contributions:
            lines.append(f"  • {name}: {direction} risk by {pct:.1f}% (SHAP={val:+.4f})")

        return {
            "prediction_class": self.class_names[class_index],
            "top_features": contributions,
            "explanation_text": "\n".join(lines),
        }

    # ------------------------------------------------------------------ #
    #  Візуалізація                                                        #
    # ------------------------------------------------------------------ #

    def plot_summary(
        self,
        X: np.ndarray,
        shap_values: Optional[np.ndarray] = None,
        max_display: int = 15,
        save_path: Optional[str] = None,
    ) -> plt.Figure:
        """
        Зведений графік SHAP «бджолиний рій» — глобальна важливість ознак із розподілом значень.

        Цей графік включено до дипломної роботи як рисунок для Розділу 4.4.
        """
        sv = shap_values if shap_values is not None else self._shap_values
        if sv is None:
            raise RuntimeError("Значення SHAP відсутні.")

        feature_names = self.feature_names or [f"f{i}" for i in range(X.shape[1])]

        fig, ax = plt.subplots(figsize=(10, 6))
        shap.summary_plot(sv, X, feature_names=feature_names, max_display=max_display,
                          show=False, plot_size=None)
        ax = plt.gca()
        ax.set_title("SHAP Feature Importance — Damage State Prediction", fontsize=13)
        plt.tight_layout()

        if save_path:
            plt.savefig(save_path, dpi=150, bbox_inches="tight")
            logger.info(f"Зведений графік SHAP збережено до {save_path}")

        return fig

    def plot_waterfall(
        self,
        X_sample: np.ndarray,
        class_index: int = 2,
        save_path: Optional[str] = None,
    ) -> plt.Figure:
        """
        Водоспадний графік SHAP для одного прогнозу — показує, як кожна ознака
        зміщує вихід моделі від базового значення до фінального прогнозу.

        Корисно для пояснення конкретної тривожної події оператору.
        """
        if self._explainer is None:
            raise RuntimeError("Пояснювач не ініціалізовано.")

        X_2d = X_sample.reshape(1, -1) if X_sample.ndim == 1 else X_sample
        shap_vals = self.compute_shap_values(X_2d, class_index=class_index)[0]
        expected = float(self._explainer.expected_value[class_index]) \
            if isinstance(self._explainer.expected_value, (list, np.ndarray)) \
            else float(self._explainer.expected_value)

        feature_names = self.feature_names or [f"f{i}" for i in range(len(shap_vals))]
        expl = shap.Explanation(
            values=shap_vals,
            base_values=expected,
            data=X_2d[0],
            feature_names=feature_names,
        )

        fig, ax = plt.subplots(figsize=(10, 6))
        shap.waterfall_plot(expl, max_display=12, show=False)
        plt.title(f"SHAP Waterfall — {self.class_names[class_index]} prediction", fontsize=12)
        plt.tight_layout()

        if save_path:
            plt.savefig(save_path, dpi=150, bbox_inches="tight")
            logger.info(f"Водоспадний графік SHAP збережено до {save_path}")

        return fig

    def plot_importance_bar(
        self,
        shap_values: Optional[np.ndarray] = None,
        top_k: int = 10,
        save_path: Optional[str] = None,
    ) -> plt.Figure:
        """Горизонтальна стовпчаста діаграма середніх значень |SHAP|."""
        importance = self.global_importance(shap_values).head(top_k)

        fig, ax = plt.subplots(figsize=(8, 5))
        colors = ["#d73027" if v > 0 else "#4575b4" for v in importance.values]
        ax.barh(range(len(importance)), importance.values[::-1], color=colors[::-1])
        ax.set_yticks(range(len(importance)))
        ax.set_yticklabels(importance.index[::-1])
        ax.set_xlabel("Mean |SHAP value|", fontsize=11)
        ax.set_title("Global Feature Importance (SHAP)", fontsize=13)
        ax.grid(axis="x", alpha=0.3)
        plt.tight_layout()

        if save_path:
            plt.savefig(save_path, dpi=150, bbox_inches="tight")
        return fig
