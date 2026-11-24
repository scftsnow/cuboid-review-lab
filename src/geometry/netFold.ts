import type { NetLayout, Point2 } from "./netLayout";
import * as shapeLib from "./netFoldShapes";
import * as frameLib from "./netFoldFrames";
type EdgeIndex = shapeLib.EdgeIndex;
type Shape = shapeLib.Shape;
type Transform = frameLib.Transform;
type Vec3 = frameLib.Vec3;
export type { EdgeIndex, Vec3 };
const { EPS, buildShapes, contactOf } = shapeLib;
const { chooseRoot, cornersOf, degreeOf, edgePoints, keyOf, placeChild } =
  frameLib;
export type FoldReasonCode =
  | "INVALID_INPUT"
  | "EMPTY_LAYOUT"
  | "DISCONNECTED_FACE"
  | "EDGE_LENGTH_MISMATCH"
  | "OVERLAP_2D"
  | "FACE_OVERLAP_3D"
  | "UNMATCHED_EDGE"
  | "UNMATCHED_VERTEX";
type ReasonFields = { faceIds?: string[]; location?: Point2 };
export type FoldReason = { code: FoldReasonCode } & ReasonFields;
type Rect = { x: number; y: number; width: number; height: number };
type Draw = Rect & { rotation: number };
type FaceIds = { id: string; foldedFaceId: string; faceId: string };
type FaceCore = FaceIds & { plane: string };
type FaceShape = { position: Vec3; rotation: number[]; corners: Vec3[] };
export type FoldedFace = FaceCore & FaceShape & { draw: Draw };
type Match<T> = { faceIds: string[]; positions2d: T[] };
type FaceMatch = { faceId: string; foldedFaceId: string };
type EdgePos = { faceId: string; edgeIndex: EdgeIndex };
type VertexPos = { faceId: string; vertexIndex: EdgeIndex };
type EdgeMatch = { foldedEdgeId: string; points3d: Vec3[] } & Match<EdgePos>;
type VertexMatch = { foldedVertexId: string; point3d: Vec3 } & Match<VertexPos>;
type CorrespondenceLists = { edges: EdgeMatch[]; vertices: VertexMatch[] };
export type FoldCorrespondence = { faces: FaceMatch[] } & CorrespondenceLists;
type FoldOutcome = { ok: boolean; reasons: FoldReason[] };
type FoldResultBody = {
  faces: FoldedFace[];
  correspondence: FoldCorrespondence;
};
export type FoldResult = FoldOutcome & FoldResultBody;
type Adjacency = { otherId: string; from: EdgeIndex; to: EdgeIndex };
type BaseBucket = { key: string; locations: Point2[] };
type PositionedBucket = BaseBucket & { positions2d: Array<{ faceId: string }> };
type EdgeBucket = BaseBucket & { points3d: Vec3[]; positions2d: EdgePos[] };
type VertexBucket = BaseBucket & { point3d: Vec3; positions2d: VertexPos[] };
const uniq = <T>(values: T[]): T[] => [...new Set(values)];
const faceIdsOf = (positions: { faceId: string }[]): string[] =>
  uniq(positions.map((position) => position.faceId));
