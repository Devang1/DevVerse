"use client";

import { Text, useCursor } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { MathUtils, Vector3 } from "three";
import type { DeveloperCity, GitHubRepo } from "@/lib/github-world";
import { useKingdomStore } from "./kingdom-store";

const languageColors: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f2c14e",
  Python: "#4b8bbe",
  "C++": "#e05276",
  C: "#98a6b8",
  Rust: "#d77a35",
  Go: "#61c3b6",
  Vue: "#42b883",
  HTML: "#e56b3f",
  CSS: "#6f7bf7"
};

const repoColors = ["#c96b3c", "#4f8b83", "#456990", "#d6a43f", "#845b8e", "#6b8f71"];

const CITY_PLAZA_RADIUS = 6.2;
const CITY_ROAD_HALF_WIDTH = 2.3;
const REPO_BLOCK_SPACING = 4.75;
const MAX_RENDERED_REPOS = 32;
const WORLD_MIN_X = -175;
const WORLD_MAX_X = 175;
const WORLD_MIN_Z = -210;
const WORLD_MAX_Z = 14;

function displayRepoName(name: string) {
  return name.length > 18 ? `${name.slice(0, 16)}...` : name;
}

function repoMeta(repo: GitHubRepo) {
  return `${repo.language ?? "Mixed"}  ★ ${repo.stars.toLocaleString()}`;
}

function visibleRepos(city: DeveloperCity) {
  return city.repos.slice(0, MAX_RENDERED_REPOS);
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function layoutColumns(repoCount: number) {
  return Math.max(4, Math.ceil(Math.sqrt(Math.max(1, repoCount))) + 1);
}

function cityRadius(repoCount: number) {
  const columns = layoutColumns(repoCount);
  const rows = Math.ceil(Math.max(1, repoCount) / columns);
  const halfWidth = ((columns - 1) * REPO_BLOCK_SPACING) / 2;
  const halfDepth = ((rows - 1) * REPO_BLOCK_SPACING) / 2;
  return Math.max(15, Math.hypot(halfWidth, halfDepth) + 8);
}

function cityPositions(cities: DeveloperCity[]) {
  if (!cities.length) return [];
  const centerRadius = cityRadius(visibleRepos(cities[0]).length);
  return cities.map((city, index) => {
    if (!index) return [0, 0, 0] as [number, number, number];
    const radius = cityRadius(visibleRepos(city).length);
    const ring = centerRadius + radius + 20 + Math.floor((index - 1) / 5) * 80;
    const angle = ((index - 1) % 5) * ((Math.PI * 2) / 5) - Math.PI / 2;
    return [Math.cos(angle) * ring, 0, Math.sin(angle) * ring] as [number, number, number];
  });
}

function repoPlacement(index: number, repoCount: number) {
  const columns = layoutColumns(repoCount);
  const estimatedRows = Math.ceil(Math.max(1, repoCount + 12) / columns);
  const candidates: [number, number][] = [];
  for (let row = 0; candidates.length <= index; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = (column - (columns - 1) / 2) * REPO_BLOCK_SPACING;
      const z = (row - (estimatedRows - 1) / 2) * REPO_BLOCK_SPACING;
      const keepsCentralPlazaOpen = Math.hypot(x, z) > CITY_PLAZA_RADIUS;
      const keepsRoadsOpen = Math.abs(x) > CITY_ROAD_HALF_WIDTH && Math.abs(z) > CITY_ROAD_HALF_WIDTH;
      if (keepsCentralPlazaOpen && keepsRoadsOpen) candidates.push([x, z]);
    }
  }
  return candidates[index] ?? [0, 0];
}

