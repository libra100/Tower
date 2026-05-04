import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
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

function Foundation3D({ progress, active }: { progress: number, active: boolean }) {
  const holeScale = Math.min(progress / 30, 1);
  const brickProgress = Math.max(0, Math.min((progress - 30) / 40, 1));
  const bitumenProgress = Math.max(0, Math.min((progress - 70) / 30, 1));

  return (
    <group>
      {/* Excavation Hole */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <circleGeometry args={[TOWER_RADIUS * 1.5 * holeScale, 6]} />
        <meshStandardMaterial color="#2e1a05" roughness={1} />
      </mesh>

      {/* Wood Supports */}
      {brickProgress > 0 && (
        <group>
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            const x = Math.cos(angle) * (TOWER_RADIUS);
            const z = Math.sin(angle) * (TOWER_RADIUS);
            return <Scaffolding key={i} position={[x, -0.5, z]} progress={brickProgress} />;
          })}
        </group>
      )}

      {/* Brick Foundation Slab */}
      {bitumenProgress > 0 && (
        <mesh position={[0, -0.1 + (bitumenProgress * 0.2), 0]}>
          <cylinderGeometry args={[TOWER_RADIUS + 0.2, TOWER_RADIUS + 0.5, 0.4, 6]} />
          <meshStandardMaterial color="#5d2e1a" roughness={0.9} transparent opacity={bitumenProgress} />
        </mesh>
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

  useEffect(() => {
    if (data.isLanded) {
      setHasImpacted(true);
    } else if (data.id === 0 && data.stage === 'FLOOR') {
      // Foundation is already on ground
      setHasImpacted(true);
      onLanded();
    }
  }, [data.isLanded, data.id, data.stage]);

  useFrame((state) => {
    if (groupRef.current && data.stage !== 'NONE') {
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

      // Construction shake effect
      if (isCurrent && currentProgress > 0 && currentProgress < 100) {
        const shake = (Math.sin(state.clock.elapsedTime * 50) * 0.01);
        groupRef.current.position.x = shake;
        groupRef.current.position.z = shake;
      } else {
        groupRef.current.position.x = 0;
        groupRef.current.position.z = 0;
      }
    }
  });

  if (data.stage === 'NONE') return null;

  const pillarOffset = TOWER_RADIUS - (WALL_THICKNESS / 2);
  const pillarPositions: [number, number, number][] = [
    [pillarOffset, 0.2, 0],
    [-pillarOffset, 0.2, 0],
    [0, 0.2, pillarOffset],
    [0, 0.2, -pillarOffset],
  ];

  const isBuildingPillars = isCurrent && data.stage === 'FLOOR' && currentProgress > 0;
  const isBuildingWalls = isCurrent && data.stage === 'PILLARS' && currentProgress > 0;

  return (
    <group ref={groupRef} position={[0, (data.id === 0 && data.stage === 'FLOOR') ? 0 : (hasImpacted ? targetY : initialY), 0]}>
      {/* Dust Particles during construction */}
      <DustParticles active={isCurrent && currentProgress > 0 && currentProgress < 100} position={[0, 0, 0]} />

      {/* Special Foundation Animation for Floor 0 */}
      {data.id === 0 && data.stage === 'FLOOR' && isCurrent && (
        <Foundation3D progress={currentProgress} active={true} />
      )}

      {/* Floor Slab (Standard or completed foundation) */}
      {(data.id !== 0 || (data.id === 0 && (data.stage !== 'FLOOR' || !isCurrent))) && (
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[TOWER_RADIUS + 0.1, TOWER_RADIUS + 0.1, 0.2, 64]} />
          <meshStandardMaterial 
            color="#a0522d"
            metalness={0.0}
            roughness={1.0}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      )}

      {/* Pillars */}
      {hasImpacted && (data.stage === 'PILLARS' || data.stage === 'WALLS' || isBuildingPillars) && (
        <>
          {pillarPositions.map((pos, i) => (
            <Pillar 
              key={i} 
              position={pos} 
              active={true} 
              progress={isBuildingPillars ? currentProgress / 100 : 1} 
            />
          ))}
        </>
      )}

      {/* Walls */}
      {hasImpacted && (data.stage === 'WALLS' || isBuildingWalls) && (
        <Wall3D 
          active={true} 
          progress={isBuildingWalls ? currentProgress / 100 : (data.stage === 'WALLS' ? 1 : 0)} 
        />
      )}

      {/* Construction Aura */}
      {isCurrent && currentProgress > 0 && currentProgress < 100 && (
        <mesh position={[0, 1.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[TOWER_RADIUS + 0.5, 0.02, 16, 100]} />
          <meshStandardMaterial color="#10b981" transparent opacity={0.3} emissive="#10b981" emissiveIntensity={2} />
        </mesh>
      )}

      {/* Perfect Effect */}
      {data.isPerfect && (
        <Float speed={5} rotationIntensity={2} floatIntensity={2}>
          <mesh position={[0, PILLAR_HEIGHT + 1, 0]}>
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
        const next = { ...prev };

        // 1. Production Logic
        if (workers.brickmaking > 0) {
          next.brickmaking += workers.brickmaking * BASE_SPEED;
          if (next.brickmaking >= 100) {
            resourcesToProduce.bricks = (resourcesToProduce.bricks || 0) + 1;
            next.brickmaking = 0;
          }
        }
        if (workers.bitumen > 0) {
          next.bitumen += workers.bitumen * BASE_SPEED * 0.7;
          if (next.bitumen >= 100) {
            resourcesToProduce.bitumen = (resourcesToProduce.bitumen || 0) + 1;
            next.bitumen = 0;
          }
        }
        if (workers.wood > 0) {
          next.wood += workers.wood * BASE_SPEED * 0.5;
          if (next.wood >= 100) {
            resourcesToProduce.wood = (resourcesToProduce.wood || 0) + 1;
            next.wood = 0;
          }
        }

        // 2. Transport Logic (moves all types)
        const hasResources = resources.bricks > 0 || resources.bitumen > 0 || resources.wood > 0;
        if (workers.transport > 0 && hasResources) {
          next.transport += workers.transport * BASE_SPEED * 0.8;
          if (next.transport >= 100) {
            if (resources.bricks > 0) resourcesToMove = 'bricks';
            else if (resources.bitumen > 0) resourcesToMove = 'bitumen';
            else if (resources.wood > 0) resourcesToMove = 'wood';
            next.transport = 0;
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
              next.construction += speed;

              const step = speed / 100;
              Object.entries(costs).forEach(([res, amount]) => {
                const rKey = res as keyof typeof siteResources;
                constructionStepResources[rKey] = (constructionStepResources[rKey] || 0) + (amount as number) * step;
              });

              if (next.construction >= 100) {
                triggerBuild = nextStage;
                next.construction = 0;
              }
            }
          }
        }

        return next;
      });

      // Apply changes outside setProgress to avoid nested setters and follow anti-pattern advice
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

    }, 100);

    return () => clearInterval(interval);
  }, [gameStarted, workers, resources, siteResources, floors, currentFloorIndex]);

  const handleBuild = (stage: BuildStage) => {
    const currentFloor = floors[currentFloorIndex];
    if (!currentFloor) return;

    const newFloors = [...floors];
    newFloors[currentFloorIndex] = {
      ...currentFloor,
      stage: stage,
      isLanded: stage === 'FLOOR' ? false : currentFloor.isLanded // Reset landed for new floor drop
    };

    if (stage === 'FLOOR') {
      setCameraTargetHeight(currentFloorIndex * FLOOR_HEIGHT);
    }

    if (stage === 'WALLS') {
      const nextId = currentFloorIndex + 1;
      newFloors.push({ id: nextId, stage: 'NONE', isPerfect: false, timestamp: Date.now(), isLanded: false });
      setCurrentFloorIndex(nextId);
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
      const currentTotal = Object.values(prev).reduce((a, b) => a + b, 0);
      if (delta > 0 && currentTotal >= TOTAL_WORKERS) return prev;
      
      const newVal = Math.max(0, prev[role] + delta);
      return { ...prev, [role]: newVal };
    });
  };

  const idleWorkers = TOTAL_WORKERS - Object.values(workers).reduce((a, b) => a + b, 0);

  return (
    <div className="relative w-full h-screen bg-[#1a0f00] overflow-hidden font-sans text-white">
      {/* Texture Overlay for Old Paper look */}
      <div className="absolute inset-0 opacity-10 pointer-events-none z-40 mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/old-map.png')]" />

      {/* 3D Canvas */}
      <div className="absolute inset-0">
        <Canvas 
          shadows={{ type: THREE.PCFShadowMap }} 
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

function ResourceCard({ icon, label, value, siteValue, progress, color, isPercent = false }: any) {
  const colors: any = {
    amber: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    blue: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    emerald: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    orange: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    slate: 'text-slate-400 bg-slate-400/10 border-slate-400/20'
  };

  const barColors: any = {
    amber: 'bg-amber-400',
    blue: 'bg-blue-400',
    emerald: 'bg-emerald-400',
    orange: 'bg-orange-400',
    slate: 'bg-slate-400'
  };

  return (
    <div className={`min-w-[100px] rounded-xl border p-2 backdrop-blur-md ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">{label}</span>
      </div>
      <div className="flex justify-between items-end mb-1">
        <div className="text-xl font-black font-mono leading-none">
          {value}{isPercent && '%'}
        </div>
        {siteValue !== undefined && (
          <div className="text-[10px] opacity-70">
            工地: {siteValue}
          </div>
        )}
      </div>
      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
        <motion.div 
          className={`h-full ${barColors[color]}`}
          animate={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function WorkerControl({ icon, label, count, onAdjust, color }: any) {
  const colors: any = {
    amber: 'text-amber-400 border-amber-400/20 hover:bg-amber-400/5',
    blue: 'text-blue-400 border-blue-400/20 hover:bg-blue-400/5',
    emerald: 'text-emerald-400 border-emerald-400/20 hover:bg-emerald-400/5',
    orange: 'text-orange-400 border-orange-400/20 hover:bg-orange-400/5',
    slate: 'text-slate-400 border-slate-400/20 hover:bg-slate-400/5'
  };

  return (
    <div className={`bg-black/60 backdrop-blur-md border rounded-xl p-2 flex flex-col items-center gap-1 ${colors[color]}`}>
      <div className="p-1.5 rounded-lg bg-white/5">
        {React.cloneElement(icon, { className: 'w-4 h-4' })}
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[8px] font-bold uppercase tracking-widest opacity-40">{label}</span>
        <span className="text-lg font-black font-mono">{count}</span>
      </div>
      <div className="flex gap-2">
        <button 
          onClick={() => onAdjust(-1)}
          className="p-1 hover:bg-white/10 rounded transition-colors cursor-pointer"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
        <button 
          onClick={() => onAdjust(1)}
          className="p-1 hover:bg-white/10 rounded transition-colors cursor-pointer"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

