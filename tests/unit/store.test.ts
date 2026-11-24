import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NetLayout } from "../../src/geometry/netLayout";

type StoreModule = typeof import("../../src/progress/store");

class FakeStorage implements Storage {
  private readonly values = new Map<string, string>();
  setItemCalls = 0;
  getItemThrows = false;
  setItemThrows = false;

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    if (this.getItemThrows) throw new Error("read blocked");
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.setItemThrows) throw new Error("write blocked");
    this.setItemCalls += 1;
    this.values.set(key, value);
  }
}

async function loadStore(): Promise<StoreModule> {
  return await import("../../src/progress/store");
}

function cubeNet(): NetLayout {
  const face = (id: string, x: number, y: number) => ({
    id,
    origin: { x, y },
    size: { width: 1, height: 1 },
    quarterTurns: 0 as const,
  });
  return {
    kind: "cube",
    sideLengths: [1, 1, 1],
    faces: [
      face("center", 1, 0),
      face("right", 2, 0),
      face("left", 0, 0),
      face("up", 1, -1),
      face("down", 1, 1),
      face("tail", 1, 2),
    ],
  };
}

describe("progress store", () => {
  let storage: FakeStorage;

  beforeEach(() => {
    vi.resetModules();
    storage = new FakeStorage();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves a step and restores it after reopening the same browser", async () => {
    const first = await loadStore();
    first.setStep("SOLID", "solid-classify");
    expect(storage.setItemCalls).toBe(1);

    vi.resetModules();
    const reopened = await loadStore();
    expect(reopened.getState().topicStates.SOLID?.stepId).toBe(
      "solid-classify",
    );
    expect(reopened.getTopicSummary("SOLID").stepId).toBe("solid-classify");
  });

  it("keeps a submitted result pending until feedback is acknowledged", async () => {
    const store = await loadStore();
    const reasonCodes = ["reopen-distinct-1", "reopen-distinct-2"];
    store.submit({
      quizId: "solid-classify-check",
      correct: true,
      reasonCodes,
    });

    const summary = store.getTopicSummary("SOLID");
    expect(summary.lastResult).toEqual({
      outcome: "correct",
      reasons: reasonCodes,
    });
    expect(summary.awaitingAck).toBe(true);
    expect(summary.complete).toBe(false);
    expect(summary.completed).toBe(false);

    vi.resetModules();
    const reopened = await loadStore();
    expect(reopened.getTopicSummary("SOLID").lastResult).toEqual({
      outcome: "correct",
      reasons: reasonCodes,
    });
  });

  it("earns the completion block after required results are acknowledged", async () => {
    const store = await loadStore();
    store.submit({ quizId: "solid-classify-check", correct: true });
    store.submit({ quizId: "solid-count-check", correct: true });

    expect(store.getTopicSummary("SOLID").complete).toBe(false);
    store.acknowledgeFeedback("solid-classify-check");
    expect(store.getTopicSummary("SOLID").complete).toBe(false);
    store.acknowledgeFeedback("solid-count-check");

    const summary = store.getTopicSummary("SOLID");
    expect(summary.complete).toBe(true);
    expect(summary.completed).toBe(true);
    expect(summary.awaitingAck).toBe(false);
    expect(
      store.getTopicSummaries().find((topic) => !topic.complete)?.topicId,
    ).toBe("SKETCH");

    vi.resetModules();
    const reopened = await loadStore();
    expect(reopened.getTopicSummary("SOLID").complete).toBe(true);
  });

  it("updates an exhibit only for a valid successful build and keeps it after a wrong answer", async () => {
    const store = await loadStore();
    const valid = cubeNet();
    const replacement = cubeNet();
    replacement.faces = replacement.faces.map((face) => ({
      ...face,
      id: `new-${face.id}`,
    }));

    expect(store.getExhibit("cube")).toBeNull();
    store.submit({
      quizId: "net-c-full-check",
      correct: true,
      exhibit: { kind: "cube", layout: valid },
    });
    expect(store.getExhibit("cube")).toEqual(valid);

    store.submit({
      quizId: "net-c-full-check",
      correct: false,
      exhibit: { kind: "cube", layout: replacement },
    });
    expect(store.getExhibit("cube")).toEqual(valid);

    vi.resetModules();
    const reopened = await loadStore();
    expect(reopened.getExhibit("cube")).toEqual(valid);
  });

  it("reports a read failure and starts from an empty snapshot", async () => {
    storage.getItemThrows = true;
    const store = await loadStore();

    expect(store.getState()).toEqual({
      version: 1,
      topicStates: {},
      exhibits: { cube: null, cuboid: null },
    });
    expect(store.getNotice()).toBe(
      "저장된 진행을 복원할 수 없어 새로 시작합니다.",
    );
    expect(storage.setItemCalls).toBe(0);
  });

  it("keeps the current tab state and reports a write failure", async () => {
    storage.setItemThrows = true;
    const store = await loadStore();

    store.setStep("SOLID", "solid-parts");
    expect(store.getState().topicStates.SOLID?.stepId).toBe("solid-parts");
    expect(store.getNotice()).toBe(
      "진행을 저장하지 못했습니다. 다음 접속에 복원할 수 없습니다.",
    );
  });

  it("ignores unknown topics, invalid steps and unknown quizzes without writing", async () => {
    const store = await loadStore();

    store.setStep("UNKNOWN", "solid-intro");
    store.setStep("SOLID", "missing-step");
    store.submit({ quizId: "missing-check", correct: true });

    expect(store.getState()).toEqual({
      version: 1,
      topicStates: {},
      exhibits: { cube: null, cuboid: null },
    });
    expect(storage.setItemCalls).toBe(0);
  });
});
