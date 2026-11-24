import { useMemo, useState, type ReactElement } from "react";
import * as THREE from "three";
import { getSolidTopology, listSolidExamples, type SolidExample } from "../geometry/solid";
import { Viewport } from "../scene/Viewport";
import { TOPICS } from "./topics";
export type { SolidExample };

type Reason = "SOLID_MODEL_MISSING" | "INVALID_SELECTION" | "DUPLICATE_SELECTION_IGNORED" | "QUIZ_ID_MISMATCH" | "CALLBACK_MISSING";
type Counts = { faces?: number; edges?: number; vertices?: number };
type Result = { quizId: string; correct: boolean; expected: string; selectedIds: readonly string[]; counts?: Counts; deduplicatedIds?: number; reasonCode: Reason | null; contractQuizId?: string; reason?: string; hint?: string };
type Submission = Omit<Result, "quizId" | "contractQuizId">;
type TopicSpec = { id?: string; topicId?: string; stepIds?: readonly string[]; steps?: readonly string[]; requiredQuizIds?: readonly string[]; quizzes?: readonly { id?: string; stepId?: string }[] };
type Callbacks = { onStepChange?: (id: string) => void; onSubmit?: (result: Result) => void; onAcknowledge?: (id: string) => void; onReturnToMap?: () => void };
type Props = { topicId?: string; stepId?: string; quizId?: string; examples?: readonly SolidExample[]; topics?: TopicSpec; callbacks?: Callbacks; onStepChange?: (id: string) => void; onSubmit?: (result: Result) => void; onAcknowledge?: (id: string) => void; onReturnToMap?: () => void };
export type SolidLessonResult = Result;
export type SolidLessonCallbacks = Callbacks;
export type SolidLessonProps = Props;

const STEPS = ["definition", "classify", "parts", "count", "result"] as const;
const QUIZ = ["solid-classify", "solid-parts", "solid-count"] as const;
const KINDS = ["face", "edge", "vertex"] as const;
const LABEL: Record<string, string> = { definition: "정의와 관찰", classify: "새 도형 분류", parts: "구성 요소 찾기", count: "직접 세기", result: "결과 확인" };

function stepOf(id?: string): string {
  if (!id) return "";
  const value = id.toLowerCase();
  if (value.includes("intro") || value.includes("definition")) return "definition";
  if (value.includes("classify")) return "classify";
  if (value.includes("parts")) return "parts";
  if (value.includes("count")) return "count";
  return value.includes("result") ? "result" : "";
}

function checkTopic(spec?: TopicSpec): boolean {
  const topic = spec ?? (TOPICS.SOLID as TopicSpec);
  const id = topic.topicId ?? topic.id ?? "";
  const steps = topic.stepIds ?? topic.steps ?? STEPS;
  const quizzes = [...(topic.quizzes ?? []).map((quiz) => quiz.id ?? quiz.stepId ?? ""), ...(topic.requiredQuizIds ?? [])];
  const canonical = QUIZ.every((quizId) => quizzes.includes(quizId));
  const shared = ["classify", "parts", "count"].every((name) => steps.some((stepId) => stepId.includes("solid-" + name))) && ["classify", "count"].every((name) => quizzes.some((quizId) => quizId.includes("solid-" + name)));
  return (id === "solid" || id === "SOLID") && (canonical || shared);
}

function topologyParts(example: SolidExample | null) {
  const empty = { face: [] as string[], edge: [] as string[], vertex: [] as string[] };
  if (!example) return empty;
  const topology = getSolidTopology(example.id);
  if (!topology.ok) return empty;
  return { face: topology.value.faces.map((part) => part.id), edge: topology.value.edges.map((part) => part.id), vertex: topology.value.vertices.map((part) => part.id) };
}

function compact(counts: { faces: number; edges: number; vertices: number }) {
  const result: Counts = {};
  if (counts.faces > 0) result.faces = counts.faces;
  if (counts.edges > 0) result.edges = counts.edges;
  if (counts.vertices > 0) result.vertices = counts.vertices;
  return result;
}

function gradeSelection(example: SolidExample | null, selected: readonly string[]): Submission {
  const expected = "면 6개, 모서리 12개, 꼭짓점 8개";
  if (!example || selected.length === 0) return { correct: false, expected, selectedIds: [], reasonCode: "SOLID_MODEL_MISSING" };
  const parts = topologyParts(example);
  const known = new Map<string, string>();
  for (const kind of KINDS) for (const id of parts[kind]) known.set(id, kind);
  const unique = new Set<string>();
  let duplicates = 0;
  let invalid = 0;
  const counts = { faces: 0, edges: 0, vertices: 0 };
  for (const id of selected) {
    if (!known.has(id)) invalid += 1;
    else if (unique.has(id)) duplicates += 1;
    else {
      unique.add(id);
      if (known.get(id) === "face") counts.faces += 1;
      if (known.get(id) === "edge") counts.edges += 1;
      if (known.get(id) === "vertex") counts.vertices += 1;
    }
  }
  const reasonCode = duplicates > 0 ? "DUPLICATE_SELECTION_IGNORED" : invalid > 0 || unique.size !== selected.length ? "INVALID_SELECTION" : null;
  const full = { faces: parts.face.length, edges: parts.edge.length, vertices: parts.vertex.length };
  return { correct: reasonCode === null && counts.faces === 6 && counts.edges === 12 && counts.vertices === 8, expected, selectedIds: [...unique], counts: compact(duplicates > 0 ? counts : full), deduplicatedIds: duplicates > 0 ? unique.size : undefined, reasonCode };
}

