"""Інтеграційні тести для REST API на базі FastAPI."""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from src.api.main import app


@pytest_asyncio.fixture
async def client():
    """Асинхронний тестовий клієнт для FastAPI-застосунку."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.mark.anyio
async def test_health_check(client):
    """GET /health повинен повертати 200 зі статусом status='ok'."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "models_loaded" in data
    assert "version" in data


@pytest.mark.anyio
async def test_root_endpoint(client):
    """GET / повинен повертати 200."""
    resp = await client.get("/")
    assert resp.status_code == 200
    assert "message" in resp.json()


@pytest.mark.anyio
async def test_predict_scada_valid(client):
    """POST /predict/scada з коректними даними повинен повертати 200."""
    payload = {
        "turbine_id": "WT-TEST-001",
        "timestamp": "2024-06-15T12:00:00Z",
        "wind_speed_mean": 9.5,
        "wind_speed_std": 1.2,
        "rotor_speed_rpm": 12.5,
        "pitch_angle_deg": 0.0,
        "active_power_kw": 1200.0,
        "tower_base_moment_kNm": 45000.0,
        "tower_top_accel_rms": 0.35,
        "nacelle_temp_degC": 42.0,
    }
    resp = await client.post("/predict/scada", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "damage_index" in data
    assert "damage_class" in data
    assert "alert_level" in data
    assert "class_probabilities" in data
    assert data["turbine_id"] == "WT-TEST-001"
    assert 0.0 <= data["damage_index"] <= 1.0


@pytest.mark.anyio
async def test_predict_scada_invalid_wind(client):
    """POST /predict/scada з від'ємною швидкістю вітру повинен повертати 422."""
    payload = {
        "turbine_id": "WT-TEST-002",
        "timestamp": "2024-06-15T12:00:00Z",
        "wind_speed_mean": -5.0,  # некоректне значення
        "wind_speed_std": 1.0,
        "rotor_speed_rpm": 10.0,
        "pitch_angle_deg": 0.0,
        "active_power_kw": 0.0,
        "tower_base_moment_kNm": 10000.0,
        "tower_top_accel_rms": 0.1,
        "nacelle_temp_degC": 20.0,
    }
    resp = await client.post("/predict/scada", json=payload)
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_turbine_not_found(client):
    """GET /turbines/{id}/status для невідомої турбіни повинен повертати 404."""
    resp = await client.get("/turbines/NONEXISTENT-999/status")
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_turbine_status_after_prediction(client):
    """Після надсилання запису SCADA статус турбіни повинен бути доступний."""
    turbine_id = "WT-STATUS-TEST"
    payload = {
        "turbine_id": turbine_id,
        "timestamp": "2024-06-15T13:00:00Z",
        "wind_speed_mean": 7.0,
        "wind_speed_std": 0.9,
        "rotor_speed_rpm": 10.0,
        "pitch_angle_deg": 0.0,
        "active_power_kw": 800.0,
        "tower_base_moment_kNm": 30000.0,
        "tower_top_accel_rms": 0.2,
        "nacelle_temp_degC": 35.0,
    }
    await client.post("/predict/scada", json=payload)
    resp = await client.get(f"/turbines/{turbine_id}/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["turbine_id"] == turbine_id
    assert "cumulative_damage" in data


@pytest.mark.anyio
async def test_list_turbines(client):
    """GET /turbines/ повинен повертати список."""
    resp = await client.get("/turbines/")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.anyio
async def test_batch_prediction(client):
    """POST /predict/batch повинен повертати по одному результату на запис."""
    records = [
        {
            "turbine_id": f"WT-BATCH-{i:03d}",
            "timestamp": f"2024-06-15T{12+i:02d}:00:00Z",
            "wind_speed_mean": float(5 + i),
            "wind_speed_std": 1.0,
            "rotor_speed_rpm": 10.0,
            "pitch_angle_deg": 0.0,
            "active_power_kw": 500.0 * i,
            "tower_base_moment_kNm": 20000.0,
            "tower_top_accel_rms": 0.15,
            "nacelle_temp_degC": 30.0,
        }
        for i in range(3)
    ]
    resp = await client.post("/predict/batch", json={"records": records})
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) == 3


@pytest.mark.anyio
async def test_predict_with_explain(client):
    """POST /predict/scada?explain=true повинен містити поле shap_explanation."""
    payload = {
        "turbine_id": "WT-EXPLAIN-001",
        "timestamp": "2024-06-15T14:00:00Z",
        "wind_speed_mean": 11.0,
        "wind_speed_std": 2.0,
        "rotor_speed_rpm": 14.0,
        "pitch_angle_deg": 2.0,
        "active_power_kw": 1800.0,
        "tower_base_moment_kNm": 60000.0,
        "tower_top_accel_rms": 0.5,
        "nacelle_temp_degC": 50.0,
    }
    resp = await client.post("/predict/scada?explain=true", json=payload)
    assert resp.status_code == 200
    # shap_explanation може бути None, якщо пояснювач не налаштований, але поле повинне існувати
    assert "shap_explanation" in resp.json()


@pytest.mark.anyio
async def test_hf_signal_anomaly_detection(client):
    """POST /predict/hf-signal повинен повертати 200 з полями виявлення аномалій."""
    n = 200
    rng = __import__("random")
    signal = [rng.gauss(0, 0.1) for _ in range(n)]
    payload = {
        "turbine_id": "WT-HF-001",
        "timestamp": "2024-06-15T16:00:00Z",
        "sampling_rate_hz": 100.0,
        "strain_microstrain": signal,
        "accel_ms2": signal,
    }
    resp = await client.post("/predict/hf-signal", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "anomaly_score" in data
    assert "is_anomaly" in data
    assert "threshold" in data
    assert isinstance(data["is_anomaly"], bool)
    assert data["anomaly_score"] >= 0


@pytest.mark.anyio
async def test_hf_signal_invalid_length(client):
    """POST /predict/hf-signal з різними довжинами сигналів повинен повертати 422."""
    payload = {
        "turbine_id": "WT-HF-002",
        "timestamp": "2024-06-15T16:00:00Z",
        "sampling_rate_hz": 100.0,
        "strain_microstrain": [0.1] * 200,
        "accel_ms2": [0.2] * 150,  # неправильна довжина
    }
    resp = await client.post("/predict/hf-signal", json=payload)
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_damage_class_enum_values(client):
    """damage_class у відповіді повинен бути одним із очікуваних значень переліку."""
    payload = {
        "turbine_id": "WT-ENUM-001",
        "timestamp": "2024-06-15T15:00:00Z",
        "wind_speed_mean": 6.0,
        "wind_speed_std": 0.8,
        "rotor_speed_rpm": 9.0,
        "pitch_angle_deg": 0.0,
        "active_power_kw": 400.0,
        "tower_base_moment_kNm": 15000.0,
        "tower_top_accel_rms": 0.1,
        "nacelle_temp_degC": 25.0,
    }
    resp = await client.post("/predict/scada", json=payload)
    assert resp.status_code == 200
    dc = resp.json()["damage_class"]
    assert dc in ("Healthy", "Warning", "Critical")
