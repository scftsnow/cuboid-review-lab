import { validateNetLayout, type NetLayout, type SolidKind as NetKind } from "../geometry/netLayout";
import { findTopic, TOPICS, TOPIC_ORDER, type TopicId } from "../lesson/topics";
import { loadProgress, saveProgress, type ProgressSnapshotV1, type QuizResultRecord as StoredQuizRecord } from "./storage";

export type StepId = string;
export type QuizId = string;
export type QuizOutcome = "correct" | "partial" | "incorrect";
export type QuizResult = { outcome: QuizOutcome; reasons: string[] };
export type QuizRecord = { lastResult: QuizResult; awaitingAck: boolean; firstAcknowledged: boolean };
export type TopicState = { stepId: StepId; results: Partial<Record<QuizId, QuizRecord>> };
export type PersistedState = {
  version: 1;
  topicStates: Partial<Record<TopicId, TopicState>>;
  exhibits: Record<NetKind, NetLayout | null>;
};
export type TopicSummary = {
  topicId: TopicId; id: TopicId; labelKo: string; sequence: number; stepId: StepId;
  complete: boolean; completed: boolean; lastResult: QuizResult | null; awaitingAck: boolean;
};
export type SubmitInput = {
  topicId?: TopicId; quizId: QuizId; stepId?: StepId;
  result?: QuizResult; correct?: boolean; reason?: string; reasonCodes?: string[];
  netLayout?: NetLayout; exhibit?: { kind: NetKind; layout: NetLayout };
};

const RESTORE_NOTICE = "저장된 진행을 복원할 수 없어 새로 시작합니다.";
const SAVE_NOTICE = "진행을 저장하지 못했습니다. 다음 접속에 복원할 수 없습니다.";
const OUTCOMES: readonly QuizOutcome[] = ["correct", "partial", "incorrect"];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isQuizResult = (value: unknown): value is QuizResult =>
  isRecord(value) && OUTCOMES.some((outcome) => outcome === value.outcome) &&
  Array.isArray(value.reasons) && value.reasons.every((reason) => typeof reason === "string");

function topicForQuizId(quizId: string): TopicId | null {
  return TOPIC_ORDER.find((id) => TOPICS[id].quizzes.some((quiz) => quiz.id === quizId)) ?? null;
}

function emptyState(): PersistedState {
  return { version: 1, topicStates: {}, exhibits: { cube: null, cuboid: null } };
}

function toStoredState(state: PersistedState): ProgressSnapshotV1 {
  const topicStates = {} as ProgressSnapshotV1["topicStates"];
  for (const [topicId, topicState] of Object.entries(state.topicStates)) {
    if (topicState === undefined) continue;
    const quizzes: Record<string, StoredQuizRecord> = {};
    for (const [quizId, record] of Object.entries(topicState.results)) {
      if (record === undefined) continue;
      quizzes[quizId] = {
        lastResult: {
          quizId,
          correct: record.lastResult.outcome === "correct",
          reasonCodes: [...record.lastResult.reasons],
          payload: { outcome: record.lastResult.outcome },
        },
        awaitingAck: record.awaitingAck,
        everAcknowledged: record.firstAcknowledged,
      };
    }
    topicStates[topicId as TopicId] = { stepId: topicState.stepId, quizzes };
  }
  return {
    version: 1,
    topicStates,
    exhibits: { "NET-C": state.exhibits.cube, "NET-R": state.exhibits.cuboid },
  };
}

function fromStoredState(snapshot: ProgressSnapshotV1): PersistedState {
  const topicStates: PersistedState["topicStates"] = {};
  for (const [topicId, topicState] of Object.entries(snapshot.topicStates)) {
    const topic = findTopic(topicId);
    if (topic === null || topicState === undefined) continue;
    const results: TopicState["results"] = {};
    for (const [quizId, record] of Object.entries(topicState.quizzes)) {
      if (record === undefined || !topic.quizzes.some((quiz) => quiz.id === quizId) || record.lastResult === null) continue;
      const storedResult = record.lastResult;
      const payload = storedResult.payload as Record<string, unknown> | undefined;
      const embedded = payload !== undefined && OUTCOMES.some((outcome) => outcome === payload.outcome)
        ? (payload.outcome as QuizOutcome)
        : null;
      results[quizId] = {
        lastResult: {
          outcome: embedded ?? (storedResult.correct ? "correct" : "incorrect"),
          reasons: [...storedResult.reasonCodes],
        },
        awaitingAck: record.awaitingAck,
        firstAcknowledged: record.everAcknowledged,
      };
    }
    topicStates[topic.id] = { stepId: topicState.stepId, results };
  }
  return {
    version: 1,
    topicStates,
    exhibits: { cube: snapshot.exhibits["NET-C"] ?? null, cuboid: snapshot.exhibits["NET-R"] ?? null },
  };
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
  write({
    ...state,
    topicStates: { ...state.topicStates, [topic.id]: { stepId, results: previous?.results ?? {} } },
  });
}

