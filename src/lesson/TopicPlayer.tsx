import { createElement, useState, type ReactNode } from "react";
import Feedback, { type QuizFeedbackResult } from "./Feedback";
import {
  normalizeSteps,
  type NormalStep,
  type TopicSpec,
  type TopicStepInput,
} from "./topicSteps";
import { findTopic } from "./topics";

export type { TopicSpec, TopicStepInput };

// prettier-ignore
export type LessonSubmission = { quizId: string; correct: boolean; reason?: string; hint?: string; netLayout?: unknown; [key: string]: unknown };
// prettier-ignore
export type StoreResult = void | boolean | { ok?: boolean; message?: string };
// prettier-ignore
export type ProgressStore = {
  setStep(topicId: string, stepId: string): StoreResult;
  submit(result: LessonSubmission): StoreResult;
  acknowledgeFeedback(quizId: string): StoreResult;
  getAcknowledgedQuizIds?(topicId: string): readonly string[];
  getTopicState?(topicId: string): { acknowledgedQuizIds?: readonly string[] };
  getTopicSummary?(topicId: string): { complete?: boolean; completed?: boolean };
  isComplete?(topicId: string): boolean;
  getNotice?(): string | null;
};
// prettier-ignore
export type LessonProps = { topicId: string; stepId: string; quizId?: string; onSubmit(result: LessonSubmission): void; onBackToMap?: () => void };
// prettier-ignore
export type LessonRegistry = Readonly<Record<string, (props: LessonProps) => ReactNode>>;
// prettier-ignore
export type TopicPlayerProps = { topicId: string; resumeStepId?: string | null; topicSpec: TopicSpec | null; store: ProgressStore | null; lessons: LessonRegistry | null; onReturnToMap: () => void };
// prettier-ignore
type Notice = { code: string; message: string };

// prettier-ignore
const SAVE_NOTICE: Notice = { code: "STORE_UNAVAILABLE", message: "저장에 실패했습니다. 지금 화면에서 계속할 수 있습니다. 다시 시도해 주세요." };
// prettier-ignore
const CATALOG_NOTICE: Notice = { code: "TOPIC_CATALOG_MISSING", message: "주제 자료를 찾을 수 없습니다." };
// prettier-ignore
const STEP_NOTICE: Notice = { code: "STEP_ID_MISMATCH", message: "저장된 단계를 찾을 수 없습니다." };
// prettier-ignore
const STORE_NOTICE: Notice = { code: "STORE_UNAVAILABLE", message: "저장 기능을 사용할 수 없습니다." };
// prettier-ignore
const CALLBACK_NOTICE: Notice = { code: "CALLBACK_MISSING", message: "화면 연결이 없습니다." };
// prettier-ignore
const QUIZ_NOTICE: Notice = { code: "QUIZ_ID_MISMATCH", message: "이 주제의 필수 문제가 아닙니다." };

// prettier-ignore
function readAcknowledged(topicId: string, store: ProgressStore | null, required: readonly string[]): string[] {
  try {
    const ids = store?.getAcknowledgedQuizIds?.(topicId) ?? store?.getTopicState?.(topicId)?.acknowledgedQuizIds ?? [];
    const matched = required.filter((quizId) => ids.includes(quizId));
    if (matched.length > 0 || (!store?.getTopicSummary && !store?.isComplete)) return matched;
    const summary = store?.getTopicSummary?.(topicId);
    const complete = summary?.complete === true || summary?.completed === true || store?.isComplete?.(topicId) === true;
    return complete ? [...required] : matched;
  } catch {
    return [];
  }
}

// prettier-ignore
function findLesson(lessons: LessonRegistry, topicId: string, step: NormalStep) {
  const keys = [topicId + ":" + step.id, step.quizId ?? step.id, step.id, topicId, topicId.toLowerCase()];
  for (const key of keys) {
    const lesson = lessons[key];
    if (typeof lesson === "function") return lesson;
  }
  return null;
}

// prettier-ignore
function toFeedback(result: LessonSubmission, alreadyAcknowledged: boolean): QuizFeedbackResult {
  const hints = [result.reason, result.hint].filter((value): value is string => typeof value === "string" && value.length > 0);
  return { quizId: result.quizId, correct: result.correct === true, hints, displayLines: alreadyAcknowledged ? ["새 제출 결과를 확인해 주세요."] : undefined };
}

// prettier-ignore
function ErrorScreen({ notice, onReturnToMap }: { notice: Notice; onReturnToMap?: () => void }) {
  return createElement("section", { role: "alert", "aria-label": notice.code, "data-code": notice.code },
    createElement("h2", null, "화면을 열 수 없습니다"),
    createElement("p", null, notice.message),
    onReturnToMap ? createElement("button", { type: "button", onClick: onReturnToMap }, "지도로 돌아가기") : null);
}

