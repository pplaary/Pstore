import { useState, useEffect, useCallback } from 'react';

const API = '/api';

interface Product {
  id: number;
  name: string;
  price?: number;
  barcode?: string;
  quantity: number;
  category?: string;
  expiringDays?: number;
  updatedAt: string;
}

function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [aiText, setAiText] = useState('');
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // AI 配置相关
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState({ apiUrl: '', apiKey: '', textModel: '', visionModel: '', pin: '' });
  const [configSaving, setConfigSaving] = useState(false);
  const [configMsg, setConfigMsg] = useState('');

  const fetchProducts = useCallback(async () => {
    const res = await fetch(`${API}/products/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setProducts(data.products || []);
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API}/config/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'all' }),
      });
      const data = await res.json();
      if (data) setConfig(data);
    } catch { /* 配置加载失败不影响使用 */ }
  }, []);

  useEffect(() => { fetchProducts(); fetchConfig(); }, [fetchProducts, fetchConfig]);

  const saveConfig = async () => {
    setConfigSaving(true);
    setConfigMsg('');
    try {
      const res = await fetch(`${API}/config/set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiUrl: config.apiUrl,
          apiKey: config.apiKey,
          textModel: config.textModel,
          visionModel: config.visionModel,
          pin: config.pin || '0000',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setConfigMsg(data.ok ? '配置已保存' : '保存失败');
      } else {
        const data = await res.json();
        setConfigMsg(data.error === 'invalid pin' ? 'PIN 码错误（默认 0000）' : '保存失败');
      }
    } catch {
      setConfigMsg('保存失败，请检查后端连接');
    }
    setConfigSaving(false);
  };

  const handleAiParse = async () => {
    if (!aiText.trim()) return;
    setLoading(true);
    setAiResult(null);
    try {
      // 1. AI 解析
      const res = await fetch(`${API}/ai/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiText }),
      });
      const json = await res.json();

      if (json.error) {
        setAiResult(JSON.stringify(json, null, 2));
        setLoading(false);
        return;
      }

      const item = json.data;
      if (!item || !item.name || item.name === '未知物品') {
        setAiResult(JSON.stringify({ error: '未能识别物品信息，请换一种描述试试' }, null, 2));
        setLoading(false);
        return;
      }

      // 2. 入库
      const now = new Date().toISOString();
      const priceNum = item.price ? parseFloat(item.price.replace(/[^0-9.]/g, '')) || 0 : 0;
      const change = {
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: item.name,
        price: priceNum,
        barcode: item.barcode || '',
        category: item.category || '',
        unit: '个',
        imageUri: '',
        isDeleted: 0,
        updatedAt: now,
      };

      const pushRes = await fetch(`${API}/products/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: [change] }),
      });
      const pushJson = await pushRes.json();

      if (pushJson.ok) {
        setAiResult(JSON.stringify({ ok: true, item: item.name, price: priceNum > 0 ? `¥${priceNum}` : '' }, null, 2));
      } else {
        setAiResult(JSON.stringify({ error: '入库失败', detail: pushJson }, null, 2));
      }

      setAiText('');
      fetchProducts();
    } catch (e: unknown) {
      setAiResult(`AI 解析失败: ${e instanceof Error ? e.message : '未知错误'}`);
    }
    setLoading(false);
  };

  const filtered = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <header style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
          <h1 style={{ fontSize: '1.8rem', color: '#2563eb', margin: 0 }}>PStore</h1>
          <button
            onClick={() => setShowConfig(!showConfig)}
            style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid #334155',
              background: showConfig ? '#2563eb' : 'transparent',
              color: showConfig ? '#fff' : '#94a3b8',
              fontSize: '.8rem', cursor: 'pointer'
            }}
          >
            ⚙ 设置
          </button>
        </div>
        <p style={{ color: '#64748b', marginTop: 4 }}>智能库存管理 · Web 版</p>
        <a href="/apk/app-release.apk" download style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          marginTop: 14, padding: '8px 20px', borderRadius: 8,
          background: '#2563eb', color: '#fff', fontWeight: 600,
          fontSize: '.9rem', textDecoration: 'none', cursor: 'pointer'
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          下载 Android APK
        </a>
      </header>

      {/* AI 配置面板 */}
      {showConfig && (
        <section style={{
          background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 24
        }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>AI 后端配置</span>
            <span style={{ fontSize: '.75rem', color: '#64748b', fontWeight: 400 }}>接入 OpenAI 兼容 API</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '.8rem', color: '#94a3b8', marginBottom: 4 }}>API 地址</label>
              <input
                value={config.apiUrl}
                onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '.8rem', color: '#94a3b8', marginBottom: 4 }}>API Key</label>
              <input
                value={config.apiKey}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                type="password"
                placeholder="sk-..."
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '.8rem', color: '#94a3b8', marginBottom: 4 }}>PIN 码</label>
              <input
                value={config.pin}
                onChange={(e) => setConfig({ ...config, pin: e.target.value })}
                type="password"
                placeholder="默认 0000"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '.8rem', color: '#94a3b8', marginBottom: 4 }}>文本模型</label>
              <input
                value={config.textModel}
                onChange={(e) => setConfig({ ...config, textModel: e.target.value })}
                placeholder="gpt-4o-mini"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '.8rem', color: '#94a3b8', marginBottom: 4 }}>视觉模型</label>
              <input
                value={config.visionModel}
                onChange={(e) => setConfig({ ...config, visionModel: e.target.value })}
                placeholder="gpt-4o"
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 16 }}>
            {configMsg && (
              <span style={{
                fontSize: '.8rem', color: configMsg.includes('失败') ? '#f87171' : '#34d399'
              }}>
                {configMsg}
              </span>
            )}
            <button
              onClick={saveConfig}
              disabled={configSaving}
              style={{
                padding: '8px 24px', borderRadius: 8, border: 'none',
                background: '#2563eb', color: '#fff', fontWeight: 600,
                cursor: configSaving ? 'not-allowed' : 'pointer',
                opacity: configSaving ? .7 : 1
              }}
            >
              {configSaving ? '保存中...' : '保存配置'}
            </button>
          </div>
        </section>
      )}

      {/* AI 语音录入模拟 */}
      <section style={{
        background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 24
      }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 12 }}>AI 录入</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAiParse()}
            placeholder='说"可乐3块钱"试试...'
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 8,
              border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0',
              fontSize: '.95rem', outline: 'none'
            }}
          />
          <button
            onClick={handleAiParse}
            disabled={loading}
            style={{
              padding: '10px 24px', borderRadius: 8, border: 'none',
              background: '#2563eb', color: '#fff', fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .7 : 1
            }}
          >
            {loading ? '解析中...' : '录入'}
          </button>
        </div>
        {aiResult && (
          <pre style={{
            marginTop: 12, padding: 12, background: '#0f172a', borderRadius: 8,
            fontSize: '.8rem', color: '#94a3b8', overflow: 'auto', maxHeight: 120
          }}>
            {aiResult}
          </pre>
        )}
      </section>

      {/* 搜索 + 商品列表 */}
      <section>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder='搜索商品名称...'
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8, marginBottom: 16,
            border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0',
            fontSize: '.95rem', outline: 'none'
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.length === 0 && (
            <p style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>
              {search ? '没有匹配的商品' : '暂无商品，用 AI 录入试试'}
            </p>
          )}
          {filtered.map((p) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#1e293b', borderRadius: 10, padding: '14px 18px'
            }}>
              <div>
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                {p.category && (
                  <span style={{
                    marginLeft: 8, padding: '2px 8px', borderRadius: 4,
                    background: '#334155', fontSize: '.75rem', color: '#94a3b8'
                  }}>
                    {p.category}
                  </span>
                )}
                <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>
                  {p.barcode && `条码: ${p.barcode} · `}
                  数量: {p.quantity || 1}
                  {p.expiringDays && ` · 保质期: ${p.expiringDays}天`}
                </div>
              </div>
              {p.price != null && (
                <span style={{
                  fontSize: '1.1rem', fontWeight: 700, color: '#34d399'
                }}>
                  ¥{p.price.toFixed(2)}
                </span>
              )}
            </div>
          ))}
        </div>
        <p style={{
          textAlign: 'center', marginTop: 16, fontSize: '.8rem', color: '#475569'
        }}>
          共 {filtered.length} 件商品
        </p>
      </section>

      <footer style={{
        textAlign: 'center', padding: '32px 0', color: '#334155', fontSize: '.8rem'
      }}>
        PStore Web · Docker Edition · Powered by n1-server
      </footer>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 6,
  border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0',
  fontSize: '.85rem', outline: 'none', boxSizing: 'border-box'
};

export default App;
