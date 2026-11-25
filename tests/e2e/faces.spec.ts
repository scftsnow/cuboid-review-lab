import { expect, test, type Locator, type Page } from "@playwright/test";

// prettier-ignore
const IDS = ["fBack", "fFront", "fBottom", "fTop", "fLeft", "fRight"] as const;
type FaceId = (typeof IDS)[number];
type Category = "opposite" | "side" | "parallel" | "perpendicular";

const CATEGORY_LABELS: Record<Category, string> = {
  opposite: "다른 밑면",
  side: "옆면",
  parallel: "평행인 면",
  perpendicular: "수직인 면",
};
const BASE_CATEGORIES: readonly Category[] = ["opposite", "side"];
const RELATION_CATEGORIES: readonly Category[] = ["parallel", "perpendicular"];
const BASE_HINT =
  "마주 보는 면 하나를 먼저 찾고, 나머지 네 면을 옆면으로 고르세요.";
const RELATION_HINT =
  "마주 보는 면은 평행이고, 만나서 직각인 네 면은 수직입니다.";
// prettier-ignore
const OPPOSITE: Record<FaceId, FaceId> = { fBack: "fFront", fFront: "fBack", fBottom: "fTop", fTop: "fBottom", fLeft: "fRight", fRight: "fLeft" };
const SIDES = Object.fromEntries(
  IDS.map((id) => [
    id,
    IDS.filter((other) => other !== id && other !== OPPOSITE[id]),
  ]),
) as unknown as Record<FaceId, readonly FaceId[]>;

function step(page: Page, id: string): Locator {
  return page.locator('[data-topic="FACES"][data-step="' + id + '"]');
}
function resultPanel(page: Page): Locator {
  return page.getByRole("status", { name: "결과 확인" });
}
function categoryGroup(page: Page, category: Category): Locator {
  return page.getByTestId("faces-category-" + category);
}
function faceOption(page: Page, category: Category, id: FaceId): Locator {
  return page.getByTestId(category + "-face-option-" + id);
}
// prettier-ignore
async function expectPressed(locator: Locator): Promise<void> { await expect(locator).toHaveAttribute("aria-pressed", "true"); }
async function tap(locator: Locator): Promise<void> {
  await locator.tap();
}
async function openFaces(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await tap(page.getByRole("button", { name: /면의 성질/ }));
  await expect(page.getByTestId("faces-lesson")).toBeVisible();
  await expect(step(page, "faces-base")).toBeVisible();
}
async function advanceToQuiz(
  page: Page,
  categories: readonly Category[],
): Promise<void> {
  const marker = categoryGroup(page, categories[0]);
  for (let attempt = 0; attempt < 8 && !(await marker.isVisible()); attempt++) {
    const next = page.getByRole("button", { name: "다음 단계" });
    if (!(await next.isVisible())) break;
    await tap(next);
  }
  await expect(marker).toBeVisible();
  for (const category of categories) {
    await expect(categoryGroup(page, category)).toContainText(
      CATEGORY_LABELS[category],
    );
  }
}
async function chooseBase(page: Page, base: FaceId): Promise<void> {
  await tap(page.getByTestId("base-face-" + base));
  await expectPressed(page.getByTestId("base-face-" + base));
}
async function pick(page: Page, category: Category, id: FaceId): Promise<void> {
  const option = faceOption(page, category, id);
  await tap(option);
  await expectPressed(option);
}
// prettier-ignore
async function pickAll(page: Page, category: Category, ids: readonly FaceId[]): Promise<void> { for (const id of ids) await pick(page, category, id); }
async function submit(page: Page): Promise<void> {
  await tap(page.getByTestId("faces-submit"));
}
async function retryQuiz(page: Page): Promise<void> {
  await tap(page.getByRole("button", { name: "다시 하기" }));
}
async function continueQuiz(page: Page): Promise<void> {
  await tap(page.getByRole("button", { name: "계속" }));
}
async function expectCorrect(page: Page): Promise<void> {
  await expect(resultPanel(page)).toContainText("정답입니다");
  await expect(resultPanel(page)).toContainText(
    "기준 면에 맞는 면을 모두 찾았습니다.",
  );
}
async function expectWrong(
  page: Page,
  missing: number,
  extra: number,
  hint: string,
): Promise<void> {
  await expect(resultPanel(page)).toContainText("다시 생각해 보세요");
  await expect(resultPanel(page)).toContainText(
    `빠진 면 ${missing}개, 잘못 선택한 면 ${extra}개가 있습니다.`,
  );
  await expect(resultPanel(page)).toContainText(hint);
}
async function rotateViewport(page: Page): Promise<void> {
  const viewport = page.getByTestId("faces-viewport");
  const canvas = viewport.locator("canvas");
  const target = (await canvas.isVisible()) ? canvas : viewport;
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 30, { steps: 6 });
  await page.mouse.up();
}
async function answerBaseQuiz(page: Page, base: FaceId): Promise<void> {
  await chooseBase(page, base);
  await pick(page, "opposite", OPPOSITE[base]);
  await pickAll(page, "side", SIDES[base]);
  await submit(page);
}
async function answerRelationQuiz(page: Page, base: FaceId): Promise<void> {
  await chooseBase(page, base);
  await pick(page, "parallel", OPPOSITE[base]);
  await pickAll(page, "perpendicular", SIDES[base]);
  await submit(page);
}

