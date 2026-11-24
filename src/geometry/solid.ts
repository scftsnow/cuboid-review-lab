export type SolidKind = "cube" | "cuboid" | "cone" | "triangular-prism";
export type SolidLabel = "정육면체" | "직육면체" | "그 외";
export interface SolidDimensions {
  width: number;
  height: number;
  depth: number;
}
export interface SolidExample {
  id: string;
  kind: SolidKind;
  label: SolidLabel;
  nameKo: string;
  promptKo: string;
  dimensions: SolidDimensions | null;
}
type SolidFailureReason =
  "UNKNOWN_EXAMPLE" | "UNSUPPORTED_TOPOLOGY" | "INVALID_SELECTION";
export type SolidResult<T> =
  { ok: true; value: T } | { ok: false; reason: SolidFailureReason };
export interface BoxVertex {
  id: VertexId;
  position: readonly [number, number, number];
}
export interface BoxEdge {
  id: EdgeId;
  endpoints: readonly [VertexId, VertexId];
  key: string;
}
export interface BoxFace {
  id: FaceId;
  vertexIds: readonly VertexId[];
  edgeIds: readonly EdgeId[];
  shape: "square" | "rectangle";
  size: readonly [number, number];
}
export interface BoxTopology {
  kind: "cube" | "cuboid";
  dimensions: SolidDimensions;
  vertices: readonly BoxVertex[];
  edges: readonly BoxEdge[];
  faces: readonly BoxFace[];
  counts: { faces: 6; edges: 12; vertices: 8 };
}

const VERTEX_POSITIONS = {
  v000: [0, 0, 0],
  v100: [1, 0, 0],
  v110: [1, 1, 0],
  v010: [0, 1, 0],
  v001: [0, 0, 1],
  v101: [1, 0, 1],
  v111: [1, 1, 1],
  v011: [0, 1, 1],
} as const;
export type VertexId = keyof typeof VERTEX_POSITIONS;
const EDGE_ENDPOINTS = {
  eBackBottom: ["v000", "v100"],
  eBackRight: ["v100", "v110"],
  eBackTop: ["v110", "v010"],
  eBackLeft: ["v010", "v000"],
  eFrontBottom: ["v001", "v101"],
  eFrontRight: ["v101", "v111"],
  eFrontTop: ["v111", "v011"],
  eFrontLeft: ["v011", "v001"],
  eBottomLeft: ["v000", "v001"],
  eBottomRight: ["v100", "v101"],
  eTopLeft: ["v010", "v011"],
  eTopRight: ["v110", "v111"],
} as const;
export type EdgeId = keyof typeof EDGE_ENDPOINTS;
const FACE_LAYOUTS = {
  fBack: {
    vertexIds: ["v000", "v100", "v110", "v010"],
    edgeIds: ["eBackBottom", "eBackRight", "eBackTop", "eBackLeft"],
    size: ["width", "height"],
  },
  fFront: {
    vertexIds: ["v001", "v101", "v111", "v011"],
    edgeIds: ["eFrontBottom", "eFrontRight", "eFrontTop", "eFrontLeft"],
    size: ["width", "height"],
  },
  fBottom: {
    vertexIds: ["v000", "v100", "v101", "v001"],
    edgeIds: ["eBackBottom", "eBottomRight", "eFrontBottom", "eBottomLeft"],
    size: ["width", "depth"],
  },
  fTop: {
    vertexIds: ["v010", "v110", "v111", "v011"],
    edgeIds: ["eBackTop", "eTopRight", "eFrontTop", "eTopLeft"],
    size: ["width", "depth"],
  },
  fLeft: {
    vertexIds: ["v000", "v010", "v011", "v001"],
    edgeIds: ["eBackLeft", "eTopLeft", "eFrontLeft", "eBottomLeft"],
    size: ["height", "depth"],
  },
  fRight: {
    vertexIds: ["v100", "v110", "v111", "v101"],
    edgeIds: ["eBackRight", "eTopRight", "eFrontRight", "eBottomRight"],
    size: ["height", "depth"],
  },
} as const;
export type FaceId = keyof typeof FACE_LAYOUTS;
const VERTEX_IDS = Object.keys(VERTEX_POSITIONS) as readonly VertexId[];
const EDGE_IDS = Object.keys(EDGE_ENDPOINTS) as readonly EdgeId[];
const FACE_IDS = Object.keys(FACE_LAYOUTS) as readonly FaceId[];
const SOLID_LABELS: readonly SolidLabel[] = ["정육면체", "직육면체", "그 외"];