function cityCollisionCircles(cities: DeveloperCity[], positions: [number, number, number][]) {
  return cities.flatMap((city, cityIndex) => {
    const [cityX, , cityZ] = positions[cityIndex] ?? [0, 0, 0];
    const repos = visibleRepos(city);
    const buildings = repos.map((_, repoIndex) => {
      const [repoX, repoZ] = repoPlacement(repoIndex, repos.length);
      return { x: cityX + repoX, z: cityZ + repoZ, radius: 1.3 };
    });
    return [{ x: cityX, z: cityZ, radius: 3.45 }, ...buildings];
  });
}

function isNearRoad(x: number, z: number) {
  return Math.abs(x) < 1.4 || Math.abs(z) < 1.4 || Math.abs(x - z) < 1.7 || Math.abs(x + z) < 1.7;
}

function Ground({ positions }: { positions: [number, number, number][] }) {
  const trees = useMemo(
    () =>
      Array.from({ length: 110 }, (_, index) => {
        const angle = (index * 2.399) % (Math.PI * 2);
        const radius = 28 + ((index * 11) % 150);
        return [Math.cos(angle) * radius, Math.sin(angle) * radius - 58, 0.7 + (index % 4) * 0.12] as const;
      }).filter(([x, z]) => {
        const outsideCities = positions.every(([cityX, , cityZ]) => Math.hypot(x - cityX, z - cityZ) > 10.5);
        return outsideCities && !isNearRoad(x, z) && z < 15;
      }),
    [positions]
  );

  return (
    <group>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, -0.08, -18]}>
        <planeGeometry args={[360, 310]} />
        <meshStandardMaterial color="#6d8a5e" roughness={0.95} />
      </mesh>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, -0.05, 29]}>
        <planeGeometry args={[360, 22]} />
        <meshStandardMaterial color="#4d9eae" roughness={0.35} metalness={0.08} />
      </mesh>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, -0.02, 17]}>
        <planeGeometry args={[360, 3]} />
        <meshStandardMaterial color="#d6c49d" roughness={0.9} />
      </mesh>
      {trees.map(([x, z, scale], index) => (
        <Tree key={index} position={[x, 0, z]} scale={scale} />
      ))}
      <mesh castShadow receiveShadow position={[39, 2.4, -34]}>
        <coneGeometry args={[8, 5, 7]} />
        <meshStandardMaterial color="#71836b" roughness={1} />
      </mesh>
      <mesh castShadow receiveShadow position={[-41, 1.9, -39]}>
        <coneGeometry args={[7, 4, 7]} />
        <meshStandardMaterial color="#71836b" roughness={1} />
      </mesh>
    </group>
  );
}

function Tree({ position, scale }: { position: [number, number, number]; scale: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.12, 0.17, 1.4, 8]} />
        <meshStandardMaterial color="#76563b" roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0, 1.65, 0]}>
        <coneGeometry args={[0.75, 1.8, 9]} />
        <meshStandardMaterial color="#2f6548" roughness={0.9} />
      </mesh>
    </group>
  );
}

function WorldRoads({ positions }: { positions: [number, number, number][] }) {
  return (
    <group>
      {positions.slice(1).map(([x, , z], index) => {
        const length = Math.sqrt(x * x + z * z);
        const angle = Math.atan2(z, x);
        return (
          <mesh
            key={index}
            receiveShadow
            position={[x / 2, 0.01, z / 2]}
            rotation-y={-angle}
          >
            <boxGeometry args={[length, 0.08, 1.5]} />
            <meshStandardMaterial color="#777b73" roughness={0.96} />
          </mesh>
        );
      })}
      <mesh receiveShadow position={[0, 0.012, -136]} rotation-y={Math.PI / 2}>
        <boxGeometry args={[84, 0.08, 1.5]} />
        <meshStandardMaterial color="#777b73" roughness={0.96} />
      </mesh>
    </group>
  );
}

