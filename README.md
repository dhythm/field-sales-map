# まちの候補帳 — 訪問営業の下調べマップ

OpenPOI APIで施設候補を探し、地図とカードで確認して、訪問状況・営業メモを端末内に保存する日本語アプリです。新規の独立プロジェクトで、既存の営業リストや非公開情報は使っていません。

**公開コード：[dhythm/field-sales-map](https://github.com/dhythm/field-sales-map)。ローカル実装・検証済み。Webデプロイは行っていません。**

## 起動

Node.js 24 LTS / npm。APIキー・ログイン・データベース・有料AIは不要です。

```sh
npm ci
npm run dev
# 表示された localhost のURLをブラウザで開く
```

```sh
npm run build
npm run preview
```

配信物は `dist/`。静的ホストに載せられる構成ですが、デプロイ処理やGitHub Pagesの公開ワークフローは含めていません。`file://`でHTMLを開く使い方には対応していません。

## 使い方

1. 初期状態は**架空デモ**。地域を選び「このエリアで探す」を押すと、実在しない6施設が表示されます。検索語はデモの結果に影響しません。デモではAPIも背景タイルも取得しません。
2. 実データを探す場合はデータを「OpenPOI 実データ」に切り替えます。地域プリセット＋半径、または地図を移動・拡大して「表示範囲で検索」を選びます。
3. 施設名や業種に関する検索語を入力します。**複数語はOR**なので「カフェ 書店」はいずれかに一致する施設です。地域名を検索語に足さず、地図やプリセットで絞ります。
4. カードの「候補に保存」で端末の候補帳へ。未訪問・訪問済み・再訪・対象外とメモを管理できます。変更は入力ごとに保存され、成功・失敗が表示されます。
5. 「保存した候補」で訪問状況を絞り込み。「JSONを書き出す」でバックアップし、別のブラウザでは「JSONを取り込む」で引き継げます。既存のメモ・状態が優先され、出典は統合されます。

施設ごとの出典・ライセンスはカード内で展開できます。地図マーカーとカード番号が対応し、「地図で見る」やマーカー内の「候補カードへ」で往復できます。保存済み施設は緑のマーカーです。

## 取得・同定・保存の設計

- 検索は明示操作のみ。自動入力補完、移動に伴う自動検索、一括取得、ページ送り、バックグラウンド再試行はありません。
- `GET https://api.openpoiapi.com/v1/search`。`center=lng,lat`と半径、または`bbox=minLng,minLat,maxLng,maxLat`を送ります。1回50/100/200件。3秒の連続検索抑制、15秒タイムアウト、AbortControllerとリクエスト世代チェックがあります。APIの共有レート制限を保証する仕組みではありません。
- 表示範囲は緯度・経度の各幅1度以内に制限。上限到達時には警告を出します。`count`や取得件数を地域内の全施設数と解釈しません。文書化されたページネーションはありません。
- 安定した施設IDはありません。アプリ内IDは名前・カナ・住所・自治体・座標・カテゴリ・提供元・デモフラグのJSON fingerprintです。完全一致の行だけを整理し、licenses/attributionsは和集合にします。曖昧な類似名、同じ座標だけで自動統合しません。提供元の情報が変わると別候補になり得ます。
- カテゴリ不明や座標欠損もカードに残します。空文字の座標を0に変換しません。カテゴリに基づく自動除外や網羅性の推測はしません。
- localStorageの`field-sales-map:v1`、最大1000候補・メモ各5000文字・JSONバックアップ5MBまで。IDは取り込み時に内容から再計算します。
- 壊れた保存データは上書きせず、保存停止と「元の保存データを退避」を表示。容量不足時は入力を残して画面切替を止めます。別タブ変更は保存停止と再読込を案内し、書込直前にも保存値を比較します。localStorageにトランザクションはないため、複数タブの完全同時書込を保証しません。通常は1タブで編集してください。
- 不正JSON、未知のバージョン、重複候補、不正フィールド、過大ファイルは反映前に拒否。外部文字列はtextContentで表示し、HTMLとして評価しません。
- JSONには施設・状態・メモ・時刻とlicenses/attributions、Apache 2.0/CDLA 2.0全文、Foursquare NOTICE全文、ソースリンクと加工通知を同梱。CSVは提供していません。

## プライバシー

営業メモ・訪問状態・保存候補のバックアップはAPIへ送信しません。解析・広告・外部フォント・サーバー保存・AI呼び出しはありません。

実検索では検索語と地理的範囲がOpenPOIに送信され、同サービス側でアクセスログを取得します。実地図では表示範囲に対応するタイルリクエスト、IP・Referer等がタイル配信元へ送信されます。検索語に顧客情報・機密・自宅住所などを入れないでください。端末の位置情報を取得する機能はありません。

保存は同一ブラウザ・同一オリジン内のみ。暗号化・アカウント分離・端末間同期はなく、共有端末やブラウザデータ削除に注意が必要です。データは定期的にJSONへ退避してください。エクスポートに含まれる営業メモは機密になり得ます。Gitや公開issueにアップロードしないでください。

「通信しないデモ」「端末内メモ」は、オフライン地図やPWAを意味しません。アプリ自体の初回読み込みには配信への接続が必要で、オフラインでの再起動を保証しません。

## データとライセンス

2026-10-03に公式ページを確認しました。

- [OpenPOI API仕様](https://docs.openpoiapi.com/): 現在、無料・認証不要・CORS対応。共有レート上限があり、提供形態は変更され得ます。
- [利用規約・プライバシー](https://docs.openpoiapi.com/legal.html): 商用利用可。データ側の出典条件は別途維持が必要で、可用性・回答期限のSLAはありません。
- [出典・ライセンス一覧](https://openpoiapi.com/attribution.html): 施設ごとのlicenses/attributionsを保持し、JFFの加工表示、Overtureの帰属を表示します。
- [Overtureの帰属](https://docs.overturemaps.org/attribution/): 提供元によりCDLA-Permissive-2.0、Apache-2.0、CC0等が異なります。
- 出典：Japan Food Facilities（各自治体・厚生労働省のオープンデータを加工して作成）のデータを加工して作成。[自治体ごとの条件](https://gl20percentclub.github.io/japan-food-facilities/attribution.html)を確認してください。加工の主体：OpenPOI API。アプリの加工：表示用正規化、完全一致レコード整理、利用者の訪問メモ付与。
- Geolonia 住所データ（geolonia/japanese-addresses）, Geolonia Inc. / CC BY 4.0。
- **Foursquareデータの利用者向け：[Foursquare NOTICE全文](legal/foursquare-notice.txt)、[Apache License 2.0全文](legal/apache-2.0.txt)** を収録・書き出しに同梱。[公式NOTICE](https://opensource.foursquare.com/places-notice-txt/)の©2026とAPI帰属のCopyright 2024は一致しない場合があります。APIから来た文字列を黙って改変しません。将来のNOTICE・データ提供元の変更時は再確認が必要です。
- [CDLA-Permissive-2.0全文](legal/cdla-permissive-2.0.txt)も同梱しています。

コードは[MIT](LICENSE)、Leafletは[BSD-2-Clause](legal/leaflet-license.txt)。取得した施設データのライセンスはコードのMITとは別です。デモデータは本アプリが生成した架空データ（CC0）で、実在施設や営業情報を含みません。配布前にライセンス不明のレコードがあれば出典を確認してください。

## 地図配信

Leaflet 1.9.4とOpenStreetMapの標準rasterタイルを使用。背景地図の無料・商用利用条件はOpenPOI APIとは別です。[OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)を確認してください。

- `https://tile.openstreetmap.org/{z}/{x}/{y}.png`。地図上にリンク付き帰属を表示し、通常のブラウザReferer・HTTPキャッシュを使用します。
- プリフェッチ、一括取得、オフライン地図、ヘッドレスでのタイル走査は禁止。ブラウザテストではタイル通信を遮断しています。
- タイル障害でも施設と保存リストは使えます。OSMの提供はbest effortで、商用規模の容量や継続利用を保証しません。
- `.env.example`の`VITE_TILE_URL`・`VITE_TILE_ATTRIBUTION`を変更して再ビルドすれば提供元を交換できます。値は公開されるので秘密鍵を入れないでください。任意HTML帰属は運営者が管理する設定に限定します。
- 公開前には利用規模・提供元の条件・連絡先・配信先のReferer/キャッシュ設定を確認してください。有料契約や新しい認証情報は自動作成しません。

## 構成

```text
src/main.ts         UI・Leaflet・検索世代管理・端末保存
src/domain.ts       データ正規化・同定・バックアップ検証
src/api.ts          検索URL・HTTPエラー処理
src/notices.ts      出典を同梱するJSONエクスポート
src/style.css       PC・モバイルのレイアウト
legal/              ライセンスとNOTICE
tests/             単体・Playwrightテスト
.github/workflows/ci.yml  typecheck / lint / test / build / E2E
```

フレームワークを使わないTypeScript + Vite。依存する実行時ライブラリはLeafletのみです。Node 24、lockfileをコミットし、CIで`npm ci`を使います。

## 検証

```sh
npm run check
npx playwright install --with-deps chromium
npm run test:e2e
# 既設のChromiumを使う環境では
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

ローカルでtypecheck・ESLint・Vitest・本番build・Playwright（desktop/mobile）を実施。具体的な結果と制約は[検証記録](VERIFICATION.md)に記載します。テストは実APIやOSMへ負荷をかけません。スクリーンショットはgit対象外の`test-results/`へ保存し、GitHub Actionsでは14日間のartifactにします。

CIはpush・pull requestで実行します。各commitの結果は[GitHub Actions](https://github.com/dhythm/field-sales-map/actions)で確認できます。ローカル検証とGitHub CIの結果は区別してください。

## MCPと今後の連携

実装はブラウザからREST APIを利用します。MCPや有料AIを裏側で実行しているようには見せていません。

対応MCPクライアントで使う場合の設定例（本アプリとは別、未実機検証）:

```json
{
  "mcpServers": {
    "openpoi": {
      "type": "http",
      "url": "https://api.openpoiapi.com/mcp"
    }
  }
}
```

公式CLI例：`claude mcp add --transport http japan-facilities https://api.openpoiapi.com/mcp`。公開ツールは`search_facilities`と`dataset_info`。クライアントによって設定形式が違うので各公式手順に合わせてください。AIクライアント側の契約・料金、渡す情報の範囲は別途判断が必要です。本アプリはMCP設定の書き込みもAI契約も行いません。

## 限界と保留タスク

- 営業時間・口コミ・連絡先・商談決裁者・徒歩経路は提供されません。閉業、位置ずれ、欠損、重複、未収録を前提に現地確認してください。営業成果や網羅性を保証しません。
- 同一施設の将来の情報変更・曖昧一致の統合、チーム共有、同期、CRM連携、CSV、PWA、経路最適化は未実装。
- **公開コード**：GitHub CLIは環境のForbiddenで利用できなかったため、既存の正規GitHubコネクタから今回専用の新規public repositoryへ公開しました。既存repoへの代替pushはしていません。
- **実通信検証**：この環境でAPIスモークは403（envoy）になり、実API成功・実CORS・実タイル表示は未確認。接続可能な環境で少数リクエストの実機確認が必要です。
- **公開サイト**：ホストと利用規模の確認が必要。未承認のデプロイ・有料契約・認証情報作成は行っていません。
- Safari/Firefoxおよび実スマートフォン端末は未検証。モバイル検証はChromiumのPixel 7エミュレーションです。
