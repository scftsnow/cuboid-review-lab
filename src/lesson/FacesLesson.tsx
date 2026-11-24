import { useMemo, useState } from "react";
import {
  baseFaceRelations,
  type FaceRelationResult,
  type FaceRelations,
  type SolidTopology,
} from "../geometry/faceRelations";
import {
  getSolidTopology,
  type BoxTopology,
  type FaceId as SolidFaceId,
} from "../geometry/solid";
import { buildSolidScene } from "../scene/solidScene";
import { Viewport } from "../scene/Viewport";
import { findTopic } from "./topics";
import type { LessonProps } from "./TopicPlayer";

type BoxKind = "cube" | "cuboid";
type Mode = "base" | "relation";
type FaceCategory = "opposite" | "side" | "parallel" | "perpendicular";
type Selections = Record<FaceCategory, readonly string[]>;

// prettier-ignore
const EMPTY_SELECTIONS: Selections = { opposite: [], side: [], parallel: [], perpendicular: [] };
// prettier-ignore
const FACE_LABELS: Record<SolidFaceId, string> = { fBack: "뒷면", fFront: "앞면", fBottom: "아랫면", fTop: "윗면", fLeft: "왼쪽 면", fRight: "오른쪽 면" };
// prettier-ignore
const CATEGORY_LABELS: Record<FaceCategory, string> = { opposite: "다른 밑면", side: "옆면", parallel: "평행인 면", perpendicular: "수직인 면" };
// prettier-ignore
const CATEGORY_COUNTS: Record<FaceCategory, number> = { opposite: 1, side: 4, parallel: 1, perpendicular: 4 };
// prettier-ignore
const ACTIVE_CATEGORIES: Record<Mode, readonly FaceCategory[]> = { base: ["opposite", "side"], relation: ["parallel", "perpendicular"] };

const FACES_TOPIC = findTopic("FACES");
const FACES_QUIZZES = FACES_TOPIC?.quizzes ?? [];

// prettier-ignore
function resolveQuiz(quizId: string | undefined, stepId: string) {
  return FACES_QUIZZES.find((quiz) => quiz.id === quizId) ?? FACES_QUIZZES.find((quiz) => quiz.stepId === stepId) ?? null;
}

// prettier-ignore
function toRelationTopology(topology: BoxTopology): SolidTopology {
  const faces = topology.faces.map((face) => {
    const others = topology.faces.filter((candidate) => candidate.id !== face.id);
    const opposite = others.find((candidate) => face.vertexIds.every((vertexId) => !candidate.vertexIds.includes(vertexId)));
    const oppositeId = opposite?.id ?? "";
    const sideIds = others.filter((candidate) => candidate.id !== oppositeId).map((candidate) => candidate.id);
    return { id: face.id, oppositeId, sideIds };
  });
  return { faces };
}

// prettier-ignore
function expectedFor(relations: FaceRelations, category: FaceCategory): readonly string[] {
  if (category === "opposite") return [relations.opposite];
  if (category === "side") return [...relations.sides];
  if (category === "parallel") return [...relations.parallel];
  return [...relations.perpendicular];
}

function labelOf(id: string): string {
  return (FACE_LABELS[id as SolidFaceId] ?? id) + "(" + id + ")";
}

// prettier-ignore
function toggleSelection(current: Selections, category: FaceCategory, id: string): Selections {
  const values = current[category];
  if (CATEGORY_COUNTS[category] === 1) return { ...current, [category]: values[0] === id ? [] : [id] };
  return { ...current, [category]: values.includes(id) ? values.filter((faceId) => faceId !== id) : [...values, id] };
}

