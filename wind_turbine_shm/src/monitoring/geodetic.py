"""Геодезичний контроль — моніторинг осідання фундаменту та переміщень конструкції."""

import numpy as np
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timezone
from loguru import logger


@dataclass
class GeoPoint:
    """Координати знімальної точки."""
    point_id: str
    x: float  # Схід [метри]
    y: float  # Північ [метри]
    z: float  # Висота [метри]
    timestamp: str
    precision: float = 0.01  # ±см


@dataclass
class SettlementAnalysis:
    """Оцінка осідання фундаменту."""
    turbine_id: str
    vertical_settlement: float  # [мм]
    horizontal_displacement: float  # [мм]
    tilt_angle: float  # [градуси]
    tilt_direction: str  # 'N', 'NE', 'E' тощо
    settlement_rate: float  # [мм/рік]
    alert_level: str  # 'healthy', 'warning', 'critical'
    recommendations: List[str]
    is_stable: bool


class GeodesticMonitoring:
    """Відстеження осідання фундаменту та переміщень конструкції в реальному часі."""

    def __init__(self, reference_survey: Dict[str, GeoPoint]):
        """
        Ініціалізує модуль базовими (реперними) знімальними точками.

        Args:
            reference_survey: {point_id: GeoPoint} базові вимірювання
        """
        self.reference_survey = reference_survey
        self.measurement_history: List[Dict[str, GeoPoint]] = [reference_survey]
        self.settlement_log: List[Dict] = []

    def add_survey_epoch(self, measured_points: Dict[str, GeoPoint]):
        """Записує нову епоху знімання."""
        self.measurement_history.append(measured_points)
        logger.info(f"Survey epoch {len(self.measurement_history)} recorded")

    def _compute_displacement(
        self,
        baseline: GeoPoint,
        current: GeoPoint,
    ) -> Tuple[float, float, float]:
        """Обчислює переміщення відносно базового рівня."""
        dX = (current.x - baseline.x) * 1000  # Переводимо у мм
        dY = (current.y - baseline.y) * 1000
        dZ = (current.z - baseline.z) * 1000

        return dX, dY, dZ

    def analyze_settlement(
        self,
        turbine_id: str,
        foundation_point_ids: List[str],
        tower_base_points: List[str],
        tower_top_points: List[str],
    ) -> SettlementAnalysis:
        """
        Аналізує осідання фундаменту та нахил башти.

        Використовує диференційне нівелювання та базові вимірювання.
        """
        if len(self.measurement_history) < 2:
            return SettlementAnalysis(
                turbine_id=turbine_id,
                vertical_settlement=0.0,
                horizontal_displacement=0.0,
                tilt_angle=0.0,
                tilt_direction='N/A',
                settlement_rate=0.0,
                alert_level='insufficient_data',
                recommendations=['More survey epochs needed for analysis'],
                is_stable=True,
            )

        baseline_survey = self.measurement_history[0]
        current_survey = self.measurement_history[-1]

        # 1. Осідання фундаменту (вертикальне)
        foundation_settlements = []
        for point_id in foundation_point_ids:
            if point_id in baseline_survey and point_id in current_survey:
                _, _, dZ = self._compute_displacement(
                    baseline_survey[point_id],
                    current_survey[point_id],
                )
                foundation_settlements.append(dZ)

        vertical_settlement = np.mean(foundation_settlements) if foundation_settlements else 0.0

        # 2. Горизонтальне переміщення
        horizontal_displacements = []
        for point_id in foundation_point_ids:
            if point_id in baseline_survey and point_id in current_survey:
                dX, dY, _ = self._compute_displacement(
                    baseline_survey[point_id],
                    current_survey[point_id],
                )
                displacement = np.sqrt(dX ** 2 + dY ** 2)
                horizontal_displacements.append(displacement)

        horizontal_displacement = np.mean(horizontal_displacements) if horizontal_displacements else 0.0

        # 3. Нахил башти (інклінація)
        tower_top = None
        tower_base = None

        if tower_top_points and tower_top_points[0] in current_survey:
            tower_top = current_survey[tower_top_points[0]]

        if tower_base_points and tower_base_points[0] in current_survey:
            tower_base = current_survey[tower_base_points[0]]

        tilt_angle = 0.0
        tilt_direction = 'N'

        if tower_top and tower_base:
            tower_height = tower_base.z - tower_top.z  # Має бути ~100 м
            horizontal_offset = np.sqrt(
                (tower_top.x - tower_base.x) ** 2 +
                (tower_top.y - tower_base.y) ** 2
            )

            if tower_height > 0:
                tilt_angle = np.degrees(np.arctan(horizontal_offset / tower_height))

                # Напрямок нахилу
                dy = tower_top.y - tower_base.y
                dx = tower_top.x - tower_base.x
                direction_angle = np.degrees(np.arctan2(dy, dx))

                # Перетворюємо у румб
                direction_angle = (direction_angle + 360) % 360
                if direction_angle < 22.5:
                    tilt_direction = 'E'
                elif direction_angle < 67.5:
                    tilt_direction = 'NE'
                elif direction_angle < 112.5:
                    tilt_direction = 'N'
                elif direction_angle < 157.5:
                    tilt_direction = 'NW'
                elif direction_angle < 202.5:
                    tilt_direction = 'W'
                elif direction_angle < 247.5:
                    tilt_direction = 'SW'
                elif direction_angle < 292.5:
                    tilt_direction = 'S'
                else:
                    tilt_direction = 'SE'

        # 4. Темп осідання
        time_diff_days = 365.0  # Припускаємо щорічне знімання
        num_epochs = len(self.measurement_history) - 1

        if num_epochs > 0:
            total_time_days = time_diff_days * num_epochs
            settlement_rate = (vertical_settlement / total_time_days) * 365
        else:
            settlement_rate = 0.0

        # 5. Оцінка
        alert_level, is_stable, recommendations = self._assess_stability(
            vertical_settlement,
            horizontal_displacement,
            tilt_angle,
            settlement_rate,
        )

        analysis = SettlementAnalysis(
            turbine_id=turbine_id,
            vertical_settlement=vertical_settlement,
            horizontal_displacement=horizontal_displacement,
            tilt_angle=tilt_angle,
            tilt_direction=tilt_direction,
            settlement_rate=settlement_rate,
            alert_level=alert_level,
            recommendations=recommendations,
            is_stable=is_stable,
        )

        # Записуємо аналіз
        self.settlement_log.append({
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'turbine_id': turbine_id,
            **analysis.__dict__,
        })

        return analysis

    def _assess_stability(
        self,
        vertical: float,
        horizontal: float,
        tilt: float,
        settlement_rate: float,
    ) -> Tuple[str, bool, List[str]]:
        """Оцінює стійкість фундаменту."""
        recs = []
        alert = 'healthy'
        is_stable = True

        # Пороги для башти 100 м, турбіни 3 МВт
        vertical_threshold_warn = 50.0  # мм
        vertical_threshold_crit = 100.0  # мм
        horizontal_threshold_warn = 30.0  # мм
        horizontal_threshold_crit = 75.0  # мм
        tilt_threshold_warn = 0.5  # градусів
        tilt_threshold_crit = 1.0  # градусів
        rate_threshold_warn = 5.0  # мм/рік
        rate_threshold_crit = 15.0  # мм/рік

        # Перевірки вертикального осідання
        if vertical > vertical_threshold_crit:
            alert = 'critical'
            is_stable = False
            recs.append("🚨 CRITICAL: Excessive foundation settlement detected. HALT OPERATIONS immediately.")
            recs.append("Conduct emergency geotechnical survey and structural assessment.")
        elif vertical > vertical_threshold_warn:
            alert = 'warning'
            recs.append(f"⚠️  Elevated vertical settlement: {vertical:.1f}mm. Monitor closely.")

        # Перевірки горизонтального переміщення
        if horizontal > horizontal_threshold_crit:
            alert = 'critical'
            is_stable = False
            recs.append("🚨 CRITICAL: Significant horizontal displacement. Risk of structural instability.")
        elif horizontal > horizontal_threshold_warn:
            if alert != 'critical':
                alert = 'warning'
            recs.append(f"⚠️  Horizontal displacement: {horizontal:.1f}mm. Verify foundation anchors.")

        # Перевірки нахилу
        if tilt > tilt_threshold_crit:
            alert = 'critical'
            is_stable = False
            recs.append(f"🚨 CRITICAL: Tower tilt {tilt:.2f}° exceeds safe limits.")
        elif tilt > tilt_threshold_warn:
            if alert != 'critical':
                alert = 'warning'
            recs.append(f"⚠️  Tower tilt: {tilt:.2f}°. Monitor for progression.")

        # Перевірки темпу осідання
        if settlement_rate > rate_threshold_crit:
            alert = 'critical'
            is_stable = False
            recs.append(f"🚨 CRITICAL: High settlement rate: {settlement_rate:.1f}mm/year. Active subsidence.")
        elif settlement_rate > rate_threshold_warn:
            if alert != 'critical':
                alert = 'warning'
            recs.append(f"⚠️  Settlement rate: {settlement_rate:.1f}mm/year. Schedule follow-up survey.")

        if alert == 'healthy' and not recs:
            recs.append("Foundation is stable. Continue routine annual surveys.")

        return alert, is_stable, recs

    def predict_settlement_projection(
        self,
        years_ahead: int = 5,
    ) -> Dict[str, float]:
        """Прогнозує майбутнє осідання на основі тренду."""
        if len(self.settlement_log) < 2:
            return {'error': 'Insufficient data for projection'}

        recent_settlements = [
            log['vertical_settlement']
            for log in self.settlement_log[-5:]
        ]

        if len(recent_settlements) < 2:
            return {'error': 'Need more epochs'}

        # Лінійний тренд
        x = np.arange(len(recent_settlements))
        y = np.array(recent_settlements)

        try:
            coeffs = np.polyfit(x, y, 1)
            slope = coeffs[0]  # Осідання за епоху (річне)

            projected_settlement = recent_settlements[-1] + (slope * years_ahead)

            return {
                'current_settlement': float(recent_settlements[-1]),
                'annual_rate': float(slope),
                'projected_settlement_in_{}_years'.format(years_ahead): float(projected_settlement),
                'trend': 'accelerating' if slope > 5 else 'stable' if slope < 2 else 'linear',
            }
        except Exception as e:
            logger.error(f"Projection failed: {e}")
            return {'error': str(e)}

    def get_settlement_history(self) -> List[Dict]:
        """Повертає повну історію осідання."""
        return self.settlement_log
