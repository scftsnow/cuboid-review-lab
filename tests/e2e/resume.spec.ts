import { expect, test, type Page } from '@playwright/test';

const STORAGE_KEY = 'cuboid-review-lab.progress.v1';

type Face = { id: string; origin: { x: number; y: number }; size: { width: number; height: number }; quarterTurns: number };
type NetLayout = { kind: 'cube' | 'cuboid'; sideLengths: [number, number, number]; faces: Face[] };
type StoredQuiz = { lastResult: { quizId: string; correct: boolean; reasonCodes: string[]; payload?: { outcome: string } } | null; awaitingAck: boolean; everAcknowledged: boolean };
type Snapshot = { version: 1; topicStates: Record<string, { stepId: string; quizzes: Record<string, StoredQuiz> }>; exhibits: { 'NET-C': NetLayout | null; 'NET-R': NetLayout | null } };

function face(id: string, x: number, y: number, width: number, height: number): Face {
  return { id, origin: { x, y }, size: { width, height }, quarterTurns: 0 };
}

const cubeLayout: NetLayout = {
  kind: 'cube',
  sideLengths: [1, 1, 1],
  faces: [
    face('F1', 1, 0, 1, 1), face('F2', 0, 1, 1, 1), face('F3', 1, 1, 1, 1),
    face('F4', 2, 1, 1, 1), face('F5', 1, 2, 1, 1), face('F6', 1, 3, 1, 1),
  ],
};

const cuboidLayout: NetLayout = {
  kind: 'cuboid',
  sideLengths: [2, 3, 4],
  faces: [
    face('F1', 0, 0, 2, 3), face('F2', 0, 3, 2, 4), face('F3', 2, 0, 4, 3),
    face('F4', -4, 0, 4, 3), face('F5', 0, -4, 2, 4), face('F6', 0, 7, 2, 3),
  ],
};

function emptyExhibits(): Snapshot['exhibits'] {
  return { 'NET-C': null, 'NET-R': null };
}

function quiz(
  quizId: string,
  correct: boolean,
  reasonCodes: string[],
  acknowledged: boolean,
): StoredQuiz {
  const outcome = correct ? 'correct' : 'incorrect';
  return {
    lastResult: { quizId, correct, reasonCodes, payload: { outcome } },
    awaitingAck: !acknowledged,
    everAcknowledged: acknowledged,
  };
}

async function seed(page: Page, snapshot: Snapshot): Promise<void> {
  await page.goto('/');
  await page.evaluate(({ key, serialized }) => {
    localStorage.removeItem(key);
    localStorage.setItem(key, serialized);
  }, { key: STORAGE_KEY, serialized: JSON.stringify(snapshot) });
  await page.reload();
}

async function readSnapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null') as Snapshot,
    STORAGE_KEY,
  );
}

async function openPlace(page: Page, topicId: string): Promise<void> {
  await page.locator(`[data-testid="map-place"][data-topic-id="${topicId}"]`).tap();
}

async function returnToMap(page: Page): Promise<void> {
  await page.getByRole('button', { name: '지도로 돌아가기' }).last().tap();
}

async function foldSignature(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid="gallery-exhibit"] [data-part-id]')
    .evaluateAll(
      (nodes, attrs) =>
        nodes.map((node) =>
          attrs.map((attr) => node.getAttribute(attr)).join(':'),
        ),
      ['data-part-id', 'data-correspondence-id', 'points', 'cx', 'cy', 'x1', 'y1', 'x2', 'y2'],
    );
}

test('저장된 단계는 지도 왕복과 재접속 후에도 유지된다', async ({ page }) => {
  await seed(page, {
    version: 1,
    topicStates: { SOLID: { stepId: 'solid-parts', quizzes: {} } },
    exhibits: emptyExhibits(),
  });

  await openPlace(page, 'SOLID');
  const step = page.locator('section[aria-label="주제 학습"][data-topic="SOLID"]');
  await expect(step).toHaveAttribute('data-step', 'solid-parts');

  await returnToMap(page);
  await expect(page.getByTestId('map')).toBeVisible();
  await page.reload();
  await openPlace(page, 'SOLID');

  await expect(step).toHaveAttribute('data-step', 'solid-parts');
  await expect(step).not.toHaveAttribute('data-step', 'solid-intro');
});

