import { describe, expect, it } from "vitest";
import {
  gradeNet,
  type NetGradeResult,
  type NetQuizId,
  type NetTarget,
} from "../../src/geometry/netGrade";
import type { NetFace, NetLayout } from "../../src/geometry/netLayout";

const face = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  quarterTurns: 0 | 1 | 2 | 3 = 0,
): NetFace => ({
  id,
  origin: { x, y },
  size: { width, height },
  quarterTurns,
});

const cubeTarget: NetTarget = { kind: "cube", sideLengths: [1, 1, 1] };

function cubeCross(): NetLayout {
  return {
    kind: "cube",
    sideLengths: [1, 1, 1],
    faces: [
      face("center", 1, 1, 1, 1),
      face("left", 0, 1, 1, 1),
      face("right", 2, 1, 1, 1),
      face("top", 1, 0, 1, 1),
      face("bottom", 1, 2, 1, 1),
      face("back", 1, 3, 1, 1),
    ],
  };
}

function cubeStrip(): NetLayout {
  return {
    kind: "cube",
    sideLengths: [1, 1, 1],
    faces: [
      face("A", 0, 1, 1, 1),
      face("B", 1, 1, 1, 1),
      face("C", 2, 1, 1, 1),
      face("D", 3, 1, 1, 1),
      face("E", 1, 0, 1, 1),
      face("F", 2, 2, 1, 1),
    ],
  };
}

function openCubeCross(): NetLayout {
  const layout = cubeCross();
  return {
    ...layout,
    faces: layout.faces.filter((item) => item.id !== "back"),
  };
}

function cuboid234(): NetLayout {
  return {
    kind: "cuboid",
    sideLengths: [2, 3, 4],
    faces: [
      face("front", 2, 4, 3, 4),
      face("right", 5, 4, 2, 4),
      face("left", 0, 4, 2, 4),
      face("back", 7, 4, 3, 4),
      face("top", 2, 2, 2, 3, 1),
      face("bottom", 2, 8, 2, 3, 1),
    ],
  };
}

function cuboid423(): NetLayout {
  return {
    kind: "cuboid",
    sideLengths: [4, 2, 3],
    faces: [
      face("front", 2, 4, 3, 4),
      face("right", 5, 4, 2, 4),
      face("back", 7, 4, 3, 4),
      face("left", 0, 4, 2, 4),
      face("bottom", 5, 8, 2, 3),
      face("top", 7, 2, 2, 3, 1),
    ],
  };
}

function expectValidFull(result: NetGradeResult, quizId: NetQuizId): void {
  expect(result).toEqual({
    ok: true,
    closed: true,
    complete: true,
    quizId,
    reasons: [],
    hints: [],
    summary: {
      faceCount: 6,
      mappedFaceCount: 6,
      closedEdgeCount: 12,
      closedVertexCount: 8,
      openEdgeCount: 0,
      unmatchedVertexCount: 0,
    },
  });
}

