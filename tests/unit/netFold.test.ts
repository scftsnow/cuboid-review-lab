import { describe, expect, it } from "vitest";
import { foldNetLayout } from "../../src/geometry/netFold";
import type { NetFace, NetLayout } from "../../src/geometry/netLayout";

function face(
  id: string,
  x: number,
  y: number,
  width = 1,
  height = 1,
): NetFace {
  return { id, origin: { x, y }, size: { width, height }, quarterTurns: 0 };
}

function translate(layout: NetLayout, dx: number, dy: number): NetLayout {
  return {
    ...layout,
    faces: layout.faces.map((item) => ({
      ...item,
      origin: { x: item.origin.x + dx, y: item.origin.y + dy },
    })),
  };
}

const cubeCross: NetLayout = {
  kind: "cube",
  sideLengths: [1, 1, 1],
  faces: [
    face("bottom2", 1, 3),
    face("bottom", 1, 2),
    face("center", 1, 1),
    face("left", 0, 1),
    face("right", 2, 1),
    face("top", 1, 0),
  ],
};

const cuboidTopBack: NetLayout = {
  kind: "cuboid",
  sideLengths: [2, 1, 3],
  faces: [
    face("back", 2, -4, 2, 3),
    face("bottom", 2, 3, 2, 1),
    face("front", 2, 0, 2, 3),
    face("left", 1, 0, 1, 3),
    face("right", 4, 0, 1, 3),
    face("top", 2, -1, 2, 1),
  ],
};

const cuboidBottomBack: NetLayout = {
  kind: "cuboid",
  sideLengths: [2, 1, 3],
  faces: [
    face("back", 2, 5, 2, 3),
    face("bottom", 2, 4, 2, 1),
    face("front", 2, 1, 2, 3),
    face("left", 1, 1, 1, 3),
    face("right", 4, 1, 1, 3),
    face("top", 2, 0, 2, 1),
  ],
};

const overlapRect: NetLayout = {
  kind: "cube",
  sideLengths: [1, 1, 1],
  faces: [
    face("a", 0, 0),
    face("b", 1, 0),
    face("c", 2, 0),
    face("d", 0, 1),
    face("e", 1, 1),
    face("f", 2, 1),
  ],
};

const disconnected: NetLayout = {
  kind: "cube",
  sideLengths: [1, 1, 1],
  faces: [face("a", 0, 0), face("b", 5, 5)],
};

const partialContact: NetLayout = {
  kind: "cuboid",
  sideLengths: [2, 1, 3],
  faces: [face("long", 0, 0, 1, 3), face("short", 1, 0, 2, 1)],
};

function signature(layout: NetLayout) {
  const result = foldNetLayout(layout);
  return {
    planes: result.faces.map((item) => item.plane).sort(),
    edges: result.correspondence.edges.map((item) => item.foldedEdgeId).sort(),
    vertices: result.correspondence.vertices
      .map((item) => item.foldedVertexId)
      .sort(),
  };
}

function expectClosedBox(layout: NetLayout): void {
  const result = foldNetLayout(layout);
  expect(result.ok).toBe(true);
  expect(result.reasons).toEqual([]);
  expect(result.faces).toHaveLength(6);
  expect(new Set(result.faces.map((item) => item.plane)).size).toBe(6);

  const edges = result.correspondence.edges;
  const vertices = result.correspondence.vertices;
  expect(edges).toHaveLength(12);
  expect(vertices).toHaveLength(8);
  expect(new Set(edges.map((item) => item.foldedEdgeId)).size).toBe(12);
  expect(new Set(vertices.map((item) => item.foldedVertexId)).size).toBe(8);

  for (const edge of edges) {
    expect(edge.positions2d).toHaveLength(2);
    expect(edge.points3d).toHaveLength(2);
    for (const position of edge.positions2d) {
      expect([0, 1, 2, 3]).toContain(position.edgeIndex);
      expect(edge.faceIds).toContain(position.faceId);
    }
  }
  for (const vertex of vertices) {
    expect(vertex.positions2d).toHaveLength(3);
    for (const position of vertex.positions2d) {
      expect([0, 1, 2, 3]).toContain(position.vertexIndex);
      expect(vertex.faceIds).toContain(position.faceId);
    }
  }
  for (const entry of result.correspondence.faces) {
    expect(
      result.faces.some(
        (item) =>
          item.faceId === entry.faceId &&
          item.foldedFaceId === entry.foldedFaceId,
      ),
    ).toBe(true);
  }
}