export default function FacesLesson({ stepId, quizId, onSubmit }: LessonProps) {
  const quiz = resolveQuiz(quizId, stepId);
  const mode: Mode =
    stepId === "faces-relations" || quiz?.kind === "face-relation"
      ? "relation"
      : "base";
  const quizUnavailable = Boolean(quizId && !quiz);
  const [solidKind, setSolidKind] = useState<BoxKind>("cuboid");
  const [baseFaceId, setBaseFaceId] = useState("fFront");
  const [selected, setSelected] = useState<Selections>(EMPTY_SELECTIONS);

  // prettier-ignore
  const topology = useMemo(() => getSolidTopology(solidKind === "cube" ? "solid-cube" : "solid-cuboid"), [solidKind]);
  const faceIds: readonly SolidFaceId[] = topology.ok
    ? topology.value.faces.map((face) => face.id)
    : [];
  // prettier-ignore
  const relation: FaceRelationResult = topology.ok ? baseFaceRelations(toRelationTopology(topology.value), baseFaceId) : { ok: false, code: "INVALID_TOPOLOGY" };
  // prettier-ignore
  const scene = useMemo(() => topology.ok ? buildSolidScene(topology.value, { highlightedIds: [baseFaceId] }) : null, [topology, baseFaceId]);
  const activeCategories = ACTIVE_CATEGORIES[mode];
  // prettier-ignore
  const questionTitle = mode === "base" ? "다른 밑면과 옆면 찾기" : "평행·수직인 면 찾기";

  // prettier-ignore
  function resetSelection() { setSelected(EMPTY_SELECTIONS); }
  // prettier-ignore
  function chooseSolid(kind: BoxKind) { setSolidKind(kind); resetSelection(); }
  // prettier-ignore
  function chooseBase(id: string) { setBaseFaceId(id); resetSelection(); }
  // prettier-ignore
  function handlePick(id: string | null) { if (id && id in FACE_LABELS) chooseBase(id); }

  // prettier-ignore
  function submitSelection(): void {
    if (!relation.ok || !quiz) return;
    const grades = activeCategories.map((category) => {
      const wanted = expectedFor(relation.relations, category);
      const chosen = selected[category];
      return { wanted, missing: wanted.filter((id) => !chosen.includes(id)), extra: chosen.filter((id) => !wanted.includes(id)) };
    });
    const missing = grades.flatMap((grade) => grade.missing);
    const extra = grades.flatMap((grade) => grade.extra);
    const expected = grades.flatMap((grade) => grade.wanted);
    const correct = missing.length === 0 && extra.length === 0;
    const reasonCode = correct ? "CORRECT" : missing.length > 0 && extra.length > 0 ? "MISSING_AND_WRONG_FACES" : missing.length > 0 ? "MISSING_FACES" : "WRONG_FACES";
    const reason = correct ? "기준 면에 맞는 면을 모두 찾았습니다." : "빠진 면 " + missing.length + "개, 잘못 선택한 면 " + extra.length + "개가 있습니다.";
    const hint = correct ? "" : mode === "base" ? "마주 보는 면 하나를 먼저 찾고, 나머지 네 면을 옆면으로 고르세요." : "마주 보는 면은 평행이고, 만나서 직각인 네 면은 수직입니다.";
    onSubmit({ quizId: quiz.id, correct, reason, reasonCode, hint, solidKind, baseFaceId, mode, categories: [...activeCategories], oppositeIds: [...selected.opposite], sideIds: [...selected.side], parallelIds: [...selected.parallel], perpendicularIds: [...selected.perpendicular], expected: [...expected], selected: activeCategories.flatMap((category) => selected[category] ?? []), missing: [...missing], extra: [...extra] });
  }

  // prettier-ignore
  return (
    <section data-testid="faces-lesson" aria-label="면 관계 학습">
      <h3>면의 성질</h3>
      <p>기준 면을 정하고 다른 면을 찾아 보세요. 도형을 돌려도 기준 면은 유지됩니다.</p>
      <div data-testid="faces-viewport">
        <Viewport sceneId={"faces-" + solidKind} scene={scene?.scene ?? null} camera={{ position: [3.5, 2.5, 4.5], target: [0, 0, 0] }} pickables={scene?.pickables} onPick={handlePick} ariaLabelKo="면을 고르고 도형을 돌려 보세요" />
      </div>
      <fieldset data-testid="faces-solid-kind">
        <legend>도형</legend>
        {(["cuboid", "cube"] as const).map((kind) => (
          <button key={kind} type="button" aria-pressed={solidKind === kind} data-testid={"solid-kind-" + kind} onClick={() => chooseSolid(kind)}>{kind === "cube" ? "정육면체" : "직육면체"}</button>
        ))}
      </fieldset>
      <fieldset data-testid="faces-base-face">
        <legend>기준 면</legend>
        {faceIds.map((id) => (
          <button key={id} type="button" aria-pressed={baseFaceId === id} aria-label={"기준 면 " + FACE_LABELS[id]} data-testid={"base-face-" + id} onClick={() => chooseBase(id)}>{FACE_LABELS[id]}</button>
        ))}
      </fieldset>
      {relation.ok ? (
        <p data-testid="faces-question">
          기준 면 {labelOf(baseFaceId)} · {questionTitle}.{" "}
          {mode === "base"
            ? "기준 면과 마주 보는 밑면 1개와 나머지 옆면 4개를 각각 선택하세요."
            : "기준 면과 평행인 면 1개와 수직인 면 4개를 선택하세요."}
        </p>
      ) : (
        <p role="alert" data-testid="faces-relation-error">{relation.code}</p>
      )}
      {!quizId ? (
        <div data-testid="faces-explain">
          <p>{mode === "base"
            ? "맞은편 면 두 개를 밑면이라고 하고, 나머지 네 면을 옆면이라고 합니다."
            : "마주 보는 두 면은 평행하고, 이웃한 면은 만나서 직각이 됩니다."}</p>
          <p>도형을 돌려도 정한 기준 면은 그대로 유지됩니다.</p>
        </div>
      ) : null}
      {quizUnavailable ? (
        <p role="alert" data-testid="faces-quiz-catalog-error">주제 문제 정보를 찾을 수 없습니다.</p>
      ) : null}
      {quiz && relation.ok ? (
        <div data-testid="faces-quiz">
          <h4>{questionTitle}</h4>
          {activeCategories.map((category) => (
            <fieldset key={category} data-testid={"faces-category-" + category} data-face-category={category}>
              <legend>{CATEGORY_LABELS[category]}</legend>
              <p>{CATEGORY_COUNTS[category]}개를 선택하세요. 현재 {selected[category].length}개 선택됨</p>
              {faceIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected[category].includes(id)}
                  aria-label={CATEGORY_LABELS[category] + " " + labelOf(id)}
                  data-testid={category + "-face-option-" + id}
                  data-face-id={id}
                  onClick={() => setSelected((current) => toggleSelection(current, category, id))}
                >
                  {FACE_LABELS[id]}
                </button>
              ))}
            </fieldset>
          ))}
          <button type="button" data-testid="faces-submit" onClick={submitSelection}>제출하기</button>
        </div>
      ) : null}
    </section>
  );
}
