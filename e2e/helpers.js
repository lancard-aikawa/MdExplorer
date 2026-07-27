import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';

/**
 * 使い捨ての Markdown フォルダを作る。
 * files は { 'a.md': '本文', 'sub/b.md': '本文' } 形式 (キーは posix 区切り)。
 * 返り値の dispose() で削除する。
 */
export function makeTempRoot(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'mdx-e2e-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, ...rel.split('/'));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
  }
  return {
    root,
    // アプリの入力欄には posix 区切りでも渡せる (サーバ側で normalize される)
    inputPath: root.replace(/\\/g, '/'),
    dispose() { try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ } },
  };
}

/** アプリを開いて指定フォルダを読み込ませ、ツリーが描画されるまで待つ。 */
export async function openFolder(page, inputPath) {
  await page.goto('/');
  await page.locator('#folder-input').fill(inputPath);
  await page.locator('#btn-open').click();
  await page.locator('.tree-root-row').waitFor();
}

/**
 * ツリーからファイルを開く。
 * ツリーの data-rel は OS 依存の区切り (Windows なら 'sub\\b.md') になるため、
 * 属性値で引かずファイル名で引く。
 */
export async function openFile(page, relativePath) {
  const name = relativePath.split('/').pop();
  const row = page.locator('#file-tree .tree-file').filter({
    has: page.locator('.file-name', { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }),
  });
  await row.first().click();
  await page.locator('#file-view:not(.hidden)').waitFor();
}

/** ツリー上のディレクトリを展開する。 */
export async function expandDir(page, name) {
  const row = page.locator('#file-tree .tree-dir').filter({
    has: page.locator('.dir-name', { hasText: new RegExp(`^${name}$`) }),
  }).first();
  if ((await row.locator('.dir-arrow').textContent())?.trim() === '▸') await row.click();
}
