'use client';

import { useEffect, useRef, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Section, StatCell } from '@/components/ui/section';
import { useT } from '@/lib/i18n';

interface SNChartProps {
  data?: {
    bilinear_model: Array<{ stress: number; n_cycles: number }>;
    test_data: Array<{ stress: number; n_cycles: number }>;
  };
  isLoading?: boolean;
}

export function SNChart({ data, isLoading }: SNChartProps) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !data || isLoading) return;

    const plot = async () => {
      try {
        const Plotly = await import('plotly.js/dist/plotly.min.js' as string) as { default?: unknown } & Record<string, unknown>;
        const PlotlyInstance = (Plotly.default ?? Plotly) as { newPlot: Function; purge: Function };

        const bilinear = {
          x: data.bilinear_model.map((p) => Math.log10(p.stress)),
          y: data.bilinear_model.map((p) => Math.log10(p.n_cycles)),
          name: 'Bilinear S-N Model',
          type: 'scatter',
          mode: 'lines',
          line: { color: 'hsl(38, 90%, 58%)', width: 2.5 },
        };

        const testData = {
          x: data.test_data.map((p) => Math.log10(p.stress)),
          y: data.test_data.map((p) => Math.log10(p.n_cycles)),
          name: 'Test Data',
          type: 'scatter',
          mode: 'markers',
          marker: { color: 'hsl(168, 60%, 56%)', size: 7, symbol: 'circle', line: { color: 'hsl(30, 10%, 5%)', width: 1.5 } },
        };

        const layout = {
          xaxis: {
            title: { text: 'log₁₀(Stress) [MPa]', font: { size: 11, color: 'hsl(32, 6%, 50%)' } },
            gridcolor: 'hsl(28, 8%, 14%)', zerolinecolor: 'hsl(28, 8%, 22%)', tickfont: { color: 'hsl(32, 6%, 50%)', size: 10 },
          },
          yaxis: {
            title: { text: 'log₁₀(Cycles to Failure)', font: { size: 11, color: 'hsl(32, 6%, 50%)' } },
            gridcolor: 'hsl(28, 8%, 14%)', zerolinecolor: 'hsl(28, 8%, 22%)', tickfont: { color: 'hsl(32, 6%, 50%)', size: 10 },
          },
          plot_bgcolor: 'transparent',
          paper_bgcolor: 'transparent',
          hovermode: 'closest',
          margin: { l: 60, r: 30, t: 20, b: 50 },
          font: { family: 'var(--font-geist-sans), Inter, sans-serif', size: 11, color: 'hsl(40, 12%, 92%)' },
          legend: {
            x: 0.02, y: 0.98,
            bgcolor: 'hsl(26, 8%, 11%)', bordercolor: 'hsl(28, 8%, 22%)', borderwidth: 1,
            font: { color: 'hsl(40, 12%, 92%)', size: 10 },
          },
        };

        const config = { responsive: true, displayModeBar: false };

        if (containerRef.current) {
          containerRef.current.innerHTML = '';
          PlotlyInstance.newPlot(
            containerRef.current,
            [bilinear as Record<string, unknown>, testData as Record<string, unknown>],
            layout as Record<string, unknown>,
            config as Record<string, unknown>
          );
        }
      } catch (error) {
        console.error('Plotly load error:', error);
      }
    };

    plot();
  }, [data, isLoading]);

  const stats = useMemo(() => {
    if (!data) return { minStress: 0, maxStress: 0, minLife: 0, maxLife: 0 };
    const stresses = [...data.bilinear_model, ...data.test_data].map((p) => p.stress);
    const cycles   = [...data.bilinear_model, ...data.test_data].map((p) => p.n_cycles);
    return {
      minStress: Math.min(...stresses),
      maxStress: Math.max(...stresses),
      minLife:   Math.min(...cycles),
      maxLife:   Math.max(...cycles),
    };
  }, [data]);

  return (
    <Section
      eyebrow={t('fatigue.sn.eyebrow')}
      title={t('fatigue.sn.title')}
      description={t('fatigue.sn.desc')}
    >
      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <div ref={containerRef} className="w-full rounded-md hairline border surface-1" style={{ minHeight: 420 }} />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-5">
            <StatCell label="Min σ" value={stats.minStress.toFixed(0)} unit="MPa" />
            <StatCell label="Max σ" value={stats.maxStress.toFixed(0)} unit="MPa" />
            <StatCell label="Min N" value={stats.minLife.toExponential(1)} />
            <StatCell label="Max N" value={stats.maxLife.toExponential(1)} />
          </div>
        </>
      )}
    </Section>
  );
}
