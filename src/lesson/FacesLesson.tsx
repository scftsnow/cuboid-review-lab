import { useState } from 'react';
import {
  baseFaceRelations,
  type FaceRelationResult,
  type FaceRelations,
  type SolidTopology,
} from '../geometry/faceRelations';
import {
  getSolidTopology,
  type BoxTopology,
  type FaceId as SolidFaceId,
} from '../geometry/solid';
import { findTopic } from './topics';
import type { LessonProps } from './TopicPlayer';

type BoxKind = 'cube' | 'cuboid';
type Mode = 'base' | 'relation';
type FeedbackState = {
  correct: boolean; reason: string; reasonCode: string; hint: string;
  expected: readonly string[]; missing: readonly string[]; extra: readonly string[];
};

const FACE_LABELS: Record<SolidFaceId, string> = {
  fBack: '뒷면', fFront: '앞면', fBottom: '아랫면', fTop: '윗면', fLeft: '왼쪽 면', fRight: '오른쪽 면',
};

const FACES_TOPIC = findTopic('FACES');
const FACES_QUIZZES = FACES_TOPIC?.quizzes ?? [];

function resolveQuiz(quizId: string | undefined, stepId: string) {
  return FACES_QUIZZES.find((quiz) => quiz.id === quizId)
    ?? FACES_QUIZZES.find((quiz) => quiz.stepId === stepId)
    ?? null;
}

function toRelationTopology(topology: BoxTopology): SolidTopology {
  return {
    faces: topology.faces.map((face) => {
      const others = topology.faces.filter((candidate) => candidate.id !== face.id);
      const opposite = others.find((candidate) =>
        face.vertexIds.every((vertexId) => !candidate.vertexIds.includes(vertexId)),
      );
      const oppositeId = opposite?.id ?? '';
      const sideIds = others
        .filter((candidate) => candidate.id !== oppositeId)
        .map((candidate) => candidate.id);
      return { id: face.id, oppositeId, sideIds };
    }),
  };
}

function expectedFor(relations: FaceRelations, mode: Mode): readonly string[] {
  return mode === 'base'
    ? [relations.opposite, ...relations.sides]
    : [...relations.parallel, ...relations.perpendicular];
}

function labelOf(id: string): string {
  return (FACE_LABELS[id as SolidFaceId] ?? id) + '(' + id + ')';
}

function labelList(ids: readonly string[]): string {
  return ids.map(labelOf).join(', ');
}