function WorldBoundary() {
  const width = WORLD_MAX_X - WORLD_MIN_X;
  const depth = WORLD_MAX_Z - WORLD_MIN_Z;
  const centerX = (WORLD_MIN_X + WORLD_MAX_X) / 2;
  const centerZ = (WORLD_MIN_Z + WORLD_MAX_Z) / 2;

  return (
    <group>
      <mesh receiveShadow position={[centerX, 0.045, WORLD_MIN_Z]}>
        <boxGeometry args={[width, 0.09, 1.05]} />
        <meshStandardMaterial color="#314f57" roughness={0.82} emissive="#12343b" emissiveIntensity={0.18} />
      </mesh>
      <mesh receiveShadow position={[centerX, 0.045, WORLD_MAX_Z]}>
        <boxGeometry args={[width, 0.09, 1.05]} />
        <meshStandardMaterial color="#314f57" roughness={0.82} emissive="#12343b" emissiveIntensity={0.18} />
      </mesh>
      <mesh receiveShadow position={[WORLD_MIN_X, 0.045, centerZ]}>
        <boxGeometry args={[1.05, 0.09, depth]} />
        <meshStandardMaterial color="#314f57" roughness={0.82} emissive="#12343b" emissiveIntensity={0.18} />
      </mesh>
      <mesh receiveShadow position={[WORLD_MAX_X, 0.045, centerZ]}>
        <boxGeometry args={[1.05, 0.09, depth]} />
        <meshStandardMaterial color="#314f57" roughness={0.82} emissive="#12343b" emissiveIntensity={0.18} />
      </mesh>
      {[
        [WORLD_MIN_X, WORLD_MIN_Z],
        [WORLD_MAX_X, WORLD_MIN_Z],
        [WORLD_MIN_X, WORLD_MAX_Z],
        [WORLD_MAX_X, WORLD_MAX_Z]
      ].map(([x, z]) => (
        <mesh key={`${x}-${z}`} castShadow position={[x, 0.62, z]}>
          <cylinderGeometry args={[0.28, 0.34, 1.25, 8]} />
          <meshStandardMaterial color="#e5b14c" roughness={0.45} metalness={0.2} emissive="#7c5420" emissiveIntensity={0.2} />
        </mesh>
      ))}
    </group>
  );
}

function RepoBuilding({ repo, index, repoCount }: { repo: GitHubRepo; index: number; repoCount: number }) {
  const setSelectedRepo = useKingdomStore((state) => state.setSelectedRepo);
  const setSelected = useKingdomStore((state) => state.setSelected);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const [x, z] = repoPlacement(index, repoCount);
  const height = MathUtils.clamp(1.2 + Math.log10(repo.stars + 1) * 0.68, 1.4, 5.2);
  const color = languageColors[repo.language ?? ""] ?? repoColors[index % repoColors.length];
  const plaqueY = Math.min(height - 0.12, 2.2);

  return (
    <group position={[x, 0, z]}>
      <mesh
        receiveShadow
        position={[0, height / 2, 0]}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          setSelected(`${repo.name} - ${repo.language ?? "Mixed stack"} - ${repo.stars.toLocaleString()} stars`);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(event) => {
          event.stopPropagation();
          setSelectedRepo(repo);
        }}
      >
        <boxGeometry args={[1.6, height, 1.6]} />
        <meshStandardMaterial color={hovered ? "#f6f3eb" : color} roughness={0.58} metalness={0.08} />
      </mesh>
      <mesh position={[0, height + 0.22, 0]}>
        <boxGeometry args={[1.78, 0.25, 1.78]} />
        <meshStandardMaterial color="#334b55" roughness={0.62} />
      </mesh>
      <mesh position={[0, height + 0.58, 0]}>
        <boxGeometry args={[0.2, 0.7, 0.2]} />
        <meshStandardMaterial color="#e5b14c" metalness={0.2} />
      </mesh>
      {Array.from({ length: Math.min(4, Math.max(2, Math.floor(height))) }, (_, floor) => (
        <mesh key={floor} position={[0, 0.55 + floor * 0.72, 0.806]}>
          <boxGeometry args={[0.9, 0.2, 0.02]} />
          <meshBasicMaterial color="#b6eef4" />
        </mesh>
      ))}
      {[-0.806, 0.806].map((side) => (
        <mesh key={side} position={[side, height * 0.5, 0]}>
          <boxGeometry args={[0.02, height * 0.7, 0.72]} />
          <meshStandardMaterial color="#e2d7bd" roughness={0.65} />
        </mesh>
      ))}
      <mesh position={[0, plaqueY, 0.835]}>
        <boxGeometry args={[1.46, 0.56, 0.05]} />
        <meshStandardMaterial color="#203844" roughness={0.7} metalness={0.08} />
      </mesh>
      <Text
        position={[0, plaqueY, 0.875]}
        fontSize={0.105}
        color="#f8f4e8"
        anchorX="center"
        anchorY="middle"
        maxWidth={1.28}
        textAlign="center"
      >
        {`${displayRepoName(repo.name)}\n${repoMeta(repo)}`}
      </Text>
    </group>
  );
}

