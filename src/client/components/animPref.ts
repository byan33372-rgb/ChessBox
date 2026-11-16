/**
 * 动效偏好（ANIM-024/025 / FRONT-012）：三档 — 普通 / 快速 / 关闭。
 * enabled = 非关闭 ∧ 非 prefers-reduced-motion。
 * 仅影响动画播放速度/开关，不影响任何棋规/服务端状态。
 */
import { useCallback, useEffect, useState } from 'react';

const KEY = 'dc:anim';
export type AnimMode = 'normal' | 'fast' | 'off';

function readMode(): AnimMode {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === 'off' || v === 'fast' || v === 'normal') return v;
    // 旧版本只存 on/off：on 视为普通
    return v === 'off' ? 'off' : 'normal';
  } catch {
    return 'normal'; // 隐私模式等取不到时默认普通
  }
}

function writeMode(mode: AnimMode): void {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    /* 存不了就只对本次会话生效 */
  }
}

const NEXT: Record<AnimMode, AnimMode> = { normal: 'fast', fast: 'off', off: 'normal' };

export function useAnimPref(): {
  mode: AnimMode;
  enabled: boolean;
  userOn: boolean;
  /** 飞行时长（ms）：普通 180 / 快速 90 */
  speedMs: number;
  toggle(): void;
} {
  const [mode, setMode] = useState<AnimMode>(readMode);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    setMode((m) => {
      const next = NEXT[m];
      writeMode(next);
      return next;
    });
  }, []);

  return { mode, enabled: mode !== 'off' && !reduced, userOn: mode !== 'off', speedMs: mode === 'fast' ? 90 : 180, toggle };
}
