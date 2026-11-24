import {
  useEffect,
  useMemo,
  type CSSProperties,
  type ReactElement,
} from "react";
import Viewport from "../scene/Viewport";
import { buildWorldMapScene, disposeWorldMapScene } from "./worldMapScene";

export type TopicSummary = {
  id: string;
  labelKo: string;
  sequence: number;
  completed: boolean;
};

export type WorldMapProps = {
  topics: TopicSummary[];
  onOpenTopic: (topicId: string) => void;
  onOpenGallery: () => void;
};

export const WORLD_MAP_SCENE_ID = "world-map";
const ERROR_TEXT = "MAP_INPUT_INVALID";
const CAMERA_POSITION = [12, 11, 17] as const;
const CAMERA_TARGET = [0, 0.6, 0] as const;

type PreparedMap = {
  error: boolean;
  places: TopicSummary[];
  recommendedId: string | null;
};

function isTopicSummary(value: unknown): value is TopicSummary {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const topic = value as Partial<TopicSummary>;
  return (
    typeof topic.id === "string" &&
    topic.id.trim().length > 0 &&
    typeof topic.labelKo === "string" &&
    topic.labelKo.trim().length > 0 &&
    typeof topic.sequence === "number" &&
    Number.isFinite(topic.sequence) &&
    typeof topic.completed === "boolean"
  );
}

function prepareMap(topics: unknown): PreparedMap {
  if (!Array.isArray(topics) || !topics.every(isTopicSummary)) {
    return { error: true, places: [], recommendedId: null };
  }
  const places = [...topics].sort(
    (left, right) =>
      left.sequence - right.sequence || left.id.localeCompare(right.id),
  );
  return {
    error: false,
    places,
    recommendedId: places.find((topic) => !topic.completed)?.id ?? null,
  };
}

const styles: Record<string, CSSProperties> = {
  section: {
    padding: 16,
    borderRadius: 18,
    background: "#174276",
    color: "#f7fbff",
  },
  header: { display: "flex", gap: 12 },
  title: { margin: 0, fontSize: "1.25rem" },
  gallery: { padding: 10, background: "#f9d66b", color: "#263451" },
  scene: { height: 260, borderRadius: 14 },
  route: { display: "flex", flexWrap: "wrap", gap: 12 },
  place: { minHeight: 92, padding: 10, border: "2px solid #8fb6ff" },
  recommended: { borderColor: "#f9d66b", boxShadow: "0 0 0 3px #f9d66b80" },
  badge: { minWidth: 28, background: "#f7fbff", color: "#17345f" },
  chip: { marginRight: 6, background: "#ffffff30" },
  recommendedChip: { background: "#f9d66b", color: "#263451" },
  empty: { margin: 14, padding: 24, textAlign: "center" },
  error: { padding: 16, border: "2px solid #ffb4a8", color: "#8a2a1b" },
};

function BlockMark({ completed }: { completed: boolean }): ReactElement {
  const background = completed ? "#77d2a3" : "#8fb6ff";
  return (
    <span
      aria-hidden="true"
      style={{ display: "inline-block", width: 24, height: 24, background }}
    />
  );
}

export function WorldMap({
  topics,
  onOpenTopic,
  onOpenGallery,
}: WorldMapProps): ReactElement {
  const prepared = useMemo(() => prepareMap(topics), [topics]);
  const built = useMemo(
    () =>
      prepared.error
        ? null
        : buildWorldMapScene(prepared.places, prepared.recommendedId),
    [prepared],
  );
  useEffect(() => () => disposeWorldMapScene(built?.scene ?? null), [built]);

  if (
    prepared.error ||
    typeof onOpenTopic !== "function" ||
    typeof onOpenGallery !== "function"
  ) {
    return (
      <section
        data-scene-id={WORLD_MAP_SCENE_ID}
        data-testid="map-error"
        role="alert"
        style={styles.error}
      >
        {ERROR_TEXT}
      </section>
    );
  }

  const handlePick = (pickId: string | null): void => {
    if (!pickId) return;
    const topic = prepared.places.find(
      (place) => pickId === "place-" + place.id,
    );
    if (topic) onOpenTopic(topic.id);
  };

  return (
    <section
      data-scene-id={WORLD_MAP_SCENE_ID}
      data-testid="map"
      style={styles.section}
    >
      <div style={styles.header}>
        <h1 style={styles.title}>직육면체 블록 지도</h1>
        <button
          type="button"
          data-testid="map-gallery"
          style={styles.gallery}
          onClick={onOpenGallery}
        >
          전시 보기
        </button>
      </div>

      <div style={styles.scene}>
        <Viewport
          sceneId={WORLD_MAP_SCENE_ID}
          scene={built?.scene ?? null}
          camera={{ position: CAMERA_POSITION, target: CAMERA_TARGET, fov: 50 }}
          pickables={built?.pickables}
          onPick={handlePick}
          ariaLabelKo="직육면체 블록 지도. 장소를 눌러 열고 드래그해 회전하세요."
        />
      </div>

      {prepared.places.length === 0 ? (
        <p style={styles.empty} data-testid="map-empty">
          열 수 있는 장소가 없습니다. 전시는 계속 열 수 있습니다.
        </p>
      ) : (
        <div style={styles.route} data-testid="map-places">
          {prepared.places.map((topic) => {
            const recommended = topic.id === prepared.recommendedId;
            const label =
              topic.labelKo +
              (topic.completed ? " 완료" : "") +
              (recommended ? " 추천" : "");
            const placeStyle = recommended
              ? { ...styles.place, ...styles.recommended }
              : styles.place;
            return (
              <button
                key={topic.id}
                type="button"
                id={recommended ? "map-recommended" : undefined}
                data-testid="map-place"
                data-place-id={"place-" + topic.id}
                data-topic-id={topic.id}
                data-sequence={topic.sequence}
                data-completed={topic.completed}
                data-recommended={recommended}
                aria-label={label}
                style={placeStyle}
                onClick={() => onOpenTopic(topic.id)}
              >
                <span style={styles.badge}>{topic.sequence}</span>
                <BlockMark completed={topic.completed} />
                <strong style={{ display: "block" }}>{topic.labelKo}</strong>
                <span style={{ display: "block" }}>
                  {recommended ? (
                    <span
                      data-testid="map-recommended"
                      style={styles.recommendedChip}
                    >
                      추천
                    </span>
                  ) : null}
                  <span style={styles.chip}>
                    {topic.completed ? "완료" : "아직"}
                  </span>
                  <span style={styles.chip}>{topic.sequence + "번 장소"}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default WorldMap;
