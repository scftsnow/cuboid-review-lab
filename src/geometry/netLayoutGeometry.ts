export type Point2 = { x: number; y: number };
export type FaceSize = { width: number; height: number };
export type NetFace = {
  id: string;
  origin: Point2;
  size: FaceSize;
  quarterTurns: 0 | 1 | 2 | 3;
};
export type EdgeRef = { faceId: string; edgeIndex: 0 | 1 | 2 | 3 };
export type SharedEdge = {
  a: EdgeRef;
  b: EdgeRef;
  length: number;
  axis: "horizontal" | "vertical";
  segment: readonly [Point2, Point2];
};
export type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type Direction = "up" | "right" | "down" | "left";
type Edge = {
  index: 0 | 1 | 2 | 3;
  axis: "horizontal" | "vertical";
  segment: readonly [Point2, Point2];
  outward: Direction;
};

const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  up: "down",
  right: "left",
  down: "up",
  left: "right",
};

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isPoint(value: unknown): value is Point2 {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<Point2>;
  return Number.isInteger(point.x) && Number.isInteger(point.y);
}

export function isSize(value: unknown): value is FaceSize {
  if (!value || typeof value !== "object") return false;
  const size = value as Partial<FaceSize>;
  return isPositiveFinite(size.width) && isPositiveFinite(size.height);
}

export function isTurn(value: unknown): value is 0 | 1 | 2 | 3 {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function isFace(value: unknown): value is NetFace {
  if (!value || typeof value !== "object") return false;
  const face = value as Partial<NetFace>;
  return (
    typeof face.id === "string" &&
    face.id.length > 0 &&
    isPoint(face.origin) &&
    isSize(face.size) &&
    isTurn(face.quarterTurns)
  );
}

export function rectOf(face: NetFace): Rect | null {
  if (!isFace(face)) return null;
  const swapped = face.quarterTurns === 1 || face.quarterTurns === 3;
  const width = swapped ? face.size.height : face.size.width;
  const height = swapped ? face.size.width : face.size.height;
  return {
    left: face.origin.x,
    top: face.origin.y,
    right: face.origin.x + width,
    bottom: face.origin.y + height,
    width,
    height,
  };
}

function edgesOf(r: Rect): readonly Edge[] {
  const h = (y: number, index: 0 | 2, outward: "up" | "down"): Edge => ({
    index,
    axis: "horizontal",
    segment: [
      { x: r.left, y },
      { x: r.right, y },
    ],
    outward,
  });
  const v = (x: number, index: 1 | 3, outward: "right" | "left"): Edge => ({
    index,
    axis: "vertical",
    segment: [
      { x, y: r.top },
      { x, y: r.bottom },
    ],
    outward,
  });
  return [
    h(r.top, 0, "up"),
    v(r.right, 1, "right"),
    h(r.bottom, 2, "down"),
    v(r.left, 3, "left"),
  ];
}

function samePoint(a: Point2, b: Point2): boolean {
  return a.x === b.x && a.y === b.y;
}

function sameSegment(
  a: readonly [Point2, Point2],
  b: readonly [Point2, Point2],
): boolean {
  return (
    (samePoint(a[0], b[0]) && samePoint(a[1], b[1])) ||
    (samePoint(a[0], b[1]) && samePoint(a[1], b[0]))
  );
}

function segmentLength(segment: readonly [Point2, Point2]): number {
  return Math.max(
    Math.abs(segment[1].x - segment[0].x),
    Math.abs(segment[1].y - segment[0].y),
  );
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0
  );
}

export function facesTouchAlongFullEdge(
  a: NetFace,
  b: NetFace,
): readonly SharedEdge[] {
  const first = rectOf(a);
  const second = rectOf(b);
  if (first === null || second === null || rectsOverlap(first, second)) {
    return [];
  }
  const shared: SharedEdge[] = [];
  for (const firstEdge of edgesOf(first)) {
    for (const secondEdge of edgesOf(second)) {
      if (
        firstEdge.axis !== secondEdge.axis ||
        OPPOSITE[firstEdge.outward] !== secondEdge.outward ||
        !sameSegment(firstEdge.segment, secondEdge.segment)
      ) {
        continue;
      }
      shared.push({
        a: { faceId: a.id, edgeIndex: firstEdge.index },
        b: { faceId: b.id, edgeIndex: secondEdge.index },
        length: segmentLength(firstEdge.segment),
        axis: firstEdge.axis,
        segment: [{ ...firstEdge.segment[0] }, { ...firstEdge.segment[1] }],
      });
    }
  }
  return shared;
}

export function partialContact(
  a: Rect,
  b: Rect,
): {
  axis: "horizontal" | "vertical";
  segment: readonly [Point2, Point2];
} | null {
  if (rectsOverlap(a, b)) return null;
  const horizontal = [
    [a.bottom, b.top, a.left, a.right, b.left, b.right],
    [a.top, b.bottom, a.left, a.right, b.left, b.right],
  ];
  for (const [lineA, lineB, aStart, aEnd, bStart, bEnd] of horizontal) {
    const start = Math.max(aStart, bStart);
    const end = Math.min(aEnd, bEnd);
    const full =
      start === aStart && end === aEnd && start === bStart && end === bEnd;
    if (lineA === lineB && end > start && !full) {
      return {
        axis: "horizontal",
        segment: [
          { x: start, y: lineA },
          { x: end, y: lineA },
        ],
      };
    }
  }
  const vertical = [
    [a.right, b.left, a.top, a.bottom, b.top, b.bottom],
    [a.left, b.right, a.top, a.bottom, b.top, b.bottom],
  ];
  for (const [lineA, lineB, aStart, aEnd, bStart, bEnd] of vertical) {
    const start = Math.max(aStart, bStart);
    const end = Math.min(aEnd, bEnd);
    const full =
      start === aStart && end === aEnd && start === bStart && end === bEnd;
    if (lineA === lineB && end > start && !full) {
      return {
        axis: "vertical",
        segment: [
          { x: lineA, y: start },
          { x: lineA, y: end },
        ],
      };
    }
  }
  return null;
}
