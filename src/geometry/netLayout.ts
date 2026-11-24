// prettier-ignore
import { facesTouchAlongFullEdge, isFace, isPoint, isSize, isTurn, partialContact, rectOf, rectsOverlap, type FaceSize, type NetFace, type Point2, type Rect, type SharedEdge } from "./netLayoutGeometry";
// prettier-ignore
export type { EdgeRef, FaceSize, NetFace, Point2, SharedEdge } from "./netLayoutGeometry";
// prettier-ignore
export { facesTouchAlongFullEdge } from "./netLayoutGeometry";

// prettier-ignore
export type SolidKind = "cube" | "cuboid";
// prettier-ignore
export type NetLayout = { kind: SolidKind; sideLengths: readonly [number, number, number]; faces: readonly NetFace[] };
// prettier-ignore
export type NetIssueCode = "INVALID_DIMENSIONS" | "DUPLICATE_FACE_ID" | "INVALID_FACE_SIZE" | "FACE_OVERLAP" | "PARTIAL_EDGE_CONTACT" | "INCOMPLETE_FACE_SET" | "EXTRA_FACE";
// prettier-ignore
export type NetIssue = { code: NetIssueCode; faceIds: readonly string[]; segment?: readonly [Point2, Point2] };
// prettier-ignore
export type InventoryItem = { width: number; height: number; count: number };
// prettier-ignore
export type NetValidation = { ok: boolean; complete: boolean; sharedEdges: readonly SharedEdge[]; issues: readonly NetIssue[]; expectedInventory: readonly InventoryItem[]; actualInventory: readonly InventoryItem[] };

type Counted = InventoryItem & { ids: string[] };

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function dimensionValues(
  kind: SolidKind,
  sideLengths: readonly [number, number, number],
): readonly number[] | null {
  if (kind !== "cube" && kind !== "cuboid") return null;
  if (!Array.isArray(sideLengths) || sideLengths.length !== 3) return null;
  const values = [sideLengths[0], sideLengths[1], sideLengths[2]];
  if (!values.every(isPositiveFinite)) return null;
  return kind === "cube" ? values : values.slice().sort((a, b) => a - b);
}

function normalizeSize(size: FaceSize): FaceSize {
  return size.width <= size.height
    ? { width: size.width, height: size.height }
    : { width: size.height, height: size.width };
}

const sizeKey = (width: number, height: number): string => width + ":" + height;

function itemKey(item: InventoryItem): string {
  return sizeKey(item.width, item.height);
}

function compareInventory(a: InventoryItem, b: InventoryItem): number {
  return a.width - b.width || a.height - b.height;
}

function sameSize(a: FaceSize, b: InventoryItem): boolean {
  return a.width === b.width && a.height === b.height;
}

export function expectedFaceInventory(
  kind: SolidKind,
  sideLengths: readonly [number, number, number],
): readonly InventoryItem[] {
  const values = dimensionValues(kind, sideLengths);
  if (values === null) return [];
  if (kind === "cube") {
    return [{ width: values[0], height: values[0], count: 6 }];
  }
  return [
    { width: values[0], height: values[1], count: 2 },
    { width: values[0], height: values[2], count: 2 },
    { width: values[1], height: values[2], count: 2 },
  ];
}

function collectInventory(faces: readonly NetFace[]): Map<string, Counted> {
  const map = new Map<string, Counted>();
  for (const face of faces) {
    if (!face || !isSize(face.size)) continue;
    const size = normalizeSize(face.size);
    const key = sizeKey(size.width, size.height);
    const item = map.get(key) ?? {
      width: size.width,
      height: size.height,
      count: 0,
      ids: [],
    };
    item.count += 1;
    item.ids.push(typeof face.id === "string" ? face.id : "");
    map.set(key, item);
  }
  return map;
}

function inventoryOf(faces: readonly NetFace[]): readonly InventoryItem[] {
  return [...collectInventory(faces).values()]
    .sort(compareInventory)
    .map(({ width, height, count }) => ({ width, height, count }));
}

function inventoryMatches(
  expected: readonly InventoryItem[],
  actual: readonly InventoryItem[],
): boolean {
  if (expected.length !== actual.length) return false;
  const a = [...expected].sort(compareInventory);
  const b = [...actual].sort(compareInventory);
  return a.every(
    (item, index) =>
      itemKey(item) === itemKey(b[index]) && item.count === b[index].count,
  );
}

