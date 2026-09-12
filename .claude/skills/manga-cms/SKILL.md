---
name: manga-cms
description: 漫画蔵書サイトの microCMS データを更新する。未所持フラグ(not_owned)の設定、表紙画像URLの追記、巻の追加・削除、連載/完結(is_serialized)の修正など。ebookjapan から巻一覧・表紙URL・完結状態を取得する手順も含む。「未所持にして」「表紙を入れて」「完結してるのに連載中になってる」「◯巻を追加して」といった依頼で使う。
---

# 漫画蔵書 microCMS の更新

microCMS (`istoneyou-manga`) の `manga` API と、そのフロント (`src/App.tsx`) を扱う。
巻の実在確認・表紙画像・完結判定は **ebookjapan** から取る。

## 最初に読むこと — 3つの落とし穴

### 1. 下書きがあると PATCH が公開版に反映されない

コンテンツが `PUBLISH_AND_DRAFT`（公開中＋下書きあり）だと、Content API の PATCH は
**HTTP 200 を返すのに公開版もプレビューも変わらない**。更新前に必ず下書きを畳む。

```
mcp__microcms__microcms_get_content_meta  → status を確認
mcp__microcms__microcms_patch_content_status(status="PUBLISH")  → 下書きを排除
その後 PATCH
```

更新後は必ず GET し直して反映を確認する。200 は成功の証拠にならない。

### 2. `covers` は配列ごと置換される

`covers` は repeater なので、PATCH では**配列全体を送る**。1要素だけの部分更新はできない。
GET した covers を加工して丸ごと投げ直す。事前にバックアップを取ること。

### 3. `covers[].title` を必ず見る

`title` が空なら「作品タイトル + index巻」で表示されるが、**別シリーズを通し巻数でまとめている
作品では title が入っている**。これを見ないと巻数を取り違える。

- 青のミブロ: DB 15巻〜 = 「青のミブロー新選組編ー 1巻」〜
- BLUE GIANT: DB 11〜21 = SUPREME、22〜30 = EXPLORER、31〜 = MOMENTUM

`series-ids.json` の `series_parts` に既知の対応がある。巻数のズレを見つけたら、
未発売と決めつける前に **title を確認**すること。

## データ構造

`manga` (list, 198件)

| フィールド | 型 | 備考 |
|---|---|---|
| `title` | text | 作品名 |
| `is_serialized` | boolean | 連載中 |
| `magazine` / `is_transferred` | relation → magazines | |
| `covers` | repeater (`cover`) | 巻ごと。**配列の index+1 が巻数** |

`covers` の custom field `cover`:

| フィールド | 備考 |
|---|---|
| `cover` | 表紙画像URL |
| `title` | 空なら「作品タイトル + N巻」。別シリーズ時のみ入る |
| `not_owned` | true = 未所持 |

`cover` は ebookjapan 以外のURL（Amazon、講談社等）も混在している。
**当時 ebookjapan に無かったもので意図的なので、勝手に置き換えない。**

## ebookjapan から取得する

`scripts/ebj.py` を使う。

```bash
python3 scripts/ebj.py volumes <seriesId>         # 巻番号 -> publicationCd
python3 scripts/ebj.py covers  <seriesId> 14 15   # 表紙URL(JSON)
python3 scripts/ebj.py status  <seriesId>         # 最新巻と完結フラグ
```

### 手順1: 作品名 → シリーズID

`series-ids.json` にあればそれを使う。無ければ **WebFetch** で検索する。

```
WebFetch https://ebookjapan.yahoo.co.jp/search/?keyword=<作品名>
「本編の作品ページURL（/books/数字/）と、完結ラベルの有無」を聞く
```

**検索ページは curl だと HTTP 500 になる**（UA やヘッダを足しても通らない）。
ここだけ WebFetch が要る。判明したIDは `series-ids.json` に追記しておくと次回が速い。

同名・派生作品に注意（ONE PIECE のモノクロ版/カラー版、本編とスピンオフ等）。
既存の1巻の表紙URLと突き合わせれば確実に判定できる。

### 手順2以降は ebj.py が自動でやる

仕組み（デバッグ時のために記載）:

1. `/books/{seriesId}/` の `<script id="__NUXT_DATA__">` に Nuxt 3 の flat payload がある。
   `publicationCd` を持つオブジェクトの**先頭2件がその作品の1巻と最新巻**（3件目以降はレコメンドの別作品）
2. 最新巻のページ `/books/{seriesId}/{publicationCd}/` を開くと、payload に**全巻**の
   `{publicationCd, name, volumeName}` が入っている → 巻番号の対応表ができる
3. 各巻ページのHTMLから表紙URLを正規表現で抜く

```python
r'https://cache2-ebookjapan\.akamaized\.net/contents/thumb/[a-z]/[A-Z0-9]+\.jpg\?[0-9]+'
```

一覧ページの画像は遅延ロードでプレースホルダしか出ないが、**巻の個別ページには実URLが
ちょうど1件だけ**出るので取り違えない。`<title>` に巻数が入るので必ず照合する。

表紙IDは推測できない（同日発売の別作品が連番になるだけで規則性なし）。必ずページから取る。

## 未発売の巻を消す

`volumes` の対応表に無い巻 = ebookjapan 未発売。過去に実在しない巻が水増し登録されていた。

ただし**消す前に `covers[].title` を確認**すること（落とし穴3）。別シリーズなら実在する。
削除は末尾からやれば index がずれない。

## 完結判定 (`is_serialized`)

`status` が返す `complete` は payload の `isLastVolume`。**単行本ベースの判定**である点に注意。

- **連載が終わっていても最終巻が未刊なら False になる**
  （例: ホタルの嫁入りは2026年1月に本編完結済みだが12巻に最終回未収録のため False）
- 検索結果の「完結」ラベルより `isLastVolume` の方が正確なことがある
  （例: チェンソーマンはラベルなしだがフラグは True で、実際は完結）

判断に迷ったら **WebSearch で「作品名 完結 最終巻」を確認する**。フラグだけを信じない。

**シリーズをまとめている作品は本編だけ見ても判定できない。**
賭博黙示録カイジは第1部13巻が完結でも、破戒録・堕天録と続くのでシリーズとしては連載中。
`series_parts` にある作品や、続編があり得る作品は必ず確認する。

## 更新の型

```python
# 1. GET してバックアップ
# 2. covers を加工
# 3. status を PUBLISH にして下書きを畳む
# 4. PATCH {"covers": [...]}   ※配列丸ごと
# 5. GET し直して検証
```

複数作品をまとめて更新するときは、件数と内容を先に一覧で出してユーザーに見せる。

## フロント側 (`src/App.tsx`)

- ライブラリ表示は `not_owned !== true` の巻だけを数える／表示する
- 未所持ページは作品単位でまとめ、件数をバッジで出す。詳細モーダルは `pageMode` で
  表示する巻を出し分ける（library=所持のみ、unowned=未所持のみ）
- 一覧は `.mangaGrid` / `.mangaCard` に統一（`data-view` でカード/リスト切替）

変更後は `npm run build` で型チェックまで通す。

## 認証

`.env.local` の `VITE_MICROCMS_API_KEY` が読み書き両方に使える。
MCP サーバー (`microcms`) も同じキーで、`.mcp.json` ではなく `~/.claude.json` の
プロジェクト設定に入っている。
