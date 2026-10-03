import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import {
  createCandidate,
  demoFacilities,
  facilityId,
  loadCandidates,
  MAX_SAVED,
  mergeCandidates,
  parseBackup,
  saveCandidates,
  STATUSES,
  STORE_KEY,
  type Candidate,
  type Facility,
  type Status,
} from "./domain";
import { searchFacilities, type SearchArea } from "./api";
import { exportBackup } from "./notices";

const presets = [
  { name: "東京駅", lat: 35.681236, lng: 139.767052 },
  { name: "横浜駅", lat: 35.4662, lng: 139.6227 },
  { name: "名古屋駅", lat: 35.1709, lng: 136.8815 },
  { name: "大阪駅", lat: 34.7025, lng: 135.4959 },
  { name: "博多駅", lat: 33.5902, lng: 130.4207 },
];
const $ = <T extends HTMLElement = HTMLInputElement>(s: string) =>
  document.querySelector<T>(s)!;
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  cls = "",
) => {
  const n = document.createElement(tag);
  n.textContent = text;
  n.className = cls;
  return n;
};
$("#app").innerHTML = `
<header><a class="brand" href="./"><span class="brand-icon">◎</span><span>まちの候補帳<small>FIELD NOTES / 訪問営業の下調べ</small></span></a><span class="local-badge">● 端末内に保存</span></header>
<main><section class="intro"><div><p class="eyebrow">街を知る。次の一軒を見つける。</p><h1>訪問前のひと調べを、<br class="mobile-only">ひとつの地図に。</h1><p>候補を探して、気になる場所を保存。訪問の記録を少しずつ。</p></div><div class="intro-note"><strong>01 探す → 02 保存 → 03 記録</strong><span>ログイン不要・営業メモは外部送信しません</span></div></section>
<section class="workspace"><aside class="sidebar"><div class="search-panel"><div class="section-heading"><h2>エリアを探す</h2><span class="step">01 / SEARCH</span></div>
<form id="search-form"><label>地域プリセット<select id="preset">${presets.map((p, i) => `<option value="${i}">${p.name}周辺</option>`).join("")}</select></label><div class="form-row"><label>検索範囲<select id="scope"><option value="center">プリセットの周辺</option><option value="bbox">地図の表示範囲</option></select></label><label>半径<select id="radius"><option value="500">500m</option><option value="1000" selected>1km</option><option value="3000">3km</option></select></label></div>
<label>施設名・検索語<input id="query" maxlength="100" placeholder="例：カフェ / 書店" value="カフェ"></label><p class="hint">複数語は「いずれか」を検索（OR）。地域は上の範囲で絞ります。</p>
<div class="form-row"><label>取得上限<select id="limit"><option>50</option><option>100</option><option>200</option></select></label><label>データ<select id="mode"><option value="demo">架空デモ</option><option value="live">OpenPOI 実データ</option></select></label></div><button class="primary" id="search" type="submit">このエリアで探す <span>↗</span></button><button id="cancel" type="button" hidden>検索を中止</button></form>
<p class="hint">実検索では検索語と範囲をOpenPOIへ送信します。メモや顧客情報を検索語に入れないでください。</p></div>
<div class="list-panel"><div class="tabs" role="tablist" aria-label="候補の表示"><button role="tab" id="results-tab" aria-selected="true">検索結果 <span id="result-count">0</span></button><button role="tab" id="saved-tab" aria-selected="false">保存した候補 <span id="saved-count">0</span></button></div><label id="status-filter-label" hidden>訪問状況で絞る<select id="status-filter"><option value="all">すべての状況</option>${STATUSES.map((s) => `<option>${s}</option>`).join("")}</select></label><p id="message" role="status" aria-live="polite"></p><div id="cards"></div></div></aside>
<section class="map-panel" aria-label="施設候補の地図"><div class="map-toolbar"><span id="map-label">東京駅周辺</span><button id="map-search">表示範囲で検索</button></div><div id="map" aria-label="地図。矢印キーで移動、プラス・マイナスで拡大縮小"></div><div class="map-caption"><span id="map-status">架空デモ / 背景地図は通信しません</span><span>● 候補 <b>● 保存済み</b></span></div><p id="tile-error" role="status" hidden>背景地図を取得できません。候補と保存リストは引き続き利用できます。</p><div class="map-bottom"><h2>現地で確かめるための、下調べに。</h2><p>営業時間・連絡先・口コミ・決裁者・徒歩経路は含まれません。閉業や位置ずれ、未収録の施設があります。</p></div></section></section>
<section class="data-panel"><div><h2>候補帳を持ち出す・引き継ぐ</h2><p>JSONに訪問状況・メモ・出典をまとめて保存。取り込み時は既存のメモを優先します。</p></div><div class="data-actions"><button id="export">JSONを書き出す</button><label class="file-button">JSONを取り込む<input type="file" id="import" accept="application/json,.json"></label></div><p id="storage-error" role="alert" hidden></p><button id="raw-export" hidden>元の保存データを退避</button><p id="data-message" role="status"></p><p class="hint">このブラウザ・このURL内の保存です。端末間同期や暗号化はありません。共有端末の利用に注意し、定期的にバックアップしてください。</p></section>
<footer><p>施設データ：<a href="https://openpoiapi.com/attribution.html" target="_blank" rel="noopener">OpenPOI API / 出典・ライセンス</a> ・ <a href="https://docs.openpoiapi.com/legal.html" target="_blank" rel="noopener">利用規約</a></p><p>出典：Japan Food Facilities（各自治体・厚生労働省のオープンデータを加工して作成）のデータを加工して作成。加工の主体：OpenPOI API。表示・重複整理・訪問メモの付与：まちの候補帳。</p><p>Overture Maps Foundation, overturemaps.org ・ Geolonia 住所データ（geolonia/japanese-addresses）, Geolonia Inc. / CC BY 4.0</p><p>施設ごとの出典は各カード内に表示。<a href="${new URL("../legal/foursquare-notice.txt", import.meta.url).href}">Foursquare NOTICE全文</a> ・ <a href="${new URL("../legal/apache-2.0.txt", import.meta.url).href}">Apache License 2.0</a> ・ <a href="${new URL("../legal/cdla-permissive-2.0.txt", import.meta.url).href}">CDLA 2.0</a> ・ <a href="${new URL("../legal/leaflet-license.txt", import.meta.url).href}">Leaflet license</a> ・ <a href="https://www.openstreetmap.org/fixthemap">地図の問題を報告</a></p><p>APIの無料提供と地図配信の条件は別です。大規模公開の前に配信元の条件・容量を確認してください。</p></footer></main>`;
let storage: Storage | undefined;
try {
  storage = window.localStorage;
} catch {
  /* Browsers may disable storage. */
}
const loaded = storage
  ? loadCandidates(storage)
  : {
      candidates: [],
      error:
        "ブラウザの保存機能が無効です。保存には利用可能なブラウザが必要です。",
    };
