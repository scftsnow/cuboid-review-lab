import { describe, expect, it } from 'vitest';
import {
  getSolidExample,
  getSolidTopology,
  gradeSolidClassification,
  listSolidExamples,
  type BoxTopology,
  type SolidExample,
  type SolidLabel,
  type SolidResult,
} from '../../src/geometry/solid';

type ExpectedExample = Pick<
  SolidExample,
  'id' | 'kind' | 'label' | 'nameKo' | 'dimensions'
>;

const EXAMPLES: readonly ExpectedExample[] = [
  {
    id: 'solid-cube',
    kind: 'cube',
    label: '정육면체',
    nameKo: '정육면체',
    dimensions: { width: 2, height: 2, depth: 2 },
  },
  {
    id: 'solid-cuboid',
    kind: 'cuboid',
    label: '직육면체',
    nameKo: '직육면체',
    dimensions: { width: 4, height: 2, depth: 3 },
  },
  {
    id: 'solid-cone',
    kind: 'cone',
    label: '그 외',
    nameKo: '원뿔',
    dimensions: null,
  },
  {
    id: 'solid-triangular-prism',
    kind: 'triangular-prism',
    label: '그 외',
    nameKo: '삼각기둥',
    dimensions: null,
  },
];

function expectOk<T>(result: SolidResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('unexpected failure: ' + result.reason);
  }
  return result.value;
}

function pickExample(example: SolidExample): ExpectedExample {
  return {
    id: example.id,
    kind: example.kind,
    label: example.label,
    nameKo: example.nameKo,
    dimensions: example.dimensions,
  };
}

function expectCanonicalTopology(topology: BoxTopology): void {
  expect(topology.counts).toEqual({ faces: 6, edges: 12, vertices: 8 });
  expect(topology.faces).toHaveLength(6);
  expect(topology.edges).toHaveLength(12);
  expect(topology.vertices).toHaveLength(8);

  const faceIds = topology.faces.map((face) => face.id);
  const edgeIds = topology.edges.map((edge) => edge.id);
  const vertexIds = topology.vertices.map((vertex) => vertex.id);
  expect(new Set(faceIds).size).toBe(6);
  expect(new Set(edgeIds).size).toBe(12);
  expect(new Set(vertexIds).size).toBe(8);

  const vertexSet = new Set(vertexIds);
  const edgeSet = new Set(edgeIds);
  for (const edge of topology.edges) {
    expect(new Set(edge.endpoints).size).toBe(2);
    for (const endpoint of edge.endpoints) {
      expect(vertexSet.has(endpoint)).toBe(true);
    }
    expect(edgeSet.has(edge.id)).toBe(true);
  }
  for (const face of topology.faces) {
    expect(new Set(face.vertexIds).size).toBe(4);
    expect(new Set(face.edgeIds).size).toBe(4);
    for (const vertexId of face.vertexIds) {
      expect(vertexSet.has(vertexId)).toBe(true);
    }
    for (const edgeId of face.edgeIds) {
      expect(edgeSet.has(edgeId)).toBe(true);
    }
  }
}

describe('solid examples', () => {
  it('lists cube, cuboid, cone and triangular prism examples', () => {
    const examples = listSolidExamples();

    expect(examples.map(pickExample)).toEqual(EXAMPLES);
    for (const example of examples) {
      expect(example.promptKo.length).toBeGreaterThan(0);
    }
  });

  it('reads every authored example by its exact id', () => {
    for (const expected of EXAMPLES) {
      const example = expectOk(getSolidExample(expected.id));
      expect(pickExample(example)).toEqual(expected);
    }
  });

  it('reports unknown example ids without throwing', () => {
    expect(getSolidExample('')).toEqual({
      ok: false,
      reason: 'UNKNOWN_EXAMPLE',
    });
    expect(getSolidExample('solid-sphere')).toEqual({
      ok: false,
      reason: 'UNKNOWN_EXAMPLE',
    });
  });
});

describe('gradeSolidClassification', () => {
  it('accepts the expected label for all four examples', () => {
    const selections: ReadonlyArray<readonly [string, SolidLabel]> = [
      ['solid-cube', '정육면체'],
      ['solid-cuboid', '직육면체'],
      ['solid-cone', '그 외'],
      ['solid-triangular-prism', '그 외'],
    ];

    for (const [id, selected] of selections) {
      const expected = expectOk(getSolidExample(id)).label;
      expect(expectOk(gradeSolidClassification(id, selected))).toEqual({
        expected,
        selected,
        correct: true,
      });
    }
  });

  it('marks a mismatched cuboid selection incorrect', () => {
    expect(
      expectOk(gradeSolidClassification('solid-cuboid', '정육면체')),
    ).toEqual({
      expected: '직육면체',
      selected: '정육면체',
      correct: false,
    });
  });

  it('rejects invalid selections and unknown examples', () => {
    expect(gradeSolidClassification('solid-cube', '' as SolidLabel)).toEqual({
      ok: false,
      reason: 'INVALID_SELECTION',
    });
    expect(gradeSolidClassification('missing', '그 외')).toEqual({
      ok: false,
      reason: 'UNKNOWN_EXAMPLE',
    });
  });
});

describe('getSolidTopology', () => {
  it('returns canonical counts and unique IDs for cube and cuboid', () => {
    for (const id of ['solid-cube', 'solid-cuboid']) {
      expectCanonicalTopology(expectOk(getSolidTopology(id)));
    }
  });

  it('distinguishes cube faces from non-cubic cuboid faces', () => {
    const cube = expectOk(getSolidTopology('solid-cube'));
    const cuboid = expectOk(getSolidTopology('solid-cuboid'));

    expect(cube.faces.every((face) => face.shape === 'square')).toBe(true);
    expect(cube.faces.every((face) => face.size[0] === face.size[1])).toBe(
      true,
    );
    expect(cuboid.faces.every((face) => face.shape === 'rectangle')).toBe(
      true,
    );
    expect(cuboid.faces.some((face) => face.size[0] !== face.size[1])).toBe(
      true,
    );
  });

  it('uses the same stable ID sets for cube and cuboid', () => {
    const cube = expectOk(getSolidTopology('solid-cube'));
    const cuboid = expectOk(getSolidTopology('solid-cuboid'));

    expect(new Set(cube.faces.map((face) => face.id))).toEqual(
      new Set(cuboid.faces.map((face) => face.id)),
    );
    expect(new Set(cube.edges.map((edge) => edge.id))).toEqual(
      new Set(cuboid.edges.map((edge) => edge.id)),
    );
    expect(new Set(cube.vertices.map((vertex) => vertex.id))).toEqual(
      new Set(cuboid.vertices.map((vertex) => vertex.id)),
    );
  });

  it('rejects unsupported cone and triangular prism topology', () => {
    for (const id of ['solid-cone', 'solid-triangular-prism']) {
      expect(getSolidTopology(id)).toEqual({
        ok: false,
        reason: 'UNSUPPORTED_TOPOLOGY',
      });
    }
  });

  it('rejects unknown topology ids without throwing', () => {
    expect(getSolidTopology('')).toEqual({
      ok: false,
      reason: 'UNKNOWN_EXAMPLE',
    });
  });
});
