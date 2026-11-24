import { validateNetLayout, type NetLayout } from "../geometry/netLayout";
import {
  findTopic,
  isTopicId,
  requiredQuizIds,
  type TopicId,
} from "../lesson/topics";

export const PROGRESS_STORAGE_KEY = "cuboid-review-lab.progress.v1";

export type QuizResult = {
  quizId: string;
  correct: boolean;
  reasonCodes: string[];
  payload?: object;
};

export type QuizResultRecord = {
  lastResult: QuizResult | null;
  awaitingAck: boolean;
  everAcknowledged: boolean;
};

export type TopicStateRecord = {
  stepId: string;
  quizzes: Record<string, QuizResultRecord>;
};

export type ExhibitTopicId = "NET-C" | "NET-R";
export type ExhibitRecord = Record<ExhibitTopicId, NetLayout | null>;

export type ProgressSnapshotV1 = {
  version: 1;
  topicStates: Record<TopicId, TopicStateRecord>;
  exhibits: ExhibitRecord;
};

export type StorageFailure = {
  phase: "access" | "schema" | "write";
  code:
    "STORAGE_ACCESS_FAILED" | "STORAGE_SCHEMA_INVALID" | "STORAGE_WRITE_FAILED";
  observedVersion: number | null;
};

export type LoadResult =
  | { ok: true; value: ProgressSnapshotV1 | null }
  | { ok: false; error: StorageFailure };

export type SaveResult = { ok: true } | { ok: false; error: StorageFailure };

type UnknownRecord = Record<string, unknown>;

const EXHIBIT_KIND: Readonly<Record<ExhibitTopicId, NetLayout["kind"]>> =
  Object.freeze({ "NET-C": "cube", "NET-R": "cuboid" });

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function observedVersionOf(value: unknown): number | null {
  if (!isRecord(value) || typeof value.version !== "number") {
    return null;
  }
  return value.version;
}

function accessFailure(): StorageFailure {
  return {
    phase: "access",
    code: "STORAGE_ACCESS_FAILED",
    observedVersion: null,
  };
}

function schemaFailure(observedVersion: number | null): StorageFailure {
  return {
    phase: "schema",
    code: "STORAGE_SCHEMA_INVALID",
    observedVersion,
  };
}

function writeFailure(observedVersion: number | null): StorageFailure {
  return {
    phase: "write",
    code: "STORAGE_WRITE_FAILED",
    observedVersion,
  };
}

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isQuizResult(value: unknown, topicId: TopicId): value is QuizResult {
  if (!isRecord(value)) {
    return false;
  }
  if (
    typeof value.quizId !== "string" ||
    !requiredQuizIds(topicId).includes(value.quizId) ||
    typeof value.correct !== "boolean" ||
    !isStringArray(value.reasonCodes)
  ) {
    return false;
  }
  return (
    value.payload === undefined ||
    (typeof value.payload === "object" && value.payload !== null)
  );
}

function isQuizResultRecord(
  value: unknown,
  topicId: TopicId,
  quizId: string,
): value is QuizResultRecord {
  if (!isRecord(value)) {
    return false;
  }
  if (
    typeof value.awaitingAck !== "boolean" ||
    typeof value.everAcknowledged !== "boolean"
  ) {
    return false;
  }
  return (
    value.lastResult === null ||
    (isQuizResult(value.lastResult, topicId) &&
      value.lastResult.quizId === quizId)
  );
}

function isTopicStateRecord(
  value: unknown,
  topicId: TopicId,
): value is TopicStateRecord {
  if (!isRecord(value) || typeof value.stepId !== "string") {
    return false;
  }
  const topic = findTopic(topicId);
  if (topic === null || !topic.stepIds.includes(value.stepId)) {
    return false;
  }
  if (!isRecord(value.quizzes)) {
    return false;
  }
  return Object.entries(value.quizzes).every(
    ([quizId, record]) =>
      requiredQuizIds(topicId).includes(quizId) &&
      isQuizResultRecord(record, topicId, quizId),
  );
}

function isExhibit(value: unknown, topicId: ExhibitTopicId): boolean {
  if (value === null) {
    return true;
  }
  if (!isRecord(value) || value.kind !== EXHIBIT_KIND[topicId]) {
    return false;
  }
  return validateNetLayout(value as unknown as NetLayout, "complete").ok;
}

function isProgressSnapshotV1(value: unknown): value is ProgressSnapshotV1 {
  if (!isRecord(value) || value.version !== 1) {
    return false;
  }
  const exhibits = value.exhibits;
  if (!isRecord(value.topicStates) || !isRecord(exhibits)) {
    return false;
  }
  const validTopics = Object.entries(value.topicStates).every(
    ([topicId, state]) =>
      isTopicId(topicId) && isTopicStateRecord(state, topicId),
  );
  if (!validTopics) {
    return false;
  }
  return (Object.keys(EXHIBIT_KIND) as ExhibitTopicId[]).every(
    (topicId) =>
      !(topicId in exhibits) || isExhibit(exhibits[topicId], topicId),
  );
}

export function loadProgress(): LoadResult {
  const storage = getStorage();
  if (storage === null) {
    return { ok: false, error: accessFailure() };
  }
  let stored: string | null;
  try {
    stored = storage.getItem(PROGRESS_STORAGE_KEY);
  } catch {
    return { ok: false, error: accessFailure() };
  }
  if (stored === null) {
    return { ok: true, value: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return { ok: false, error: schemaFailure(null) };
  }
  if (!isProgressSnapshotV1(parsed)) {
    return { ok: false, error: schemaFailure(observedVersionOf(parsed)) };
  }
  return { ok: true, value: parsed };
}

export function saveProgress(snapshot: ProgressSnapshotV1): SaveResult {
  if (!isProgressSnapshotV1(snapshot)) {
    return {
      ok: false,
      error: schemaFailure(observedVersionOf(snapshot)),
    };
  }
  const storage = getStorage();
  if (storage === null) {
    return { ok: false, error: accessFailure() };
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(snapshot);
  } catch {
    return { ok: false, error: schemaFailure(1) };
  }
  try {
    storage.setItem(PROGRESS_STORAGE_KEY, serialized);
  } catch {
    return { ok: false, error: writeFailure(1) };
  }
  return { ok: true };
}
