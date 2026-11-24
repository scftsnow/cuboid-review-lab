import { expect, test } from "@playwright/test";
import {
  acknowledge,
  buildAndSubmit,
  checkCorrespondence,
  foldSignature,
  gotoStep,
  moveFace,
  openTopic,
  placeFace,
  retryFeedback,
  setFold,
  slideTo,
  submit,
  type Placement,
} from "./netBrowserActions";

test.setTimeout(120000);

const CUBE_A: readonly Placement[] = [
  [1, 1, 1],
  [3, 1, 1],
  [0, 1, 1],
  [2, 1, 1],
  [1, 0, 1],
  [1, 2, 1],
];
const CUBE_B: readonly Placement[] = [
  [1, 0, 1],
  [1, 1, 1],
  [1, 2, 1],
  [1, 3, 1],
  [0, 1, 1],
  [2, 1, 1],
];
const CUBOID_A: readonly Placement[] = [
  [4, 4, 0],
  [4, 7, 2],
  [6, 4, 4, 3],
  [0, 4, 5, 3],
  [4, 0, 3],
  [4, 11, 1],
];
const CUBOID_B: readonly Placement[] = [
  [2, 2, 4],
  [0, 2, 2],
  [5, 2, 3],
  [7, 2, 5],
  [2, 0, 0, 3],
  [2, 6, 1, 3],
];

test("NET-C and PLAY: cube correspondence, repair, two layouts and exhibit", async ({
  page,
}) => {
  page.setDefaultTimeout(10000);
  await openTopic(page, "NET-C");
  await setFold(page, false);
  await setFold(page, true);
  await gotoStep(page, "net-c-correspond");
  await checkCorrespondence(page, 3);
  await gotoStep(page, "net-c-fix");
  await slideTo(page, true);
  await expect(page.locator(".fold-view")).toHaveAttribute(
    "data-fold-state",
    "unclosed",
  );
  await moveFace(page, "F6", 1, 3);
  await expect(page.locator(".fold-view")).toHaveAttribute(
    "data-fold-state",
    "closed",
  );
  await gotoStep(page, "net-c-complete");
  await submit(page, false, /INCOMPLETE_FACE_SET/);
  await retryFeedback(page);
  await placeFace(page, 0, [1, 3, 1]);
  await setFold(page, true);
  await submit(page, true);
  await acknowledge(page);
  await expect(page.locator("[data-net-lesson]")).toHaveAttribute(
    "data-step",
    "net-c-build",
  );
  const signature = await buildAndSubmit(page, [CUBE_A, CUBE_B]);
  await expect(page.getByTestId("topic-complete")).toBeVisible();
  await submit(page, false, /INCOMPLETE_FACE_SET/);
  await page.getByRole("button", { name: "지도로 돌아가기" }).click();
  await page.getByTestId("map-gallery").click();
  await expect(page.getByTestId("gallery")).toHaveAttribute(
    "data-kind",
    "cube",
  );
  expect(await foldSignature(page)).toBe(signature);
  await page.reload();
  await page.getByTestId("map-gallery").click();
  await expect(page.getByTestId("gallery")).toHaveAttribute(
    "data-kind",
    "cube",
  );
  await expect(page.locator(".fold-view")).toHaveAttribute(
    "data-fold-state",
    "closed",
  );
  expect(await foldSignature(page)).toBe(signature);
});

test("NET-R: cuboid correspondence, repair and two independent layouts", async ({
  page,
}) => {
  page.setDefaultTimeout(10000);
  await openTopic(page, "NET-R");
  await gotoStep(page, "net-r-correspond");
  await checkCorrespondence(page, 2);
  await gotoStep(page, "net-r-fix");
  await slideTo(page, true);
  await expect(page.locator(".fold-view")).toHaveAttribute(
    "data-fold-state",
    "unclosed",
  );
  await moveFace(page, "F6", 0, 7);
  await expect(page.locator(".fold-view")).toHaveAttribute(
    "data-fold-state",
    "closed",
  );
  await gotoStep(page, "net-r-complete");
  await submit(page, false, /INCOMPLETE_FACE_SET/);
  await retryFeedback(page);
  await placeFace(page, 0, [0, 7, 0]);
  await setFold(page, true);
  await submit(page, true);
  await acknowledge(page);
  await expect(page.locator("[data-net-lesson]")).toHaveAttribute(
    "data-step",
    "net-r-build",
  );
  await buildAndSubmit(page, [CUBOID_A, CUBOID_B]);
  await expect(page.getByTestId("topic-complete")).toBeVisible();
  await page.getByRole("button", { name: "지도로 돌아가기" }).click();
  await page.getByTestId("map-gallery").click();
  await expect(page.getByTestId("gallery")).toHaveAttribute(
    "data-kind",
    "cuboid",
  );
  await expect(page.locator(".fold-view")).toHaveAttribute(
    "data-fold-state",
    "closed",
  );
});

test("PLAY: WebGL failure keeps the flat board actionable", async ({
  page,
}) => {
  page.setDefaultTimeout(10000);
  await page.addInitScript(
    "const original = HTMLCanvasElement.prototype.getContext;" +
      "HTMLCanvasElement.prototype.getContext = function (kind, ...args) {" +
      'if (kind === "webgl" || kind === "webgl2" || kind === "experimental-webgl") return null;' +
      "return original.call(this, kind, ...args);" +
      "};",
  );
  await openTopic(page, "NET-C");
  await gotoStep(page, "net-c-correspond");
  const viewport = page.locator(
    '[data-testid="viewport"][data-scene-id="fold-view"]',
  );
  await expect(viewport).toContainText("WEBGL_INIT_FAILED");
  await expect(viewport).toContainText("화면 ID: fold-view");
  await expect(
    viewport.getByRole("button", { name: "다시 열기" }),
  ).toBeVisible();
  await expect(page.locator(".net-board-root")).toBeVisible();
  await expect(page.locator("g.net-board")).toHaveCount(6);
  await expect(page.getByTestId("fold-slider")).toBeVisible();
});