test.describe("FACES", () => {
  test.describe.configure({ timeout: 120_000 });

  test("회전 후에도 기준 면과 밑면·옆면 범주가 유지된다", async ({ page }) => {
    await openFaces(page);
    await advanceToQuiz(page, BASE_CATEGORIES);
    await tap(page.getByTestId("solid-kind-cube"));
    await expectPressed(page.getByTestId("solid-kind-cube"));
    await chooseBase(page, "fTop");
    await rotateViewport(page);
    await expectPressed(page.getByTestId("base-face-fTop"));
    await expect(page.getByTestId("faces-question")).toContainText(
      "윗면(fTop)",
    );
    await pick(page, "opposite", "fBottom");
    await expect(faceOption(page, "opposite", "fBottom")).toHaveText("아랫면");
    await pickAll(page, "side", SIDES.fTop);
    await expect(faceOption(page, "side", "fLeft")).toHaveText("왼쪽 면");
    await submit(page);
    await expectCorrect(page);
    await expect(page.getByTestId("topic-complete")).toHaveCount(0);
  });

  test("밑면 범주가 바뀌면 집합 ID가 같아도 오답이 되고 수정할 수 있다", async ({
    page,
  }) => {
    await openFaces(page);
    await advanceToQuiz(page, BASE_CATEGORIES);
    await chooseBase(page, "fFront");
    await submit(page);
    await expectWrong(page, 5, 0, BASE_HINT);
    await retryQuiz(page);
    await chooseBase(page, "fFront");
    await pick(page, "side", "fBack");
    await pick(page, "opposite", "fBottom");
    await pickAll(page, "side", ["fTop", "fLeft", "fRight"]);
    await submit(page);
    await expectWrong(page, 2, 2, BASE_HINT);
    await retryQuiz(page);
    await answerBaseQuiz(page, "fFront");
    await expectCorrect(page);
  });

  test("평행·수직 설명 후 새 기준 면을 유지한다", async ({ page }) => {
    await openFaces(page);
    await advanceToQuiz(page, BASE_CATEGORIES);
    await answerBaseQuiz(page, "fTop");
    await expectCorrect(page);
    await continueQuiz(page);
    await expect(step(page, "faces-relations")).toBeVisible();
    await expect(page.getByTestId("faces-explain")).toContainText(
      "마주 보는 두 면은 평행하고, 이웃한 면은 만나서 직각이 됩니다.",
    );
    await advanceToQuiz(page, RELATION_CATEGORIES);
    await chooseBase(page, "fLeft");
    await expect(page.getByTestId("faces-question")).toContainText(
      "왼쪽 면(fLeft)",
    );
    await expect(page.getByTestId("faces-question")).toContainText(
      "평행인 면 1개와 수직인 면 4개",
    );
    await pick(page, "parallel", "fRight");
    await expect(faceOption(page, "parallel", "fRight")).toHaveText(
      "오른쪽 면",
    );
    await pickAll(page, "perpendicular", SIDES.fLeft);
    await submit(page);
    await expectCorrect(page);
    await expect(page.getByTestId("topic-complete")).toHaveCount(0);
  });

  test("평행 범주가 바뀌면 오답이고 확인 후 완료 블록이 유지된다", async ({
    page,
  }) => {
    await openFaces(page);
    await advanceToQuiz(page, BASE_CATEGORIES);
    await answerBaseQuiz(page, "fFront");
    await expectCorrect(page);
    await continueQuiz(page);
    await advanceToQuiz(page, RELATION_CATEGORIES);
    await chooseBase(page, "fLeft");
    await pick(page, "perpendicular", "fRight");
    await pick(page, "parallel", "fBottom");
    await pickAll(page, "perpendicular", ["fTop", "fBack", "fFront"]);
    await submit(page);
    await expectWrong(page, 2, 2, RELATION_HINT);
    await retryQuiz(page);
    await answerRelationQuiz(page, "fLeft");
    await expectCorrect(page);
    await expect(page.getByTestId("topic-complete")).toHaveCount(0);
    await continueQuiz(page);
    await expect(page.getByTestId("topic-complete")).toHaveCount(1);
    await answerRelationQuiz(page, "fTop");
    await expectCorrect(page);
    await expect(page.getByTestId("topic-complete")).toHaveCount(1);
    await tap(page.getByRole("button", { name: "지도로 돌아가기" }));
    await tap(page.getByRole("button", { name: /면의 성질/ }));
    await expect(page.getByTestId("topic-complete")).toHaveCount(1);
  });
});
