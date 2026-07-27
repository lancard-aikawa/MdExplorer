# E2E テスト

Playwright による E2E テスト。レビューで修正した不具合の回帰検知が主目的。

## 実行

```bash
pnpm run test          # 単体テスト (node:test) のみ
pnpm run test:e2e      # E2E のみ
pnpm run test:all      # 両方
pnpm run test:e2e:ui   # UI モードで対話的に実行 / デバッグ
```

`playwright test` がサーバ (`node src/cli.js`) を自動で起動・停止する。
手動でサーバを立てておく必要はない。

## 前提

- **ブラウザはシステムの Chrome を使う** (`channel: 'chrome'`)。
  Playwright 同梱ブラウザは 150MB 超のダウンロードが要るため避けている。
  Chrome が無い環境で動かす場合は `npx playwright install chromium` した上で
  `playwright.config.js` の `channel` を外す。
- ポートは既定 13998 (`E2E_PORT` で変更可)。開発中のインスタンス (13847) とは
  ぶつからない。

## テストが実データを壊さないための仕掛け

アプリは履歴・タグ・ツリーキャッシュを `~/.mdexplorer/` に書く。そのまま
テストを回すと実際のユーザーデータが毎回書き換わるため、`MDEXPLORER_HOME`
で保存先を差し替えられるようにしてある (`src/appHome.js`)。
`playwright.config.js` の `webServer.env` で使い捨てディレクトリを渡している。

閲覧対象の Markdown フォルダも、テストごとに `os.tmpdir()` 配下へ作って
後始末する (`helpers.js` の `makeTempRoot`)。リポジトリ内に固定の
フィクスチャを置いていないのは、保存・リネーム・削除を伴うテストがあるため。

## 直列実行にしている理由

サーバは 1 プロセスで「いま開いているフォルダ」を 1 つしか持たない設計
なので、並列に走らせると互いの `currentRoot` を奪い合う。
`workers: 1` / `fullyParallel: false` は意図的な設定。

## 何を守っているか

| ファイル | 対象 |
|---|---|
| `smoke.spec.js` | ツリー・プレビュー・Mermaid・KaTeX・タグ・全文検索の基本動作 |
| `security.spec.js` | パス検証、mermaid/wikilink の HTML 注入、Host/Origin 検証、エラー応答、警告バーのエスケープ |
| `editing.spec.js` | 未保存編集の破棄確認、保存、相対リンクの `..` 解決、ファイル操作 |
| `url-mode.spec.js` | リモート md のサニタイズ (XSS 阻止・正常系維持・fail-closed) |

`isAllowedPath` のドライブ跨ぎ判定は E2E では再現しにくい (別ドライブが必要)
ため、単体テスト `test/isAllowedPath.test.js` 側で担保している。

## 変異テストによる確認

このスイートが実際に回帰を捕まえることを、修正を意図的に戻して確認済み。

- mermaid の `escHtml(code)` を外す → `security.spec.js` が落ちる
- `escHtml` から `"` のエスケープを外す → `security.spec.js` が落ちる
- `confirmDiscardDirty` を常に true にする → `editing.spec.js` が落ちる
