import React, { useState, useEffect, useCallback, useRef, Suspense, useMemo } from 'react';
import { WorkerControl } from "./components/WorkerControl";
import { ResourceCard } from "./components/ResourceCard";
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
  X,
  Users, 
  Pickaxe, 
  Truck, 
  HardHat,
  ChevronUp,
  ChevronDown,
  ArrowRight,
  Flame,
  Droplet,
  Trees
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
  FLOOR: { bricks: 5, wood: 2 },
  PILLARS: { bricks: 8, bitumen: 2 },
  WALLS: { bricks: 12, bitumen: 4 }
};

const BASE_SPEED = 0.8;
const TOTAL_WORKERS = 15;

const BABEL_STORY = [
  { floor: 0, title: "最初的團結", text: "那時，天下人的口音、言語都是一樣。他們往東邊遷移的時候，在示拿地遇見一片平原，就住在那裡。" },
  { floor: 3, title: "磚與瀝青", text: "他們彼此商量說：來吧！我們要作磚，把磚燒透了。他們就拿磚當石頭，又拿石漆當灰泥。" },
  { floor: 7, title: "通天之志", text: "他們說：來吧！我們要建造一座城和一座塔，塔頂通天，為要傳揚我們的名，免得我們分散在全地上。" },
  { floor: 12, title: "上帝的降臨", text: "耶和華降臨，要看看世人所建造的城和塔。耶和華說：看哪，他們成為一樣的人民，都是一樣的言語。" },
  { floor: 18, title: "變亂口音", text: "我們下去，在那裡變亂他們的口音，使他們的言語彼此不通。於是耶和華使他們從那裡分散在全地上。" },
  { floor: 25, title: "停工與分散", text: "他們就停工不造那城了。因為耶和華在那裡變亂天下人的口音，使眾人分散在全地上，所以那城名叫巴別。" }
];

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
  const geometry = React.useMemo(() => new THREE.BoxGeometry(PILLAR_RADIUS * 2.5, PILLAR_HEIGHT, PILLAR_RADIUS * 2.5), []);

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
        color="#8b4513"
        metalness={0.1}
        roughness={1}
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

  const geometries = React.useMemo(() => {
    const start = -SEGMENT_ANGLE / 2;
    const end = SEGMENT_ANGLE / 2;

    const shapes = {
      full: createArcShape(TOWER_RADIUS - WALL_THICKNESS, TOWER_RADIUS, start, end),
    };

    return {
      wall: new THREE.ExtrudeGeometry(shapes.full, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02 }),
      mortar: new THREE.ExtrudeGeometry(shapes.full, { depth: 0.05, bevelEnabled: false }),
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
        {/* Main Brick Wall */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} castShadow receiveShadow geometry={geometries.wall}>
          <meshStandardMaterial color="#c66b3d" metalness={0.05} roughness={1} />
        </mesh>

        {/* Bitumen Mortar Lines */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.7, 0]} geometry={geometries.mortar}>
          <meshStandardMaterial color="#1a1a1a" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.4, 0]} geometry={geometries.mortar}>
          <meshStandardMaterial color="#1a1a1a" metalness={0.5} roughness={0.5} />
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

