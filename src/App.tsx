import React, { useState, useEffect, useCallback, useRef, Suspense, useMemo } from 'react';
import { WorkerControl } from "./components/WorkerControl";
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Hammer, 
  Columns, 
  Square as WallIcon, 
  Trophy, 
  Zap, 
  AlertTriangle, 
  RotateCw, 
  Users, 
  Pickaxe, 
  Truck, 
  HardHat,
  ChevronUp,
  ChevronDown,
  Package,
  ArrowRight
} from 'lucide-react';
import * as THREE from 'three';
import { PerspectiveCamera, OrbitControls, Environment, Float, ContactShadows } from '@react-three/drei';

// --- Constants ---
const FLOOR_HEIGHT = 2.4;
const PILLAR_RADIUS = 0.15;
const PILLAR_HEIGHT = 2.2;
const TOWER_RADIUS = 3;
const WALL_THICKNESS = 0.25;

const REBAR_POSITIONS_OUTER = Array.from({ length: 12 }).map((_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const x = Math.cos(angle) * (TOWER_RADIUS - 0.5);
  const z = Math.sin(angle) * (TOWER_RADIUS - 0.5);
  return [x, 0, z] as [number, number, number];
});

const REBAR_POSITIONS_INNER = Array.from({ length: 8 }).map((_, i) => {
  const angle = (i / 8) * Math.PI * 2;
  const x = Math.cos(angle) * (TOWER_RADIUS / 2);
  const z = Math.sin(angle) * (TOWER_RADIUS / 2);
  return [x, 0, z] as [number, number, number];
});

const PILLAR_OFFSET = TOWER_RADIUS - (WALL_THICKNESS / 2);
const PILLAR_POSITIONS: [number, number, number][] = [
  [PILLAR_OFFSET, 0.2, 0],
  [-PILLAR_OFFSET, 0.2, 0],
  [0, 0.2, PILLAR_OFFSET],
  [0, 0.2, -PILLAR_OFFSET],
];

const FOUNDATION_SEGMENTS = 12;
const FOUNDATION_INDICES = Array.from({ length: FOUNDATION_SEGMENTS }).map((_, i) => i);

const COSTS = {
  FLOOR: 10,
  PILLARS: 15,
  WALLS: 25
};

const BASE_SPEED = 0.5;
const TOTAL_WORKERS = 12;

type BuildStage = 'NONE' | 'FLOOR' | 'PILLARS' | 'WALLS';

interface FloorData {
  id: number;
  stage: BuildStage;
  isPerfect: boolean;
  timestamp: number;
  isLanded: boolean; // Track if the floor has finished its drop animation
}

// --- 3D Components ---

