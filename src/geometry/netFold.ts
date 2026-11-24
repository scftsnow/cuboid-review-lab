import type { NetFace, NetLayout, Point2 } from "./netLayout";
export type FoldReasonCode = "INVALID_INPUT" | "EMPTY_LAYOUT" | "DISCONNECTED_FACE" | "EDGE_LENGTH_MISMATCH" | "OVERLAP_2D" | "FACE_OVERLAP_3D" | "UNMATCHED_EDGE" | "UNMATCHED_VERTEX";
export type EdgeIndex = 0 | 1 | 2 | 3;
export interface Vec3 { x: number; y: number; z: number; }
export interface FoldReason { code: FoldReasonCode; faceIds?: string[]; location?: Point2; }
export interface FoldedFace { id: string; foldedFaceId: string; faceId: string; plane: string; position: Vec3; rotation: number[]; corners: Vec3[]; draw: { x: number; y: number; width: number; height: number; rotation: number }; }
export interface FoldCorrespondence {
  faces: Array<{ faceId: string; foldedFaceId: string }>;
  edges: Array<{ foldedEdgeId: string; faceIds: string[]; points3d: Vec3[]; positions2d: Array<{ faceId: string; edgeIndex: EdgeIndex }> }>;
  vertices: Array<{ foldedVertexId: string; faceIds: string[]; point3d: Vec3; positions2d: Array<{ faceId: string; vertexIndex: EdgeIndex }> }>;
}
export interface FoldResult { ok: boolean; reasons: FoldReason[]; faces: FoldedFace[]; correspondence: FoldCorrespondence; }
interface Shape { face: NetFace; id: string; x0: number; y0: number; x1: number; y1: number; width: number; height: number; corners2d: [Point2, Point2, Point2, Point2]; edges: Array<{ index: EdgeIndex; a: Point2; b: Point2 }>; }
interface Transform { origin: Vec3; u: Vec3; v: Vec3; }
interface Adjacency { otherId: string; from: EdgeIndex; to: EdgeIndex; }
interface Candidate { plane: string; u: Vec3; v: Vec3; uLength: number; vLength: number; }
interface Placed { shapeId: string; transform: Transform; plane: string; }
interface EdgeBucket { key: string; points3d: Vec3[]; positions2d: Array<{ faceId: string; edgeIndex: EdgeIndex }>; locations: Point2[]; }
interface VertexBucket { key: string; point3d: Vec3; positions2d: Array<{ faceId: string; vertexIndex: EdgeIndex }>; locations: Point2[]; }
const EPS = 1e-6;
const AXES = ["x", "y", "z"] as const;
const X: Vec3 = { x: 1, y: 0, z: 0 };
const Y: Vec3 = { x: 0, y: 1, z: 0 };
const Z: Vec3 = { x: 0, y: 0, z: 1 };
const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPS;
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const normLength = (a: Vec3): number => Math.sqrt(dot(a, a));
const normalize = (a: Vec3): Vec3 => (normLength(a) <= EPS ? X : scale(a, 1 / normLength(a)));
const pointOf = (p: Vec3): Point2 => ({ x: p.x, y: p.y });
const keyOf = (p: Vec3): string => `${Math.round(p.x / EPS)},${Math.round(p.y / EPS)},${Math.round(p.z / EPS)}`;
const unique = <T,>(values: T[]): T[] => [...new Set(values)];
const emptyResult = (): FoldResult => ({ ok: false, reasons: [], faces: [], correspondence: { faces: [], edges: [], vertices: [] } });
function isPoint2(value: unknown): value is Point2 { const p = value as Point2; return !!p && Number.isFinite(p.x) && Number.isFinite(p.y); }
function shapeOf(face: NetFace): Shape | null {
  if (!face || typeof face.id !== "string" || face.id.length === 0 || !isPoint2(face.origin) || !face.size) return null;
  if (!Number.isFinite(face.size.width) || face.size.width <= 0 || !Number.isFinite(face.size.height) || face.size.height <= 0) return null;
  if (![0, 1, 2, 3].includes(face.quarterTurns)) return null;
  const rotated = face.quarterTurns % 2 === 1;
  const width = rotated ? face.size.height : face.size.width;
  const height = rotated ? face.size.width : face.size.height;
  const x0 = face.origin.x, y0 = face.origin.y, x1 = x0 + width, y1 = y0 + height;
  return { face, id: face.id, x0, y0, x1, y1, width, height,
    corners2d: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
    edges: [{ index: 0, a: { x: x0, y: y0 }, b: { x: x1, y: y0 } }, { index: 1, a: { x: x1, y: y0 }, b: { x: x1, y: y1 } }, { index: 2, a: { x: x1, y: y1 }, b: { x: x0, y: y1 } }, { index: 3, a: { x: x0, y: y1 }, b: { x: x0, y: y0 } }] };
}
function buildShapes(layout: NetLayout): { shapes: Shape[]; dims: [number, number, number] } | null {
  if (!layout || !Array.isArray(layout.faces) || !Array.isArray(layout.sideLengths) || layout.sideLengths.length !== 3) return null;
  const dims: [number, number, number] = [layout.sideLengths[0], layout.sideLengths[1], layout.sideLengths[2]];
  if (!dims.every((n) => Number.isFinite(n) && n > 0) || (layout.kind !== "cube" && layout.kind !== "cuboid")) return null;
  if (layout.kind === "cube" && !dims.every((n) => near(n, dims[0]))) return null;
  const ids = new Set<string>(), shapes: Shape[] = [];
  for (const face of layout.faces) { const shape = shapeOf(face); if (!shape || ids.has(shape.id)) return null; ids.add(shape.id); shapes.push(shape); }
  return { shapes, dims };
}
function contactOf(a: { a: Point2; b: Point2 }, b: { a: Point2; b: Point2 }): { kind: "shared" | "partial"; location: Point2 } | null {
  const horizontal = near(a.a.y, a.b.y);
  if (horizontal !== near(b.a.y, b.b.y) || (horizontal ? !near(a.a.y, b.a.y) : !near(a.a.x, b.a.x))) return null;
  const aLow = horizontal ? Math.min(a.a.x, a.b.x) : Math.min(a.a.y, a.b.y);
  const aHigh = horizontal ? Math.max(a.a.x, a.b.x) : Math.max(a.a.y, a.b.y);
  const bLow = horizontal ? Math.min(b.a.x, b.b.x) : Math.min(b.a.y, b.b.y);
  const bHigh = horizontal ? Math.max(b.a.x, b.b.x) : Math.max(b.a.y, b.b.y);
  const low = Math.max(aLow, bLow), high = Math.min(aHigh, bHigh);
  if (high <= low + EPS) return null;
  const shared = near(high - low, aHigh - aLow) && near(high - low, bHigh - bLow);
  return { kind: shared ? "shared" : "partial", location: horizontal ? { x: (low + high) / 2, y: a.a.y } : { x: a.a.x, y: (low + high) / 2 } };
}
function rootCandidates(dims: [number, number, number]): Candidate[] {
  const [a, b, c] = dims;
  const options: Array<[string, Vec3, Vec3, number, number]> = [["z:min", X, Y, a, b], ["z:min", Y, X, b, a], ["y:min", X, Z, a, c], ["y:min", Z, X, c, a], ["x:min", Y, Z, b, c], ["x:min", Z, Y, c, b]];
  return options.map(([plane, u, v, uLength, vLength]) => ({ plane, u, v, uLength, vLength }));
}
function chooseRoot(shapes: Shape[], dims: [number, number, number]): Placed | null {
  for (const shape of [...shapes].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const candidate of rootCandidates(dims)) {
      if (near(shape.width, candidate.uLength) && near(shape.height, candidate.vLength)) return { shapeId: shape.id, plane: candidate.plane, transform: { origin: { x: 0, y: 0, z: 0 }, u: candidate.u, v: candidate.v } };
    }
  }
  return null;
}
function cornersOf(t: Transform, shape: Shape): Vec3[] { const topRight = add(t.origin, scale(t.u, shape.width)); return [t.origin, topRight, add(topRight, scale(t.v, shape.height)), add(t.origin, scale(t.v, shape.height))]; }
function mapPoint(t: Transform, shape: Shape, p: Point2): Vec3 { return add(t.origin, add(scale(t.u, p.x - shape.x0), scale(t.v, p.y - shape.y0))); }
function edgePoints(t: Transform, shape: Shape, index: EdgeIndex): [Vec3, Vec3] { const edge = shape.edges[index]; return [mapPoint(t, shape, edge.a), mapPoint(t, shape, edge.b)]; }
function locatePlane(t: Transform, shape: Shape, dims: [number, number, number]): string | null {
  const corners = cornersOf(t, shape), limits = { x: dims[0], y: dims[1], z: dims[2] };
  for (const axis of AXES) {
    const values = corners.map((corner) => corner[axis]);
    const atMin = values.every((value) => near(value, 0)), atMax = values.every((value) => near(value, limits[axis]));
    if (!atMin && !atMax) continue;
    if (corners.every((corner) => AXES.every((other) => corner[other] >= -EPS && corner[other] <= limits[other] + EPS))) return `${axis}:${atMin ? "min" : "max"}`;
  }
  return null;
}
function rotateAround(p: Vec3, origin: Vec3, axis: Vec3, degrees: number): Vec3 {
  const radians = degrees * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians), r = sub(p, origin);
  return add(origin, add(add(scale(r, cos), scale(cross(axis, r), sin)), scale(axis, dot(axis, r) * (1 - cos))));
}
function rotateTransform(t: Transform, origin: Vec3, axis: Vec3, degrees: number): Transform { const zero: Vec3 = { x: 0, y: 0, z: 0 }; return { origin: rotateAround(t.origin, origin, axis, degrees), u: rotateAround(t.u, zero, axis, degrees), v: rotateAround(t.v, zero, axis, degrees) }; }
function placeChild(parent: Shape, parentTransform: Transform, child: Shape, edgeIndex: EdgeIndex, dims: [number, number, number], usedPlanes: Set<string>): Placed | null {
  const pre: Transform = { origin: mapPoint(parentTransform, parent, { x: child.x0, y: child.y0 }), u: parentTransform.u, v: parentTransform.v };
  const [edgeStart, edgeEnd] = edgePoints(parentTransform, parent, edgeIndex), axis = normalize(sub(edgeEnd, edgeStart));
  const options = [90, -90].map((angle) => rotateTransform(pre, edgeStart, axis, angle)).map((transform) => ({ shapeId: child.id, transform, plane: locatePlane(transform, child, dims) })).filter((option): option is Placed => option.plane !== null);
  if (options.length === 0) return null;
  options.sort((a, b) => Number(usedPlanes.has(a.plane)) - Number(usedPlanes.has(b.plane)));
  return options[0];
}
function degreeOf(direction: Vec3): number { if (near(direction.x, 1) || near(direction.y, 1)) return 0; if (near(direction.z, 1)) return 90; if (near(direction.x, -1)) return 180; return 270; }
function average(points: Point2[]): Point2 { if (points.length === 0) return { x: 0, y: 0 }; const sum = points.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y }), { x: 0, y: 0 }); return { x: sum.x / points.length, y: sum.y / points.length }; }
export function foldNetLayout(layout: NetLayout): FoldResult {
  const built = buildShapes(layout);
  if (!built) { const result = emptyResult(); result.reasons = [{ code: "INVALID_INPUT" }]; return result; }
  const { shapes, dims } = built;
  if (shapes.length === 0) { const result = emptyResult(); result.reasons = [{ code: "EMPTY_LAYOUT" }]; return result; }
  const reasons: FoldReason[] = [], adjacency = new Map<string, Adjacency[]>();
  for (let i = 0; i < shapes.length; i += 1) {
    for (let j = i + 1; j < shapes.length; j += 1) {
      const a = shapes[i], b = shapes[j];
      const overlapWidth = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), overlapHeight = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (overlapWidth > EPS && overlapHeight > EPS) reasons.push({ code: "OVERLAP_2D", faceIds: [a.id, b.id], location: { x: (Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2, y: (Math.max(a.y0, b.y0) + Math.min(a.y1, b.y1)) / 2 } });
      for (const edgeA of a.edges) for (const edgeB of b.edges) {
        const contact = contactOf(edgeA, edgeB);
        if (!contact) continue;
        if (contact.kind === "partial") { reasons.push({ code: "EDGE_LENGTH_MISMATCH", faceIds: [a.id, b.id], location: contact.location }); continue; }
        adjacency.set(a.id, [...(adjacency.get(a.id) ?? []), { otherId: b.id, from: edgeA.index, to: edgeB.index }]);
        adjacency.set(b.id, [...(adjacency.get(b.id) ?? []), { otherId: a.id, from: edgeB.index, to: edgeA.index }]);
      }
    }
  }
  const root = chooseRoot(shapes, dims);
  if (!root) { reasons.push({ code: "INVALID_INPUT", location: { x: shapes[0].x0, y: shapes[0].y0 } }); return { ok: false, reasons, faces: [], correspondence: { faces: [], edges: [], vertices: [] } }; }
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]));
  const transforms = new Map<string, Transform>([[root.shapeId, root.transform]]);
  const usedPlanes = new Map<string, string>([[root.plane, root.shapeId]]);
  const queue: string[] = [root.shapeId];
  while (queue.length > 0) {
    const currentId = queue.shift() as string, parent = shapesById.get(currentId) as Shape, parentTransform = transforms.get(currentId) as Transform;
    for (const link of adjacency.get(currentId) ?? []) {
      if (transforms.has(link.otherId)) continue;
      const child = shapesById.get(link.otherId) as Shape;
      const placed = placeChild(parent, parentTransform, child, link.from, dims, new Set(usedPlanes.keys()));
      if (!placed) { reasons.push({ code: "EDGE_LENGTH_MISMATCH", faceIds: [parent.id, child.id], location: { x: child.x0, y: child.y0 } }); continue; }
      transforms.set(child.id, placed.transform);
      const owner = usedPlanes.get(placed.plane);
      if (owner && owner !== child.id) reasons.push({ code: "FACE_OVERLAP_3D", faceIds: [owner, child.id], location: { x: child.x0, y: child.y0 } });
      else usedPlanes.set(placed.plane, child.id);
      queue.push(child.id);
    }
  }
  for (const shape of shapes) if (!transforms.has(shape.id)) reasons.push({ code: "DISCONNECTED_FACE", faceIds: [shape.id], location: { x: shape.x0, y: shape.y0 } });
  const faces: FoldedFace[] = [], edgeBuckets = new Map<string, EdgeBucket>(), vertexBuckets = new Map<string, VertexBucket>();
  for (const shape of shapes) {
    const transform = transforms.get(shape.id);
    if (!transform) continue;
    const plane = locatePlane(transform, shape, dims) ?? "unplaced", foldedFaceId = `face:${plane}`;
    faces.push({ id: foldedFaceId, foldedFaceId, faceId: shape.id, plane, position: transform.origin, rotation: [degreeOf(transform.u), degreeOf(transform.v), 0], corners: cornersOf(transform, shape), draw: { x: shape.x0, y: shape.y0, width: shape.width, height: shape.height, rotation: shape.face.quarterTurns * 90 } });
    for (const edge of shape.edges) {
      const points3d = edgePoints(transform, shape, edge.index), key = `edge:${[keyOf(points3d[0]), keyOf(points3d[1])].sort().join("|")}`;
      const bucket: EdgeBucket = edgeBuckets.get(key) ?? { key, points3d, positions2d: [], locations: [] };
      bucket.positions2d.push({ faceId: shape.id, edgeIndex: edge.index });
      bucket.locations.push(edge.a, edge.b);
      edgeBuckets.set(key, bucket);
    }
    shape.corners2d.forEach((corner, vertexIndex) => {
      const point3d = mapPoint(transform, shape, corner), key = `vertex:${keyOf(point3d)}`;
      const bucket: VertexBucket = vertexBuckets.get(key) ?? { key, point3d, positions2d: [], locations: [] };
      bucket.positions2d.push({ faceId: shape.id, vertexIndex: vertexIndex as EdgeIndex });
      bucket.locations.push(corner);
      vertexBuckets.set(key, bucket);
    });
  }
  if (transforms.size === 6) {
    for (const bucket of edgeBuckets.values()) if (bucket.positions2d.length !== 2) reasons.push({ code: "UNMATCHED_EDGE", faceIds: unique(bucket.positions2d.map((position) => position.faceId)), location: average(bucket.locations) });
    for (const bucket of vertexBuckets.values()) if (bucket.positions2d.length !== 3) reasons.push({ code: "UNMATCHED_VERTEX", faceIds: unique(bucket.positions2d.map((position) => position.faceId)), location: average(bucket.locations) });
  }
  const correspondence: FoldCorrespondence = { faces: faces.map((face) => ({ faceId: face.faceId, foldedFaceId: face.foldedFaceId })), edges: [...edgeBuckets.values()].map((bucket) => ({ foldedEdgeId: bucket.key, faceIds: unique(bucket.positions2d.map((position) => position.faceId)), points3d: bucket.points3d, positions2d: bucket.positions2d })), vertices: [...vertexBuckets.values()].map((bucket) => ({ foldedVertexId: bucket.key, faceIds: unique(bucket.positions2d.map((position) => position.faceId)), point3d: bucket.point3d, positions2d: bucket.positions2d })) };
  const seen = new Set<string>();
  const filteredReasons = reasons.filter((reason) => { const key = JSON.stringify(reason); if (seen.has(key)) return false; seen.add(key); return true; });
  return { ok: filteredReasons.length === 0, reasons: filteredReasons, faces, correspondence };
}
