import { describe, expect, it } from "vitest";
import { deriveSketchEdges, gradeSketch } from "../../src/geometry/sketch";

type EdgeStyle = "solid" | "dashed";
type EdgeKey = string;

interface SketchPoint {
  id: string;
}

interface SketchEdge {
  a: string;
  b: string;
  style?: EdgeStyle;
}

interface SketchQuestion {
  target: { id?: string; edges?: SketchEdge[] } | string;
  fixedView: string;
  points: SketchPoint[];
  lockedEdges?: Record<string, EdgeStyle>;
  hiddenEdges?: string[];
}

interface EdgeMapResult {
  ok: boolean;
  reasons: string[];
  edges: Record<EdgeKey, EdgeStyle>;
}

interface GradeResult extends EdgeMapResult {
  missing: EdgeKey[];
  extra: EdgeKey[];
  wrongStyle: EdgeKey[];
}

const points: SketchPoint[] = Array.from({ length: 8 }, (_, index) => ({
  id: `p${index}`,
}));

const frontEdges: Record<EdgeKey, EdgeStyle> = {
  "p0|p1": "solid",
  "p1|p2": "solid",
  "p0|p3": "solid",
  "p2|p3": "solid",
  "p0|p4": "solid",
  "p1|p5": "solid",
  "p2|p6": "solid",
  "p3|p7": "solid",
  "p4|p5": "dashed",
  "p5|p6": "dashed",
  "p4|p7": "dashed",
  "p6|p7": "dashed",
};

const keyOf = (a: string, b: string): EdgeKey => [a, b].sort().join("|");
const frontEntries = Object.entries(frontEdges) as Array<[EdgeKey, EdgeStyle]>;
const allFrontEdges = frontEntries.map(([key, style]) => {
  const [a, b] = key.split("|");
  return { a, b, style };
});
const hiddenEdges = frontEntries
  .filter(([, style]) => style === "dashed")
  .map(([key]) => key);

const frontQuestion = (
  lockedEdges?: Record<string, EdgeStyle>,
): SketchQuestion => ({
  target: {
    id: "front",
    edges: frontEntries.map(([key]) => {
      const [a, b] = key.split("|");
      return { a, b };
    }),
  },
  fixedView: "front",
  points,
  hiddenEdges,
  lockedEdges,
});

const mapResult = (question: SketchQuestion): EdgeMapResult =>
  deriveSketchEdges(question) as unknown as EdgeMapResult;

const gradeResult = (
  question: SketchQuestion,
  submission: SketchEdge[],
): GradeResult => gradeSketch(question, submission) as unknown as GradeResult;

describe("sketch-geometry v1 front view", () => {
  it("publishes the fixed-view edge map with solid and dashed visibility", () => {
    const result = mapResult(frontQuestion());

    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.edges).toEqual(frontEdges);
  });

  it("accepts a full drawing regardless of edge direction and input order", () => {
    const reversed = [...allFrontEdges]
      .reverse()
      .map(({ a, b, style }) => ({ a: b, b: a, style }));
    const result = gradeResult(frontQuestion(), reversed);

    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.edges).toEqual(frontEdges);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
    expect(result.wrongStyle).toEqual([]);
  });

  it("keeps locked lines in the expected map for a partial drawing", () => {
    const lockedKeys = ["p0|p1", "p1|p2", "p0|p3", "p2|p3"];
    const lockedEdges = Object.fromEntries(
      lockedKeys.map((key) => [key, "solid" as EdgeStyle]),
    );
    const question = frontQuestion(lockedEdges);
    const derived = mapResult(question);
    const submitted = allFrontEdges.filter(
      ({ a, b }) => !lockedKeys.includes(keyOf(a, b)),
    );
    const partial = gradeResult(question, submitted);
    const complete = gradeResult(question, allFrontEdges);

    expect(derived.ok).toBe(true);
    expect(derived.edges).toEqual(frontEdges);
    expect(Object.keys(derived.edges)).toHaveLength(12);
    for (const key of lockedKeys) {
      expect(derived.edges[key]).toBe("solid");
    }
    expect(partial.ok).toBe(false);
    expect(partial.missing).toEqual([...lockedKeys].sort());
    expect(partial.extra).toEqual([]);
    expect(partial.wrongStyle).toEqual([]);
    expect(complete.ok).toBe(true);
    expect(complete.reasons).toEqual([]);
    expect(complete.edges).toEqual(frontEdges);
  });

  it("separates missing, extra and wrong-style edges with matching hints", () => {
    const result = gradeResult(frontQuestion(), [
      { a: "p0", b: "p1", style: "solid" },
      { a: "p4", b: "p5", style: "solid" },
      { a: "p0", b: "p5", style: "solid" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual([]);
    expect(result.edges).toEqual(frontEdges);
    expect(result.missing.length).toBeGreaterThan(0);
    expect(result.missing).not.toContain("p0|p1");
    expect(result.missing).not.toContain("p4|p5");
    expect(result.extra).toContain("p0|p5");
    expect(result.wrongStyle).toContain("p4|p5");
    expect(result.edges["p4|p5"]).toBe("dashed");
  });

  it("reports invalid points and unknown edge endpoints distinctly", () => {
    const empty = gradeResult(
      { target: "front", fixedView: "front", points: [] },
      [],
    );
    const duplicate = gradeResult(
      {
        target: { id: "front", edges: [{ a: "p0", b: "p1" }] },
        fixedView: "front",
        points: [{ id: "p0" }, { id: "p0" }],
      },
      [],
    );
    const unknown = gradeResult(
      {
        target: { id: "front", edges: [{ a: "p0", b: "missing" }] },
        fixedView: "front",
        points: [{ id: "p0" }, { id: "p1" }],
      },
      [],
    );

    expect(empty.ok).toBe(false);
    expect(empty.reasons).toEqual(["INVALID_POINTS"]);
    expect(duplicate.ok).toBe(false);
    expect(duplicate.reasons).toEqual(["DUPLICATE_POINT"]);
    expect(unknown.ok).toBe(false);
    expect(unknown.reasons).toEqual(["UNKNOWN_POINT"]);
  });
});
