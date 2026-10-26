import { advanceTime, freshSave, validateSave } from './engine.ts';
import type { Save } from './engine.ts';

export const SAVE_KEY = 'jihong-game-hut:save:v1';
const BACKUP_KEY = 'jihong-game-hut:backup:v1';
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export type LoadResult = { state: Save; notice: string };
function parse(value: string | null): Save | null { try { return value ? validateSave(JSON.parse(value)) : null; } catch { return null; } }
export function loadSave(storage: StorageLike, now = Date.now()): LoadResult {
  try {
    const raw = storage.getItem(SAVE_KEY), saved = parse(raw);
    if (saved) return { state: advanceTime(saved, now), notice: '' };
    const backup = parse(storage.getItem(BACKUP_KEY));
    if (backup) return { state: advanceTime(backup, now), notice: '已从上一次有效备份恢复小屋存档。' };
    return { state: freshSave(now), notice: raw ? '原存档无法读取，已准备新的小屋。你也可以导入之前的备份。' : '' };
  } catch { return { state: freshSave(now), notice: '浏览器暂不允许保存，请开启站点存储，或及时导出备份。' }; }
}
export function persistSave(storage: StorageLike, state: Save): { ok: boolean; message: string } {
  try {
    const old = storage.getItem(SAVE_KEY);
    if (parse(old)) storage.setItem(BACKUP_KEY, old!);
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    return { ok: true, message: '' };
  } catch { return { ok: false, message: '这次进度暂时无法写入浏览器，请先导出备份，避免刷新后丢失。' }; }
}
export function parseBackup(raw: string): Save | null {
  if (raw.length > 4_000_000) return null;
  try {
    const value = JSON.parse(raw);
    return validateSave(value?.format === 'jihong-game-hut-backup' ? value.save : value);
  } catch { return null; }
}
export function serializeBackup(state: Save) {
  return JSON.stringify({ format: 'jihong-game-hut-backup', version: 1, exportedAt: new Date().toISOString(), save: state }, null, 2);
}
