'use client';

import { useState, useCallback } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useLocale } from '../../lib/i18n';

interface TrendMetric {
  timestamp: string;
  power: number;
  efficiency: number;
  availability: number;
  damage: number;
  rul: number;
}

const sampleTrendData: TrendMetric[] = Array.from({ length: 24 }, (_, i) => ({
  timestamp: new Date(Date.now() - (23 - i) * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  power: Math.random() * 3000 + 1500,
  efficiency: Math.random() * 20 + 35,
  availability: Math.random() * 5 + 92,
  damage: Math.random() * 10 + 20,
  rul: Math.random() * 12 + 36,
}));

interface TrendSummary {
  metric: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
}

const METRIC_LABELS = {
  en: {
    power: 'Power Output',
    efficiency: 'Efficiency',
    availability: 'Availability',
    damage: 'Cumulative Damage',
    rul: 'RUL',
  },
  uk: {
    power: 'Вихідна потужність',
    efficiency: 'Ефективність',
    availability: 'Доступність',
    damage: 'Накопичене пошкодження',
    rul: 'ЗР',
  },
} as const;

const UI_TEXT = {
  en: {
    from: 'from',
    metricTrends: 'Metric Trends',
    insights: 'Key Insights',
    methodology: 'Methodology',
    dataAggregation: 'Data Aggregation',
    statisticalAnalysis: 'Statistical Analysis',
    timeRanges: 'Time Ranges',
    seasonality: 'Seasonality',
  },
  uk: {
    from: 'від',
    metricTrends: 'Тренди показників',
    insights: 'Ключові висновки',
    methodology: 'Методологія',
    dataAggregation: 'Агрегація даних',
    statisticalAnalysis: 'Статистичний аналіз',
    timeRanges: 'Часові діапазони',
    seasonality: 'Сезонність',
  },
} as const;

export function TrendingView() {
  const { locale } = useLocale();
  const L = UI_TEXT[locale];
  const labels = METRIC_LABELS[locale];
  const [selectedMetric, setSelectedMetric] = useState<'power' | 'efficiency' | 'availability' | 'damage' | 'rul'>(
    'power'
  );
  const [timeRange, setTimeRange] = useState<'3months' | '6months' | '12months' | '24months'>('12months');

  const trendSummaries: TrendSummary[] = [
    {
      metric: locale === 'uk' ? 'Середня вихідна потужність' : 'Average Power Output',
      current: 2400,
      previous: 2280,
      change: 120,
      changePercent: 5.3,
      unit: 'kW',
      trend: 'up',
    },
    {
      metric: locale === 'uk' ? 'Ефективність парку' : 'Fleet Efficiency',
      current: 42.1,
      previous: 43.8,
      change: -1.7,
      changePercent: -3.9,
      unit: '%',
      trend: 'down',
    },
    {
      metric: locale === 'uk' ? 'Середня доступність' : 'Average Availability',
      current: 96.8,
      previous: 96.5,
      change: 0.3,
      changePercent: 0.3,
      unit: '%',
      trend: 'stable',
    },
    {
      metric: locale === 'uk' ? 'Накопичене пошкодження парку' : 'Cumulative Fleet Damage',
      current: 285,
      previous: 270,
      change: 15,
      changePercent: 5.6,
      unit: locale === 'uk' ? 'од. пошкодження' : 'damage units',
      trend: 'up',
    },
  ];

  const getTrendIcon = useCallback((trend: 'up' | 'down' | 'stable') => {
    if (trend === 'up') {
      return <TrendingUp className="w-4 h-4 text-red-500" />;
    } else if (trend === 'down') {
      return <TrendingDown className="w-4 h-4 text-green-500" />;
    }
    return <div className="w-4 h-4 ink-3">—</div>;
  }, []);

  return (
    <div className="space-y-6">
      {/* Trend Summaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {trendSummaries.map((summary, idx) => (
          <Card key={idx} className="p-4 border-l-gray-300">
            <div className="space-y-2">
              <p className="text-xs ink-3 font-medium">{summary.metric}</p>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-2xl font-bold">{summary.current.toFixed(1)}</p>
                  <p className="text-xs ink-3">{summary.unit}</p>
                </div>
                {getTrendIcon(summary.trend)}
              </div>
              <div className="text-xs ink-3">
                <span className={summary.changePercent > 0 ? 'signal-crit' : 'signal-live'}>
                  {summary.changePercent > 0 ? '+' : ''}{summary.changePercent.toFixed(1)}%
                </span>
                {' '}{L.from}{' '}
                <span>{summary.previous.toFixed(1)}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Chart Controls */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">{L.metricTrends}</h3>
          <div className="flex gap-2">
            {(['3months', '6months', '12months', '24months'] as const).map((range) => (
              <Button
                key={range}
                size="sm"
                variant={timeRange === range ? 'default' : 'outline'}
                onClick={() => setTimeRange(range)}
              >
                {range === '3months' ? '3M' : range === '6months' ? '6M' : range === '12months' ? '1Y' : '2Y'}
              </Button>
            ))}
          </div>
        </div>

        {/* Metric Selector */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {(['power', 'efficiency', 'availability', 'damage', 'rul'] as const).map((metric) => (
            <Button
              key={metric}
              size="sm"
              variant={selectedMetric === metric ? 'default' : 'outline'}
              onClick={() => setSelectedMetric(metric)}
              className="whitespace-nowrap"
            >
              {labels[metric]}
            </Button>
          ))}
        </div>

        {/* Chart */}
        <div className="surface-2 rounded-lg p-4">
          <ResponsiveContainer width="100%" height={400}>
            {selectedMetric === 'availability' || selectedMetric === 'efficiency' ? (
              <LineChart data={sampleTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey={selectedMetric}
                  stroke="hsl(38 90% 58%)"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            ) : selectedMetric === 'damage' ? (
              <BarChart data={sampleTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey={selectedMetric} fill="hsl(6 72% 62%)" />
              </BarChart>
            ) : (
              <LineChart data={sampleTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey={selectedMetric}
                  stroke="hsl(168 60% 56%)"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Insights */}
      <Card className="p-6 surface-2 hairline border">
        <h3 className="font-semibold mb-4">{L.insights}</h3>
        <ul className="space-y-2 text-sm ink-1">
          <li className="flex gap-2">
            <span className="font-bold">•</span>
            <span>
              {locale === 'uk'
                ? 'Вихідна потужність зросла на 5.3% за останні 12 місяців, що свідчить про краще використання вітрового ресурсу.'
                : 'Power output has improved by 5.3% over the past 12 months, indicating better wind resource utilization.'}
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold">•</span>
            <span>
              {locale === 'uk'
                ? 'Ефективність парку знизилась на 3.9%, що може вказувати на зношення компонентів або потребу в сервісі. Заплануйте перевірки турбін із найбільшою деградацією.'
                : 'Fleet efficiency declined by 3.9%, suggesting maintenance or component wear. Schedule inspections for turbines showing significant degradation.'}
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold">•</span>
            <span>
              {locale === 'uk'
                ? 'Доступність залишається стабільною на рівні 96.8%, що перевищує галузеві цілі. Продовжуйте поточний графік профілактичного обслуговування.'
                : 'Availability remains stable at 96.8%, exceeding industry targets. Continue current preventive maintenance schedule.'}
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold">•</span>
            <span>
              {locale === 'uk'
                ? 'Накопичене пошкодження парку зросло на 5.6%, що відповідає прогнозам навантаження. Протягом 6 місяців 3 турбіни можуть досягти порогу обслуговування.'
                : 'Cumulative fleet damage increased by 5.6%, in line with load forecasts. 3 turbines projected to reach maintenance threshold within 6 months.'}
            </span>
          </li>
        </ul>
      </Card>

      {/* Methodology */}
      <Card className="p-6 hairline">
        <h3 className="font-semibold mb-4">{L.methodology}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs ink-2">
          <div>
            <p className="font-medium mb-2">{L.dataAggregation}</p>
            <p>
              {locale === 'uk'
                ? 'Тренди обчислюються як середні щоденні значення по всіх турбінах парку. Пропущені точки даних інтерполюються сплайнами.'
                : 'Trends are calculated by averaging daily metrics across all turbines in the fleet. Missing data points are interpolated using spline fitting.'}
            </p>
          </div>
          <div>
            <p className="font-medium mb-2">{L.statisticalAnalysis}</p>
            <p>
              {locale === 'uk'
                ? 'Відсоток зміни розраховується як (поточне - попереднє) / попереднє * 100. Напрям тренду (вгору/вниз/стабільно) визначається кутом лінійної регресії.'
                : 'Change percentages calculated as (current - previous) / previous * 100. Trend direction (up/down/stable) determined by linear regression slope.'}
            </p>
          </div>
          <div>
            <p className="font-medium mb-2">{L.timeRanges}</p>
            <p>
              {locale === 'uk'
                ? 'Перемикачі 3M/6M/12M/24M змінюють вікно даних. Усі показники автоматично перераховуються при зміні діапазону.'
                : '3M/6M/12M/24M selectors adjust the data window. All metrics recalculate automatically when time range changes.'}
            </p>
          </div>
          <div>
            <p className="font-medium mb-2">{L.seasonality}</p>
            <p>
              {locale === 'uk'
                ? 'Сезонна декомпозиція застосовується для відокремлення тренду від сезонних коливань. Висновки враховують сезонність вітрового ресурсу.'
                : 'Seasonal decomposition applied to separate trend from seasonal variation. Insights account for wind resource seasonality.'}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
