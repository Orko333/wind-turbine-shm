'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { Turbine, TurbineDetail } from '@/types/api';

interface SystemMapProps {
  turbines: (Turbine | TurbineDetail)[];
  isLoading?: boolean;
  center?: { latitude: number; longitude: number };
  zoom?: number;
}

const DARK_STYLE = {
  version: 8 as const,
  sources: {
    carto: {
      type: 'raster' as const,
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
    },
  },
  layers: [{ id: 'carto-dark', type: 'raster' as const, source: 'carto' }],
};

export function SystemMap({
  turbines,
  isLoading,
  center,
  zoom = 6,
}: SystemMapProps) {
  const t = useT();
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const markers = useRef<maplibregl.Marker[]>([]);

  // Known wind farm anchor coordinates for the demo locations. Backend
  // returns turbine.location as a string ("North Field", "South Ridge", …)
  // so we map those to real-world coordinates here. Unknown strings are
  // hashed onto a stable pseudo-position so markers don't jitter on reload.
  const LOCATION_COORDS: Record<string, { lat: number; lng: number }> = {
    'North Field': { lat: 55.86, lng: -3.20 },
    'South Ridge': { lat: 52.97, lng: -2.18 },
    'East Hill':   { lat: 54.10, lng:  0.18 },
    'West Coast':  { lat: 53.42, lng: -4.85 },
  };

  function hashString(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
    return h;
  }

  function locationToCoords(loc: string | null | undefined, turbineId: string): { lat: number; lng: number } {
    if (loc && LOCATION_COORDS[loc]) {
      // Offset multiple turbines at the same site slightly so they don't overlap.
      const offset = (hashString(turbineId) % 100) / 5000;
      const anchor = LOCATION_COORDS[loc];
      return { lat: anchor.lat + offset, lng: anchor.lng + offset };
    }
    // Fallback: deterministic pseudo-coords scattered around the UK
    const h = hashString(loc || turbineId || 'x');
    return {
      lat: 53 + ((h & 0xff) / 255) * 3,           // 53° .. 56°N
      lng: -4 + (((h >> 8) & 0xff) / 255) * 4,    // -4° .. 0°E
    };
  }

  // Center the map on the average of all turbine positions (or fall back
  // to the UK midpoint if we don't have any yet).
  const computedCenter = useMemo(() => {
    if (center) return { lat: center.latitude, lng: center.longitude };
    if (!turbines.length) return { lat: 54.0, lng: -2.5 };
    let sumLat = 0, sumLng = 0, n = 0;
    for (const t of turbines) {
      const loc = ('location' in t ? (t.location as string | null) : null);
      const { lat, lng } = locationToCoords(loc, t.turbine_id);
      sumLat += lat; sumLng += lng; n += 1;
    }
    return { lat: sumLat / n, lng: sumLng / n };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, turbines]);
  const lat = computedCenter.lat;
  const lng = computedCenter.lng;

  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: DARK_STYLE,
        center: [lng, lat],
        zoom,
      });
      map.current.on('load', () => setMapLoaded(true));
    } catch (e) {
      console.error('Map init failed:', e);
    }
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [lat, lng, zoom]);

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
      const rawLoc = 'location' in t ? t.location : null;
      const isCoord = rawLoc && typeof rawLoc === 'object' && 'latitude' in rawLoc && 'longitude' in rawLoc;
      let latitude: number;
      let longitude: number;
      if (isCoord) {
        latitude = (rawLoc as { latitude: number; longitude: number }).latitude;
        longitude = (rawLoc as { latitude: number; longitude: number }).longitude;
      } else {
        const coords = locationToCoords(typeof rawLoc === 'string' ? rawLoc : null, t.turbine_id);
        latitude = coords.lat;
        longitude = coords.lng;
      }
      if (!isFinite(latitude) || !isFinite(longitude)) return;

      const c = colors[t.status as keyof typeof colors] ?? colors.offline;

      const el = document.createElement('div');
      el.className = 'cursor-pointer relative';
      el.style.width = '16px';
      el.style.height = '16px';
      el.style.borderRadius = '9999px';
      el.style.background = c;
      el.style.border = '2px solid hsl(30 10% 5%)';
      el.style.boxShadow = `0 0 0 1px ${c}, 0 0 18px ${c}`;
      el.title = t.turbine_id;

      new maplibregl.Marker(el)
        .setLngLat([longitude, latitude])
        .addTo(map.current!);

      el.addEventListener('click', () => router.push(`/turbines/${t.turbine_id}`));
    });
  }, [turbines, mapLoaded, router]);

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
