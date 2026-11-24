import { useEffect, useMemo, useState } from "react";
import {
  gradeSketch,
  type SketchEdgeMap,
  type SketchGrade,
} from "../geometry/sketch";
import { getSolidTopology } from "../geometry/solid";
import { buildSolidScene } from "../scene/solidScene";
import { Viewport } from "../scene/Viewport";
import { SketchBoard } from "./SketchBoard";
import {
  POINTS,
  QUESTIONS,
  TARGET,
  VIEW,
  type BoardStep,
} from "./sketchExercises";
import { TOPICS } from "./topics";
import type { LessonProps, LessonSubmission } from "./TopicPlayer";

const SKETCH = TOPICS.SKETCH;
const STEPS = SKETCH.stepIds;
const VIEW_STEP = STEPS[0];
const PREDICT_STEP = STEPS[1];
const FIX_STEP = STEPS[2];
const PARTIAL_STEP = STEPS[3];
const FULL_STEP = STEPS[4];
const FIXED_EDGES: SketchEdgeMap = QUESTIONS.full.question.answer ?? {};
const PARTIAL_QUIZ_ID = SKETCH.quizzes.find(
  (quiz) => quiz.kind === "sketch-partial",
)?.id;
const FULL_QUIZ_ID = SKETCH.quizzes.find(
  (quiz) => quiz.kind === "sketch-full",
)?.id;

function boardStepFor(stepId: string): BoardStep | null {
  if (stepId === FIX_STEP) return "repair";
  if (stepId === PARTIAL_STEP) return "partial";
  if (stepId === FULL_STEP) return "full";
  return null;
}

function reasonFor(grade: SketchGrade, edges: SketchEdgeMap): string {
  if (grade.reasons.length > 0) return grade.reasons[0];
  if (Object.keys(edges).length === 0) return "SKETCH_EMPTY_ANSWER";
  if (grade.missing.length > 0) return "SKETCH_MISSING_EDGE";
  if (grade.extra.length > 0) return "SKETCH_EXTRA_EDGE";
  if (grade.wrongStyle.length > 0) return "WRONG_EDGE_STYLE";
  return "SKETCH_OK";
}

function hintFor(reason: string, grade: SketchGrade): string {
  if (reason === "SKETCH_EMPTY_ANSWER")
    return "두 점을 눌러 선을 하나 이상 그어 주세요.";
  if (reason === "SKETCH_MISSING_EDGE")
    return "빠진 선을 이어 주세요: " + grade.missing.join(", ");
  if (reason === "SKETCH_EXTRA_EDGE")
    return "문제에 없는 선을 지워 주세요: " + grade.extra.join(", ");
  if (reason === "WRONG_EDGE_STYLE")
    return "실선과 점선을 다시 확인하세요: " + grade.wrongStyle.join(", ");
  if (reason === "SKETCH_OK")
    return "가시 모서리는 실선, 가려진 모서리는 점선입니다.";
  return "입력을 확인해 주세요: " + reason;
}

