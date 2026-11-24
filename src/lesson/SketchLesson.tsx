import { useEffect, useState } from 'react';
import { edgeKey, gradeSketch, type EdgeStyle, type SketchQuestion } from '../geometry/sketch';
import { acknowledgeFeedback, setStep, submit } from '../progress/store';
import { Feedback } from './Feedback';
import { SketchBoard } from './SketchBoard';
import { TOPICS } from './topics';

type ActivityStep = 'predict' | 'repair' | 'partial' | 'full' | 'result';
type BoardStep = Exclude<ActivityStep, 'predict' | 'result'>;
type BoardPoint = { pointId: string; vertexId: string; x: number; y: number };
type EdgeMap = Record<string, EdgeStyle>;
type QuestionConfig = { question: SketchQuestion; locked: EdgeMap; initial: EdgeMap };
type PendingFeedback = { quizId: string; origin: BoardStep; correct: boolean; hints: string[]; reason: string };

const TOPIC = TOPICS.SKETCH;
const STEPS = TOPIC.stepIds;
const PARTIAL_QUIZ = TOPIC.quizzes.find((quiz) => quiz.kind === 'sketch-partial');
const FULL_QUIZ = TOPIC.quizzes.find((quiz) => quiz.kind === 'sketch-full');
const FIXED_VIEW = 'front';
const TARGET = { solidId: 'cuboid-sketch-1', kind: 'cuboid' as const };
const VIEW = { id: FIXED_VIEW, direction: [0, 0, 1] as const };

const POINT_DATA: ReadonlyArray<readonly [string, string, number, number]> = [
  ['p1', 'v1', 70, 80], ['p2', 'v2', 230, 80], ['p3', 'v3', 230, 210], ['p4', 'v4', 70, 210],
  ['p5', 'v5', 120, 40], ['p6', 'v6', 280, 40], ['p7', 'v7', 280, 170], ['p8', 'v8', 120, 170],
];
const POINTS: BoardPoint[] = POINT_DATA.map(([pointId, vertexId, x, y]) => ({ pointId, vertexId, x, y }));

const ALL_EDGES: ReadonlyArray<readonly [string, string, EdgeStyle]> = [
  ['p1', 'p2', 'solid'], ['p2', 'p3', 'solid'], ['p3', 'p4', 'solid'], ['p4', 'p1', 'solid'],
  ['p5', 'p6', 'dashed'], ['p6', 'p7', 'dashed'], ['p7', 'p8', 'dashed'], ['p8', 'p5', 'dashed'],
  ['p1', 'p5', 'solid'], ['p2', 'p6', 'solid'], ['p3', 'p7', 'solid'], ['p4', 'p8', 'dashed'],
];
const PARTIAL_EDGES = ALL_EDGES.slice(0, 4);
const REPAIR_EDGES = ALL_EDGES.slice(0, 2);

function answerMap(edges: ReadonlyArray<readonly [string, string, EdgeStyle]>): EdgeMap {
  return Object.fromEntries(edges.map(([a, b, style]) => [edgeKey(a, b), style]));
}

function questionFor(edges: ReadonlyArray<readonly [string, string, EdgeStyle]>, locked: EdgeMap): SketchQuestion {
  return {
    target: { id: TARGET.solidId, edges: edges.map(([a, b, style]) => ({ a, b, style })) },
    fixedView: FIXED_VIEW,
    points: POINTS.map(({ pointId, x, y }) => ({ id: pointId, x, y })),
    lockedEdges: locked,
    answer: answerMap(edges),
  };
}

function configFor(edges: ReadonlyArray<readonly [string, string, EdgeStyle]>, locked: EdgeMap, initial: EdgeMap = locked): QuestionConfig {
  return { locked, initial, question: questionFor(edges, locked) };
}

const PARTIAL_LOCKED = answerMap(PARTIAL_EDGES.slice(0, 3));
const REPAIR_LOCKED = answerMap(REPAIR_EDGES.slice(0, 1));
const REPAIR_INITIAL: EdgeMap = { ...answerMap(REPAIR_EDGES), [edgeKey('p2', 'p3')]: 'dashed' };

