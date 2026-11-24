import type { NetLayout, SolidKind as NetKind } from "../geometry/netLayout";
import { findTopic, type TopicId } from "../lesson/topics";
import type {
  ProgressSnapshotV1,
  QuizResultRecord as StoredQuizRecord,
} from "./storage";

export type StepId = string;
export type QuizId = string;
export type QuizOutcome = "correct" | "partial" | "incorrect";
export type QuizResult = { outcome: QuizOutcome; reasons: string[] };
export type QuizRecord = {
  lastResult: QuizResult;
  awaitingAck: boolean;
  firstAcknowledged: boolean;
};
export type TopicState = {
  stepId: StepId;
  results: Partial<Record<QuizId, QuizRecord>>;
};
export type PersistedState = {
  version: 1;
  topicStates: Partial<Record<TopicId, TopicState>>;
  exhibits: Record<NetKind, NetLayout | null>;
};

const OUTCOMES: readonly QuizOutcome[] = ["correct", "partial", "incorrect"];

export function emptyState(): PersistedState {
  return {
    version: 1,
    topicStates: {},
    exhibits: { cube: null, cuboid: null },
  };
}

export function toStoredState(state: PersistedState): ProgressSnapshotV1 {
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

export function fromStoredState(snapshot: ProgressSnapshotV1): PersistedState {
  const topicStates: PersistedState["topicStates"] = {};
  for (const [topicId, topicState] of Object.entries(snapshot.topicStates)) {
    const topic = findTopic(topicId);
    if (topic === null || topicState === undefined) continue;
    const results: TopicState["results"] = {};
    for (const [quizId, record] of Object.entries(topicState.quizzes)) {
      if (record === undefined || record.lastResult === null) continue;
      const storedResult = record.lastResult;
      const payload = storedResult.payload as
        Record<string, unknown> | undefined;
      const embedded =
        payload !== undefined &&
        OUTCOMES.some((outcome) => outcome === payload.outcome)
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
    exhibits: {
      cube: snapshot.exhibits["NET-C"] ?? null,
      cuboid: snapshot.exhibits["NET-R"] ?? null,
    },
  };
}
