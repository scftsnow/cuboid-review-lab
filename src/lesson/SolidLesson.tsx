import { useMemo, useState, type ReactElement } from "react";
import * as THREE from "three";
// prettier-ignore
import { getSolidTopology, listSolidExamples, type SolidExample } from "../geometry/solid";
import { buildSolidScene } from "../scene/solidScene";
// prettier-ignore
import { SolidLessonView, type SolidLessonParts, type SolidLessonStep } from "./SolidLessonView";
import { TOPICS } from "./topics";

export type { SolidExample };

// prettier-ignore
type Reason = "SOLID_MODEL_MISSING" | "INVALID_SELECTION" | "DUPLICATE_SELECTION_IGNORED" | "QUIZ_ID_MISMATCH" | "CALLBACK_MISSING";

type Counts = { faces?: number; edges?: number; vertices?: number };

// prettier-ignore
type Result = { quizId: string; correct: boolean; expected: string; selectedIds: readonly string[]; counts?: Counts; deduplicatedIds?: number; reasonCode: Reason | null; contractQuizId?: string; reason?: string; hint?: string };

type Submission = Omit<Result, "quizId" | "contractQuizId">;

// prettier-ignore
type TopicSpec = { id?: string; topicId?: string; stepIds?: readonly string[]; steps?: readonly string[]; requiredQuizIds?: readonly string[]; quizzes?: readonly { id?: string; stepId?: string }[] };

// prettier-ignore
type Callbacks = { onStepChange?: (id: string) => void; onSubmit?: (result: Result) => void; onAcknowledge?: (id: string) => void; onReturnToMap?: () => void };

// prettier-ignore
type Props = { topicId?: string; stepId?: string; quizId?: string; examples?: readonly SolidExample[]; topics?: TopicSpec; callbacks?: Callbacks; onStepChange?: (id: string) => void; onSubmit?: (result: Result) => void; onAcknowledge?: (id: string) => void; onReturnToMap?: () => void };

export type SolidLessonResult = Result;
export type SolidLessonCallbacks = Callbacks;
export type SolidLessonProps = Props;

const CLASSIFY_QUIZ = "solid-classify-check";
const COUNT_QUIZ = "solid-count-check";
const QUIZ = [CLASSIFY_QUIZ, COUNT_QUIZ] as const;
const KINDS = ["face", "edge", "vertex"] as const;

function lessonStep(id?: string): SolidLessonStep {
  const value = (id ?? "").toLowerCase();
  if (value.includes("classify")) return "classify";
  if (value.includes("parts")) return "parts";
  if (value.includes("count") || value.includes("result")) return "count";
  return "definition";
}

function checkTopic(spec?: TopicSpec): boolean {
  const topic = spec ?? (TOPICS.SOLID as TopicSpec);
  const id = topic.topicId ?? topic.id ?? "";
  const quizzes = [
    ...(topic.quizzes ?? []).map((quiz) => quiz.id ?? quiz.stepId ?? ""),
    ...(topic.requiredQuizIds ?? []),
  ];
  return (
    (id === "solid" || id === "SOLID") &&
    QUIZ.every((quizId) => quizzes.includes(quizId))
  );
}

function topologyParts(example: SolidExample | null): SolidLessonParts {
  const empty: SolidLessonParts = { face: [], edge: [], vertex: [] };
  if (!example) return empty;
  const topology = getSolidTopology(example.id);
  if (!topology.ok) return empty;
  // prettier-ignore
  return { face: topology.value.faces.map((part) => part.id), edge: topology.value.edges.map((part) => part.id), vertex: topology.value.vertices.map((part) => part.id) };
}

function compact(counts: { faces: number; edges: number; vertices: number }) {
  const result: Counts = {};
  if (counts.faces > 0) result.faces = counts.faces;
  if (counts.edges > 0) result.edges = counts.edges;
  if (counts.vertices > 0) result.vertices = counts.vertices;
  return result;
}

function gradeSelection(
  example: SolidExample | null,
  selected: readonly string[],
): Submission {
  const expected = "면 6개, 모서리 12개, 꼭짓점 8개";
  if (!example || selected.length === 0) {
    return {
      correct: false,
      expected,
      selectedIds: [],
      reasonCode: "SOLID_MODEL_MISSING",
    };
  }
  const parts = topologyParts(example);
  const known = new Map<string, string>();
  for (const kind of KINDS) {
    for (const id of parts[kind]) known.set(id, kind);
  }
  const unique = new Set<string>();
  let duplicates = 0;
  let invalid = 0;
  const counts = { faces: 0, edges: 0, vertices: 0 };
  for (const id of selected) {
    if (!known.has(id)) {
      invalid += 1;
    } else if (unique.has(id)) {
      duplicates += 1;
    } else {
      unique.add(id);
      if (known.get(id) === "face") counts.faces += 1;
      if (known.get(id) === "edge") counts.edges += 1;
      if (known.get(id) === "vertex") counts.vertices += 1;
    }
  }
  // prettier-ignore
  const reasonCode = duplicates > 0 ? "DUPLICATE_SELECTION_IGNORED" : invalid > 0 || unique.size !== selected.length ? "INVALID_SELECTION" : null;
  const full = {
    faces: parts.face.length,
    edges: parts.edge.length,
    vertices: parts.vertex.length,
  };
  // prettier-ignore
  return { correct: reasonCode === null && counts.faces === 6 && counts.edges === 12 && counts.vertices === 8, expected, selectedIds: [...unique], counts: compact(duplicates > 0 ? counts : full), deduplicatedIds: duplicates > 0 ? unique.size : undefined, reasonCode };
}