const QUESTIONS: Record<BoardStep, QuestionConfig> = {
  repair: configFor(REPAIR_EDGES, REPAIR_LOCKED, REPAIR_INITIAL),
  partial: configFor(PARTIAL_EDGES, PARTIAL_LOCKED),
  full: configFor(ALL_EDGES, {}),
};

function reasonFrom(grade: ReturnType<typeof gradeSketch>, edges: EdgeMap): string {
  if (grade.reasons.length > 0) return grade.reasons[0];
  if (Object.keys(edges).length === 0) return 'SKETCH_EMPTY_ANSWER';
  if (grade.missing.length > 0) return 'SKETCH_MISSING_EDGE';
  if (grade.extra.length > 0) return 'SKETCH_EXTRA_EDGE';
  if (grade.wrongStyle.length > 0) return 'SKETCH_WRONG_LINE_STYLE';
  return 'SKETCH_OK';
}

function hintFor(reason: string, grade: ReturnType<typeof gradeSketch>): string {
  if (reason === 'SKETCH_EMPTY_ANSWER') return '두 점을 눌러 선을 하나 이상 그어 주세요.';
  if (reason === 'SKETCH_MISSING_EDGE') return '빠진 선을 이어 주세요: ' + grade.missing.join(', ');
  if (reason === 'SKETCH_EXTRA_EDGE') return '문제에 없는 선을 지워 주세요: ' + grade.extra.join(', ');
  if (reason === 'SKETCH_WRONG_LINE_STYLE') return '실선과 점선을 다시 확인하세요: ' + grade.wrongStyle.join(', ');
  if (reason === 'SKETCH_OK') return '가시 모서리는 실선, 가려진 모서리는 점선입니다.';
  return '입력을 확인해 주세요: ' + reason;
}

