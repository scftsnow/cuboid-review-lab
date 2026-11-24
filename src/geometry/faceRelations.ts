export type FaceId = string;

export interface SolidFaceTopology {
  id: FaceId;
  oppositeId: FaceId;
  sideIds: readonly FaceId[];
}

export interface SolidTopology {
  faces: readonly SolidFaceTopology[];
}

export interface FaceRelations {
  baseFaceId: FaceId;
  opposite: FaceId;
  sides: readonly FaceId[];
  parallel: readonly FaceId[];
  perpendicular: readonly FaceId[];
}

export type FaceRelationCode = "INVALID_TOPOLOGY" | "UNKNOWN_BASE_FACE";

export type FaceRelationResult =
  | { ok: true; relations: FaceRelations }
  | { ok: false; code: FaceRelationCode };

function failure(code: FaceRelationCode): FaceRelationResult {
  return { ok: false, code };
}

function isValidTopology(solid: SolidTopology): boolean {
  if (solid === null || typeof solid !== "object") {
    return false;
  }

  const faces = solid.faces;
  if (!Array.isArray(faces) || faces.length !== 6) {
    return false;
  }

  const ids = new Set<FaceId>();
  for (const face of faces) {
    if (
      face === null ||
      typeof face !== "object" ||
      typeof face.id !== "string" ||
      face.id.length === 0 ||
      ids.has(face.id)
    ) {
      return false;
    }
    ids.add(face.id);
  }

  for (const face of faces) {
    if (
      typeof face.oppositeId !== "string" ||
      face.oppositeId === face.id ||
      !ids.has(face.oppositeId) ||
      !Array.isArray(face.sideIds) ||
      face.sideIds.length !== 4
    ) {
      return false;
    }

    const sideIds = new Set<FaceId>();
    for (const sideId of face.sideIds) {
      if (
        typeof sideId !== "string" ||
        sideId === face.id ||
        sideId === face.oppositeId ||
        !ids.has(sideId) ||
        sideIds.has(sideId)
      ) {
        return false;
      }
      sideIds.add(sideId);
    }

    const opposite = faces.find(
      (candidate) => candidate.id === face.oppositeId,
    );
    if (!opposite || opposite.oppositeId !== face.id) {
      return false;
    }
  }

  return true;
}

export function baseFaceRelations(
  solid: SolidTopology,
  baseFaceId: FaceId,
): FaceRelationResult {
  if (!isValidTopology(solid)) {
    return failure("INVALID_TOPOLOGY");
  }

  if (typeof baseFaceId !== "string" || baseFaceId.length === 0) {
    return failure("UNKNOWN_BASE_FACE");
  }

  const base = solid.faces.find((face) => face.id === baseFaceId);
  if (!base) {
    return failure("UNKNOWN_BASE_FACE");
  }

  const sides = [...base.sideIds];
  return {
    ok: true,
    relations: {
      baseFaceId,
      opposite: base.oppositeId,
      sides,
      parallel: [base.oppositeId],
      perpendicular: [...sides],
    },
  };
}