export function submit(input: SubmitInput): void {
  ensureLoaded();
  const topic = findTopic(input.topicId ?? topicForQuizId(input.quizId));
  if (topic === null || !topic.quizzes.some((quiz) => quiz.id === input.quizId)) return;
  if (input.stepId !== undefined && !topic.stepIds.some((id) => id === input.stepId)) return;
  let result: QuizResult;
  if (input.result !== undefined) {
    if (!isQuizResult(input.result)) return;
    result = input.result;
  } else {
    result = {
      outcome: input.correct === true ? "correct" : "incorrect",
      reasons: input.reasonCodes ?? (input.reason === undefined ? [] : [input.reason]),
    };
  }
  const previousTopic = state.topicStates[topic.id];
  const previousRecord = previousTopic?.results[input.quizId];
  const exhibits = { ...state.exhibits };
  const kind = input.exhibit?.kind ?? topic.exhibitKind;
  const layout = input.exhibit?.layout ?? input.netLayout;
  if (kind !== undefined && kind === topic.exhibitKind && result.outcome === "correct" && layout !== undefined &&
      validateNetLayout(layout, "complete").ok) {
    exhibits[kind] = layout;
  }
  write({
    ...state,
    topicStates: {
      ...state.topicStates,
      [topic.id]: {
        stepId: input.stepId ?? previousTopic?.stepId ?? topic.firstStepId,
        results: {
          ...previousTopic?.results,
          [input.quizId]: {
            lastResult: { outcome: result.outcome, reasons: [...result.reasons] },
            awaitingAck: true,
            firstAcknowledged: previousRecord?.firstAcknowledged ?? false,
          },
        },
      },
    },
    exhibits,
  });
}

export function acknowledgeFeedback(topicIdOrQuizId: string, quizId?: QuizId): void {
  ensureLoaded();
  const quiz = quizId ?? topicIdOrQuizId;
  const topicId = quizId === undefined ? topicForQuizId(quiz) : topicIdOrQuizId;
  const topic = findTopic(topicId);
  if (topic === null) return;
  const topicState = state.topicStates[topic.id];
  const record = topicState?.results[quiz];
  if (record === undefined || (!record.awaitingAck && record.firstAcknowledged)) return;
  write({
    ...state,
    topicStates: {
      ...state.topicStates,
      [topic.id]: {
        ...topicState,
        results: { ...topicState?.results, [quiz]: { ...record, awaitingAck: false, firstAcknowledged: true } },
      },
    },
  });
}

export function getTopicSummary(topicId: string): TopicSummary {
  ensureLoaded();
  const topic = findTopic(topicId);
  if (topic === null) {
    return {
      topicId: topicId as TopicId, id: topicId as TopicId, labelKo: "", sequence: 0, stepId: "",
      complete: false, completed: false, lastResult: null, awaitingAck: false,
    };
  }
  const topicState = state.topicStates[topic.id];
  const complete = topic.quizzes.every((quiz) => topicState?.results[quiz.id]?.firstAcknowledged === true);
  const records = Object.values(topicState?.results ?? {});
  const latest = records[records.length - 1];
  return {
    topicId: topic.id, id: topic.id, labelKo: topic.titleKo, sequence: topic.order,
    stepId: topicState?.stepId ?? topic.firstStepId,
    complete, completed: complete,
    lastResult: latest?.lastResult ?? null, awaitingAck: latest?.awaitingAck ?? false,
  };
}

export function getTopicSummaries(): TopicSummary[] {
  ensureLoaded();
  return TOPIC_ORDER.map((topicId) => getTopicSummary(topicId));
}

export function getExhibit(kind: NetKind): NetLayout | null {
  ensureLoaded();
  return kind === "cube" || kind === "cuboid" ? (state.exhibits[kind] ?? null) : null;
}

export function isComplete(topicId: string): boolean {
  return getTopicSummary(topicId).complete;
}

export function getNotice(): string | null {
  ensureLoaded();
  return notice;
}
