import { test, expect, type Page } from "@playwright/test";
const fixture = {
  name: "テスト喫茶",
  address: "架空の住所",
  lat: 35.681,
  lng: 139.767,
  category: "unknown",
  source: "fixture",
  licenses: ["Apache-2.0"],
  attributions: ["テスト出典"],
};
async function live(page: Page) {
  await page.selectOption("#mode", "live");
}
async function demo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "このエリアで探す" }).click();
}
test.beforeEach(async ({ page }) => {
  // No real tile requests, including during headless map movement.
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.route("https://api.openpoiapi.com/**", (route) =>
    route.fulfill({ json: { count: 1, results: [fixture] } }),
  );
});
test("架空デモ、保存、状況、メモ、再読込、バックアップ", async ({ page }) => {
  await demo(page);
  await expect(page.locator(".card")).toHaveCount(6);
  await expect(page.locator("#message")).toContainText("架空デモ6件");
  await page.getByRole("button", { name: "＋ 候補に保存" }).first().click();
  await page.getByRole("tab", { name: "保存した候補" }).click();
  await page
    .getByRole("combobox", { name: "【架空】こもれび喫茶の訪問状況" })
    .selectOption("再訪");
  await page
    .getByRole("textbox", { name: "【架空】こもれび喫茶の営業メモ" })
    .fill("次回の確認\n日本語メモ");
  await page.reload();
  await page.getByRole("tab", { name: "保存した候補" }).click();
  await expect(page.locator("textarea")).toHaveValue("次回の確認\n日本語メモ");
  await expect(page.locator(".card select")).toHaveValue("再訪");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSONを書き出す" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /field-sales-map-.*json/,
  );
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.evaluate(() => document.body.clientWidth),
  );
});
test("実検索は地域を分離、欠損座標・0件・上限・XSSを処理", async ({ page }) => {
  await page.goto("/");
  await live(page);
  const data = [
    fixture,
    {
      ...fixture,
      name: "<img src=x onerror=alert(1)>",
      lat: "",
      lng: "",
      address: "",
    },
  ];
  await page.route("https://api.openpoiapi.com/**", (route) => {
    const u = new URL(route.request().url());
    expect(u.searchParams.get("center")).toBe("139.767052,35.681236");
    expect(u.searchParams.get("q")).toBe("カフェ");
    return route.fulfill({ json: { results: data } });
  });
  await page.getByRole("button", { name: "このエリアで探す" }).click();
  await expect(page.locator(".card")).toHaveCount(2);
  await expect(page.locator("#message")).toContainText("座標なし1件");
  await expect(page.locator(".card img")).toHaveCount(0);
  await page.waitForTimeout(3100);
  await page.route("https://api.openpoiapi.com/**", (route) =>
    route.fulfill({
      json: {
        results: Array.from({ length: 200 }, (_, i) => ({
          ...fixture,
          name: `架空${i}`,
        })),
      },
    }),
  );
  await page.selectOption("#limit", "200");
  await page.getByRole("button", { name: "このエリアで探す" }).click();
  await expect(page.locator("#message")).toContainText("取得上限に達しました");
  await page.waitForTimeout(3100);
  await page.route("https://api.openpoiapi.com/**", (route) =>
    route.fulfill({ json: { results: [] } }),
  );
  await page.getByRole("button", { name: "このエリアで探す" }).click();
  await expect(page.locator("#message")).toContainText("0件");
});
test("通信エラー後も保存メモを保持し、キャンセル後の古い応答を無視", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("button", { name: "＋ 候補に保存" }).first().click();
  await page.locator("textarea").fill("消えないメモ");
  await live(page);
  await page.route("https://api.openpoiapi.com/**", (route) =>
    route.fulfill({ status: 429, json: { error: "busy" } }),
  );
  await page.getByRole("button", { name: "このエリアで探す" }).click();
  await expect(page.locator("#message")).toContainText("429");
  await expect(page.locator("textarea")).toHaveValue("消えないメモ");
  await page.waitForTimeout(3100);
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await page.route("https://api.openpoiapi.com/**", async (route) => {
    await gate;
    await route.fulfill({ json: { results: [fixture] } }).catch(() => {});
  });
  await page.getByRole("button", { name: "このエリアで探す" }).click();
  await page.getByRole("button", { name: "検索を中止" }).click();
  await page.selectOption("#mode", "demo");
  await page.getByRole("button", { name: "このエリアで探す" }).click();
  release();
  await expect(page.locator(".card")).toHaveCount(6);
  await expect(page.locator("#message")).toContainText("架空デモ");
});
test("破損・不正インポートで保存データを壊さない", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("field-sales-map:v1", "broken original"),
  );
  await demo(page);
  await expect(page.locator("#storage-error")).toContainText("元データを保護");
  await expect(
    page.getByRole("button", { name: "＋ 候補に保存" }).first(),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => localStorage.getItem("field-sales-map:v1")),
  ).toBe("broken original");
});
test("JSON取込、異常取込の原子性、別タブ競合", async ({ page, context }) => {
  await demo(page);
  await page.getByRole("button", { name: "＋ 候補に保存" }).first().click();
  await page.locator("textarea").fill("端末のメモ");
  const raw = await page.evaluate(() =>
    localStorage.getItem("field-sales-map:v1")!,
  );
  await page.locator("#import").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(raw),
  });
  await expect(page.locator("#data-message")).toContainText("合計1件");
  await expect(page.locator("textarea")).toHaveValue("端末のメモ");
  await page.locator("#import").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{bad"),
  });
  await expect(page.locator("#data-message")).toContainText("取り込み中止");
  expect(
    await page.evaluate(() => localStorage.getItem("field-sales-map:v1")),
  ).toBe(raw);
  const other = await context.newPage();
  await other.goto("/");
  await other.evaluate(() =>
    localStorage.setItem(
      "field-sales-map:v1",
      JSON.stringify({ version: 1, candidates: [] }),
    ),
  );
  await expect(page.locator("#storage-error")).toContainText("別タブ");
  await page.locator("textarea").fill("編集中のメモ");
  await expect(page.locator(".memo-state")).toContainText("未保存");
  await expect(page.locator("textarea")).toHaveValue("編集中のメモ");
});
test("容量不足でも入力を残し、地図範囲をbboxで送る", async ({ page }) => {
  await demo(page);
  await page.getByRole("button", { name: "＋ 候補に保存" }).first().click();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
  });
  await page.locator("textarea").fill("未保存の大事なメモ");
  await expect(page.locator("#storage-error")).toContainText("保存に失敗");
  await page.getByRole("tab", { name: "保存した候補" }).click();
  await expect(page.locator("textarea")).toHaveValue("未保存の大事なメモ");
  await expect(page.locator("#message")).toContainText("未保存");
  await page.reload();
  await live(page);
  await page.route("https://api.openpoiapi.com/**", (route) => {
    expect(new URL(route.request().url()).searchParams.has("bbox")).toBe(true);
    return route.fulfill({ json: { results: [fixture] } });
  });
  await page.getByRole("button", { name: "表示範囲で検索" }).click();
  await expect(page.locator("#message")).toContainText("1件の候補");
});
test("画面のスクリーンショット（架空データのみ）", async ({ page }, info) => {
  await demo(page);
  await page.getByRole("button", { name: "＋ 候補に保存" }).first().click();
  await page.screenshot({
    path: info.outputPath("field-sales-map.png"),
    fullPage: true,
  });
});

