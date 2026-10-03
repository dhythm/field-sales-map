import apache from "../legal/apache-2.0.txt?raw";
import cdla from "../legal/cdla-permissive-2.0.txt?raw";
import foursquare from "../legal/foursquare-notice.txt?raw";
import type { Candidate } from "./domain";
export function exportBackup(candidates: Candidate[]) {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      candidates,
      dataNotice: {
        provider: "OpenPOI API https://api.openpoiapi.com",
        sourceDetails: "https://openpoiapi.com/attribution.html",
        jff: "出典：Japan Food Facilities（各自治体・厚生労働省のオープンデータを加工して作成）のデータを加工して作成。加工の主体：OpenPOI API。",
        jffSources:
          "https://gl20percentclub.github.io/japan-food-facilities/attribution.html",
        modifications:
          "まちの候補帳：表示用の欠損値・座標の正規化、完全一致レコードの整理、利用者による訪問状況・メモの付与。施設ごとのlicenses/attributionsは保持。",
        licenseTexts: { "Apache-2.0": apache, "CDLA-Permissive-2.0": cdla },
        foursquareNotice: foursquare,
        licenseLinks: {
          "CC BY 2.0": "https://creativecommons.org/licenses/by/2.0/",
          "CC BY 2.1 JP": "https://creativecommons.org/licenses/by/2.1/jp/",
          "CC BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
          "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
          "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
          "PDL1.0":
            "https://www.digital.go.jp/resources/open_data/public_data_license_v1.0",
        },
        warning:
          "元データの出典条件を維持して再配布してください。営業メモを含むため共有先に注意。架空データはdemo=trueです。",
      },
    },
    null,
    2,
  );
}
