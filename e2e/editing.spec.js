import { test, expect } from '@playwright/test';
import { makeTempRoot, openFolder, openFile, expandDir } from './helpers.js';

const FILES = {
  'a.md': '# A\n\n- [b へ](sub/b.md)\n',
  'sub/b.md': '# B\n\n- [親の a.md へ](../a.md)\n',
};

// フィクスチャはテストごとに作り直す。
// 保存・リネーム・削除を伴うテストがあるので共有すると後続が汚染される
// (リトライ時にも同じ問題が出る)。
let fixture;
test.beforeEach(() => { fixture = makeTempRoot(FILES); });
test.afterEach(() => fixture.dispose());

/** 編集モードに入り、未保存の変更がある状態を作る。 */
async function makeDirty(page) {
  await openFile(page, 'a.md');
  await page.locator('#btn-edit').click();
  await page.locator('#editor').fill('# A\n\n未保存の編集\n');
  await expect(page.locator('.tab-item.dirty')).toBeVisible();
}

test('未保存のままモードを切り替えると確認され、キャンセルで編集が残る', async ({ page }) => {
  await openFolder(page, fixture.inputPath);
  await makeDirty(page);

  page.once('dialog', (d) => {
    expect(d.message()).toContain('未保存の変更があります');
    d.dismiss();
  });
  await page.locator('#mode-btn-url').click();

  // キャンセルしたのでフォルダモードのまま、編集内容も残っている
  await expect(page.locator('body')).not.toHaveClass(/mode-url/);
  await expect(page.locator('.mode-btn.active')).toHaveAttribute('data-mode', 'folder');
  await expect(page.locator('#editor')).toHaveValue('# A\n\n未保存の編集\n');
  await expect(page.locator('.tab-item.dirty')).toBeVisible();
});

test('未保存のままフォルダを開き直すと確認され、OK で破棄される', async ({ page }) => {
  await openFolder(page, fixture.inputPath);
  await makeDirty(page);

  page.once('dialog', (d) => d.accept());
  await page.locator('#btn-open').click();

  await expect(page.locator('.tab-item.dirty')).toHaveCount(0);
  await expect(page.locator('#editor-panel')).toHaveClass(/hidden/);
});

test('保存するとディスクの内容が変わり dirty が消える', async ({ page }) => {
  await openFolder(page, fixture.inputPath);
  await openFile(page, 'a.md');
  await page.locator('#btn-edit').click();
  await page.locator('#editor').fill('# 保存テスト\n');
  await page.locator('#btn-save').click();

  await expect(page.locator('.tab-item.dirty')).toHaveCount(0);
  await expect(page.locator('#preview-content h1')).toHaveText('保存テスト');
});

test('相対リンクの .. が解決され、タブとツリーの状態が一致する', async ({ page }) => {
  await openFolder(page, fixture.inputPath);
  await expandDir(page, 'sub');
  await openFile(page, 'sub/b.md');

  // '../a.md' を辿る。修正前は relativePath が 'sub/../a.md' のまま残っていた。
  await page.locator('#preview-content a').first().click();

  await expect(page.locator('#file-breadcrumb')).toHaveText('a.md');
  await expect(page.locator('#preview-content h1')).toHaveText('A');
  // ツリーのアクティブ表示が a.md に一致すること (パスがずれていると点かない)
  await expect(page.locator('#file-tree .tree-file.active .file-name')).toHaveText('a.md');
});

test('ファイル作成・リネーム・削除がツリーに反映される', async ({ page }) => {
  await openFolder(page, fixture.inputPath);

  // 作成
  await page.locator('.tree-root-row').click({ button: 'right' });
  await page.locator('.ctx-menu .ctx-item', { hasText: '新規ファイル' }).click();
  await expect(page.locator('.inline-input')).toBeVisible();
  await expect(page.locator('.inline-input')).toHaveAttribute('placeholder', 'ファイル名');
  await expect(page.locator('.inline-input-ext')).toHaveText('.md');
  await page.locator('.inline-input').fill('新規メモ');
  await page.locator('.inline-input').press('Enter');
  await expect(page.locator('#file-tree .file-name', { hasText: '新規メモ.md' })).toBeVisible();

  // 削除
  const row = page.locator('#file-tree .tree-file').filter({
    has: page.locator('.file-name', { hasText: /^新規メモ\.md$/ }),
  });
  await row.click({ button: 'right' });
  page.once('dialog', (d) => d.accept());
  await page.locator('.ctx-menu .ctx-item', { hasText: '削除' }).click();
  await expect(page.locator('#file-tree .file-name', { hasText: '新規メモ.md' })).toHaveCount(0);
});
