import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120000);

type Topic = "NET-C" | "NET-R";
type Placement = readonly [number, number, number, number?];

async function highlightIds(page: Page): Promise<string[]> {
  return page.locator(".net-board-root [data-highlighted-2d]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-part-id") ?? ""),
  );
}

async function openTopic(page: Page, topic: Topic): Promise<void> {
  await page.goto("/");
  await page.locator(`[data-topic-id="${topic}"]`).click();
  await expect(page.locator('section[aria-label="주제 학습"]')).toBeVisible();
}

async function acknowledge(page: Page): Promise<void> {
  const feedback = page.getByRole("status", { name: "결과 확인" });
  await expect(feedback).toBeVisible();
  await feedback.getByRole("button", { name: "계속" }).click();
}

async function retryFeedback(page: Page): Promise<void> {
  const feedback = page.getByRole("status", { name: "결과 확인" });
  await expect(feedback).toBeVisible();
  await feedback.getByRole("button", { name: "다시 하기" }).click();
}

async function submit(page: Page, correct: boolean, hint?: RegExp): Promise<void> {
  await page.getByTestId("net-submit").click();
  const feedback = page.getByRole("status", { name: "결과 확인" });
  await expect(feedback).toContainText(correct ? "정답입니다" : "다시 생각해 보세요");
  if (hint) await expect(feedback.locator('ul[aria-label="수정 힌트"]')).toContainText(hint);
}

async function gotoStep(page: Page, step: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const net = page.locator("[data-net-lesson]");
    if ((await net.getAttribute("data-step")) === step) return;
    if (await page.getByTestId("net-submit").count()) {
      await submit(page, true);
      await acknowledge(page);
    } else {
      await page.getByRole("button", { name: "다음 단계" }).click();
    }
  }
  throw new Error(`step ${step} was not reached`);
}

async function slideTo(page: Page, closed: boolean): Promise<void> {
  const slider = page.getByTestId("fold-slider");
  await slider.focus();
  await page.keyboard.press(closed ? "End" : "Home");
}

async function setFold(page: Page, closed: boolean): Promise<void> {
  await slideTo(page, closed);
  await expect(page.locator(".fold-view")).toHaveAttribute(
    "data-fold-state",
    closed ? "closed" : "flat",
  );
}

async function moveFace(page: Page, id: string, x: number, y: number): Promise<void> {
  await page.locator(`g.net-board[data-face-id="${id}"] rect.net-face-shape`).dispatchEvent("click");
  await page.locator(`rect[data-grid-cell][data-grid-x="${x}"][data-grid-y="${y}"]`).dispatchEvent("click");
  await expect(page.locator(`g.net-board[data-face-id="${id}"]`)).toHaveAttribute("data-grid-x", String(x));
  await expect(page.locator(`g.net-board[data-face-id="${id}"]`)).toHaveAttribute("data-grid-y", String(y));
}

async function placeFace(page: Page, palette: number, placement: Placement): Promise<void> {
  const [x, y, width, height] = placement;
  const rotations = height === undefined ? 0 : 1;
  const id = `F${(await page.locator("g.net-board").count()) + 1}`;
  await page.locator("face-palette").nth(palette).click();
  await page.locator(`rect[data-grid-cell][data-grid-x="${x}"][data-grid-y="${y}"]`).dispatchEvent("click");
  await expect(page.locator(`g.net-board[data-face-id="${id}"]`)).toHaveCount(1);
  if (rotations > 0) {
    await page.locator(`g.net-board[data-face-id="${id}"] rect.net-face-shape`).dispatchEvent("click");
    for (let turn = 0; turn < rotations; turn += 1) {
      await page.locator('[data-board-action="rotate"]').click();
    }
    await page.locator('[data-board-action="clear-selection"]').click();
  }
}

async function checkCorrespondence(page: Page, vertexMinimum: number): Promise<void> {
  await expect(page.locator(".fold-view")).toHaveAttribute("data-fold-state", "closed");
  await page.locator('[data-board-action="clear-selection"]').click();
  expect(await highlightIds(page)).toEqual([]);
  await page.locator('g.net-board[data-face-id="F1"] rect.net-face-shape').dispatchEvent("click");
  await expect(page.getByTestId("fold-face-F1")).toHaveClass(/is-highlighted/);
  await page.getByTestId("fold-face-F2").dispatchEvent("click");
  await expect(page.locator('g.net-board[data-face-id="F2"][data-highlighted-2d]')).toHaveCount(1);
  await page.locator('line[data-testid^="fold-edge-"][data-part-id^="E:"]').first().dispatchEvent("click");
  expect((await highlightIds(page)).length).toBeGreaterThanOrEqual(2);
  await page.locator('circle[data-testid^="fold-vertex-"][data-part-id^="V:"]').first().dispatchEvent("click");
  expect((await highlightIds(page)).length).toBeGreaterThanOrEqual(vertexMinimum);
}

async function foldSignature(page: Page): Promise<string> {
  const points = await page.locator('.fold-view [data-testid^="fold-face-"]').evaluateAll((nodes) =>
    nodes.map((node) => `${node.getAttribute("data-testid")}=${node.getAttribute("points")}`).sort(),
  );
  return points.join("|");
}

