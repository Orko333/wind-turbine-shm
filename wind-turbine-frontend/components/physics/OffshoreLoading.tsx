'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n';

interface OffshoreLoadingProps {
  data?: {
    wave_height: number;
    current_speed: number;
    water_depth: number;
    total_load: number;
  };
  model?: '2.5MW' | '3.0MW';
  isLoading?: boolean;
}

export function OffshoreLoading({
  data,
  model = '2.5MW',
  isLoading,
}: OffshoreLoadingProps) {
  const t = useT();
  const towerDiameter = 5; // метри

  // Рівняння Морісона: F = Cd * rho * A * u^2 / 2 + Cm * rho * V * du/dt
  const morissonLoads = useMemo(() => {
    const rho_water = 1025; // кг/м³
    const Cd = 1.0; // коефіцієнт лобового опору
    const Cm = 1.0; // коефіцієнт інерції

    const waveHeight = data?.wave_height ?? 2; // метри
    const currentSpeed = data?.current_speed ?? 0.5; // м/с
    const waterDepth = data?.water_depth ?? 30; // метри

    // Орбітальна швидкість хвилі (припускаючи лінійну теорію хвиль)
    const waveFreq = Math.sqrt((9.81 * 2 * Math.PI) / (1.56 * waveHeight ** 2));
    const waveOrbitalVelocity = (waveHeight / 2) * waveFreq; // м/с

    // Загальна швидкість течії (стала + хвильова)
    const totalVelocity = currentSpeed + waveOrbitalVelocity;

    // Площа підводної частини башти (приблизно)
    const submergedHeight = waterDepth;
    const towerArea = towerDiameter * submergedHeight; // м²

    // Сила лобового опору
    const dragForce = (Cd * rho_water * towerArea * totalVelocity ** 2) / 2 / 1000; // кН

    // Інерційна сила (прискорення хвилі)
    const waveAccel = waveFreq ** 2 * (waveHeight / 2) * Math.cos(Math.PI / 4);
    const towerVolume = Math.PI * (towerDiameter / 2) ** 2 * submergedHeight;
    const inertiaForce = (Cm * rho_water * towerVolume * waveAccel) / 1000; // кН

    const totalForce = dragForce + inertiaForce;

    return {
      dragForce: Math.max(0, dragForce),
      inertiaForce: Math.max(0, inertiaForce),
      totalForce: Math.max(0, totalForce),
      waveHeight,
      currentSpeed,
      waterDepth,
      waveOrbitalVelocity,
    };
  }, [data]);

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('physics.offshore_title', { model })}</h3>
          <Skeleton className="h-80 w-full" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold">{t('physics.offshore_title', { model })}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t('physics.offshore_sub')}
          </p>
        </div>

        {/* Візуальна діаграма */}
        <div className="surface-2 rounded-lg p-6">
          <svg viewBox="0 0 400 300" className="w-full h-auto max-h-80">
            {/* Небо — surface-1 darker */}
            <rect width="400" height="120" fill="hsl(28, 9%, 8%)" />

            {/* Вода — surface-2 + subtle teal hint */}
            <defs>
              <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(168, 30%, 14%)" />
                <stop offset="100%" stopColor="hsl(26, 8%, 11%)" />
              </linearGradient>
              <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                <polygon points="0 0, 10 3, 0 6" fill="hsl(38, 90%, 58%)" />
              </marker>
            </defs>
            <rect y="120" width="400" height="180" fill="url(#waterGrad)" />

            {/* Ефект анімації хвилі — teal signal-live */}
            <path
              d="M 0 120 Q 50 110 100 120 T 200 120 T 300 120 T 400 120"
              stroke="hsl(168, 60%, 56%)"
              strokeWidth="1.5"
              strokeOpacity="0.7"
              fill="none"
            />

            {/* Башта — ink-3 */}
            <rect x="175" y="80" width="50" height="200" fill="hsl(32, 6%, 46%)" />

            {/* Ротор — amber primary */}
            <circle cx="200" cy="70" r="25" fill="hsl(38, 90%, 58%)" />
            <circle cx="200" cy="70" r="25" fill="none" stroke="hsl(28, 9%, 8%)" strokeWidth="1" />
            <line x1="175" y1="70" x2="225" y2="70" stroke="hsl(28, 9%, 8%)" strokeWidth="1.5" />

            {/* Лінія глибини води — hairline-strong dashed */}
            <line x1="30" y1="260" x2="370" y2="260" stroke="hsl(28, 8%, 22%)" strokeWidth="1" strokeDasharray="4 4" />
            <text x="10" y="265" fontSize="9" letterSpacing="2" fill="hsl(32, 6%, 46%)" fontFamily="ui-monospace, monospace">
              {(t('physics.seabed') || 'SEABED').toUpperCase()}
            </text>

            {/* Індикатор висоти хвилі — signal-live */}
            <line x1="20" y1="120" x2="20" y2="100" stroke="hsl(168, 60%, 56%)" strokeWidth="1.5" />
            <line x1="15" y1="120" x2="25" y2="120" stroke="hsl(168, 60%, 56%)" strokeWidth="1.5" />
            <line x1="15" y1="100" x2="25" y2="100" stroke="hsl(168, 60%, 56%)" strokeWidth="1.5" />
            <text x="5" y="112" fontSize="10" fill="hsl(168, 60%, 56%)" fontFamily="ui-monospace, monospace">H</text>

            {/* Стрілка течії — amber */}
            <line x1="120" y1="180" x2="280" y2="180" stroke="hsl(38, 90%, 58%)" strokeWidth="2" markerEnd="url(#arrowhead)" />
            <text x="190" y="200" fontSize="9" letterSpacing="2" fill="hsl(38, 90%, 58%)" fontFamily="ui-monospace, monospace">
              {(t('physics.current') || 'CURRENT').toUpperCase()}
            </text>
          </svg>
        </div>

        {/* Розподіл навантажень */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border hairline surface-2">
            <p className="text-sm ink-2 font-medium">{t('physics.wave_drag')}</p>
            <p className="text-2xl font-bold ink-1 mt-2">
              {morissonLoads.dragForce.toFixed(1)} kN
            </p>
            <p className="text-xs signal-live mt-1">{t('physics.wave_drag_desc')}</p>
          </div>

          <div className="p-4 rounded-lg border hairline surface-2">
            <p className="text-sm signal-live font-medium">{t('physics.inertia_force')}</p>
            <p className="text-2xl font-bold ink-1 mt-2">
              {morissonLoads.inertiaForce.toFixed(1)} kN
            </p>
            <p className="text-xs ink-2 mt-1">{t('physics.inertia_desc')}</p>
          </div>

          <div className="p-4 rounded-lg border hairline surface-2">
            <p className="text-sm signal-warn font-medium">{t('physics.total_force')}</p>
            <p className="text-2xl font-bold signal-warn mt-2">
              {morissonLoads.totalForce.toFixed(1)} kN
            </p>
            <p className="text-xs signal-warn mt-1">{t('physics.total_force_desc')}</p>
          </div>
        </div>

        {/* Умови навколишнього середовища */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-muted">
          <div>
            <p className="text-xs text-muted-foreground">{t('physics.wave_height')}</p>
            <p className="text-lg font-semibold">{morissonLoads.waveHeight.toFixed(1)} m</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('physics.current_speed')}</p>
            <p className="text-lg font-semibold">{morissonLoads.currentSpeed.toFixed(2)} m/s</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('physics.water_depth')}</p>
            <p className="text-lg font-semibold">{morissonLoads.waterDepth} m</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('physics.wave_orbital_velocity')}</p>
            <p className="text-lg font-semibold">
              {morissonLoads.waveOrbitalVelocity.toFixed(2)} m/s
            </p>
          </div>
        </div>

        {/* Інформація */}
        <div className="p-4 rounded-lg surface-2 hairline border border-l-2" style={{ borderLeftColor: 'hsl(var(--signal-live))' }}>
          <p className="text-sm ink-2">
            {t('physics.morison_info')}
          </p>
        </div>
      </div>
    </Card>
  );
}
