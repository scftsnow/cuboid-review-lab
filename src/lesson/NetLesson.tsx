import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { foldNetLayout, type FoldResult } from "../geometry/netFold";
import { gradeNet, type NetGradeResult } from "../geometry/netGrade";
import type { NetFace, NetLayout } from "../geometry/netLayout";
import FoldView from "../scene/FoldView";
import { TOPICS } from "./topics";
import { NetBoard } from "./NetBoard";

type Kind = "cube" | "cuboid";
type Topic = "NET-C" | "NET-R";
type BoardMode = "predict" | "repair" | "partial" | "blank";
type Outcome = "correct" | "partial" | "incorrect";
type QuizKind = "net-c-partial" | "net-c-full" | "net-r-partial" | "net-r-full";
type Selection = { flatPartId: string | null; foldedPartId: string | null };

const EMPTY_SELECTION: Selection = { flatPartId: null, foldedPartId: null };

// prettier-ignore
export type NetSubmitPayload = {
  topicId: string; quizId: string; kind: QuizKind; layout: NetLayout;
  result: NetGradeResult & { outcome: Outcome }; correct: boolean;
  reason?: string; hint?: string; netLayout?: NetLayout;
  exhibit?: { kind: Kind; layout: NetLayout };
};
// prettier-ignore
export type TopicStateInput = {
  stepId?: string | null;
  results?: Readonly<Partial<Record<string, { lastResult?: { reasons?: readonly string[] } }>>>;
};
// prettier-ignore
export type NetLessonProps = {
  topicId: string; stepId?: string | null; quizId?: string | null;
  topicState?: TopicStateInput | null;
  onStepChange?: ((topicId: string, stepId: string) => void) | null;
  onSubmit?: ((payload: NetSubmitPayload) => void) | null;
  onAcknowledge?: ((quizId: string) => void) | null;
  onReturnToMap?: (() => void) | null;
};

// prettier-ignore
const HINTS: Readonly<Record<string, string>> = {
  ADD_MISSING_FACE: '빠진 면을 올바른 크기로 놓으세요.',
  REMOVE_EXTRA_FACE: '면이 여섯 개를 넘지 않게 고치세요.',
  FIX_FACE_SIZE: '면의 가로·세로 길이를 다시 확인하세요.',
  SEPARATE_OVERLAPPING_FACES: '겹친 면을 떼어 격자의 다른 칸에 놓으세요.',
  ALIGN_FULL_EDGE: '변 전체가 맞닿도록 면을 옮기거나 회전하세요.',
  CHECK_FOLD_PART: '접혔을 때 같은 자리를 차지하는 면이 없는지 확인하세요.',
  MATCH_TARGET_DIMENSIONS: '주어진 세 치수와 같은 면 여섯 장을 사용하세요.',
};

