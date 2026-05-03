# Система моніторингу структурного стану башти вітрової турбіни

Бакалаврська кваліфікаційна робота — автоматизована система прогнозування пошкоджень та оцінки залишкового ресурсу (RUL) башти вітрової турбіни.

## Що реалізує система

- **Аналіз втоми металу** — алгоритм Rainflow (ASTM E1049-85), S-N криві IIW/Eurocode 3, правило Пальмгрена–Майнера
- **Оцінка RUL** — три методи: лінійна екстраполяція, EWMA, Байєсівський процес Вінера
- **ML-моделі** — XGBoost класифікатор (3 класи пошкодження), XGBoost регресор DEL, двонаправлений LSTM, згортковий автокодер
- **REST API** — FastAPI з документацією Swagger
- **Дашборд** — інтерактивний моніторинг у реальному часі на Streamlit
- **Інтерпретованість** — SHAP-пояснення для кожного прогнозу

---

## Встановлення

### Вимоги
- Python 3.11 або 3.12
- pip

### Встановити залежності

```bash
cd wind_turbine_shm
python -m venv .venv
source .venv/bin/activate        # macOS / Linux
# або
.venv\Scripts\activate           # Windows

pip install -r requirements.txt
```

### Налаштування змінних середовища

```bash
cp .env.example .env
# .env редагувати за потреби (шляхи до моделей, порт тощо)
```

---

## Запуск

### 1. Згенерувати синтетичні дані (якщо відсутні)

```bash
python scripts/generate_data.py
```

Створює `data/synthetic/scada_data.parquet` (~14 MB, 8760 записів) та `data/synthetic/hf_windows.parquet` (~31 MB, 500 вікон сигналів).

### 2. Навчити моделі (якщо відсутні артефакти)

```bash
python scripts/train_models.py
```

Навчає та зберігає до `models/checkpoints/`:
- `classifier.joblib` — класифікатор пошкодження
- `del_regressor.joblib` — регресор DEL
- `lstm_best.pt` — LSTM-предиктор RUL
- `autoencoder_final.pt` — автокодер аномалій
- `scaler.joblib` — нормалізатор ознак

### 3. Запустити API

```bash
uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload
```

API доступний за адресою: `http://localhost:8000`
Swagger UI: `http://localhost:8000/docs`

### 4. Запустити дашборд

В окремому терміналі:

```bash
streamlit run src/dashboard/app.py
```

Дашборд: `http://localhost:8501`

---

## Docker

### Запуск через docker-compose (API + дашборд разом)

```bash
docker-compose up --build
```

| Сервіс | URL |
|--------|-----|
| REST API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| Streamlit дашборд | http://localhost:8501 |

---

## API — ендпоінти

### Перевірка стану

```
GET /health
```