test("タイムアウト・不正応答・500でも保存候補を保持", async ({ page }) => {
  await demo(page);
  await page.getByRole("button", { name: "＋ 候補に保存" }).first().click();
  await page.locator("textarea").fill("確認予定");
  await live(page);
  await page.clock.install();
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await page.route("https://api.openpoiapi.com/**", async (route) => {
    await gate;
    await route.fulfill({ json: { results: [fixture] } }).catch(() => {});
  });
  await page.getByRole("button", { name: "このエリアで探す" }).click();
  await page.clock.fastForward(16000);
  await expect(page.locator("#message")).toContainText("タイムアウト");
  release();
  await page.route("https://api.openpoiapi.com/**", (route) =>
    route.fulfill({ json: { results: null } }),
  );
  await page.getByRole("button", { name: "このエリアで探す" }).click();
  await expect(page.locator("#message")).toContainText("応答形式");
  await page.clock.fastForward(3100);
  await page.route("https://api.openpoiapi.com/**", (route) =>
    route.fulfill({ status: 500, json: { error: "failed" } }),
  );
  await page.getByRole("button", { name: "このエリアで探す" }).click();
  await expect(page.locator("#message")).toContainText("HTTP 500");
  await expect(page.locator("textarea")).toHaveValue("確認予定");
});

