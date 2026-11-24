import { useEffect, useState } from "react";
import { edgeKey } from "../geometry/sketch";
import type {
  EdgeStyle,
  SketchEdgeMap,
  SketchPoint,
  SketchTarget,
  SketchView,
} from "../geometry/sketch";
import { SketchBoardCanvas } from "./SketchBoardCanvas";

type LockedEdgeMap = Record<string, EdgeStyle | boolean>;
type SketchBoardErrorCode = "INVALID_POINT_ID" | "LOCKED_EDGE";
type BoardPoint = Omit<SketchPoint, "id"> & { id?: string; pointId?: string };
type BoardTarget = SketchTarget & { solidId?: string };
const pointIdOf = (point: BoardPoint): string =>
  point.id ?? point.pointId ?? "";
export interface SketchBoardProps {
  points: BoardPoint[];
  lockedEdges: LockedEdgeMap;
  edges?: SketchEdgeMap;
  onEdgesChange?: (edges: SketchEdgeMap) => void;
  disabled?: boolean;
  target?: BoardTarget | string;
  fixedView?: SketchView | string;
  onChange?: (edges: SketchEdgeMap) => void;
  onError?: (code: SketchBoardErrorCode) => void;
}

type Position = { x: number; y: number };
function normalizeMap(
  value: LockedEdgeMap | SketchEdgeMap | undefined,
): SketchEdgeMap {
  const result: SketchEdgeMap = {};
  for (const [key, style] of Object.entries(value ?? {})) {
    result[key] = style === true ? "solid" : style === false ? "dashed" : style;
  }
  return result;
}
function positionsFor(points: BoardPoint[]): Map<string, Position> {
  const columns = Math.max(Math.ceil(Math.sqrt(points.length)), 1);
  return new Map(
    points.map((point, index) => [
      pointIdOf(point),
      typeof point.x === "number" && typeof point.y === "number"
        ? { x: point.x, y: point.y }
        : {
            x: 50 + (index % columns) * 90,
            y: 50 + Math.floor(index / columns) * 90,
          },
    ]),
  );
}
export function SketchBoard({
  points,
  lockedEdges,
  edges,
  onEdgesChange,
  disabled = false,
  target,
  fixedView,
  onChange,
  onError,
}: SketchBoardProps) {
  const locked = normalizeMap(lockedEdges);
  const controlled = edges !== undefined;
  const [internalEdges, setInternalEdges] = useState<SketchEdgeMap>(() =>
    normalizeMap(edges ?? lockedEdges),
  );
  const [lineStyle, setLineStyle] = useState<EdgeStyle>("solid");
  const [firstPointId, setFirstPointId] = useState<string | null>(null);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<SketchBoardErrorCode | null>(null);

  const currentEdges = controlled ? normalizeMap(edges) : internalEdges;
  const problem = Object.keys(locked).length > 0 ? "partial" : "full";
  const positions = positionsFor(points);
  const targetId =
    typeof target === "string"
      ? target
      : (target?.id ?? target?.solidId ?? points[0]?.solidId ?? "");
  const viewId =
    typeof fixedView === "string" ? fixedView : (fixedView?.id ?? "");

  useEffect(() => {
    if (!controlled) setInternalEdges(normalizeMap(lockedEdges));
    setFirstPointId(null);
    setSelectedEdgeKey(null);
    setErrorCode(null);
  }, [lockedEdges, controlled]);
  function reportError(code: SketchBoardErrorCode) {
    setErrorCode(code);
    onError?.(code);
  }
  function commit(next: SketchEdgeMap) {
    const merged = { ...locked, ...next };
    if (!controlled) setInternalEdges(merged);
    (onEdgesChange ?? onChange)?.(merged);
  }
  function handlePointClick(pointId: string) {
    if (disabled) return;
    if (!points.some((point) => pointIdOf(point) === pointId)) {
      reportError("INVALID_POINT_ID");
      return;
    }
    setErrorCode(null);
    if (firstPointId === null) {
      setFirstPointId(pointId);
      setSelectedEdgeKey(null);
      return;
    }
    if (firstPointId === pointId) {
      setFirstPointId(null);
      return;
    }
    const key = edgeKey(firstPointId, pointId);
    setFirstPointId(null);
    if (key in locked) {
      reportError("LOCKED_EDGE");
      return;
    }
    setSelectedEdgeKey(key);
    commit({ ...currentEdges, [key]: lineStyle });
  }
  function handleEdgeClick(key: string, isLocked: boolean) {
    if (disabled) return;
    if (isLocked) {
      reportError("LOCKED_EDGE");
      return;
    }
    setErrorCode(null);
    setSelectedEdgeKey(key);
    setFirstPointId(null);
  }
  function chooseStyle(style: EdgeStyle) {
    if (disabled) return;
    setLineStyle(style);
    setErrorCode(null);
    if (selectedEdgeKey !== null && !(selectedEdgeKey in locked)) {
      commit({ ...currentEdges, [selectedEdgeKey]: style });
    }
  }

  function removeSelectedEdge() {
    if (disabled) return;
    if (selectedEdgeKey === null || selectedEdgeKey in locked) {
      reportError("LOCKED_EDGE");
      return;
    }
    const next = { ...currentEdges };
    delete next[selectedEdgeKey];
    setSelectedEdgeKey(null);
    setErrorCode(null);
    commit(next);
  }

  const status =
    errorCode === "LOCKED_EDGE"
      ? "잠긴 선은 바꿀 수 없어요."
      : errorCode === "INVALID_POINT_ID"
        ? "점판에 없는 점이에요."
        : firstPointId
          ? "다른 점을 눌러 선을 완성하세요."
          : "두 점을 눌러 선을 긋고, 선을 골라 종류를 바꾸세요.";

  return (
    <section
      className="sketch-board"
      data-testid="sketch-board"
      data-problem={problem}
      data-target-id={targetId}
    >
      <div className="sketch-board-info">
        <span
          data-testid="sketch-target"
          data-kind={typeof target === "object" ? "sketch" : "review"}
        >
          대상 도형: {targetId || "직육면체"}
        </span>
        <span data-testid="sketch-fixed-view" data-fixed-view-id={viewId}>
          기준 시점: {viewId || "기준"}
        </span>
      </div>

      <div className="sketch-style-controls" role="group" aria-label="선 종류">
        <button
          type="button"
          data-testid="sketch-line-style"
          data-style="solid"
          aria-pressed={lineStyle === "solid"}
          disabled={disabled}
          onClick={() => chooseStyle("solid")}
        >
          실선 · 보이는 모서리
        </button>
        <button
          type="button"
          data-testid="sketch-line-style"
          data-style="dashed"
          aria-pressed={lineStyle === "dashed"}
          disabled={disabled}
          onClick={() => chooseStyle("dashed")}
        >
          점선 · 가려진 모서리
        </button>
        <button
          type="button"
          data-testid="sketch-edge-remove"
          disabled={
            disabled || selectedEdgeKey === null || selectedEdgeKey in locked
          }
          onClick={removeSelectedEdge}
        >
          선택 선 지우기
        </button>
      </div>

      <p className="sketch-style-note">
        현재 선 종류:{" "}
        <strong data-testid="sketch-current-style">
          {lineStyle === "solid" ? "실선" : "점선"}
        </strong>
      </p>

      <SketchBoardCanvas
        positions={positions}
        currentEdges={currentEdges}
        locked={locked}
        firstPointId={firstPointId}
        selectedEdgeKey={selectedEdgeKey}
        disabled={disabled}
        onPointClick={handlePointClick}
        onEdgeClick={handleEdgeClick}
      />

      <p
        className="sketch-board-status"
        data-testid="sketch-status"
        data-error-code={errorCode ?? ""}
        role="status"
      >
        {status}
      </p>
    </section>
  );
}

export default SketchBoard;
