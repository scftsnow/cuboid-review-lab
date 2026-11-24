import { expect, test, type Page } from "@playwright/test";

const FACE_IDS = [
  "fBack",
  "fFront",
  "fBottom",
  "fTop",
  "fLeft",
  "fRight",
] as const;
const EDGE_IDS = [
  "eBackBottom",
  "eBackRight",
  "eBackTop",
  "eBackLeft",
  "eFrontBottom",
  "eFrontRight",
  "eFrontTop",
  "eFrontLeft",
  "eBottomLeft",
  "eBottomRight",
  "eTopLeft",
  "eTopRight",
] as const;
const VERTEX_IDS = [
  "v000",
  "v100",
  "v110",
  "v010",
  "v001",
  "v101",
  "v111",
  "v011",
] as const;
const ALL_IDS = [...FACE_IDS, ...EDGE_IDS, ...VERTEX_IDS].sort();
const CLASSIFICATIONS = [
  { id: "solid-cube", label: "정육면체" },
  { id: "solid-cuboid", label: "직육면체" },
  { id: "solid-cone", label: "그 외" },
] as const;

async function isVisible(
  locator: ReturnType<Page["getByTestId"]>,
): Promise<boolean> {
  return locator.isVisible().catch(() => false);
}

async function acknowledgeFeedback(page: Page): Promise<void> {
  const ack = page
    .getByRole("status", { name: "결과 확인" })
    .getByRole("button", { name: "계속" });
  await expect(ack).toBeVisible();
  await ack.click();
}

function quizFeedback(page: Page) {
  return page.getByRole("status", { name: "결과 확인" });
}

async function advanceUntil(
  page: Page,
  target: ReturnType<Page["getByTestId"]>,
): Promise<void> {
  for (
    let attempt = 0;
    attempt < 8 && !(await isVisible(target));
    attempt += 1
  ) {
    const next = page.getByRole("button", { name: "다음 단계" });
    if (!(await isVisible(next))) break;
    await next.click();
  }
  await expect(target).toBeVisible();
}

async function stablePartIds(page: Page): Promise<string[]> {
  const ids = await page
    .locator('[data-testid^="solid-part-"]')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("data-testid") ?? "")
        .filter((value) => value.startsWith("solid-part-"))
        .map((value) => value.slice("solid-part-".length))
        .sort(),
    );
  return ids;
}

test("분류 확인 후 구성 요소를 회전 전후 같은 ID로 세고 두 결과 확인 후 완료한다", async ({
  page,
}) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      // 저장 접근이 막힌 브라우저에서도 현재 화면 검증을 계속한다.
    }
  });
  await page.goto("/");

  const directLink = page.getByTestId("world-topic-SOLID");
  if (await isVisible(directLink)) {
    await directLink.click();
  } else {
    await page
      .getByRole("button", { name: /직육면체|정육면체/ })
      .first()
      .click();
  }
  await expect(page.locator('[data-topic="SOLID"]')).toBeVisible();
  await expect(page.locator('[data-testid^="solid-part-"]')).toHaveCount(0);

  await advanceUntil(page, page.getByTestId("solid-answer-input"));
  for (const { id, label } of CLASSIFICATIONS) {
    await expect(page.getByTestId(`solid-example-${id}`)).toBeVisible();
    await expect(page.getByTestId(`solid-answer-${label}`)).toBeVisible();
  }
  await page.getByTestId("solid-example-solid-cuboid").click();
  await page.getByTestId("solid-answer-직육면체").click();
  await page.getByTestId("solid-submit").click();
  await expect(quizFeedback(page)).toBeVisible();
  await expect(quizFeedback(page)).toContainText("정답입니다");
  await expect(page.locator('[data-testid^="solid-part-"]')).toHaveCount(0);
  await expect(page.getByTestId("topic-complete")).toHaveCount(0);
  await acknowledgeFeedback(page);

  const player = page.locator('[data-topic="SOLID"]');
  await expect(player).toHaveAttribute("data-step", "solid-parts");
  await expect(page.getByTestId("solid-example-solid-cuboid")).toBeVisible();
  await expect(page.getByTestId(`solid-part-${FACE_IDS[0]}`)).toBeVisible();
  expect(await stablePartIds(page)).toEqual(ALL_IDS);
  await expect(page.getByTestId("solid-submit")).toHaveCount(0);

  const viewport = page.getByTestId("viewport").first();
  const canvas = viewport.locator("canvas");
  const dragTarget = (await isVisible(canvas)) ? canvas : viewport;
  const box = await dragTarget.boundingBox();
  expect(box).not.toBeNull();
  const centerX = box!.x + box!.width / 2;
  const centerY = box!.y + box!.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 90, centerY + 35, { steps: 8 });
  await page.mouse.up();

  expect(await stablePartIds(page)).toEqual(ALL_IDS);

  await page.getByRole("button", { name: "다음 단계" }).click();
  await expect(player).toHaveAttribute("data-step", "solid-count");
  await expect(page.getByTestId("solid-submit")).toBeVisible();
  expect(await stablePartIds(page)).toEqual(ALL_IDS);

  for (const id of ALL_IDS) {
    await page.getByTestId(`solid-part-${id}`).click();
  }
  await expect(page.getByTestId("solid-selected-count")).toHaveText(
    "선택 26개",
  );
  await page.getByTestId("solid-submit").click();
  await expect(quizFeedback(page)).toBeVisible();
  await expect(quizFeedback(page)).toContainText("정답입니다");
  await expect(page.getByTestId("topic-complete")).toHaveCount(0);
  await acknowledgeFeedback(page);
  await expect(page.getByTestId("topic-complete")).toHaveCount(1);
  await expect(page.getByTestId("topic-complete")).toContainText("완료 블록");
});