test("デモ操作とメモ編集は外部へ通信しない", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:5173"))
      external.push(request.url());
  });
  await demo(page);
  await page.getByRole("button", { name: "＋ 候補に保存" }).first().click();
  await page.locator("textarea").fill("外部に送らない確認メモ");
  await page.locator(".card select").selectOption("訪問済み");
  expect(external).toEqual([]);
});

test("配布画面から完全なライセンスとNOTICEを開ける", async ({ page }) => {
  await page.goto("/");
  const links = [
    ["Foursquare NOTICE全文", "© 2026 Foursquare Labs"],
    ["Apache License 2.0", "END OF TERMS AND CONDITIONS"],
    ["CDLA 2.0", "5.4."],
    ["Leaflet license", "Redistribution and use"],
  ];
  for (const [name, expected] of links) {
    const url = await page
      .getByRole("link", { name, exact: true })
      .getAttribute("href");
    expect(url).not.toMatch(/^data:/);
    const response = await page.request.get(new URL(url!, page.url()).href);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain(expected);
  }
});

test("遅延検索の完了時にも保存失敗したメモを保護する", async ({ page }) => {
  await demo(page);
  await page.getByRole("button", { name: "＋ 候補に保存" }).first().click();
  await live(page);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("https://api.openpoiapi.com/**", async (route) => {
    await gate;
    await route.fulfill({ json: { results: [fixture] } });
  });
  await page.getByRole("button", { name: "このエリアで探す" }).click();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
  });
  await page.locator("textarea").fill("検索を待っている間の未保存メモ");
  await expect(page.locator(".memo-state")).toContainText("未保存");
  release();
  await expect(page.locator("#cancel")).toBeHidden();
  await expect(page.locator("#message")).toContainText("未保存の入力");
  await expect(page.locator("textarea")).toHaveValue(
    "検索を待っている間の未保存メモ",
  );
  await expect(page.locator("textarea")).toHaveAttribute(
    "data-unsaved",
    "true",
  );
  await expect(page.locator(".card")).toHaveCount(6);
  expect(
    await page.evaluate(() =>
      window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
    ),
  ).toBe(false);
});

test("遅延JSON読取の完了時にも保存失敗したメモを保護する", async ({ page }) => {
  await demo(page);
  await page.getByRole("button", { name: "＋ 候補に保存" }).first().click();
  const raw = await page.evaluate(() =>
    localStorage.getItem("field-sales-map:v1")!,
  );
  await page.evaluate(() => {
    const original = File.prototype.text;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    (window as unknown as { releaseRead: () => void }).releaseRead = release;
    File.prototype.text = async function () {
      await gate;
      return original.call(this);
    };
  });
  await page
    .locator("#import")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(raw),
    });
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
  });
  await page.locator("textarea").fill("ファイルを待っている間の未保存メモ");
  await page.evaluate(() =>
    (window as unknown as { releaseRead: () => void }).releaseRead(),
  );
  await expect(page.locator("#message")).toContainText("未保存の入力");
  await expect(page.locator("textarea")).toHaveValue(
    "ファイルを待っている間の未保存メモ",
  );
  await expect(page.locator("textarea")).toHaveAttribute(
    "data-unsaved",
    "true",
  );
  await expect(page.locator(".card")).toHaveCount(6);
  expect(
    await page.evaluate(() => localStorage.getItem("field-sales-map:v1")),
  ).toBe(raw);
  expect(
    await page.evaluate(() =>
      window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
    ),
  ).toBe(false);
});
