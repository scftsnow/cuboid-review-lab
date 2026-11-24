import { describe, expect, it } from "vitest";
import type { NetFace, NetLayout } from "../../src/geometry/netLayout";
import {
  expectedFaceInventory,
  facesTouchAlongFullEdge,
  rotateNetFace,
  translateNetFace,
  validateNetLayout,
} from "../../src/geometry/netLayout";
type QuarterTurn = NetFace["quarterTurns"];
type Validation = ReturnType<typeof validateNetLayout>;
type ExpectedInventory = ReturnType<typeof expectedFaceInventory>;
const CUBE_SIDES = [1, 1, 1] as const;
const CUBOID_SIDES = [2, 3, 4] as const;
function face(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  quarterTurns: QuarterTurn = 0,
): NetFace {
  return { id, origin: { x, y }, size: { width, height }, quarterTurns };
}
function cubeLayout(faces: readonly NetFace[]): NetLayout {
  return { kind: "cube", sideLengths: CUBE_SIDES, faces };
}
function cuboidLayout(
  sideLengths: readonly [number, number, number],
  faces: readonly NetFace[],
): NetLayout {
  return { kind: "cuboid", sideLengths, faces };
}
function edgePairs(validation: Validation): string[] {
  return validation.sharedEdges
    .map(({ a, b }) => [a.faceId, a.edgeIndex, b.faceId, b.edgeIndex].join("-"))
    .sort();
}
function expectIssue(
  validation: Validation,
  issue: Validation["issues"][number],
) {
  expect(validation.issues).toContainEqual(issue);
}
function snapshot(faces: readonly NetFace[]) {
  return faces.map((item) => ({
    id: item.id,
    origin: { ...item.origin },
    size: { ...item.size },
    quarterTurns: item.quarterTurns,
  }));
}
function expectComplete(
  layout: NetLayout,
  expected: ExpectedInventory,
  pairs?: string[],
): Validation {
  const result = validateNetLayout(layout);
  expect(result.ok).toBe(true);
  expect(result.complete).toBe(true);
  expect(result.issues).toEqual([]);
  expect([result.expectedInventory, result.actualInventory]).toEqual([
    expected,
    expected,
  ]);
  expect(result.sharedEdges).toHaveLength(5);
  if (pairs) expect(edgePairs(result)).toEqual(pairs);
  return result;
}
const cubeCrossFaces: readonly NetFace[] = [
  face("C", 1, 1, 1, 1),
  face("L", 0, 1, 1, 1),
  face("R", 2, 1, 1, 1),
  face("T", 1, 0, 1, 1),
  face("B", 1, 2, 1, 1),
  face("E", 1, 3, 1, 1),
];
const cubeStripFaces: readonly NetFace[] = [
  face("A", 0, 1, 1, 1),
  face("B", 1, 1, 1, 1),
  face("C", 2, 1, 1, 1),
  face("D", 3, 1, 1, 1),
  face("E", 1, 0, 1, 1),
  face("F", 2, 2, 1, 1),
];
const cuboidCrossFaces: readonly NetFace[] = [
  face("back", 7, 4, 3, 4),
  face("bottom", 2, 8, 2, 3, 1),
  face("front", 2, 4, 3, 4),
  face("left", 0, 4, 2, 4),
  face("right", 5, 4, 2, 4),
  face("top", 2, 2, 2, 3, 1),
];
const cuboidAlternativeFaces: readonly NetFace[] = [
  face("back", 7, 4, 3, 4),
  face("bottom", 5, 8, 2, 3),
  face("front", 2, 4, 3, 4),
  face("left", 0, 4, 2, 4),
  face("right", 5, 4, 2, 4),
  face("top", 7, 2, 2, 3, 1),
];
describe("NET-C inventory and valid layouts", () => {
  it("expects the cube squares and cuboid rectangle pairs", () => {
    expect(expectedFaceInventory("cube", CUBE_SIDES)).toEqual([
      { width: 1, height: 1, count: 6 },
    ]);
    const cuboidInventory = [
      { width: 2, height: 3, count: 2 },
      { width: 2, height: 4, count: 2 },
      { width: 3, height: 4, count: 2 },
    ];
    expect(expectedFaceInventory("cuboid", CUBOID_SIDES)).toEqual(
      cuboidInventory,
    );
    expect(expectedFaceInventory("cuboid", [4, 2, 3])).toEqual(cuboidInventory);
  });
  it("accepts two different cube layouts", () => {
    const expected = [{ width: 1, height: 1, count: 6 }];
    expectComplete(cubeLayout(cubeCrossFaces), expected, [
      "B-2-E-0",
      "C-0-T-2",
      "C-1-R-3",
      "C-2-B-0",
      "C-3-L-1",
    ]);
    expectComplete(cubeLayout(cubeStripFaces), expected);
  });
  it("keeps full-edge references and segment stable", () => {
    const result = validateNetLayout(cubeLayout(cubeCrossFaces));
    const centerTop = result.sharedEdges.find(
      ({ a }) => a.faceId === "C" && a.edgeIndex === 0,
    );
    expect(centerTop).toMatchObject({
      a: { faceId: "C", edgeIndex: 0 },
      b: { faceId: "T", edgeIndex: 2 },
      length: 1,
      axis: "horizontal",
    });
    expect(centerTop?.segment).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });
  it("accepts two different cuboid layouts with the same inventory", () => {
    const expected = expectedFaceInventory("cuboid", CUBOID_SIDES);
    expectComplete(cuboidLayout(CUBOID_SIDES, cuboidCrossFaces), expected, [
      "back-3-right-1",
      "bottom-0-front-2",
      "front-0-top-2",
      "front-1-right-3",
      "front-3-left-1",
    ]);
    expectComplete(cuboidLayout([4, 2, 3], cuboidAlternativeFaces), expected);
  });
  it("separates positive-area overlap from partial edge contact", () => {
    const overlap = validateNetLayout(
      cubeLayout([face("A", 1, 1, 1, 1), face("B", 1, 1, 1, 1)]),
      "partial",
    );
    expectIssue(overlap, { code: "FACE_OVERLAP", faceIds: ["A", "B"] });
    const wide = face("wide", 0, 0, 2, 1);
    const small = face("small", 1, 1, 1, 1);
    const partial = validateNetLayout(
      cuboidLayout([1, 1, 2], [wide, small]),
      "partial",
    );
    expect(facesTouchAlongFullEdge(wide, small)).toEqual([]);
    expectIssue(partial, {
      code: "PARTIAL_EDGE_CONTACT",
      faceIds: ["wide", "small"],
      segment: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ],
    });
  });
});
describe("NET-R board modes and transform purity", () => {
  it("allows an empty partial board but reports an incomplete complete board", () => {
    const empty = cuboidLayout(CUBOID_SIDES, []);
    const partial = validateNetLayout(empty, "partial");
    const complete = validateNetLayout(empty, "complete");
    expect(partial.ok).toBe(true);
    expect(partial.complete).toBe(false);
    expect(partial.issues).toEqual([]);
    expect(partial.sharedEdges).toEqual([]);
    expect(complete.ok).toBe(false);
    expect(complete.complete).toBe(false);
    expectIssue(complete, { code: "INCOMPLETE_FACE_SET", faceIds: [] });
  });
  it("reports invalid dimensions, duplicate IDs, wrong sizes, missing and extra faces", () => {
    expect(expectedFaceInventory("cuboid", [0, 3, 4])).toEqual([]);
    expectIssue(validateNetLayout(cuboidLayout([0, 3, 4], [])), {
      code: "INVALID_DIMENSIONS",
      faceIds: [],
    });
    const duplicate = cubeCrossFaces.map((item) =>
      item.id === "T" ? { ...item, id: "C" } : item,
    );
    expectIssue(validateNetLayout(cubeLayout(duplicate)), {
      code: "DUPLICATE_FACE_ID",
      faceIds: ["C"],
    });
    const wrongSize = cubeCrossFaces.map((item) =>
      item.id === "C" ? { ...item, size: { width: 2, height: 1 } } : item,
    );
    expectIssue(validateNetLayout(cubeLayout(wrongSize)), {
      code: "INVALID_FACE_SIZE",
      faceIds: ["C"],
    });
    expectIssue(validateNetLayout(cubeLayout(cubeCrossFaces.slice(0, 5))), {
      code: "INCOMPLETE_FACE_SET",
      faceIds: [],
    });
    expectIssue(
      validateNetLayout(cubeLayout([...cubeCrossFaces, face("G", 5, 5, 1, 1)])),
      { code: "EXTRA_FACE", faceIds: ["G"] },
    );
  });
  it("rotates and translates faces without mutating the source", () => {
    const original = face("p", 2, 1, 2, 3);
    const rotated = rotateNetFace(original, 1);
    const shared = facesTouchAlongFullEdge(rotated, face("probe", 5, 1, 1, 2));
    expect(rotated).toEqual({ ...original, quarterTurns: 1 });
    expect(original).toEqual(face("p", 2, 1, 2, 3));
    expect(shared[0]).toMatchObject({ length: 2, axis: "vertical" });
    expect(shared[0]?.segment).toEqual([
      { x: 5, y: 1 },
      { x: 5, y: 3 },
    ]);
    const moved = translateNetFace(original, { x: 3, y: 2 });
    expect(moved).toEqual({ ...original, origin: { x: 3, y: 2 } });
    expect(original.origin).toEqual({ x: 2, y: 1 });
    expect(translateNetFace(original, { x: 1.5, y: 2 })).toEqual(original);
  });
});
describe("PLAY repeatable correspondence", () => {
  it("returns the same face IDs, edge references and issues on repeated validation", () => {
    const layout = cuboidLayout(CUBOID_SIDES, cuboidCrossFaces);
    const before = snapshot(layout.faces);
    const first = validateNetLayout(layout);
    const second = validateNetLayout(layout);
    expect(second).toEqual(first);
    expect(snapshot(layout.faces)).toEqual(before);
  });
});
