import { useState, type ReactElement } from "react";
import FacesLesson from "../lesson/FacesLesson";
import NetLesson from "../lesson/NetLesson";
import SketchLesson from "../lesson/SketchLesson";
import SolidLesson from "../lesson/SolidLesson";
import TopicPlayer from "../lesson/TopicPlayer";
import type * as Player from "../lesson/TopicPlayer";
import { findTopic, TOPIC_ORDER, type TopicId } from "../lesson/topics";
import Gallery from "../map/Gallery";
import WorldMap, { type TopicSummary as MapSummary } from "../map/WorldMap";
import * as store from "../progress/store";

type Screen =
  | { kind: "map" }
  | { kind: "topic"; topicId: TopicId; stepId?: string }
  | { kind: "gallery"; galleryKind: "cube" | "cuboid" };
type MapView = { topics: MapSummary[]; notice: string | null };
// prettier-ignore
type PendingResult = { awaitingAck: true; quizId?: string; correct: boolean; outcome?: string; reasons: string[]; reasonCodes: string[]; reason?: string; hint?: string };
// prettier-ignore
type SavedResult = { correct?: boolean; reason?: string; reasonCodes?: string[]; outcome?: string; reasons?: string[] };
// prettier-ignore
type NetResults = Record<string,{lastResult:{reasons:readonly string[]}}>;
type AppProgressStore = Player.ProgressStore & {
  getPendingResult(topicId: string, quizId: string): PendingResult | null;
};

const INVALID_ROUTE_NOTICE =
  "선택한 장소를 열 수 없습니다. 지도에서 다시 골라 주세요.";
const MAP_REFRESH_NOTICE =
  "저장된 진행을 다시 읽지 못했습니다. 지금 화면 상태로 계속합니다.";

function safeNotice(): string | null {
  try {
    return store.getNotice();
  } catch {
    return null;
  }
}

function readMapView(): MapView {
  let stored: store.TopicSummary[];
  let notice: string | null;
  try {
    stored = store.getTopicSummaries();
    notice = store.getNotice();
  } catch {
    stored = [];
    notice = safeNotice() ?? MAP_REFRESH_NOTICE;
  }
  return {
    topics: TOPIC_ORDER.map((topicId, index) => {
      const found = stored.find((summary) => summary.id === topicId);
      return {
        id: topicId,
        labelKo: found?.labelKo ?? findTopic(topicId)?.titleKo ?? topicId,
        sequence: found?.sequence ?? index + 1,
        completed: found?.completed ?? false,
      };
    }),
    notice,
  };
}

function topicSpecFor(topicId: TopicId) {
  const topic = findTopic(topicId);
  if (topic === null) return null;
  return {
    id: topic.id,
    steps: [...topic.stepIds],
    requiredQuizIds: topic.quizzes.map((quiz) => quiz.id),
    stepQuizIds: Object.fromEntries(
      topic.quizzes.map((quiz) => [quiz.stepId, quiz.id]),
    ),
  };
}

function toSubmitInput(result: Player.LessonSubmission): store.SubmitInput {
  const codes = Array.isArray(result.reasonCodes) ? result.reasonCodes : [];
  const reasonCodes = [
    ...new Set(
      [...codes, result.reason, result.hint].filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      ),
    ),
  ];
  return {
    quizId: result.quizId,
    stepId: typeof result.stepId === "string" ? result.stepId : undefined,
    correct: result.correct === true,
    reason: result.reason ?? result.hint,
    reasonCodes,
    netLayout: result.netLayout as store.SubmitInput["netLayout"],
    exhibit: result.exhibit as store.SubmitInput["exhibit"],
  };
}

function pendingResult(record: SavedResult): PendingResult {
  const reasonCodes = record.reasonCodes ?? record.reasons ?? [];
  const reason = record.reason ?? reasonCodes[0];
  return {
    awaitingAck: true,
    correct: record.correct ?? record.outcome === "correct",
    outcome: record.outcome,
    reason,
    hint: reason,
    reasons: [...reasonCodes],
    reasonCodes: [...reasonCodes],
  };
}

