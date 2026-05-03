'use client';

import { useEffect, useRef, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n';

interface WakeEffectsProps {
  data?: Array<{
    x: number;
    y: number;
    turbine_id: string;
    wind_speed: number;
  }>;
  windDirection?: number; // градуси (0-360)
  windSpeed?: number; // м/с
  isLoading?: boolean;
}

export function WakeEffects({
  data = [],
  windDirection = 270, // зі заходу (270°)
  windSpeed = 10,
  isLoading,
}: WakeEffectsProps) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Нормалізація напряму вітру для потоку частинок
  const flowAngle = (windDirection * Math.PI) / 180;

  // Генерація стандартних позицій турбін, якщо дані не надано
  const turbines = useMemo(() => {
    if (data && data.length > 0) {
      return data;
    }

    // Генерація сітки 3x3 турбін
    const grid = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        grid.push({
          x: 300 + i * 200,
          y: 150 + j * 150,
          turbine_id: `T${i * 3 + j + 1}`,
          wind_speed: windSpeed * (0.8 + i * 0.05),
        });
      }
    }
    return grid;
  }, [data, windSpeed]);

  useEffect(() => {
    if (!canvasRef.current || isLoading) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Встановлення розміру canvas
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Стан анімації
    let particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
    }> = [];
    let frameCount = 0;

    const animate = () => {
      frameCount++;

      // Очищення canvas
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Малювання фону сітки
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Індикатор напряму вітру
      const centerX = canvas.width / 2;
      const centerY = 30;
      ctx.save();
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`Wind Direction: ${windDirection}°`, centerX, centerY);
      ctx.fillText(`Wind Speed: ${windSpeed.toFixed(1)} m/s`, centerX, centerY + 20);
      ctx.restore();

      // Малювання стрілки напряму вітру
      const arrowStartX = 50;
      const arrowStartY = 50;
      const arrowLength = 40;
      const arrowEndX = arrowStartX + arrowLength * Math.cos(flowAngle);
      const arrowEndY = arrowStartY + arrowLength * Math.sin(flowAngle);

      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(arrowStartX, arrowStartY);
      ctx.lineTo(arrowEndX, arrowEndY);
      ctx.stroke();

      // Наконечник стрілки
      const headlen = 12;
      ctx.beginPath();
      ctx.moveTo(arrowEndX, arrowEndY);
      ctx.lineTo(
        arrowEndX - headlen * Math.cos(flowAngle - Math.PI / 6),
        arrowEndY - headlen * Math.sin(flowAngle - Math.PI / 6)
      );
      ctx.moveTo(arrowEndX, arrowEndY);
      ctx.lineTo(
        arrowEndX - headlen * Math.cos(flowAngle + Math.PI / 6),
        arrowEndY - headlen * Math.sin(flowAngle + Math.PI / 6)
      );
      ctx.stroke();

      // Генерація нових частинок з верхнього лівого кута
      if (frameCount % 3 === 0) {
        const numNewParticles = Math.ceil(windSpeed / 5);
        for (let i = 0; i < numNewParticles; i++) {
          particles.push({
            x: Math.random() * canvas.width,
            y: -10,
            vx: Math.cos(flowAngle) * windSpeed * 2,
            vy: Math.sin(flowAngle) * windSpeed * 2 + Math.random() * 2 - 1,
            life: 1,
          });
        }
      }

      // Оновлення та малювання частинок
      particles = particles.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.01;

        // Малювання частинки
        ctx.globalAlpha = p.life * 0.5;
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        return p.life > 0 && p.x < canvas.width && p.y < canvas.height;
      });

      // Малювання турбін
      turbines.forEach((turbine) => {
        // Коло турбіни
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(turbine.x, turbine.y, 15, 0, Math.PI * 2);
        ctx.fill();

        // Ротор
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(turbine.x, turbine.y, 12, 0, Math.PI * 2);
        ctx.stroke();

        // Лопаті ротора
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2;
        const bladeAngle = (frameCount * 0.05) % Math.PI;
        for (let i = 0; i < 3; i++) {
          const angle = bladeAngle + (i * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.moveTo(turbine.x, turbine.y);
          ctx.lineTo(
            turbine.x + Math.cos(angle) * 10,
            turbine.y + Math.sin(angle) * 10
          );
          ctx.stroke();
        }

        // Дефіцит швидкості вітру (тінь сліду)
        const wakeIntensity = 0.3;
        const wakeRadius = 40;
        const gradient = ctx.createRadialGradient(turbine.x, turbine.y, 0, turbine.x, turbine.y, wakeRadius);
        gradient.addColorStop(0, `rgba(239, 68, 68, ${wakeIntensity * 0.5})`);
        gradient.addColorStop(1, `rgba(239, 68, 68, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(turbine.x, turbine.y, wakeRadius, 0, Math.PI * 2);
        ctx.fill();

        // Підпис
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(turbine.turbine_id, turbine.x, turbine.y + 30);
        ctx.font = '10px Arial';
        ctx.fillStyle = '#64748b';
        ctx.fillText(`${turbine.wind_speed.toFixed(1)} m/s`, turbine.x, turbine.y + 42);
      });

      requestAnimationFrame(animate);
    };

    animate();
  }, [turbines, isLoading, windDirection, windSpeed, flowAngle]);

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('physics.wake_title')}</h3>
          <Skeleton className="h-96 w-full" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">{t('physics.wake_title')}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t('physics.wake_sub')}
          </p>
        </div>

        <div className="border rounded-lg overflow-hidden bg-slate-50">
          <canvas
            ref={canvasRef}
            className="w-full block"
            style={{ minHeight: '400px' }}
          />
        </div>

        {/* Інформація */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg surface-2 border hairline">
            <p className="text-sm font-medium signal-live">{t('physics.green_particles')}</p>
            <p className="text-xs signal-live mt-1">
              {t('physics.green_particles_desc')}
            </p>
          </div>
          <div className="p-4 rounded-lg surface-2 border hairline">
            <p className="text-sm font-medium signal-crit">{t('physics.red_zones')}</p>
            <p className="text-xs signal-crit mt-1">
              {t('physics.red_zones_desc')}
            </p>
          </div>
        </div>

        {/* Статистика втрат від сліду */}
        <div className="p-4 rounded-lg surface-2 border hairline">
          <p className="text-sm font-medium ink-1 mb-3">{t('physics.wake_metrics')}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="text-xs ink-2">{t('physics.wake_loss')}</p>
              <p className="text-lg font-semibold ink-1">5-15%</p>
            </div>
            <div>
              <p className="text-xs ink-2">{t('physics.wake_recovery')}</p>
              <p className="text-lg font-semibold ink-1">7-10 D</p>
            </div>
            <div>
              <p className="text-xs ink-2">{t('physics.turbulence_increase')}</p>
              <p className="text-lg font-semibold ink-1">~50%</p>
            </div>
            <div>
              <p className="text-xs ink-2">{t('physics.optimal_spacing')}</p>
              <p className="text-lg font-semibold ink-1">4-5 D</p>
            </div>
          </div>
        </div>

        {/* Опис */}
        <div className="p-4 rounded-lg bg-slate-100">
          <p className="text-sm text-slate-700">
            {t('physics.wake_info')}
          </p>
        </div>
      </div>
    </Card>
  );
}