**Відповідь:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "models_loaded": {
    "classifier": true,
    "del_regressor": true,
    "anomaly_detector": true,
    "lstm_predictor": true,
    "rul_estimator": true
  }
}
```

---

### Прогнозування за SCADA-записом

```
POST /predict/scada
```

**Тіло запиту:**
```json
{
  "turbine_id": "WT-001",
  "timestamp": "2024-06-01T12:00:00Z",
  "wind_speed_mean": 9.5,
  "wind_speed_std": 1.2,
  "rotor_speed_rpm": 14.3,
  "pitch_angle_deg": 5.0,
  "active_power_kw": 1850.0,
  "tower_base_moment_kNm": 42500.0,
  "tower_top_accel_rms": 0.35,
  "nacelle_temp_degC": 28.0
}
```

**Відповідь:**
```json
{
  "turbine_id": "WT-001",
  "timestamp": "2024-06-01T12:00:00Z",
  "damage_index": 0.42,
  "damage_class": "Warning",
  "class_probabilities": {"Healthy": 0.15, "Warning": 0.72, "Critical": 0.13},
  "rul_days": 312.5,
  "rul_confidence_lower": 245.0,
  "rul_confidence_upper": 380.0,
  "del_mpa": 18.7,
  "alert_level": "YELLOW",
  "alert_message": "Підвищене пошкодження — запланувати технічний огляд."
}
```

Додати `?explain=true` — отримати SHAP-пояснення у відповіді.

---

### Прогнозування RUL через LSTM

```
POST /predict/lstm-rul
```

Приймає послідовність 24 SCADA-записів і повертає прогноз індексу пошкодження від LSTM-моделі з вагами уваги.

**Тіло запиту:**
```json
{
  "turbine_id": "WT-001",
  "timestamp": "2024-06-01T12:00:00Z",
  "sequence": [
    {
      "wind_speed_mean": 9.5, "wind_speed_std": 1.2,
      "rotor_speed_rpm": 14.3, "pitch_angle_deg": 5.0,
      "active_power_kw": 1850.0, "tower_base_moment_kNm": 42500.0,
      "tower_top_accel_rms": 0.35, "nacelle_temp_degC": 28.0
    }
    // ... 23 ще записи
  ]
}
```

**Відповідь:**
```json
{
  "turbine_id": "WT-001",
  "timestamp": "2024-06-01T12:00:00Z",
  "predicted_damage_index": 0.38,
  "attention_weights": [0.02, 0.03, ..., 0.08],
  "alert_level": "YELLOW",
  "alert_message": "Підвищене пошкодження — запланувати технічний огляд."
}
```

---

### Виявлення аномалій у ВЧ-сигналі

```
POST /predict/hf-signal
```

**Тіло запиту:**
```json
{
  "turbine_id": "WT-001",
  "timestamp": "2024-06-01T12:00:00Z",
  "sampling_rate_hz": 100.0,
  "strain_microstrain": [12.3, 11.8, ...],
  "accel_ms2": [0.35, 0.38, ...]
}
```

---

### Пакетне прогнозування

```
POST /predict/batch
```

Приймає масив до 1000 SCADA-записів, повертає прогноз для кожного.

---

### Турбіни

| Метод | Ендпоінт | Опис |
|-------|----------|------|
| `GET` | `/turbines/` | Список усіх моніторованих турбін |
| `GET` | `/turbines/{id}/status` | Статус конкретної турбіни |
| `POST` | `/turbines/register` | Зареєструвати нову турбіну |
| `DELETE` | `/turbines/{id}/reset` | Скинути накопичене пошкодження |
| `DELETE` | `/turbines/{id}` | Видалити турбіну з реєстру |

---

## Тестування

```bash
pytest tests/ -v
```

З покриттям коду:

```bash
pytest tests/ --cov=src --cov-report=html
# Відкрити htmlcov/index.html у браузері
```

---

## Архітектура ML-моделей

### DamageClassifier (XGBoost)
- **Вхід:** 8 SCADA-ознак
- **Вихід:** 3 класи — Healthy (D < 0.3), Warning (0.3 ≤ D < 0.7), Critical (D ≥ 0.7)
- **Параметри:** 400 дерев, max_depth=6, learning_rate=0.05
- **Артефакт:** `models/checkpoints/classifier.joblib`

### DELRegressor (XGBoost)
- **Вхід:** 8 SCADA-ознак
- **Вихід:** еквівалентне навантаження пошкодження DEL [МПа]
- **Параметри:** 300 дерев, max_depth=5
- **Артефакт:** `models/checkpoints/del_regressor.joblib`

### LSTMPredictor
- **Вхід:** 24 × 8 — послідовність 24 SCADA-вікон (4 год)
- **Вихід:** прогнозований індекс пошкодження наступного кроку
- **Архітектура:** двонаправлений LSTM (2 шари, 128 hidden), механізм часової уваги
- **Артефакти:** `models/checkpoints/lstm_best.pt`, `lstm_final.pt`

### AnomalyDetector (Автокодер)
- **Вхід:** вікно ВЧ-сигналу (1000 відліків)
- **Вихід:** похибка реконструкції (аномальна оцінка)
- **Архітектура:** Conv1d кодер + ConvTranspose1d декодер, латентний простір 32-D
- **Поріг аномалії:** μ + 3σ похибок реконструкції на навчальній вибірці
- **Артефакти:** `models/checkpoints/autoencoder_final.pt`

---

## Структура проекту

```
wind_turbine_shm/
├── src/
│   ├── fatigue/
│   │   ├── rainflow.py        # Алгоритм ASTM E1049-85
│   │   ├── sn_curves.py       # S-N криві IIW / Eurocode 3
│   │   ├── miner.py           # Правило Пальмгрена–Майнера
│   │   └── rul.py             # Оцінювач RUL (3 методи)
│   ├── ml/
│   │   ├── features.py        # Виділення 40+ ознак
│   │   ├── xgboost_model.py   # Класифікатор + регресор
│   │   ├── lstm_model.py      # LSTM з механізмом уваги
│   │   ├── autoencoder.py     # Згортковий автокодер
│   │   └── explainability.py  # SHAP-пояснення
│   ├── data/
│   │   ├── generator.py       # Генератор синтетичних SCADA-даних
│   │   ├── loader.py          # Завантажувач CSV/Parquet
│   │   └── preprocessor.py    # Нормалізація, виявлення викидів
│   ├── api/
│   │   ├── main.py            # FastAPI застосунок
│   │   ├── model_registry.py  # Управління завантаженими моделями
│   │   ├── schemas.py         # Pydantic-схеми
│   │   └── routers/
│   │       ├── prediction.py  # /predict/* ендпоінти
│   │       └── turbine.py     # /turbines/* ендпоінти
│   └── dashboard/
│       └── app.py             # Streamlit-дашборд
├── tests/                     # Модульні тести (pytest)
├── scripts/
│   ├── generate_data.py       # Генерація синтетичних даних
│   └── train_models.py        # Навчання всіх моделей
├── data/synthetic/            # Parquet-файли з даними
├── models/checkpoints/        # Навчені моделі (.joblib, .pt)
├── config.yaml                # Централізована конфігурація
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── pytest.ini
```

---

## Рівні оповіщень

| Рівень | Індекс D | Рекомендація |
|--------|----------|--------------|
| GREEN  | D < 0.3  | Нормальна робота |
| YELLOW | 0.3 ≤ D < 0.6 | Запланувати огляд |
| ORANGE | 0.6 ≤ D < 0.85 | Огляд протягом 30 днів |
| RED    | D ≥ 0.85 | Негайна зупинка |
