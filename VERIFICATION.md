# 検証記録と引き継ぎ

検証日：2026-10-03 (UTC)。新規作業ディレクトリ：`/workspace/field-sales-map`。

## 完了した検証

- Node.js v24.19.0。
- `npm run typecheck`：成功。
- `npm run lint`：ESLint 10、成功。
- `npm test`：Vitest 11テスト成功。
- `npm run build`：TypeScript + Viteの本番ビルド成功。
- `E2E_PREVIEW=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e`：本番配信物を対象にdesktop / Pixel 7エミュレーションで24テスト成功（検索応答・JSON読取中の未保存メモ保護を含む）。
- `npm audit` および `npm audit --omit=dev`：検証時点で脆弱性0件。
- スクリーンショットのPC・モバイル表示を目視確認。画像はgit対象外の `test-results/` に保存。
- 実行ブラウザ：既設のChromium 151.0.7922.173。Playwrightのブラウザ追加ダウンロードは403 `Domain forbidden`のため利用せず。CIでは通常のPlaywright Chromiumインストールを使う。

単体テスト：座標欠損/範囲外、同名同座標の慎重な同定、完全一致行の出典統合、APIスキーマ、地域と検索語の分離、JSONの日本語/改行/メタデータ往復、ライセンスとNOTICE全文、取り込み前の形式・重複・過大データ検証、既存メモ優先、破損・容量不足。

ブラウザテスト：デモ検索、候補保存、状態/メモ変更、再読込、JSONダウンロード/取り込み、不正インポートの原子性、別タブ競合、容量不足時の未保存内容保護、bbox送信、0件/200件上限/座標欠損、XSS文字列、429/500/不正応答/タイムアウト、検索キャンセル/古い応答、デモとメモ操作の外部通信ゼロ、配布画面からの完全なライセンス/NOTICEアクセス。

**通常CIのテストはAPIをモックし、OSMタイルを遮断。別の手動検証では下記の少数リクエストだけを実施し、大量取得・タイル走査は行っていません。**

## GitHub公開：当初のCLIブロッカーと解決経路

- 正規GitHubコネクタのプロフィール照会で `dhythm` を確認。
- 環境内の `gh api user` → `Get "https://api.github.com/user": Forbidden`。
- `gh repo view dhythm/field-sales-map --json name,url` → `Post "https://api.github.com/graphql": Forbidden`。
- `gh repo create dhythm/field-sales-map --public --description ...` → `Get "https://api.github.com/users/dhythm": Forbidden`。作成の成功は確認できず、repo名の未使用確認も未完了。
- `gh auth status` は環境の `GH_TOKEN` をinvalidと報告。ただしネットワーク層のForbiddenの影響があり得るため、トークンそのものの失効と断定していない。
- 提供されたGitHubコネクタツールには新規repository作成機能がなかった。
- 追加認証・権限拡大・迂回・既存repoへの代替pushは行っていない。
- `visit-list` は参照・流用・編集・pushのいずれも行っていない。環境の既存 `skills` checkoutにも変更なし（git statusで確認）。