function DustParticles({ active, position }: { active: boolean, position: [number, number, number] }) {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 40;
  
  const [positions, velocities] = React.useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * TOWER_RADIUS;
      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = Math.random() * 2;
      pos[i * 3 + 2] = Math.sin(angle) * radius;
      
      vel[i * 3] = (Math.random() - 0.5) * 0.02;
      vel[i * 3 + 1] = Math.random() * 0.05;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
    }
    return [pos, vel];
  }, []);

  useFrame((state) => {
    if (!pointsRef.current || !active) return;
    const attr = pointsRef.current.geometry.attributes.position;
    for (let i = 0; i < count; i++) {
      attr.array[i * 3] += velocities[i * 3];
      attr.array[i * 3 + 1] += velocities[i * 3 + 1];
      attr.array[i * 3 + 2] += velocities[i * 3 + 2];

      if (attr.array[i * 3 + 1] > 3) {
        attr.array[i * 3 + 1] = 0;
      }
    }
    attr.needsUpdate = true;
    pointsRef.current.rotation.y += 0.01;
  });

  if (!active) return null;

  return (
    <points ref={pointsRef} position={position}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial 
        size={0.15} 
        color="#8c857b" 
        transparent 
        opacity={0.4} 
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

const Pillar = React.memo(function Pillar({ position, active, progress = 1 }: { position: [number, number, number], active: boolean, progress?: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => new THREE.CylinderGeometry(0.3, 0.3, PILLAR_HEIGHT, 32), []);

  useFrame(() => {
    if (meshRef.current) {
      const targetScale = active ? progress : 0;
      meshRef.current.scale.y = THREE.MathUtils.lerp(meshRef.current.scale.y, targetScale, 0.1);
      // Position Y relative to the pillar base offset (0.2)
      meshRef.current.position.y = position[1] + (meshRef.current.scale.y * PILLAR_HEIGHT) / 2;
    }
  });

  return (
    <mesh ref={meshRef} position={position} scale={[1, 0, 1]} castShadow receiveShadow geometry={geometry}>
      <meshStandardMaterial 
        color="#3d352e" 
        metalness={0.2} 
        roughness={0.8}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </mesh>
  );
});

const WallSegment = React.memo(function WallSegment({ rotation, active, progress = 1 }: { rotation: number, active: boolean, progress?: number }) {
  const groupRef = useRef<THREE.Group>(null);
  
  const SEGMENT_ANGLE = (Math.PI / 2) - (PILLAR_RADIUS / TOWER_RADIUS) * 2.2;
  
  const createArcShape = (inner: number, outer: number, start: number, end: number) => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outer, start, end, false);
    shape.absarc(0, 0, inner, end, start, true);
    return shape;
  };

  const geometries = useMemo(() => {
    const start = -SEGMENT_ANGLE / 2;
    const end = SEGMENT_ANGLE / 2;
    const midStart = -SEGMENT_ANGLE / 6;
    const midEnd = SEGMENT_ANGLE / 6;

    const shapes = {
      base: createArcShape(TOWER_RADIUS - WALL_THICKNESS, TOWER_RADIUS, start, end),
      sideLeft: createArcShape(TOWER_RADIUS - WALL_THICKNESS, TOWER_RADIUS, start, midStart),
      sideRight: createArcShape(TOWER_RADIUS - WALL_THICKNESS, TOWER_RADIUS, midEnd, end),
      top: createArcShape(TOWER_RADIUS - WALL_THICKNESS, TOWER_RADIUS, start, end),
      glass: createArcShape(TOWER_RADIUS - 0.12, TOWER_RADIUS - 0.08, midStart, midEnd),
    };

    return {
      base: new THREE.ExtrudeGeometry(shapes.base, { depth: 0.8, bevelEnabled: false }),
      sideLeft: new THREE.ExtrudeGeometry(shapes.sideLeft, { depth: 0.8, bevelEnabled: false }),
      sideRight: new THREE.ExtrudeGeometry(shapes.sideRight, { depth: 0.8, bevelEnabled: false }),
      top: new THREE.ExtrudeGeometry(shapes.top, { depth: 0.6, bevelEnabled: false }),
      glass: new THREE.ExtrudeGeometry(shapes.glass, { depth: 0.8, bevelEnabled: false }),
    };
  }, [SEGMENT_ANGLE]);

  useFrame(() => {
    if (groupRef.current) {
      const targetScale = active ? progress : 0;
      groupRef.current.scale.y = THREE.MathUtils.lerp(groupRef.current.scale.y, targetScale, 0.1);
    }
  });

  return (
    <group rotation={[0, rotation, 0]} position={[0, 0.2, 0]}>
      <group ref={groupRef} scale={[1, 0, 1]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} castShadow receiveShadow geometry={geometries.base}>
          <meshStandardMaterial color="#8c857b" metalness={0.1} roughness={0.8} />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.8, 0]} castShadow receiveShadow geometry={geometries.sideLeft}>
          <meshStandardMaterial color="#8c857b" metalness={0.1} roughness={0.8} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.8, 0]} castShadow receiveShadow geometry={geometries.sideRight}>
          <meshStandardMaterial color="#8c857b" metalness={0.1} roughness={0.8} />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.6, 0]} castShadow receiveShadow geometry={geometries.top}>
          <meshStandardMaterial color="#8c857b" metalness={0.1} roughness={0.8} />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.8, 0]} castShadow receiveShadow geometry={geometries.glass}>
          <meshStandardMaterial color="#7a9eb5" transparent opacity={0.4} metalness={0.6} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
});

