import {
  validateNetLayout,
  type NetLayout,
  type SolidKind as NetKind,
} from "../geometry/netLayout";
import { findTopic, TOPICS, TOPIC_ORDER, type TopicId } from "../lesson/topics";
import {
  emptyState,
  fromStoredState,
  toStoredState,
  type PersistedState,
  type QuizId,
  type QuizOutcome,
  type QuizResult,
  type StepId,
  type TopicState,
} from "./progressSnapshot";
import { loadProgress, saveProgress } from "./storage";

export type * from "./progressSnapshot";

export type TopicSummary = {
  topicId: TopicId;
  id: TopicId;
  labelKo: string;
  sequence: number;
  stepId: StepId;
  complete: boolean;
  completed: boolean;
  lastResult: QuizResult | null;
  awaitingAck: boolean;
};
export type SubmitInput = {
  topicId?: TopicId;
  quizId: QuizId;
  stepId?: StepId;
  result?: QuizResult;
  correct?: boolean;
  reason?: string;
  reasonCodes?: string[];
  netLayout?: NetLayout;
  exhibit?: { kind: NetKind; layout: NetLayout };
};

const RESTORE_NOTICE = "저장된 진행을 복원할 수 없어 새로 시작합니다.";
const SAVE_NOTICE =
  "진행을 저장하지 못했습니다. 다음 접속에 복원할 수 없습니다.";
const OUTCOMES: readonly QuizOutcome[] = ["correct", "partial", "incorrect"];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isQuizResult = (value: unknown): value is QuizResult =>
  isRecord(value) &&
  OUTCOMES.includes(value.outcome as QuizOutcome) &&
  Array.isArray(value.reasons) &&
  value.reasons.every((reason) => typeof reason === "string");

function topicForQuizId(quizId: string): TopicId | null {
  return (
    TOPIC_ORDER.find((id) =>
      TOPICS[id].quizzes.some((quiz) => quiz.id === quizId),
    ) ?? null
  );
}

let state: PersistedState = emptyState();
let loaded = false;
let notice: string | null = null;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    const result = loadProgress();
    if (!result.ok) {
      notice = RESTORE_NOTICE;
    } else if (result.value !== null) {
      state = fromStoredState(result.value);
    }
  } catch {
    notice = RESTORE_NOTICE;
  }
}

function write(next: PersistedState): void {
  state = next;
  try {
    notice = saveProgress(toStoredState(next)).ok ? null : SAVE_NOTICE;
  } catch {
    notice = SAVE_NOTICE;
  }
}

function writeTopic(
  topicId: TopicId,
  next: TopicState,
  exhibits = state.exhibits,
): void {
  write({
    ...state,
    topicStates: { ...state.topicStates, [topicId]: next },
    exhibits,
  });
}

export function getState(): PersistedState {
  ensureLoaded();
  return state;
}

export function setStep(topicId: string, stepId: string): void {
  ensureLoaded();
  const topic = findTopic(topicId);
  if (topic === null || !topic.stepIds.some((id) => id === stepId)) return;
  const previous = state.topicStates[topic.id];
  if (previous?.stepId === stepId) return;
  writeTopic(topic.id, { stepId, results: previous?.results ?? {} });
}

export function submit(input: SubmitInput): void {
  ensureLoaded();
  const topic = findTopic(input.topicId ?? topicForQuizId(input.quizId));
  if (topic === null || !topic.quizzes.some((quiz) => quiz.id === input.quizId))
    return;
  if (
    input.stepId !== undefined &&
    !topic.stepIds.some((id) => id === input.stepId)
  )
    return;
  let result: QuizResult;
  if (input.result !== undefined) {
    if (!isQuizResult(input.result)) return;
    result = input.result;
  } else {
    result = {
      outcome: input.correct === true ? "correct" : "incorrect",
      reasons:
        input.reasonCodes ?? (input.reason === undefined ? [] : [input.reason]),
    };
  }
  const previousTopic = state.topicStates[topic.id];
  const previousRecord = previousTopic?.results[input.quizId];
  const exhibits = { ...state.exhibits };
  const kind = input.exhibit?.kind ?? topic.exhibitKind;
  const layout = input.exhibit?.layout ?? input.netLayout;
  if (
    kind !== undefined &&
    kind === topic.exhibitKind &&
    result.outcome === "correct" &&
    layout !== undefined &&
    validateNetLayout(layout, "complete").ok
  ) {
    exhibits[kind] = layout;
  }
  writeTopic(
    topic.id,
    {
      stepId: input.stepId ?? previousTopic?.stepId ?? topic.firstStepId,
      results: {
        ...previousTopic?.results,
        [input.quizId]: {
          lastResult: {
            outcome: result.outcome,
            reasons: [...result.reasons],
          },
          awaitingAck: true,
          firstAcknowledged: previousRecord?.firstAcknowledged ?? false,
        },
      },
    },
    exhibits,
  );
}

export function acknowledgeFeedback(
  topicIdOrQuizId: string,
  quizId?: QuizId,
): void {
  ensureLoaded();
  const quiz = quizId ?? topicIdOrQuizId;
  const topicId = quizId === undefined ? topicForQuizId(quiz) : topicIdOrQuizId;
  const topic = findTopic(topicId);
  if (topic === null) return;
  const topicState = state.topicStates[topic.id];
  const record = topicState?.results[quiz];
  if (record === undefined || (!record.awaitingAck && record.firstAcknowledged))
    return;
  writeTopic(topic.id, {
    stepId: topicState?.stepId ?? topic.firstStepId,
    results: {
      ...topicState?.results,
      [quiz]: { ...record, awaitingAck: false, firstAcknowledged: true },
    },
  });
}

export function getTopicSummary(topicId: string): TopicSummary {
  ensureLoaded();
  const topic = findTopic(topicId);
  if (topic === null) {
    return {
      topicId: topicId as TopicId,
      id: topicId as TopicId,
      labelKo: "",
      sequence: 0,
      stepId: "",
      complete: false,
      completed: false,
      lastResult: null,
      awaitingAck: false,
    };
  }
  const topicState = state.topicStates[topic.id];
  const complete = topic.quizzes.every(
    (quiz) => topicState?.results[quiz.id]?.firstAcknowledged === true,
  );
  const records = Object.values(topicState?.results ?? {});
  const latest = records[records.length - 1];
  return {
    topicId: topic.id,
    id: topic.id,
    labelKo: topic.titleKo,
    sequence: topic.order,
    stepId: topicState?.stepId ?? topic.firstStepId,
    complete,
    completed: complete,
    lastResult: latest?.lastResult ?? null,
    awaitingAck: latest?.awaitingAck ?? false,
  };
}

export function getTopicSummaries(): TopicSummary[] {
  ensureLoaded();
  return TOPIC_ORDER.map((topicId) => getTopicSummary(topicId));
}

export function getExhibit(kind: NetKind): NetLayout | null {
  ensureLoaded();
  if (kind !== "cube" && kind !== "cuboid") return null;
  return state.exhibits[kind] ?? null;
}

export function isComplete(topicId: string): boolean {
  return getTopicSummary(topicId).complete;
}

export function getNotice(): string | null {
  ensureLoaded();
  return notice;
}