const Scaffolding = React.memo(function Scaffolding({ position, progress }: { position: [number, number, number], progress: number }) {
  const geometry = React.useMemo(() => new THREE.BoxGeometry(0.1, 1, 0.1), []);
  return (
    <mesh
      position={[position[0], position[1] + (progress * 1.5) / 2, position[2]]}
      scale={[1, progress * 1.5, 1]}
      geometry={geometry}
    >
      <meshStandardMaterial color="#5d4037" roughness={1} />
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
      {/* Excavation Hole */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <circleGeometry args={[TOWER_RADIUS * 1.5 * holeScale, 6]} />
        <meshStandardMaterial color="#2e1a05" roughness={1} />
      </mesh>

      {/* Wood Supports */}
      {rebarProgress > 0 && (
        <group>
          {REBAR_POSITIONS_OUTER.map((pos, i) => (
            <Scaffolding key={i} position={pos as [number, number, number]} progress={rebarProgress} />
          ))}
          {REBAR_POSITIONS_INNER.map((pos, i) => (
            <Scaffolding key={i + 12} position={pos as [number, number, number]} progress={rebarProgress} />
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
            color="#a0522d"
            metalness={0.0}
            roughness={1.0}
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
  const [currentStory, setCurrentStory] = useState<typeof BABEL_STORY[0] | null>(BABEL_STORY[0]);
  const [showStory, setShowStory] = useState(false);

  // --- Resource & Worker State ---
  const [resources, setResources] = useState({
    bricks: 10,
    bitumen: 5,
    wood: 5
  });
  const [siteResources, setSiteResources] = useState({
    bricks: 0,
    bitumen: 0,
    wood: 0
  });
  const [workers, setWorkers] = useState({
    brickmaking: 4,
    bitumen: 3,
    wood: 2,
    transport: 3,
    construction: 3
  });

  const [progress, setProgress] = useState({
    brickmaking: 0,
    bitumen: 0,
    wood: 0,
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
      let resourcesToProduce: Partial<typeof resources> = {};
      let resourcesToMove: keyof typeof resources | null = null;
      let constructionStepResources: Partial<typeof siteResources> = {};
      let triggerBuild: BuildStage | null = null;

      setProgress(prev => {
        const nextProgress = { ...prev };
        const resourcesToProduce: Partial<typeof resources> = {};
        let resourcesToMove: keyof typeof resources | null = null;
        const constructionStepResources: Partial<typeof siteResources> = {};
        let triggerBuild: BuildStage | null = null;

        // 1. Production Logic
        if (workers.brickmaking > 0) {
          nextProgress.brickmaking += workers.brickmaking * BASE_SPEED;
          if (nextProgress.brickmaking >= 100) {
            resourcesToProduce.bricks = 1;
            nextProgress.brickmaking = 0;
          }
        }
        if (workers.bitumen > 0) {
          nextProgress.bitumen += workers.bitumen * BASE_SPEED * 0.7;
          if (nextProgress.bitumen >= 100) {
            resourcesToProduce.bitumen = 1;
            nextProgress.bitumen = 0;
          }
        }
        if (workers.wood > 0) {
          nextProgress.wood += workers.wood * BASE_SPEED * 0.5;
          if (nextProgress.wood >= 100) {
            resourcesToProduce.wood = 1;
            nextProgress.wood = 0;
          }
        }

        // 2. Transport Logic (moves all types)
        const hasResources = resources.bricks > 0 || resources.bitumen > 0 || resources.wood > 0;
        if (workers.transport > 0 && hasResources) {
          nextProgress.transport += workers.transport * BASE_SPEED * 0.8;
          if (nextProgress.transport >= 100) {
            if (resources.bricks > 0) resourcesToMove = 'bricks';
            else if (resources.bitumen > 0) resourcesToMove = 'bitumen';
            else if (resources.wood > 0) resourcesToMove = 'wood';
            nextProgress.transport = 0;
          }
        }

        // 3. Construction Logic
        const currentFloor = floors[currentFloorIndex];
        const canBuildNext = currentFloor && (currentFloor.stage === 'NONE' || currentFloor.isLanded);

        if (canBuildNext && workers.construction > 0) {
          let nextStage: BuildStage = 'NONE';
          if (currentFloor.stage === 'NONE') nextStage = 'FLOOR';
          else if (currentFloor.stage === 'FLOOR') nextStage = 'PILLARS';
          else if (currentFloor.stage === 'PILLARS') nextStage = 'WALLS';

          if (nextStage !== 'NONE') {
            const costs = COSTS[nextStage as keyof typeof COSTS];
            const hasEnough = Object.entries(costs).every(([res, amount]) =>
              siteResources[res as keyof typeof siteResources] >= (amount as number) * 0.1
            );

            if (hasEnough) {
              const speed = (workers.construction * BASE_SPEED * 0.3);
              nextProgress.construction += speed;

              const step = speed / 100;
              Object.entries(costs).forEach(([res, amount]) => {
                const rKey = res as keyof typeof siteResources;
                constructionStepResources[rKey] = (amount as number) * step;
              });

              if (nextProgress.construction >= 100) {
                triggerBuild = nextStage;
                nextProgress.construction = 0;
              }
            }
          }
        }

        // Apply all state changes together
        if (Object.keys(resourcesToProduce).length > 0 || resourcesToMove) {
          setResources(r => {
            const nextR = { ...r };
            Object.entries(resourcesToProduce).forEach(([res, amount]) => {
              const key = res as keyof typeof resources;
              nextR[key] += amount!;
            });
            if (resourcesToMove) {
              nextR[resourcesToMove] = Math.max(0, nextR[resourcesToMove] - 1);
            }
            return nextR;
          });
        }

        if (resourcesToMove || Object.keys(constructionStepResources).length > 0) {
          setSiteResources(sr => {
            const nextSR = { ...sr };
            if (resourcesToMove) {
              nextSR[resourcesToMove] += 1;
            }
            Object.entries(constructionStepResources).forEach(([res, amount]) => {
              const key = res as keyof typeof siteResources;
              nextSR[key] = Math.max(0, nextSR[key] - amount!);
            });
            return nextSR;
          });
        }

        if (triggerBuild) {
          handleBuild(triggerBuild);
        }

        return nextProgress;
      });

    }, 100);

    return () => clearInterval(interval);
  }, [gameStarted, workers, resources, siteResources, floors, currentFloorIndex]);

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

      // Trigger story
      const storyUpdate = BABEL_STORY.find(s => s.floor === nextId);
      if (storyUpdate) {
        setCurrentStory(storyUpdate);
        setShowStory(true);
      }
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
      const currentTotal = prev.brickmaking + prev.bitumen + prev.wood + prev.transport + prev.construction;
      if (delta > 0 && currentTotal >= TOTAL_WORKERS) return prev;
      
      const newVal = Math.max(0, prev[role] + delta);
      return { ...prev, [role]: newVal };
    });
  };

  const idleWorkers = TOTAL_WORKERS - (workers.brickmaking + workers.bitumen + workers.wood + workers.transport + workers.construction);

  return (
    <div className="relative w-full h-screen bg-[#1a0f00] overflow-hidden font-sans text-white">
      {/* Texture Overlay for Old Paper look */}
      <div className="absolute inset-0 opacity-10 pointer-events-none z-40 mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/old-map.png')]" />

      {/* 3D Canvas */}
      <div className="absolute inset-0">
        <Canvas 
          shadows={{ type: THREE.PCFSoftShadowMap }} 
          gl={{ antialias: true }}
        >
          <PerspectiveCamera makeDefault position={[10, 10, 10]} fov={50} />
          <CameraController targetHeight={cameraTargetHeight} />
          
          <ambientLight intensity={0.6} color="#fff4e0" />
          <directionalLight position={[15, 25, 10]} intensity={1.5} castShadow color="#ffd4a0" />
          <pointLight position={[-15, 10, -10]} intensity={0.8} color="#ffccaa" />
          
          <Suspense fallback={null}>
            <group position={[0, 0, 0]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
                <planeGeometry args={[100, 100]} />
                <meshStandardMaterial color="#8b7355" roughness={1} />
              </mesh>
              <ContactShadows resolution={1024} scale={20} blur={1.5} opacity={0.4} far={10} color="#000" />

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
            <Environment preset="sunset" />
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
      <div className="absolute top-0 inset-x-0 p-6 flex justify-between items-start z-30 pointer-events-none overflow-x-auto">
        <div className="flex gap-3 pointer-events-auto">
          <ResourceCard
            icon={<Flame className="w-4 h-4" />}
            label="磚塊 (窯)"
            value={resources.bricks}
            siteValue={siteResources.bricks.toFixed(1)}
            progress={progress.brickmaking}
            color="orange"
          />
          <ResourceCard 
            icon={<Droplet className="w-4 h-4" />}
            label="瀝青 (坑)"
            value={resources.bitumen}
            siteValue={siteResources.bitumen.toFixed(1)}
            progress={progress.bitumen}
            color="slate"
          />
          <ResourceCard
            icon={<Trees className="w-4 h-4" />}
            label="木材 (林)"
            value={resources.wood}
            siteValue={siteResources.wood.toFixed(1)}
            progress={progress.wood}
            color="amber"
          />
          <div className="flex items-center text-white/20">
            <ArrowRight className="w-4 h-4" />
          </div>
          <ResourceCard 
            icon={<Truck className="w-4 h-4" />}
            label="運輸進度"
            value={Math.floor(progress.transport)}
            progress={progress.transport}
            color="blue"
            isPercent
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
      <div className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-30 scale-90 origin-right">
        <WorkerControl
          icon={<Flame />}
          label="燒磚工"
          count={workers.brickmaking}
          onAdjust={(d) => adjustWorkers('brickmaking', d)}
          color="orange"
        />
        <WorkerControl
          icon={<Droplet />}
          label="採瀝工"
          count={workers.bitumen}
          onAdjust={(d) => adjustWorkers('bitumen', d)}
          color="slate"
        />
        <WorkerControl
          icon={<Trees />}
          label="伐木工"
          count={workers.wood}
          onAdjust={(d) => adjustWorkers('wood', d)}
          color="amber"
        />
        <WorkerControl 
          icon={<Truck />}
          label="運輸工"
          count={workers.transport}
          onAdjust={(d) => adjustWorkers('transport', d)}
          color="blue"
        />
        <WorkerControl 
          icon={<HardHat />}
          label="建築工"
          count={workers.construction}
          onAdjust={(d) => adjustWorkers('construction', d)}
          color="emerald"
        />
      </div>

      {/* Bottom Construction Status */}
      <div className="absolute inset-x-0 bottom-0 p-8 flex flex-col items-center gap-6 bg-gradient-to-t from-[#1a0f00]/90 to-transparent pointer-events-none">
        <div className="flex flex-col items-center gap-3 pointer-events-auto">
          <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-orange-200">
            <HardHat className="w-5 h-5 text-orange-400" />
            <span>建造進度: {
              floors[currentFloorIndex]?.stage === 'NONE' ? '鋪設地基' :
              floors[currentFloorIndex]?.stage === 'FLOOR' ? '架設支柱' :
              floors[currentFloorIndex]?.stage === 'PILLARS' ? '砌築磚牆' : '歇息中'
            }</span>
          </div>
          <div className="w-96 h-4 bg-black/40 rounded-sm border border-orange-900/50 overflow-hidden relative shadow-inner">
            <motion.div 
              className="h-full bg-gradient-to-r from-orange-800 to-orange-500 shadow-[0_0_15px_rgba(194,65,12,0.5)]"
              animate={{ width: `${progress.construction}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white mix-blend-difference">
              {Math.floor(progress.construction)}%
            </div>
          </div>
          <div className="text-[10px] text-orange-200/40 uppercase tracking-widest">
            集眾人之力，欲通天之頂
          </div>
        </div>
      </div>

      {/* Story Popup */}
      <AnimatePresence>
        {showStory && currentStory && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute left-24 top-24 max-w-sm z-50 pointer-events-auto"
          >
            <div className="bg-[#2a1a05]/90 backdrop-blur-xl border-l-4 border-orange-600 p-6 shadow-2xl rounded-r-lg">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-orange-400 font-serif text-xl font-bold tracking-widest">{currentStory.title}</h3>
                <button
                  onClick={() => setShowStory(false)}
                  className="text-orange-200/40 hover:text-orange-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-orange-100/80 font-serif leading-relaxed italic">
                「{currentStory.text}」
              </p>
              <div className="mt-4 flex justify-end">
                <span className="text-[10px] text-orange-600 font-bold uppercase tracking-widest">
                  創世記 11:{BABEL_STORY.indexOf(currentStory) + 1}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Start Hint */}
      {!gameStarted && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1a0f00]/80 backdrop-blur-sm z-50">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setGameStarted(true);
              setShowStory(true);
            }}
            className="flex flex-col items-center gap-6 group cursor-pointer"
          >
            <div className="w-32 h-32 rounded-full border-4 border-orange-500/30 flex items-center justify-center bg-orange-900/20 group-hover:bg-orange-800/40 transition-all shadow-2xl relative">
              <RotateCw className="w-16 h-16 text-orange-400 group-hover:rotate-180 transition-transform duration-1000" />
              <div className="absolute inset-0 border-t-4 border-orange-500 rounded-full animate-spin duration-[3000ms]" />
            </div>
            <div className="text-4xl font-black uppercase tracking-[0.3em] text-orange-100 drop-shadow-lg">巴別塔：天梯之始</div>
            <div className="text-lg text-orange-200/60 max-w-md text-center leading-relaxed font-serif italic">
              「來吧！我們要建造一座城和一座塔，塔頂通天，為要傳揚我們的名。」
            </div>
            <div className="mt-4 px-8 py-3 bg-orange-700 hover:bg-orange-600 rounded-full text-white font-bold transition-colors">
              開啟史詩工程
            </div>
          </motion.button>
        </div>
      )}
    </div>
  );
}


