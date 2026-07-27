import { test, expect } from '@playwright/test';
import { createServer } from 'http';

// URLモードはリモートの md をアプリと同一オリジンへ流し込む。
// サニタイズが外れると、悪意ある md を 1 つ開くだけで /api/file や /api/fs を
// アプリの権限で叩けてしまうため、ここを回帰テストで固定する。

const EVIL_MD = [
  '# リモート',
  '',
  '生 img: <img src=x onerror="window.__pwned_img=1">',
  '',
  '<script>window.__pwned_script=1<\/script>',
  '',
  '<iframe src="data:text/html,<script>parent.__pwned_frame=1<\/script>"></iframe>',
  '',
  '[click](javascript:window.__pwned_href=1)',
  '',
  '```mermaid',
  '</div><img src=y onerror="window.__pwned_mermaid=1">',
  '```',
  '',
].join('\n');

const CLEAN_MD = [
  '# 正常系',
  '',
  '```mermaid',
  'graph LR',
  '  A[開始] --> B[完了]',
  '```',
  '',
  '| 列 | 値 |',
  '|----|----|',
  '| x  | 1  |',
  '',
  '数式: $E = mc^2$',
  '',
].join('\n');

let server, origin;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const body = req.url.startsWith('/clean') ? CLEAN_MD : EVIL_MD;
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

/** URL モードに切り替えて指定 URL を開く。 */
async function openUrl(page, url) {
  await page.goto('/');
  await page.locator('#mode-btn-url').click();
  await page.locator('#folder-input').fill(url);
  await page.locator('#btn-open').click();
  await page.locator('#file-view:not(.hidden)').waitFor();
}

test('悪意あるリモート md のスクリプトが実行されない', async ({ page }) => {
  await openUrl(page, `${origin}/evil.md`);

  const pc = page.locator('#preview-content');
  await expect(pc.locator('h1')).toHaveText('リモート');

  // どの経路でも JS が動いていないこと
  const pwned = await page.evaluate(() => Object.keys(window).filter((k) => k.startsWith('__pwned')));
  expect(pwned).toEqual([]);

  // 危険な要素・属性が残っていないこと
  await expect(pc.locator('script')).toHaveCount(0);
  await expect(pc.locator('iframe')).toHaveCount(0);
  const onAttrs = await page.evaluate(() => {
    const hits = [];
    document.querySelectorAll('#preview-content *').forEach((el) => {
      for (const a of el.attributes) if (/^on/i.test(a.name)) hits.push(`${el.tagName}[${a.name}]`);
    });
    return hits;
  });
  expect(onAttrs).toEqual([]);
  const jsHrefs = await page.evaluate(() =>
    [...document.querySelectorAll('#preview-content a')]
      .filter((a) => /^javascript:/i.test(a.getAttribute('href') || '')).length);
  expect(jsHrefs).toBe(0);
});

test('サニタイズしても通常のレンダリングは壊れない', async ({ page }) => {
  await openUrl(page, `${origin}/clean.md`);

  const pc = page.locator('#preview-content');
  await expect(pc.locator('table')).toBeVisible();
  await expect(pc.locator('.katex')).toBeVisible();

  const diagram = pc.locator('.mermaid');
  await expect(diagram.locator('svg')).toBeVisible();
  await expect(diagram).not.toContainText('Syntax error');

  await expect(page.locator('#outline-panel .outline-item')).toHaveCount(1);
});

test('サニタイザを読み込めない場合は生 HTML を表示しない (fail-closed)', async ({ page }) => {
  // DOMPurify の配信を落として、フォールバックが安全側に倒れるか見る
  await page.route('**/vendor/purify.min.js', (route) => route.abort());
  await openUrl(page, `${origin}/evil.md`);

  const pc = page.locator('#preview-content');
  await expect(pc.locator('.error-msg')).toBeVisible();
  await expect(pc.locator('.error-msg')).toContainText('DOMPurify');
  // 本文が一切描画されていないこと
  await expect(pc.locator('h1')).toHaveCount(0);
  const pwned = await page.evaluate(() => Object.keys(window).filter((k) => k.startsWith('__pwned')));
  expect(pwned).toEqual([]);
});
