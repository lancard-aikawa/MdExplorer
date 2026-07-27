import { relative, resolve, isAbsolute } from 'path';

/**
 * target が root の中 (root 自身を含む) に収まっているか判定する。
 *
 * 重要: Windows の path.relative() は「ドライブが違うと相対パスを作れず、
 * 引数をそのまま返す」。つまり relative('C:\\root', 'D:\\Windows\\win.ini')
 * は 'D:\\Windows\\win.ini' になる。先頭が '..' でも区切り文字でもないため、
 * 素朴な startsWith('..') チェックだけでは別ドライブが素通りしてしまう。
 * そこで isAbsolute() で明示的に弾く。
 *
 * 併せて resolve() を通し、相対パス (cwd 依存) や '.' / '..' 混じりの
 * 入力も正規化してから比較する。
 *
 * API のパス検証 (server.js の isAllowedPath) と、ツリー走査時の
 * シンボリックリンク先チェック (fileScanner.js) の両方から使う。
 * 片方だけ直しても穴が残るため、判定はここ 1 箇所に集約する。
 */
export function isInside(root, target) {
  if (!root || !target) return false;
  let rel;
  try {
    rel = relative(resolve(root), resolve(target));
  } catch {
    return false;
  }
  if (rel === '') return true;        // root 自身
  if (isAbsolute(rel)) return false;  // 別ドライブ / 別 UNC 共有
  // 区切りは環境で '\\' / '/' が混じりうるので両方で分割して先頭要素を見る
  return rel.split(/[\\/]/)[0] !== '..';
}