describe("foldNetLayout", () => {
  it("folds two cube crosses with shared folded face, edge and vertex IDs", () => {
    expectClosedBox(cubeCross);
    expectClosedBox(translate(cubeCross, 11, 7));
    expect(signature(cubeCross)).toEqual(
      signature(translate(cubeCross, 11, 7)),
    );
  });

  it("folds two valid cuboid nets and their translated copy into the same correspondence set", () => {
    expectClosedBox(cuboidTopBack);
    expectClosedBox(cuboidBottomBack);
    expectClosedBox(translate(cuboidTopBack, 10, 6));
    expect(signature(cuboidTopBack)).toEqual(signature(cuboidBottomBack));
    expect(signature(translate(cuboidTopBack, 10, 6))).toEqual(
      signature(cuboidTopBack),
    );
  });

  it("reports a 3D face overlap with its 2D repair location", () => {
    const result = foldNetLayout(overlapRect);
    expect(result.ok).toBe(false);
    const reason = result.reasons.find(
      (item) => item.code === "FACE_OVERLAP_3D",
    );
    expect(reason).toBeDefined();
    expect(reason?.faceIds).toEqual(expect.arrayContaining(["d", "e"]));
    expect(reason?.location).toEqual({ x: 1, y: 1 });
  });

  it("reports a disconnected face with its 2D repair location", () => {
    const result = foldNetLayout(disconnected);
    expect(result.ok).toBe(false);
    const reason = result.reasons.find(
      (item) => item.code === "DISCONNECTED_FACE",
    );
    expect(reason).toBeDefined();
    expect(reason?.faceIds).toEqual(["b"]);
    expect(reason?.location).toEqual({ x: 5, y: 5 });
  });

  it("reports a partial edge contact with its 2D repair location", () => {
    const result = foldNetLayout(partialContact);
    expect(result.ok).toBe(false);
    const reason = result.reasons.find(
      (item) => item.code === "EDGE_LENGTH_MISMATCH",
    );
    expect(reason).toBeDefined();
    expect(reason?.faceIds).toEqual(expect.arrayContaining(["long", "short"]));
    expect(reason?.location).toEqual({ x: 1, y: 0.5 });
  });

  it("exposes all 2D positions for folded selections and returns EMPTY_LAYOUT for a blank board", () => {
    const folded = foldNetLayout(cubeCross);
    const faceEntry = folded.correspondence.faces[0];
    const foldedFace = folded.faces.find(
      (item) => item.faceId === faceEntry.faceId,
    );
    expect(foldedFace?.foldedFaceId).toBe(faceEntry.foldedFaceId);
    expect(
      folded.correspondence.faces.filter(
        (item) => item.foldedFaceId === faceEntry.foldedFaceId,
      ),
    ).toHaveLength(1);

    const edge = folded.correspondence.edges[0];
    expect(
      folded.correspondence.edges.filter(
        (item) => item.foldedEdgeId === edge.foldedEdgeId,
      ),
    ).toHaveLength(1);
    expect(edge.positions2d.map((item) => item.faceId).sort()).toEqual(
      [...edge.faceIds].sort(),
    );

    const vertex = folded.correspondence.vertices[0];
    expect(
      folded.correspondence.vertices.filter(
        (item) => item.foldedVertexId === vertex.foldedVertexId,
      ),
    ).toHaveLength(1);
    expect(vertex.positions2d.map((item) => item.faceId).sort()).toEqual(
      [...vertex.faceIds].sort(),
    );

    const empty = foldNetLayout({
      kind: "cube",
      sideLengths: [1, 1, 1],
      faces: [],
    });
    expect(empty.ok).toBe(false);
    expect(empty.reasons.map((item) => item.code)).toContain("EMPTY_LAYOUT");
    expect(empty.faces).toEqual([]);
    expect(empty.correspondence).toEqual({
      faces: [],
      edges: [],
      vertices: [],
    });
  });
});