function pickable(id: string, geometry: THREE.BufferGeometry, color: number, opacity = 1) {
  const object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide }));
  object.userData.pickId = id;
  return object;
}

function buildSolidScene(example: SolidExample | null) {
  const scene = new THREE.Scene();
  const pickables: THREE.Object3D[] = [];
  const result = example ? getSolidTopology(example.id) : null;
  const topology = result?.ok ? result.value : null;
  if (!topology) {
    const geometry = example?.kind === "cone" ? new THREE.ConeGeometry(0.85, 1.7, 24) : new THREE.CylinderGeometry(0.8, 0.8, 1.7, 3);
    scene.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x9cc6ff, wireframe: true })));
    return { scene, pickables };
  }
  const positions = new Map(topology.vertices.map((vertex) => [vertex.id, vertex.position]));
  const point = (id: string) => {
    const [x, y, z] = positions.get(id) ?? [0, 0, 0];
    return new THREE.Vector3((x - 0.5) * 1.5, (y - 0.5) * 1.5, (z - 0.5) * 1.5);
  };
  for (const face of topology.faces) {
    const values = face.vertexIds.flatMap((id) => { const p = point(id); return [p.x, p.y, p.z]; });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(values, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    const part = pickable(face.id, geometry, 0x74c7ff, 0.28); scene.add(part); pickables.push(part);
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (const edge of topology.edges) {
    const a = point(edge.endpoints[0]);
    const b = point(edge.endpoints[1]);
    const direction = b.clone().sub(a);
    const part = pickable(edge.id, new THREE.CylinderGeometry(0.04, 0.04, direction.length(), 8), 0x163b57);
    part.position.copy(a).add(b).multiplyScalar(0.5); part.quaternion.setFromUnitVectors(up, direction.normalize());
    scene.add(part); pickables.push(part);
  }
  for (const vertex of topology.vertices) {
    const part = pickable(vertex.id, new THREE.SphereGeometry(0.09, 12, 12), 0xffc857);
    part.position.copy(point(vertex.id)); scene.add(part); pickables.push(part);
  }
  return { scene, pickables };
}

export function SolidLesson(props: Props): ReactElement {
  const [exampleId, setExampleId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Result | null>(null);
  const [internalStep, setInternalStep] = useState("definition");
  const callbacks: Callbacks = props.callbacks ?? {};
  const submit = callbacks.onSubmit ?? props.onSubmit;
  const returnToMap = callbacks.onReturnToMap ?? props.onReturnToMap;
  const examples = props.examples ?? listSolidExamples();
  const step = stepOf(props.stepId) || internalStep;
  const example = examples.find((item) => item.id === exampleId) ?? null;
  const parts = topologyParts(example);
  const { scene, pickables } = useMemo(() => buildSolidScene(example), [example]);
  const interactiveIds = new Set([...parts.face, ...parts.edge, ...parts.vertex]);
  const expected = example?.label ?? example?.nameKo ?? "";
  const invalidTopic = !checkTopic(props.topics);

  function emit(quiz: string, value: Submission) {
    const result: Result = { ...value, quizId: props.quizId ?? quiz, contractQuizId: quiz, reason: value.reasonCode ?? undefined, hint: value.correct ? undefined : "예제 이름과 구성 요소 수를 다시 확인해 보세요." };
    setFeedback(result);
    submit?.(result);
    callbacks.onStepChange?.(props.stepId ?? quiz);
  }

  function classify() {
    if (!example || answer.trim() === "") {
      emit(QUIZ[0], { correct: false, expected, selectedIds: [], reasonCode: "SOLID_MODEL_MISSING" });
      return;
    }
    const correct = answer.trim() === expected;
    emit(QUIZ[0], { correct, expected, selectedIds: [], reasonCode: correct ? null : "INVALID_SELECTION" });
  }

  function togglePart(id: string) {
    if (selectedIds.includes(id)) emit(props.quizId ?? QUIZ[2], gradeSelection(example, selectedIds));
    else setSelectedIds([...selectedIds, id]);
  }

  function handlePick(id: string | null) {
    if (id && interactiveIds.has(id) && (step === "parts" || step === "count")) togglePart(id);
  }

  if (invalidTopic || typeof submit !== "function") {
    return (
      <section data-testid="solid-lesson" role="alert">
        <h2>직육면체와 정육면체</h2>
        <p>{invalidTopic ? "QUIZ_ID_MISMATCH" : "CALLBACK_MISSING"}: 활동 연결을 확인해 주세요.</p>
      </section>
    );
  }

  return (
    <section data-testid="solid-lesson" aria-label="직육면체 복습">
      <h2>직육면체와 정육면체</h2>
      {!props.stepId && <nav aria-label="학습 단계">{STEPS.map((id) => <button key={id} type="button" data-testid={"solid-step-" + id} aria-current={step === id ? "step" : undefined} onClick={() => { setInternalStep(id); setFeedback(null); callbacks.onStepChange?.(id); }}>{LABEL[id]}</button>)}</nav>}
      {step === "definition" ? (
        <div data-testid="solid-step-content">
          <p>직육면체는 여섯 개의 직사각형 면으로, 정육면체는 같은 크기의 정사각형 여섯 개로 둘러싸인 입체입니다. 돌려 보아도 면 6개, 모서리 12개, 꼭짓점 8개는 같습니다.</p>
          {!props.stepId && <button type="button" onClick={() => { setInternalStep("classify"); callbacks.onStepChange?.("classify"); }}>분류 활동으로 이동</button>}
        </div>
      ) : (
        <div data-testid="solid-step-content">
          <div role="group" aria-label="예제 도형">
            {examples.map((item) => (
              <button key={item.id} type="button" data-testid={"solid-example-" + item.id} aria-pressed={item.id === exampleId} onClick={() => { setExampleId(item.id); setSelectedIds([]); setFeedback(null); }}>
                {item.nameKo ?? item.label ?? item.id}
              </button>
            ))}
          </div>
          <div data-testid="solid-viewport" style={{ height: 240 }}>
            <Viewport sceneId={"solid-" + (example?.id ?? "none")} scene={scene} camera={{ position: [3, 2.4, 3], target: [0, 0, 0], fov: 45 }} pickables={step === "parts" || step === "count" ? pickables : []} onPick={handlePick} ariaLabelKo="도형을 돌려 보고 면, 모서리, 꼭짓점을 누를 수 있습니다" />
          </div>
          {step === "classify" ? (
            <div>
              <label htmlFor="solid-answer">새 도형의 이름</label>
              <input id="solid-answer" data-testid="solid-answer-input" value={answer} onChange={(event) => setAnswer(event.target.value)} />
              <div role="group" aria-label="도형 이름 선택">
                {[...new Set(examples.map((item) => item.label))].map((label) => (
                  <button key={label} type="button" data-testid={"solid-answer-" + label} onClick={() => setAnswer(label)}>{label}</button>
                ))}
              </div>
              <button type="button" data-testid="solid-submit" onClick={classify}>분류 제출</button>
            </div>
          ) : (
            <div>
              {KINDS.map((kind) => (
                <div key={kind}>
                  <h3>{kind === "face" ? "면" : kind === "edge" ? "모서리" : "꼭짓점"}</h3>
                  {parts[kind].map((id) => (
                    <button key={id} type="button" data-testid={"solid-part-" + id} aria-pressed={selectedIds.includes(id)} onClick={() => togglePart(id)}>{id}</button>
                  ))}
                </div>
              ))}
              <p data-testid="solid-selected-count">선택 {selectedIds.length}개</p>
              <button type="button" data-testid="solid-submit" onClick={() => emit(props.quizId ?? (step === "parts" ? QUIZ[1] : QUIZ[2]), gradeSelection(example, selectedIds))}>
                {step === "parts" ? "구성 요소 제출" : "세기 제출"}
              </button>
            </div>
          )}
        </div>
      )}
      {feedback && (
        <div data-testid="solid-feedback" role="status">
          <p>{feedback.correct ? "정답입니다." : "오답입니다. 정답은 " + feedback.expected + "입니다."}</p>
          {feedback.reasonCode && <p>{feedback.reasonCode}</p>}
          {!feedback.correct && <button type="button" data-testid="solid-retry" onClick={() => { setAnswer(""); setSelectedIds([]); setFeedback(null); }}>다시 하기</button>}
          {feedback.correct && callbacks.onAcknowledge && <button type="button" data-testid="solid-ack" onClick={() => callbacks.onAcknowledge?.(feedback.quizId)}>결과 확인</button>}
        </div>
      )}
      {returnToMap && <button type="button" data-testid="solid-return-map" onClick={returnToMap}>지도로 돌아가기</button>}
    </section>
  );
}

export function createSolidLessonView(props: Props): ReactElement {
  return <SolidLesson {...props} />;
}
export default SolidLesson;
