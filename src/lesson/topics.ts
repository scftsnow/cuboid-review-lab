export type TopicId = "SOLID" | "SKETCH" | "FACES" | "NET-C" | "NET-R";

export type TopicQuiz = {
  id: string;
  stepId: string;
  kind:
    | "classification"
    | "counting"
    | "base-face"
    | "face-relation"
    | "sketch-partial"
    | "sketch-full"
    | "net-partial"
    | "net-full";
  required: true;
  exhibit: boolean;
};

export type TopicDefinition = {
  id: TopicId;
  order: 1 | 2 | 3 | 4 | 5;
  titleKo: string;
  stepIds: readonly string[];
  firstStepId: string;
  quizzes: readonly TopicQuiz[];
  exhibitKind?: "cube" | "cuboid";
};

export const TOPIC_ORDER: readonly TopicId[] = Object.freeze([
  "SOLID",
  "SKETCH",
  "FACES",
  "NET-C",
  "NET-R",
]);

const TOPIC_DEFINITIONS: Record<TopicId, TopicDefinition> = {
  SOLID: {
    id: "SOLID",
    order: 1,
    titleKo: "직육면체와 정육면체",
    stepIds: ["solid-intro", "solid-classify", "solid-parts", "solid-count"],
    firstStepId: "solid-intro",
    quizzes: [
      {
        id: "solid-classify-check",
        stepId: "solid-classify",
        kind: "classification",
        required: true,
        exhibit: false,
      },
      {
        id: "solid-count-check",
        stepId: "solid-count",
        kind: "counting",
        required: true,
        exhibit: false,
      },
    ],
  },
  SKETCH: {
    id: "SKETCH",
    order: 2,
    titleKo: "겨냥도",
    stepIds: [
      "sketch-view",
      "sketch-predict",
      "sketch-fix",
      "sketch-partial",
      "sketch-full",
    ],
    firstStepId: "sketch-view",
    quizzes: [
      {
        id: "sketch-partial-check",
        stepId: "sketch-partial",
        kind: "sketch-partial",
        required: true,
        exhibit: false,
      },
      {
        id: "sketch-full-check",
        stepId: "sketch-full",
        kind: "sketch-full",
        required: true,
        exhibit: false,
      },
    ],
  },
  FACES: {
    id: "FACES",
    order: 3,
    titleKo: "면의 성질",
    stepIds: ["faces-base", "faces-find", "faces-relations", "faces-select"],
    firstStepId: "faces-base",
    quizzes: [
      {
        id: "faces-base-check",
        stepId: "faces-find",
        kind: "base-face",
        required: true,
        exhibit: false,
      },
      {
        id: "faces-relation-check",
        stepId: "faces-select",
        kind: "face-relation",
        required: true,
        exhibit: false,
      },
    ],
  },
  "NET-C": {
    id: "NET-C",
    order: 4,
    titleKo: "정육면체 전개도",
    exhibitKind: "cube",
    stepIds: [
      "net-c-observe",
      "net-c-predict",
      "net-c-correspond",
      "net-c-fix",
      "net-c-complete",
      "net-c-build",
    ],
    firstStepId: "net-c-observe",
    quizzes: [
      {
        id: "net-c-partial-check",
        stepId: "net-c-complete",
        kind: "net-partial",
        required: true,
        exhibit: false,
      },
      {
        id: "net-c-full-check",
        stepId: "net-c-build",
        kind: "net-full",
        required: true,
        exhibit: true,
      },
    ],
  },
  "NET-R": {
    id: "NET-R",
    order: 5,
    titleKo: "직육면체 전개도",
    exhibitKind: "cuboid",
    stepIds: [
      "net-r-observe",
      "net-r-predict",
      "net-r-correspond",
      "net-r-fix",
      "net-r-complete",
      "net-r-build",
    ],
    firstStepId: "net-r-observe",
    quizzes: [
      {
        id: "net-r-partial-check",
        stepId: "net-r-complete",
        kind: "net-partial",
        required: true,
        exhibit: false,
      },
      {
        id: "net-r-full-check",
        stepId: "net-r-build",
        kind: "net-full",
        required: true,
        exhibit: true,
      },
    ],
  },
};

export const TOPICS: Readonly<Record<TopicId, TopicDefinition>> =
  Object.freeze(TOPIC_DEFINITIONS);

const EMPTY_QUIZ_IDS: readonly string[] = Object.freeze([]);

export function isTopicId(value: unknown): value is TopicId {
  return typeof value === "string" && TOPIC_ORDER.some((id) => id === value);
}

export function findTopic(value: unknown): TopicDefinition | null {
  if (!isTopicId(value)) {
    return null;
  }
  return TOPICS[value] ?? null;
}

export function requiredQuizIds(topicId: unknown): readonly string[] {
  const topic = findTopic(topicId);
  if (topic === null) {
    return EMPTY_QUIZ_IDS;
  }
  return topic.quizzes.map((quiz) => quiz.id);
}
