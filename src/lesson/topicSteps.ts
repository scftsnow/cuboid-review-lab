export type TopicStepInput =
  | string
  | {
      id: string;
      labelKo?: string;
      label?: string;
      description?: string;
      quizId?: string;
      kind?: string;
    };

export type TopicSpec = {
  id?: string;
  steps?: readonly TopicStepInput[];
  stepIds?: readonly string[];
  requiredQuizIds?: readonly string[];
  stepQuizIds?: Readonly<Record<string, string>>;
  quizzes?: readonly { id?: string; stepId?: string }[];
};

export type NormalStep = {
  id: string;
  label: string;
  description: string;
  quizId?: string;
  kind: string;
};

function quizMapOf(spec: TopicSpec): Record<string, string> {
  const map: Record<string, string> = { ...(spec.stepQuizIds ?? {}) };
  for (const quiz of spec.quizzes ?? []) {
    if (quiz.id && quiz.stepId) map[quiz.stepId] = quiz.id;
  }
  return map;
}

function findQuizId(
  stepId: string,
  quizMap: Record<string, string>,
  declared: boolean,
  required: readonly string[],
): string | undefined {
  const mapped = quizMap[stepId];
  if (mapped) return mapped;
  if (!declared && required.includes(stepId)) return stepId;
  return undefined;
}

function normalizeStep(
  input: TopicStepInput,
  index: number,
  total: number,
  quizMap: Record<string, string>,
  declared: boolean,
  required: readonly string[],
): NormalStep {
  const raw = typeof input === "string" ? { id: input } : input;
  const quizId =
    quizMap[raw.id] ??
    raw.quizId ??
    findQuizId(raw.id, quizMap, declared, required);
  const label = raw.labelKo ?? raw.label ?? raw.id;
  const kind = quizId
    ? "quiz"
    : (raw.kind ??
      (index === 0 ? "explain" : index === total - 1 ? "result" : "inquiry"));
  return {
    id: raw.id,
    label,
    description: raw.description ?? "",
    quizId,
    kind,
  };
}

export function normalizeSteps(spec: TopicSpec): NormalStep[] {
  const raw = spec.steps ?? spec.stepIds ?? [];
  const required = spec.requiredQuizIds ?? [];
  const quizMap = quizMapOf(spec);
  const declared = spec.stepQuizIds !== undefined || spec.quizzes !== undefined;
  return raw.map((step, index) =>
    normalizeStep(step, index, raw.length, quizMap, declared, required),
  );
}
