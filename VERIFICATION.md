# 検証記録と引き継ぎ

検証日：2026-10-03 (UTC)。新規作業ディレクトリ：`/workspace/field-sales-map`。

## 完了した検証

- Node.js v24.19.0。
- `npm run typecheck`：成功。
- `npm run lint`：ESLint 10、成功。
- `npm test`：Vitest 10テスト成功。
- `npm run build`：TypeScript + Viteの本番ビルド成功。
- `E2E_PREVIEW=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e`：本番配信物を対象にdesktop / Pixel 7エミュレーションで20テスト成功（20.8秒）。
- `npm audit` および `npm audit --omit=dev`：検証時点で脆弱性0件。
- スクリーンショットのPC・モバイル表示を目視確認。画像はgit対象外の `test-results/` に保存。
- 実行ブラウザ：既設のChromium 151.0.7922.173。Playwrightのブラウザ追加ダウンロードは403 `Domain forbidden`のため利用せず。CIでは通常のPlaywright Chromiumインストールを使う。

単体テスト：座標欠損/範囲外、同名同座標の慎重な同定、完全一致行の出典統合、APIスキーマ、地域と検索語の分離、JSONの日本語/改行/メタデータ往復、ライセンスとNOTICE全文、取り込み前の形式・重複・過大データ検証、既存メモ優先、破損・容量不足。

ブラウザテスト：デモ検索、候補保存、状態/メモ変更、再読込、JSONダウンロード/取り込み、不正インポートの原子性、別タブ競合、容量不足時の未保存内容保護、bbox送信、0件/200件上限/座標欠損、XSS文字列、429/500/不正応答/タイムアウト、検索キャンセル/古い応答、デモとメモ操作の外部通信ゼロ、配布画面からの完全なライセンス/NOTICEアクセス。

**テストはAPIをモックし、OSMタイルを遮断。実データ取得や大量タイル走査を行っていません。**

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

## 実APIのブロッカー

少数スモークとして1回だけ次の施設検索を試行：

`https://api.openpoiapi.com/v1/search?center=139.767052,35.681236&radius=300&limit=2`

HTTP 403 Forbidden、ヘッダーは `server: envoy` / `content-type: text/plain` / `content-length: 16`。curlは応答bodyの保存に至らず、API本体からのJSON応答は得られなかった。外向き通信のproxy制限が疑われるが、GitHub認証不足との完全な切り分けはできていない。公式ドキュメントは提供されたWeb参照ツールで確認できた。

APIへの成功応答、ブラウザでの実CORS、実OSMタイル表示は未確認。成功したようには扱っていない。接続可能な正規環境で少数リクエストだけを試す必要がある。

## 再開する作業

1. 正規の接続環境で実APIを少数回だけ確認。CIで本番API・地図タイルを叩く設計にはしない。
2. サイトのデプロイは別途承認されたホスト/条件で実施。現時点では未デプロイ。
3. Library転送は標準アップロードヘルパーの最初のツール照会がnetworkエラーで停止。保存完了・library_file_idは未確認。ソースは上記GitHubから取得できます。画像・ブラウザ検証証跡はCI artifactへ保存する定義です。

未検証：Safari、Firefox、実スマートフォン、真のオフライン再起動、同時タブの完全なトランザクション保証、MCPクライアント連携。
