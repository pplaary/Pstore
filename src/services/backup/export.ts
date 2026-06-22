/**
 * 导出备份完整流程
 *
 * 快照导出 → 上传到 WebDAV → 清理本地临时文件。
 * 严格遵循 spec-v4.5 §10 三层数据策略 —— WebDAV 定位为手动冷备份。
 */

import * as FileSystem from 'expo-file-system';
import { exportSnapshot } from './snapshot';
import { uploadBackup } from '../webdav';
import { getWebDAVCredentials } from '../credential';

export interface ExportResult {
  ok: boolean;
  remotePath?: string;
  snapshotPath?: string;
  error?: string;
}

/**
 * 完整导出备份流程。
 *
 * 1. 检查 WebDAV 凭据是否已配置
 * 2. 调用 exportSnapshot() 导出本地 SQLite 快照
 * 3. 生成远程文件名（pstore-backup-{ISO_TIMESTAMP}.db）
 * 4. 上传到 WebDAV
 * 5. 成功后删除本地临时快照；失败则保留供用户手动处理
 */
export async function exportToWebDAV(): Promise<ExportResult> {
  let snapshotPath: string | undefined;

  try {
    // 0. 检查凭据是否已配置
    const creds = await getWebDAVCredentials();
    if (!creds.url || !creds.username || !creds.password) {
      return { ok: false, error: '请先在配置中心填写 WebDAV 凭据' };
    }

    // 1. 导出本地快照
    const snapshot = await exportSnapshot();
    if (!snapshot.ok || !snapshot.snapshotPath) {
      return {
        ok: false,
        error: snapshot.error ?? '快照导出失败',
      };
    }
    snapshotPath = snapshot.snapshotPath;

    // 2. 生成远程文件名（冒号替换为横杠，避免文件系统兼容问题）
    const now = new Date();
    const isoParts = now.toISOString().split('T');
    const dateStr = isoParts[0];
    const timeStr = isoParts[1].replace(/:/g, '-').replace(/\..+/, '');
    const remoteFileName = `pstore-backup-${dateStr}T${timeStr}.db`;

    // 3. 上传到 WebDAV
    const upload = await uploadBackup(snapshotPath, remoteFileName);
    if (!upload.ok) {
      return {
        ok: false,
        snapshotPath,
        error: upload.error ?? '上传失败',
      };
    }

    // 4. 上传成功，清理本地临时快照
    try {
      await FileSystem.deleteAsync(snapshotPath, { idempotent: true });
    } catch {
      // 清理失败不影响结果
      console.warn('清理本地快照失败:', snapshotPath);
    }

    return {
      ok: true,
      remotePath: upload.remotePath,
    };
  } catch (e) {
    return {
      ok: false,
      snapshotPath,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