export function SketchLesson({
  topicId,
  stepId,
  quizId,
  onSubmit,
}: LessonProps) {
  const boardStep = boardStepFor(stepId);
  const config = boardStep === null ? null : QUESTIONS[boardStep];
  const [edges, setEdges] = useState<SketchEdgeMap>(
    () => config?.initial ?? {},
  );
  const [revealed, setRevealed] = useState(false);
  const solidScene = useMemo(() => {
    const topology = getSolidTopology("solid-cuboid");
    return topology.ok ? buildSolidScene(topology.value) : null;
  }, []);

  useEffect(() => {
    setEdges(config?.initial ?? {});
    setRevealed(false);
  }, [config]);

  const expectedQuizId =
    boardStep === "partial"
      ? PARTIAL_QUIZ_ID
      : boardStep === "full"
        ? FULL_QUIZ_ID
        : undefined;
  const isQuizBoard = boardStep === "partial" || boardStep === "full";
  const wiringError =
    topicId !== SKETCH.id ||
    STEPS.length !== 5 ||
    !STEPS.includes(stepId) ||
    (isQuizBoard &&
      (expectedQuizId === undefined ||
        quizId !== expectedQuizId ||
        typeof onSubmit !== "function"));

  if (wiringError) {
    return (
      <section
        data-testid="sketch-lesson"
        data-topic="SKETCH"
        data-step={stepId}
        data-code="SKETCH_WIRING_ERROR"
        role="alert"
      >
        <h2>겨냥도 연결을 찾을 수 없습니다</h2>
        <p>주제, 단계와 문제 ID를 확인한 뒤 다시 열어 주세요.</p>
      </section>
    );
  }

  function submitAnswer(): void {
    if (config === null || boardStep === null || !isQuizBoard) return;
    if (!quizId || typeof onSubmit !== "function") return;
    const grade = gradeSketch(config.question, edges);
    const reason = reasonFor(grade, edges);
    const result: LessonSubmission = {
      quizId,
      correct: grade.ok,
      reason,
      hint: hintFor(reason, grade),
    };
    onSubmit(result);
  }

  const showModel = stepId === VIEW_STEP || stepId === PREDICT_STEP;
  const repairGrade =
    boardStep === "repair" && config !== null
      ? gradeSketch(config.question, edges)
      : null;
  const repairReason =
    repairGrade === null ? null : reasonFor(repairGrade, edges);

  return (
    <section
      data-testid="sketch-lesson"
      data-topic="SKETCH"
      data-step={stepId}
      aria-label="겨냥도 학습"
    >
      <header>
        <h2>겨냥도 · {SKETCH.titleKo}</h2>
        <p>
          기준 시점 {VIEW.id}에서 보이는 모서리는 실선, 가려진 모서리는
          점선입니다.
        </p>
      </header>

      {showModel ? (
        <section data-testid="sketch-model" aria-label="회전 가능한 직육면체">
          <Viewport
            sceneId="sketch-cuboid"
            scene={solidScene?.scene ?? null}
            pickables={solidScene?.pickables}
            camera={{ position: [2.6, 2.1, 2.8], target: [0, 0, 0] }}
            ariaLabelKo="겨냥도를 위한 직육면체. 끌어서 돌려 보세요."
          />
          <p>모형을 끌어 돌려 기준 시점과 모양을 비교해 보세요.</p>
        </section>
      ) : null}

      {stepId === VIEW_STEP ? (
        <section data-testid="sketch-view" aria-label="기준 시점 관찰">
          <SketchBoard
            points={POINTS}
            lockedEdges={FIXED_EDGES}
            edges={FIXED_EDGES}
            disabled
            target={TARGET}
            fixedView={VIEW}
          />
        </section>
      ) : null}

      {stepId === PREDICT_STEP ? (
        <section data-testid="sketch-predict" aria-label="가림 예상">
          <p>가려질 모서리를 예상한 뒤 아래 버튼으로 확인해 보세요.</p>
          <button
            type="button"
            data-testid="sketch-reveal"
            aria-pressed={revealed}
            onClick={() => setRevealed((value) => !value)}
          >
            {revealed ? "기준 겨냥도 숨기기" : "기준 겨냥도 보기"}
          </button>
          {revealed ? (
            <SketchBoard
              points={POINTS}
              lockedEdges={FIXED_EDGES}
              edges={FIXED_EDGES}
              disabled
              target={TARGET}
              fixedView={VIEW}
            />
          ) : null}
        </section>
      ) : null}

      {config !== null && boardStep !== null ? (
        <section
          data-testid={"sketch-" + boardStep}
          data-problem={boardStep}
          aria-label="점판 활동"
        >
          <SketchBoard
            points={POINTS}
            lockedEdges={config.locked}
            edges={edges}
            onEdgesChange={setEdges}
            target={TARGET}
            fixedView={VIEW}
          />
        </section>
      ) : null}

      {repairGrade !== null && repairReason !== null ? (
        <p data-testid="sketch-repair-guidance" role="status">
          {hintFor(repairReason, repairGrade)}
        </p>
      ) : null}

      {isQuizBoard ? (
        <button
          type="button"
          data-testid="sketch-submit"
          onClick={submitAnswer}
        >
          제출하기
        </button>
      ) : null}
    </section>
  );
}

export default SketchLesson;
