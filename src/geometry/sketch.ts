import { edgeKey, normalizeEdgeInput, styleOf } from "./sketchEdgeValues";
import type { EdgeStyle } from "./sketchEdgeValues";

export { edgeKey, normalizeEdgeInput, styleOf };
export type { EdgeStyle };

type InvalidKind = "QUESTION" | "TARGET" | "VIEW" | "POINTS";
type InvalidEdgeKind = "LOCKED_EDGES" | "SUBMISSION";
export type SketchReason =
  | `INVALID_${InvalidKind | InvalidEdgeKind}`
  | "DUPLICATE_POINT"
  | "UNKNOWN_POINT";

type IdList = string | string[];
type Reasons = SketchReason[];
type AnswerMap = Record<string, EdgeStyle>;
type StyleMap = Record<string, EdgeStyle | boolean>;
type PointPosition = { x?: number; y?: number };
type PointFlags = { solidId?: string; hidden?: boolean; visible?: boolean };
export type SketchPoint = { id: string } & PointPosition & PointFlags;

type EdgeFlags = { visible?: boolean; hidden?: boolean; style?: EdgeStyle };
type EdgeViewLists = { visibleFrom?: string[]; hiddenFrom?: string[] };
export type SketchEdge = { a: string; b: string } & EdgeFlags & EdgeViewLists;
export type SketchEdgeInput = SketchEdge | [string, string] | string;
type EdgeInputs = SketchEdgeInput[];

type ViewEdges = { visibleEdges?: IdList; hiddenEdges?: IdList };
type ViewPoints = { visiblePoints?: IdList; hiddenPoints?: IdList };
export type SketchView = { id?: string } & ViewEdges & ViewPoints;
type Views = Record<string, SketchView>;
export type SketchTarget = { id?: string; edges?: EdgeInputs; views?: Views };

type TargetRef = SketchTarget | string;
type FixedView = string | SketchView;
type QuestionCore = { target: TargetRef; fixedView: FixedView };
type QuestionPoints = { points: SketchPoint[]; edges?: EdgeInputs };
type QuestionAnswer = { lockedEdges?: StyleMap; answer?: AnswerMap };
export type SketchQuestion = QuestionCore &
  QuestionPoints &
  QuestionAnswer &
  ViewEdges;

export type SketchEdgeMap = Record<string, EdgeStyle>;
type MapMeta = { ok: boolean; reasons: Reasons; edges: SketchEdgeMap };
export type SketchMapResult = SketchEdgeMap & MapMeta;
type Mismatch = { missing: string[]; extra: string[]; wrongStyle: string[] };
type GradeMeta = { readonly ok: boolean; readonly reasons: Reasons };
export type SketchGrade = Mismatch & GradeMeta;
type SubmissionPairs = Iterable<[string, EdgeStyle]>;
type SubmissionBase = SketchEdgeMap | SubmissionPairs | SketchEdgeInput[];
export type SketchSubmission = SubmissionBase | SketchMapResult;
type Submission = SketchSubmission;

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const uniqueReasons = (...reasons: Reasons): Reasons =>
  Array.from(new Set(reasons));
const asEdgeIds = (value: IdList | undefined): string[] =>
  asArray(value)
    .map((item) => item.replace(/^hidden:/, ""))
    .filter(Boolean);
const ids = (...values: (IdList | undefined)[]) =>
  new Set(values.flatMap((value) => asEdgeIds(value)));

type MetaTarget = SketchEdgeMap | SketchGrade;
type MetaInfo = { ok: boolean; reasons: Reasons; edges: SketchEdgeMap };
const defineMeta = (target: MetaTarget, meta: MetaInfo): void => {
  Object.defineProperties(target, {
    ok: { value: meta.ok, enumerable: false, configurable: true },
    reasons: { value: meta.reasons, enumerable: false, configurable: true },
    edges: { value: meta.edges, enumerable: false, configurable: true },
  });
};

const failure = (reasons: SketchReason[]): SketchMapResult => {
  const result = { reasons: [...reasons] } as SketchMapResult;
  return Object.defineProperties(result, {
    ok: { value: false, enumerable: false },
    edges: { value: {}, enumerable: false },
  });
};

const success = (edges: SketchEdgeMap): SketchMapResult => {
  const result = { ...edges } as SketchMapResult;
  defineMeta(result, { ok: true, reasons: [], edges: { ...edges } });
  return result;
};

const resolvePoint = (question: SketchQuestion, id: string) =>
  question.points.find((point) => point.id === id || point.solidId === id);

const resolveKey = (question: SketchQuestion, edge: SketchEdgeInput) => {
  const parts = normalizeEdgeInput(edge);
  if (!parts) return null;
  const a = resolvePoint(question, parts[0]);
  const b = resolvePoint(question, parts[1]);
  return a && b && a.id !== b.id ? edgeKey(a.id, b.id) : null;
};

type AnswerJob = { map: SketchEdgeMap; values?: StyleMap; reasons: Reasons };
const setAnswers = ({ map, values, reasons }: AnswerJob): void => {
  for (const [rawKey, rawValue] of Object.entries(values ?? {})) {
    const parts = normalizeEdgeInput(rawKey);
    const style = styleOf(rawValue);
    if (!parts || !style) reasons.push("INVALID_LOCKED_EDGES");
    else map[edgeKey(parts[0], parts[1])] = style;
  }
};

