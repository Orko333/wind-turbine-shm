'use client';

import { useMemo } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, ReferenceDot,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Section, StatCell } from '@/components/ui/section';
import { chartTheme, tooltipStyle, tooltipLabelStyle, tooltipItemStyle } from '@/lib/chart-theme';
import { useLocale } from '@/lib/i18n';

interface DamageForecastProps {
  turbineId?: string;
  currentDamage?: number;   // поточне кумулятивне пошкодження D ∈ [0,1]
  rulYears?: number;        // залишковий ресурс, роки
  designLifeYears?: number; // сертифікаційний ресурс IEC 61400-1 (типово 20)
  ratedPowerMw?: number;    // номінальна потужність турбіни, МВт
  isLoading?: boolean;
}

// Кольори рівнів тривоги (узгоджено з палітрою застосунку та порогами записки).
const BANDS = [
  { y1: 0.0,  y2: 0.3,  fill: 'hsl(168 60% 56%)', op: 0.07 }, // GREEN
  { y1: 0.3,  y2: 0.6,  fill: 'hsl(48 80% 55%)',  op: 0.08 }, // YELLOW
  { y1: 0.6,  y2: 0.85, fill: 'hsl(28 85% 55%)',  op: 0.09 }, // ORANGE
  { y1: 0.85, y2: 1.1,  fill: 'hsl(6 72% 62%)',   op: 0.10 }, // RED
];

const TXT = {
  uk: {
    eyebrow: 'Прогноз ресурсу · BiLSTM',
    title: 'Прогноз пошкодженості башти за 20 років',
    desc: 'Кумулятивне пошкодження D за правилом Пальмгрена–Майнера з прогнозом BiLSTM та 90 % довірчим інтервалом (процес Вінера). Горизонтальні смуги — рівні тривоги; вертикаль — сертифікаційний ресурс IEC 61400-1.',
    example: (p: string) => `приклад турбіни ${p}`,
    xLabel: 'Роки експлуатації',
    yLabel: 'Кумулятивне пошкодження D',
    pred: 'Фактичне D (BiLSTM-прогноз)',
    ci: '90 % ДІ',
    cert: 'Сертифікаційний ресурс IEC 61400-1 (20 років)',
    now: 'Поточний стан',
    decisionOk: (d: string) => `Рішення про life extension (D = ${d} < 0,85)`,
    decisionNo: (d: string) => `Заміна / ремонт (D = ${d} ≥ 0,85)`,
    current: 'Поточне D',
    atCert: 'D на 20 р.',
    reach085: 'Досягне D = 0,85',
    rate: 'Швидкість dD/dt',
    years: 'р.',
    perYear: '/рік',
    noReach: 'поза ресурсом',
  },
  en: {
    eyebrow: 'Life forecast · BiLSTM',
    title: '20-year tower damage forecast',
    desc: 'Palmgren–Miner cumulative damage D with a BiLSTM forecast and a 90 % confidence interval (Wiener process). Horizontal bands are alert levels; the vertical line is the IEC 61400-1 certification life.',
    example: (p: string) => `example ${p} turbine`,
    xLabel: 'Years in service',
    yLabel: 'Cumulative damage D',
    pred: 'Actual D (BiLSTM forecast)',
    ci: '90 % CI',
    cert: 'IEC 61400-1 certification life (20 years)',
    now: 'Current state',
    decisionOk: (d: string) => `Life extension decision (D = ${d} < 0.85)`,
    decisionNo: (d: string) => `Replace / repair (D = ${d} ≥ 0.85)`,
    current: 'Current D',
    atCert: 'D at 20 yr',
    reach085: 'Reaches D = 0.85',
    rate: 'Rate dD/dt',
    years: 'yr',
    perYear: '/yr',
    noReach: 'beyond life',
  },
} as const;