// prettier-ignore
function resolveTopic(value: string | null | undefined): Topic | null {
  if (value === "NET-C" || value === "net-cube" || value === "net-c") return "NET-C";
  if (value === "NET-R" || value === "net-cuboid" || value === "net-r") return "NET-R";
  return null;
}
// prettier-ignore
function modeOf(step: string): BoardMode {
  if (step.endsWith("fix")) return "repair";
  if (step.endsWith("complete")) return "partial";
  if (step.endsWith("build")) return "blank";
  return "predict";
}
// prettier-ignore
function quizKindOf(topic: Topic, mode: BoardMode): QuizKind {
  if (topic === "NET-C") return mode === "partial" ? "net-c-partial" : "net-c-full";
  return mode === "partial" ? "net-r-partial" : "net-r-full";
}
// prettier-ignore
function face(id: string, x: number, y: number, width: number, height: number): NetFace {
  return { id, origin: { x, y }, size: { width, height }, quarterTurns: 0 };
}
// prettier-ignore
function makeLayout(kind: Kind, stepId: string): NetLayout {
  const sideLengths: readonly [number, number, number] = kind === "cube" ? [1, 1, 1] : [2, 3, 4];
  if (stepId.endsWith("build")) return { kind, sideLengths, faces: [] };
  const cube: readonly NetFace[] = [
    face("F1", 1, 0, 1, 1), face("F2", 0, 1, 1, 1), face("F3", 1, 1, 1, 1),
    face("F4", 2, 1, 1, 1), face("F5", 1, 2, 1, 1), face("F6", 1, 3, 1, 1),
  ];
  const cuboid: readonly NetFace[] = [
    face("F1", 0, 0, 2, 3), face("F2", 0, 3, 2, 4), face("F3", 2, 0, 4, 3),
    face("F4", -4, 0, 4, 3), face("F5", 0, -4, 2, 4), face("F6", 0, 7, 2, 3),
  ];
  const complete = kind === "cube" ? cube : cuboid;
  if (stepId.endsWith("complete")) return { kind, sideLengths, faces: complete.slice(0, 5) };
  if (stepId.endsWith("fix")) {
    const x = kind === "cube" ? 3 : 6;
    const y = kind === "cube" ? 3 : 7;
    return {
      kind, sideLengths,
      faces: complete.map((item) => item.id === "F6" ? face("F6", x, y, item.size.width, item.size.height) : item),
    };
  }
  return { kind, sideLengths, faces: complete };
}
// prettier-ignore
function localId(kind: "edge" | "vertex", faceId: string, index: number): string { return faceId + ":" + kind + ":" + index; }
// prettier-ignore
function canonicalLocal(value: string): string {
  const edge = /^([^:]+):e([0-3])$/.exec(value);
  if (edge) return localId("edge", edge[1], Number(edge[2]));
  const vertex = /^([^:]+):v([0-3])$/.exec(value);
  if (vertex) return localId("vertex", vertex[1], Number(vertex[2]));
  return value;
}
// prettier-ignore
function groupKey(ids: readonly string[]): string {
  return [...ids].sort().join(":");
}
// prettier-ignore
function resolveSelection(fold: FoldResult, raw: string | null): Selection {
  const value = typeof raw === "string" && raw.trim() ? canonicalLocal(raw.trim()) : "";
  if (!value) return EMPTY_SELECTION;
  for (const item of fold.correspondence.faces) {
    if (value === item.faceId || value === item.foldedFaceId) {
      return { flatPartId: item.faceId, foldedPartId: item.foldedFaceId };
    }
  }
  for (const item of fold.correspondence.edges) {
    const locals = item.positions2d.map((part) => localId("edge", part.faceId, part.edgeIndex));
    if (value === item.foldedEdgeId || locals.includes(value) || value === "E:" + groupKey(item.faceIds)) {
      return { flatPartId: locals[0] ?? null, foldedPartId: item.foldedEdgeId };
    }
  }
  for (const item of fold.correspondence.vertices) {
    const locals = item.positions2d.map((part) => localId("vertex", part.faceId, part.vertexIndex));
    if (value === item.foldedVertexId || locals.includes(value) || value === "V:" + groupKey(item.faceIds)) {
      return { flatPartId: locals[0] ?? null, foldedPartId: item.foldedVertexId };
    }
  }
  return { flatPartId: value, foldedPartId: null };
}
// prettier-ignore
function highlightedPartIdsOf(fold: FoldResult, selection: Selection): string[] {
  const flat = selection.flatPartId ? canonicalLocal(selection.flatPartId) : "";
  const folded = selection.foldedPartId ?? "";
  if (!flat && !folded) return [];
  const ids: string[] = [];
  for (const item of fold.correspondence.faces) {
    if (item.faceId === flat || item.foldedFaceId === folded) ids.push(item.faceId);
  }
  for (const item of fold.correspondence.edges) {
    const locals = item.positions2d.map((part) => localId("edge", part.faceId, part.edgeIndex));
    if (folded === item.foldedEdgeId || locals.includes(flat)) ids.push(...locals);
  }
  for (const item of fold.correspondence.vertices) {
    const locals = item.positions2d.map((part) => localId("vertex", part.faceId, part.vertexIndex));
    if (folded === item.foldedVertexId || locals.includes(flat)) ids.push(...locals);
  }
  return [...new Set(ids)];
}

