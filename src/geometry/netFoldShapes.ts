import type { NetFace, NetLayout, Point2 } from "./netLayout";

export type EdgeIndex = 0 | 1 | 2 | 3;

export interface Shape {
  face: NetFace;
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  height: number;
  corners2d: [Point2, Point2, Point2, Point2];
  edges: Array<{ index: EdgeIndex; a: Point2; b: Point2 }>;
}

export const EPS = 1e-6;

const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPS;

function isPoint2(value: unknown): value is Point2 {
  const p = value as Point2;
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function shapeOf(face: NetFace): Shape | null {
  if (
    !face ||
    typeof face.id !== "string" ||
    face.id.length === 0 ||
    !isPoint2(face.origin) ||
    !face.size
  ) {
    return null;
  }
  if (
    !Number.isFinite(face.size.width) ||
    face.size.width <= 0 ||
    !Number.isFinite(face.size.height) ||
    face.size.height <= 0
  ) {
    return null;
  }
  if (![0, 1, 2, 3].includes(face.quarterTurns)) return null;
  const rotated = face.quarterTurns % 2 === 1;
  const width = rotated ? face.size.height : face.size.width;
  const height = rotated ? face.size.width : face.size.height;
  const x0 = face.origin.x,
    y0 = face.origin.y,
    x1 = x0 + width,
    y1 = y0 + height;
  return {
    face,
    id: face.id,
    x0,
    y0,
    x1,
    y1,
    width,
    height,
    corners2d: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
    edges: [
      { index: 0, a: { x: x0, y: y0 }, b: { x: x1, y: y0 } },
      { index: 1, a: { x: x1, y: y0 }, b: { x: x1, y: y1 } },
      { index: 2, a: { x: x1, y: y1 }, b: { x: x0, y: y1 } },
      { index: 3, a: { x: x0, y: y1 }, b: { x: x0, y: y0 } },
    ],
  };
}

export function buildShapes(
  layout: NetLayout,
): { shapes: Shape[]; dims: [number, number, number] } | null {
  if (
    !layout ||
    !Array.isArray(layout.faces) ||
    !Array.isArray(layout.sideLengths) ||
    layout.sideLengths.length !== 3
  ) {
    return null;
  }
  const dims: [number, number, number] = [
    layout.sideLengths[0],
    layout.sideLengths[1],
    layout.sideLengths[2],
  ];
  if (
    !dims.every((n) => Number.isFinite(n) && n > 0) ||
    (layout.kind !== "cube" && layout.kind !== "cuboid")
  ) {
    return null;
  }
  if (layout.kind === "cube" && !dims.every((n) => near(n, dims[0]))) {
    return null;
  }
  const ids = new Set<string>(),
    shapes: Shape[] = [];
  for (const face of layout.faces) {
    const shape = shapeOf(face);
    if (!shape || ids.has(shape.id)) return null;
    ids.add(shape.id);
    shapes.push(shape);
  }
  return { shapes, dims };
}

export function contactOf(
  a: { a: Point2; b: Point2 },
  b: { a: Point2; b: Point2 },
): { kind: "shared" | "partial"; location: Point2 } | null {
  const horizontal = near(a.a.y, a.b.y);
  if (
    horizontal !== near(b.a.y, b.b.y) ||
    (horizontal ? !near(a.a.y, b.a.y) : !near(a.a.x, b.a.x))
  ) {
    return null;
  }
  const aLow = horizontal ? Math.min(a.a.x, a.b.x) : Math.min(a.a.y, a.b.y),
    aHigh = horizontal ? Math.max(a.a.x, a.b.x) : Math.max(a.a.y, a.b.y),
    bLow = horizontal ? Math.min(b.a.x, b.b.x) : Math.min(b.a.y, b.b.y),
    bHigh = horizontal ? Math.max(b.a.x, b.b.x) : Math.max(b.a.y, b.b.y);
  const low = Math.max(aLow, bLow),
    high = Math.min(aHigh, bHigh);
  if (high <= low + EPS) return null;
  const shared =
    near(high - low, aHigh - aLow) && near(high - low, bHigh - bLow);
  return {
    kind: shared ? "shared" : "partial",
    location: horizontal
      ? { x: (low + high) / 2, y: a.a.y }
      : { x: a.a.x, y: (low + high) / 2 },
  };
}
