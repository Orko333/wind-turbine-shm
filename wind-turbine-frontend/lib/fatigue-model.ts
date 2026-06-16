/**
 * Спільна фізична модель накопичення втоми та прогнозу RUL.
 *
 * Використовується і графіком 20-річного прогнозу пошкодженості (DamageForecast),
 * і графіками прогнозу RUL (деталі турбіни → Огляд / Втома), щоб усі криві були
 * взаємно узгоджені й фізично коректні.
 *
 * Ключові принципи:
 *  - Накопичення D(t) за Пальмгреном–Майнером лінійне ЛИШЕ для стаціонарного
 *    навантаження. Реальний приріст нерівний: міжрічна мінливість вітру +
 *    легке прискорення наприкінці ресурсу (поширення тріщини, зниження 1-ї
 *    власної частоти — та сама фізика, що у штрафах PINN).
 *  - Крива монотонна (як штраф L_mono у PINN), але НЕ ідеальна пряма.
 *  - RUL = час до D = 1.0, оцінений за ЛОКАЛЬНОЮ швидкістю dD/dt → нелінійний,
 *    спадає швидше у вітряні періоди та під кінець ресурсу (не «−1 рік за рік»).
 */

export interface FatigueInput {
  currentDamage: number;     // поточне накопичене пошкодження D ∈ [0,1]
  rulYears: number;          // залишковий ресурс (роки) — еталон прив'язки
  designLifeYears?: number;  // сертифікаційний ресурс (типово 20)
  turbineId?: string;        // для детермінованого «сезонного» зсуву
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

function phaseFromId(id: string): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return (h / 997) * Math.PI * 2;
}

interface Core {
  design: number;
  dNow: number;
  ageYears: number;
  N: number;
  dCurve: (t: number) => number;
}

function buildCore(input: FatigueInput): Core {
  const design = input.designLifeYears && input.designLifeYears > 0 ? input.designLifeYears : 20;
  const dNow = Math.max(0, Math.min(1, input.currentDamage));
  const ageYears = Math.max(0.5, Math.min(design - 0.1, design - Math.max(0, input.rulYears)));
  const phi = phaseFromId(input.turbineId || 'wt');

  // Річний приріст пошкодження = базове прискорення × сезонна мінливість, > 0.
  const incr = (yr: number) => {
    const base = 1 + 0.5 * (yr / design);
    const load = 1 + 0.5 * Math.sin(1.3 * yr + phi) + 0.28 * Math.sin(0.75 * yr + phi * 0.5);
    return base * Math.max(0.2, load);
  };
  const N = design;
  const raw: number[] = [0];
  for (let yr = 1; yr <= N; yr++) raw[yr] = raw[yr - 1] + incr(yr - 0.5);
  const rawAt = (t: number) => {
    const i = Math.max(0, Math.min(N - 1, Math.floor(t)));
    return raw[i] + (raw[i + 1] - raw[i]) * (t - i);
  };
  const rAge = rawAt(ageYears);
  const rEnd = raw[N];
  // Двосегментне масштабування: крива точно проходить через виміряну поточну
  // точку (вік, dNow) і через (проєктний ресурс, 1.0) → RUL узгоджений.
  const dCurve = (t: number) => {
    if (t <= ageYears) return dNow * (rawAt(t) / Math.max(1e-9, rAge));
    return dNow + (1 - dNow) * ((rawAt(t) - rAge) / Math.max(1e-9, rEnd - rAge));
  };
  return { design, dNow, ageYears, N, dCurve };
}

export interface DamagePoint { year: number; d: number; band: [number, number]; }
export interface DamageCurve {
  design: number; dNow: number; ageYears: number; rateNow: number;
  dAtCert: number; yearTo085: number; series: DamagePoint[];
}

/** 20-річна крива накопичення пошкодження D з 90% ДІ. */
export function buildDamageCurve(input: FatigueInput): DamageCurve {
  const { design, dNow, ageYears, N, dCurve } = buildCore(input);
  const series: DamagePoint[] = Array.from({ length: N + 1 }, (_, yr) => {
    const mean = Math.max(0, Math.min(1, dCurve(yr)));
    const horizon = Math.max(0, yr - ageYears);
    const half = 1.645 * 0.055 * Math.sqrt(horizon + 0.5);
    return {
      year: yr,
      d: round3(mean),
      band: [round3(Math.max(0, mean - half)), round3(Math.min(1.12, mean + half))],
    };
  });
  let yearTo085 = Infinity;
  for (let yr = Math.ceil(ageYears); yr <= N; yr++) {
    const a = dCurve(yr - 1), b = dCurve(yr);
    if (b >= 0.85) { yearTo085 = b > a ? (yr - 1) + (0.85 - a) / (b - a) : yr; break; }
  }
  const rateNow = Math.max(0, dCurve(Math.min(N, ageYears + 0.5)) - dCurve(Math.max(0, ageYears - 0.5)));
  return { design, dNow, ageYears, rateNow, dAtCert: dCurve(design), yearTo085, series };
}

export interface RulPoint { year: number; rul: number; upper: number; lower: number; }

/**
 * Нелінійний прогноз RUL: оцінений залишковий ресурс = (1 − D) / локальна dD/dt.
 * Спадає швидше у вітряні роки та під кінець ресурсу (поширення тріщини), а не
 * рівномірно на 1 рік за рік. Прив'язаний так, що RUL(0) = rulYears.
 */
export function buildRulForecast(input: FatigueInput): RulPoint[] {
  const { ageYears, N, dCurve } = buildCore(input);
  const rul0 = Math.max(0, input.rulYears);
  if (rul0 < 0.1) return [{ year: 0, rul: 0, upper: 0, lower: 0 }];

  // RUL = rul0 × (1 − частка вичерпаної залишкової ємності пошкодження).
  // Частка береться напряму з кривої накопичення D(t): оскільки D прискорюється
  // під кінець ресурсу, RUL спадає ШВИДШЕ ближче до відмови (опукла крива), а
  // сезонна мінливість нахилу D переноситься у нерівний нахил RUL. Монотонна за
  // побудовою (D зростає → RUL спадає), без «відскоків» і плато.
  const dNow = dCurve(ageYears);
  const denom = Math.max(1e-6, 1 - dNow);
  const horizon = Math.min(N - ageYears, rul0);
  const steps = Math.max(2, Math.round(horizon)); // річна роздільність (чиста вісь)
  const pts: RulPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const dt = (horizon * i) / steps;
    const consumed = Math.min(1, Math.max(0, (dCurve(ageYears + dt) - dNow) / denom));
    const rul = Math.max(0, rul0 * (1 - consumed));
    const ci = 0.08 * rul + 0.3 * Math.sqrt(dt);
    pts.push({
      year: round2(dt),
      rul: round2(rul),
      upper: round2(Math.min(rul0 * 1.4, rul + ci)),
      lower: round2(Math.max(0, rul - ci)),
    });
  }
  return pts;
}
