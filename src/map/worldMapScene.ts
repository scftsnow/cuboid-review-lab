import * as THREE from "three";

export type MapPlace = {
  id: string;
  sequence: number;
  completed: boolean;
};

export type BuiltWorldMapScene = {
  scene: THREE.Scene;
  pickables: THREE.Object3D[];
};

type Position = readonly [number, number, number];

function addBox(
  parent: THREE.Object3D,
  color: number,
  position: Position,
  size: Position,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
  );
  mesh.position.set(position[0], position[1], position[2]);
  parent.add(mesh);
  return mesh;
}

function buildPlace(place: MapPlace, recommended: boolean): THREE.Group {
  const group = new THREE.Group();
  group.userData.pickId = `place-${place.id}`;
  const color = place.completed ? 0x62d69a : recommended ? 0xf9d66b : 0x8fb6ff;
  const towerHeight = 0.5 + place.sequence * 0.3;
  addBox(group, 0x245984, [0, 0.3, 0], [2.4, 0.6, 2.4]);
  addBox(group, color, [0, 1.05, 0], [1.9, 0.9, 1.9]);
  addBox(group, 0xf7fbff, [0, 1.6, 0], [1.3, 0.2, 1.3]);
  addBox(group, color, [0, 1.7 + towerHeight / 2, 0], [0.9, towerHeight, 0.9]);
  if (recommended) {
    addBox(group, 0xfff1a8, [0, 2.9 + towerHeight, 0], [0.6, 0.6, 0.6]);
  }
  return group;
}

export function buildWorldMapScene(
  places: readonly MapPlace[],
  recommendedId: string | null,
): BuiltWorldMapScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#12315a");
  scene.userData.placePickIds = places.map((place) => `place-${place.id}`);
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1c9, 2);
  sun.position.set(8, 14, 10);
  scene.add(sun);
  addBox(scene, 0x1b4776, [0, -0.4, 0], [18, 0.8, 12]);
  addBox(scene, 0x3f74a8, [0, 0.05, 0], [15, 0.12, 1.1]);

  const xPositions = [-6, -3, 0, 3, 6];
  const zPositions = [0, 1.5, -1.5, 1, -1];
  const pickables = places.map((place, index) => {
    const group = buildPlace(place, place.id === recommendedId);
    group.position.set(xPositions[index] ?? 0, 0, zPositions[index] ?? 0);
    scene.add(group);
    return group;
  });
  return { scene, pickables };
}

export function disposeWorldMapScene(scene: THREE.Scene | null): void {
  scene?.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }
    node.geometry.dispose();
    const materials = Array.isArray(node.material)
      ? node.material
      : [node.material];
    materials.forEach((material) => material.dispose());
  });
}
