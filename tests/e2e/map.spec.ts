import { expect, test, type Locator, type Page } from "@playwright/test";
import { TOPICS } from "../../src/lesson/topics";

const STORAGE_KEY = "cuboid-review-lab/progress/v1";
const MAP_ROOT =
  '[data-testid="world-map"], section[data-scene-id="world-map"]';
const PLACES = '[data-testid="map-place"][data-topic-id]';

type Place = {
  id: string;
  name: string;
  order: number;
  recommended: boolean;
  completed: boolean;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.removeItem(key);
  }, STORAGE_KEY);
});

function mapRoot(page: Page): Locator {
  return page.locator(MAP_ROOT);
}

function returnButton(page: Page): Locator {
  return page
    .getByRole("button", { name: /지도로 돌아가기|목록으로|지도로/ })
    .first();
}

async function readPlaces(page: Page): Promise<Place[]> {
  return page.locator(PLACES).evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute("data-topic-id") ?? "",
      name: node.querySelector("strong")?.textContent?.trim() ?? "",
      order: Number(
        node.getAttribute("data-order") ??
          node.getAttribute("data-sequence") ??
          "0",
      ),
      recommended: node.getAttribute("data-recommended") === "true",
      completed: node.getAttribute("data-completed") === "true",
    })),
  );
}

async function expectTopicOpen(page: Page): Promise<void> {
  await expect(mapRoot(page)).toHaveCount(0);
  await expect(returnButton(page)).toBeVisible();
}

test("새 기록에서 다섯 장소와 수업 순서, 유일한 추천이 보인다", async ({
  page,
}) => {
  await page.goto("/");

  await expect(mapRoot(page)).toHaveCount(1);
  await expect(page.locator('[data-testid="viewport"]')).toHaveCount(1);

  const catalog = Object.values(TOPICS).sort(
    (left, right) => left.order - right.order,
  );
  expect(catalog).toHaveLength(5);

  const places = await readPlaces(page);
  expect(places).toHaveLength(5);
  expect(places.map((place) => place.id)).toEqual(
    catalog.map((topic) => topic.id),
  );
  expect(places.map((place) => place.order)).toEqual(
    catalog.map((topic) => topic.order),
  );
  expect(places.map((place) => place.name)).toEqual(
    catalog.map((topic) => topic.titleKo),
  );
  expect(
    places.filter((place) => place.recommended).map((place) => place.id),
  ).toEqual([catalog[0]?.id]);
  expect(places.filter((place) => place.completed)).toEqual([]);
});

test("추천 장소를 열고 지도로 돌아간다", async ({ page }) => {
  await page.goto("/");

  const recommended = page.locator(PLACES + '[data-recommended="true"]');
  await expect(recommended).toHaveCount(1);
  await recommended.tap();

  await expectTopicOpen(page);
  await returnButton(page).tap();
  await expect(mapRoot(page)).toHaveCount(1);
  await expect(page.locator(PLACES)).toHaveCount(5);
});

test("추천이 아닌 장소도 바로 열고 지도로 돌아간다", async ({ page }) => {
  await page.goto("/");

  const freeChoice = page.locator(PLACES + '[data-recommended="false"]').last();
  await expect(freeChoice).toBeVisible();
  await freeChoice.tap();

  await expectTopicOpen(page);
  await returnButton(page).tap();
  await expect(mapRoot(page)).toHaveCount(1);
});

test("드래그는 지도를 회전하고 탭만 장소를 연다", async ({ page }) => {
  await page.goto("/");

  const viewport = page.locator('[data-testid="viewport"]');
  await expect(viewport).toBeVisible();
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 80, startY + 40, { steps: 8 });
  await page.mouse.up();

  await expect(mapRoot(page)).toHaveCount(1);
  await expect(returnButton(page)).toHaveCount(0);

  await page.locator(PLACES + '[data-recommended="true"]').tap();
  await expectTopicOpen(page);
});

test("전시 입구를 열고 지도로 돌아간다", async ({ page }) => {
  await page.goto("/");

  const galleryEntry = page
    .locator(
      '[data-testid="map-gallery"][data-gallery-kind], [data-testid="map-gallery"]',
    )
    .first();
  await expect(galleryEntry).toBeVisible();
  await galleryEntry.tap();

  await expect(mapRoot(page)).toHaveCount(0);
  await expect(
    page
      .locator('[data-testid="gallery-screen"], [data-testid="gallery"]')
      .first(),
  ).toBeVisible();

  await returnButton(page).tap();
  await expect(mapRoot(page)).toHaveCount(1);
});
