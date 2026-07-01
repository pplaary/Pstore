import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { initDatabase } from './src/db/init';
import { StoreProvider } from './src/context/store';
import RootNavigator from './src/navigation/RootNavigator';
import { ThemeProvider } from './src/theme/ThemeContext';
import { useAIConfigStore } from './src/store/aiConfig';
import type { SQLiteDatabase } from 'expo-sqlite';

function AIInit() {
  useEffect(() => {
    useAIConfigStore.getState().detectReachability();
  }, []);
  return null;
}

function ErrorUI({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorIcon}>⚠️</Text>
      <Text style={styles.errorTitle}>数据库初始化失败</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>重试</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function App() {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const init = useCallback(() => {
    setLoading(true);
    setError(null);
    initDatabase()
      .then((database) => {
        setDb(database);
        setLoading(false);
      })
      .catch((err) => {
        console.error('数据库初始化失败:', err);
        setError(err instanceof Error ? err.message : '未知错误');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (error || !db) {
    return <ErrorUI message={error || '数据库未初始化'} onRetry={init} />;
  }

  return (
    <StoreProvider db={db}>
      <ThemeProvider>
        <AIInit />
        <RootNavigator />
      </ThemeProvider>
    </StoreProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC',
  },
  errorContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 32,
  },
  errorIcon: { fontSize: 48, marginBottom: 16 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#DC2626', marginBottom: 8 },
  errorMessage: { fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 24 },
  retryButton: {
    backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 32, paddingVertical: 12,
  },
  retryButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