export function deriveSketchEdges(question: SketchQuestion): SketchMapResult {
  if (!question || typeof question !== "object")
    return failure(["INVALID_QUESTION"]);
  if (!Array.isArray(question.points) || question.points.length === 0)
    return failure(["INVALID_POINTS"]);
  const seen = new Set<string>();
  for (const point of question.points) {
    if (!point || typeof point.id !== "string" || point.id.length === 0)
      return failure(["INVALID_POINTS"]);
    if (seen.has(point.id)) return failure(["DUPLICATE_POINT"]);
    seen.add(point.id);
  }
  if (!question.target) return failure(["INVALID_TARGET"]);
  const invalidView =
    typeof question.fixedView !== "string" &&
    (typeof question.fixedView !== "object" || question.fixedView === null);
  if (invalidView) return failure(["INVALID_VIEW"]);

  const target =
    typeof question.target === "string"
      ? { id: question.target }
      : question.target;
  const view = typeof question.fixedView === "string" ? {} : question.fixedView;
  const viewKey =
    typeof question.fixedView === "string"
      ? question.fixedView
      : (question.fixedView.id ?? "");
  const viewSpec = target.views?.[viewKey] ?? {};
  const { hiddenEdges: qHidden, visibleEdges: qVisible } = question;
  const hiddenKeys = ids(view.hiddenEdges, viewSpec.hiddenEdges, qHidden);
  const visibleKeys = ids(view.visibleEdges, viewSpec.visibleEdges, qVisible);
  const hiddenPoints = new Set([
    ...asArray(viewSpec.hiddenPoints),
    ...question.points
      .filter((point) => point.hidden === true || point.visible === false)
      .map((point) => point.id),
  ]);

  const answer: SketchEdgeMap = {};
  const reasons: SketchReason[] = [];
  for (const rawEdge of question.edges ?? target.edges ?? []) {
    const key = resolveKey(question, rawEdge);
    if (!key) {
      reasons.push("UNKNOWN_POINT");
      continue;
    }
    const edge = rawEdge as SketchEdge;
    const [a, b] = key.split("|");
    const hiddenByView =
      hiddenKeys.has(key) ||
      asArray(edge.hiddenFrom).includes(viewKey) ||
      edge.hidden === true ||
      edge.visible === false;
    const visibleByView =
      visibleKeys.has(key) ||
      asArray(edge.visibleFrom).includes(viewKey) ||
      edge.visible === true ||
      edge.style === "solid";
    const hiddenByPoint = hiddenPoints.has(a) || hiddenPoints.has(b);
    const dashed =
      hiddenByView ||
      (hiddenByPoint && !visibleByView) ||
      (edge.style === "dashed" && !visibleByView);
    answer[key] = dashed ? "dashed" : "solid";
  }
  setAnswers({ map: answer, values: question.answer, reasons });
  setAnswers({ map: answer, values: question.lockedEdges, reasons });

  const result = success(answer);
  if (reasons.length > 0)
    defineMeta(result, {
      ok: false,
      reasons: uniqueReasons(...reasons),
      edges: { ...answer },
    });
  return result;
}

const toSubmissionMap = (submission: SketchSubmission) => {
  const map: SketchEdgeMap = {};
  let invalid = false;
  const add = (rawKey: unknown, rawValue: unknown): void => {
    const parts = normalizeEdgeInput(rawKey);
    const style = styleOf(rawValue);
    if (!parts || !style) invalid = true;
    else map[edgeKey(parts[0], parts[1])] = style;
  };
  if (
    submission &&
    typeof submission === "object" &&
    !Array.isArray(submission) &&
    !(Symbol.iterator in submission)
  ) {
    for (const [key, value] of Object.entries(submission as SketchEdgeMap))
      add(key, value);
    return { map, invalid };
  }
  for (const item of submission as Iterable<unknown>) {
    if (Array.isArray(item) && item.length === 2 && typeof item[1] !== "object")
      add(item[0], item[1]);
    else {
      const edge = item as SketchEdge & { key?: string };
      add(edge.key ?? edge, edge);
    }
  }
  return { map, invalid };
};

export function gradeSketch(question: SketchQuestion, submission: Submission) {
  const expected = deriveSketchEdges(question);
  const { map, invalid } = toSubmissionMap(submission);
  const reasons = uniqueReasons(
    ...expected.reasons,
    ...(invalid ? ["INVALID_SUBMISSION" as SketchReason] : []),
  );
  const sortedKeys = (source: SketchEdgeMap, keep: (key: string) => boolean) =>
    Object.keys(source).filter(keep).sort();
  const missing = sortedKeys(expected.edges, (key) => !(key in map));
  const extra = sortedKeys(map, (key) => !(key in expected.edges));
  const wrongStyle = sortedKeys(
    map,
    (key) => key in expected.edges && map[key] !== expected.edges[key],
  );
  const grade = { missing, extra, wrongStyle } as SketchGrade;
  const ok =
    reasons.length + missing.length + extra.length + wrongStyle.length === 0;
  defineMeta(grade, { ok, reasons, edges: { ...expected.edges } });
  return grade;
}