test('마지막 결과와 확인 여부가 복원되고 완료는 확인 후 표시된다', async ({ page }) => {
  await seed(page, {
    version: 1,
    topicStates: {
      FACES: {
        stepId: 'faces-find',
        quizzes: {
          'faces-base-check': quiz('faces-base-check', false, ['BASE_WRONG'], false),
          'faces-relation-check': quiz('faces-relation-check', true, [], true),
        },
      },
    },
    exhibits: emptyExhibits(),
  });

  await openPlace(page, 'FACES');
  const step = page.locator('section[aria-label="주제 학습"][data-topic="FACES"]');
  await expect(step).toHaveAttribute('data-step', 'faces-find');
  await expect(page.getByTestId('topic-complete')).toHaveCount(0);
  const restored = await readSnapshot(page);
  expect(
    restored.topicStates.FACES?.quizzes['faces-base-check']?.lastResult
      ?.reasonCodes,
  ).toEqual(['BASE_WRONG']);

  await page.getByTestId('face-option-fFront').tap();
  await page.getByTestId('faces-submit').tap();
  await expect(page.getByRole('status', { name: '결과 확인' })).toBeVisible();
  await page.getByRole('button', { name: '계속' }).tap();
  await expect(page.getByTestId('topic-complete')).toBeVisible();

  await page.reload();
  await openPlace(page, 'FACES');
  await expect(page.getByTestId('topic-complete')).toBeVisible();
  const after = await readSnapshot(page);
  expect(
    after.topicStates.FACES?.quizzes['faces-base-check']?.everAcknowledged,
  ).toBe(true);
});

test('두 전시 배열은 같은 좌표로 복원되고 오답 후에도 유지된다', async ({ page }) => {
  await seed(page, {
    version: 1,
    topicStates: { 'NET-R': { stepId: 'net-r-build', quizzes: {} } },
    exhibits: { 'NET-C': cubeLayout, 'NET-R': cuboidLayout },
  });

  await page.getByTestId('map-gallery').tap();
  const gallery = page.getByTestId('gallery');
  await expect(gallery).toHaveAttribute('data-kind', 'cuboid');
  await expect(page.getByTestId('gallery-status')).toContainText(
    '같은 면 배치로 다시 접었습니다',
  );
  await expect(
    page.locator('[data-testid="gallery-exhibit"] .fold-view'),
  ).toHaveAttribute('data-fold-ok', 'true');
  const before = await foldSignature(page);

  await returnToMap(page);
  await openPlace(page, 'NET-R');
  await expect(
    page.locator('section[aria-label="주제 학습"][data-topic="NET-R"][data-step="net-r-build"]'),
  ).toBeVisible();
  await page.getByTestId('net-submit').tap();
  await expect(page.getByRole('status', { name: '결과 확인' })).toBeVisible();

  await returnToMap(page);
  await page.getByTestId('map-gallery').tap();
  await expect(gallery).toHaveAttribute('data-kind', 'cuboid');
  expect(await foldSignature(page)).toEqual(before);
  const after = await readSnapshot(page);
  expect(after.exhibits['NET-R']).toEqual(cuboidLayout);

  await page.evaluate(
    ({ key, serialized }) => localStorage.setItem(key, serialized),
    {
      key: STORAGE_KEY,
      serialized: JSON.stringify({
        ...after,
        exhibits: { 'NET-C': cubeLayout, 'NET-R': null },
      }),
    },
  );
  await page.reload();
  await page.getByTestId('map-gallery').tap();
  await expect(gallery).toHaveAttribute('data-kind', 'cube');
  await expect(page.getByTestId('gallery-status')).toContainText(
    '정육면체 전개도를 같은 면 배치로 다시 접었습니다.',
  );
  await expect(
    page.locator('[data-testid="gallery-exhibit"] [data-testid^="fold-face-"]'),
  ).toHaveCount(6);
});

test('저장 실패 시 현재 탭은 진행되고 다음 접속에 복원할 수 없음을 알린다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(
    ({ key, serialized }) => localStorage.setItem(key, serialized),
    {
      key: STORAGE_KEY,
      serialized: JSON.stringify({
        version: 1,
        topicStates: { SOLID: { stepId: 'solid-intro', quizzes: {} } },
        exhibits: emptyExhibits(),
      }),
    },
  );
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (storageKey, value) {
      if (storageKey === key) {
        throw new Error('SAVE_DENIED');
      }
      return original.call(this, storageKey, value);
    };
  }, STORAGE_KEY);
  await page.reload();

  await openPlace(page, 'SOLID');
  const step = page.locator('section[aria-label="주제 학습"][data-topic="SOLID"]');
  await expect(step).toHaveAttribute('data-step', 'solid-intro');
  await page.getByRole('button', { name: '다음 단계' }).tap();
  await expect(step).toHaveAttribute('data-step', 'solid-classify');

  await returnToMap(page);
  await expect(page.getByTestId('storage-notice')).toContainText(
    '다음 접속에 복원할 수 없습니다',
  );

  const nextPage = await page.context().newPage();
  await nextPage.goto('/');
  await openPlace(nextPage, 'SOLID');
  const nextStep = nextPage.locator('section[aria-label="주제 학습"][data-topic="SOLID"]');
  await expect(nextStep).toHaveAttribute('data-step', 'solid-intro');
  await nextPage.close();
});
