import { describe, expect, it } from "vitest";
import {
  baseFaceRelations,
  type FaceId,
  type SolidFaceTopology,
  type SolidTopology,
} from "../../src/geometry/faceRelations";
import { getSolidTopology } from "../../src/geometry/solid";

type Axis = 0 | 1 | 2;
type FacePosition = readonly [number, number, number];

interface FaceGeometry {
  id: FaceId;
  positions: readonly FacePosition[];
}

interface FaceDescriptor {
  id: FaceId;
  axis: Axis;
  value: number;
}

const AXES: readonly Axis[] = [0, 1, 2];

function cuboidFaceGeometry(): readonly FaceGeometry[] {
  const topology = getSolidTopology("solid-cuboid");
  expect(topology.ok).toBe(true);
  if (!topology.ok) {
    throw new Error("solid-cuboid topology is required by the FACES tests");
  }

  return topology.value.faces.map((face) => {
    const positions = face.vertexIds.map((vertexId) => {
      const vertex = topology.value.vertices.find(
        (candidate) => candidate.id === vertexId,
      );
      if (!vertex) {
        throw new Error(`Missing vertex ${vertexId} for face ${face.id}`);
      }
      return vertex.position;
    });
    return { id: face.id, positions };
  });
}

function constantAxis(positions: readonly FacePosition[]): Axis {
  const first = positions[0];
  if (!first) {
    throw new Error("A face must have at least one vertex position");
  }

  const axis = AXES.find((candidate) =>
    positions.every((position) => position[candidate] === first[candidate]),
  );
  if (axis === undefined) {
    throw new Error("A cuboid face must lie on one constant coordinate axis");
  }
  return axis;
}

function relationTopology(
  geometry: readonly FaceGeometry[],
  reverseSides = false,
): SolidTopology {
  const descriptors: FaceDescriptor[] = geometry.map((face) => {
    const axis = constantAxis(face.positions);
    const first = face.positions[0];
    if (!first) {
      throw new Error(`Face ${face.id} has no vertex position`);
    }
    return { id: face.id, axis, value: first[axis] };
  });

  const faces: SolidFaceTopology[] = descriptors.map((descriptor) => {
    const opposite = descriptors.find(
      (candidate) =>
        candidate.id !== descriptor.id &&
        candidate.axis === descriptor.axis &&
        candidate.value !== descriptor.value,
    );
    if (!opposite) {
      throw new Error(`Face ${descriptor.id} has no opposite face`);
    }

    const sideIds = descriptors
      .filter((candidate) => candidate.axis !== descriptor.axis)
      .map((candidate) => candidate.id);
    if (sideIds.length !== 4) {
      throw new Error(`Face ${descriptor.id} has ${sideIds.length} side faces`);
    }

    return {
      id: descriptor.id,
      oppositeId: opposite.id,
      sideIds: reverseSides ? sideIds.slice().reverse() : sideIds,
    };
  });

  return { faces };
}

function descriptorById(
  geometry: readonly FaceGeometry[],
): Map<FaceId, FaceDescriptor> {
  const descriptors = new Map<FaceId, FaceDescriptor>();
  for (const face of geometry) {
    const axis = constantAxis(face.positions);
    const first = face.positions[0];
    if (!first) {
      throw new Error(`Face ${face.id} has no vertex position`);
    }
    descriptors.set(face.id, { id: face.id, axis, value: first[axis] });
  }
  return descriptors;
}

function relationResult(topology: SolidTopology, baseFaceId: FaceId) {
  const result = baseFaceRelations(topology, baseFaceId);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected relations for ${baseFaceId}`);
  }
  return result.relations;
}

describe("FACES face relations", () => {
  const geometry = cuboidFaceGeometry();
  const topology = relationTopology(geometry);
  const descriptors = descriptorById(geometry);
  const allFaceIds = new Set(geometry.map((face) => face.id));

  it("returns exact relation sets for every stable base face ID", () => {
    expect(allFaceIds.size).toBe(6);

    for (const baseFaceId of allFaceIds) {
      const descriptor = descriptors.get(baseFaceId);
      expect(descriptor).toBeDefined();
      if (!descriptor) {
        continue;
      }

      const expectedOpposite = [...descriptors.values()].find(
        (candidate) =>
          candidate.id !== baseFaceId &&
          candidate.axis === descriptor.axis &&
          candidate.value !== descriptor.value,
      );
      expect(expectedOpposite).toBeDefined();
      if (!expectedOpposite) {
        continue;
      }

      const expectedSides = [...descriptors.values()]
        .filter((candidate) => candidate.axis !== descriptor.axis)
        .map((candidate) => candidate.id);
      const relations = relationResult(topology, baseFaceId);

      expect(relations.baseFaceId).toBe(baseFaceId);
      expect(relations.opposite).toBe(expectedOpposite.id);
      expect(new Set([relations.opposite])).toEqual(
        new Set([expectedOpposite.id]),
      );
      expect(new Set(relations.sides)).toEqual(new Set(expectedSides));
      expect(new Set(relations.parallel)).toEqual(
        new Set([expectedOpposite.id]),
      );
      expect(new Set(relations.perpendicular)).toEqual(new Set(expectedSides));

      expect(relations.sides).toHaveLength(4);
      expect(relations.parallel).toHaveLength(1);
      expect(relations.perpendicular).toHaveLength(4);
      expect(new Set(relations.sides)).toEqual(
        new Set(relations.perpendicular),
      );
      expect(
        new Set([baseFaceId, relations.opposite, ...relations.sides]),
      ).toEqual(allFaceIds);
    }
  });

  it("compares relation sets independently of source side ordering", () => {
    const reversedTopology = relationTopology(geometry, true);

    for (const baseFaceId of allFaceIds) {
      const expected = relationResult(topology, baseFaceId);
      const reordered = relationResult(reversedTopology, baseFaceId);

      expect(new Set([reordered.opposite])).toEqual(
        new Set([expected.opposite]),
      );
      expect(new Set(reordered.sides)).toEqual(new Set(expected.sides));
      expect(new Set(reordered.parallel)).toEqual(new Set(expected.parallel));
      expect(new Set(reordered.perpendicular)).toEqual(
        new Set(expected.perpendicular),
      );
    }
  });

  it("returns the declared reason codes for invalid inputs", () => {
    const baseFaceId = geometry[0]?.id;
    expect(baseFaceId).toBeDefined();
    if (!baseFaceId) {
      return;
    }

    expect(baseFaceRelations(topology, "")).toEqual({
      ok: false,
      code: "UNKNOWN_BASE_FACE",
    });
    expect(baseFaceRelations(topology, "fMissing")).toEqual({
      ok: false,
      code: "UNKNOWN_BASE_FACE",
    });
    expect(
      baseFaceRelations({ faces: topology.faces.slice(0, 5) }, baseFaceId),
    ).toEqual({ ok: false, code: "INVALID_TOPOLOGY" });
  });
});
