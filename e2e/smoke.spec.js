import { test, expect } from '@playwright/test';
import { makeTempRoot, openFolder, openFile, expandDir } from './helpers.js';

const FILES = {
  'a.md': [
    '# 見出しA',
    '',
    '- [sub/b.md へ](sub/b.md)',
    '',
    '| 列 | 値 |',
    '|----|----|',
    '| x  | 1  |',
    '',
    '```js',
    'const a = 1;',
    '```',
    '',
    '数式: $E = mc^2$',
    '',
  ].join('\n'),
  'sub/b.md': [
    '# 見出しB',
    '',
    '```mermaid',
    'graph LR',
    '  A[開始] --> B[完了]',
    '```',
    '',
    '- [親の a.md へ](../a.md)',
    '',
  ].join('\n'),
};

// タグ付けなど状態を残すテストがあるため、フィクスチャはテストごとに作り直す
// (共有するとリトライ時にフラグのトグルが逆になる等で不安定になる)。
let fixture;
test.beforeEach(() => { fixture = makeTempRoot(FILES); });
test.afterEach(() => fixture.dispose());

test('フォルダを開くとツリーとプレビューが描画される', async ({ page }) => {
  await openFolder(page, fixture.inputPath);
  await expect(page.locator('.tree-file[data-rel="a.md"]')).toBeVisible();

  await openFile(page, 'a.md');
  await expect(page.locator('#preview-content h1')).toHaveText('見出しA');
  await expect(page.locator('#preview-content table')).toBeVisible();
  // コードブロックのハイライトとコピーボタン
  await expect(page.locator('#preview-content pre code')).toBeVisible();
  await expect(page.locator('#preview-content .copy-btn')).toBeVisible();
  // KaTeX (サーバ側レンダリング + /vendor の CSS/フォント)
  await expect(page.locator('#preview-content .katex')).toBeVisible();
  // アウトラインに見出しが載る
  await expect(page.locator('#outline-panel .outline-item')).toHaveCount(1);
});

test('Mermaid 図が SVG として描画される', async ({ page }) => {
  await openFolder(page, fixture.inputPath);
  await expandDir(page, 'sub');
  await openFile(page, 'sub/b.md');
  await expect(page.locator('#file-breadcrumb')).toContainText('b.md');

  const diagram = page.locator('#preview-content .mermaid');
  await expect(diagram.locator('svg')).toBeVisible();
  // 「Syntax error」の図が出ていないこと (エスケープ処理の回帰検知)
  await expect(diagram).not.toContainText('Syntax error');
  // ズーム UI が付く
  await expect(diagram.locator('.mermaid-controls')).toBeVisible();
});

test('タグとフラグを保存するとツリーに反映される', async ({ page }) => {
  await openFolder(page, fixture.inputPath);
  await openFile(page, 'a.md');

  await page.locator('#tag-input').fill('重要');
  await page.locator('#tag-input').press('Enter');
  await expect(page.locator('#tags-list .tag-chip')).toHaveText('重要×');

  await page.locator('#btn-flag').click();
  await expect(page.locator('#btn-flag')).toHaveText('★');
  await expect(page.locator('.tree-file[data-rel="a.md"] .flag-star')).toBeVisible();
});

test('全文検索が結果を返す', async ({ page }) => {
  await openFolder(page, fixture.inputPath);
  await page.locator('#btn-fulltext').click();
  await page.locator('#fulltext-input').fill('見出しB');

  const item = page.locator('#fulltext-results .ft-item');
  await expect(item).toHaveCount(1, { timeout: 10_000 });
  await expect(item).toContainText('b.md');
});
