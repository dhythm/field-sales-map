import { describe, it, expect } from "vitest";
import {
  createCandidate,
  dedupe,
  demoFacilities,
  facilityId,
  loadCandidates,
  mergeCandidates,
  normalizeFacility,
  parseBackup,
  parseResponse,
  saveCandidates,
} from "../src/domain";
import { searchUrl } from "../src/api";
import { exportBackup } from "../src/notices";
const f = demoFacilities(35.68, 139.76)[0];
describe("API境界と施設の同定", () => {
  it("空文字をゼロ地点にせず、不正・範囲外の座標を欠損扱いにする", () => {
    expect(normalizeFacility({ lat: "", lng: "" })).toMatchObject({
      lat: null,
      lng: null,
    });
    expect(normalizeFacility({ lat: "35.5", lng: "139.2" })).toMatchObject({
      lat: 35.5,
      lng: 139.2,
    });
    expect(normalizeFacility({ lat: 91, lng: false })).toMatchObject({
      lat: null,
      lng: null,
    });
  });
  it("完全一致のみ整理しライセンスと出典を統合する", () => {
    const rows = dedupe([
      f,
      { ...f, licenses: ["Apache-2.0"], attributions: ["Other source"] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].licenses).toEqual(["CC0-1.0", "Apache-2.0"]);
    expect(rows[0].attributions).toContain("Other source");
  });
  it("同名・同座標でも住所/カテゴリ/提供元が異なる施設は分離する", () => {
    expect(
      dedupe([
        f,
        { ...f, address: "別住所" },
        { ...f, category: "service" },
        { ...f, source: "different" },
      ]),
    ).toHaveLength(4);
    expect(facilityId(f)).not.toBe(facilityId({ ...f, demo: false }));
  });
  it("不正な応答を拒否し、countを総件数として扱わない", () => {
    expect(() => parseResponse({ results: "bad" })).toThrow();
    expect(() => parseResponse({ results: Array(201).fill(f) })).toThrow();
    expect(parseResponse({ count: 5000, results: [f, f] })).toMatchObject({
      received: 2,
      facilities: [f],
    });
  });
  it("検索語と地域を分離し、経度・緯度順で送信する", () => {
    const url = new URL(
      searchUrl("カフェ 書店", { center: [139.76, 35.68], radius: 1000 }, 200),
    );
    expect(url.searchParams.get("q")).toBe("カフェ 書店");
    expect(url.searchParams.get("center")).toBe("139.76,35.68");
    expect(
      new URL(
        searchUrl("", { bbox: [139, 35, 139.5, 35.5] }, 50),
      ).searchParams.has("center"),
    ).toBe(false);
    expect(() => searchUrl("", { bbox: [130, 30, 140, 40] }, 50)).toThrow();
    expect(() => searchUrl("", { center: [139, 35], radius: 0 }, 50)).toThrow();
  });
});
describe("保存とバックアップ", () => {
  it("日本語・改行・出典と完全なライセンス/NOTICEを往復する", () => {
    const c = {
      ...createCandidate(f),
      memo: "初回の確認\n次回の訪問",
      status: "再訪" as const,
    };
    const json = exportBackup([c]);
    expect(parseBackup(json)).toEqual([c]);
    const data = JSON.parse(json);
    expect(data.dataNotice.licenseTexts["Apache-2.0"]).toContain(
      "END OF TERMS AND CONDITIONS",
    );
    expect(data.dataNotice.foursquareNotice).toContain("© 2026 Foursquare");
    expect(data.dataNotice.licenseTexts["CDLA-Permissive-2.0"]).toContain(
      "5.4.",
    );
  });
  it("不正・重複・過大インポートを変更前に拒否する", () => {
    const c = createCandidate(f);
    expect(() => parseBackup("{")).toThrow();
    expect(() =>
      parseBackup(JSON.stringify({ version: 2, candidates: [] })),
    ).toThrow();
    expect(() =>
      parseBackup(JSON.stringify({ version: 1, candidates: [c, c] })),
    ).toThrow();
    expect(() =>
      parseBackup(
        JSON.stringify({
          version: 1,
          candidates: [{ ...c, memo: "x".repeat(5001) }],
        }),
      ),
    ).toThrow();
    expect(() => parseBackup("x".repeat(5_000_001))).toThrow();
    expect(() =>
      parseBackup(
        JSON.stringify({
          version: 1,
          candidates: [{ ...c, facility: { ...f, licenses: null } }],
        }),
      ),
    ).toThrow();
  });
  it("取り込みでは既存の営業メモと状態を優先する", () => {
    const c = {
      ...createCandidate(f),
      memo: "端末のメモ",
      status: "訪問済み" as const,
    };
    const incoming = {
      ...c,
      memo: "他のメモ",
      facility: { ...f, attributions: ["追加出典"] },
    };
    const merged = mergeCandidates([c], [incoming]);
    expect(merged).toHaveLength(1);
    expect(merged[0].memo).toBe("端末のメモ");
    expect(merged[0].facility.attributions).toContain("追加出典");
  });
  it("破損保存を空の正常状態と区別し上書きしない", () => {
    expect(loadCandidates({ getItem: () => "{broken" }).error).not.toBe("");
    expect(loadCandidates({ getItem: () => null })).toEqual({
      candidates: [],
      error: "",
    });
    expect(
      loadCandidates({
        getItem: () => {
          throw new Error("blocked");
        },
      }).error,
    ).not.toBe("");
    expect(() =>
      saveCandidates(
        {
          setItem: () => {
            throw new Error("quota");
          },
        },
        [],
      ),
    ).toThrow("quota");
  });
});

it("取り込みの不正座標・フィールド欠落を正規化で隠さず拒否する", () => {
  const c = createCandidate(f);
  for (const facility of [
    { ...f, lat: "" },
    { ...f, lat: 100 },
    { ...f, demo: undefined },
    { ...f, name: undefined },
  ]) {
    expect(() =>
      parseBackup(
        JSON.stringify({ version: 1, candidates: [{ ...c, facility }] }),
      ),
    ).toThrow();
  }
});

it("座標の空白や配列をゼロ地点として受け入れない", () => {
  for (const value of [
    " ",
    "\t\n",
    [],
    [0],
    [35],
    {},
    false,
    true,
    "0x23",
    NaN,
    Infinity,
  ]) {
    expect(normalizeFacility({ lat: value, lng: value })).toMatchObject({
      lat: null,
      lng: null,
    });
  }
  expect(normalizeFacility({ lat: " 35.5 ", lng: "1.397e2" })).toMatchObject({
    lat: 35.5,
    lng: 139.7,
  });
  expect(normalizeFacility({ lat: 0, lng: "0" })).toMatchObject({
    lat: 0,
    lng: 0,
  });
});