const average = (points: Point2[]): Point2 => {
  const n = points.length || 1;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / n,
    y: points.reduce((sum, point) => sum + point.y, 0) / n,
  };
};
const fail = (code: FoldReasonCode): FoldResult => ({
  ok: false,
  reasons: [{ code }],
  faces: [],
  correspondence: { faces: [], edges: [], vertices: [] },
});
export function foldNetLayout(layout: NetLayout): FoldResult {
  const built = buildShapes(layout);
  if (!built) return fail("INVALID_INPUT");
  const { shapes, dims } = built;
  if (shapes.length === 0) return fail("EMPTY_LAYOUT");
  const reasons: FoldReason[] = [];
  const addReason = (
    code: FoldReasonCode,
    faceIds?: string[],
    location?: Point2,
  ) => reasons.push({ code, faceIds, location });
  const checkBucket = (
    code: FoldReasonCode,
    bucket: PositionedBucket,
    expected: number,
  ) =>
    bucket.positions2d.length === expected ||
    addReason(code, faceIdsOf(bucket.positions2d), average(bucket.locations));
  const adjacency = new Map<string, Adjacency[]>();
  const link = (a: Shape, b: Shape, from: EdgeIndex, to: EdgeIndex) => {
    adjacency.set(a.id, adjacency.get(a.id) ?? []);
    adjacency.set(b.id, adjacency.get(b.id) ?? []);
    adjacency.get(a.id)?.push({ otherId: b.id, from, to });
    adjacency.get(b.id)?.push({ otherId: a.id, from: to, to: from });
  };
  for (let i = 0; i < shapes.length; i += 1) {
    for (let j = i + 1; j < shapes.length; j += 1) {
      const a = shapes[i];
      const b = shapes[j];
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ox > EPS && oy > EPS) {
        addReason("OVERLAP_2D", [a.id, b.id], {
          x: (Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2,
          y: (Math.max(a.y0, b.y0) + Math.min(a.y1, b.y1)) / 2,
        });
      }
      for (const edgeA of a.edges) {
        for (const edgeB of b.edges) {
          const contact = contactOf(edgeA, edgeB);
          if (!contact) continue;
          if (contact.kind === "partial") {
            addReason("EDGE_LENGTH_MISMATCH", [a.id, b.id], contact.location);
          } else {
            link(a, b, edgeA.index, edgeB.index);
          }
        }
      }
    }
  }
  const root = chooseRoot(shapes, dims);
  if (!root) {
    const at = { x: shapes[0].x0, y: shapes[0].y0 };
    const result = fail("INVALID_INPUT");
    result.reasons = reasons;
    result.reasons.push({ code: "INVALID_INPUT", location: at });
    return result;
  }
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  const transforms = new Map([[root.shapeId, root.transform]]);
  const planes = new Map([[root.shapeId, root.plane]]);
  const used = new Map([[root.plane, root.shapeId]]);
  const queue: string[] = [root.shapeId];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const p = byId.get(id) as Shape;
    const pt = transforms.get(id) as Transform;
    for (const e of adjacency.get(id) ?? []) {
      if (transforms.has(e.otherId)) continue;
      const c = byId.get(e.otherId) as Shape;
      const placed = placeChild(p, pt, c, e.from, dims, new Set(used.keys()));
      if (!placed) {
        addReason("EDGE_LENGTH_MISMATCH", [p.id, c.id], {
          x: c.x0,
          y: c.y0,
        });
        continue;
      }
      transforms.set(c.id, placed.transform);
      planes.set(c.id, placed.plane);
      const owner = used.get(placed.plane);
      if (owner && owner !== c.id) {
        addReason("FACE_OVERLAP_3D", [owner, c.id], { x: c.x0, y: c.y0 });
      } else {
        used.set(placed.plane, c.id);
      }
      queue.push(c.id);
    }
  }
  for (const shape of shapes)
    if (!transforms.has(shape.id))
      addReason("DISCONNECTED_FACE", [shape.id], { x: shape.x0, y: shape.y0 });
  const faces: FoldedFace[] = [];
  const edgeBuckets = new Map<string, EdgeBucket>();
  const vertexBuckets = new Map<string, VertexBucket>();
  for (const shape of shapes) {
    const t = transforms.get(shape.id);
    if (!t) continue;
    const plane = planes.get(shape.id) ?? "unplaced";
    const id = `face:${plane}`;
    const corners = cornersOf(t, shape);
    faces.push({
      id,
      foldedFaceId: id,
      faceId: shape.id,
      plane,
      position: t.origin,
      rotation: [degreeOf(t.u), degreeOf(t.v), 0],
      corners,
      draw: {
        x: shape.x0,
        y: shape.y0,
        width: shape.width,
        height: shape.height,
        rotation: shape.face.quarterTurns * 90,
      },
    });
    for (const edge of shape.edges) {
      const pts = edgePoints(t, shape, edge.index);
      const key = `edge:${[keyOf(pts[0]), keyOf(pts[1])].sort().join("|")}`;
      const bucket: EdgeBucket = edgeBuckets.get(key) ?? {
        key,
        locations: [],
        points3d: pts,
        positions2d: [],
      };
      bucket.positions2d.push({ faceId: shape.id, edgeIndex: edge.index });
      bucket.locations.push(edge.a, edge.b);
      edgeBuckets.set(key, bucket);
    }
    shape.corners2d.forEach((corner, vi) => {
      const point3d = corners[vi];
      const key = `vertex:${keyOf(point3d)}`;
      const bucket: VertexBucket = vertexBuckets.get(key) ?? {
        key,
        locations: [],
        point3d,
        positions2d: [],
      };
      bucket.positions2d.push({
        faceId: shape.id,
        vertexIndex: vi as EdgeIndex,
      });
      bucket.locations.push(corner);
      vertexBuckets.set(key, bucket);
    });
  }
  if (transforms.size === 6) {
    for (const bucket of edgeBuckets.values())
      checkBucket("UNMATCHED_EDGE", bucket, 2);
    for (const bucket of vertexBuckets.values())
      checkBucket("UNMATCHED_VERTEX", bucket, 3);
  }
  const correspondence: FoldCorrespondence = {
    faces: faces.map((face) => ({
      faceId: face.faceId,
      foldedFaceId: face.foldedFaceId,
    })),
    edges: [...edgeBuckets.values()].map((bucket) => ({
      foldedEdgeId: bucket.key,
      faceIds: faceIdsOf(bucket.positions2d),
      points3d: bucket.points3d,
      positions2d: bucket.positions2d,
    })),
    vertices: [...vertexBuckets.values()].map((bucket) => ({
      foldedVertexId: bucket.key,
      faceIds: faceIdsOf(bucket.positions2d),
      point3d: bucket.point3d,
      positions2d: bucket.positions2d,
    })),
  };
  const seen = new Set<string>();
  const filtered = reasons.filter((reason) => {
    const key = JSON.stringify(reason);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    ok: filtered.length === 0,
    reasons: filtered,
    faces,
    correspondence,
  };
}