const progressStore: AppProgressStore = {
  setStep(topicId, stepId) {
    store.setStep(topicId, stepId);
    return true;
  },
  submit(result) {
    store.submit(toSubmitInput(result));
    return true;
  },
  acknowledgeFeedback(quizId) {
    store.acknowledgeFeedback(quizId);
    return true;
  },
  getPendingResult(topicId, quizId): PendingResult | null {
    try {
      const record =
        store.getState().topicStates[topicId as TopicId]?.results[quizId];
      if (record === undefined || !record.awaitingAck) return null;
      return pendingResult(record.lastResult as SavedResult);
    } catch {
      return null;
    }
  },
  getTopicSummary(topicId) {
    return store.getTopicSummary(topicId);
  },
  isComplete(topicId) {
    return store.isComplete(topicId);
  },
  getNotice() {
    return store.getNotice();
  },
};

function netTopicState(topicId: TopicId) {
  const state = store.getState().topicStates[topicId];
  if (state === undefined) return null;
  const results: NetResults = {};
  for (const [quizId, record] of Object.entries(state.results)) {
    if (record)
      results[quizId] = { lastResult: { reasons: record.lastResult.reasons } };
  }
  return { stepId: state.stepId, results };
}

function buildLessons(activeTopicId: TopicId): Player.LessonRegistry {
  // prettier-ignore
  const netLesson = (props: Player.LessonProps) => (<NetLesson topicId={props.topicId} stepId={props.stepId} quizId={props.quizId} topicState={netTopicState(activeTopicId)} onStepChange={store.setStep} onSubmit={(payload) => props.onSubmit({ ...payload })} onAcknowledge={store.acknowledgeFeedback} />);
  return {
    // prettier-ignore
    SOLID: (props: Player.LessonProps) => (<SolidLesson topicId={props.topicId} stepId={props.stepId} quizId={props.quizId} onSubmit={(result) => props.onSubmit({ ...result })} />),
    SKETCH: (props: Player.LessonProps) => <SketchLesson {...props} />,
    FACES: (props: Player.LessonProps) => <FacesLesson {...props} />,
    "NET-C": netLesson,
    "NET-R": netLesson,
  };
}

export function App(): ReactElement {
  const [screen, setScreen] = useState<Screen>({ kind: "map" });
  const [view, setView] = useState<MapView>(readMapView);
  const topics = view.topics;
  const notice = view.notice;

  function setNoticeText(value: string | null): void {
    setView((current) => ({ ...current, notice: value }));
  }

  function showMap(value: string | null = safeNotice()): void {
    setNoticeText(value);
    setScreen({ kind: "map" });
  }

  function returnToMap(): void {
    setView(readMapView());
    setScreen({ kind: "map" });
  }

  function openTopic(topicId: string): void {
    const topic = findTopic(topicId);
    if (topic === null) {
      showMap(INVALID_ROUTE_NOTICE);
      return;
    }
    try {
      const summary = store.getTopicSummary(topic.id);
      const stepId = topic.stepIds.find((id) => id === summary.stepId);
      if (stepId === undefined) {
        showMap(INVALID_ROUTE_NOTICE);
        return;
      }
      setNoticeText(safeNotice());
      setScreen({ kind: "topic", topicId: topic.id, stepId });
    } catch {
      showMap(INVALID_ROUTE_NOTICE);
    }
  }

  function openGallery(): void {
    let galleryKind: "cube" | "cuboid" = "cube";
    try {
      if (store.getExhibit("cuboid") !== null) galleryKind = "cuboid";
      setNoticeText(safeNotice());
    } catch {
      setNoticeText(INVALID_ROUTE_NOTICE);
    }
    setScreen({ kind: "gallery", galleryKind });
  }

  let content: ReactElement;
  if (screen.kind === "topic") {
    // prettier-ignore
    content = (<TopicPlayer topicId={screen.topicId} resumeStepId={screen.stepId} topicSpec={topicSpecFor(screen.topicId)} store={progressStore} lessons={buildLessons(screen.topicId)} onReturnToMap={returnToMap} />);
  } else if (screen.kind === "gallery") {
    content = (
      <Gallery galleryKind={screen.galleryKind} onBackToMap={returnToMap} />
    );
  } else {
    // prettier-ignore
    content = (<WorldMap topics={topics} onOpenTopic={openTopic} onOpenGallery={openGallery} />);
  }

  return (
    <main className="app">
      {notice === null ? null : (
        <p className="app__notice" data-testid="storage-notice" role="alert">
          {notice}
        </p>
      )}
      {content}
    </main>
  );
}

export default App;
