# ME FIT

写真を端末内で処理し、コスメの参考色を重ねて試せる静的Webアプリです。
「おすすめ」「試す」「お気に入り」の3画面があります。お気に入りは同じブラウザーのlocalStorageに保存します。
写真はサーバーへ送信・保存しません。

## ローカル起動

```sh
python3 -m http.server 8011 --bind 127.0.0.1 --directory .
```

依存パッケージのインストールやビルドは不要です。
静的サーバーでは`/api/catalog`が404になりますが、`data/catalog.json`のExcelデータを読み込みます。

## 商品データ

- `data/catalog.json`：添付Excelの120商品・827色番・56件の掲載／受賞履歴に、公式サイトで確認した参考色を追加した保存データ。
- `index.html`の既存8商品・39色は、既存のお気に入りや参考色を維持するために残しています。
- `catalog.js`で商品IDと色番により統合します。同一商品・色番は二重追加しません。
- Excelにない既存商品・色も保持するため、統合後は121商品・839色番になります。
- 旧カタログ39色・Excel13色を保持し、2026-11-15に公式サイトから767色を追加。計819色を試せます（DBには780色）。未登録は20色です。
- 色データがない色番は、カタログ・お気に入り・検索に対応し、顔への反映は行いません。
- 公式の表示用HEX（NARS・CLINIQUEの43色）または色番に対応する公式画像の採色値を使います。商品詳細に参考色の出典と採色方法を表示します。
- パレット内の複数色は代表1色として集約します。ラメ・質感・重なりの再現は未対応です。
- `data/reference-colors.json`に767色の出典ページ、画像URL、採色範囲、画像SHA-256、確認日、残る20色の理由を記録しています。原画像はアプリに同梱しません。
- 商品情報・価格・受賞歴はExcelに記載された情報です。現時点の順位や販売価格として断定しません。

## Supabase接続

VercelのNode.js Function `api/catalog.js`が、公開読み取り用のキーで次のテーブルを読み込みます。
`brands`, `products`, `shades`, `shade_colors`, `popularity_evidence`。
同じオリジンのAPIを使うため、ブラウザーからSupabaseへ直接通信する構成ではありません。

接続情報は、Vercelの環境変数 `SUPABASE_URL` と `SUPABASE_PUBLISHABLE_KEY`（または`SUPABASE_ANON_KEY`）、
または`data/supabase-public.json`の`url`・`publishableKey`で設定できます。
このJSONは公開される前提です。公開用キーだけを入れ、管理トークン・service_roleキー・パスワードは絶対に入れません。
管理APIトークン`SUPABASE_ACCESS_TOKEN`はアプリの接続情報として使いません。

DB未設定・通信失敗・空テーブルの場合は、公開済みExcelデータを返します。
読み込み元がSupabaseかExcelかはAPIの`source`に記録し、障害時の代替表示を`degraded`で区別します。
参考色の追加は`database/reference-colors.sql`を実行します。既存の色は上書きしません。
DB接続が完了したと主張する前に、実際のAPI応答の`source: "supabase"`と件数を確認します。

### DBの準備

詳細は`database/README.md`を参照してください。
新規プロジェクトへのテーブル作成・データ登録・公開読み取りポリシーのSQLを用意しています。
実際のSupabase登録は、管理用接続が設定されてから行います。

## Vercel公開

Git連携先：`s2540038-sys/me-fit` の `main`。
公開URL：https://me-fit-nine.vercel.app/

Framework PresetはOther、Root Directoryはリポジトリ直下、Build Commandは空、Output Directoryは`.`。
`api/catalog.js`はVercel Functionとして実行されます。Gitへのpushと、Vercelの公開完了・公開後検証は別々に確認します。

## テスト

準備済みCodex環境のPlaywrightと`/usr/bin/chromium`を使います。

```sh
node tests/catalog.cjs
node tests/ui-smoke.cjs
node tests/import-ui.cjs
```

DBなしでもデータ統合、検索・並べ替え、画像描画、自由なパーツ選択、お気に入り、入力文字列の安全な表示、
静的サーバー／データ取得失敗時の動作を検証します。
管理APIの認証・Supabase上のSQL実行・本番デプロイは、これらのローカルテストだけでは検証されません。

## 公式参考色の確認（2026-11-15）

767色の追加をSupabaseに適用し、780行と追加767行の色・出典・方法のダイジェスト一致を確認しました。3本の既存テストで、写真への色反映、参考色出典、未登録色の扱い、お気に入り、保存データへのフォールバックを確認しています。
未登録20色の内訳は、Fujiko10色・ADDICTION3色（公式画像取得が拒否）、KATE リップモンスター7色（現行公式ページで個別色見本を確認できず）です。これらの参考色は推測で登録していません。
