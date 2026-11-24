export type SolidKind = 'cube' | 'cuboid';
export type Point2 = { x: number; y: number };
export type FaceSize = { width: number; height: number };
export type NetFace = { id: string; origin: Point2; size: FaceSize; quarterTurns: 0 | 1 | 2 | 3 };
export type NetLayout = { kind: SolidKind; sideLengths: readonly [number, number, number]; faces: readonly NetFace[] };
export type EdgeRef = { faceId: string; edgeIndex: 0 | 1 | 2 | 3 };
export type SharedEdge = { a: EdgeRef; b: EdgeRef; length: number; axis: 'horizontal' | 'vertical'; segment: readonly [Point2, Point2] };
export type NetIssueCode = 'INVALID_DIMENSIONS' | 'DUPLICATE_FACE_ID' | 'INVALID_FACE_SIZE' | 'FACE_OVERLAP' | 'PARTIAL_EDGE_CONTACT' | 'INCOMPLETE_FACE_SET' | 'EXTRA_FACE';
export type NetIssue = { code: NetIssueCode; faceIds: readonly string[]; segment?: readonly [Point2, Point2] };
export type InventoryItem = { width: number; height: number; count: number };
export type NetValidation = { ok: boolean; complete: boolean; sharedEdges: readonly SharedEdge[]; issues: readonly NetIssue[]; expectedInventory: readonly InventoryItem[]; actualInventory: readonly InventoryItem[] };
type Direction = 'up' | 'right' | 'down' | 'left';
type Edge = { index: 0 | 1 | 2 | 3; axis: 'horizontal' | 'vertical'; segment: readonly [Point2, Point2]; outward: Direction };
type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
type Counted = InventoryItem & { ids: string[] };
const OPPOSITE: Readonly<Record<Direction, Direction>> = { up: 'down', right: 'left', down: 'up', left: 'right' };
function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function isPoint(value: unknown): value is Point2 {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<Point2>;
  return Number.isInteger(point.x) && Number.isInteger(point.y);
}
function isSize(value: unknown): value is FaceSize {
  if (!value || typeof value !== 'object') return false;
  const size = value as Partial<FaceSize>;
  return isPositiveFinite(size.width) && isPositiveFinite(size.height);
}
function isTurn(value: unknown): value is 0 | 1 | 2 | 3 {
  return value === 0 || value === 1 || value === 2 || value === 3;
}
function isFace(value: unknown): value is NetFace {
  if (!value || typeof value !== 'object') return false;
  const face = value as Partial<NetFace>;
  return typeof face.id === 'string' && face.id.length > 0 && isPoint(face.origin) && isSize(face.size) && isTurn(face.quarterTurns);
}
function dimensionValues(kind: SolidKind, sideLengths: readonly [number, number, number]): readonly number[] | null {
  if (kind !== 'cube' && kind !== 'cuboid') return null;
  if (!Array.isArray(sideLengths) || sideLengths.length !== 3) return null;
  const values = [sideLengths[0], sideLengths[1], sideLengths[2]];
  if (!values.every(isPositiveFinite)) return null;
  return kind === 'cube' ? values : values.slice().sort((a, b) => a - b);
}
function normalizeSize(size: FaceSize): FaceSize {
  return size.width <= size.height ? { width: size.width, height: size.height } : { width: size.height, height: size.width };
}
function sizeKey(width: number, height: number): string {
  return width + ':' + height;
}
function itemKey(item: InventoryItem): string {
  return sizeKey(item.width, item.height);
}
function compareInventory(a: InventoryItem, b: InventoryItem): number {
  return a.width - b.width || a.height - b.height;
}
function sameSize(a: FaceSize, b: InventoryItem): boolean {
  return a.width === b.width && a.height === b.height;
}
export function expectedFaceInventory(kind: SolidKind, sideLengths: readonly [number, number, number]): readonly InventoryItem[] {
  const values = dimensionValues(kind, sideLengths);
  if (values === null) return [];
  if (kind === 'cube') return [{ width: values[0], height: values[0], count: 6 }];
  return [{ width: values[0], height: values[1], count: 2 }, { width: values[0], height: values[2], count: 2 }, { width: values[1], height: values[2], count: 2 }];
}
function rectOf(face: NetFace): Rect | null {
  if (!isFace(face)) return null;
  const swapped = face.quarterTurns === 1 || face.quarterTurns === 3;
  const width = swapped ? face.size.height : face.size.width;
  const height = swapped ? face.size.width : face.size.height;
  return { left: face.origin.x, top: face.origin.y, right: face.origin.x + width, bottom: face.origin.y + height, width, height };
}
function edgesOf(r: Rect): readonly Edge[] {
  const h = (y: number, index: 0 | 2, outward: 'up' | 'down'): Edge => ({ index, axis: 'horizontal', segment: [{ x: r.left, y }, { x: r.right, y }], outward });
  const v = (x: number, index: 1 | 3, outward: 'right' | 'left'): Edge => ({ index, axis: 'vertical', segment: [{ x, y: r.top }, { x, y: r.bottom }], outward });
  return [h(r.top, 0, 'up'), v(r.right, 1, 'right'), h(r.bottom, 2, 'down'), v(r.left, 3, 'left')];
}
function samePoint(a: Point2, b: Point2): boolean {
  return a.x === b.x && a.y === b.y;
}
function sameSegment(a: readonly [Point2, Point2], b: readonly [Point2, Point2]): boolean {
  return (samePoint(a[0], b[0]) && samePoint(a[1], b[1])) || (samePoint(a[0], b[1]) && samePoint(a[1], b[0]));
}
function segmentLength(segment: readonly [Point2, Point2]): number {
  return Math.max(Math.abs(segment[1].x - segment[0].x), Math.abs(segment[1].y - segment[0].y));
}
function rectsOverlap(a: Rect, b: Rect): boolean {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
}
export function facesTouchAlongFullEdge(a: NetFace, b: NetFace): readonly SharedEdge[] {
  const first = rectOf(a);
  const second = rectOf(b);
  if (first === null || second === null || rectsOverlap(first, second)) return [];
  const shared: SharedEdge[] = [];
  for (const firstEdge of edgesOf(first)) {
    for (const secondEdge of edgesOf(second)) {
      if (firstEdge.axis !== secondEdge.axis || OPPOSITE[firstEdge.outward] !== secondEdge.outward || !sameSegment(firstEdge.segment, secondEdge.segment)) continue;
      shared.push({ a: { faceId: a.id, edgeIndex: firstEdge.index }, b: { faceId: b.id, edgeIndex: secondEdge.index }, length: segmentLength(firstEdge.segment), axis: firstEdge.axis, segment: [{ ...firstEdge.segment[0] }, { ...firstEdge.segment[1] }] });
    }
  }
  return shared;
}
function partialContact(a: Rect, b: Rect): { axis: 'horizontal' | 'vertical'; segment: readonly [Point2, Point2] } | null {
  if (rectsOverlap(a, b)) return null;
  const horizontal = [[a.bottom, b.top, a.left, a.right, b.left, b.right], [a.top, b.bottom, a.left, a.right, b.left, b.right]];
  for (const [lineA, lineB, aStart, aEnd, bStart, bEnd] of horizontal) {
    const start = Math.max(aStart, bStart);
    const end = Math.min(aEnd, bEnd);
    const full = start === aStart && end === aEnd && start === bStart && end === bEnd;
    if (lineA === lineB && end > start && !full) {
      return { axis: 'horizontal', segment: [{ x: start, y: lineA }, { x: end, y: lineA }] };
    }
  }
  const vertical = [[a.right, b.left, a.top, a.bottom, b.top, b.bottom], [a.left, b.right, a.top, a.bottom, b.top, b.bottom]];
  for (const [lineA, lineB, aStart, aEnd, bStart, bEnd] of vertical) {
    const start = Math.max(aStart, bStart);
    const end = Math.min(aEnd, bEnd);
    const full = start === aStart && end === aEnd && start === bStart && end === bEnd;
    if (lineA === lineB && end > start && !full) {
      return { axis: 'vertical', segment: [{ x: lineA, y: start }, { x: lineA, y: end }] };
    }
  }
  return null;
}
function collectInventory(faces: readonly NetFace[]): Map<string, Counted> {
  const map = new Map<string, Counted>();
  for (const face of faces) {
    if (!face || !isSize(face.size)) continue;
    const size = normalizeSize(face.size);
    const key = sizeKey(size.width, size.height);
    const item = map.get(key) ?? { width: size.width, height: size.height, count: 0, ids: [] };
    item.count += 1;
    item.ids.push(typeof face.id === 'string' ? face.id : '');
    map.set(key, item);
  }
  return map;
}
function inventoryOf(faces: readonly NetFace[]): readonly InventoryItem[] {
  return [...collectInventory(faces).values()].sort(compareInventory).map(({ width, height, count }) => ({ width, height, count }));
}
function inventoryMatches(expected: readonly InventoryItem[], actual: readonly InventoryItem[]): boolean {
  if (expected.length !== actual.length) return false;
  const a = [...expected].sort(compareInventory);
  const b = [...actual].sort(compareInventory);
  return a.every((item, index) => itemKey(item) === itemKey(b[index]) && item.count === b[index].count);
}
function inventoryDifferences(expected: readonly InventoryItem[], faces: readonly NetFace[]) {
  const expectedKeys = new Set(expected.map(itemKey));
  const actual = collectInventory(faces);
  const missing: InventoryItem[] = [];
  const extraIds: string[] = [];
  for (const item of expected) {
    const found = actual.get(itemKey(item));
    const count = found?.count ?? 0;
    if (count < item.count) missing.push({ width: item.width, height: item.height, count: item.count - count });
    if (found && count > item.count) extraIds.push(...found.ids.slice(item.count));
  }
  for (const [key, item] of actual) {
    if (!expectedKeys.has(key)) extraIds.push(...item.ids);
  }
  return { missing, extraIds: [...new Set(extraIds)].filter((id) => id.length > 0) };
}
export function validateNetLayout(layout: NetLayout, mode: 'partial' | 'complete' = 'complete'): NetValidation {
  const source = layout as NetLayout | null;
  const faces = source && Array.isArray(source.faces) ? source.faces : [];
  const expected = source ? expectedFaceInventory(source.kind, source.sideLengths) : [];
  if (expected.length === 0) {
    return { ok: false, complete: false, sharedEdges: [], issues: [{ code: 'INVALID_DIMENSIONS', faceIds: [] }], expectedInventory: [], actualInventory: [] };
  }
  const issues: NetIssue[] = [];
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const face of faces) {
    if (typeof face?.id !== 'string') continue;
    if (seen.has(face.id)) {
      if (!duplicates.includes(face.id)) duplicates.push(face.id);
    } else {
      seen.add(face.id);
    }
  }
  if (duplicates.length > 0) issues.push({ code: 'DUPLICATE_FACE_ID', faceIds: duplicates });
  const geometry: Array<{ face: NetFace; rect: Rect }> = [];
  for (const face of faces) {
    const rect = rectOf(face);
    const size = isSize(face?.size) ? normalizeSize(face.size) : null;
    if (rect === null || size === null || !expected.some((item) => sameSize(size, item))) {
      issues.push({ code: 'INVALID_FACE_SIZE', faceIds: [typeof face?.id === 'string' ? face.id : ''] });
    }
    if (rect !== null) geometry.push({ face, rect });
  }
  const sharedEdges: SharedEdge[] = [];
  for (let i = 0; i < geometry.length; i += 1) {
    for (let j = i + 1; j < geometry.length; j += 1) {
      const first = geometry[i];
      const second = geometry[j];
      if (rectsOverlap(first.rect, second.rect)) {
        issues.push({ code: 'FACE_OVERLAP', faceIds: [first.face.id, second.face.id] });
        continue;
      }
      sharedEdges.push(...facesTouchAlongFullEdge(first.face, second.face));
      const contact = partialContact(first.rect, second.rect);
      if (contact !== null) {
        issues.push({ code: 'PARTIAL_EDGE_CONTACT', faceIds: [first.face.id, second.face.id], segment: contact.segment });
      }
    }
  }
  const actualInventory = inventoryOf(faces);
  const complete = inventoryMatches(expected, actualInventory) && duplicates.length === 0 && issues.every((issue) => issue.code !== 'INVALID_FACE_SIZE');
  if (mode !== 'partial') {
    const differences = inventoryDifferences(expected, faces);
    if (differences.missing.length > 0) issues.push({ code: 'INCOMPLETE_FACE_SET', faceIds: [] });
    if (differences.extraIds.length > 0) issues.push({ code: 'EXTRA_FACE', faceIds: differences.extraIds });
  }
  return { ok: issues.length === 0, complete, sharedEdges, issues, expectedInventory: expected, actualInventory };
}
export function rotateNetFace(face: NetFace, quarterTurns: 0 | 1 | 2 | 3): NetFace {
  if (!isFace(face) || !isTurn(quarterTurns)) return face;
  return { ...face, quarterTurns };
}
export function translateNetFace(face: NetFace, origin: Point2): NetFace {
  if (!isFace(face) || !isPoint(origin)) return face;
  return { ...face, origin: { ...origin } };
}