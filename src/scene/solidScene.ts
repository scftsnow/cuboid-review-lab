import * as THREE from "three";
import type { BoxTopology, VertexId } from "../geometry/solid";

const PART_KINDS = ["face", "edge", "vertex"] as const;
type PartKind = (typeof PART_KINDS)[number];

export interface SolidSceneOptions {
  readonly visibleParts?: readonly PartKind[];
  readonly highlightedIds?: readonly string[];
}

export interface SolidSceneResult {
  scene: THREE.Scene;
  pickables: THREE.Object3D[];
}

const PART_COLORS: Record<PartKind, number> = {
  face: 0x74c7ff,
  edge: 0x163b57,
  vertex: 0xffc857,
};
const HIGHLIGHT_COLOR = 0xff7a3d;
const FACE_OPACITY = 0.28;
const HIGHLIGHTED_FACE_OPACITY = 0.72;
const SCALE = 1.5;

function createPickable(
  id: string,
  kind: PartKind,
  geometry: THREE.BufferGeometry,
  highlighted: boolean,
): THREE.Mesh {
  const opacity =
    kind === "face"
      ? highlighted
        ? HIGHLIGHTED_FACE_OPACITY
        : FACE_OPACITY
      : 1;
  const material = new THREE.MeshBasicMaterial({
    color: highlighted ? HIGHLIGHT_COLOR : PART_COLORS[kind],
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.pickId = id;
  return mesh;
}

function pointFor(
  positions: ReadonlyMap<VertexId, readonly [number, number, number]>,
  id: VertexId,
): THREE.Vector3 {
  const [x, y, z] = positions.get(id) ?? [0, 0, 0];
  return new THREE.Vector3(
    (x - 0.5) * SCALE,
    (y - 0.5) * SCALE,
    (z - 0.5) * SCALE,
  );
}

export function buildSolidScene(
  topology: BoxTopology,
  options: SolidSceneOptions = {},
): SolidSceneResult {
  const scene = new THREE.Scene();
  const result: SolidSceneResult = { scene, pickables: [] };
  const visibleParts = new Set<PartKind>(options.visibleParts ?? PART_KINDS);
  const highlightedIds = new Set<string>(options.highlightedIds ?? []);

  function addPart(
    id: string,
    kind: PartKind,
    geometry: THREE.BufferGeometry,
  ): void {
    const part = createPickable(id, kind, geometry, highlightedIds.has(id));
    scene.add(part);
    result.pickables.push(part);
  }

  if (visibleParts.size === 0) {
    return result;
  }

  const positions = new Map(
    topology.vertices.map((vertex) => [vertex.id, vertex.position]),
  );

  if (visibleParts.has("face")) {
    for (const face of topology.faces) {
      const values = face.vertexIds.flatMap((id) => {
        const point = pointFor(positions, id);
        return [point.x, point.y, point.z];
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(values, 3),
      );
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.computeVertexNormals();
      addPart(face.id, "face", geometry);
    }
  }

  if (visibleParts.has("edge")) {
    const up = new THREE.Vector3(0, 1, 0);
    for (const edge of topology.edges) {
      const start = pointFor(positions, edge.endpoints[0]);
      const end = pointFor(positions, edge.endpoints[1]);
      const direction = end.clone().sub(start);
      const part = createPickable(
        edge.id,
        "edge",
        new THREE.CylinderGeometry(0.04, 0.04, direction.length(), 8),
        highlightedIds.has(edge.id),
      );
      part.position.copy(start).add(end).multiplyScalar(0.5);
      part.quaternion.setFromUnitVectors(up, direction.normalize());
      scene.add(part);
      result.pickables.push(part);
    }
  }

  if (visibleParts.has("vertex")) {
    for (const vertex of topology.vertices) {
      const part = createPickable(
        vertex.id,
        "vertex",
        new THREE.SphereGeometry(0.09, 12, 12),
        highlightedIds.has(vertex.id),
      );
      part.position.copy(pointFor(positions, vertex.id));
      scene.add(part);
      result.pickables.push(part);
    }
  }

  return result;
}

export default buildSolidScene;
