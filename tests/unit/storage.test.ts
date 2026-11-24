import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROGRESS_STORAGE_KEY,
  loadProgress,
  saveProgress,
  type ProgressSnapshotV1,
} from "../../src/progress/storage";

type StorageMock = {
  getItem: ReturnType<typeof vi.fn<(key: string) => string | null>>;
  setItem: ReturnType<typeof vi.fn<(key: string, value: string) => void>>;
};

function snapshot(): ProgressSnapshotV1 {
  return {
    version: 1,
    topicStates: {
      SOLID: { stepId: "solid-intro", quizzes: {} },
      SKETCH: { stepId: "sketch-view", quizzes: {} },
      FACES: { stepId: "faces-base", quizzes: {} },
      "NET-C": { stepId: "net-c-observe", quizzes: {} },
      "NET-R": { stepId: "net-r-observe", quizzes: {} },
    },
    exhibits: { "NET-C": null, "NET-R": null },
  };
}

function errorKeys(result: unknown): string[] {
  if (typeof result !== "object" || result === null || !("error" in result)) {
    return [];
  }
  return Object.keys((result as { error: object }).error).sort();
}

const storage: StorageMock = {
  getItem: vi.fn<(key: string) => string | null>(),
  setItem: vi.fn<(key: string, value: string) => void>(),
};

beforeEach(() => {
  storage.getItem.mockReset();
  storage.setItem.mockReset();
  storage.getItem.mockImplementation(() => null);
  storage.setItem.mockImplementation(() => undefined);
  vi.stubGlobal("localStorage", storage);
});

describe("loadProgress", () => {
  it("returns null for an absent app key", () => {
    expect(loadProgress()).toEqual({ ok: true, value: null });
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(
      PROGRESS_STORAGE_KEY,
    );
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("returns a valid version 1 snapshot", () => {
    const value = snapshot();
    storage.getItem.mockReturnValue(JSON.stringify(value));

    expect(loadProgress()).toEqual({ ok: true, value });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("accepts an empty sparse legacy snapshot as raw JSON", () => {
    const sparse = { version: 1, topicStates: {}, exhibits: {} };
    storage.getItem.mockReturnValue(JSON.stringify(sparse));

    expect(loadProgress()).toEqual({ ok: true, value: sparse });
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(
      PROGRESS_STORAGE_KEY,
    );
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("reports invalid JSON as a schema failure without exposing raw text", () => {
    storage.getItem.mockReturnValue("student-secret:not json");

    const result = loadProgress();

    expect(result).toEqual({
      ok: false,
      error: {
        phase: "schema",
        code: "STORAGE_SCHEMA_INVALID",
        observedVersion: null,
      },
    });
    expect(JSON.stringify(result)).not.toContain("student-secret");
    expect(errorKeys(result)).toEqual(["code", "observedVersion", "phase"]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("reports an unsupported version and a non-object schema with observedVersion", () => {
    storage.getItem.mockReturnValue(
      JSON.stringify({ version: 2, topicStates: {}, exhibits: {} }),
    );
    expect(loadProgress()).toEqual({
      ok: false,
      error: {
        phase: "schema",
        code: "STORAGE_SCHEMA_INVALID",
        observedVersion: 2,
      },
    });

    storage.getItem.mockReturnValue(
      JSON.stringify({ version: 1, topicStates: [], exhibits: {} }),
    );
    expect(loadProgress()).toEqual({
      ok: false,
      error: {
        phase: "schema",
        code: "STORAGE_SCHEMA_INVALID",
        observedVersion: 1,
      },
    });
    expect(errorKeys(loadProgress())).toEqual([
      "code",
      "observedVersion",
      "phase",
    ]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("reports storage access failure without writing", () => {
    storage.getItem.mockImplementation(() => {
      throw new Error("access denied");
    });

    expect(loadProgress()).toEqual({
      ok: false,
      error: {
        phase: "access",
        code: "STORAGE_ACCESS_FAILED",
        observedVersion: null,
      },
    });
    expect(errorKeys(loadProgress())).toEqual([
      "code",
      "observedVersion",
      "phase",
    ]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe("saveProgress", () => {
  it("writes a valid snapshot once under the app key", () => {
    const value = snapshot();

    expect(saveProgress(value)).toEqual({ ok: true });
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(
      PROGRESS_STORAGE_KEY,
      JSON.stringify(value),
    );
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it("reports a rejected write with its version", () => {
    storage.setItem.mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    expect(saveProgress(snapshot())).toEqual({
      ok: false,
      error: {
        phase: "write",
        code: "STORAGE_WRITE_FAILED",
        observedVersion: 1,
      },
    });
    expect(errorKeys(saveProgress(snapshot()))).toEqual([
      "code",
      "observedVersion",
      "phase",
    ]);
  });
});
