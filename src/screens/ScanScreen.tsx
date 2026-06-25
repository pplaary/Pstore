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
import { useAIConfigStore } from '../store/aiConfig';
import { findByBarcode, createOrUpdate } from '../db/pending';
import { searchProducts } from '../db/search';
import { recognizeProduct } from '../services/vision';
import { aiParse, aiParseImage } from '../services/n1';
import { useSyncConfigStore } from '../store/syncConfig';
import { useTheme } from '../theme/ThemeContext';
import type { Product } from '../db/types';
import type { ScanScreenProps } from '../navigation/types';

type ScanMode = 'scan' | 'photo';

export function ScanScreen({ navigation }: ScanScreenProps) {
  const { db } = useStore();
  const { theme } = useTheme();
  const { colors, scale } = theme;
  const { addToCart } = useCartStore();
  const aiConfig = useAIConfigStore((s) => s.aiConfig);
  const aiConfigured = useAIConfigStore((s) => s.configured);
  const syncConfigServerUrl = useSyncConfigStore((s) => s.serverUrl);

  const styles = useMemo(() => createStyles(colors, scale), [colors, scale]);

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
  const cameraRef = useRef<CameraViewRef>(null);
  const [facing, setFacing] = useState<CameraType>('back');

  const availableModes = useMemo<ScanMode[]>(
    () => (aiConfigured || !!syncConfigServerUrl ? ['scan', 'photo'] : ['scan']),
    [aiConfigured, syncConfigServerUrl],
  );

  // ==================== 权限处理 ====================

  if (!permission) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.permissionText}>需要相机权限才能扫码</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission} accessibilityLabel="授权相机权限" accessibilityRole="button">
          <Text style={styles.permissionBtnText}>授权</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ==================== AI 条码识别 ====================

  const handleAiBarcode = useCallback(async (barcode: string) => {
    const serverUrl = useSyncConfigStore.getState().serverUrl;
    if (!serverUrl) {
      Alert.alert('提示', '请先配置 N1 服务器地址');
      return;
    }

    setIsLoading(true);
    try {
      const result = await aiParse(serverUrl, `条码 ${barcode}`);
      if (result.data && result.data.name) {
        navigation.navigate('ProductEdit', {
          barcode,
          name: result.data.name,
          spec: [
            result.data.price ? `¥${result.data.price}` : null,
            result.data.category || null,
          ]
            .filter((p): p is string => p !== null)
            .join(' · '),
        });
      } else {
        console.warn('ScanScreen: AI 条码解析无结果', result);
        Alert.alert('AI 解析无结果', '该条码未识别到商品信息，请手动录入', [
          { text: '手动录入', onPress: () => navigation.navigate('ProductEdit', { barcode }) },
        ]);
      }
    } catch (e) {
      console.warn('ScanScreen: AI 条码识别失败', e);
      Alert.alert('AI 识别失败', 'AI 服务异常，请手动录入', [
        { text: '手动录入', onPress: () => navigation.navigate('ProductEdit', { barcode }) },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [navigation]);

  // ==================== 扫码处理 ====================

  const showUnmatchedAlert = useCallback((barcode: string) => {
    Alert.alert(
      '未找到商品',
      `条码 ${barcode}`,
      [
        {
          text: '仅记录',
          style: 'cancel',
          onPress: async () => {
            try {
              await createOrUpdate(db, barcode);
              Alert.alert('已记录', `条码 ${barcode} 已写入，可在管理模式中补充`);
            } catch {
              Alert.alert('记录失败', '数据库写入失败，请重试');
            }
          },
        },
        {
          text: 'AI 识别',
          onPress: () => handleAiBarcode(barcode),
        },
        {
          text: '手动录入',
          onPress: () => navigation.navigate('ProductEdit', { barcode }),
        },
      ],
    );
  }, [db, navigation, handleAiBarcode]);

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

        if (results && Array.isArray(results) && results.length > 0) {
          setMatchedProduct(results[0]);
        } else {
          setMatchedProduct(null);
          showUnmatchedAlert(scannedBarcode);
        }
      } catch (e) {
        console.error('ScanScreen: 扫码处理失败', e);
        Alert.alert('错误', '扫码处理失败，请重试');
      } finally {
        setIsLoading(false);
      }
    },
    [db, showUnmatchedAlert],
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

    if (!syncConfigServerUrl && (!aiConfig || !aiConfig.apiUrl)) {
      Alert.alert('提示', '请先配置 AI 服务');
      return;
    }

    setIsLoading(true);
    let recognized = false;

    try {
      const photo = await (cameraRef.current as any).takePicture({
        base64: true,
        skipProcessing: true,
      });

      if (!photo?.base64) {
        Alert.alert('错误', '拍照失败');
        return;
      }

      const imageDataUrl = `data:image/jpeg;base64,${photo.base64}`;

      const n1Promise = syncConfigServerUrl
        ? aiParseImage(syncConfigServerUrl, imageDataUrl).then(r => ({ source: 'n1' as const, result: r }))
        : Promise.reject(new Error('no n1 config'));

      const visionPromise = (aiConfig && aiConfig.apiUrl)
        ? recognizeProduct(photo.base64, aiConfig).then(r => ({ source: 'vision' as const, result: r }))
        : Promise.reject(new Error('no vision config'));

      const settled = await Promise.allSettled([n1Promise, visionPromise]);

      for (const s of settled) {
        if (!recognized && s.status === 'fulfilled') {
          if (s.value.source === 'n1') {
            const data = s.value.result.data;
            if (data && data.name) {
              const specParts = [
                data.price != null && data.price !== '' ? `¥${data.price}` : null,
                data.category || null,
                data.location || null,
              ].filter((p): p is string => p !== null);
              setCandidates([{
                name: data.name,
                confidence: -1,
                spec: specParts.join(' · ') || 'N1 AI 识别',
              }]);
              setShowCandidates(true);
              recognized = true;
            } else {
              console.warn('ScanScreen: n1-server 返回无效数据', s.value.result);
            }
          } else if (s.value.source === 'vision') {
            if (s.value.result.candidates.length > 0) {
              setCandidates(s.value.result.candidates);
              setShowCandidates(true);
              recognized = true;
            }
          }
        } else if (s.status === 'rejected') {
          console.warn('ScanScreen: AI 渠道失败', s.reason);
        }
      }

      if (!recognized) {
        Alert.alert('未识别到商品', '请尝试扫码或手动录入', [
          { text: '扫码', onPress: () => setMode('scan') },
          { text: '手动录入', onPress: () => navigation.navigate('ProductEdit', {}) },
        ]);
      }
    } catch (e) {
      console.error('ScanScreen: 拍照识别失败', e);
      Alert.alert('错误', '拍照识别失败，请重试');
    } finally {
      setIsLoading(false);
    }
  }, [aiConfig, syncConfigServerUrl]);

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
      if (results && Array.isArray(results) && results.length > 0) {
        setMatchedProduct(results[0]);
      } else {
        setMatchedProduct(null);
        showUnmatchedAlert(trimmed);
      }
    } catch (e) {
      console.error('ScanScreen: 手动输入失败', e);
    } finally {
      setIsLoading(false);
    }
  }, [barcodeInput, db, navigation, showUnmatchedAlert]);

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
            accessibilityLabel={m === 'scan' ? '扫码模式' : '拍照模式'}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === m }}
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
          ref={cameraRef as any}
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
                accessibilityLabel="拍照识别"
                accessibilityRole="button"
              >
                <View style={styles.captureInner} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.flipButton}
                onPress={() =>
                  setFacing((f) => (f === 'back' ? 'front' : 'back'))
                }
                accessibilityLabel="切换前后摄像头"
                accessibilityRole="button"
              >
                <Text style={styles.flipButtonText}>翻转</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 加载指示器 */}
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.brand.primary} />
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
              accessibilityLabel={`加购${matchedProduct.name}`}
              accessibilityRole="button"
            >
              <Text style={styles.addCartBtnText}>加购</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ignoreBtn}
              onPress={handleIgnore}
              accessibilityLabel="忽略此商品"
              accessibilityRole="button"
            >
              <Text style={styles.ignoreBtnText}>忽略</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 手动输入条码（兜底） */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="手动输入条码（兜底）"
          placeholderTextColor={colors.text.hint}
          value={barcodeInput}
          onChangeText={setBarcodeInput}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="number-pad"
          returnKeyType="search"
          onSubmitEditing={handleManualSubmit}
          accessibilityLabel="手动输入条码"
        />
        <TouchableOpacity
          style={[styles.submitBtn, !barcodeInput.trim() && styles.submitBtnDisabled]}
          onPress={handleManualSubmit}
          disabled={!barcodeInput.trim()}
          accessibilityLabel="确认条码"
          accessibilityRole="button"
        >
          <Text style={styles.submitBtnText}>确认</Text>
        </TouchableOpacity>
      </View>

      {/* 候选列表 Bottom Sheet */}
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
                    {item.confidence >= 0 && (
                      <Text style={styles.candidateConfidence}>
                        置信度 {(item.confidence * 100).toFixed(0)}%
                      </Text>
                    )}
                    {item.confidence < 0 && (
                      <Text style={styles.candidateConfidence}>
                        N/A
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.candidateAddBtn}
                    onPress={() => handleCandidateAddToCart(item)}
                    accessibilityLabel={`加购候选商品：${item.name}`}
                    accessibilityRole="button"
                  >
                    <Text style={styles.candidateAddBtnText}>加购</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
            <TouchableOpacity
              style={styles.manualSearchBtn}
              onPress={handleCandidateManualSearch}
              accessibilityLabel="手动搜索"
              accessibilityRole="button"
            >
              <Text style={styles.manualSearchBtnText}>
                以上都不是 → 手动搜索
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetCloseBtn}
              onPress={() => setShowCandidates(false)}
              accessibilityLabel="关闭候选列表"
              accessibilityRole="button"
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

