import { expect, type Page } from "@playwright/test";

export type Topic = "NET-C" | "NET-R";
export type Placement = readonly [number, number, number, number?];

async function highlightIds(page: Page): Promise<string[]> {
  return page
    .locator(".net-board-root [data-highlighted-2d]")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-part-id") ?? ""),
    );
}

export async function openTopic(page: Page, topic: Topic): Promise<void> {
  await page.goto("/");
  await page.locator(`[data-topic-id="${topic}"]`).click();
  await expect(page.locator('section[aria-label="주제 학습"]')).toBeVisible();
}

export async function acknowledge(page: Page): Promise<void> {
  const feedback = page.getByRole("status", { name: "결과 확인" });
  await expect(feedback).toBeVisible();
  await feedback.getByRole("button", { name: "계속" }).click();
}

export async function retryFeedback(page: Page): Promise<void> {
  const feedback = page.getByRole("status", { name: "결과 확인" });
  await expect(feedback).toBeVisible();
  await feedback.getByRole("button", { name: "다시 하기" }).click();
}

export async function submit(
  page: Page,
  correct: boolean,
  hint?: RegExp,
): Promise<void> {
  await page.getByTestId("net-submit").click();
  const feedback = page.getByRole("status", { name: "결과 확인" });
  await expect(feedback).toContainText(
    correct ? "정답입니다" : "다시 생각해 보세요",
  );
  if (hint)
    await expect(feedback.locator('ul[aria-label="수정 힌트"]')).toContainText(
      hint,
    );
}

export async function gotoStep(page: Page, step: string): Promise<void> {
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

export async function slideTo(page: Page, closed: boolean): Promise<void> {
  const slider = page.getByTestId("fold-slider");
  await slider.focus();
  await page.keyboard.press(closed ? "End" : "Home");
}

export async function setFold(page: Page, closed: boolean): Promise<void> {
  await slideTo(page, closed);
  await expect(page.locator(".fold-view")).toHaveAttribute(
    "data-fold-state",
    closed ? "closed" : "flat",
  );
}

export async function moveFace(
  page: Page,
  id: string,
  x: number,
  y: number,
): Promise<void> {
  await page
    .locator(`g.net-board[data-face-id="${id}"] rect.net-face-shape`)
    .dispatchEvent("click");
  await page
    .locator(`rect[data-grid-cell][data-grid-x="${x}"][data-grid-y="${y}"]`)
    .dispatchEvent("click");
  await expect(
    page.locator(`g.net-board[data-face-id="${id}"]`),
  ).toHaveAttribute("data-grid-x", String(x));
  await expect(
    page.locator(`g.net-board[data-face-id="${id}"]`),
  ).toHaveAttribute("data-grid-y", String(y));
}

export async function placeFace(
  page: Page,
  palette: number,
  placement: Placement,
): Promise<void> {
  const [x, y, , height] = placement;
  const rotations = height === undefined ? 0 : 1;
  const id = `F${(await page.locator("g.net-board").count()) + 1}`;
  await page.locator("face-palette").nth(palette).click();
  await page
    .locator(`rect[data-grid-cell][data-grid-x="${x}"][data-grid-y="${y}"]`)
    .dispatchEvent("click");
  await expect(page.locator(`g.net-board[data-face-id="${id}"]`)).toHaveCount(
    1,
  );
  if (rotations > 0) {
    await page
      .locator(`g.net-board[data-face-id="${id}"] rect.net-face-shape`)
      .dispatchEvent("click");
    for (let turn = 0; turn < rotations; turn += 1) {
      await page.locator('[data-board-action="rotate"]').click();
    }
    await page.locator('[data-board-action="clear-selection"]').click();
  }
}

export async function checkCorrespondence(
  page: Page,
  vertexMinimum: number,
): Promise<void> {
  await expect(page.locator(".fold-view")).toHaveAttribute(
    "data-fold-state",
    "closed",
  );
  await page.locator('[data-board-action="clear-selection"]').click();
  expect(await highlightIds(page)).toEqual([]);
  await page
    .locator('g.net-board[data-face-id="F1"] rect.net-face-shape')
    .dispatchEvent("click");
  await expect(page.getByTestId("fold-face-F1")).toHaveClass(/is-highlighted/);
  await page.getByTestId("fold-face-F2").dispatchEvent("click");
  await expect(
    page.locator('g.net-board[data-face-id="F2"][data-highlighted-2d]'),
  ).toHaveCount(1);
  await page
    .locator('line[data-testid^="fold-edge-"][data-part-id^="E:"]')
    .first()
    .dispatchEvent("click");
  expect((await highlightIds(page)).length).toBeGreaterThanOrEqual(2);
  await page
    .locator('circle[data-testid^="fold-vertex-"][data-part-id^="V:"]')
    .first()
    .dispatchEvent("click");
  expect((await highlightIds(page)).length).toBeGreaterThanOrEqual(
    vertexMinimum,
  );
}

export async function foldSignature(page: Page): Promise<string> {
  const points = await page
    .locator('.fold-view [data-testid^="fold-face-"]')
    .evaluateAll((nodes) =>
      nodes
        .map(
          (node) =>
            `${node.getAttribute("data-testid")}=${node.getAttribute("points")}`,
        )
        .sort(),
    );
  return points.join("|");
}

export async function buildAndSubmit(
  page: Page,
  layouts: readonly (readonly Placement[])[],
): Promise<string> {
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