function Wall3D({ active, progress = 1 }: { active: boolean, progress?: number }) {
  return (
    <>
      <WallSegment rotation={Math.PI / 4} active={active} progress={progress} />
      <WallSegment rotation={3 * Math.PI / 4} active={active} progress={progress} />
      <WallSegment rotation={5 * Math.PI / 4} active={active} progress={progress} />
      <WallSegment rotation={7 * Math.PI / 4} active={active} progress={progress} />
    </>
  );
}

const Rebar = React.memo(function Rebar({ position, progress }: { position: [number, number, number], progress: number }) {
  // Rebars grow from the ground level (-0.1) upwards
  const rebarHeight = progress * 0.15;
  const geometry = useMemo(() => new THREE.CylinderGeometry(0.025, 0.025, 1, 8), []);

  return (
    <mesh 
      position={[position[0], -0.1 + rebarHeight / 2, position[2]]} 
      scale={[1, rebarHeight, 1]}
      castShadow 
      receiveShadow 
      geometry={geometry}
    >
      <meshStandardMaterial color="#444" metalness={0.7} roughness={0.3} />
    </mesh>
  );
});

const FoundationSlabSegment = React.memo(function FoundationSlabSegment({ index, total, progress }: { index: number, total: number, progress: number }) {
  const segmentProgress = Math.max(0, Math.min(1, (progress * total) - index));
  if (segmentProgress <= 0) return null;

  const thetaStart = (index / total) * Math.PI * 2;
  const thetaLength = (1 / total) * Math.PI * 2;
  
  // Animation: No drop to avoid gaps, just fade in
  const yOffset = 0;
  
  const geometry = useMemo(() => 
    new THREE.CylinderGeometry(TOWER_RADIUS + 0.1, TOWER_RADIUS + 0.1, 0.2, 64, 1, false, thetaStart, thetaLength),
    [thetaStart, thetaLength]
  );
  
  return (
    <mesh position={[0, 0.1 + yOffset, 0]} castShadow receiveShadow geometry={geometry}>
      <meshStandardMaterial 
        color="#4a4540" 
        roughness={0.8} 
        transparent 
        opacity={segmentProgress}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </mesh>
  );
});

function Foundation3D({ progress, active, isGround = false }: { progress: number, active: boolean, isGround?: boolean }) {
  // Balanced thresholds: 0-15% Digging, 15-40% Rebar, 40-100% Concrete Pouring
  const holeScale = isGround ? Math.min(progress / 15, 1) : 1;
  const rebarProgress = isGround ? Math.max(0, Math.min((progress - 15) / 25, 1)) : 0;
  // For ground: concrete starts from 40%. For others: starts from 0%.
  const concreteProgress = isGround ? Math.max(0, Math.min((progress - 40) / 60, 1)) : progress / 100;

  if (!active) return null;

  return (
    <group>
      {isGround && (
        <group>
          {/* Excavation Hole Rim (Slightly above ground for visibility) */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.09, 0]}>
            <ringGeometry args={[TOWER_RADIUS * 1.05 * holeScale, TOWER_RADIUS * 1.15 * holeScale, 64]} />
            <meshStandardMaterial color="#222" roughness={1} />
          </mesh>
          {/* Excavation Hole Center (Exactly on ground with polygon offset) */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.095, 0]}>
            <circleGeometry args={[TOWER_RADIUS * 1.1 * holeScale, 64]} />
            <meshStandardMaterial 
              color="#000" 
              roughness={1} 
              polygonOffset
              polygonOffsetFactor={-2}
            />
          </mesh>
        </group>
      )}

      {isGround && rebarProgress > 0 && (
        <group>
          {REBAR_POSITIONS_OUTER.map((pos, i) => (
            <Rebar key={i} position={pos} progress={rebarProgress} />
          ))}
          {REBAR_POSITIONS_INNER.map((pos, i) => (
            <Rebar key={i + 12} position={pos} progress={rebarProgress} />
          ))}
        </group>
      )}

      {concreteProgress > 0 && (
        <group>
          {FOUNDATION_INDICES.map((i) => (
            <FoundationSlabSegment 
              key={i} 
              index={i} 
              total={FOUNDATION_SEGMENTS}
              progress={concreteProgress} 
            />
          ))}
        </group>
      )}
    </group>
  );
}

