# Supabase商品カタログ

添付されたME_FIT.xlsxのデータをもとに、登録用SQLとアプリの公開読み取り接続を用意しています。
実際のSupabaseへの適用状況は、実行結果・件数・公開API応答で確認してください。
SQLファイルや公開設定ファイルがあるだけでは、クラウドDBの登録完了を意味しません。

## 新規プロジェクトへの登録

1. `setup.sql`：5テーブルを作成しRLSを有効化。
2. `seed.sql`：16ブランド・120商品・827色番・13色コード・56件の人気根拠を登録。
3. `read-access.sql`：anon/authenticatedにSELECTのみを許可。
4. `reference-colors.sql`：2026-11-15に確認した公式参考色767色を追加。`(shade_id,position)`が既存ならスキップし、既存色は保持。

同名の既存テーブルがある場合は、作成SQLを適用する前に構造とデータを照合してください。
データ登録は同じIDがあれば上書きせずスキップします。削除処理は含みません。
情報の更新に使う場合は差分確認が必要です。
公開カタログには個人情報・写真・管理用秘密情報を入れません。

管理API接続が使える場合は次のスクリプトが、既存テーブルを確認してから3つのSQLを1トランザクションで実行します。
既存の対象テーブルがあれば自動適用を停止します。

```sh
# 読み取りのみで対象プロジェクトとテーブルを確認
python3 scripts/supabase-admin.py PROJECT_REF
# 新規プロジェクトへの登録（事前確認後）
python3 scripts/supabase-admin.py PROJECT_REF --apply
```

管理用トークンは環境設定で`SUPABASE_ACCESS_TOKEN`として安全に設定してください。
スクリプトに秘密情報を記入しないでください。管理APIの送信先は`api.supabase.com`です。
登録後に件数とSELECTポリシーを検証し、公開用anonキーだけを`data/supabase-public.json`に保存します。

## 列と確認日の扱い

`schema.sql`は基礎のテーブル定義です。`setup.sql`は同じ定義とRLS有効化を含む実行用SQLです。
Excelの`verified_on`を、既存のTIMESTAMP列ではその日付の00:00:00として保存します。
これは日付だけを格納するための規約で、実際の確認時刻を表すものではありません。
不明な価格・発売日・色コードにはNULLを使い、仮値を入れていません。
価格未登録25商品、商品発売日未登録120商品、Excel取込時点では色コード未登録814色です。公式参考色追加後、DBは780色・未登録47色です。アプリでは既存27色がさらに補完され、未登録20色になります。
出典URLの内容や事実関係は、今回外部サイトで再確認したものではなくExcelの提供値です。

## 既存アプリとの関係

7商品・27色番が従来データと一致しています。
Excelに含まれない既存のrom&nd商品と12色番は、アプリ側で維持します。
DBに従来の8商品・39色すべてを移すSQLではありません。
アプリはDBのカタログと従来データを商品ID・色番で統合し、121商品・839色番を表示します。
DB上の商品・色番IDを後から変更すると紐付けが変わるため、IDは固定してください。

## 確認クエリ

```sql
SELECT 'brands' AS table_name, COUNT(*) AS rows FROM public.brands
UNION ALL SELECT 'products', COUNT(*) FROM public.products
UNION ALL SELECT 'shades', COUNT(*) FROM public.shades
UNION ALL SELECT 'shade_colors', COUNT(*) FROM public.shade_colors
UNION ALL SELECT 'popularity_evidence', COUNT(*) FROM public.popularity_evidence;
```

公式参考色追加後の期待値は16、120、827、780、56です（seedのみなら色コード13件）。DB登録後は`/api/catalog`が`source: "supabase"`を返すことも確認します。

## 公式参考色の追加

`reference-colors.sql`はスキーマ・RLS・読み取り権限を変更せず、既存色を上書きしません。再実行しても色は増えません。採色の出典と画像ハッシュ、採色範囲、未登録理由は`../data/reference-colors.json`に保存しています。画像由来の参考色は`swatch_estimate`、公式ページの表示用HEXは`official_value`です。`opacity`は測定していないためNULLを保持します。

2026-11-15に適用し、追加767件の`shade_id|color_hex|color_source_url|color_method`を色番ID順・改行区切りで連結したMD5が、保存データとDBで`1ace06927af22635537fcfd8a5da639c`と一致しました。