const CUBE_A: readonly Placement[] = [[1, 1, 1], [3, 1, 1], [0, 1, 1], [2, 1, 1], [1, 0, 1], [1, 2, 1]];
const CUBE_B: readonly Placement[] = [[1, 0, 1], [1, 1, 1], [1, 2, 1], [1, 3, 1], [0, 1, 1], [2, 1, 1]];
const CUBOID_A: readonly Placement[] = [[4, 4, 0], [4, 7, 2], [6, 4, 4, 3], [0, 4, 5, 3], [4, 0, 3], [4, 11, 1]];
const CUBOID_B: readonly Placement[] = [[2, 2, 4], [0, 2, 2], [5, 2, 3], [7, 2, 5], [2, 0, 0, 3], [2, 6, 1, 3]];

async function buildAndSubmit(page: Page, layouts: readonly Placement[][]): Promise<string> {
  let signature = "";
  for (const layout of layouts) {
    for (const placement of layout) {
      await placeFace(page, placement[2], placement);
    }
    await setFold(page, true);
    signature = await foldSignature(page);
    await submit(page, true);
    await acknowledge(page);
  }
  return signature;
}

test("NET-C and PLAY: cube correspondence, repair, two layouts and exhibit", async ({ page }) => {
  page.setDefaultTimeout(10000);
  await openTopic(page, "NET-C");
  await setFold(page, false);
  await setFold(page, true);
  await gotoStep(page, "net-c-correspond");
  await checkCorrespondence(page, 3);
  await gotoStep(page, "net-c-fix");
  await slideTo(page, true);
  await expect(page.locator(".fold-view")).toHaveAttribute("data-fold-state", "unclosed");
  await moveFace(page, "F6", 1, 3);
  await expect(page.locator(".fold-view")).toHaveAttribute("data-fold-state", "closed");
  await gotoStep(page, "net-c-complete");
  await moveFace(page, "F1", 5, 5);
  await submit(page, false, /DISCONNECTED|PARTIAL_EDGE_CONTACT/);
  await retryFeedback(page);
  await submit(page, true);
  await acknowledge(page);
  await expect(page.locator("[data-net-lesson]")).toHaveAttribute("data-step", "net-c-build");
  const signature = await buildAndSubmit(page, [CUBE_A, CUBE_B]);
  await expect(page.getByTestId("topic-complete")).toBeVisible();
  await submit(page, false, /INCOMPLETE_FACE_SET/);
  await page.getByRole("button", { name: "지도로 돌아가기" }).click();
  await page.getByTestId("map-gallery").click();
  await expect(page.getByTestId("gallery")).toHaveAttribute("data-kind", "cube");
  expect(await foldSignature(page)).toBe(signature);
  await page.reload();
  await page.getByTestId("map-gallery").click();
  await expect(page.getByTestId("gallery")).toHaveAttribute("data-kind", "cube");
  await expect(page.locator(".fold-view")).toHaveAttribute("data-fold-state", "closed");
  expect(await foldSignature(page)).toBe(signature);
});

test("NET-R: cuboid correspondence, repair and two independent layouts", async ({ page }) => {
  page.setDefaultTimeout(10000);
  await openTopic(page, "NET-R");
  await gotoStep(page, "net-r-correspond");
  await checkCorrespondence(page, 2);
  await gotoStep(page, "net-r-fix");
  await slideTo(page, true);
  await expect(page.locator(".fold-view")).toHaveAttribute("data-fold-state", "unclosed");
  await moveFace(page, "F6", 0, 7);
  await expect(page.locator(".fold-view")).toHaveAttribute("data-fold-state", "closed");
  await gotoStep(page, "net-r-complete");
  await moveFace(page, "F1", 7, 8);
  await submit(page, false, /DISCONNECTED|PARTIAL_EDGE_CONTACT/);
  await retryFeedback(page);
  await submit(page, true);
  await acknowledge(page);
  await expect(page.locator("[data-net-lesson]")).toHaveAttribute("data-step", "net-r-build");
  await buildAndSubmit(page, [CUBOID_A, CUBOID_B]);
  await expect(page.getByTestId("topic-complete")).toBeVisible();
  await page.getByRole("button", { name: "지도로 돌아가기" }).click();
  await page.getByTestId("map-gallery").click();
  await expect(page.getByTestId("gallery")).toHaveAttribute("data-kind", "cuboid");
  await expect(page.locator(".fold-view")).toHaveAttribute("data-fold-state", "closed");
});

test("PLAY: WebGL failure keeps the flat board actionable", async ({ page }) => {
  page.setDefaultTimeout(10000);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
      if (kind === "webgl" || kind === "webgl2" || kind === "experimental-webgl") return null;
      return (original as (...values: unknown[]) => unknown).call(this, kind, ...args);
    };
  });
  await openTopic(page, "NET-C");
  await gotoStep(page, "net-c-correspond");
  const viewport = page.locator('[data-testid="viewport"][data-scene-id="fold-view"]');
  await expect(viewport).toContainText("WEBGL_INIT_FAILED");
  await expect(viewport).toContainText("화면 ID: fold-view");
  await expect(viewport.getByRole("button", { name: "다시 열기" })).toBeVisible();
  await expect(page.locator(".net-board-root")).toBeVisible();
  await expect(page.locator("g.net-board")).toHaveCount(6);
  await expect(page.getByTestId("fold-slider")).toBeVisible();
});