const SOLID_EXAMPLES: readonly SolidExample[] = [
  {
    id: "solid-cube",
    kind: "cube",
    label: "정육면체",
    nameKo: "정육면체",
    promptKo: "여섯 면이 모두 같은 크기의 정사각형인 도형을 골라 보세요.",
    dimensions: { width: 2, height: 2, depth: 2 },
  },
  {
    id: "solid-cuboid",
    kind: "cuboid",
    label: "직육면체",
    nameKo: "직육면체",
    promptKo: "여섯 면이 직사각형이고 크기가 서로 다른 도형을 골라 보세요.",
    dimensions: { width: 4, height: 2, depth: 3 },
  },
  {
    id: "solid-cone",
    kind: "cone",
    label: "그 외",
    nameKo: "원뿔",
    promptKo: "직육면체나 정육면체가 아닌 도형을 골라 보세요.",
    dimensions: null,
  },
  {
    id: "solid-triangular-prism",
    kind: "triangular-prism",
    label: "그 외",
    nameKo: "삼각기둥",
    promptKo: "직육면체나 정육면체가 아닌 도형을 골라 보세요.",
    dimensions: null,
  },
];

function failure(reason: SolidFailureReason): {
  ok: false;
  reason: SolidFailureReason;
} {
  return { ok: false, reason };
}
function findExample(id: string): SolidExample | undefined {
  return SOLID_EXAMPLES.find((example) => example.id === id);
}
function buildBoxTopology(
  kind: "cube" | "cuboid",
  dimensions: SolidDimensions,
): BoxTopology {
  const vertices: BoxVertex[] = VERTEX_IDS.map((id) => ({
    id,
    position: VERTEX_POSITIONS[id],
  }));
  const edges: BoxEdge[] = EDGE_IDS.map((id) => {
    const endpoints = EDGE_ENDPOINTS[id];
    return { id, endpoints, key: edgeKey(endpoints[0], endpoints[1]) };
  });
  const faces: BoxFace[] = FACE_IDS.map((id) => {
    const layout = FACE_LAYOUTS[id];
    const size: readonly [number, number] = [
      dimensions[layout.size[0]],
      dimensions[layout.size[1]],
    ];
    return {
      id,
      vertexIds: layout.vertexIds,
      edgeIds: layout.edgeIds,
      shape: size[0] === size[1] ? "square" : "rectangle",
      size,
    };
  });
  return {
    kind,
    dimensions,
    vertices,
    edges,
    faces,
    counts: { faces: 6, edges: 12, vertices: 8 },
  };
}

export function edgeKey(a: VertexId, b: VertexId): string {
  return a < b ? a + "|" + b : b + "|" + a;
}
export function listSolidExamples(): readonly SolidExample[] {
  return SOLID_EXAMPLES;
}
export function getSolidExample(id: string): SolidResult<SolidExample> {
  const example = findExample(id);
  return example ? { ok: true, value: example } : failure("UNKNOWN_EXAMPLE");
}
export function getSolidTopology(exampleId: string): SolidResult<BoxTopology> {
  const example = findExample(exampleId);
  if (!example) {
    return failure("UNKNOWN_EXAMPLE");
  }
  if (example.kind !== "cube" && example.kind !== "cuboid") {
    return failure("UNSUPPORTED_TOPOLOGY");
  }
  if (example.dimensions === null) {
    return failure("UNSUPPORTED_TOPOLOGY");
  }
  return {
    ok: true,
    value: buildBoxTopology(example.kind, example.dimensions),
  };
}
export function gradeSolidClassification(
  exampleId: string,
  selected: SolidLabel,
): SolidResult<{
  expected: SolidLabel;
  selected: SolidLabel;
  correct: boolean;
}> {
  const example = findExample(exampleId);
  if (!example) {
    return failure("UNKNOWN_EXAMPLE");
  }
  if (!SOLID_LABELS.includes(selected)) {
    return failure("INVALID_SELECTION");
  }
  return {
    ok: true,
    value: {
      expected: example.label,
      selected,
      correct: example.label === selected,
    },
  };
}
