/**
 * WebDAV 配置组件
 *
 * 管理 WebDAV 地址/账号/密码输入，测试连接，导出/恢复备份。
 * 仅在管理模式（editable=true）下可编辑和操作。
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { testConnection } from '../services/webdav';
import { exportToWebDAV } from '../services/backup/export';
import { restoreFromWebDAV } from '../services/backup/restore';
import {
  setWebDAVCredentials,
  getWebDAVCredentials,
} from '../services/credential';
import { useStore } from '../context/store';
import { showToast } from '../utils/toast';
import { useTheme } from '../theme/ThemeContext';

interface WebDAVConfigProps {
  editable: boolean;
}

type ConnState = 'untested' | 'connected' | 'failed';

export function WebDAVConfig({ editable }: WebDAVConfigProps) {
  const { theme } = useTheme();
  const { colors, scale } = theme;
  const { db } = useStore();
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [connState, setConnState] = useState<ConnState>('untested');
  const [testing, setTesting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const styles = useMemo(() => createStyles(colors, scale), [colors, scale]);

  // 加载已保存的凭据
  useEffect(() => {
    getWebDAVCredentials().then((creds) => {
      if (creds.url) setUrl(creds.url);
      if (creds.username) setUsername(creds.username);
      if (creds.password) setPassword(creds.password);
    });
  }, []);

  // 保存凭据到 SecureStore
  const saveCredentials = useCallback(async () => {
    const trimmedUrl = url.trim();
    const trimmedUsername = username.trim();
    if (trimmedUrl && trimmedUsername && password) {
      await setWebDAVCredentials(trimmedUrl, trimmedUsername, password);
    }
  }, [url, username, password]);

  // 测试连接
  const handleTestConnection = useCallback(async () => {
    const trimmedUrl = url.trim();
    const trimmedUsername = username.trim();

    if (!trimmedUrl || !trimmedUsername || !password) {
      showToast('请填写完整的 WebDAV 凭据');
      return;
    }

    // 先保存凭据
    try {
      await saveCredentials();
    } catch {
      showToast('凭据保存失败');
      return;
    }

    setTesting(true);
    try {
      const result = await testConnection();
      if (result.ok) {
        setConnState('connected');
        showToast(`WebDAV 连接成功`);
      } else {
        setConnState('failed');
        showToast(result.error ?? '连接失败');
      }
    } catch (e) {
      setConnState('failed');
      showToast(String(e));
    } finally {
      setTesting(false);
    }
  }, [url, username, password, saveCredentials]);

  // 导出备份
  const handleExport = useCallback(async () => {
    const trimmedUrl = url.trim();
    const trimmedUsername = username.trim();

    // 导出前确保凭据已保存
    if (trimmedUrl && trimmedUsername && password) {
      try {
        await saveCredentials();
      } catch { /* ignore */ }
    }

    setExporting(true);
    try {
      const result = await exportToWebDAV();
      if (result.ok) {
        showToast(
          `备份已导出（${result.remotePath?.split('/').pop() ?? ''}）`,
          'LONG',
        );
      } else {
        showToast(result.error ?? '导出失败');
      }
    } catch (e) {
      showToast(String(e));
    } finally {
      setExporting(false);
    }
  }, [url, username, password, saveCredentials]);

  // 从备份恢复
  const handleRestore = useCallback(async () => {
    const trimmedUrl = url.trim();
    const trimmedUsername = username.trim();

    // 恢复前确保凭据已保存
    if (trimmedUrl && trimmedUsername && password) {
      try {
        await saveCredentials();
      } catch { /* ignore */ }
    }

    Alert.alert(
      '确认恢复',
      '将覆盖当前所有数据，是否继续？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认',
          style: 'destructive',
          onPress: async () => {
            setRestoring(true);
            try {
              const result = await restoreFromWebDAV(undefined, db);
              if (result.ok) {
                Alert.alert(
                  '恢复完成',
                  `数据已从备份恢复（共 ${result.productCount ?? '?'} 件商品），建议重启 App 以重新加载数据库`,
                );
              } else {
                showToast(result.error ?? '恢复失败');
              }
            } catch (e) {
              showToast(String(e));
            } finally {
              setRestoring(false);
            }
          },
        },
      ],
      { cancelable: true },
    );
  }, [url, username, password, db, saveCredentials]);

  // 连接状态文字和颜色
  const statusLabel =
    connState === 'connected'
      ? '● 已连接'
      : connState === 'failed'
        ? '● 连接失败'
        : '○ 未配置';
  const statusColor =
    connState === 'connected'
      ? colors.brand.success
      : connState === 'failed'
        ? colors.brand.danger
        : colors.text.hint;

  return (
    <View>
      <TextInput
        style={styles.input}
        placeholder="https://example.com/webdav"
        placeholderTextColor={colors.text.hint}
        value={url}
        onChangeText={setUrl}
        editable={editable}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        accessibilityLabel="WebDAV地址"
      />
      <TextInput
        style={styles.input}
        placeholder="账号"
        placeholderTextColor={colors.text.hint}
        value={username}
        onChangeText={setUsername}
        editable={editable}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="WebDAV账号"
      />
      <TextInput
        style={styles.input}
        placeholder="密码"
        placeholderTextColor={colors.text.hint}
        value={password}
        onChangeText={setPassword}
        editable={editable}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="WebDAV密码"
      />

      <View style={styles.statusRow}>
        <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>

      <View style={styles.buttonGroup}>
        <TouchableOpacity
          style={[styles.button, styles.testButton, !editable && styles.buttonDisabled]}
          onPress={handleTestConnection}
          disabled={!editable || testing}
        >
          {testing ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.buttonText}>测试连接</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.exportButton, !editable && styles.buttonDisabled]}
          onPress={handleExport}
          disabled={!editable || exporting}
        >
          {exporting ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.buttonText}>导出备份</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.restoreButton, !editable && styles.buttonDisabled]}
          onPress={handleRestore}
          disabled={!editable || restoring}
        >
          {restoring ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.buttonText}>从备份恢复</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['theme']['colors'], scale: number) {
  return StyleSheet.create({
    input: {
      backgroundColor: colors.bg.primary,
      borderRadius: 8 * scale,
      paddingHorizontal: 12 * scale,
      paddingVertical: 10 * scale,
      fontSize: 14 * scale,
      color: colors.text.primary,
      marginBottom: 8 * scale,
    },
    statusRow: {
      marginTop: 4 * scale,
      marginBottom: 8 * scale,
    },
    statusText: {
      fontSize: 13 * scale,
      fontWeight: '500',
    },
    buttonGroup: {
      marginBottom: 8 * scale,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 8 * scale,
    },
    button: {
      flex: 1,
      paddingVertical: 10 * scale,
      borderRadius: 8 * scale,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 40 * scale,
    },
    testButton: {
      backgroundColor: colors.brand.primary,
    },
    exportButton: {
      backgroundColor: colors.brand.success,
    },
    restoreButton: {
      backgroundColor: '#F59E0B', // amber — 语义不同于 brand.warning(#EA580C=orange)
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      color: colors.text.inverse,
      fontSize: 14 * scale,
      fontWeight: '600',
    },
  });
}
