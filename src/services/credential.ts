/**
 * 凭据加密存储模块
 *
 * 使用 expo-secure-store 加密存储 WebDAV 连接凭据（地址、账号、密码）。
 * 遵循 spec-v4.5 §15 安全约束。
 */

import * as SecureStore from 'expo-secure-store';

const KEYS = {
  webdavUrl: 'pstore_webdav_url',
  webdavUsername: 'pstore_webdav_username',
  webdavPassword: 'pstore_webdav_password',
} as const;

export async function getWebDAVCredentials(): Promise<{
  url: string | null;
  username: string | null;
  password: string | null;
}> {
  const [url, username, password] = await Promise.all([
    SecureStore.getItemAsync(KEYS.webdavUrl),
    SecureStore.getItemAsync(KEYS.webdavUsername),
    SecureStore.getItemAsync(KEYS.webdavPassword),
  ]);

  return { url, username, password };
}

function normalizeUrl(raw: string): string {
  return raw.replace(/\/+$/, '');
}

export async function setWebDAVCredentials(
  url: string,
  username: string,
  password: string,
): Promise<void> {
  const normalized = normalizeUrl(url);

  await Promise.all([
    SecureStore.setItemAsync(KEYS.webdavUrl, normalized),
    SecureStore.setItemAsync(KEYS.webdavUsername, username),
    SecureStore.setItemAsync(KEYS.webdavPassword, password),
  ]);
}

export async function clearWebDAVCredentials(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.webdavUrl),
    SecureStore.deleteItemAsync(KEYS.webdavUsername),
    SecureStore.deleteItemAsync(KEYS.webdavPassword),
  ]);
}