let candidates = loaded.candidates,
  storageBlocked = !!loaded.error;
let lastStored: string | null = null;
try {
  lastStored = storage?.getItem(STORE_KEY) ?? null;
} catch {
  /* load error is already visible */
}
let results: Facility[] = [],
  tab: "results" | "saved" = "results";
let controller: AbortController | undefined,
  sequence = 0,
  nextSearch = 0;
const map = L.map("map", {
  minZoom: 5,
  maxZoom: 19,
  zoomControl: true,
}).setView([presets[0].lat, presets[0].lng], 15);
const markers = L.layerGroup().addTo(map);
let tiles: L.TileLayer | undefined;
const tileUrl =
  import.meta.env.VITE_TILE_URL ||
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const tileAttribution =
  import.meta.env.VITE_TILE_ATTRIBUTION ||
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
function setupTiles() {
  const live = $("#mode").value === "live";
  if (live && !tiles) {
    tiles = L.tileLayer(tileUrl, {
      attribution: tileAttribution,
      maxZoom: 19,
      keepBuffer: 0,
      updateWhenIdle: true,
    });
    tiles.on("tileerror", () => {
      $("#tile-error").hidden = false;
    });
    tiles.addTo(map);
  } else if (!live && tiles) {
    map.removeLayer(tiles);
    tiles = undefined;
    $("#tile-error").hidden = true;
  }
  $("#map-status").textContent = live
    ? "OpenStreetMap / オンライン背景地図"
    : "架空デモ / 背景地図は通信しません";
}
function reportStorage(message: string) {
  $("#storage-error").textContent = message;
  $("#storage-error").hidden = !message;
  $("#raw-export").hidden = !storageBlocked || !storage;
}
reportStorage(loaded.error);
function commit(next: Candidate[]) {
  if (storageBlocked || !storage) {
    reportStorage(
      loaded.error ||
        "保存を停止しています。JSONを退避してページを再読込してください。",
    );
    return false;
  }
  try {
    if (storage.getItem(STORE_KEY) !== lastStored) {
      storageBlocked = true;
      reportStorage(
        "別タブで保存内容が変更されました。入力を退避して再読込してください。",
      );
      return false;
    }
    if (new Blob([exportBackup(next)]).size > 5_000_000)
      throw new Error("backup-size");
    saveCandidates(storage, next);
    lastStored = storage.getItem(STORE_KEY);
    candidates = next;
    $("#saved-count").textContent = String(candidates.length);
    reportStorage("");
    return true;
  } catch {
    reportStorage(
      "端末への保存に失敗しました。容量・バックアップ上限5MB・ブラウザ設定を確認してください。入力欄の内容は残っています。再編集して保存を試すか、内容をコピーして退避してください。",
    );
    return false;
  }
}
function visible(): Facility[] {
  return tab === "results"
    ? results
    : candidates
        .filter(
          (c) =>
            $("#status-filter").value === "all" ||
            c.status === $("#status-filter").value,
        )
        .map((c) => c.facility);
}
function render() {
  $("#result-count").textContent = String(results.length);
  $("#saved-count").textContent = String(candidates.length);
  $("#results-tab").setAttribute("aria-selected", String(tab === "results"));
  $("#saved-tab").setAttribute("aria-selected", String(tab === "saved"));
  $("#status-filter-label").hidden = tab !== "saved";
  const cards = $("#cards");
  cards.replaceChildren();
  markers.clearLayers();
  const facilities = visible();
  if (!facilities.length)
    cards.append(
      el(
        "div",
        tab === "saved"
          ? "まだ候補がありません。検索結果から保存して、自分の候補帳をつくりましょう。"
          : "エリアと検索語を選んで検索してください。デモでは架空の6施設をお試しできます。",
        "empty",
      ),
    );
  facilities.forEach((f, i) => {
    const id = facilityId(f),
      saved = candidates.find((c) => c.id === id);
    const card = el("article", "", "card");
    card.id = `card-${i}`;
    const top = el("div", "", "card-top");
    top.append(
      el("span", String(i + 1).padStart(2, "0"), "number"),
      el(
        "span",
        f.demo
          ? "架空デモ"
          : f.category && f.category !== "unknown"
            ? f.category
            : "カテゴリ不明",
        "category",
      ),
    );
    card.append(
      top,
      el("h3", f.name || "名称未提供"),
      el(
        "p",
        f.address ||
          [f.prefecture, f.city].filter(Boolean).join("") ||
          "住所未提供",
        "address",
      ),
    );
    if (f.lat === null || f.lng === null)
      card.append(el("p", "座標なし：地図には表示できません", "hint"));
    const actions = el("div", "", "card-actions");
    if (f.lat !== null && f.lng !== null) {
      const focus = el("button", "地図で見る");
      focus.onclick = () => {
        map.setView([f.lat!, f.lng!], 16);
        $("#map").scrollIntoView({ behavior: "smooth", block: "center" });
      };
      actions.append(focus);
      const marker = L.marker([f.lat, f.lng], {
        icon: L.divIcon({
          className: "pin-wrapper",
          html: `<span class="pin ${saved ? "saved" : ""}">${i + 1}</span>`,
          iconSize: [32, 38],
          iconAnchor: [16, 38],
        }),
        title: f.name || "名称未提供",
      });
      const popup = el("div");
      popup.append(el("strong", f.name || "名称未提供"));
      const jump = el("button", "候補カードへ");
      jump.onclick = () =>
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      popup.append(jump);
      marker.bindPopup(popup).addTo(markers);
    }
    if (!saved) {
      const save = el("button", "＋ 候補に保存", "save");
      save.disabled = storageBlocked;
      save.onclick = () => {
        if (!canNavigate()) return;
        if (candidates.length >= MAX_SAVED) {
          $("#message").textContent =
            "保存上限1000件です。不要な候補を削除してください。";
          return;
        }
        if (commit([...candidates, createCandidate(f)])) {
          render();
          $("#message").textContent = "候補を端末に保存しました。";
        }
      };
      actions.append(save);
    } else actions.append(el("span", "✓ 保存済み", "saved-label"));
    card.append(actions);
    if (saved) {
      const label = el("label", "訪問状況"),
        select = el("select");
      select.setAttribute("aria-label", `${f.name}の訪問状況`);
      for (const s of STATUSES) {
        const option = el("option", s);
        option.value = s;
        select.append(option);
      }
      select.value = saved.status;
      label.append(select);
      const noteLabel = el("label", "営業メモ（端末内のみ）"),
        note = el("textarea");
      note.value = saved.memo;
      note.maxLength = 5000;
      note.rows = 3;
      note.placeholder = "次回の訪問で確認したいことなど";
      note.setAttribute("aria-label", `${f.name}の営業メモ`);
      noteLabel.append(note);
      const state = el(
        "small",
        "変更は入力ごとに端末へ保存します。",
        "memo-state",
      );
      const update = () => {
        const next = candidates.map((c) =>
          c.id === id
            ? {
                ...c,
                status: select.value as Status,
                memo: note.value,
                updatedAt: new Date().toISOString(),
              }
            : c,
        );
        const ok = commit(next);
        state.textContent = ok
          ? "端末に保存しました"
          : "未保存：入力内容をコピーして退避してください";
        state.classList.toggle("unsaved", !ok);
        if (!ok) {
          note.dataset.unsaved = "true";
        } else delete note.dataset.unsaved;
      };
      select.onchange = update;
      note.oninput = update;
      const remove = el("button", "候補から削除", "remove");
      remove.onclick = () => {
        if (!canNavigate()) return;
        if (
          window.confirm("この候補と訪問メモを端末から削除しますか？") &&
          commit(candidates.filter((c) => c.id !== id))
        )
          render();
      };
      card.append(label, noteLabel, state, remove);
    }
    const details = el("details"),
      summary = el("summary", "出典・ライセンス");
    details.append(
      summary,
      el("p", `提供元：${f.source || "未提供"}`),
      el(
        "p",
        `ライセンス：${f.licenses.join(" / ") || "未提供（再利用前に要確認）"}`,
      ),
    );
    for (const a of f.attributions) details.append(el("p", a));
    if (!f.attributions.length)
      details.append(
        el("p", "出典情報未提供。再利用前に提供元へ確認してください。"),
      );
    card.append(details);
    cards.append(card);
  });
}
function unsaved() {
  return !!document.querySelector("[data-unsaved]");
}
function canNavigate() {
  if (!unsaved()) return true;
  $("#message").textContent =
    "未保存の入力があります。入力をコピーして退避するか、再編集して保存してから操作してください。";
  return false;
}
function stopSearch() {
  sequence++;
  controller?.abort();
  controller = undefined;
  $("#search").disabled = false;
  $("#cancel").hidden = true;
}
async function search(useBounds = false) {
  if (!canNavigate()) return;
  if ($("#mode").value === "live" && Date.now() < nextSearch) {
    $("#message").textContent = "連続検索を控えるため、3秒ほどお待ちください。";
    return;
  }
  stopSearch();
  const run = sequence;
  controller = new AbortController();
  const active = controller;
  const preset = presets[Number($("#preset").value)];
  $("#message").textContent = "検索中…";
  $("#search").disabled = true;
  $("#cancel").hidden = false;
  const timeout = window.setTimeout(() => active.abort("timeout"), 15000);
  try {
    if ($("#mode").value === "demo") {
      results = demoFacilities(preset.lat, preset.lng);
      $("#message").textContent =
        "架空デモ6件。検索語に関係なくサンプルを表示しています。実在の施設ではありません。";
      map.setView([preset.lat, preset.lng], 15);
    } else {
      nextSearch = Date.now() + 3000;
      const b = map.getBounds();
      const area: SearchArea =
        useBounds || $("#scope").value === "bbox"
          ? { bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] }
          : {
              center: [preset.lng, preset.lat],
              radius: Number($("#radius").value),
            };
      const limit = Number($("#limit").value),
        response = await searchFacilities(
          $("#query").value,
          area,
          limit,
          active.signal,
        );
      if (run !== sequence) return;
      // A draft may have become unsaved while the request was in flight.
      if (!canNavigate()) return;
      results = response.facilities;
      const missing = results.filter(
        (f) => f.lat === null || f.lng === null,
      ).length;
      $("#message").textContent =
        `${results.length}件の候補を取得${response.received !== results.length ? `（完全一致の重複${response.received - results.length}件を整理）` : ""}。${!results.length ? "範囲や検索語を変えてお試しください。" : ""}${response.received >= limit ? "取得上限に達しました。全件ではありません。範囲を狭めてください。" : "地域内の全施設数ではありません。"}${missing ? ` 座標なし${missing}件。` : ""}`;
    }
    tab = "results";
    render();
  } catch (error) {
    if (run !== sequence) return;
    $("#message").textContent = active.signal.aborted
      ? "検索がタイムアウトしました。候補・メモは保持しています。"
      : `${error instanceof Error ? error.message : "通信エラーです。"} 候補は保持しています。架空デモも利用できます。`;
  } finally {
    clearTimeout(timeout);
    if (run === sequence) {
      $("#search").disabled = false;
      $("#cancel").hidden = true;
      controller = undefined;
    }
  }
}
// Typed element access keeps DOM construction free of API-provided HTML.
$("#search-form").onsubmit = (e) => {
  e.preventDefault();
  void search();
};
$("#map-search").onclick = () => {
  $("#scope").value = "bbox";
  void search(true);
};
$("#cancel").onclick = () => {
  stopSearch();
  $("#message").textContent =
    "検索を中止しました。既存の候補は保持しています。";
};
$("#preset").onchange = () => {
  stopSearch();
  const p = presets[Number($("#preset").value)];
  map.setView([p.lat, p.lng], 15);
  $("#map-label").textContent = `${p.name}周辺`;
  $("#message").textContent = "地域を変更しました。検索結果は前回のものです。";
};
$("#mode").onchange = () => {
  stopSearch();
  setupTiles();
  $("#message").textContent =
    "データモードを変更しました。検索結果は前回のものです。";
};
$("#scope").onchange = () => {
  $("#radius").disabled = $("#scope").value === "bbox";
};
$("#results-tab").onclick = () => {
  if (canNavigate()) {
    tab = "results";
    render();
  }
};
$("#saved-tab").onclick = () => {
  if (canNavigate()) {
    tab = "saved";
    render();
  }
};
$("#status-filter").onchange = () => {
  if (canNavigate()) render();
};
function download(content: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json;charset=utf-8" }),
  );
  const a = el("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("#export").onclick = () => {
  if (!canNavigate()) return;
  download(
    exportBackup(candidates),
    `field-sales-map-${new Date().toISOString().slice(0, 10)}.json`,
  );
  $("#data-message").textContent =
    "JSONを書き出しました。メモを含むため共有先に注意してください。";
};
$("#raw-export").onclick = () => {
  try {
    download(
      storage?.getItem(STORE_KEY) || "",
      "field-sales-map-recovery.json",
    );
  } catch {
    $("#data-message").textContent =
      "元データにもアクセスできません。ブラウザ設定を確認してください。";
  }
};
$("#import").onchange = async () => {
  const input = $<HTMLInputElement>("#import"),
    file = input.files?.[0];
  if (!file) return;
  try {
    if (!canNavigate()) return;
    if (file.size > 5_000_000) throw new Error("ファイルは5MBまでです。");
    const raw = await file.text();
    // Recheck after asynchronous file reading, before merging or re-rendering.
    if (!canNavigate()) return;
    const incoming = parseBackup(raw);
    const merged = mergeCandidates(candidates, incoming);
    if (commit(merged)) {
      tab = "saved";
      render();
      $("#data-message").textContent =
        `${incoming.length}件を確認し、合計${merged.length}件になりました。既存のメモを優先しました。`;
    }
  } catch (e) {
    $("#data-message").textContent =
      `取り込み中止：${e instanceof Error ? e.message : "形式を確認してください。"} 既存データは変更していません。`;
  } finally {
    input.value = "";
  }
};
window.addEventListener("storage", (event) => {
  if (event.key === STORE_KEY || event.key === null) {
    storageBlocked = true;
    stopSearch();
    reportStorage(
      "別タブで保存内容が変更されました。競合を防ぐため、このタブの保存を停止しました。入力を退避してから再読込してください。",
    );
  }
});
window.addEventListener("beforeunload", (event) => {
  if (unsaved()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
render();
