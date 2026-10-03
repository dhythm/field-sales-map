import { parseResponse } from "./domain";
export type SearchArea =
  | { center: [number, number]; radius: number }
  | { bbox: [number, number, number, number] };
export function searchUrl(
  query: string,
  area: SearchArea,
  limit: number,
): string {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw new Error("取得上限は1〜200件です。");
  const params = new URLSearchParams({ q: query.trim(), limit: String(limit) });
  if ("bbox" in area) {
    const [w, s, e, n] = area.bbox;
    if (
      !area.bbox.every(Number.isFinite) ||
      w < -180 ||
      e > 180 ||
      s < -85 ||
      n > 85 ||
      w >= e ||
      s >= n ||
      e - w > 1 ||
      n - s > 1
    )
      throw new Error(
        "地図を拡大してください。検索範囲は緯度・経度それぞれ1度以内です。",
      );
    params.set("bbox", area.bbox.join(","));
  } else {
    const [lng, lat] = area.center;
    if (
      !Number.isFinite(lng) ||
      !Number.isFinite(lat) ||
      Math.abs(lng) > 180 ||
      Math.abs(lat) > 85 ||
      !Number.isInteger(area.radius) ||
      area.radius < 1 ||
      area.radius > 10000
    )
      throw new Error("検索範囲が不正です。");
    params.set("center", area.center.join(","));
    params.set("radius", String(area.radius));
  }
  return `https://api.openpoiapi.com/v1/search?${params}`;
}
export async function searchFacilities(
  query: string,
  area: SearchArea,
  limit: number,
  signal: AbortSignal,
) {
  const response = await fetch(searchUrl(query, area, limit), {
    signal,
    credentials: "omit",
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "APIが混み合っています（429）。時間をおいて検索してください。"
        : `検索に接続できませんでした（HTTP ${response.status}）。`,
    );
  return parseResponse(await response.json());
}