function CityHall({ city }: { city: DeveloperCity }) {
  const setSelected = useKingdomStore((state) => state.setSelected);
  const setSelectedCity = useKingdomStore((state) => state.setSelectedCity);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  return (
    <group
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(event) => {
        event.stopPropagation();
        setSelectedCity(city);
        setSelected(`${city.name} - ${city.publicRepos} repositories`);
      }}
    >
      <mesh castShadow receiveShadow position={[0, 1.2, 0]}>
        <boxGeometry args={[4.25, 2.4, 3.8]} />
        <meshStandardMaterial color={hovered ? "#f7d79c" : "#e4c892"} roughness={0.72} />
      </mesh>
      <mesh castShadow receiveShadow position={[-2.7, 0.9, 0.15]}>
        <boxGeometry args={[1.15, 1.8, 2.6]} />
        <meshStandardMaterial color="#d7b978" roughness={0.76} />
      </mesh>
      <mesh castShadow receiveShadow position={[2.7, 0.9, 0.15]}>
        <boxGeometry args={[1.15, 1.8, 2.6]} />
        <meshStandardMaterial color="#d7b978" roughness={0.76} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 2.47, 0]}>
        <boxGeometry args={[4.7, 0.28, 3.85]} />
        <meshStandardMaterial color="#3e5968" roughness={0.56} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 2.76, 0]}>
        <boxGeometry args={[3.72, 0.28, 3.08]} />
        <meshStandardMaterial color="#4e7180" roughness={0.5} metalness={0.05} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 3.1, 0]}>
        <cylinderGeometry args={[1.28, 1.52, 0.72, 8]} />
        <meshStandardMaterial color="#426674" roughness={0.5} metalness={0.05} />
      </mesh>
      <mesh castShadow position={[0, 3.68, 0]}>
        <coneGeometry args={[1.36, 0.82, 8]} />
        <meshStandardMaterial color="#263f4a" roughness={0.48} />
      </mesh>
      <mesh castShadow position={[0, 4.22, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 1.05, 10]} />
        <meshStandardMaterial color="#f0c45b" roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh castShadow position={[0, 4.82, 0]}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial color="#f0c45b" roughness={0.35} metalness={0.25} />
      </mesh>
      {[
        [-1.65, 2.96, 1.45],
        [1.65, 2.96, 1.45],
        [-1.65, 2.96, -1.45],
        [1.65, 2.96, -1.45]
      ].map(([x, y, z]) => (
        <mesh key={`${x}-${z}`} castShadow position={[x, y, z]}>
          <boxGeometry args={[0.42, 0.24, 0.42]} />
          <meshStandardMaterial color="#f0c45b" roughness={0.52} metalness={0.12} />
        </mesh>
      ))}
      <mesh receiveShadow position={[0, 0.12, 2.45]}>
        <boxGeometry args={[4.9, 0.22, 1.3]} />
        <meshStandardMaterial color="#b7a071" roughness={0.88} />
      </mesh>
      <mesh castShadow position={[0, 1.15, 1.8]}>
        <boxGeometry args={[1.25, 1.75, 0.22]} />
        <meshStandardMaterial color="#5f4634" roughness={0.8} />
      </mesh>
      {[-1.45, 0, 1.45].map((x) => (
        <mesh key={x} castShadow position={[x, 1.32, 1.78]}>
          <boxGeometry args={[0.48, 0.68, 0.24]} />
          <meshStandardMaterial color="#bde4ed" roughness={0.35} />
        </mesh>
      ))}
      {[-2.65, 2.65].map((x) => (
        <mesh key={x} castShadow position={[x, 1.16, 1.52]}>
          <cylinderGeometry args={[0.13, 0.16, 1.85, 10]} />
          <meshStandardMaterial color="#f1deaa" roughness={0.68} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 2.26, 1.92]}>
        <boxGeometry args={[3.7, 0.62, 0.14]} />
        <meshStandardMaterial color="#203844" roughness={0.64} metalness={0.08} />
      </mesh>
      <Text
        position={[0, 2.29, 2.01]}
        fontSize={0.3}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        maxWidth={2.9}
        textAlign="center"
      >
        @{city.login}
      </Text>
      <mesh castShadow position={[0, 0.72, 2.05]}>
        <boxGeometry args={[3.25, 0.55, 0.12]} />
        <meshStandardMaterial color="#314c57" roughness={0.65} />
      </mesh>
      <Text
        position={[0, 0.73, 2.125]}
        fontSize={0.16}
        color="#f8f4e8"
        anchorX="center"
        anchorY="middle"
        maxWidth={2.9}
        textAlign="center"
      >
        {`${city.publicRepos.toLocaleString()} repos  ★ ${city.totalStars.toLocaleString()}\n${city.topLanguages.join(" / ") || "Mixed stack"}`}
      </Text>
    </group>
  );
}

