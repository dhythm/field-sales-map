export const STATUSES = ["未訪問", "訪問済み", "再訪", "対象外"] as const;
export type Status = (typeof STATUSES)[number];
export interface Facility {
  name: string;
  name_kana: string;
  prefecture: string;
  city: string;
  address: string;
  category: string;
  business_type: string;
  source: string;
  lat: number | null;
  lng: number | null;
  licenses: string[];
  attributions: string[];
  demo: boolean;
}
export interface Candidate {
  id: string;
  facility: Facility;
  status: Status;
  memo: string;
  savedAt: string;
  updatedAt: string;
}
export const STORE_KEY = "field-sales-map:v1";
export const MAX_SAVED = 1000;
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 10000) : "");
const strings = (v: unknown) =>
  Array.isArray(v)
    ? [...new Set(v.filter((s): s is string => typeof s === "string"))]
    : [];
function coordinate(v: unknown, bound: number): number | null {
  if (typeof v !== "number" && typeof v !== "string") return null;
  if (
    typeof v === "string" &&
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(v.trim())
  )
    return null;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= bound ? n : null;
}
export function normalizeFacility(value: unknown): Facility {
  if (!obj(value)) throw new Error("施設データの形式が不正です。");
  return {
    name: str(value.name),
    name_kana: str(value.name_kana),
    prefecture: str(value.prefecture),
    city: str(value.city),
    address: str(value.address),
    category: str(value.category),
    business_type: str(value.business_type),
    source: str(value.source),
    lat: coordinate(value.lat, 90),
    lng: coordinate(value.lng, 180),
    licenses: strings(value.licenses),
    attributions: strings(value.attributions),
    demo: value.demo === true,
  };
}
// No stable upstream ID is documented. Only exactly matching identity fields are merged.
export function facilityId(f: Facility): string {
  return JSON.stringify([
    f.demo,
    f.name,
    f.name_kana,
    f.address,
    f.city,
    f.prefecture,
    f.lat,
    f.lng,
    f.category,
    f.business_type,
    f.source,
  ]);
}
export function dedupe(rows: Facility[]): Facility[] {
  const records = new Map<string, Facility>();
  for (const f of rows) {
    const id = facilityId(f),
      old = records.get(id);
    records.set(
      id,
      old
        ? {
            ...old,
            licenses: [...new Set([...old.licenses, ...f.licenses])],
            attributions: [
              ...new Set([...old.attributions, ...f.attributions]),
            ],
            source: [
              ...new Set([
                ...old.source.split(" / "),
                ...f.source.split(" / "),
              ]),
            ]
              .filter(Boolean)
              .join(" / "),
          }
        : f,
    );
  }
  return [...records.values()];
}
export function parseResponse(v: unknown): {
  facilities: Facility[];
  received: number;
} {
  if (!obj(v) || !Array.isArray(v.results) || v.results.length > 200)
    throw new Error("APIの応答形式が変わった可能性があります。");
  return {
    facilities: dedupe(v.results.map(normalizeFacility)),
    received: v.results.length,
  };
}
function validStoredFacility(v: unknown): v is Record<string, unknown> {
  if (!obj(v)) return false;
  const textFields = [
    "name",
    "name_kana",
    "prefecture",
    "city",
    "address",
    "category",
    "business_type",
    "source",
  ];
  return (
    textFields.every(
      (key) => typeof v[key] === "string" && (v[key] as string).length <= 10000,
    ) &&
    typeof v.demo === "boolean" &&
    (v.lat === null ||
      (typeof v.lat === "number" &&
        Number.isFinite(v.lat) &&
        Math.abs(v.lat) <= 90)) &&
    (v.lng === null ||
      (typeof v.lng === "number" &&
        Number.isFinite(v.lng) &&
        Math.abs(v.lng) <= 180))
  );
}
export function parseBackup(raw: string): Candidate[] {
  if (raw.length > 5_000_000)
    throw new Error("ファイルが大きすぎます（5MBまで）。");
  const v: unknown = JSON.parse(raw);
  if (
    !obj(v) ||
    v.version !== 1 ||
    !Array.isArray(v.candidates) ||
    v.candidates.length > MAX_SAVED
  )
    throw new Error("対応していないバックアップ形式です。");
  const seen = new Set<string>();
  return v.candidates.map((r: unknown) => {
    if (
      !obj(r) ||
      !validStoredFacility(r.facility) ||
      !Array.isArray(r.facility.licenses) ||
      !Array.isArray(r.facility.attributions) ||
      !r.facility.licenses.every((s) => typeof s === "string") ||
      !r.facility.attributions.every((s) => typeof s === "string") ||
      !STATUSES.includes(r.status as Status) ||
      typeof r.memo !== "string" ||
      r.memo.length > 5000 ||
      typeof r.savedAt !== "string" ||
      !Number.isFinite(Date.parse(r.savedAt)) ||
      typeof r.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(r.updatedAt))
    )
      throw new Error(
        "候補・出典・メモの形式が不正です。取り込みを中止しました。",
      );
    const facility = normalizeFacility(r.facility),
      id = facilityId(facility);
    if (seen.has(id))
      throw new Error("バックアップ内に重複した候補があります。");
    seen.add(id);
    return {
      id,
      facility,
      status: r.status as Status,
      memo: r.memo,
      savedAt: r.savedAt,
      updatedAt: r.updatedAt,
    };
  });
}
export function mergeCandidates(
  existing: Candidate[],
  incoming: Candidate[],
): Candidate[] {
  const map = new Map(existing.map((c) => [c.id, c]));
  // Local notes win; imported attribution is never discarded.
  for (const c of incoming) {
    const old = map.get(c.id);
    map.set(
      c.id,
      old ? { ...old, facility: dedupe([old.facility, c.facility])[0] } : c,
    );
  }
  if (map.size > MAX_SAVED) throw new Error(`保存上限は${MAX_SAVED}件です。`);
  return [...map.values()];
}
export function loadCandidates(storage: Pick<Storage, "getItem">): {
  candidates: Candidate[];
  error: string;
} {
  try {
    const raw = storage.getItem(STORE_KEY);
    return { candidates: raw ? parseBackup(raw) : [], error: "" };
  } catch {
    return {
      candidates: [],
      error:
        "保存データを読み込めません。元データを保護するため保存を停止しています。元データを退避し、別のブラウザでバックアップを確認してください。",
    };
  }
}
export function saveCandidates(
  storage: Pick<Storage, "setItem">,
  candidates: Candidate[],
): void {
  storage.setItem(STORE_KEY, JSON.stringify({ version: 1, candidates }));
}
export function createCandidate(facility: Facility): Candidate {
  const now = new Date().toISOString();
  return {
    id: facilityId(facility),
    facility,
    status: "未訪問",
    memo: "",
    savedAt: now,
    updatedAt: now,
  };
}
export function demoFacilities(lat: number, lng: number): Facility[] {
  return [
    "こもれび喫茶",
    "青空ベーカリー",
    "まちかど食堂",
    "ふたば雑貨店",
    "つむぎ珈琲",
    "朝凪オフィス",
  ].map((name, i) =>
    normalizeFacility({
      name: `【架空】${name}`,
      address: "デモ用の架空施設・実在しません",
      category: i < 3 ? "restaurant" : "unknown",
      lat: lat + ((i % 3) - 1) * 0.003,
      lng: lng + (Math.floor(i / 3) - 0.5) * 0.006,
      source: "架空デモ",
      licenses: ["CC0-1.0"],
      attributions: ["まちの候補帳：動作確認用の架空データ"],
      demo: true,
    }),
  );
}
