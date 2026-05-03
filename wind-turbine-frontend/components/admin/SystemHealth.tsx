'use client';

import { useState, useCallback } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { AlertCircle, CheckCircle, Activity, AlertTriangle, RefreshCw } from 'lucide-react';

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latency: number;
  uptime: number;
  lastChecked: string;
}

interface PerformanceMetric {
  timestamp: string;
  cpu: number;
  memory: number;
  database: number;
  api: number;
}

const samplePerformance: PerformanceMetric[] = Array.from({ length: 24 }, (_, i) => ({
  timestamp: new Date(Date.now() - (23 - i) * 60 * 60 * 1000).toISOString().slice(11, 16),
  cpu: Math.random() * 40 + 20,
  memory: Math.random() * 30 + 40,
  database: Math.random() * 15 + 10,
  api: Math.random() * 20 + 50,
}));

export function SystemHealth() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [services, setServices] = useState<ServiceStatus[]>([
    {
      name: 'Сервер API',
      status: 'healthy',
      latency: 45,
      uptime: 99.98,
      lastChecked: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    },
    {
      name: 'База даних',
      status: 'healthy',
      latency: 12,
      uptime: 99.99,
      lastChecked: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
    },
    {
      name: 'WebSocket сервер',
      status: 'healthy',
      latency: 8,
      uptime: 99.95,
      lastChecked: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    },
    {
      name: 'Кеш-сервер',
      status: 'healthy',
      latency: 2,
      uptime: 99.9,
      lastChecked: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    },
    {
      name: 'Сервіс електронної пошти',
      status: 'degraded',
      latency: 2500,
      uptime: 95.4,
      lastChecked: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    },
  ]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    // Симуляція оновлення
    setTimeout(() => {
      setServices((prev) =>
        prev.map((service) => ({
          ...service,
          lastChecked: new Date().toISOString(),
        }))
      );
      setIsRefreshing(false);
    }, 1000);
  }, []);

  const getStatusIcon = useCallback((status: string) => {
    if (status === 'healthy') {
      return <CheckCircle className="w-5 h-5 signal-live" />;
    } else if (status === 'degraded') {
      return <AlertTriangle className="w-5 h-5 signal-warn" />;
    }
    return <AlertCircle className="w-5 h-5 signal-crit" />;
  }, []);

  const getStatusColor = useCallback((status: string) => {
    if (status === 'healthy') {
      return 'surface-2 hairline border';
    } else if (status === 'degraded') {
      return 'surface-2 hairline border';
    }
    return 'surface-2 hairline border';
  }, []);

  const getUptimeBadgeColor = useCallback((uptime: number) => {
    if (uptime >= 99.9) return 'surface-3 signal-live';
    if (uptime >= 99) return 'surface-3 signal-warn';
    return 'surface-3 signal-crit';
  }, []);

  const formatTime = useCallback((date: string) => {
    return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }, []);

  const healthScore = useCallback(
    () => {
      const average = services.reduce((sum, s) => sum + s.uptime, 0) / services.length;
      return average.toFixed(2);
    },
    [services]
  );

  return (
    <div className="space-y-6">
      {/* Загальний стан */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6 surface-2 hairline">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium signal-live mb-2">Загальний індекс здоров'я</p>
              <p className="text-3xl font-bold ink-1">{healthScore()}%</p>
              <p className="text-xs ink-2 mt-2">На основі всіх сервісів</p>
            </div>
            <Activity className="w-8 h-8 text-blue-400" />
          </div>
        </Card>

        <Card className="p-6 surface-2 hairline border">
          <p className="text-sm font-medium signal-live mb-2">Працюючі сервіси</p>
          <p className="text-3xl font-bold signal-live">
            {services.filter((s) => s.status === 'healthy').length}
          </p>
          <p className="text-xs signal-live mt-2">із {services.length} загалом</p>
        </Card>

        <Card className="p-6 surface-2 hairline border">
          <p className="text-sm font-medium signal-warn mb-2">Деградовані сервіси</p>
          <p className="text-3xl font-bold signal-warn">
            {services.filter((s) => s.status === 'degraded').length}
          </p>
          <p className="text-xs signal-warn mt-2">Потребують уваги</p>
        </Card>

        <Card className="p-6 surface-2 hairline border">
          <p className="text-sm font-medium signal-crit mb-2">Недоступні сервіси</p>
          <p className="text-3xl font-bold signal-crit">
            {services.filter((s) => s.status === 'down').length}
          </p>
          <p className="text-xs signal-crit mt-2">Потребують негайного втручання</p>
        </Card>
      </div>

      {/* Статус сервісів */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Статус сервісів</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Перевірка...' : 'Перевірити зараз'}
          </Button>
        </div>

        <div className="space-y-4">
          {services.map((service, idx) => (
            <Card
              key={idx}
              className={`p-4 border-l-blue-500 ${getStatusColor(service.status)}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {getStatusIcon(service.status)}
                  <div>
                    <p className="font-semibold">{service.name}</p>
                    <p className="text-xs ink-3">Остання перевірка: {formatTime(service.lastChecked)}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${getUptimeBadgeColor(service.uptime)}`}>
                  {service.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs ink-3 mb-1">Час відгуку</p>
                  <p className="text-lg font-semibold">{service.latency} ms</p>
                </div>
                <div>
                  <p className="text-xs ink-3 mb-1">Доступність (30д)</p>
                  <p className="text-lg font-semibold">{service.uptime.toFixed(2)}%</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Card>

      {/* Тренди продуктивності */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-6">Тренди продуктивності (24 години)</h3>

        <div className="surface-2 rounded-lg p-4">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={samplePerformance}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="cpu"
                stroke="hsl(6 72% 62%)"
                name="CPU %"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="memory"
                stroke="hsl(38 90% 58%)"
                name="Пам'ять %"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="database"
                stroke="hsl(168 60% 56%)"
                name="Відп. БД (ms)"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Використання ресурсів */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h4 className="font-semibold mb-4">Поточне використання ресурсів</h4>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Процесор</span>
                <span className="text-sm font-bold ink-1">34%</span>
              </div>
              <div className="h-2 surface-3 rounded-full overflow-hidden">
                <div className="h-full surface-20" style={{ width: '34%' }} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Пам'ять</span>
                <span className="text-sm font-bold ink-1">62%</span>
              </div>
              <div className="h-2 surface-3 rounded-full overflow-hidden">
                <div className="h-full surface-20" style={{ width: '62%' }} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Диск</span>
                <span className="text-sm font-bold ink-1">45%</span>
              </div>
              <div className="h-2 surface-3 rounded-full overflow-hidden">
                <div className="h-full surface-20" style={{ width: '45%' }} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Мережа</span>
                <span className="text-sm font-bold ink-1">28%</span>
              </div>
              <div className="h-2 surface-3 rounded-full overflow-hidden">
                <div className="h-full surface-20" style={{ width: '28%' }} />
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6 surface-2 hairline border">
          <h4 className="font-semibold mb-4">Системні сповіщення</h4>
          <div className="space-y-3">
            <div className="flex gap-3 p-3 surface-3 border hairline rounded">
              <AlertTriangle className="w-5 h-5 signal-warn flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm signal-warn">Деградація сервісу електронної пошти</p>
                <p className="text-xs signal-warn mt-1">Час відгуку зріс до 2.5с. Виясняємо разом з провайдером.</p>
              </div>
            </div>

            <div className="flex gap-3 p-3 surface-3 border hairline rounded">
              <CheckCircle className="w-5 h-5 signal-live flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm signal-live">Всі критичні сервіси працюють</p>
                <p className="text-xs signal-live mt-1">API, база даних та WebSocket-сервер працюють нормально.</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Інформація */}
      <Card className="p-6 bg-muted/50">
        <h3 className="font-semibold mb-4">Моніторинг стану системи</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Індекс здоров'я:</strong> Розраховується як середня доступність всіх сервісів.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Автооновлення:</strong> Статус сервісів перевіряється автоматично кожні 5 хвилин.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Сповіщення:</strong> Надсилаються повідомлення при деградації або відмові сервісів.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span><strong>Відстеження продуктивності:</strong> 30-денна історія використання ресурсів та затримок.</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
