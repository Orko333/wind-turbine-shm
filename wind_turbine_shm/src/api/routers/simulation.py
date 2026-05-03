"""
Роутер симуляції — генерує всі дані для React-дашборду в одному запиті.

Endpoints:
  GET /simulation/run    — повний набір даних для однієї турбіни
  GET /simulation/fleet  — скорочені дані для всіх 4 турбін
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import signal as sp_signal
from scipy.stats import weibull_min
from fastapi import APIRouter, Query, HTTPException
from typing import Literal
from loguru import logger

from ...data.generator import SCADADataGenerator, TurbineParameters, WeibullWindModel
from ...fatigue.rainflow import RainflowCounter
from ...fatigue.sn_curves import WeldedJointSN
from ...fatigue.miner import PalmgrenMinerAccumulator
from ...fatigue.rul import RULEstimator

router = APIRouter(prefix="/simulation", tags=["simulation"])

RULMethodLiteral = Literal["linear", "ewma", "bayesian"]

TURBINE_SEEDS = {"WT-001": 42, "WT-002": 49, "WT-003": 56, "WT-004": 63}
TURBINE_C_OFFSETS = {"WT-001": -0.75, "WT-002": -0.25, "WT-003": 0.25, "WT-004": 0.75}
TURBINE_I_OFFSETS = {"WT-001": 0.000, "WT-002": 0.006, "WT-003": 0.012, "WT-004": 0.018}
MAX_DISPLAY_POINTS = 3500
MAX_RUL_POINTS = 500


def _subsample(arr: np.ndarray, max_pts: int = MAX_DISPLAY_POINTS) -> np.ndarray:
    step = max(1, len(arr) // max_pts)
    return arr[::step]


def _to_list(arr: np.ndarray) -> list:
    return [None if np.isnan(v) else round(float(v), 6) for v in arr]


def _run_simulation(
    n_years: int,
    weibull_c: float,
    turbulence: float,
    turbine_id: str,
    rul_method: RULMethodLiteral,
    n_bins: int,
    seed: int,
) -> dict:
    """Основне обчислення — виконує всю фізику на Python і повертає сирі масиви."""

    n_records = n_years * 365 * 144  # 10-хвилинні записи

    # --- Генерація даних SCADA ---
    turbine_params = TurbineParameters()
    wind_model = WeibullWindModel(shape_k=2.1, scale_c=weibull_c, turbulence_intensity=turbulence)
    generator = SCADADataGenerator(turbine=turbine_params, wind_model=wind_model, seed=seed)
    df = generator.generate_scada(n_records=n_records, add_fault_events=True)

    # --- Накопичення пошкодження ---
    accumulator = PalmgrenMinerAccumulator(n_bins=n_bins)
    D_arr = accumulator.compute_from_moment_series(
        df["tower_base_moment_kNm"].values, section_modulus_m3=0.35
    )

    # --- Ряд RUL (усі 3 методи, з пониженою дискретизацією) ---
    rul_step = max(1, len(D_arr) // MAX_RUL_POINTS)
    D_sub = D_arr[::rul_step]
    rul_all = {}
    for method in ("linear", "ewma", "bayesian"):
        est = RULEstimator(D_critical=1.0)
        mid = est.compute_rul_series(D_sub, method=method)
        spread = np.where(np.isnan(mid), np.nan, np.abs(mid) * 0.18)
        rul_all[method] = {
            "lower": _to_list(mid - spread),
            "mid": _to_list(mid),
            "upper": _to_list(mid + spread),
        }

    # Часові мітки для RUL із пониженою дискретизацією
    ts_rul = df["timestamp"].values[::rul_step]

    # --- Скалярні KPI ---
    D_now = float(np.clip(D_arr[-1], 0, 1))
    est_primary = RULEstimator(D_critical=1.0)
    rul_series_primary = est_primary.compute_rul_series(D_arr, method="ewma")
    valid_r = rul_series_primary[~np.isnan(rul_series_primary)]
    RUL_now = float(valid_r[-1]) if len(valid_r) else float("nan")

    w_mean = float(df["wind_speed_mean"].mean())
    p_mean = float(df["active_power_kw"].mean())
    p_max = float(df["active_power_kw"].max())
    mom_max = float(df["tower_base_moment_kNm"].max())

    # --- Дані для відображення з пониженою дискретизацією ---
    disp_step = max(1, len(df) // MAX_DISPLAY_POINTS)
    df_s = df.iloc[::disp_step]
    D_s = D_arr[::disp_step]
    ts_disp = [str(t)[:10] for t in df_s["timestamp"]]

    # --- Rainflow (метод дощової течії) ---
    seg_moments = df["tower_base_moment_kNm"].values[-min(len(df), 3024):]
    seg_stress = seg_moments / 0.35 * 1e-3
    rf = RainflowCounter(n_bins=n_bins)
    try:
        cycles = rf.count(seg_stress)
        bin_centers, hist = rf.range_histogram(cycles)
        markov_mat, _, _ = rf.markov_matrix(cycles, stress_max=None)
        msize = min(n_bins, 32)
        markov_mat_32, _, _ = RainflowCounter(n_bins=msize).markov_matrix(cycles)
    except Exception:
        bin_centers = np.zeros(n_bins)
        hist = np.zeros(n_bins)
        markov_mat_32 = np.zeros((32, 32))

    # --- Крива S-N ---
    sn = WeldedJointSN()
    sig_range = np.logspace(0.8, 2.6, 100)
    nf_vals = np.array([sn.cycles_to_failure(s) for s in sig_range])

    # --- PSD (спектральна щільність потужності) ---
    accel_clean = df["tower_top_accel_rms"].fillna(df["tower_top_accel_rms"].median()).values
    freqs_psd, psd_vals = sp_signal.welch(accel_clean, fs=6.0, nperseg=min(512, len(accel_clean) // 4))

    # --- Виявлення аномалій (Z-оцінка) ---
    mom_vals = df["tower_base_moment_kNm"].fillna(df["tower_base_moment_kNm"].median())
    acc_vals = df["tower_top_accel_rms"].fillna(df["tower_top_accel_rms"].median())
    z_moment = (mom_vals - mom_vals.mean()) / mom_vals.std()
    z_accel  = (acc_vals - acc_vals.mean()) / acc_vals.std()
    anomaly_mask = (z_moment.abs() > 3) | (z_accel.abs() > 3)
    n_anomalies = int(anomaly_mask.sum())
    n_critical  = int((z_moment.abs() > 4.5).sum())
    n_sensor_fail = int(df["tower_top_accel_rms"].isna().sum())

    # Критичні події
    ev_df = df[anomaly_mask].copy()
    ev_df["z_moment"] = z_moment[anomaly_mask].values
    ev_df["severity"] = np.where(ev_df["z_moment"].abs() > 4.5, "high",
                        np.where(ev_df["z_moment"].abs() > 3.5, "medium", "low"))
    events = [
        {
            "timestamp": str(row["timestamp"])[:16],
            "z_moment": round(float(row["z_moment"]), 2),
            "moment_kNm": round(float(row["tower_base_moment_kNm"]), 0),
            "severity": row["severity"],
        }
        for _, row in ev_df.tail(15).iloc[::-1].iterrows()
    ]

    # Відображення аномалій з пониженою дискретизацією
    an_step = max(1, len(df) // 4000)
    df_an = df.iloc[::an_step]

    # --- Високочастотна форма сигналу ---
    gen_hf = SCADADataGenerator(TurbineParameters(), seed=seed)
    hf = gen_hf.generate_hf_window(float(df["wind_speed_mean"].median()), D_now)
    show_n = min(1000, len(hf["time"]))
    N_fft = len(hf["accel_ms2"])
    freqs_fft = np.fft.rfftfreq(N_fft, d=1/100.0)
    fft_mag = np.abs(np.fft.rfft(hf["accel_ms2"])) / N_fft * 2

    # --- Розподіл Вейбулла ---
    v_max = float(df["wind_speed_mean"].max()) * 1.1
    v_range = np.linspace(0, v_max, 200)
    wb_pdf = weibull_min.pdf(v_range, c=2.1, scale=weibull_c)
    v_hist, v_edges = np.histogram(df["wind_speed_mean"], bins=40, density=True)
    v_centers = 0.5 * (v_edges[:-1] + v_edges[1:])

    # --- Роза вітрів ---
    rng2 = np.random.default_rng(seed + 1)
    dirs = rng2.vonmises(mu=np.pi * 3 / 4, kappa=1.8, size=min(len(df), 10000)) % (2 * np.pi)
    dirs_deg = (np.degrees(dirs) + 360) % 360
    bins16 = np.arange(0, 361, 22.5)
    wr_counts, _ = np.histogram(dirs_deg, bins=bins16)
    wr_angles = [(bins16[i] + bins16[i+1]) / 2 for i in range(16)]

    # --- Крива тривалості навантаження (LDC) ---
    m_sorted = np.sort(df["tower_base_moment_kNm"].values)[::-1]
    ldc_exc = np.arange(1, len(m_sorted) + 1) / len(m_sorted) * 100
    ldc_step = max(1, len(m_sorted) // 500)

    # --- Темп пошкодження ---
    rate_step = max(1, len(D_arr) // 2500)
    dDdt = np.gradient(D_arr[::rate_step])
    roll_dD = pd.Series(dDdt).rolling(144, min_periods=1).mean().values

    # --- Внесок у пошкодження за бінами швидкості вітру ---
    bins_v = np.arange(0, 26, 2)
    dD_increments = np.concatenate([[0], np.diff(D_arr)])
    df_tmp = df.copy()
    df_tmp["dD"] = dD_increments
    grp = df_tmp.groupby(pd.cut(df_tmp["wind_speed_mean"], bins_v))["dD"].sum()
    grp_total = max(grp.sum(), 1e-12)

    # --- Прогноз обслуговування ---
    rate_avg = float(np.nanmean(np.diff(D_arr[-720:]))) if len(D_arr) > 720 else 1e-5
    rate_avg = max(rate_avg, 1e-6)
    n_fut = min(int((1.0 - D_now) / rate_avg), 52560)
    fut_D = D_now + rate_avg * np.arange(n_fut)
    last_dt = pd.to_datetime(df["timestamp"].values[-1])
    fut_t = pd.date_range(last_dt, periods=n_fut, freq="10min")
    fut_step = max(1, n_fut // 1000)
    spread_fc = fut_D * 0.15

    # Розраховуємо дати подій обслуговування
    maintenance_events = {}
    for thr, label in [(0.6, "inspection"), (0.85, "urgent_inspection"), (1.0, "end_of_life")]:
        if D_now < thr:
            steps_to_thr = int((thr - D_now) / rate_avg)
            if 0 < steps_to_thr < n_fut:
                event_date = last_dt + pd.Timedelta(minutes=10 * steps_to_thr)
                days_from_now = (event_date - pd.Timestamp.now()).days
                maintenance_events[label] = {
                    "date": str(event_date)[:10],
                    "days_from_now": max(0, days_from_now),
                }

    # --- Надійність R(t) та інтенсивність відмов h(t) ---
    rel_step = max(1, len(D_arr) // 2000)
    R_t = np.clip(1.0 - D_arr[::rel_step], 0, 1)
    R_smooth = pd.Series(R_t).rolling(50, min_periods=1).mean().values
    f_t = np.maximum(-np.gradient(R_smooth), 0)
    h_t = np.where(R_smooth > 1e-6, f_t / (R_smooth + 1e-10), 0)
    h_t_roll = pd.Series(h_t).rolling(100, min_periods=1).mean().values
    ts_rel = [str(t)[:10] for t in df["timestamp"].values[::rel_step]]

    # --- Кореляційна матриця ---
    corr_cols = ["wind_speed_mean","active_power_kw","tower_base_moment_kNm",
                 "rotor_speed_rpm","tower_top_accel_rms","pitch_angle_deg"]
    corr_labels = ["v вітру","P акт.","M башти","n ротора","a верх.","Крок θ"]
    corr_matrix = df[corr_cols].corr().values

    # --- Вибірка для кривої потужності ---
    pc_sample = df.sample(min(3000, len(df)), random_state=42)

    # --- Вибірка для 3D-скаттер графіка ---
    smp3d = df.sample(min(2000, len(df)), random_state=42).copy()
    idx3 = smp3d.index
    D_interp = np.interp(np.arange(len(df))[idx3], np.arange(len(D_arr)), D_arr)

    # --- Економічні розрахунки ---
    ann_mwh = p_mean * 8760 / 1000

    return {
        # --- Зведені KPI ---
        "kpi": {
            "D_now": round(D_now, 6),
            "RUL_now_days": None if np.isnan(RUL_now) else round(RUL_now, 1),
            "w_mean": round(w_mean, 2),
            "p_mean": round(p_mean, 1),
            "p_max": round(p_max, 1),
            "cf_pct": round(p_mean / max(p_max, 1) * 100, 1),
            "mom_max_kNm": round(mom_max, 0),
            "ann_mwh": round(ann_mwh, 1),
            "n_records": len(df),
            "alert_level": (
                "GREEN" if D_now < 0.3 else
                "YELLOW" if D_now < 0.6 else
                "ORANGE" if D_now < 0.85 else "RED"
            ),
        },

        # --- Вкладка 1: Огляд ---
        "overview": {
            "timestamps": ts_disp,
            "damage_series": _to_list(D_s),
            "D_max": float(D_arr.max()),
            "scada": {
                "wind_speed": _to_list(df_s["wind_speed_mean"].values),
                "power": _to_list(df_s["active_power_kw"].values),
                "moment": _to_list(df_s["tower_base_moment_kNm"].values),
                "accel": _to_list(df_s["tower_top_accel_rms"].values),
                "rpm": _to_list(df_s["rotor_speed_rpm"].values),
                "pitch": _to_list(df_s["pitch_angle_deg"].values),
            },
            "weibull": {
                "v_range": v_range.tolist(),
                "pdf": wb_pdf.tolist(),
                "hist_centers": v_centers.tolist(),
                "hist_counts": v_hist.tolist(),
            },
            "power_curve": {
                "wind_speed": pc_sample["wind_speed_mean"].tolist(),
                "power": pc_sample["active_power_kw"].tolist(),
                "moment": pc_sample["tower_base_moment_kNm"].tolist(),
            },
            "wind_rose": {
                "angles": wr_angles,
                "counts": wr_counts.tolist(),
                "counts_pct": (wr_counts / max(wr_counts.max(), 1) * 100).tolist(),
            },
        },

        # --- Вкладка 2: Втома ---
        "fatigue": {
            "rainflow": {
                "bin_centers": bin_centers.tolist(),
                "counts": hist.tolist(),
            },
            "sn_curve": {
                "nf": nf_vals.tolist(),
                "stress_mpa": sig_range.tolist(),
            },
            "markov_matrix": np.log1p(markov_mat_32).tolist(),
            "psd": {
                "freqs": freqs_psd.tolist(),
                "power": psd_vals.tolist(),
            },
            "scatter3d": {
                "wind_speed": smp3d["wind_speed_mean"].tolist(),
                "moment": smp3d["tower_base_moment_kNm"].tolist(),
                "power": smp3d["active_power_kw"].tolist(),
                "damage": D_interp.tolist(),
            },
            "correlation": {
                "matrix": np.round(corr_matrix, 2).tolist(),
                "labels": corr_labels,
            },
            "damage_rate": {
                "timestamps": [str(t)[:10] for t in df["timestamp"].values[::rate_step]],
                "dDdt_raw": _to_list(dDdt),
                "dDdt_rolling": _to_list(roll_dD),
            },
            "load_duration": {
                "exceedance_pct": ldc_exc[::ldc_step].tolist(),
                "moment_kNm": m_sorted[::ldc_step].tolist(),
            },
            "damage_by_wind_bin": {
                "bins": [str(iv) for iv in grp.index],
                "contribution_pct": (grp.values / grp_total * 100).tolist(),
                "raw_dD": grp.values.tolist(),
            },
        },

        # --- Вкладка 3: RUL та обслуговування ---
        "rul": {
            "timestamps": [str(t)[:10] for t in ts_rul],
            "methods": rul_all,
            "active_method": rul_method,
            "reliability": {
                "timestamps": ts_rel,
                "R_t_pct": _to_list(R_t * 100),
                "F_t_pct": _to_list((1 - R_t) * 100),
            },
            "hazard": {
                "timestamps": ts_rel,
                "h_t": _to_list(h_t_roll),
            },
            "forecast": {
                "hist_timestamps": [str(t)[:10] for t in df["timestamp"].values[::max(1, len(df)//2500)]],
                "hist_D": _to_list(D_arr[::max(1, len(D_arr)//2500)]),
                "fut_timestamps": [str(t)[:10] for t in fut_t[::fut_step]],
                "fut_D": _to_list(fut_D[::fut_step]),
                "fut_D_upper": _to_list((fut_D + spread_fc)[::fut_step]),
                "fut_D_lower": _to_list((fut_D - spread_fc)[::fut_step]),
                "maintenance_events": maintenance_events,
            },
        },

        # --- Вкладка 4: Аномалії ---
        "anomalies": {
            "kpi": {
                "n_anomalies": n_anomalies,
                "n_critical": n_critical,
                "n_sensor_fail": n_sensor_fail,
                "n_records": len(df),
                "last_anomaly_ts": (
                    str(df[anomaly_mask]["timestamp"].iloc[-1])[:16]
                    if n_anomalies > 0 else None
                ),
            },
            "timeseries": {
                "timestamps": [str(t)[:16] for t in df_an["timestamp"]],
                "moment_kNm": _to_list(df_an["tower_base_moment_kNm"].values),
                "z_moment": _to_list(z_moment.values[::an_step]),
                "z_accel": _to_list(z_accel.values[::an_step]),
                "is_anomaly": anomaly_mask.values[::an_step].tolist(),
            },
            "events": events,
            "z_histogram": {
                "z_values": _to_list(_subsample(z_moment.values, 5000)),
            },
            "hf_waveform": {
                "time": hf["time"][:show_n].tolist(),
                "strain": hf["strain_microstrain"][:show_n].tolist(),
                "accel": hf["accel_ms2"][:show_n].tolist(),
            },
            "fft": {
                "freqs": freqs_fft[freqs_fft <= 5].tolist(),
                "magnitude": fft_mag[freqs_fft <= 5].tolist(),
            },
        },

        # --- Ідентифікаційні дані турбіни ---
        "meta": {
            "turbine_id": turbine_id,
            "n_years": n_years,
            "weibull_c": weibull_c,
            "turbulence": turbulence,
            "seed": seed,
        },
    }


@router.get("/run")
async def run_simulation(
    years: int = Query(default=5, ge=1, le=20, description="Роки симуляції"),
    weibull_c: float = Query(default=8.5, ge=5.0, le=14.0, description="Параметр масштабу Вейбулла [м/с]"),
    turbulence: float = Query(default=0.12, ge=0.06, le=0.20, description="Інтенсивність турбулентності"),
    rul_method: RULMethodLiteral = Query(default="ewma", description="Метод RUL"),
    turbine_id: str = Query(default="WT-001", description="Ідентифікатор турбіни"),
    n_bins: int = Query(default=64, description="Кількість бінів Rainflow"),
    seed: int = Query(default=42, ge=0, le=9999, description="Seed генератора"),
):
    """
    Запустити повну симуляцію для однієї турбіни.
    Повертає всі дані для 5 вкладок дашборду в одному JSON.
    """
    if turbine_id not in ["WT-001", "WT-002", "WT-003", "WT-004"]:
        raise HTTPException(status_code=422, detail=f"turbine_id має бути одним із: WT-001, WT-002, WT-003, WT-004")

    logger.info(f"Симуляція: {turbine_id}, {years} рок(ів), c={weibull_c}, I={turbulence}, метод={rul_method}")

    try:
        result = _run_simulation(
            n_years=years,
            weibull_c=weibull_c,
            turbulence=turbulence,
            turbine_id=turbine_id,
            rul_method=rul_method,
            n_bins=n_bins,
            seed=seed,
        )
        return result
    except Exception as e:
        logger.error(f"Помилка симуляції: {e}")
        raise HTTPException(status_code=500, detail=f"Помилка симуляції: {str(e)}")


@router.get("/fleet")
async def run_fleet_simulation(
    years: int = Query(default=5, ge=1, le=20),
    weibull_c: float = Query(default=8.5, ge=5.0, le=14.0),
    turbulence: float = Query(default=0.12, ge=0.06, le=0.20),
    seed: int = Query(default=42, ge=0, le=9999),
):
    """
    Симуляція всього парку з 4 турбін.
    Повертає скорочені дані — лише те, що потрібно для Tab 5 (Fleet).
    """
    logger.info(f"Симуляція парку: {years} рок(ів), c={weibull_c}, I={turbulence}")

    fleet_result = {}

    for i, tid in enumerate(["WT-001", "WT-002", "WT-003", "WT-004"]):
        tid_c = weibull_c + (i - 1.5) * 0.5
        tid_I = turbulence + i * 0.006
        tid_seed = 42 + i * 7

        n_records = min(years * 365 * 144, 365 * 144)
        wind_model = WeibullWindModel(shape_k=2.1, scale_c=tid_c, turbulence_intensity=tid_I)
        gen = SCADADataGenerator(TurbineParameters(), wind_model, seed=tid_seed)
        df_t = gen.generate_scada(n_records=n_records, add_fault_events=True)

        acc_t = PalmgrenMinerAccumulator(n_bins=32)
        D_t = acc_t.compute_from_moment_series(df_t["tower_base_moment_kNm"].values, 0.35)

        est_t = RULEstimator(D_critical=1.0)
        rul_t = est_t.compute_rul_series(D_t, method="ewma")
        valid_t = rul_t[~np.isnan(rul_t)]

        D_now_t = float(np.clip(D_t[-1], 0, 1))
        RUL_now_t = float(valid_t[-1]) if len(valid_t) else float("nan")

        sf_t = max(1, len(D_t) // 2000)

        rul_norm = min(RUL_now_t / 3650 * 100, 100) if not np.isnan(RUL_now_t) else 0
        p_mean_t = float(df_t["active_power_kw"].mean())
        w_mean_t = float(df_t["wind_speed_mean"].mean())
        radar_vals = [
            (1 - D_now_t) * 100,
            p_mean_t / 2000 * 100,
            min(w_mean_t / 12 * 100, 100),
            rul_norm,
            min(p_mean_t / max(float(df_t["active_power_kw"].max()), 1) * 100, 100),
        ]

        fleet_result[tid] = {
            "D_now": round(D_now_t, 6),
            "RUL_now_days": None if np.isnan(RUL_now_t) else round(RUL_now_t, 1),
            "p_mean": round(p_mean_t, 1),
            "w_mean": round(w_mean_t, 2),
            "alert_level": (
                "GREEN" if D_now_t < 0.3 else
                "YELLOW" if D_now_t < 0.6 else
                "ORANGE" if D_now_t < 0.85 else "RED"
            ),
            "damage_series": {
                "timestamps": [str(t)[:10] for t in df_t["timestamp"].values[::sf_t]],
                "D": _to_list(D_t[::sf_t]),
            },
            "radar": {
                "categories": ["Стан здоров'я", "Потужність", "Вітровий ресурс", "RUL", "Ефективність"],
                "values": [round(v, 1) for v in radar_vals],
            },
        }

    return fleet_result
