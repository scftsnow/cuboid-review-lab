import {
  edgeKey,
  type EdgeStyle,
  type SketchQuestion,
} from "../geometry/sketch";

export type BoardStep = "repair" | "partial" | "full";
export type BoardPoint = {
  pointId: string;
  vertexId: string;
  x: number;
  y: number;
};
export type EdgeMap = Record<string, EdgeStyle>;
export type QuestionConfig = {
  question: SketchQuestion;
  locked: EdgeMap;
  initial: EdgeMap;
};

export const FIXED_VIEW = "front";
export const TARGET = { solidId: "cuboid-sketch-1", kind: "cuboid" as const };
export const VIEW = { id: FIXED_VIEW, direction: [0, 0, 1] as const };

const POINT_DATA: ReadonlyArray<readonly [string, string, number, number]> = [
  ["p1", "v1", 70, 80],
  ["p2", "v2", 230, 80],
  ["p3", "v3", 230, 210],
  ["p4", "v4", 70, 210],
  ["p5", "v5", 120, 40],
  ["p6", "v6", 280, 40],
  ["p7", "v7", 280, 170],
  ["p8", "v8", 120, 170],
];
export const POINTS: BoardPoint[] = POINT_DATA.map(
  ([pointId, vertexId, x, y]) => ({ pointId, vertexId, x, y }),
);

type EdgeData = ReadonlyArray<readonly [string, string, EdgeStyle]>;

const ALL_EDGES: EdgeData = [
  ["p1", "p2", "solid"],
  ["p2", "p3", "solid"],
  ["p3", "p4", "solid"],
  ["p4", "p1", "solid"],
  ["p5", "p6", "dashed"],
  ["p6", "p7", "dashed"],
  ["p7", "p8", "dashed"],
  ["p8", "p5", "dashed"],
  ["p1", "p5", "solid"],
  ["p2", "p6", "solid"],
  ["p3", "p7", "solid"],
  ["p4", "p8", "dashed"],
];
const PARTIAL_EDGES = ALL_EDGES.slice(0, 4);
const REPAIR_EDGES = ALL_EDGES.slice(0, 2);

function answerMap(edges: EdgeData): EdgeMap {
  return Object.fromEntries(
    edges.map(([a, b, style]) => [edgeKey(a, b), style]),
  );
}

function questionFor(edges: EdgeData, locked: EdgeMap): SketchQuestion {
  return {
    target: {
      id: TARGET.solidId,
      edges: edges.map(([a, b, style]) => ({ a, b, style })),
    },
    fixedView: FIXED_VIEW,
    points: POINTS.map(({ pointId, x, y }) => ({ id: pointId, x, y })),
    lockedEdges: locked,
    answer: answerMap(edges),
  };
}

function configFor(
  edges: EdgeData,
  locked: EdgeMap,
  initial: EdgeMap = locked,
): QuestionConfig {
  return { locked, initial, question: questionFor(edges, locked) };
}

const PARTIAL_LOCKED = answerMap(PARTIAL_EDGES.slice(0, 3));
const REPAIR_LOCKED = answerMap(REPAIR_EDGES.slice(0, 1));
const REPAIR_INITIAL: EdgeMap = {
  ...answerMap(REPAIR_EDGES),
  [edgeKey("p2", "p3")]: "dashed",
};

export const QUESTIONS: Record<BoardStep, QuestionConfig> = {
  repair: configFor(REPAIR_EDGES, REPAIR_LOCKED, REPAIR_INITIAL),
  partial: configFor(PARTIAL_EDGES, PARTIAL_LOCKED),
  full: configFor(ALL_EDGES, {}),
};
