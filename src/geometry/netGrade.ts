import {
  validateNetLayout,
  type NetIssueCode,
  type NetLayout,
} from "./netLayout";
import { foldNetLayout, type FoldReasonCode, type FoldResult } from "./netFold";

export type NetTarget = {
  kind: "cube" | "cuboid";
  sideLengths: readonly [number, number, number];
};
export type NetGradeMode = "partial" | "complete";
export type NetQuizId =
  "net-c-partial" | "net-c-full" | "net-r-partial" | "net-r-full";
/* prettier-ignore */
export type NetGradeReasonCode =
  | 'INVALID_TARGET' | 'INCOMPLETE_FACE_SET' | 'EXTRA_FACE' | 'INVALID_FACE_SIZE' | 'DUPLICATE_FACE_ID'
  | 'FACE_OVERLAP' | 'PARTIAL_EDGE_CONTACT' | 'DISCONNECTED' | 'FOLD_FAILED' | 'FACE_OVERLAP_3D'
  | 'FACE_NOT_ONE_TO_ONE' | 'EDGE_NOT_CLOSED' | 'VERTEX_NOT_CLOSED' | 'TARGET_MISMATCH';
/* prettier-ignore */
export type NetGradeHintCode =
  | 'ADD_MISSING_FACE' | 'REMOVE_EXTRA_FACE' | 'FIX_FACE_SIZE' | 'SEPARATE_OVERLAPPING_FACES'
  | 'ALIGN_FULL_EDGE' | 'CHECK_FOLD_PART' | 'MATCH_TARGET_DIMENSIONS';
export type NetGradeHint = {
  code: NetGradeHintCode;
  faceIds: readonly string[];
};
export type NetGradeSummary = {
  faceCount: number;
  mappedFaceCount: number;
  closedEdgeCount: number;
  closedVertexCount: number;
  openEdgeCount: number;
  unmatchedVertexCount: number;
};
export type NetGradeResult = {
  ok: boolean;
  closed: boolean;
  complete: boolean;
  quizId: NetQuizId;
  reasons: readonly NetGradeReasonCode[];
  hints: readonly NetGradeHint[];
  summary: NetGradeSummary;
};

/* prettier-ignore */
const REASON_ORDER: readonly NetGradeReasonCode[] = [
  'INVALID_TARGET', 'INCOMPLETE_FACE_SET', 'EXTRA_FACE', 'INVALID_FACE_SIZE', 'DUPLICATE_FACE_ID',
  'FACE_OVERLAP', 'PARTIAL_EDGE_CONTACT', 'DISCONNECTED', 'FOLD_FAILED', 'FACE_OVERLAP_3D',
  'FACE_NOT_ONE_TO_ONE', 'EDGE_NOT_CLOSED', 'VERTEX_NOT_CLOSED', 'TARGET_MISMATCH',
];
/* prettier-ignore */
const REASON_TO_HINT: Record<NetGradeReasonCode, NetGradeHintCode> = {
  INVALID_TARGET: 'MATCH_TARGET_DIMENSIONS', INCOMPLETE_FACE_SET: 'ADD_MISSING_FACE', EXTRA_FACE: 'REMOVE_EXTRA_FACE',
  INVALID_FACE_SIZE: 'FIX_FACE_SIZE', DUPLICATE_FACE_ID: 'SEPARATE_OVERLAPPING_FACES', FACE_OVERLAP: 'SEPARATE_OVERLAPPING_FACES',
  PARTIAL_EDGE_CONTACT: 'ALIGN_FULL_EDGE', DISCONNECTED: 'ALIGN_FULL_EDGE', FOLD_FAILED: 'CHECK_FOLD_PART',
  FACE_OVERLAP_3D: 'SEPARATE_OVERLAPPING_FACES', FACE_NOT_ONE_TO_ONE: 'CHECK_FOLD_PART', EDGE_NOT_CLOSED: 'ALIGN_FULL_EDGE',
  VERTEX_NOT_CLOSED: 'ALIGN_FULL_EDGE', TARGET_MISMATCH: 'MATCH_TARGET_DIMENSIONS',
};
/* prettier-ignore */
const ISSUE_TO_REASON: Record<NetIssueCode, NetGradeReasonCode> = {
  INVALID_DIMENSIONS: 'INVALID_FACE_SIZE', DUPLICATE_FACE_ID: 'DUPLICATE_FACE_ID', INVALID_FACE_SIZE: 'INVALID_FACE_SIZE',
  FACE_OVERLAP: 'FACE_OVERLAP', PARTIAL_EDGE_CONTACT: 'PARTIAL_EDGE_CONTACT', INCOMPLETE_FACE_SET: 'INCOMPLETE_FACE_SET',
  EXTRA_FACE: 'EXTRA_FACE',
};
/* prettier-ignore */
const FOLD_TO_REASON: Record<FoldReasonCode, NetGradeReasonCode> = {
  INVALID_INPUT: 'FOLD_FAILED', EMPTY_LAYOUT: 'FOLD_FAILED', DISCONNECTED_FACE: 'DISCONNECTED',
  EDGE_LENGTH_MISMATCH: 'PARTIAL_EDGE_CONTACT', OVERLAP_2D: 'FACE_OVERLAP', FACE_OVERLAP_3D: 'FACE_OVERLAP_3D',
  UNMATCHED_EDGE: 'EDGE_NOT_CLOSED', UNMATCHED_VERTEX: 'VERTEX_NOT_CLOSED',
};