function inventoryDifferences(
  expected: readonly InventoryItem[],
  faces: readonly NetFace[],
) {
  const expectedKeys = new Set(expected.map(itemKey));
  const actual = collectInventory(faces);
  const missing: InventoryItem[] = [];
  const extraIds: string[] = [];
  for (const item of expected) {
    const found = actual.get(itemKey(item));
    const count = found?.count ?? 0;
    if (count < item.count) {
      missing.push({
        width: item.width,
        height: item.height,
        count: item.count - count,
      });
    }
    if (found && count > item.count) {
      extraIds.push(...found.ids.slice(item.count));
    }
  }
  for (const [key, item] of actual) {
    if (!expectedKeys.has(key)) extraIds.push(...item.ids);
  }
  return {
    missing,
    extraIds: [...new Set(extraIds)].filter((id) => id.length > 0),
  };
}

export function validateNetLayout(
  layout: NetLayout,
  mode: "partial" | "complete" = "complete",
): NetValidation {
  const source = layout as NetLayout | null;
  const faces = source && Array.isArray(source.faces) ? source.faces : [];
  const expected = source
    ? expectedFaceInventory(source.kind, source.sideLengths)
    : [];
  if (expected.length === 0) {
    return {
      ok: false,
      complete: false,
      sharedEdges: [],
      issues: [{ code: "INVALID_DIMENSIONS", faceIds: [] }],
      expectedInventory: [],
      actualInventory: [],
    };
  }
  const issues: NetIssue[] = [];
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const face of faces) {
    if (typeof face?.id !== "string") continue;
    if (seen.has(face.id)) {
      if (!duplicates.includes(face.id)) duplicates.push(face.id);
    } else {
      seen.add(face.id);
    }
  }
  if (duplicates.length > 0) {
    issues.push({ code: "DUPLICATE_FACE_ID", faceIds: duplicates });
  }
  const geometry: Array<{ face: NetFace; rect: Rect }> = [];
  for (const face of faces) {
    const rect = rectOf(face);
    const size = isSize(face?.size) ? normalizeSize(face.size) : null;
    if (
      rect === null ||
      size === null ||
      !expected.some((item) => sameSize(size, item))
    ) {
      issues.push({
        code: "INVALID_FACE_SIZE",
        faceIds: [typeof face?.id === "string" ? face.id : ""],
      });
    }
    if (rect !== null) geometry.push({ face, rect });
  }
  const sharedEdges: SharedEdge[] = [];
  for (let i = 0; i < geometry.length; i += 1) {
    for (let j = i + 1; j < geometry.length; j += 1) {
      const first = geometry[i];
      const second = geometry[j];
      if (rectsOverlap(first.rect, second.rect)) {
        issues.push({
          code: "FACE_OVERLAP",
          faceIds: [first.face.id, second.face.id],
        });
        continue;
      }
      sharedEdges.push(...facesTouchAlongFullEdge(first.face, second.face));
      const contact = partialContact(first.rect, second.rect);
      if (contact !== null) {
        issues.push({
          code: "PARTIAL_EDGE_CONTACT",
          faceIds: [first.face.id, second.face.id],
          segment: contact.segment,
        });
      }
    }
  }
  const actualInventory = inventoryOf(faces);
  const complete =
    inventoryMatches(expected, actualInventory) &&
    duplicates.length === 0 &&
    issues.every((issue) => issue.code !== "INVALID_FACE_SIZE");
  if (mode !== "partial") {
    const differences = inventoryDifferences(expected, faces);
    if (differences.missing.length > 0) {
      issues.push({ code: "INCOMPLETE_FACE_SET", faceIds: [] });
    }
    if (differences.extraIds.length > 0) {
      issues.push({ code: "EXTRA_FACE", faceIds: differences.extraIds });
    }
  }
  return {
    ok: issues.length === 0,
    complete,
    sharedEdges,
    issues,
    expectedInventory: expected,
    actualInventory,
  };
}

// prettier-ignore
export function rotateNetFace(face: NetFace, quarterTurns: 0|1|2|3): NetFace {
  if (!isFace(face) || !isTurn(quarterTurns)) return face;
  return { ...face, quarterTurns };
}

// prettier-ignore
export function translateNetFace(face: NetFace, origin: Point2): NetFace {
  if (!isFace(face) || !isPoint(origin)) return face;
  return { ...face, origin: { ...origin } };
}
