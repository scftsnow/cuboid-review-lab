import type { Point2 } from "./netLayout";
import type { EdgeIndex, Shape } from "./netFoldShapes";
import { EPS } from "./netFoldShapes";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Transform {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
}

export interface Placed {
  shapeId: string;
  transform: Transform;
  plane: string;
}

interface Candidate {
  plane: string;
  u: Vec3;
  v: Vec3;
  uLength: number;
  vLength: number;
}

const AXES = ["x", "y", "z"] as const;
const X: Vec3 = { x: 1, y: 0, z: 0 };
const Y: Vec3 = { x: 0, y: 1, z: 0 };
const Z: Vec3 = { x: 0, y: 0, z: 1 };

const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPS;

const add = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});

const sub = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});

const scale = (a: Vec3, k: number): Vec3 => ({
  x: a.x * k,
  y: a.y * k,
  z: a.z * k,
});

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

const normLength = (a: Vec3): number => Math.sqrt(dot(a, a));

const normalize = (a: Vec3): Vec3 =>
  normLength(a) <= EPS ? X : scale(a, 1 / normLength(a));

export function keyOf(p: Vec3): string {
  return `${Math.round(p.x / EPS)},${Math.round(p.y / EPS)},${Math.round(
    p.z / EPS,
  )}`;
}

function mapPoint(t: Transform, shape: Shape, p: Point2): Vec3 {
  return add(
    t.origin,
    add(scale(t.u, p.x - shape.x0), scale(t.v, p.y - shape.y0)),
  );
}

function rootCandidates(dims: [number, number, number]): Candidate[] {
  const [a, b, c] = dims;
  const options: Array<[string, Vec3, Vec3, number, number]> = [
    ["z:min", X, Y, a, b],
    ["z:min", Y, X, b, a],
    ["y:min", X, Z, a, c],
    ["y:min", Z, X, c, a],
    ["x:min", Y, Z, b, c],
    ["x:min", Z, Y, c, b],
  ];
  return options.map(([plane, u, v, uLength, vLength]) => ({
    plane,
    u,
    v,
    uLength,
    vLength,
  }));
}

export function chooseRoot(
  shapes: Shape[],
  dims: [number, number, number],
): Placed | null {
  for (const shape of [...shapes].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const candidate of rootCandidates(dims)) {
      if (
        near(shape.width, candidate.uLength) &&
        near(shape.height, candidate.vLength)
      ) {
        return {
          shapeId: shape.id,
          plane: candidate.plane,
          transform: {
            origin: { x: 0, y: 0, z: 0 },
            u: candidate.u,
            v: candidate.v,
          },
        };
      }
    }
  }
  return null;
}

export function cornersOf(t: Transform, shape: Shape): Vec3[] {
  const topRight = add(t.origin, scale(t.u, shape.width));
  return [
    t.origin,
    topRight,
    add(topRight, scale(t.v, shape.height)),
    add(t.origin, scale(t.v, shape.height)),
  ];
}

export function edgePoints(
  t: Transform,
  shape: Shape,
  index: EdgeIndex,
): [Vec3, Vec3] {
  const edge = shape.edges[index];
  return [mapPoint(t, shape, edge.a), mapPoint(t, shape, edge.b)];
}

function locatePlane(
  t: Transform,
  shape: Shape,
  dims: [number, number, number],
): string | null {
  const corners = cornersOf(t, shape);
  const limits = { x: dims[0], y: dims[1], z: dims[2] };
  for (const axis of AXES) {
    const values = corners.map((corner) => corner[axis]);
    const atMin = values.every((value) => near(value, 0));
    const atMax = values.every((value) => near(value, limits[axis]));
    if (!atMin && !atMax) continue;
    if (
      corners.every((corner) =>
        AXES.every(
          (other) =>
            corner[other] >= -EPS && corner[other] <= limits[other] + EPS,
        ),
      )
    ) {
      return `${axis}:${atMin ? "min" : "max"}`;
    }
  }
  return null;
}

function rotateAround(
  p: Vec3,
  origin: Vec3,
  axis: Vec3,
  degrees: number,
): Vec3 {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const r = sub(p, origin);
  return add(
    origin,
    add(
      add(scale(r, cos), scale(cross(axis, r), sin)),
      scale(axis, dot(axis, r) * (1 - cos)),
    ),
  );
}

function rotateTransform(
  t: Transform,
  origin: Vec3,
  axis: Vec3,
  degrees: number,
): Transform {
  const zero: Vec3 = { x: 0, y: 0, z: 0 };
  return {
    origin: rotateAround(t.origin, origin, axis, degrees),
    u: rotateAround(t.u, zero, axis, degrees),
    v: rotateAround(t.v, zero, axis, degrees),
  };
}

export function placeChild(
  parent: Shape,
  parentTransform: Transform,
  child: Shape,
  edgeIndex: EdgeIndex,
  dims: [number, number, number],
  usedPlanes: Set<string>,
): Placed | null {
  const pre: Transform = {
    origin: mapPoint(parentTransform, parent, { x: child.x0, y: child.y0 }),
    u: parentTransform.u,
    v: parentTransform.v,
  };
  const [edgeStart, edgeEnd] = edgePoints(parentTransform, parent, edgeIndex);
  const axis = normalize(sub(edgeEnd, edgeStart));
  const options = [90, -90]
    .map((angle) => rotateTransform(pre, edgeStart, axis, angle))
    .map((transform) => ({
      shapeId: child.id,
      transform,
      plane: locatePlane(transform, child, dims),
    }))
    .filter((option): option is Placed => option.plane !== null);
  if (options.length === 0) return null;
  options.sort(
    (a, b) => Number(usedPlanes.has(a.plane)) - Number(usedPlanes.has(b.plane)),
  );
  return options[0];
}

export function degreeOf(direction: Vec3): number {
  if (near(direction.x, 1) || near(direction.y, 1)) return 0;
  if (near(direction.z, 1)) return 90;
  if (near(direction.x, -1)) return 180;
  return 270;
}