export function TopicPlayer({
  topicId,
  resumeStepId,
  topicSpec,
  store,
  lessons,
  onReturnToMap,
}: TopicPlayerProps) {
  const topic = findTopic(topicId);
  const steps = topicSpec ? normalizeSteps(topicSpec) : [];
  const required = topicSpec?.requiredQuizIds ?? [];
  const [stepIndex, setStepIndex] = useState(() => {
    const found = steps.findIndex((step) => step.id === resumeStepId);
    return found >= 0 ? found : 0;
  });
  const [pending, setPending] = useState<LessonSubmission | null>(null);
  const [acknowledged, setAcknowledged] = useState<string[]>(() =>
    readAcknowledged(topicId, store, required),
  );
  const [retryKey, setRetryKey] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);

  if (!topic || !topicSpec || steps.length === 0 || required.length === 0) {
    return createElement(ErrorScreen, {
      notice: CATALOG_NOTICE,
      onReturnToMap,
    });
  }
  if (resumeStepId && !steps.some((step) => step.id === resumeStepId)) {
    return createElement(ErrorScreen, { notice: STEP_NOTICE, onReturnToMap });
  }
  if (
    !store ||
    typeof store.setStep !== "function" ||
    typeof store.submit !== "function" ||
    typeof store.acknowledgeFeedback !== "function"
  ) {
    return createElement(ErrorScreen, { notice: STORE_NOTICE, onReturnToMap });
  }
  if (!lessons || typeof onReturnToMap !== "function") {
    return createElement(ErrorScreen, { notice: CALLBACK_NOTICE });
  }

  const safeIndex = Math.min(Math.max(stepIndex, 0), steps.length - 1);
  const catalogTopic = topic;
  const step = steps[safeIndex];
  const stepLabel = step.label === step.id ? null : step.label;
  const complete = required.every((quizId) => acknowledged.includes(quizId));
  const alreadyAcknowledged = pending
    ? acknowledged.includes(pending.quizId)
    : false;
  const Lesson = findLesson(lessons, topicId, step);

  function runStore(action: () => StoreResult): boolean {
    try {
      const result = action();
      const reported = store!.getNotice?.();
      if (
        reported ||
        result === false ||
        (result && typeof result === "object" && result.ok === false)
      ) {
        setNotice(SAVE_NOTICE);
        return false;
      }
      setNotice(null);
      return true;
    } catch {
      setNotice(SAVE_NOTICE);
      return false;
    }
  }

  function goTo(index: number): boolean {
    const targetIndex = Math.max(0, Math.min(index, steps.length - 1));
    if (targetIndex === safeIndex) return true;
    const target = steps[targetIndex];
    if (!target.quizId && !runStore(() => store!.setStep(topicId, target.id)))
      return false;
    setStepIndex(targetIndex);
    setPending(null);
    return true;
  }

  function handleSubmit(result: LessonSubmission) {
    const quizId = result?.quizId ?? step.quizId;
    if (!quizId || !required.includes(quizId)) {
      setNotice(QUIZ_NOTICE);
      return;
    }
    const submission: LessonSubmission = {
      ...result,
      quizId,
      topicId: catalogTopic.id,
      stepId: step.id,
    };
    if (!runStore(() => store!.submit(submission))) return;
    setPending(submission);
  }

  function handleAcknowledge(quizId?: string): boolean {
    if (!pending) return false;
    if (quizId && quizId !== pending.quizId) {
      setNotice(QUIZ_NOTICE);
      return false;
    }
    if (!runStore(() => store!.acknowledgeFeedback(pending.quizId)))
      return false;
    setAcknowledged((current) =>
      current.includes(pending.quizId) ? current : [...current, pending.quizId],
    );
    setPending(null);
    setRetryKey((value) => value + 1);
    if (!complete || !acknowledged.includes(pending.quizId))
      goTo(safeIndex + 1);
    return true;
  }

  function handleRetry() {
    setPending(null);
    setRetryKey((value) => value + 1);
    setNotice(null);
  }

  function handleMapReturn() {
    if (pending && !handleAcknowledge()) return;
    onReturnToMap();
  }

  const feedback = pending ? toFeedback(pending, alreadyAcknowledged) : null;
  // prettier-ignore
  return createElement("section", { "aria-label": "주제 학습", "data-topic": topicId, "data-step": step.id },
    createElement("header", null,
      createElement("h2", null, topic.titleKo),
      createElement("p", null, "단계 " + (safeIndex + 1) + " / " + steps.length + (stepLabel ? ": " + stepLabel : ""))),
    complete ? createElement("section", { role: "status", "aria-label": "완료 블록", "data-testid": "topic-complete", "data-reason": pending && alreadyAcknowledged ? "PREVIOUS_BLOCK_RETAINED" : undefined },
      createElement("h3", null, "완료 블록"),
      createElement("p", null, "필수 결과를 모두 확인했습니다.")) : null,
    notice ? createElement("p", { role: "alert", "data-code": notice.code }, notice.message) : null,
    pending && feedback
      ? createElement(Feedback, { quizId: pending.quizId, result: feedback, acknowledged: false, canRetry: true, onRetry: handleRetry, onAcknowledge: handleAcknowledge, onContinue: () => undefined, onReturnToMap })
      : createElement("section", { "aria-label": "활동", "data-step-id": step.id },
        step.description ? createElement("p", null, step.description) : null,
        Lesson
          ? createElement(Lesson, { topicId, stepId: step.id, quizId: step.quizId, onSubmit: handleSubmit, key: (step.quizId ?? step.id) + "-" + retryKey })
          : createElement("p", null, step.kind === "quiz" ? "조작 후 제출해 주세요." : "내용을 확인하고 다음 단계로 넘어가세요."),
        step.quizId ? null : createElement("button", { type: "button", onClick: () => goTo(safeIndex + 1) }, "다음 단계")),
    createElement("button", { type: "button", onClick: handleMapReturn }, "지도로 돌아가기"));
}

export default TopicPlayer;