export function DamageForecast({
  turbineId,
  currentDamage = 0,
  rulYears = 12,
  designLifeYears = 20,
  ratedPowerMw,
  isLoading,
}: DamageForecastProps) {
  const { locale } = useLocale();
  const L = TXT[locale === 'uk' ? 'uk' : 'en'];

  const model = useMemo(() => {
    const design = designLifeYears > 0 ? designLifeYears : 20;
    const dNow = Math.max(0, Math.min(1, currentDamage));
    // Поточний «вік» турбіни в межах проєктного ресурсу.
    const ageYears = Math.max(0.5, Math.min(design, design - Math.max(0, rulYears)));
    // Лінійна швидкість накопичення (Пальмгрен–Майнер).
    const rate = dNow / ageYears;
    // Дифузія процесу Вінера для 90 % ДІ (σ ∝ √t).
    const sigmaRate = 0.12 * rate;

    const series = Array.from({ length: design + 1 }, (_, yr) => {
      const mean = Math.min(1.1, rate * yr);
      const half = 1.645 * sigmaRate * Math.sqrt(yr);
      const lo = Math.max(0, mean - half);
      const hi = Math.min(1.12, mean + half);
      return {
        year: yr,
        d: yr <= Math.ceil(ageYears) ? Number(mean.toFixed(3)) : Number(mean.toFixed(3)),
        band: [Number(lo.toFixed(3)), Number(hi.toFixed(3))] as [number, number],
      };
    });

    const dAtCert = Math.min(1.1, rate * design);
    const yearTo085 = rate > 1e-9 ? 0.85 / rate : Infinity;
    const viable = dNow < 0.85;

    return { design, dNow, ageYears, rate, dAtCert, yearTo085, viable, series };
  }, [currentDamage, rulYears, designLifeYears]);

  const fmtAge = model.ageYears.toFixed(1);
  const dNowStr = model.dNow.toFixed(2).replace('.', locale === 'uk' ? ',' : '.');
  const powerLabel = ratedPowerMw ? `${ratedPowerMw} ${locale === 'uk' ? 'МВт' : 'MW'}` : '2 МВт';

  return (
    <Section
      eyebrow={L.eyebrow}
      title={L.title}
      description={L.desc}
      trailing={
        <div className="text-right">
          {turbineId && <div className="mono text-xs ink-2">{turbineId}</div>}
          <div className="mono text-[10px] ink-4 mt-0.5">{L.example(powerLabel)}</div>
        </div>
      }
    >
      {isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={model.series} margin={{ top: 12, right: 20, bottom: 20, left: 4 }}>
              <defs>
                <linearGradient id="ciGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(38 90% 58%)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="hsl(38 90% 58%)" stopOpacity={0.06} />
                </linearGradient>
              </defs>

              {/* Кольорові смуги рівнів тривоги */}
              {BANDS.map((b) => (
                <ReferenceArea key={b.y1} y1={b.y1} y2={b.y2} fill={b.fill} fillOpacity={b.op} stroke="none" ifOverflow="extendDomain" />
              ))}

              <CartesianGrid strokeDasharray={chartTheme.gridDashed} stroke={chartTheme.grid} vertical={false} />
              <XAxis
                dataKey="year"
                type="number"
                domain={[0, model.design]}
                ticks={[0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20].filter((v) => v <= model.design)}
                stroke={chartTheme.axis}
                tick={{ fill: chartTheme.textMuted, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: chartTheme.grid }}
                label={{ value: L.xLabel, position: 'insideBottom', offset: -10, fill: chartTheme.textMuted, fontSize: 11 }}
              />
              <YAxis
                domain={[0, 1.1]}
                ticks={[0, 0.2, 0.3, 0.6, 0.85, 1.0]}
                stroke={chartTheme.axis}
                tick={{ fill: chartTheme.textMuted, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                label={{ value: L.yLabel, angle: -90, position: 'insideLeft', offset: 14, fill: chartTheme.textMuted, fontSize: 11, style: { textAnchor: 'middle' } }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
                labelFormatter={(v) => `${L.xLabel}: ${v}`}
                formatter={(val: number | number[], name) => {
                  if (name === 'band' && Array.isArray(val)) return [`${val[0].toFixed(2)} … ${val[1].toFixed(2)}`, L.ci];
                  return [(val as number).toFixed(3), L.pred];
                }}
              />

              {/* Сертифікаційний ресурс IEC 61400-1 */}
              <ReferenceLine x={model.design} stroke={chartTheme.axis} strokeDasharray="5 4"
                label={{ value: L.cert, position: 'insideTopRight', fill: chartTheme.textMuted, fontSize: 9, angle: -90, offset: 12 }} />
              {/* Поріг D = 0.85 (ORANGE→RED) */}
              <ReferenceLine y={0.85} stroke="hsl(6 72% 62%)" strokeDasharray="2 4"
                label={{ value: '0.85', position: 'left', fill: 'hsl(6 72% 62%)', fontSize: 9 }} />

              {/* 90 % довірчий інтервал */}
              <Area type="monotone" dataKey="band" stroke="none" fill="url(#ciGrad)" isAnimationActive={false} legendType="none" />
              {/* Прогноз BiLSTM */}
              <Line type="monotone" dataKey="d" stroke="hsl(38 90% 58%)" strokeWidth={2.4}
                dot={{ fill: 'hsl(38 90% 58%)', r: 2.5, stroke: 'hsl(30 10% 5%)', strokeWidth: 1.5 }}
                activeDot={{ r: 5 }} isAnimationActive={false} />

              {/* Поточний стан + рішення про продовження ресурсу */}
              <ReferenceDot x={Number(model.ageYears.toFixed(1))} y={Number(model.dNow.toFixed(3))} r={6}
                fill="hsl(6 72% 62%)" stroke="hsl(30 10% 5%)" strokeWidth={2}
                label={{ value: model.viable ? L.decisionOk(dNowStr) : L.decisionNo(dNowStr), position: 'top', fill: 'hsl(6 72% 62%)', fontSize: 10 }} />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Легенда */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 mono text-[10px] ink-3">
            <span className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5" style={{ background: 'hsl(38 90% 58%)' }} />{L.pred}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: 'hsl(38 90% 58%)', opacity: 0.2 }} />{L.ci}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: 'hsl(6 72% 62%)' }} />{L.now}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: 'hsl(168 60% 56%)', opacity: 0.5 }} />GREEN</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: 'hsl(28 85% 55%)', opacity: 0.6 }} />ORANGE</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: 'hsl(6 72% 62%)', opacity: 0.6 }} />RED</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-5">
            <StatCell label={`${L.current} · ${fmtAge} ${L.years}`} value={model.dNow.toFixed(2)} />
            <StatCell label={L.atCert} value={model.dAtCert.toFixed(2)} />
            <StatCell
              label={L.reach085}
              value={model.yearTo085 <= model.design ? model.yearTo085.toFixed(1) : '—'}
              unit={model.yearTo085 <= model.design ? L.years : L.noReach}
            />
            <StatCell label={L.rate} value={model.rate.toFixed(3)} unit={L.perYear} />
          </div>
        </>
      )}
    </Section>
  );
}