describe("netGrade", () => {
  it("NET-C: different valid square layouts close as the same cube", () => {
    for (const layout of [cubeCross(), cubeStrip()]) {
      expectValidFull(gradeNet(layout, cubeTarget), "net-c-full");
    }
  });

  it("NET-C: 3D overlap and a missing face produce distinct feedback", () => {
    const rectangle: NetLayout = {
      kind: "cube",
      sideLengths: [1, 1, 1],
      faces: [
        face("A", 0, 0, 1, 1),
        face("B", 1, 0, 1, 1),
        face("C", 2, 0, 1, 1),
        face("D", 0, 1, 1, 1),
        face("E", 1, 1, 1, 1),
        face("F", 2, 1, 1, 1),
      ],
    };
    const overlap = gradeNet(rectangle, cubeTarget);
    expect(overlap.ok).toBe(false);
    expect(overlap.closed).toBe(false);
    expect(overlap.reasons).toEqual(["FACE_OVERLAP_3D"]);
    expect(overlap.hints.map((hint) => hint.code)).toEqual([
      "SEPARATE_OVERLAPPING_FACES",
    ]);
    expect(overlap.summary.closedEdgeCount).toBe(0);
    expect(overlap.summary.closedVertexCount).toBe(0);

    const open = gradeNet(openCubeCross(), cubeTarget);
    expect(open.complete).toBe(false);
    expect(open.reasons).toEqual(["INCOMPLETE_FACE_SET"]);
    expect(open.hints).toEqual([{ code: "ADD_MISSING_FACE", faceIds: [] }]);
    expect(open.summary.faceCount).toBe(5);
  });

  it("NET-R: different valid layouts close to their target dimensions", () => {
    expectValidFull(
      gradeNet(cuboid234(), { kind: "cuboid", sideLengths: [2, 3, 4] }),
      "net-r-full",
    );
    expectValidFull(
      gradeNet(cuboid423(), { kind: "cuboid", sideLengths: [4, 2, 3] }),
      "net-r-full",
    );
  });

  it("NET-R: target mismatch and a disconnected face stay separate", () => {
    const mismatch = gradeNet(cuboid234(), {
      kind: "cuboid",
      sideLengths: [2, 3, 5],
    });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.reasons).toEqual(["TARGET_MISMATCH"]);
    expect(mismatch.hints).toEqual([
      { code: "MATCH_TARGET_DIMENSIONS", faceIds: [] },
    ]);

    const layout = cuboid234();
    const target: NetTarget = { kind: "cuboid", sideLengths: [2, 3, 4] };
    const detached = {
      ...layout,
      faces: layout.faces.map((item) =>
        item.id === "back" ? { ...item, origin: { x: 12, y: 4 } } : item,
      ),
    };
    const gap = gradeNet(detached, target);
    expect(gap.ok).toBe(false);
    expect(gap.reasons).toEqual(["DISCONNECTED"]);
    expect(gap.hints.map((hint) => hint.code)).toEqual(["ALIGN_FULL_EDGE"]);
  });

  it("PLAY: partial feedback permits retry and complete feedback does not", () => {
    const partial = gradeNet(openCubeCross(), cubeTarget, "partial");
    expect(partial.ok).toBe(true);
    expect(partial.closed).toBe(false);
    expect(partial.complete).toBe(false);
    expect(partial.quizId).toBe("net-c-partial");
    expect(partial.reasons).toEqual([]);
    expect(partial.hints).toEqual([]);

    const complete = gradeNet(openCubeCross(), cubeTarget);
    expect(complete.ok).toBe(false);
    expect(complete.quizId).toBe("net-c-full");
    expect(complete.reasons).toEqual(["INCOMPLETE_FACE_SET"]);
  });

  it("PLAY: an empty partial board carries no faces and no failure", () => {
    const empty: NetLayout = {
      kind: "cube",
      sideLengths: [1, 1, 1],
      faces: [],
    };
    const result = gradeNet(empty, cubeTarget, "partial");
    expect(result.ok).toBe(true);
    expect(result.closed).toBe(false);
    expect(result.complete).toBe(false);
    expect(result.quizId).toBe("net-c-partial");
    expect(result.reasons).toEqual([]);
    expect(result.summary).toEqual({
      faceCount: 0,
      mappedFaceCount: 0,
      closedEdgeCount: 0,
      closedVertexCount: 0,
      openEdgeCount: 12,
      unmatchedVertexCount: 8,
    });
  });

  it("PLAY: reasons follow a fixed order and grading is repeatable", () => {
    const base = openCubeCross();
    const mixed: NetLayout = {
      ...base,
      faces: [...base.faces, face("wrong", 5, 3, 2, 1)],
    };
    const result = gradeNet(mixed, cubeTarget);
    expect(result.reasons).toEqual([
      "INCOMPLETE_FACE_SET",
      "EXTRA_FACE",
      "INVALID_FACE_SIZE",
    ]);
    expect(result.hints).toEqual([
      { code: "ADD_MISSING_FACE", faceIds: [] },
      { code: "REMOVE_EXTRA_FACE", faceIds: ["wrong"] },
      { code: "FIX_FACE_SIZE", faceIds: ["wrong"] },
    ]);

    const layout = cuboid234();
    const target: NetTarget = { kind: "cuboid", sideLengths: [2, 3, 4] };
    const before = JSON.stringify({ layout, target });
    const first = gradeNet(layout, target);
    expect(gradeNet(layout, target)).toEqual(first);
    expect(JSON.stringify({ layout, target })).toBe(before);
  });
});
