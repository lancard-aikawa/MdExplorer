import { test, expect } from '@playwright/test';
import { makeTempRoot, openFolder } from './helpers.js';

// レビューで見つかったセキュリティ上の穴の回帰テスト。
// いずれも「修正前は通っていた」ものを、通らないことで固定する。

let fixture;
test.beforeEach(() => { fixture = makeTempRoot({ 'a.md': '# A\n' }); });
test.afterEach(() => fixture.dispose());

test.describe('パス検証', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/folder', { data: { path: fixture.root } });
  });

  test('ルート外のファイルは読めない', async ({ request }) => {
    const outside = process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/passwd';
    const res = await request.get(`/api/file?path=${encodeURIComponent(outside)}`);
    expect(res.status()).toBe(403);
  });

  test('ルート外のファイルは書けない', async ({ request }) => {
    const outside = process.platform === 'win32' ? 'C:\\Windows\\mdx-pwn.txt' : '/tmp/mdx-pwn.txt';
    const res = await request.put(`/api/file?path=${encodeURIComponent(outside)}`, {
      data: { content: 'pwned' },
    });
    expect(res.status()).toBe(403);
  });

  test('ルート外は削除できない', async ({ request }) => {
    const outside = process.platform === 'win32' ? 'C:\\Windows' : '/etc';
    const res = await request.delete('/api/fs', { data: { path: outside } });
    expect(res.status()).toBe(403);
  });

  test('画像アップロードの filename でルート外へ抜けられない', async ({ request }) => {
    const res = await request.post('/api/upload-image', {
      data: { base64: 'iVBORw0KGgo=', filename: '../../PWNED.png', dir: fixture.root },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    // basename が効いてルート直下に落ちる (親へ抜けない)
    expect(body.relativePath).toBe('PWNED.png');
  });
});

test.describe('レンダリング時の HTML 注入', () => {
  test('mermaid ブロックから </div> で脱出できない', async ({ request }) => {
    const res = await request.post('/api/render', {
      data: { content: '```mermaid\n</div><img src=x onerror=alert(1)>\n```\n' },
    });
    const { html } = await res.json();
    expect(html).not.toContain('<img src=x onerror');
    expect(html).toContain('&lt;/div&gt;');
  });

  test('wikilink の href に属性を生やせない', async ({ request }) => {
    const res = await request.post('/api/render', {
      data: { content: 'x: [[evil" onmouseover="alert(1)]]\n' },
    });
    const { html } = await res.json();
    expect(html).not.toContain('onmouseover="alert(1)"');
    expect(html).toContain('&quot;');
  });
});

test.describe('ホスト / オリジン検証', () => {
  test('想定外の Host ヘッダは拒否する (DNS rebinding 対策)', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/api/status`, {
      headers: { Host: 'evil.example.com' },
    });
    expect(res.status()).toBe(403);
  });

  test('他サイトからの Origin は拒否する (CSRF 対策)', async ({ request, baseURL }) => {
    const res = await request.delete(`${baseURL}/api/fs`, {
      headers: { Origin: 'https://evil.example.com' },
      data: { path: fixture.root },
    });
    expect(res.status()).toBe(403);
  });

  test('同一オリジンの Origin は通す', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/api/status`, {
      headers: { Origin: baseURL },
    });
    expect(res.ok()).toBeTruthy();
  });
});

test('サーバエラーでスタックトレースを返さない', async ({ request }) => {
  const res = await request.post('/api/upload-image', {
    headers: { 'Content-Type': 'application/json' },
    data: '{壊れた JSON',
  });
  const body = await res.text();
  expect(body).not.toContain('node_modules');
  expect(body).not.toContain('at Module');
  expect(JSON.parse(body)).toHaveProperty('error');
});

test('警告バーはサーバのエラーメッセージを HTML として解釈しない', async ({ page }) => {
  await openFolder(page, fixture.inputPath);

  // Windows では < > がファイル名に使えないため作成が失敗し、
  // エラーメッセージにこの名前がそのまま載ってくる。
  await page.locator('.tree-root-row').click({ button: 'right' });
  await page.locator('.ctx-menu .ctx-item', { hasText: '新規ファイル' }).click();
  await page.locator('.inline-input').fill('x<img src=q onerror=window.__pwn=1>');
  await page.locator('.inline-input').press('Enter');

  const bar = page.locator('#warning-bar');
  await expect(bar).toBeVisible();
  // テキストとしては出るが、要素としては生成されない
  await expect(bar.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
});
