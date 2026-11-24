import { expect, test, type Page } from "@playwright/test";

const MAP = "[data-testid='map']";
const SOLID_PLACE = MAP + " [data-topic-id='SOLID']";
const PLAYER = "section[aria-label='주제 학습'][data-topic='SOLID']";
const COMPLETION = "[data-testid='topic-complete']";
const FEEDBACK_NAME = "결과 확인";

type StepId = "solid-intro" | "solid-classify" | "solid-parts" | "solid-count";

async function expectStep(page: Page, stepId: StepId): Promise<void> {
  await expect(page.locator(PLAYER + "[data-step='" + stepId + "']")).toHaveCount(1);
}

async function openSolid(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(MAP)).toBeVisible();
  await page.locator(SOLID_PLACE).click();
  await expectStep(page, "solid-intro");
}

async function nextStep(page: Page): Promise<void> {
  await page.getByRole("button", { name: "다음 단계" }).click();
}

async function backToMap(page: Page): Promise<void> {
  await page.locator(PLAYER).getByRole("button", { name: "지도로 돌아가기" }).last().click();
  await expect(page.locator(MAP)).toBeVisible();
}

async function expectPlaceComplete(page: Page, complete: boolean): Promise<void> {
  await expect(page.locator(SOLID_PLACE)).toHaveAttribute(
    "data-completed",
    complete ? "true" : "false",
  );
}

async function expectFeedback(page: Page, outcome: "correct" | "incorrect"): Promise<void> {
  const feedback = page.getByRole("status", { name: FEEDBACK_NAME });
  await expect(feedback).toBeVisible();
  await expect(feedback).toContainText(outcome === "correct" ? "정답입니다" : "다시 생각해 보세요");
}

async function expectNoFeedback(page: Page): Promise<void> {
  await expect(page.getByRole("status", { name: FEEDBACK_NAME })).toHaveCount(0);
}

async function submitClassification(
  page: Page,
  answer: "그 외" | "직육면체" | "정육면체",
  chooseCube: boolean,
): Promise<void> {
  await expect(page.getByTestId("solid-answer-input")).toBeVisible();
  if (chooseCube) await page.getByTestId("solid-example-solid-cube").click();
  await page.getByTestId("solid-answer-" + answer).click();
  await page.getByTestId("solid-submit").click();
}

async function submitCount(page: Page, selectAllParts: boolean): Promise<void> {
  await expect(page.getByTestId("solid-submit")).toBeVisible();
  if (!selectAllParts) {
    await page.getByTestId("solid-submit").click();
    return;
  }
  await page.getByTestId("solid-example-solid-cube").click();
  const parts = page.locator("[data-testid^='solid-part-']");
  for (const part of await parts.all()) await part.dispatchEvent("click");
  await page.getByTestId("solid-submit").click();
}

async function acknowledge(page: Page, next: StepId): Promise<void> {
  await page.getByRole("button", { name: "계속" }).click();
  await expectStep(page, next);
  await expectNoFeedback(page);
}

test("classify wrong answer shows a hint and retry reaches a pending correct result", async ({
  page,
}) => {
  await openSolid(page);
  await nextStep(page);
  await expectStep(page, "solid-classify");

  await submitClassification(page, "그 외", false);
  await expectFeedback(page, "incorrect");
  await expect(page.getByRole("list", { name: "수정 힌트" })).toBeVisible();
  await expect(page.locator(COMPLETION)).toHaveCount(0);

  await page.getByRole("button", { name: "다시 하기" }).click();
  await expect(page.getByTestId("solid-answer-input")).toBeVisible();
  await submitClassification(page, "정육면체", true);
  await expectFeedback(page, "correct");
  await expect(page.getByRole("list", { name: "수정 힌트" })).toHaveCount(0);
  await expect(page.locator(COMPLETION)).toHaveCount(0);

  await acknowledge(page, "solid-parts");
  await backToMap(page);
  await expectPlaceComplete(page, false);
});

