/**
 * 网络检测 Hook
 *
 * 定期检测 N1 服务器可达性。
 */

import { useState, useEffect, useCallback } from 'react';

export function useNetworkDetection(serverUrl: string | null, interval = 30000) {
  const [isConnected, setIsConnected] = useState(false);

  const check = useCallback(async () => {
    if (!serverUrl) {
      setIsConnected(false);
      return;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(`${serverUrl}/api/health`, {
        signal: controller.signal,
      });

      clearTimeout(timer);
      setIsConnected(res.ok);
    } catch {
      setIsConnected(false);
    }
  }, [serverUrl]);

  useEffect(() => {
    check();
    if (!serverUrl) return;

    const id = setInterval(check, interval);
    return () => clearInterval(id);
  }, [check, interval, serverUrl]);

  return isConnected;
}