const Floor3D = React.memo(function Floor3D({ data, onImpact, onLanded, currentProgress = 0, isCurrent = false }: { 
  data: FloorData, 
  onImpact: () => void, 
  onLanded: () => void,
  currentProgress?: number,
  isCurrent?: boolean
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [hasImpacted, setHasImpacted] = useState(data.isLanded);
  const targetY = data.id * FLOOR_HEIGHT;
  const initialY = targetY + 10;

  const staticSlabGeometry = useMemo(() => new THREE.CylinderGeometry(TOWER_RADIUS + 0.1, TOWER_RADIUS + 0.1, 0.2, 64), []);

  useEffect(() => {
    if (data.isLanded || data.id === 0) {
      setHasImpacted(true);
      if (data.id === 0) onLanded();
    }
  }, [data.isLanded, data.id]);

  useFrame(() => {
    if (groupRef.current) {
      if (!hasImpacted) {
        groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, 0.1);
        if (Math.abs(groupRef.current.position.y - targetY) < 0.01) {
          groupRef.current.position.y = targetY;
          setHasImpacted(true);
          onLanded();
          onImpact();
        }
      } else {
        groupRef.current.position.y = targetY;
      }
    }
  });

  const isBuildingFoundation = isCurrent && data.stage === 'NONE' && currentProgress > 0;
  const isBuildingPillars = isCurrent && data.stage === 'FLOOR' && currentProgress > 0;
  const isBuildingWalls = isCurrent && data.stage === 'PILLARS' && currentProgress > 0;

  return (
    <group ref={groupRef} position={[0, (hasImpacted || data.id === 0) ? targetY : initialY, 0]}>
      <DustParticles active={isCurrent && currentProgress > 0 && currentProgress < 100} position={[0, 0, 0]} />

      {/* STATIC floor slab */}
      {data.stage !== 'NONE' && (
        <mesh position={[0, 0.1, 0]} castShadow receiveShadow geometry={staticSlabGeometry}>
          <meshStandardMaterial 
            color="#5c564e" 
            metalness={0.1} 
            roughness={0.9} 
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      )}

      {/* CONSTRUCTION elements */}
      <group>
        {isBuildingFoundation && (
          <Foundation3D progress={currentProgress} active={true} isGround={data.id === 0} />
        )}

        {(data.stage === 'PILLARS' || data.stage === 'WALLS' || isBuildingPillars) && (
          <>
            {PILLAR_POSITIONS.map((pos, i) => (
              <Pillar 
                key={i} 
                position={pos} 
                active={true} 
                progress={isBuildingPillars ? currentProgress / 100 : 1} 
              />
            ))}
          </>
        )}

        {(data.stage === 'WALLS' || isBuildingWalls) && (
          <Wall3D 
            active={true} 
            progress={isBuildingWalls ? currentProgress / 100 : (data.stage === 'WALLS' ? 1 : 0)} 
          />
        )}

        {isCurrent && currentProgress > 0 && currentProgress < 100 && (
          <mesh position={[0, 1.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[TOWER_RADIUS + 0.5, 0.02, 16, 100]} />
            <meshStandardMaterial 
              color="#10b981" 
              transparent 
              opacity={0.3} 
              emissive="#10b981" 
              emissiveIntensity={2} 
            />
          </mesh>
        )}
      </group>

      {data.isPerfect && (
        <Float speed={5} rotationIntensity={2} floatIntensity={2}>
          <mesh position={[0, PILLAR_HEIGHT + 1, 0]} castShadow>
            <torusGeometry args={[0.5, 0.05, 16, 100]} />
            <meshStandardMaterial color="gold" emissive="gold" emissiveIntensity={2} />
          </mesh>
        </Float>
      )}
    </group>
  );
});

function CameraController({ targetHeight }: { targetHeight: number }) {
  const { camera } = useThree();

  useFrame(() => {
    const targetY = targetHeight + 5;
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.05);
    camera.lookAt(0, targetHeight, 0);
  });

  return null;
}