test("empty classification answer should not store a pending result", async ({
  page,
}) => {
  test.fixme(
    true,
    "확인된 제품 결함: 정육면체 분류에서 예제와 답을 선택하지 않고 분류 제출을 누르면 확인 대기 오답 결과가 저장된다.",
  );
  await openSolid(page);
  await nextStep(page);
  await page.getByTestId("solid-submit").click();
  await expectNoFeedback(page);
  await expect(page.locator(PLAYER)).toContainText(/선택|답/);
  await backToMap(page);
  await expectPlaceComplete(page, false);
});

test("unacknowledged count result does not complete the topic", async ({
  page,
}) => {
  await openSolid(page);
  await nextStep(page);
  await submitClassification(page, "정육면체", true);
  await acknowledge(page, "solid-parts");

  await submitCount(page, true);
  await expectFeedback(page, "correct");
  await expect(page.locator(COMPLETION)).toHaveCount(0);
  await backToMap(page);
  await expectPlaceComplete(page, false);
});

test("one completion block appears after both acknowledgements and survives resubmission", async ({
  page,
}) => {
  await openSolid(page);
  await nextStep(page);
  await submitClassification(page, "정육면체", true);
  await acknowledge(page, "solid-parts");
  await submitCount(page, true);
  await expectFeedback(page, "correct");
  await expect(page.locator(COMPLETION)).toHaveCount(0);

  await acknowledge(page, "solid-count");
  await expect(page.locator(COMPLETION)).toHaveCount(1);
  await backToMap(page);
  await expectPlaceComplete(page, true);

  await page.locator(SOLID_PLACE).click();
  await expectStep(page, "solid-count");
  await expect(page.locator(COMPLETION)).toHaveCount(1);
  await submitCount(page, false);
  await expectFeedback(page, "incorrect");
  await expect(page.locator(COMPLETION)).toHaveCount(1);
  await backToMap(page);
  await expectPlaceComplete(page, true);
});

test("an unacknowledged result should be restored after reload", async ({
  page,
}) => {
  test.fixme(
    true,
    "확인된 제품 결함: 개수 세기 결과를 제출하고 확인하지 않은 채 지도로 돌아간 뒤 reload하면 같은 단계는 열리지만 확인 대기 결과 화면이 복원되지 않는다.",
  );
  await openSolid(page);
  await nextStep(page);
  await submitClassification(page, "정육면체", true);
  await acknowledge(page, "solid-parts");
  await submitCount(page, true);
  await backToMap(page);
  await page.reload();
  await page.locator(SOLID_PLACE).click();
  await expectStep(page, "solid-parts");
  await expectFeedback(page, "correct");
  await expect(page.locator(COMPLETION)).toHaveCount(0);
});

async function refuseWrites(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("저장 거부", "QuotaExceededError");
    };
  });
}

test("write refusal keeps current feedback usable", async ({ page }) => {
  await refuseWrites(page);
  await openSolid(page);
  await nextStep(page);
  await submitClassification(page, "정육면체", true);
  await expectFeedback(page, "correct");

  await page.getByRole("button", { name: "다시 하기" }).click();
  await expect(page.getByTestId("solid-answer-input")).toBeVisible();
  await expect(page.locator(COMPLETION)).toHaveCount(0);
});

test("write refusal should warn that progress cannot be restored", async ({
  page,
}) => {
  test.fixme(
    true,
    "확인된 제품 결함: 저장 쓰기가 거부된 상태에서 분류 결과를 제출하면 현재 탭 피드백은 유지되지만 복원 불가 안내가 화면에 표시되지 않는다.",
  );
  await refuseWrites(page);
  await openSolid(page);
  await nextStep(page);
  await submitClassification(page, "정육면체", true);
  await expectFeedback(page, "correct");
  await expect(page.getByRole("alert")).toContainText(/저장|복원/);
});
