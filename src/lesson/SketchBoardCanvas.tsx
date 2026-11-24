import type { SketchEdgeMap } from "../geometry/sketch";

interface Position {
  x: number;
  y: number;
}

export interface SketchBoardCanvasProps {
  positions: ReadonlyMap<string, Position>;
  currentEdges: Readonly<SketchEdgeMap>;
  locked: Readonly<SketchEdgeMap>;
  firstPointId: string | null;
  selectedEdgeKey: string | null;
  disabled: boolean;
  onPointClick: (pointId: string) => void;
  onEdgeClick: (key: string, isLocked: boolean) => void;
}

function viewBoxFor(positions: ReadonlyMap<string, Position>): string {
  const values = Array.from(positions.values());
  if (values.length === 0) return "0 0 320 240";
  const xs = values.map((position) => position.x);
  const ys = values.map((position) => position.y);
  const minX = Math.min(...xs) - 40;
  const minY = Math.min(...ys) - 40;
  const width = Math.max(Math.max(...xs) - Math.min(...xs) + 80, 1);
  const height = Math.max(Math.max(...ys) - Math.min(...ys) + 80, 1);
  return [minX, minY, width, height].join(" ");
}

export function SketchBoardCanvas({
  positions,
  currentEdges,
  locked,
  firstPointId,
  selectedEdgeKey,
  disabled,
  onPointClick,
  onEdgeClick,
}: SketchBoardCanvasProps) {
  return (
    <svg
      className="sketch-board-svg"
      data-testid="sketch-board-svg"
      viewBox={viewBoxFor(positions)}
      role="group"
      aria-label="겨냥도 점판"
    >
      {Object.entries(currentEdges).map(([key, style]) => {
        const [a, b] = key.split("|");
        const from = positions.get(a);
        const to = positions.get(b);
        if (!from || !to) return null;
        const isLocked = key in locked;
        return (
          <g
            key={key}
            data-testid="sketch-edge"
            data-edge-key={key}
            data-line-style={style}
            data-locked={isLocked}
            data-selected={selectedEdgeKey === key}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label={
              a + "에서 " + b + "까지 " + (style === "solid" ? "실선" : "점선")
            }
            onClick={() => onEdgeClick(key, isLocked)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onEdgeClick(key, isLocked);
              }
            }}
          >
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={isLocked ? "#64748b" : "#111827"}
              strokeWidth={selectedEdgeKey === key ? 8 : 5}
              strokeDasharray={style === "dashed" ? "12 9" : undefined}
              strokeLinecap="round"
              pointerEvents="none"
            />
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="transparent"
              strokeWidth={26}
              pointerEvents="stroke"
            />
          </g>
        );
      })}

      {Array.from(positions.keys()).map((pointId) => {
        const position = positions.get(pointId);
        if (!position) return null;
        return (
          <g
            key={pointId}
            data-testid="sketch-point"
            data-point-id={pointId}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label={"점 " + pointId}
            onClick={() => onPointClick(pointId)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onPointClick(pointId);
              }
            }}
          >
            <circle
              cx={position.x}
              cy={position.y}
              r={14}
              fill={firstPointId === pointId ? "#f59e0b" : "#ffffff"}
              stroke="#111827"
              strokeWidth={3}
            />
            <text
              x={position.x}
              y={position.y + 5}
              textAnchor="middle"
              fontSize="14"
              fill="#111827"
              pointerEvents="none"
            >
              {pointId}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default SketchBoardCanvas;
