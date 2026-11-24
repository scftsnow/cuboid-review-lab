import { type ReactElement } from "react";
import * as THREE from "three";
import { type SolidExample } from "../geometry/solid";
import { Viewport } from "../scene/Viewport";

export type SolidLessonStep = "definition" | "classify" | "parts" | "count";
export type SolidLessonPartKind = "face" | "edge" | "vertex";
export type SolidLessonParts = Record<SolidLessonPartKind, readonly string[]>;

export interface SolidLessonViewProps {
  step: SolidLessonStep;
  examples: readonly SolidExample[];
  exampleId: string | null;
  scene: THREE.Scene;
  pickables: readonly THREE.Object3D[];
  parts: SolidLessonParts;
  answer: string;
  selectedIds: readonly string[];
  onExample: (id: string) => void;
  onAnswer: (answer: string) => void;
  onPick: (id: string | null) => void;
  onClassify: () => void;
  onCount: () => void;
}

const PART_LABEL: Record<SolidLessonPartKind, string> = {
  face: "면",
  edge: "모서리",
  vertex: "꼭짓점",
};
const PART_KINDS: readonly SolidLessonPartKind[] = ["face", "edge", "vertex"];

export function SolidLessonView({
  step,
  examples,
  exampleId,
  scene,
  pickables,
  parts,
  answer,
  selectedIds,
  onExample,
  onAnswer,
  onPick,
  onClassify,
  onCount,
}: SolidLessonViewProps): ReactElement {
  const observing = step === "definition";
  const interactive = step === "parts" || step === "count";
  const selectorExamples = observing
    ? examples.filter((item) => item.kind === "cube" || item.kind === "cuboid")
    : examples;
  const selectorLabel = observing ? "관찰할 도형" : "예제 도형";
  const viewportLabel = observing
    ? "도형을 돌려 보고 면, 모서리, 꼭짓점을 미리 볼 수 있습니다"
    : "도형을 돌려 보고 면, 모서리, 꼭짓점을 누를 수 있습니다";
  const selected = new Set(selectedIds);
  const labels = [...new Set(examples.map((item) => item.label))];

  return (
    <section data-testid="solid-lesson" aria-label="직육면체 복습">
      <h2>직육면체와 정육면체</h2>
      {observing ? (
        <p>
          직육면체는 여섯 개의 직사각형 면으로, 정육면체는 같은 크기의 정사각형
          여섯 개로 둘러싸인 입체입니다. 돌려 보아도 면 6개, 모서리 12개, 꼭짓점
          8개는 같습니다.
        </p>
      ) : null}
      <div role="group" aria-label={selectorLabel}>
        {selectorExamples.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={
              observing
                ? `solid-observe-${item.id}`
                : `solid-example-${item.id}`
            }
            aria-pressed={item.id === exampleId}
            onClick={() => onExample(item.id)}
          >
            {item.nameKo ?? item.label ?? item.id}
          </button>
        ))}
      </div>
      <div data-testid="solid-viewport" style={{ height: 240 }}>
        <Viewport
          sceneId={`solid-${exampleId ?? "none"}`}
          scene={scene}
          camera={{ position: [3, 2.4, 3], target: [0, 0, 0], fov: 45 }}
          pickables={interactive ? pickables : []}
          onPick={onPick}
          ariaLabelKo={viewportLabel}
        />
      </div>
      {step === "classify" ? (
        <div>
          <label htmlFor="solid-answer">새 도형의 이름</label>
          <input
            id="solid-answer"
            data-testid="solid-answer-input"
            value={answer}
            onChange={(event) => onAnswer(event.target.value)}
          />
          <div role="group" aria-label="도형 이름 선택">
            {labels.map((label) => (
              <button
                key={label}
                type="button"
                data-testid={`solid-answer-${label}`}
                onClick={() => onAnswer(label)}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" data-testid="solid-submit" onClick={onClassify}>
            분류 제출
          </button>
        </div>
      ) : null}
      {interactive ? (
        <div>
          <p data-testid="solid-parts-explanation">
            면은 도형의 넓은 겉면, 모서리는 두 면이 만나는 선, 꼭짓점은 세
            모서리가 만나는 점입니다.
          </p>
          {PART_KINDS.map((kind) => (
            <div key={kind}>
              <h3>{PART_LABEL[kind]}</h3>
              {parts[kind].map((id) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`solid-part-${id}`}
                  aria-pressed={selected.has(id)}
                  onClick={() => onPick(id)}
                >
                  {id}
                </button>
              ))}
            </div>
          ))}
          <p data-testid="solid-selected-count">선택 {selectedIds.length}개</p>
          <button type="button" data-testid="solid-submit" onClick={onCount}>
            {step === "count" ? "세기 제출" : "선택 확인"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default SolidLessonView;