// --- Main App ---

export default function App() {
  const [floors, setFloors] = useState<FloorData[]>([]);
  const [currentFloorIndex, setCurrentFloorIndex] = useState(0);
  const [cameraTargetHeight, setCameraTargetHeight] = useState(0);
  const [maxHeight, setMaxHeight] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);

  // --- Resource & Worker State ---
  const [materials, setMaterials] = useState(0); // At source
  const [siteMaterials, setSiteMaterials] = useState(0); // At site
  const [workers, setWorkers] = useState({
    gathering: 4,
    transport: 4,
    construction: 4
  });

  const [progress, setProgress] = useState({
    gathering: 0,
    transport: 0,
    construction: 0
  });

  // Initialize first floor
  useEffect(() => {
    setFloors([{ id: 0, stage: 'NONE', isPerfect: false, timestamp: Date.now(), isLanded: true }]);
  }, []);

  // Simulation Loop
  useEffect(() => {
    if (!gameStarted) return;

    const interval = setInterval(() => {
      setProgress(prev => {
        const next = { ...prev };

        // 1. Gathering Logic
        if (workers.gathering > 0) {
          next.gathering += workers.gathering * BASE_SPEED;
          if (next.gathering >= 100) {
            setMaterials(m => m + 1);
            next.gathering = 0;
          }
        }

        // 2. Transport Logic
        if (workers.transport > 0 && materials > 0) {
          next.transport += workers.transport * BASE_SPEED * 0.8;
          if (next.transport >= 100) {
            setMaterials(m => Math.max(0, m - 1));
            setSiteMaterials(s => s + 1);
            next.transport = 0;
          }
        }

        // 3. Construction Logic
        const currentFloor = floors[currentFloorIndex];
        
        // Only proceed if the current floor has landed (for stages after FLOOR)
        const canBuildNext = currentFloor && (currentFloor.stage === 'NONE' || currentFloor.isLanded);

        if (canBuildNext && workers.construction > 0 && siteMaterials > 0) {
          let nextStage: BuildStage = 'NONE';
          if (currentFloor.stage === 'NONE') nextStage = 'FLOOR';
          else if (currentFloor.stage === 'FLOOR') nextStage = 'PILLARS';
          else if (currentFloor.stage === 'PILLARS') nextStage = 'WALLS';

          if (nextStage !== 'NONE') {
            // Construction speed
            const speed = (workers.construction * BASE_SPEED * 0.4);
            next.construction += speed;
            
            // Consume material based on progress delta to be more accurate
            const materialCostPerPercent = 0.03; // Adjust as needed
            setSiteMaterials(s => Math.max(0, s - (speed * materialCostPerPercent)));

            if (next.construction >= 100) {
              handleBuild(nextStage);
              next.construction = 0;
            }
          }
        }

        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [gameStarted, workers, materials, siteMaterials, floors, currentFloorIndex]);

  const handleBuild = (stage: BuildStage) => {
    const currentFloor = floors[currentFloorIndex];
    if (!currentFloor) return;

    const newFloors = [...floors];
    newFloors[currentFloorIndex] = {
      ...currentFloor,
      stage: stage
    };

    if (stage === 'FLOOR') {
      setCameraTargetHeight(currentFloorIndex * FLOOR_HEIGHT);
    }

    if (stage === 'WALLS') {
      const nextId = currentFloorIndex + 1;
      newFloors.push({ id: nextId, stage: 'NONE', isPerfect: false, timestamp: Date.now(), isLanded: false });
      setCurrentFloorIndex(nextId);
      setCameraTargetHeight(nextId * FLOOR_HEIGHT);
      setMaxHeight((prev) => Math.max(prev, nextId));
    }

    setFloors(newFloors);
  };

  const handleFloorLanded = (index: number) => {
    setFloors(prev => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], isLanded: true };
      }
      return next;
    });
  };

  const adjustWorkers = (role: keyof typeof workers, delta: number) => {
    setWorkers(prev => {
      const currentTotal = prev.gathering + prev.transport + prev.construction;
      if (delta > 0 && currentTotal >= TOTAL_WORKERS) return prev;
      
      const newVal = Math.max(0, prev[role] + delta);
      return { ...prev, [role]: newVal };
    });
  };

  const idleWorkers = TOTAL_WORKERS - (workers.gathering + workers.transport + workers.construction);

  return (
    <div className="relative w-full h-screen bg-[#050508] overflow-hidden font-sans text-white">
      {/* 3D Canvas */}
      <div className="absolute inset-0">
        <Canvas 
          shadows={{ type: THREE.PCFSoftShadowMap }} 
          gl={{ antialias: true }}
        >
          <PerspectiveCamera makeDefault position={[10, 10, 10]} fov={50} />
          <CameraController targetHeight={cameraTargetHeight} />
          
          <ambientLight intensity={0.6} />
          <directionalLight 
            position={[15, 30, 20]} 
            intensity={1.8} 
            castShadow 
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-12}
            shadow-camera-right={12}
            shadow-camera-top={12}
            shadow-camera-bottom={-12}
            shadow-camera-near={0.5}
            shadow-camera-far={100}
            shadow-bias={-0.0001}
          />
          <pointLight position={[-10, -10, -10]} intensity={0.5} />
          
          <Suspense fallback={null}>
            <group position={[0, 0, 0]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
                <planeGeometry args={[100, 100]} />
                <meshStandardMaterial color="#1a1a1a" />
              </mesh>

              {/* Tower Floors */}
              {floors.map((floor, index) => (
                <Floor3D 
                  key={floor.id} 
                  data={floor} 
                  onImpact={() => {}}
                  onLanded={() => handleFloorLanded(index)}
                  currentProgress={index === currentFloorIndex ? progress.construction : 0}
                  isCurrent={index === currentFloorIndex}
                />
              ))}
            </group>
            <Environment preset="studio" />
          </Suspense>

          <OrbitControls 
            enablePan={false} 
            enableZoom={true} 
            minDistance={5} 
            maxDistance={30}
            target={[0, currentFloorIndex * FLOOR_HEIGHT, 0]}
          />
        </Canvas>
      </div>

      {/* Top Resource Bar */}
      <div className="absolute top-0 inset-x-0 p-6 flex justify-between items-start z-30 pointer-events-none">
        <div className="flex gap-4 pointer-events-auto">
          <ResourceCard 
            icon={<Pickaxe className="w-4 h-4" />}
            label="原料儲備"
            value={materials}
            progress={progress.gathering}
            color="amber"
          />
          <div className="flex items-center text-white/20">
            <ArrowRight className="w-4 h-4" />
          </div>
          <ResourceCard 
            icon={<Truck className="w-4 h-4" />}
            label="運輸中"
            value={Math.floor(progress.transport)}
            progress={progress.transport}
            color="blue"
            isPercent
          />
          <div className="flex items-center text-white/20">
            <ArrowRight className="w-4 h-4" />
          </div>
          <ResourceCard 
            icon={<Package className="w-4 h-4" />}
            label="工地物資"
            value={siteMaterials.toFixed(1)}
            progress={progress.construction}
            color="emerald"
          />
        </div>

        <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center gap-4 pointer-events-auto">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-400" />
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-white/40">空閒工人</span>
              <span className="text-xl font-bold font-mono">{idleWorkers}</span>
            </div>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-white/40">當前樓層</div>
            <div className="text-xl font-bold font-mono text-blue-400">{currentFloorIndex}F</div>
          </div>
        </div>
      </div>

      {/* Altimeter Overlay */}
      <div className="absolute left-8 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4 z-20 pointer-events-none">
        <div className="h-64 w-1 bg-white/10 relative rounded-full overflow-hidden">
          <motion.div 
            className="absolute bottom-0 w-full bg-blue-500"
            animate={{ height: `${(currentFloorIndex / 50) * 100}%` }}
          />
        </div>
        <div className="text-center">
          <div className="text-xs uppercase tracking-widest text-white/40 mb-1">高度</div>
          <div className="text-3xl font-bold font-mono tracking-tighter">{currentFloorIndex}F</div>
        </div>
      </div>

      {/* Worker Management Panel */}
      <div className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-30">
        <WorkerControl 
          icon={<Pickaxe />}
          label="採集"
          count={workers.gathering}
          onAdjust={(d) => adjustWorkers('gathering', d)}
          color="amber"
        />
        <WorkerControl 
          icon={<Truck />}
          label="運輸"
          count={workers.transport}
          onAdjust={(d) => adjustWorkers('transport', d)}
          color="blue"
        />
        <WorkerControl 
          icon={<HardHat />}
          label="建築"
          count={workers.construction}
          onAdjust={(d) => adjustWorkers('construction', d)}
          color="emerald"
        />
      </div>

      {/* Bottom Construction Status */}
      <div className="absolute inset-x-0 bottom-0 p-8 flex flex-col items-center gap-6 bg-gradient-to-t from-black/90 to-transparent pointer-events-none">
        <div className="flex flex-col items-center gap-3 pointer-events-auto">
          <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest">
            <HardHat className="w-5 h-5 text-emerald-400" />
            <span>正在建造: {
              floors[currentFloorIndex]?.stage === 'NONE' ? '地基' :
              floors[currentFloorIndex]?.stage === 'FLOOR' ? '支柱' :
              floors[currentFloorIndex]?.stage === 'PILLARS' ? '牆面' : '等待中'
            }</span>
          </div>
          <div className="w-96 h-3 bg-white/5 rounded-full border border-white/10 overflow-hidden relative">
            <motion.div 
              className="h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
              animate={{ width: `${progress.construction}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
              {Math.floor(progress.construction)}%
            </div>
          </div>
          <div className="text-[10px] text-white/40 uppercase tracking-widest">
            需要物資以維持建造速度
          </div>
        </div>
      </div>

      {/* Start Hint */}
      {!gameStarted && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-md z-50">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setGameStarted(true)}
            className="flex flex-col items-center gap-6 group cursor-pointer"
          >
            <div className="w-24 h-24 rounded-full border-2 border-blue-500/50 flex items-center justify-center bg-blue-500/10 group-hover:bg-blue-500/20 transition-all">
              <RotateCw className="w-12 h-12 text-blue-400 group-hover:rotate-180 transition-transform duration-700" />
            </div>
            <div className="text-2xl font-black uppercase tracking-[0.2em] text-white">開始建築工程</div>
            <div className="text-sm text-white/40 max-w-xs text-center leading-relaxed">
              分配工人進行採集、運輸與建造。<br/>確保物流暢通，挑戰摩天大樓。
            </div>
          </motion.button>
        </div>
      )}
    </div>
  );
}

function ResourceCard({ icon, label, value, progress, color, isPercent = false }: any) {
  const colors: any = {
    amber: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    blue: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    emerald: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
  };

  return (
    <div className={`min-w-[120px] rounded-xl border p-3 backdrop-blur-md ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">{label}</span>
      </div>
      <div className="text-2xl font-black font-mono leading-none mb-2">
        {value}{isPercent && '%'}
      </div>
      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
        <motion.div 
          className={`h-full ${color === 'amber' ? 'bg-amber-400' : color === 'blue' ? 'bg-blue-400' : 'bg-emerald-400'}`}
          animate={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