function createLessonScene(example: SolidExample | null) {
  const topology = example ? getSolidTopology(example.id) : null;
  if (topology?.ok) return buildSolidScene(topology.value);
  const scene = new THREE.Scene();
  const geometry =
    example?.kind === "cone"
      ? new THREE.ConeGeometry(0.85, 1.7, 24)
      : new THREE.CylinderGeometry(0.8, 0.8, 1.7, 3);
  if (example) {
    // prettier-ignore
    scene.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x9cc6ff, wireframe: true })));
  }
  return { scene, pickables: [] as THREE.Object3D[] };
}

export function SolidLesson(props: Props): ReactElement {
  const examples = props.examples ?? listSolidExamples();
  const [exampleId, setExampleId] = useState<string | null>(
    () =>
      props.examples?.find((item) => item.kind === "cuboid")?.id ??
      "solid-cuboid",
  );
  const [answer, setAnswer] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [guidance, setGuidance] = useState("");
  const callbacks = props.callbacks ?? {};
  const submit = callbacks.onSubmit ?? props.onSubmit;
  const step = lessonStep(props.stepId);
  const example = examples.find((item) => item.id === exampleId) ?? null;
  const parts = topologyParts(example);
  const lessonScene = useMemo(() => createLessonScene(example), [example]);
  const interactiveIds = new Set([
    ...parts.face,
    ...parts.edge,
    ...parts.vertex,
  ]);
  const expected = example?.nameKo ?? example?.label ?? "";
  const invalidTopic = !checkTopic(props.topics);

  function emit(quizId: string, value: Submission) {
    const result: Result = {
      ...value,
      quizId,
      contractQuizId: quizId,
      reason: value.reasonCode ?? undefined,
      hint: value.correct
        ? undefined
        : "예제 이름과 구성 요소 수를 다시 확인해 보세요.",
    };
    submit?.(result);
  }

  function classify() {
    if (!example || answer.trim() === "") {
      setGuidance("분류할 도형의 이름을 먼저 선택해 주세요.");
      return;
    }
    setGuidance("");
    const correct = answer.trim() === expected;
    emit(props.quizId ?? CLASSIFY_QUIZ, {
      correct,
      expected,
      selectedIds: [],
      reasonCode: correct ? null : "INVALID_SELECTION",
    });
  }

  function countParts() {
    if (step !== "count") {
      setGuidance("구성 요소를 찾아 보세요. 세기 단계에서 제출합니다.");
      return;
    }
    setGuidance("");
    emit(props.quizId ?? COUNT_QUIZ, gradeSelection(example, selectedIds));
  }

  function selectPart(id: string | null) {
    if (!id || !interactiveIds.has(id) || selectedIds.includes(id)) return;
    setSelectedIds([...selectedIds, id]);
  }

  function selectExample(id: string) {
    setExampleId(id);
    setSelectedIds([]);
    setAnswer("");
    setGuidance("");
  }

  if (invalidTopic || typeof submit !== "function") {
    return (
      <section data-testid="solid-lesson" role="alert">
        <h2>직육면체와 정육면체</h2>
        <p>
          {invalidTopic ? "QUIZ_ID_MISMATCH" : "CALLBACK_MISSING"}: 활동 연결을
          확인해 주세요.
        </p>
      </section>
    );
  }

  // SolidLessonView가 Viewport에 장면과 안정적인 picking ID를 전달한다.
  return (
    <>
      {/* prettier-ignore */}
      <SolidLessonView step={step} examples={examples} exampleId={exampleId} scene={lessonScene.scene} pickables={lessonScene.pickables} parts={parts} answer={answer} selectedIds={selectedIds} onExample={selectExample} onAnswer={setAnswer} onPick={selectPart} onClassify={classify} onCount={countParts} />
      {guidance ? (
        <p data-testid="solid-selection-guidance" role="status">
          {guidance}
        </p>
      ) : null}
    </>
  );
}

export function createSolidLessonView(props: Props): ReactElement {
  return <SolidLesson {...props} />;
}

export default SolidLesson;
