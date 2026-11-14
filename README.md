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

- `data/catalog.json`：添付Excelから変換した120商品・827色番・13色コード・56件の掲載／受賞履歴。
- `index.html`の既存8商品・39色は、既存のお気に入りや参考色を維持するために残しています。
- `catalog.js`で商品IDと色番により統合します。同一商品・色番は二重追加しません。
- Excelにない既存商品・色も保持するため、統合後は121商品・839色番になります。
- 旧カタログの参考色39色とExcelの13色は重複せず、計52色に表示用色データがあります。
- 色データがない色番は、カタログ・お気に入り・検索に対応し、顔への反映は行いません。
- パレット内の複数色の同時再現は未対応です。
- 情報の出典・価格・受賞歴はExcelに記載された情報です。現時点の順位や販売価格として断定しません。

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