const sideKey = (values: readonly number[]): string =>
  values
    .slice()
    .sort((a, b) => a - b)
    .join(",");
const closureReason = (reason: NetGradeReasonCode): boolean =>
  reason === "EDGE_NOT_CLOSED" ||
  reason === "VERTEX_NOT_CLOSED" ||
  reason === "FACE_NOT_ONE_TO_ONE";

function validTarget(target: NetTarget): boolean {
  if (target.kind !== "cube" && target.kind !== "cuboid") return false;
  const sides = target.sideLengths;
  if (
    sides.length !== 3 ||
    sides.some((side) => !Number.isInteger(side) || side <= 0)
  )
    return false;
  return target.kind === "cube"
    ? new Set(sides).size === 1
    : new Set(sides).size === 3;
}

function quizIdFor(target: NetTarget, mode: NetGradeMode): NetQuizId {
  const prefix = target.kind === "cuboid" ? "net-r-" : "net-c-";
  return (
    mode === "partial" ? prefix + "partial" : prefix + "full"
  ) as NetQuizId;
}

function addReason(
  reasons: Set<NetGradeReasonCode>,
  faces: Map<NetGradeReasonCode, Set<string>>,
  reason: NetGradeReasonCode,
  ids: readonly string[] = [],
): void {
  reasons.add(reason);
  const current = faces.get(reason) ?? new Set<string>();
  for (const id of ids) current.add(id);
  faces.set(reason, current);
}

function summarize(
  layout: NetLayout,
  fold: FoldResult | null,
  complete: boolean,
  reasons: readonly NetGradeReasonCode[],
): NetGradeSummary {
  const folded = complete && fold !== null && fold.ok && reasons.length === 0;
  const edges = folded
    ? fold.correspondence.edges.filter((edge) => edge.positions2d.length === 2)
        .length
    : 0;
  const vertices = folded
    ? fold.correspondence.vertices.filter(
        (vertex) => vertex.positions2d.length === 3,
      ).length
    : 0;
  return {
    faceCount: layout.faces.length,
    mappedFaceCount: folded ? fold.correspondence.faces.length : 0,
    closedEdgeCount: edges,
    closedVertexCount: vertices,
    openEdgeCount: 12 - edges,
    unmatchedVertexCount: 8 - vertices,
  };
}

export function gradeNet(
  layout: NetLayout,
  target: NetTarget,
  mode: NetGradeMode = "complete",
): NetGradeResult {
  const reasons = new Set<NetGradeReasonCode>();
  const reasonFaces = new Map<NetGradeReasonCode, Set<string>>();
  const valid = validTarget(target);
  if (!valid) addReason(reasons, reasonFaces, "INVALID_TARGET");

  const validation = validateNetLayout(layout, mode);
  for (const issue of validation.issues) {
    const reason = ISSUE_TO_REASON[issue.code];
    if (mode === "partial" && reason === "INCOMPLETE_FACE_SET") continue;
    addReason(reasons, reasonFaces, reason, issue.faceIds);
  }

  if (
    valid &&
    (layout.kind !== target.kind ||
      sideKey(layout.sideLengths) !== sideKey(target.sideLengths))
  ) {
    addReason(reasons, reasonFaces, "TARGET_MISMATCH");
  }

  let fold: FoldResult | null = null;
  if (valid && reasons.size === 0 && layout.faces.length > 0) {
    fold = foldNetLayout(layout);
    const foldReasons = fold.reasons.map(
      (reason) => FOLD_TO_REASON[reason.code],
    );
    const primary = foldReasons.some((reason) => !closureReason(reason));
    for (const reason of foldReasons) {
      if (primary && closureReason(reason)) continue;
      if (
        mode === "partial" &&
        (reason === "FOLD_FAILED" || closureReason(reason))
      )
        continue;
      addReason(reasons, reasonFaces, reason);
    }
    if (!fold.ok && foldReasons.length === 0 && mode === "complete") {
      addReason(reasons, reasonFaces, "FOLD_FAILED");
    }
  }

  const orderedReasons = REASON_ORDER.filter((reason) => reasons.has(reason));
  const hints: NetGradeHint[] = [];
  const usedHints = new Set<NetGradeHintCode>();
  for (const reason of orderedReasons) {
    const code = REASON_TO_HINT[reason];
    if (usedHints.has(code)) continue;
    usedHints.add(code);
    const ids = new Set<string>();
    for (const [source, sourceFaces] of reasonFaces) {
      if (REASON_TO_HINT[source] === code)
        for (const id of sourceFaces) ids.add(id);
    }
    hints.push({ code, faceIds: [...ids].sort() });
  }

  const summary = summarize(
    layout,
    fold,
    valid && validation.complete,
    orderedReasons,
  );
  const closed =
    valid &&
    validation.complete &&
    summary.mappedFaceCount === 6 &&
    summary.closedEdgeCount === 12 &&
    summary.closedVertexCount === 8 &&
    orderedReasons.length === 0;
  return {
    ok:
      mode === "partial"
        ? orderedReasons.length === 0
        : closed && orderedReasons.length === 0,
    closed,
    complete: valid && validation.complete,
    quizId: quizIdFor(target, mode),
    reasons: orderedReasons,
    hints,
    summary,
  };
}
