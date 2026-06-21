/**
 * ScanScreen — 扫码 + 拍照识别双模式
 *
 * spec §8.1 (扫码) / §8.2 (拍照识别) / §5.3 (PendingItem) / §14.2 (超时)
 *
 * 布局：
 * ┌──────────────────────────┐
 * │  [扫码] [拍照]           │  顶部模式切换 Tab（拍照仅 AI 配置时可见）
 * ├──────────────────────────┤
 * │                          │
 * │     Camera Preview       │  扫码: 扫码框覆盖
 * │                          │  拍照: 全屏预览 + 拍照按钮
 * │                          │
 * ├──────────────────────────┤
 * │ 手动输入条码框 + [确认]   │  兜底输入（两种模式都显示，spec §8.1）
 * └──────────────────────────┘
 */

import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  FlatList,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { CameraView, useCameraPermissions, CameraType, type CameraViewRef } from 'expo-camera';
import { useStore } from '../context/store';
import { useCartStore } from '../store/cart';
import { useModeStore } from '../store/mode';
import { useAIConfigStore } from '../store/aiConfig';
import { findByBarcode, createOrUpdate } from '../db/pending';
import { searchProducts } from '../db/search';
import { recognizeProduct } from '../services/vision';
import type { Product } from '../db/types';
import type { ScanScreenProps } from '../navigation/types';

type ScanMode = 'scan' | 'photo';