function createStyles(colors: ReturnType<typeof useTheme>['theme']['colors'], scale: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg.primary },
    centerContainer: {
      flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg.primary,
    },
    permissionText: { fontSize: 16 * scale, color: colors.text.primary, marginBottom: 16 },
    permissionBtn: {
      backgroundColor: colors.brand.primary, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12,
    },
    permissionBtnText: { color: colors.text.inverse, fontSize: 16 * scale, fontWeight: '600' },
    tabBar: {
      flexDirection: 'row', backgroundColor: colors.bg.card,
      borderBottomWidth: 1, borderBottomColor: colors.border.default,
    },
    tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
    tabActive: { borderBottomWidth: 2, borderBottomColor: colors.brand.primary },
    tabText: { fontSize: 15 * scale, color: colors.text.secondary, fontWeight: '500' },
    tabTextActive: { color: colors.brand.primary, fontWeight: '600' },
    cameraContainer: { flex: 1, position: 'relative' },
    camera: { flex: 1 },
    scanOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scanFrame: {
      width: 240, height: 240, borderWidth: 2, borderColor: colors.text.inverse,
      borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)',
    },
    scanHint: {
      color: colors.text.inverse, fontSize: 14 * scale, marginTop: 16,
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
      width: 56, height: 56, borderRadius: 28, backgroundColor: colors.text.inverse,
      borderWidth: 4, borderColor: colors.brand.primary,
    },
    flipButton: { padding: 12, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8 },
    flipButtonText: { color: colors.text.inverse, fontSize: 14 * scale },
    loadingOverlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)',
    },
    resultCard: {
      backgroundColor: colors.bg.card, marginHorizontal: 16, marginBottom: 12,
      borderRadius: 12, padding: 16,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
    },
    resultName: { fontSize: 17 * scale, fontWeight: '600', color: colors.text.primary },
    resultSpec: { fontSize: 14 * scale, color: colors.text.secondary, marginTop: 2 },
    resultPrice: { fontSize: 18 * scale, fontWeight: '700', color: colors.brand.danger, marginTop: 8 },
    resultActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
    addCartBtn: {
      flex: 1, backgroundColor: colors.brand.primary, borderRadius: 8,
      paddingVertical: 10, alignItems: 'center',
    },
    addCartBtnText: { color: colors.text.inverse, fontSize: 15 * scale, fontWeight: '600' },
    ignoreBtn: {
      flex: 1, backgroundColor: colors.bg.primary, borderRadius: 8,
      paddingVertical: 10, alignItems: 'center',
    },
    ignoreBtnText: { color: colors.text.secondary, fontSize: 15 * scale, fontWeight: '600' },
    inputBar: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.card,
      marginHorizontal: 12, marginBottom: 12, borderRadius: 10,
      paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border.default,
    },
    input: { flex: 1, fontSize: 15 * scale, color: colors.text.primary, paddingVertical: 10 },
    submitBtn: {
      backgroundColor: colors.brand.primary, borderRadius: 8,
      paddingHorizontal: 16, paddingVertical: 8, marginLeft: 8,
    },
    submitBtnDisabled: { opacity: 0.5 },
    submitBtnText: { color: colors.text.inverse, fontSize: 14 * scale, fontWeight: '600' },
    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
    },
    candidateSheet: {
      backgroundColor: colors.bg.card,
      borderTopLeftRadius: 16, borderTopRightRadius: 16,
      maxHeight: '60%', paddingBottom: 20,
    },
    sheetTitle: {
      fontSize: 17 * scale, fontWeight: '600', color: colors.text.primary, textAlign: 'center',
      paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border.default,
    },
    candidateRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: colors.bg.primary,
    },
    candidateInfo: { flex: 1 },
    candidateName: { fontSize: 15 * scale, fontWeight: '600', color: colors.text.primary },
    candidateSpec: { fontSize: 13 * scale, color: colors.text.secondary, marginTop: 2 },
    candidateConfidence: { fontSize: 12 * scale, color: '#8B5CF6', marginTop: 2 },
    candidateAddBtn: {
      backgroundColor: colors.brand.primary, borderRadius: 6,
      paddingHorizontal: 16, paddingVertical: 8,
    },
    candidateAddBtnText: { color: colors.text.inverse, fontSize: 13 * scale, fontWeight: '600' },
    manualSearchBtn: {
      marginHorizontal: 16, marginTop: 12, paddingVertical: 12,
      alignItems: 'center', backgroundColor: colors.bg.primary, borderRadius: 8,
    },
    manualSearchBtnText: { fontSize: 14 * scale, color: colors.brand.primary, fontWeight: '500' },
    sheetCloseBtn: {
      marginHorizontal: 16, marginTop: 8, paddingVertical: 12,
      alignItems: 'center', backgroundColor: colors.brand.danger, borderRadius: 8,
    },
    sheetCloseBtnText: { color: colors.text.inverse, fontSize: 15 * scale, fontWeight: '600' },
  });
}