function SkillMarkers({ languages }: { languages: string[] }) {
  return (
    <>
      {languages.map((language, index) => {
        const angle = index * (Math.PI / 2) + 0.55;
        return (
          <group key={language} position={[Math.cos(angle) * 7.1, 0, Math.sin(angle) * 7.1]}>
            <mesh castShadow position={[0, 0.55, 0]}>
              <cylinderGeometry args={[0.42, 0.58, 1.1, 8]} />
              <meshStandardMaterial color={languageColors[language] ?? "#829f73"} roughness={0.62} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function DeveloperCityView({ city, position }: { city: DeveloperCity; position: [number, number, number] }) {
  const repos = visibleRepos(city);
  const radius = cityRadius(repos.length);
  const boulevardLength = Math.max(10, radius * 2 - 5);
  return (
    <group position={position}>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, -0.01, 0]}>
        <circleGeometry args={[radius, 64]} />
        <meshStandardMaterial color="#789b67" roughness={0.94} />
      </mesh>
      <mesh receiveShadow position={[0, 0.01, 0]}>
        <cylinderGeometry args={[CITY_PLAZA_RADIUS + 0.35, CITY_PLAZA_RADIUS + 0.35, 0.08, 48]} />
        <meshStandardMaterial color="#c8b88e" roughness={0.9} />
      </mesh>
      <mesh receiveShadow position={[0, 0.03, 0]}>
        <boxGeometry args={[boulevardLength, 0.08, CITY_ROAD_HALF_WIDTH * 2]} />
        <meshStandardMaterial color="#777b73" roughness={0.96} />
      </mesh>
      <mesh receiveShadow position={[0, 0.035, 0]}>
        <boxGeometry args={[CITY_ROAD_HALF_WIDTH * 2, 0.08, boulevardLength]} />
        <meshStandardMaterial color="#777b73" roughness={0.96} />
      </mesh>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.005, 0]}>
        <ringGeometry args={[radius - 1.4, radius - 0.8, 64]} />
        <meshStandardMaterial color="#7f8178" roughness={0.98} />
      </mesh>
      <CityHall city={city} />
      {repos.map((repo, index) => (
        <RepoBuilding key={repo.id} repo={repo} index={index} repoCount={repos.length} />
      ))}
      <SkillMarkers languages={city.topLanguages} />
    </group>
  );
}

function Player({ cities, positions }: { cities: DeveloperCity[]; positions: [number, number, number][] }) {
  const player = useRef<Group>(null);
  const avatar = useRef<Group>(null);
  const keys = useRef<Record<string, boolean>>({});
  const velocity = useRef(new Vector3());
  const { camera } = useThree();
  const activeCity = useKingdomStore((state) => state.activeCity);
  const mobileMove = useKingdomStore((state) => state.mobileMove);
  const setSelected = useKingdomStore((state) => state.setSelected);
  const collisionCircles = useMemo(() => cityCollisionCircles(cities, positions), [cities, positions]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      keys.current[event.key.toLowerCase()] = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.current[event.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    setSelected(activeCity ? `Exploring @${activeCity}` : "World map");
  }, [activeCity, setSelected]);

  useFrame((_, delta) => {
    if (!player.current) return;
    const keyboardInput = new Vector3(
      Number(Boolean(keys.current.d || keys.current.arrowright)) -
        Number(Boolean(keys.current.a || keys.current.arrowleft)),
      0,
      Number(Boolean(keys.current.s || keys.current.arrowdown)) -
        Number(Boolean(keys.current.w || keys.current.arrowup))
    );
    const mobileInput = new Vector3(mobileMove.x, 0, mobileMove.z);
    const input = keyboardInput.lengthSq() > 0 ? keyboardInput : mobileInput;
    const speed = keys.current.shift || mobileMove.running ? 8 : 4.8;
    if (input.lengthSq() > 0) input.normalize().multiplyScalar(speed);
    velocity.current.lerp(input, 1 - Math.exp(-delta * (input.lengthSq() ? 9 : 13)));
    const next = player.current.position.clone().addScaledVector(velocity.current, delta);
    next.x = MathUtils.clamp(next.x, WORLD_MIN_X, WORLD_MAX_X);
    next.z = MathUtils.clamp(next.z, WORLD_MIN_Z, WORLD_MAX_Z);
    const collides = collisionCircles.some(({ x, z, radius }) => Math.hypot(next.x - x, next.z - z) < radius);
    if (!collides) player.current.position.copy(next);
    else velocity.current.multiplyScalar(0.12);
    if (velocity.current.lengthSq() > 0.08) {
      player.current.rotation.y = Math.atan2(velocity.current.x, velocity.current.z);
      if (avatar.current) avatar.current.position.y = Math.abs(Math.sin(Date.now() * 0.011)) * 0.09;
    } else if (avatar.current) {
      avatar.current.position.y = MathUtils.lerp(avatar.current.position.y, 0, 0.15);
    }
    const target = player.current.position.clone().add(new Vector3(0, 7.5, 10));
    camera.position.lerp(target, 0.05);
    camera.lookAt(player.current.position.clone().add(new Vector3(0, 1.3, 0)));
  });

  return (
    <group ref={player} position={[0, 0, 8]}>
      <group ref={avatar}>
        <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.58, 24]} />
          <meshBasicMaterial color="#1f3d47" transparent opacity={0.22} />
        </mesh>
        <mesh castShadow position={[0, 1.64, 0]}>
          <sphereGeometry args={[0.34, 18, 18]} />
          <meshStandardMaterial color="#b97855" roughness={0.88} />
        </mesh>
        <mesh castShadow position={[0, 1.86, -0.04]}>
          <sphereGeometry args={[0.27, 16, 10]} />
          <meshStandardMaterial color="#26363b" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.69, 0.34]}>
          <boxGeometry args={[0.34, 0.045, 0.035]} />
          <meshBasicMaterial color="#26363b" />
        </mesh>
        {[-0.39, 0.39].map((x) => (
          <mesh key={x} castShadow position={[x, 1.65, 0.02]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.13, 0.13, 0.08, 16]} />
            <meshStandardMaterial color="#203844" roughness={0.5} metalness={0.08} />
          </mesh>
        ))}
        <mesh castShadow position={[0, 1.65, 0.02]}>
          <torusGeometry args={[0.39, 0.025, 8, 28, Math.PI]} />
          <meshStandardMaterial color="#203844" roughness={0.45} metalness={0.12} />
        </mesh>
        {[-0.12, 0.12].map((x) => (
          <mesh key={x} position={[x, 1.66, 0.31]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshBasicMaterial color="#14252a" />
          </mesh>
        ))}
        <mesh position={[0, 1.55, 0.33]}>
          <boxGeometry args={[0.16, 0.035, 0.025]} />
          <meshBasicMaterial color="#f6d7bd" />
        </mesh>
        <mesh castShadow position={[0, 1, 0]}>
          <capsuleGeometry args={[0.38, 0.72, 8, 16]} />
          <meshStandardMaterial color="#2d5f87" roughness={0.78} />
        </mesh>
        <mesh castShadow position={[0, 1.16, 0.36]}>
          <boxGeometry args={[0.58, 0.38, 0.08]} />
          <meshStandardMaterial color="#f0c45b" roughness={0.58} metalness={0.08} />
        </mesh>
        <Text
          position={[0, 1.16, 0.415]}
          fontSize={0.18}
          color="#14252a"
          anchorX="center"
          anchorY="middle"
          maxWidth={0.45}
        >
          DEV
        </Text>
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh castShadow position={[side * 0.33, 1.2, 0.02]}>
              <sphereGeometry args={[0.115, 12, 12]} />
              <meshStandardMaterial color="#b97855" roughness={0.86} />
            </mesh>
            <mesh castShadow position={[side * 0.4, 0.92, 0.08]} rotation-z={side < 0 ? 0.24 : -0.24}>
              <capsuleGeometry args={[0.095, 0.5, 6, 12]} />
              <meshStandardMaterial color="#b97855" roughness={0.86} />
            </mesh>
          </group>
        ))}
        {[-0.19, 0.19].map((x) => (
          <mesh key={x} castShadow position={[x, 0.35, 0]}>
            <capsuleGeometry args={[0.13, 0.58, 6, 12]} />
            <meshStandardMaterial color="#26363b" />
          </mesh>
        ))}
        {[-0.19, 0.19].map((x) => (
          <mesh key={x} castShadow position={[x, 0.08, 0.12]}>
            <boxGeometry args={[0.28, 0.12, 0.42]} />
            <meshStandardMaterial color="#182529" roughness={0.72} />
          </mesh>
        ))}
        <mesh castShadow position={[0, 1.02, -0.38]}>
          <boxGeometry args={[0.66, 0.78, 0.22]} />
          <meshStandardMaterial color="#d77a35" roughness={0.74} />
        </mesh>
      </group>
    </group>
  );
}

export function DevVerseScene() {
  const cities = useKingdomStore((state) => state.cities);
  const positions = useMemo(() => cityPositions(cities), [cities]);

  return (
    <>
      <color attach="background" args={["#a8d4e4"]} />
      <fog attach="fog" args={["#a8d4e4", 40, 105]} />
      <ambientLight intensity={1.05} />
      <hemisphereLight color="#d9f2ff" groundColor="#4f6949" intensity={1.15} />
      <directionalLight
        castShadow
        position={[18, 28, 14]}
        intensity={2.2}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={120}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
      />
      <Ground positions={positions} />
      <WorldBoundary />
      <WorldRoads positions={positions} />
      {cities.map((city, index) => (
        <DeveloperCityView key={city.login} city={city} position={positions[index] ?? [0, 0, -45]} />
      ))}
      <Player cities={cities} positions={positions} />
    </>
  );
}
