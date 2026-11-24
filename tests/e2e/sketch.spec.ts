import { expect, test, type Page } from "@playwright/test";
const REGION = 'section[aria-label="주제 학습"][data-topic="SKETCH"]';
type Step =
  | "sketch-view"
  | "sketch-predict"
  | "sketch-fix"
  | "sketch-partial"
  | "sketch-full";
type Style = "solid" | "dashed";
const BOARD = '[data-testid="sketch-board"]';
const FIXED = '[data-testid="sketch-fixed-view"]';
const ENTRY = '[data-topic-id="SKETCH"], button:has-text("겨냥도")';
const FIXED_VIEW = "front";
const TARGET = "cuboid-sketch-1";
const SOLID = "p1-p2 p2-p3 p3-p4 p4-p1 p1-p5 p2-p6 p3-p7".split(" ");
const DASHED = "p5-p6 p6-p7 p7-p8 p8-p5 p4-p8".split(" ");
const region = (page: Page) => page.locator(REGION);
const testId = (id: string) => '[data-testid="sketch-' + id + '"]';
const keyOf = (a: string, b: string) => [a, b].sort().join("|");
const point = (page: Page, id: string) =>
  region(page).locator(testId("point") + '[data-point-id="' + id + '"]');
const edge = (page: Page, key: string) =>
  region(page).locator(testId("edge") + '[data-edge-key="' + key + '"]');
const status = (page: Page) =>
  region(page).getByRole("status", { name: "결과 확인" });
