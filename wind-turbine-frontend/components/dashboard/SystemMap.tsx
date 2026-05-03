'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { Turbine, TurbineDetail } from '@/types/api';

interface SystemMapProps {
  turbines: (Turbine | TurbineDetail)[];
  isLoading?: boolean;
  center?: { latitude: number; longitude: number };
  zoom?: number;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export function SystemMap({
  turbines,
  isLoading,
  center = { latitude: 51.5074, longitude: -0.1278 },
  zoom = 6,
}: SystemMapProps) {
  const t = useT();
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const markers = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainer.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [center.longitude, center.latitude],
        zoom,
      });
      map.current.on('load', () => setMapLoaded(true));
    } catch (e) {
      console.error('Map init failed:', e);
    }
    return () => { map.current?.remove(); };
  }, [center, zoom]);

  useEffect(() => {
    if (!map.current || !mapLoaded || !turbines.length) return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];

    const colors: Record<string, string> = {
      healthy:  'hsl(168 60% 56%)',
      warning:  'hsl(38 90% 58%)',
      critical: 'hsl(6 72% 62%)',
      offline:  'hsl(28 5% 30%)',
    };

    turbines.forEach((t) => {
      const loc = 'location' in t ? t.location : null;
      const { latitude, longitude } = loc || {
        latitude: 51.5074 + Math.random() * 2 - 1,
        longitude: -0.1278 + Math.random() * 2 - 1,
      };

      const c = colors[t.status as keyof typeof colors] ?? colors.offline;

      const el = document.createElement('div');
      el.className = 'cursor-pointer relative';
      el.style.width = '12px';
      el.style.height = '12px';
      el.style.borderRadius = '9999px';
      el.style.background = c;
      el.style.boxShadow = `0 0 0 2px hsl(30 10% 5%), 0 0 12px ${c}`;

      new mapboxgl.Marker(el)
        .setLngLat([longitude, latitude])
        .addTo(map.current!);

      el.addEventListener('click', () => router.push(`/turbines/${t.turbine_id}`));
    });
  }, [turbines, mapLoaded, router]);

  if (!MAPBOX_TOKEN) {
    return (
      <section>
        <header className="flex items-end justify-between pb-4 hairline-b">
          <div>
            <p className="eyebrow">{t('dashboard.map.eyebrow')}</p>
            <h3 className="display text-2xl ink-1 mt-1">{t('dashboard.map.title')}</h3>
          </div>
        </header>
        <div className="h-72 flex flex-col items-center justify-center surface-1 hairline border rounded-lg">
          <p className="mono text-[11px] tracking-widest ink-3">{t('dashboard.map.no_token')}</p>
          <p className="text-xs ink-4 mt-2">{t('dashboard.map.no_token_desc')}</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <header className="flex items-end justify-between pb-4 hairline-b">
        <div>
          <p className="eyebrow">{t('dashboard.map.eyebrow')}</p>
          <h3 className="display text-2xl ink-1 mt-1">{t('dashboard.map.title')}</h3>
        </div>
        <div className="flex items-center gap-3 mono text-[10px] tracking-widest">
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-live" /> <span className="ink-3">{t('status.ok')}</span></span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-warn" /> <span className="ink-3">{t('status.warn')}</span></span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-crit" /> <span className="ink-3">{t('status.crit')}</span></span>
        </div>
      </header>

      {isLoading ? (
        <Skeleton className={cn('h-80 w-full rounded-lg')} />
      ) : (
        <div ref={mapContainer} className="h-80 rounded-lg overflow-hidden hairline border" />
      )}
    </section>
  );
}
