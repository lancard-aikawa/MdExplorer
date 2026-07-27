import { writeFile, rename, mkdir } from 'fs/promises';
import { dirname } from 'path';

// 直前の書き込みが終わるまで次を待たせるチェーン。
// 設定は「フォルダ履歴の追加」と「ウィンドウ位置の保存 (sendBeacon)」が
// 同時に飛ぶことがあり、直列化しないと temp ファイルを奪い合って壊れる。
let _chain = Promise.resolve();

/**
 * JSON をアトミックに保存する (temp へ書いてから rename)。
 *
 * writeFile で直接上書きすると、書き込み中にプロセスが落ちた場合に
 * 設定やタグが空/半端な内容で残り、次回起動時に全消失する。
 * rename は同一ボリューム内なら原子的で、Windows でも既存ファイルを置換する。
 */
export function writeJsonAtomic(file, value) {
  _chain = _chain.then(
    async () => {
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
      await rename(tmp, file);
    },
    () => { /* 直前の失敗で後続を止めない */ },
  );
  return _chain;
}