async function expectStep(page: Page, step: Step): Promise<void> {
  await expect(region(page)).toHaveAttribute("data-step", step);
}
async function expectFixed(page: Page): Promise<void> {
  const board = region(page).locator(BOARD);
  const fixed = region(page).locator(FIXED);
  await expect(fixed).toHaveAttribute("data-fixed-view-id", FIXED_VIEW);
  await expect(board).toHaveAttribute("data-target-id", TARGET);
}
async function openSketch(
  page: Page,
  expectedStep: Step = "sketch-view",
): Promise<void> {
  await page.goto("/");
  await page.locator(ENTRY).first().click();
  await expect(region(page)).toBeVisible();
  await expectStep(page, expectedStep);
  await expectFixed(page);
}
async function nextStep(page: Page): Promise<void> {
  await region(page).getByRole("button", { name: "다음 단계" }).click();
}
async function mapReturn(page: Page): Promise<void> {
  await region(page).getByRole("button", { name: "지도로 돌아가기" }).click();
  await expect(region(page)).toHaveCount(0);
}
async function chooseStyle(page: Page, style: Style): Promise<void> {
  const button = region(page).locator(
    testId("line-style") + '[data-style="' + style + '"]',
  );
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}
async function draw(page: Page, pair: string): Promise<void> {
  const [from, to] = pair.split("-");
  await point(page, from).dispatchEvent("click");
  await point(page, to).dispatchEvent("click");
  await expect(edge(page, keyOf(from, to))).toHaveCount(1);
}
async function submit(page: Page): Promise<void> {
  await region(page).locator(testId("submit")).click();
}
async function expectStatus(
  page: Page,
  text: string,
  detail?: string,
): Promise<void> {
  const feedback = status(page);
  await expect(feedback).toBeVisible();
  await expect(feedback).toContainText(text);
  if (detail !== undefined) await expect(feedback).toContainText(detail);
  await expect(feedback.getByRole("button", { name: "계속" })).toBeVisible();
  await expect(
    feedback.getByRole("button", { name: "다시 하기" }),
  ).toBeVisible();
}
async function acknowledge(page: Page): Promise<void> {
  await status(page).getByRole("button", { name: "계속" }).click();
  await expect(status(page)).toHaveCount(0);
}
async function retry(page: Page): Promise<void> {
  await status(page).getByRole("button", { name: "다시 하기" }).click();
  await expect(status(page)).toHaveCount(0);
}
async function repair(page: Page): Promise<void> {
  const section = region(page).locator(testId("repair"));
  const board = region(page).locator(BOARD);
  const guidance = region(page).locator(testId("repair-guidance"));
  await expectStep(page, "sketch-fix");
  await expect(section).toBeVisible();
  await expect(board).toHaveAttribute("data-problem", "partial");
  await expect(edge(page, "p1|p2")).toHaveAttribute("data-locked", "true");
  await expect(edge(page, "p2|p3")).toHaveAttribute("data-locked", "false");
  await expect(edge(page, "p2|p3")).toHaveAttribute(
    "data-line-style",
    "dashed",
  );
  await expect(guidance).toContainText("p2|p3");
  await edge(page, "p2|p3").dispatchEvent("click");
  await chooseStyle(page, "solid");
  await expect(edge(page, "p2|p3")).toHaveAttribute("data-line-style", "solid");
  await expect(guidance).toContainText("가시 모서리는 실선");
  await expect(region(page).locator(testId("submit"))).toHaveCount(0);
}
async function reachRepair(page: Page): Promise<void> {
  await openSketch(page);
  await nextStep(page);
  await expectStep(page, "sketch-predict");
  await nextStep(page);
  await repair(page);
}
async function reachPartial(page: Page): Promise<void> {
  await reachRepair(page);
  await nextStep(page);
  await expectStep(page, "sketch-partial");
  await expect(region(page).locator(testId("partial"))).toBeVisible();
  await expectFixed(page);
}
async function completePartial(page: Page): Promise<void> {
  await reachPartial(page);
  await submit(page);
  await expectStatus(page, "SKETCH_MISSING_EDGE", "p1|p4");
  await retry(page);
  await chooseStyle(page, "solid");
  await draw(page, "p4-p1");
  await expect(edge(page, "p1|p4")).toHaveCount(1);
  await submit(page);
  await expectStatus(page, "SKETCH_OK", "가시 모서리는 실선");
  await acknowledge(page);
  await expectStep(page, "sketch-full");
  await expect(region(page).locator(testId("full"))).toBeVisible();
}
async function reachFull(page: Page): Promise<void> {
  await completePartial(page);
  const board = region(page).locator(BOARD);
  await expect(board).toHaveAttribute("data-problem", "full");
  await expectFixed(page);
}
async function drawFull(page: Page): Promise<void> {
  await chooseStyle(page, "solid");
  for (const pair of SOLID) await draw(page, pair);
  const [from, to] = DASHED[0].split("-");
  await draw(page, from + "-" + to);
  await edge(page, keyOf(from, to)).dispatchEvent("click");
  await chooseStyle(page, "dashed");
  for (const pair of DASHED.slice(1)) await draw(page, pair);
  const edges = region(page).locator(BOARD + " " + testId("edge"));
  await expect(edges).toHaveCount(12);
}
test("SKETCH observes, predicts, and repairs", async ({ page }) => {
  await openSketch(page);
  await expect(region(page).locator(testId("model"))).toBeVisible();
  const canvas = region(page).locator("canvas");
  const before = await canvas.screenshot();
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("Missing sketch canvas");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 30, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => !(await canvas.screenshot()).equals(before))
    .toBe(true);
  await expectFixed(page);
  await nextStep(page);
  await expectStep(page, "sketch-predict");
  const predict = region(page).locator(testId("predict"));
  await expect(predict).toBeVisible();
  const reveal = predict.locator(testId("reveal"));
  await expect(reveal).toHaveAttribute("aria-pressed", "false");
  await reveal.click();
  await expect(reveal).toHaveAttribute("aria-pressed", "true");
  await expect(predict.locator(BOARD)).toBeVisible();
  await expectFixed(page);
  await nextStep(page);
  await repair(page);
  await nextStep(page);
  await expectStep(page, "sketch-partial");
});
test("SKETCH retries a missing partial edge", async ({ page }) => {
  await completePartial(page);
  await expect(region(page).getByTestId("topic-complete")).toHaveCount(0);
});
test("SKETCH rejects an empty full board", async ({ page }) => {
  await reachFull(page);
  const edges = region(page).locator(BOARD + " " + testId("edge"));
  await expect(edges).toHaveCount(0);
  await submit(page);
  await expectStatus(
    page,
    "SKETCH_EMPTY_ANSWER",
    "두 점을 눌러 선을 하나 이상",
  );
  await expect(region(page).getByTestId("topic-complete")).toHaveCount(0);
  await retry(page);
  await expectStep(page, "sketch-full");
});
test("SKETCH rejects a wrong line style", async ({ page }) => {
  await reachFull(page);
  await drawFull(page);
  await edge(page, "p1|p2").dispatchEvent("click");
  await chooseStyle(page, "dashed");
  await expect(edge(page, "p1|p2")).toHaveAttribute(
    "data-line-style",
    "dashed",
  );
  await submit(page);
  await expectStatus(page, "실선과 점선을 다시 확인하세요", "p1|p2");
  await expect(region(page).getByTestId("topic-complete")).toHaveCount(0);
});
test("SKETCH reports an extra edge on the full board", async ({ page }) => {
  await reachFull(page);
  await drawFull(page);
  await chooseStyle(page, "solid");
  await draw(page, "p1-p3");
  await expect(edge(page, "p1|p3")).toHaveAttribute("data-line-style", "solid");
  await submit(page);
  await expectStatus(page, "SKETCH_EXTRA_EDGE", "p1|p3");
  await expect(region(page).getByTestId("topic-complete")).toHaveCount(0);
});
test("SKETCH restores completion after reload", async ({ page }) => {
  await reachFull(page);
  await drawFull(page);
  await submit(page);
  await expectStatus(page, "SKETCH_OK");
  const complete = region(page).getByTestId("topic-complete");
  await expect(complete).toHaveCount(0);
  await acknowledge(page);
  await expect(complete).toHaveCount(1);
  await mapReturn(page);
  await openSketch(page, "sketch-full");
  await expect(complete).toHaveCount(1);
  await expectFixed(page);
  await page.reload();
  await page.locator(ENTRY).first().click();
  await expectStep(page, "sketch-full");
  await expect(complete).toHaveCount(1);
  await mapReturn(page);
});
