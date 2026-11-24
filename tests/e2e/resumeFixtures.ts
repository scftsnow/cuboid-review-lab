import type { Page } from "@playwright/test";

export const STORAGE_KEY = "cuboid-review-lab.progress.v1";

type Face = {
  id: string;
  origin: { x: number; y: number };
  size: { width: number; height: number };
  quarterTurns: number;
};

type NetLayout = {
  kind: "cube" | "cuboid";
  sideLengths: [number, number, number];
  faces: Face[];
};

type StoredQuiz = {
  lastResult: {
    quizId: string;
    correct: boolean;
    reasonCodes: string[];
    payload?: { outcome: string };
  } | null;
  awaitingAck: boolean;
  everAcknowledged: boolean;
};

export type Snapshot = {
  version: 1;
  topicStates: Record<
    string,
    { stepId: string; quizzes: Record<string, StoredQuiz> }
  >;
  exhibits: { "NET-C": NetLayout | null; "NET-R": NetLayout | null };
};

function face(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Face {
  return { id, origin: { x, y }, size: { width, height }, quarterTurns: 0 };
}

export const cubeLayout: NetLayout = {
  kind: "cube",
  sideLengths: [1, 1, 1],
  faces: [
    face("F1", 1, 0, 1, 1),
    face("F2", 0, 1, 1, 1),
    face("F3", 1, 1, 1, 1),
    face("F4", 2, 1, 1, 1),
    face("F5", 1, 2, 1, 1),
    face("F6", 1, 3, 1, 1),
  ],
};

export const cuboidLayout: NetLayout = {
  kind: "cuboid",
  sideLengths: [2, 3, 4],
  faces: [
    face("F1", 0, 0, 2, 3),
    face("F2", 0, 3, 2, 4),
    face("F3", 2, 0, 4, 3),
    face("F4", -4, 0, 4, 3),
    face("F5", 0, -4, 2, 4),
    face("F6", 0, 7, 2, 3),
  ],
};

export function emptyExhibits(): Snapshot["exhibits"] {
  return { "NET-C": null, "NET-R": null };
}

export function quiz(
  quizId: string,
  correct: boolean,
  reasonCodes: string[],
  acknowledged: boolean,
): StoredQuiz {
  const outcome = correct ? "correct" : "incorrect";
  return {
    lastResult: { quizId, correct, reasonCodes, payload: { outcome } },
    awaitingAck: !acknowledged,
    everAcknowledged: acknowledged,
  };
}

export async function seed(page: Page, snapshot: Snapshot): Promise<void> {
  await page.goto("/");
  await page.evaluate(
    ({ key, serialized }) => {
      localStorage.removeItem(key);
      localStorage.setItem(key, serialized);
    },
    { key: STORAGE_KEY, serialized: JSON.stringify(snapshot) },
  );
  await page.reload();
}

export async function readSnapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null") as Snapshot,
    STORAGE_KEY,
  );
}