export default function FacesLesson({ stepId, quizId, onSubmit }: LessonProps) {
  const quiz = resolveQuiz(quizId, stepId);
  const mode: Mode = quiz?.kind === 'face-relation' ? 'relation' : 'base';
  const quizUnavailable = Boolean(quizId && !quiz);
  const [solidKind, setSolidKind] = useState<BoxKind>('cuboid');
  const [baseFaceId, setBaseFaceId] = useState('fFront');
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const topology = getSolidTopology(
    solidKind === 'cube' ? 'solid-cube' : 'solid-cuboid',
  );
  const faceIds: readonly SolidFaceId[] = topology.ok
    ? topology.value.faces.map((face) => face.id)
    : [];
  const relation: FaceRelationResult = topology.ok
    ? baseFaceRelations(toRelationTopology(topology.value), baseFaceId)
    : { ok: false, code: 'INVALID_TOPOLOGY' };
  const questionTitle = mode === 'base' ? '다른 밑면과 옆면 찾기' : '평행·수직인 면 찾기';

  function chooseSolid(kind: BoxKind): void {
    setSolidKind(kind);
    setSelected([]);
    setFeedback(null);
  }

  function chooseBase(id: string): void {
    setBaseFaceId(id);
    setSelected([]);
    setFeedback(null);
  }

  function toggleFace(id: string): void {
    setSelected((current) =>
      current.includes(id) ? current.filter((faceId) => faceId !== id) : [...current, id],
    );
    setFeedback(null);
  }

  function submitSelection(): void {
    if (!relation.ok || !quiz) {
      return;
    }
    const expected = expectedFor(relation.relations, mode);
    const expectedSet = new Set(expected);
    const selectedSet = new Set(selected);
    const missing = expected.filter((id) => !selectedSet.has(id));
    const extra = selected.filter((id) => !expectedSet.has(id));
    const correct = missing.length === 0 && extra.length === 0;
    const reasonCode = correct ? 'CORRECT' : missing.length > 0 && extra.length > 0 ? 'MISSING_AND_WRONG_FACES' : missing.length > 0 ? 'MISSING_FACES' : 'WRONG_FACES';
    const reason = correct ? '기준 면에 맞는 면을 모두 찾았습니다.' : '빠진 면 ' + missing.length + '개, 잘못 선택한 면 ' + extra.length + '개가 있습니다.';
    const hint = correct ? '' : mode === 'base' ? '마주 보는 면 하나를 먼저 찾고, 나머지 네 면을 옆면으로 고르세요.' : '마주 보는 면은 평행이고, 만나서 직각인 네 면은 수직입니다.';
    setFeedback({ correct, reason, reasonCode, hint, expected, missing, extra });
    onSubmit({
      quizId: quiz.id,
      correct,
      reason,
      reasonCode,
      hint,
      solidKind,
      baseFaceId,
      mode,
      expected: [...expected],
      selected: [...selected],
      missing: [...missing],
      extra: [...extra],
    });
  }

  return (
    <section data-testid="faces-lesson" aria-label="면 관계 학습">
      <h3>면의 성질</h3>
      <p>기준 면을 정하고 다른 면을 찾아 보세요. 기준 면을 바꿔 여러 각도에서 확인할 수 있습니다.</p>

      <fieldset data-testid="faces-solid-kind">
        <legend>도형</legend>
        {(['cuboid', 'cube'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={solidKind === kind}
            data-testid={'solid-kind-' + kind}
            onClick={() => chooseSolid(kind)}
          >
            {kind === 'cube' ? '정육면체' : '직육면체'}
          </button>
        ))}
      </fieldset>

      <fieldset data-testid="faces-base-face">
        <legend>기준 면</legend>
        {faceIds.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={baseFaceId === id}
            aria-label={FACE_LABELS[id]}
            data-testid={'base-face-' + id}
            onClick={() => chooseBase(id)}
          >
            {FACE_LABELS[id]}
          </button>
        ))}
      </fieldset>

      {relation.ok ? (
        <p data-testid="faces-question">
          기준 면 {labelOf(baseFaceId)} · {questionTitle}.{' '}
          {mode === 'base'
            ? '기준 면과 마주 보는 밑면 1개와 나머지 옆면 4개를 선택하세요.'
            : '기준 면과 평행인 면 1개와 수직인 면 4개를 선택하세요.'}
        </p>
      ) : (
        <p role="alert" data-testid="faces-relation-error">
          {relation.code}
        </p>
      )}

      {!quizId ? (
        <div data-testid="faces-explain">
          <p>
            {mode === 'base'
              ? '맞은편 면 두 개를 밑면이라고 하고, 나머지 네 면을 옆면이라고 합니다.'
              : '마주 보는 두 면은 평행하고, 이웃한 면은 만나서 직각이 됩니다.'}
          </p>
          <p>도형을 돌려도 정한 기준 면은 그대로 유지됩니다.</p>
        </div>
      ) : null}

      {quizUnavailable ? (
        <p role="alert" data-testid="faces-quiz-catalog-error">
          주제 문제 정보를 찾을 수 없습니다.
        </p>
      ) : null}

      {quiz && relation.ok ? (
        <div data-testid="faces-quiz">
          <h4>{questionTitle}</h4>
          <fieldset data-testid="faces-options">
            <legend>면 선택</legend>
            {faceIds.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={selected.includes(id)}
                aria-label={FACE_LABELS[id]}
                data-testid={'face-option-' + id}
                data-face-id={id}
                onClick={() => toggleFace(id)}
              >
                {FACE_LABELS[id]}
              </button>
            ))}
          </fieldset>
          <button type="button" data-testid="faces-submit" onClick={submitSelection}>
            제출하기
          </button>

          {feedback ? (
            <section role="status" aria-label="선택 결과" data-testid="faces-feedback">
              <p data-testid="faces-result-line">
                {feedback.correct ? '정답입니다' : '다시 생각해 보세요'}
              </p>
              <p>{feedback.reason}</p>
              <p data-testid="faces-expected">정답 집합: {labelList(feedback.expected)}</p>
              {feedback.missing.length > 0 ? (
                <p data-testid="faces-missing">빠진 면: {labelList(feedback.missing)}</p>
              ) : null}
              {feedback.extra.length > 0 ? (
                <p data-testid="faces-extra">잘못 선택한 면: {labelList(feedback.extra)}</p>
              ) : null}
              {feedback.hint ? <p>{feedback.hint}</p> : null}
              <button type="button" data-testid="faces-retry" onClick={() => setFeedback(null)}>
                선택 수정하기
              </button>
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
