import { createElement, useEffect, useState, type ReactElement } from "react";

export type QuizFeedbackResult = {
  quizId: string;
  correct: boolean;
  hints: string[];
  displayLines?: string[];
  exhibitUpdated?: boolean;
};

export type FeedbackProps = {
  quizId?: string | null;
  result?: QuizFeedbackResult | null;
  acknowledged?: boolean | null;
  canRetry?: boolean | null;
  onRetry?: ((quizId: string) => void) | null;
  onAcknowledge?: ((quizId: string) => void) | null;
  onContinue?: ((quizId: string) => void) | null;
  onReturnToMap?: (() => void) | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQuizFeedbackResult(value: unknown): value is QuizFeedbackResult {
  if (!isRecord(value)) return false;
  const hints = value.hints;
  return (
    typeof value.quizId === "string" &&
    typeof value.correct === "boolean" &&
    Array.isArray(hints) &&
    hints.every((hint) => typeof hint === "string")
  );
}

function readableLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (line): line is string =>
      typeof line === "string" && line.trim().length > 0,
  );
}

export function Feedback({
  quizId,
  result,
  acknowledged = false,
  canRetry = true,
  onRetry,
  onAcknowledge,
  onContinue,
  onReturnToMap,
}: FeedbackProps): ReactElement {
  const [storeRejected, setStoreRejected] = useState(false);

  useEffect(() => {
    setStoreRejected(false);
  }, [quizId, result]);

  const validQuizId =
    typeof quizId === "string" && quizId.trim().length > 0 ? quizId : null;
  if (validQuizId === null) {
    return createElement(
      "section",
      {
        role: "alert",
        "aria-label": "INVALID_QUIZ_ID",
        "data-code": "INVALID_QUIZ_ID",
      },
      createElement("h2", null, "문제 ID가 없습니다"),
      createElement(
        "p",
        null,
        "결과를 표시할 수 없습니다. 문제를 다시 열어 주세요.",
      ),
    );
  }
  const activeQuizId: string = validQuizId;

  if (result === null || result === undefined) {
    return createElement(
      "section",
      { role: "status", "aria-label": "결과 대기", "data-code": "NO_RESULT" },
      createElement("h2", null, "결과를 기다리는 중입니다"),
      createElement(
        "p",
        null,
        "조작을 마치면 결과와 힌트가 여기에 표시됩니다.",
      ),
    );
  }

  if (!isQuizFeedbackResult(result) || result.quizId !== validQuizId) {
    return createElement(
      "section",
      {
        role: "alert",
        "aria-label": "INVALID_RESULT",
        "data-code": "INVALID_RESULT",
      },
      createElement("h2", null, "결과를 표시할 수 없습니다"),
      createElement(
        "p",
        null,
        "문제와 결과가 일치하지 않습니다. 다시 제출해 주세요.",
      ),
    );
  }

  const hints = readableLines(result.hints);
  const displayLines = readableLines(result.displayLines);
  const retryEnabled = canRetry !== false && typeof onRetry === "function";
  const acknowledgementAvailable = typeof onAcknowledge === "function";

  function acknowledge(): boolean {
    if (acknowledged === true) return true;
    if (!acknowledgementAvailable) return false;
    try {
      const response = onAcknowledge(activeQuizId) as unknown;
      if (response === false || (isRecord(response) && response.ok === false)) {
        setStoreRejected(true);
        return false;
      }
      setStoreRejected(false);
      return true;
    } catch {
      setStoreRejected(true);
      return false;
    }
  }

  function handleRetry(): void {
    setStoreRejected(false);
    if (typeof onRetry === "function") onRetry(activeQuizId);
  }

  function handleContinue(): void {
    if (typeof onContinue !== "function") return;
    if (acknowledge()) onContinue(activeQuizId);
  }

  function handleReturnToMap(): void {
    if (typeof onReturnToMap !== "function") return;
    if (acknowledge()) onReturnToMap();
  }

  const outcomeStyle = result.correct
    ? {
        borderTopWidth: "4px",
        borderTopStyle: "solid" as const,
        borderTopColor: "#1b7f3a",
      }
    : {
        borderTopWidth: "4px",
        borderTopStyle: "dashed" as const,
        borderTopColor: "#b3261e",
      };

  return createElement(
    "section",
    {
      role: "status",
      "aria-live": "polite",
      "aria-label": "결과 확인",
      "data-code": "",
    },
    createElement(
      "div",
      { className: "feedback-outcome", style: outcomeStyle },
      createElement(
        "span",
        { "aria-hidden": "true" },
        result.correct ? "✓" : "✗",
      ),
      createElement(
        "strong",
        null,
        result.correct ? "정답입니다" : "다시 생각해 보세요",
      ),
    ),
    hints.length > 0
      ? createElement(
          "ul",
          { "aria-label": "수정 힌트" },
          hints.map((hint, index) =>
            createElement("li", { key: `${index}:${hint}` }, hint),
          ),
        )
      : null,
    displayLines.length > 0
      ? createElement(
          "ul",
          { "aria-label": "전시 안내" },
          displayLines.map((line, index) =>
            createElement("li", { key: `${index}:${line}` }, line),
          ),
        )
      : null,
    result.exhibitUpdated === true
      ? createElement("p", null, "전시가 갱신되었습니다.")
      : null,
    acknowledged === true
      ? createElement(
          "p",
          { role: "status", "aria-label": "확인됨" },
          "확인됨 결과입니다.",
        )
      : null,
    storeRejected
      ? createElement(
          "p",
          { role: "alert", "aria-label": "STORE_REJECTED" },
          "확인을 저장하지 못했습니다. 결과 화면을 유지합니다. 다시 시도해 주세요.",
        )
      : null,
    createElement(
      "div",
      { role: "group", "aria-label": "결과 조작" },
      createElement(
        "button",
        { type: "button", disabled: !retryEnabled, onClick: handleRetry },
        "다시 하기",
      ),
      typeof onContinue === "function"
        ? createElement(
            "button",
            {
              type: "button",
              disabled: !acknowledgementAvailable,
              onClick: handleContinue,
            },
            "계속",
          )
        : null,
      typeof onReturnToMap === "function"
        ? createElement(
            "button",
            {
              type: "button",
              disabled: !acknowledgementAvailable,
              onClick: handleReturnToMap,
            },
            "목록",
          )
        : null,
    ),
  );
}
export default Feedback;