その後、既存認証済みの通常のGitHubブラウザで新規public repository [dhythm/field-sales-map](https://github.com/dhythm/field-sales-map)を作成。正規GitHubコネクタで所有者・public属性・空repoを確認し、検証済みファイルを公開する経路に切り替えました。CLI認証・proxy設定は変更していません。CIは[Actions](https://github.com/dhythm/field-sales-map/actions)に記録されます。正確な公開commit SHA・CI run URLと内容一致の確認結果は最終報告に記載します。

## 実通信検証：成功結果と当初の環境制約

2026-10-03、GitHub Actionsの正規ランナーで[Manual live smoke #1](https://github.com/dhythm/field-sales-map/actions/runs/37142175574)を実施。対象commit：`d3736f25d6f470eed1ea727efa88cf004ee4e9bc`。親側の実行確認に加え、GitHubコネクタからrunの成功とジョブログ内の個別結果を確認しました。

| 検証                   | 結果               | 確認した範囲                                                           |
| ---------------------- | ------------------ | ---------------------------------------------------------------------- |
| 実API HTTP             | success / HTTP 200 | 東京駅の公開座標、半径300m、limit=2。返却2件、応答形式正常             |
| CORSヘッダー           | 許可Origin `*`     | Origin `http://127.0.0.1:4173` を送信して確認                          |
| 実ブラウザCORS＋アプリ | success / HTTP 200 | Chromiumでセキュリティ設定を緩めず実fetchを1回。候補50件をアプリに表示 |
| OSM単一タイルHTTP      | success / HTTP 200 | 東京駅のタイル1枚、PNG signature正常、36,275 bytes                     |
| 実背景地図の視覚確認   | 未実施             | ブラウザのタイル取得は意図して遮断。地図移動・巡回なし                 |

API合計2回・タイル1回、リトライなし。workflow summaryおよび`manual-live-smoke` artifactにreport.jsonと画面を保存（artifactは14日間）。将来の可用性やデータ品質を保証する検証ではありません。成功済みの実通信を通常CIで繰り返す設計にはしていません。

当初、この作業環境で1回試行した検索はHTTP 403（`server: envoy`）でした。これは当該環境の通信制約の記録であり、その後の正規GitHub Actionsランナーでの成功を未確認扱いにしません。CLI認証・proxy設定の変更や追加認証は行っていません。

## 残件

Web公開を進める場合に必要な作業：

1. 公開先・利用規模・地図配信条件を確定し、デプロイ承認を得る。サイトは未デプロイ。
2. 通常の対話ブラウザで実背景地図・帰属の表示を目視確認する。単一画像HTTPの成功とは分けて扱う。

任意の将来案・追加検証：チーム共有/同期、CRM/MCP連携、CSV、PWA、経路最適化、Safari/Firefox・実スマートフォン。同時タブの完全トランザクション保証とオフライン再起動は現在の仕様外です。

Library転送は標準アップロードヘルパーの最初のツール照会がnetworkエラーで停止し、library_file_idは未確認。ただしソースは公開GitHub、画像・検証証跡はCI artifactから取得できるため実装のブロッカーではありません。

## 独立レビュー後の修正

検索開始時だけでなくAPI応答到着時、JSONファイル読取完了時にも未保存入力を再確認し、再描画によるメモ喪失を防止。遅延応答/読取の間に保存が容量不足で失敗するケースをPC・モバイルで回帰検証し、textarea本文・未保存フラグ・beforeunload保護が残ることを確認。座標は有限numberまたは非空の10進numeric stringに限定し、空白・配列・boolean等をゼロに変換しない。

通常CIと分離した`Manual live smoke`（`.github/workflows/live-smoke.yml`）を追加。workflow_dispatch専用で、`confirm_live_requests=true`でAPI最大2回、`check_single_tile=true`ならOSMタイル1枚のHTTP確認を追加。結果は観測レポートに記録し、外部障害をコードテスト失敗として扱わない。実通信の個別結果は上の実行記録に記載。

## ActionsのNode 24移行

2026-10-03時点の公式READMEとv7/action.ymlを確認し、checkout・setup-node・upload-artifactをv4からv7へ更新しました。いずれもNode 24 runtime。現行GitHub-hosted ubuntu-latestランナーは2.337.0で、必要な2.327.1以上を満たします。Node 24、npm cache、複数パスと14日artifact保存、contents:read権限を維持しています。checkout v7の変更対象となるpull_request_target/workflow_runトリガーは本プロジェクトでは使っていません。

公式確認先：[checkout](https://github.com/actions/checkout)、[setup-node](https://github.com/actions/setup-node)、[upload-artifact](https://github.com/actions/upload-artifact)。更新後は通常CIで確認し、live smokeは繰り返しません。
