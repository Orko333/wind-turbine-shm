'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useTurbineData } from '@/hooks/useTurbineData';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { useT } from '@/lib/i18n';

export default function VisualizationPage() {
  const t = useT();
  const params = useParams();
  const turbineId = params.id as string;
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const towerRef = useRef<THREE.Mesh | null>(null);
  const rotorRef = useRef<THREE.Group | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const animationStateRef = useRef({ isAnimating: true, rotationSpeed: 0.02 });

  const { turbine, isLoading } = useTurbineData({
    turbineId,
    enabled: Boolean(turbineId),
  });

  useEffect(() => {
    if (!mountRef.current || !turbine || isLoading) return;

    const mountElement = mountRef.current;

    // Scene setup
    const width = mountElement.clientWidth;
    const height = mountElement.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(50, 40, 50);
    camera.lookAt(0, 20, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;
    mountElement.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 50);
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Tower (cylinder with stress coloring)
    const towerGeometry = new THREE.CylinderGeometry(3, 3.5, 40, 32);
    const towerMaterial = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.4,
      roughness: 0.6,
    });
    const tower = new THREE.Mesh(towerGeometry, towerMaterial);
    tower.position.y = 20;
    tower.castShadow = true;
    tower.receiveShadow = true;
    towerRef.current = tower;
    scene.add(tower);

    // Apply stress coloring to tower (gradient from base to top)
    const positionAttribute = towerGeometry.getAttribute('position');
    const colors: number[] = [];
    const color = new THREE.Color();
    const maxHeight = 40;

    for (let i = 0; i < positionAttribute.count; i++) {
      const y = (positionAttribute.getY(i) / maxHeight + 0.5) * 255;
      const stress = Math.min(255, y * 1.5);
      color.setHSL(0.1 - (stress / 255) * 0.1, 0.8, 0.5);
      colors.push(color.r, color.g, color.b);
    }
    towerGeometry.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(colors), 3, true));
    towerMaterial.vertexColors = true;

    // Nacelle (box on top)
    const nacelleGeometry = new THREE.BoxGeometry(8, 4, 6);
    const nacelleMaterial = new THREE.MeshStandardMaterial({
      color: 0xfafafa,
      metalness: 0.3,
      roughness: 0.7,
    });
    const nacelle = new THREE.Mesh(nacelleGeometry, nacelleMaterial);
    nacelle.position.y = 42;
    nacelle.castShadow = true;
    nacelle.receiveShadow = true;
    scene.add(nacelle);

    // Rotor (hub + blades)
    const rotorGroup = new THREE.Group();
    rotorRef.current = rotorGroup;
    nacelle.add(rotorGroup);
    rotorGroup.position.x = 6;
    rotorGroup.position.y = 0;

    // Hub
    const hubGeometry = new THREE.SphereGeometry(2, 32, 32);
    const hubMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.6,
      roughness: 0.4,
    });
    const hub = new THREE.Mesh(hubGeometry, hubMaterial);
    hub.castShadow = true;
    hub.receiveShadow = true;
    rotorGroup.add(hub);

    // Створити blades
    const createBlade = (rotationZ: number) => {
      const bladeGeometry = new THREE.BoxGeometry(2, 25, 1);
      const bladeMaterial = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        metalness: 0.2,
        roughness: 0.8,
      });
      const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
      blade.position.y = 12.5;
      blade.castShadow = true;
      blade.receiveShadow = true;

      const bladeGroup = new THREE.Group();
      bladeGroup.add(blade);
      bladeGroup.rotation.z = rotationZ;
      return bladeGroup;
    };

    const blade1 = createBlade(0);
    const blade2 = createBlade((Math.PI * 2) / 3);
    const blade3 = createBlade((Math.PI * 4) / 3);

    rotorGroup.add(blade1);
    rotorGroup.add(blade2);
    rotorGroup.add(blade3);

    // Ground plane
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0xbfdbfe,
      roughness: 0.8,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);

    // Mouse controls
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;

        camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), deltaX * 0.01);
        camera.position.applyAxisAngle(
          camera.getWorldDirection(new THREE.Vector3()).cross(new THREE.Vector3(0, 1, 0)),
          deltaY * 0.01
        );
        camera.lookAt(0, 20, 0);

        previousMousePosition = { x: e.clientX, y: e.clientY };
      }
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const direction = camera.position.clone().normalize();
      const distance = camera.position.length();
      const newDistance = distance + e.deltaY * 0.1;
      camera.position.copy(direction.multiplyScalar(Math.max(10, Math.min(200, newDistance))));
      camera.lookAt(0, 20, 0);
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    // Animation loop
    const animate = () => {
      if (animationStateRef.current.isAnimating && rotorRef.current) {
        rotorRef.current.rotation.x += animationStateRef.current.rotationSpeed;
      }
      renderer.render(scene, camera);
      animationIdRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Обробити resize
    const handleResize = () => {
      const newWidth = mountRef.current?.clientWidth || width;
      const newHeight = mountRef.current?.clientHeight || height;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (mountElement?.contains(renderer.domElement)) {
        mountElement.removeChild(renderer.domElement);
      }
      renderer.dispose();
      towerGeometry.dispose();
      towerMaterial.dispose();
      nacelleGeometry.dispose();
      nacelleMaterial.dispose();
      hubGeometry.dispose();
      hubMaterial.dispose();
      groundGeometry.dispose();
      groundMaterial.dispose();
    };
  }, [turbine, isLoading]);

  const toggleAnimation = () => {
    animationStateRef.current.isAnimating = !animationStateRef.current.isAnimating;
  };

  const resetView = () => {
    if (rendererRef.current) {
      const camera = new THREE.PerspectiveCamera(
        75,
        rendererRef.current.domElement.clientWidth / rendererRef.current.domElement.clientHeight,
        0.1,
        1000
      );
      camera.position.set(50, 40, 50);
      camera.lookAt(0, 20, 0);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!turbine) {
    return (
      <div className="rounded-lg surface-2 border hairline p-6">
        <p className="signal-crit">{t('turbines.not_found')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Button
            size="sm"
            variant="outline"
            onClick={toggleAnimation}
            className="gap-2"
          >
            {animationStateRef.current.isAnimating ? (
              <>
                <Pause className="w-4 h-4" />
                {t('turbines.pause_animation')}
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                {t('turbines.play_animation')}
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={resetView}
            className="gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            {t('turbines.reset_view')}
          </Button>
          <span className="text-sm text-muted-foreground ml-auto">
            {t('turbines.controls_hint')}
          </span>
        </div>
        <div
          ref={mountRef}
          className="w-full bg-slate-50 rounded-lg overflow-hidden"
          style={{ minHeight: '600px' }}
        />
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">{t('turbines.model_info_3d')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{t('turbines.tower_height')}</p>
            <p className="text-lg font-semibold mt-1">{turbine.tower_height} m</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('turbines.rotor_diameter')}</p>
            <p className="text-lg font-semibold mt-1">{turbine.rotor_diameter} m</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('turbines.rated_power')}</p>
            <p className="text-lg font-semibold mt-1">{turbine.rated_power_kw} {t('common.kw')}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          {t('turbines.model_3d_desc')}
        </p>
      </Card>
    </div>
  );
}