// prettier-ignore
export function NetLesson({
  topicId, stepId, quizId, topicState, onSubmit,
}: NetLessonProps): ReactElement | null {
  const topic = resolveTopic(topicId);
  if (topic === null) return null;
  const activeTopic: Topic = topic;
  const spec = TOPICS[topic];
  const kind: Kind = activeTopic === "NET-C" ? "cube" : "cuboid";
  const stored = topicState?.stepId ?? null;
  const requested = typeof stepId === "string" && stepId.trim() && spec.stepIds.includes(stepId)
    ? stepId : typeof stored === "string" && stored.trim() ? stored : spec.firstStepId;
  const activeStep = spec.stepIds.includes(requested) ? requested : spec.firstStepId;
  const mode = modeOf(activeStep);
  const quiz = spec.quizzes.find((item) => item.id === quizId || item.stepId === activeStep) ?? null;
  const target = { kind, sideLengths: kind === "cube" ? [1, 1, 1] as const : [2, 3, 4] as const };

  const [layout, setLayout] = useState<NetLayout>(() => makeLayout(kind, activeStep));
  const [selection, setSelection] = useState<Selection>(activeStep.endsWith("correspond")
    ? resolveSelection(foldNetLayout(makeLayout(kind, activeStep)), "F1") : EMPTY_SELECTION);
  const [foldProgress, setFoldProgress] = useState(activeStep.endsWith("correspond") ? 1 : 0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setLayout(makeLayout(kind, activeStep));
    setSelection(activeStep.endsWith("correspond")
      ? resolveSelection(foldNetLayout(makeLayout(kind, activeStep)), "F1") : EMPTY_SELECTION);
    setFoldProgress(activeStep.endsWith("correspond") ? 1 : 0);
    setNotice(null);
  }, [kind, activeStep]);

  const fold = useMemo(() => foldNetLayout(layout), [layout]);
  const activeSelection = useMemo(() => selection.flatPartId || selection.foldedPartId
    ? resolveSelection(fold, selection.flatPartId ?? selection.foldedPartId) : EMPTY_SELECTION, [fold, selection]);
  const selectedFlatPartId = activeSelection.flatPartId;
  const selectedFoldedPartId = activeSelection.foldedPartId;
  const highlightedPartIds = highlightedPartIdsOf(fold, activeSelection);
  const stateReasons = topicState?.results?.[quiz?.id ?? ""]?.lastResult?.reasons ?? [];
  const hintText = fold.reasons.map((item) => item.code).join(", ") || stateReasons.join(", ");

  function handleSelect(partId: string | null): void {
    const clean = typeof partId === "string" && partId.trim() ? partId.trim() : null;
    setSelection(clean ? resolveSelection(fold, clean) : EMPTY_SELECTION);
  }
  function handleSubmit(): void {
    if (!quiz || !onSubmit) return;
    const result = gradeNet(layout, target, "complete");
    const missingFace = mode === "partial" && result.reasons.length === 1
      && result.reasons[0] === "INCOMPLETE_FACE_SET";
    const correct = result.ok && result.closed;
    const outcome: Outcome = correct ? "correct" : missingFace ? "partial" : "incorrect";
    const payload: NetSubmitPayload = {
      topicId, quizId: quiz.id, kind: quizKindOf(activeTopic, mode), layout,
      result: { ...result, outcome },
      correct,
      reason: result.reasons.join(", ") || undefined,
      hint: result.hints.map((item) => HINTS[item.code] ?? item.code).join(" ") || undefined,
      netLayout: layout,
      exhibit: mode === "blank" && correct ? { kind, layout } : undefined,
    };
    onSubmit(payload);
  }

  const fixedFaceIds = activeStep.endsWith("observe")
    ? layout.faces.map((item) => item.id)
    : activeStep.endsWith("fix")
      ? layout.faces.filter((item) => item.id !== "F6").map((item) => item.id)
      : [];

  return (
    <section className="net-lesson" data-net-lesson="" data-topic={topicId} data-step={activeStep}
      data-kind={kind} data-highlighted-part-ids={highlightedPartIds.join("|")}>
      <NetBoard kind={kind} mode={mode} sideLengths={target.sideLengths} layout={layout}
        selectedPartId={selectedFlatPartId} highlightedPartIds={highlightedPartIds}
        fixedFaceIds={fixedFaceIds}
        onChange={setLayout} onSelect={handleSelect} onNotice={setNotice} />
      <div className="net-lesson__fold">
        <label>접기 슬라이더
          <input type="range" min={0} max={1} step={0.01} value={foldProgress}
            data-testid="fold-slider" aria-label="접기 슬라이더"
            onChange={(event) => setFoldProgress(Number(event.target.value))} />
        </label>
        <FoldView layout={layout} foldResult={fold} foldProgress={foldProgress}
          selectedPartId={selectedFoldedPartId} onSelectPart={handleSelect} />
      </div>
      {notice ? <p role="alert" data-testid="net-notice">{notice}</p> : null}
      {hintText ? <p data-testid="net-hint">{hintText}</p> : null}
      {quiz ? (
        <button type="button" data-testid="net-submit" disabled={!onSubmit} onClick={handleSubmit}>제출</button>
      ) : null}
    </section>
  );
}

export default NetLesson;