export function ScanScreen({ navigation }: ScanScreenProps) {
  const { db } = useStore();
  const { addToCart } = useCartStore();
  const { isManagement } = useModeStore();
  const aiConfig = useAIConfigStore((s) => s.config);
  const hasAiConfig = useAIConfigStore((s) => s.hasConfig());

  const [mode, setMode] = useState<ScanMode>('scan');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const [isLoading, setIsLoading] = useState(false);
  const [matchedProduct, setMatchedProduct] = useState<Product | null>(null);
  const [candidates, setCandidates] = useState<
    { name: string; confidence: number; spec?: string }[]
  >([]);
  const [showCandidates, setShowCandidates] = useState(false);

  const lastBarcodeRef = useRef<{ code: string; time: number } | null>(null);
  const cameraRef = useRef<{ takePicture: (opts: { base64?: boolean }) => Promise<{ base64?: string }> } | null>(null);
  const [facing, setFacing] = useState<CameraType>('back');

  const availableModes = useMemo<ScanMode[]>(
    () => (hasAiConfig ? ['scan', 'photo'] : ['scan']),
    [hasAiConfig],
  );

  // ==================== 权限处理 ====================

  if (!permission) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.permissionText}>需要相机权限才能扫码</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>授权</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ==================== 扫码处理 ====================

  const handleBarcodeScanned = useCallback(
    async (scannedBarcode: string) => {
      const now = Date.now();
      if (
        lastBarcodeRef.current &&
        lastBarcodeRef.current.code === scannedBarcode &&
        now - lastBarcodeRef.current.time < 2000
      ) {
        return;
      }
      lastBarcodeRef.current = { code: scannedBarcode, time: now };

      setIsLoading(true);
      try {
        const results = await findByBarcode(db, scannedBarcode);

        if (results.length > 0) {
          setMatchedProduct(results[0]);
        } else {
          setMatchedProduct(null);
          if (isManagement) {
            navigation.navigate('ProductEdit', { barcode: scannedBarcode });
          } else {
            await createOrUpdate(db, scannedBarcode);
            Alert.alert(
              '已记录',
              `条码 ${scannedBarcode} 已记录，可在管理模式中补充`,
              [{ text: '确定' }],
            );
          }
        }
      } catch (e) {
        console.error('ScanScreen: 扫码处理失败', e);
        Alert.alert('错误', '扫码处理失败，请重试');
      } finally {
        setIsLoading(false);
      }
    },
    [db, isManagement, navigation],
  );

  // ==================== 加购/忽略 ====================

  const handleAddToCart = useCallback(
    (product: Product) => {
      addToCart(product.id, product.name, product.price);
      setMatchedProduct(null);
      setBarcodeInput('');
    },
    [addToCart],
  );

  const handleIgnore = useCallback(() => {
    setMatchedProduct(null);
  }, []);

  // ==================== 拍照识别 ====================

  const handleTakePhoto = useCallback(async () => {
    if (!cameraRef.current) return;

    if (!aiConfig) {
      Alert.alert('提示', '请先配置 AI 服务');
      return;
    }

    setIsLoading(true);
    try {
      const photo = await cameraRef.current!.takePicture({
        base64: true,
        quality: 0.8,
        skipProcessing: true,
      });

      if (!photo?.base64) {
        Alert.alert('错误', '拍照失败');
        return;
      }

      const result = await recognizeProduct(photo.base64, aiConfig);

      if (result.candidates.length === 0) {
        Alert.alert('识别结果', '未识别到商品');
      } else {
        setCandidates(result.candidates);
        setShowCandidates(true);
      }
    } catch (e) {
      console.error('ScanScreen: 拍照识别失败', e);
      Alert.alert('错误', '拍照识别失败，请重试');
    } finally {
      setIsLoading(false);
    }
  }, [aiConfig]);

  // ==================== 候选列表加购 ====================

  const handleCandidateAddToCart = useCallback(
    async (candidate: { name: string; confidence: number; spec?: string }) => {
      const results = await searchProducts(db, candidate.name, { limit: 5 });
      if (results.length > 0) {
        addToCart(results[0].id, results[0].name, results[0].price);
      } else {
        Alert.alert(
          '未匹配到商品',
          `是否将「${candidate.name}」加入商品库？`,
          [
            { text: '取消', style: 'cancel' },
            {
              text: '加入',
              onPress: () => {
                setShowCandidates(false);
                navigation.navigate('ProductEdit', {
                  name: candidate.name,
                  spec: candidate.spec,
                });
              },
            },
          ],
        );
      }
      setShowCandidates(false);
      setCandidates([]);
    },
    [db, addToCart, navigation],
  );

  // ==================== 候选列表手动搜索 ====================

  const handleCandidateManualSearch = useCallback(() => {
    setShowCandidates(false);
    setCandidates([]);
    navigation.goBack();
  }, [navigation]);

  // ==================== 手动输入条码（兜底） ====================

  const handleManualSubmit = useCallback(async () => {
    const trimmed = barcodeInput.trim();
    if (!trimmed) return;

    Keyboard.dismiss();
    setIsLoading(true);
    try {
      const results = await findByBarcode(db, trimmed);
      if (results.length > 0) {
        setMatchedProduct(results[0]);
      } else {
        setMatchedProduct(null);
        if (isManagement) {
          navigation.navigate('ProductEdit', { barcode: trimmed });
        } else {
          await createOrUpdate(db, trimmed);
          Alert.alert(
            '已记录',
            `条码 ${trimmed} 已记录，可在管理模式中补充`,
            [{ text: '确定' }],
          );
        }
      }
    } catch (e) {
      console.error('ScanScreen: 手动输入失败', e);
    } finally {
      setIsLoading(false);
    }
  }, [barcodeInput, db, isManagement, navigation]);

  // ==================== 渲染 ====================

  return (
    <View style={styles.container}>
      {/* 顶部模式切换 Tab */}
      <View style={styles.tabBar}>
        {availableModes.map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.tab, mode === m && styles.tabActive]}
            onPress={() => setMode(m)}
          >
            <Text
              style={[styles.tabText, mode === m && styles.tabTextActive]}
            >
              {m === 'scan' ? '扫码' : '拍照'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Camera 预览区 */}
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          barcodeScannerSettings={{
            barcodeTypes: [
              'ean13',
              'ean8',
              'upc_a',
              'upc_e',
              'code128',
              'qr',
            ],
          }}
          onBarcodeScanned={
            mode === 'scan'
              ? (event) => handleBarcodeScanned(event.data)
              : undefined
          }
        >
          {/* 扫码框覆盖层 */}
          {mode === 'scan' && (
            <View style={styles.scanOverlay}>
              <View style={styles.scanFrame} />
              <Text style={styles.scanHint}>将条码对准框内</Text>
            </View>
          )}

          {/* 拍照按钮（仅拍照模式） */}
          {mode === 'photo' && (
            <View style={styles.photoOverlay}>
              <TouchableOpacity
                style={styles.captureButton}
                onPress={handleTakePhoto}
                disabled={isLoading}
              >
                <View style={styles.captureInner} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.flipButton}
                onPress={() =>
                  setFacing((f) => (f === 'back' ? 'front' : 'back'))
                }
              >
                <Text style={styles.flipButtonText}>翻转</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 加载指示器 */}
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#2563EB" />
            </View>
          )}
        </CameraView>
      </View>

      {/* 商品匹配卡片（扫码结果） */}
      {matchedProduct && mode === 'scan' && (
        <View style={styles.resultCard}>
          <Text style={styles.resultName}>{matchedProduct.name}</Text>
          {matchedProduct.spec && (
            <Text style={styles.resultSpec}>{matchedProduct.spec}</Text>
          )}
          <Text style={styles.resultPrice}>
            ¥{matchedProduct.price.toFixed(2)}
          </Text>
          <View style={styles.resultActions}>
            <TouchableOpacity
              style={styles.addCartBtn}
              onPress={() => handleAddToCart(matchedProduct)}
            >
              <Text style={styles.addCartBtnText}>加购</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ignoreBtn}
              onPress={handleIgnore}
            >
              <Text style={styles.ignoreBtnText}>忽略</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 手动输入条码（兜底，spec §8.1 始终显示） */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="手动输入条码（兜底）"
          placeholderTextColor="#94A3B8"
          value={barcodeInput}
          onChangeText={setBarcodeInput}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="number-pad"
          returnKeyType="search"
          onSubmitEditing={handleManualSubmit}
        />
        <TouchableOpacity
          style={[styles.submitBtn, !barcodeInput.trim() && styles.submitBtnDisabled]}
          onPress={handleManualSubmit}
          disabled={!barcodeInput.trim()}
        >
          <Text style={styles.submitBtnText}>确认</Text>
        </TouchableOpacity>
      </View>

      {/* 候选列表 Bottom Sheet（拍照识别结果） */}
      <Modal
        visible={showCandidates}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCandidates(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.candidateSheet}>
            <Text style={styles.sheetTitle}>识别结果</Text>
            <FlatList
              data={candidates}
              keyExtractor={(_, i) => i.toString()}
              renderItem={({ item }) => (
                <View style={styles.candidateRow}>
                  <View style={styles.candidateInfo}>
                    <Text style={styles.candidateName}>{item.name}</Text>
                    {item.spec && (
                      <Text style={styles.candidateSpec}>{item.spec}</Text>
                    )}
                    <Text style={styles.candidateConfidence}>
                      置信度 {(item.confidence * 100).toFixed(0)}%
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.candidateAddBtn}
                    onPress={() => handleCandidateAddToCart(item)}
                  >
                    <Text style={styles.candidateAddBtnText}>加购</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
            <TouchableOpacity
              style={styles.manualSearchBtn}
              onPress={handleCandidateManualSearch}
            >
              <Text style={styles.manualSearchBtnText}>
                以上都不是 → 手动搜索
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetCloseBtn}
              onPress={() => setShowCandidates(false)}
            >
              <Text style={styles.sheetCloseBtnText}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ==================== Styles ====================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  centerContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F1F5F9',
  },
  permissionText: { fontSize: 16, color: '#475569', marginBottom: 16 },
  permissionBtn: {
    backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12,
  },
  permissionBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  tabBar: {
    flexDirection: 'row', backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#2563EB' },
  tabText: { fontSize: 15, color: '#64748B', fontWeight: '500' },
  tabTextActive: { color: '#2563EB', fontWeight: '600' },
  cameraContainer: { flex: 1, position: 'relative' },
  camera: { flex: 1 },
  scanOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanFrame: {
    width: 240, height: 240, borderWidth: 2, borderColor: '#FFFFFF',
    borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)',
  },
  scanHint: {
    color: '#FFFFFF', fontSize: 14, marginTop: 16,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  photoOverlay: {
    flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 60,
  },
  captureButton: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  captureInner: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF',
    borderWidth: 4, borderColor: '#2563EB',
  },
  flipButton: { padding: 12, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8 },
  flipButtonText: { color: '#FFFFFF', fontSize: 14 },
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)',
  },
  resultCard: {
    backgroundColor: '#FFFFFF', marginHorizontal: 16, marginBottom: 12,
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  resultName: { fontSize: 17, fontWeight: '600', color: '#1E293B' },
  resultSpec: { fontSize: 14, color: '#64748B', marginTop: 2 },
  resultPrice: { fontSize: 18, fontWeight: '700', color: '#DC2626', marginTop: 8 },
  resultActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  addCartBtn: {
    flex: 1, backgroundColor: '#2563EB', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  addCartBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  ignoreBtn: {
    flex: 1, backgroundColor: '#F1F5F9', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  ignoreBtnText: { color: '#64748B', fontSize: 15, fontWeight: '600' },
  inputBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    marginHorizontal: 12, marginBottom: 12, borderRadius: 10,
    paddingHorizontal: 12, borderWidth: 1, borderColor: '#E2E8F0',
  },
  input: { flex: 1, fontSize: 15, color: '#1E293B', paddingVertical: 10 },
  submitBtn: {
    backgroundColor: '#2563EB', borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 8, marginLeft: 8,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  candidateSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    maxHeight: '60%', paddingBottom: 20,
  },
  sheetTitle: {
    fontSize: 17, fontWeight: '600', color: '#1E293B', textAlign: 'center',
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  candidateRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  candidateInfo: { flex: 1 },
  candidateName: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  candidateSpec: { fontSize: 13, color: '#64748B', marginTop: 2 },
  candidateConfidence: { fontSize: 12, color: '#8B5CF6', marginTop: 2 },
  candidateAddBtn: {
    backgroundColor: '#2563EB', borderRadius: 6,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  candidateAddBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  manualSearchBtn: {
    marginHorizontal: 16, marginTop: 12, paddingVertical: 12,
    alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 8,
  },
  manualSearchBtnText: { fontSize: 14, color: '#2563EB', fontWeight: '500' },
  sheetCloseBtn: {
    marginHorizontal: 16, marginTop: 8, paddingVertical: 12,
    alignItems: 'center', backgroundColor: '#EF4444', borderRadius: 8,
  },
  sheetCloseBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
});