export function SketchLesson({ onBackToMap }: { onBackToMap: () => void }) {
  const [step, setActivity] = useState<ActivityStep>('predict');
  const [sharedStepId, setSharedStepId] = useState<string>(STEPS[0] ?? 'sketch-view');
  const [rotation, setRotation] = useState(0);
  const [predicted, setPredicted] = useState(false);
  const [edges, setEdges] = useState<EdgeMap>({});
  const [retryKey, setRetryKey] = useState(0);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingFeedback | null>(null);

  const partialId = PARTIAL_QUIZ?.id;
  const fullId = FULL_QUIZ?.id;
  const complete = partialId !== undefined && fullId !== undefined
    && acknowledged.includes(partialId) && acknowledged.includes(fullId);

  useEffect(() => {
    setStep(TOPIC.id, STEPS[0] ?? 'sketch-view');
  }, []);

  if (partialId === undefined || fullId === undefined || STEPS.length < 5 || typeof onBackToMap !== 'function') {
    return (
      <section data-testid="sketch-lesson" data-topic="SKETCH" data-step="result" role="alert">
        <h2>SKETCH_WIRING_ERROR</h2>
        <p>겨냥도 주제 연결을 찾을 수 없습니다. 주제·단계·문제 ID를 확인해 주세요.</p>
      </section>
    );
  }

  const partialQuizId: string = partialId;
  const fullQuizId: string = fullId;

  const boardStep = step === 'repair' || step === 'partial' || step === 'full' ? step : null;
  const config = boardStep === null ? null : QUESTIONS[boardStep];

  function goTo(next: ActivityStep, nextSharedStepId: string) {
    setStep(TOPIC.id, nextSharedStepId);
    setSharedStepId(nextSharedStepId);
    setActivity(next);
    setPending(null);
    setEdges(next === 'repair' || next === 'partial' || next === 'full' ? QUESTIONS[next].initial : {});
    setRetryKey((value) => value + 1);
  }

  function confirmPrediction() {
    setPredicted(true);
    goTo('repair', STEPS[2] ?? 'sketch-fix');
  }

  function submitBoard() {
    if (config === null || boardStep === null) return;
    const grade = gradeSketch(config.question, edges);
    const reason = reasonFrom(grade, edges);
    const hint = hintFor(reason, grade);
    const quizId = boardStep === 'repair' ? STEPS[2] ?? 'sketch-fix'
      : boardStep === 'partial' ? partialQuizId : fullQuizId;
    if (boardStep !== 'repair') {
      submit({
        topicId: TOPIC.id,
        quizId,
        stepId: sharedStepId,
        result: {
          outcome: grade.ok ? 'correct' : 'incorrect',
          reasons: [reason],
        },
      });
    }
    setPending({ quizId, origin: boardStep, correct: grade.ok, hints: [hint], reason });
    setActivity('result');
  }

  function acknowledge(quizId: string) {
    if (pending === null || quizId !== pending.quizId) return false;
    if (pending.origin === 'repair') return true;
    acknowledgeFeedback(TOPIC.id, pending.quizId);
    setAcknowledged((current) => current.includes(pending.quizId) ? current : [...current, pending.quizId]);
    return true;
  }

  function retry(quizId: string) {
    if (pending === null || quizId !== pending.quizId) return;
    const targetStepId = pending.origin === 'partial' ? STEPS[3] ?? 'sketch-partial'
      : pending.origin === 'full' ? STEPS[4] ?? 'sketch-full'
        : STEPS[2] ?? 'sketch-fix';
    goTo(pending.origin, targetStepId);
  }

  function advance(quizId: string) {
    if (pending === null || quizId !== pending.quizId) return;
    if (pending.origin === 'repair') goTo('partial', STEPS[3] ?? 'sketch-partial');
    else if (pending.origin === 'partial') goTo('full', STEPS[4] ?? 'sketch-full');
    else setActivity('result');
  }

  function returnToMap() {
    setStep(TOPIC.id, sharedStepId);
    onBackToMap();
  }

  return (
    <section data-testid="sketch-lesson" data-topic="SKETCH" data-step={step} aria-label="겨냥도 학습">
      <header>
        <h2>겨냥도 · {TOPIC.titleKo}</h2>
        <p>가시 모서리는 실선, 가려진 모서리는 점선으로 나타냅니다.</p>
      </header>

      <section
        data-testid="sketch-view"
        data-fixed-view-id={FIXED_VIEW}
        data-view-id={rotation === 0 ? FIXED_VIEW : FIXED_VIEW + '-rotated-' + rotation}
        aria-label="기준 시점과 현재 시점"
      >
        <p>기준 시점: {FIXED_VIEW} · 현재 시점: {rotation === 0 ? FIXED_VIEW : '회전 ' + rotation}</p>
        <button type="button" data-testid="sketch-view-rotate" data-delta="30" onClick={() => setRotation((value) => value + 30)}>시점 오른쪽 돌리기</button>
        <button type="button" data-testid="sketch-view-rotate" data-delta="-30" onClick={() => setRotation((value) => value - 30)}>시점 왼쪽 돌리기</button>
      </section>

      {step === 'predict' ? (
        <section aria-label="가림 예상">
          <p>{predicted ? '예상을 확인했습니다. 이제 잘못 그어진 선을 고쳐 보세요.' : '모형을 돌려 보며 가려질 모서리를 예상해 보세요.'}</p>
          <button type="button" data-testid="sketch-predict-next" onClick={confirmPrediction}>예상 확인하고 수리하기</button>
        </section>
      ) : null}

      {config !== null && boardStep !== null ? (
        <SketchBoard
          key={boardStep + '-' + retryKey}
          target={TARGET}
          fixedView={VIEW}
          points={POINTS}
          lockedEdges={config.locked}
          edges={edges}
          onEdgesChange={setEdges}
        />
      ) : null}

      {config !== null && boardStep !== null && pending === null ? (
        <button type="button" data-testid="sketch-submit" onClick={submitBoard}>제출하기</button>
      ) : null}

      {pending !== null ? (
        <div
          data-testid="sketch-feedback"
          data-result={pending.correct ? 'correct' : 'incorrect'}
          data-reason={pending.reason}
        >
          <Feedback
            quizId={pending.quizId}
            result={{ quizId: pending.quizId, correct: pending.correct, hints: pending.hints }}
            acknowledged={acknowledged.includes(pending.quizId)}
            canRetry
            onRetry={retry}
            onAcknowledge={acknowledge}
            onContinue={advance}
            onReturnToMap={returnToMap}
          />
        </div>
      ) : null}

      {complete ? <section data-testid="topic-complete" data-topic="SKETCH" role="status">완료 블록</section> : null}
      <button type="button" data-testid="map-return" data-action="map" onClick={returnToMap}>지도로 돌아가기</button>
    </section>
  );
}

export default SketchLesson;
