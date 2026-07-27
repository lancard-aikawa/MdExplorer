import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedPath } from '../src/server.js';

// isAllowedPath は /api/file (読み書き)・/api/preview・/api/image・
// /api/fs/rename・DELETE /api/fs が共有する唯一の防御線。
// 「別ドライブだと path.relative がガードを素通りする」回帰を二度と入れないため、
// 境界ケースをここで固定する。

const isWin = process.platform === 'win32';
const ROOT = isWin ? 'C:\\root' : '/root';
const p = (...segs) => segs.join(isWin ? '\\' : '/');

test('ルート自身は許可', () => {
  assert.equal(isAllowedPath(ROOT, ROOT), true);
});

test('ルート直下・深い階層のファイルは許可', () => {
  assert.equal(isAllowedPath(p(ROOT, 'a.md'), ROOT), true);
  assert.equal(isAllowedPath(p(ROOT, 'sub', 'deep', 'b.md'), ROOT), true);
});

test('末尾に区切り文字が付いたルートでも許可', () => {
  assert.equal(isAllowedPath(p(ROOT, 'a.md'), ROOT + (isWin ? '\\' : '/')), true);
});

test('親ディレクトリへの脱出は拒否', () => {
  assert.equal(isAllowedPath(p(ROOT, '..', 'evil.md'), ROOT), false);
  assert.equal(isAllowedPath(p(ROOT, 'sub', '..', '..', 'evil.md'), ROOT), false);
});

test('同一ドライブのルート外は拒否', () => {
  assert.equal(isAllowedPath(isWin ? 'C:\\Windows\\win.ini' : '/etc/passwd', ROOT), false);
});

test('ルート名の前方一致だけの兄弟ディレクトリは拒否', () => {
  // C:\root2 は C:\root で startsWith すると通ってしまう。区切り単位で判定する。
  assert.equal(isAllowedPath(p(ROOT + '2', 'a.md'), ROOT), false);
});

test('currentRoot / filePath が未設定なら拒否', () => {
  assert.equal(isAllowedPath(p(ROOT, 'a.md'), null), false);
  assert.equal(isAllowedPath(p(ROOT, 'a.md'), ''), false);
  assert.equal(isAllowedPath(null, ROOT), false);
  assert.equal(isAllowedPath('', ROOT), false);
});

test('別ドライブは拒否 (path.relative が絶対パスを返すケース)', { skip: !isWin }, () => {
  // 回帰テスト本体: 修正前はここが true になっていた
  assert.equal(isAllowedPath('D:\\Windows\\win.ini', 'C:\\root'), false);
  assert.equal(isAllowedPath('E:\\secrets\\key.txt', 'C:\\root'), false);
  assert.equal(isAllowedPath('C:\\root\\a.md', 'D:\\root'), false);
});

test('別の UNC 共有は拒否 / 同一 UNC 共有内は許可', { skip: !isWin }, () => {
  const unc = '\\\\wsl.localhost\\Ubuntu\\home\\aikawa\\oss';
  assert.equal(isAllowedPath(unc + '\\a.md', unc), true);
  assert.equal(isAllowedPath('\\\\other\\share\\a.md', unc), false);
  assert.equal(isAllowedPath('C:\\root\\a.md', unc), false);
  assert.equal(isAllowedPath(unc + '\\a.md', 'C:\\root'), false);
});

test('前方スラッシュ表記でも同じ判定になる', { skip: !isWin }, () => {
  assert.equal(isAllowedPath('C:/root/sub/a.md', 'C:\\root'), true);
  assert.equal(isAllowedPath('C:/root/../evil.md', 'C:\\root'), false);
  assert.equal(isAllowedPath('D:/evil.md', 'C:\\root'), false);
});
