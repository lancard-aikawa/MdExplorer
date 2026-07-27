import { homedir } from 'os';
import { join } from 'path';

/**
 * ユーザーデータ (履歴・タグ・ツリーキャッシュ・ブラウザプロファイル) の置き場。
 *
 * 既定は ~/.mdexplorer。MDEXPLORER_HOME で差し替えられる。
 * これが無いと E2E テストを走らせるたびに実際の履歴やタグが書き換わってしまう
 * (テストは使い捨てのディレクトリを指定して隔離する)。
 */
export function appHome() {
  return process.env.MDEXPLORER_HOME || join(homedir(), '.mdexplorer');
}

export function appHomePath(...segments) {
  return join(appHome(), ...segments);
}
