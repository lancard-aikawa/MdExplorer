import { readFile } from 'fs/promises';
import { join, normalize } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { writeJsonAtomic } from './jsonStore.js';

// Tags are stored in ~/.mdexplorer/tags/{hash}.json
// where hash = SHA1 of the normalized root path (lowercase, forward slashes)
// This keeps user data folders clean.

const TAGS_DIR = join(homedir(), '.mdexplorer', 'tags');

// 注: case-sensitive な環境では /docs と /Docs が同じファイルを共有するが、
// ここは意図的に変えていない。ハッシュを変えると既存ユーザーのタグが
// 保存先ごと迷子になるため (ツリーキャッシュと違って作り直せないデータ)。
function rootHash(rootPath) {
  const key = normalize(rootPath).toLowerCase().replace(/\\/g, '/');
  return createHash('sha1').update(key).digest('hex');
}

function tagsFile(rootPath) {
  return join(TAGS_DIR, rootHash(rootPath) + '.json');
}

// Legacy path (old location inside the root folder)
function legacyTagsFile(rootPath) {
  return join(rootPath, '.mdexplorer', 'tags.json');
}

export async function loadTags(rootPath) {
  // Try new location first
  try {
    const data = await readFile(tagsFile(rootPath), 'utf8');
    return JSON.parse(data);
  } catch { /* not found yet */ }

  // Migrate from legacy location if exists
  try {
    const data = await readFile(legacyTagsFile(rootPath), 'utf8');
    const tags = JSON.parse(data);
    await saveTags(rootPath, tags); // write to new location
    return tags;
  } catch { /* no legacy either */ }

  return {};
}

export async function saveTags(rootPath, tags) {
  await writeJsonAtomic(tagsFile(rootPath), tags);
}

export async function renameFileTags(rootPath, oldRelative, newRelative) {
  const tags = await loadTags(rootPath);
  const normOld = oldRelative.replace(/\\/g, '/');
  let changed = false;
  for (const key of Object.keys(tags)) {
    const normKey = key.replace(/\\/g, '/');
    if (normKey === normOld) {
      tags[newRelative] = tags[key];
      if (key !== newRelative) delete tags[key];
      changed = true;
    } else if (normKey.startsWith(normOld + '/')) {
      const newKey = newRelative + key.slice(oldRelative.length);
      tags[newKey] = tags[key];
      if (key !== newKey) delete tags[key];
      changed = true;
    }
  }
  if (changed) await saveTags(rootPath, tags);
}

export async function updateFileTags(rootPath, relativePath, patch) {
  const tags = await loadTags(rootPath);
  const current = tags[relativePath] ?? { tags: [], flagged: false, note: '' };
  // undefined のキーは「変更なし」として無視する。
  // 呼び出し元は { tags, flagged, note } を常に 3 キーで渡すため、
  // そのまま spread すると送られなかった項目が undefined で上書きされ、
  // 直後の entry.tags.length で TypeError になっていた。
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const entry = { ...current, ...clean };
  if (!Array.isArray(entry.tags)) entry.tags = [];
  tags[relativePath] = entry;
  if (!entry.flagged && entry.tags.length === 0 && !entry.note) {
    delete tags[relativePath];
  }
  await saveTags(rootPath, tags);
  return tags[relativePath] ?? null;
}
