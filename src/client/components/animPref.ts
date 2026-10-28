/**
 * 动效总开关偏好（ANIM-024/025）。
 * enabled = 用户开关（localStorage 'dc:anim'，默认开）∧ 非 prefers-reduced-motion。
 * 仅影响动画播放，不影响任何棋规/服务端状态。
 */
import { useCallback, useEffect, useState } from 'react';

const KEY = 'dc:anim';

function readUserPref(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true; // 隐私模式等取不到时默认开
  }
}

function writeUserPref(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* 存不了就只对本次会话生效 */
  }
}

export function useAnimPref(): { enabled: boolean; userOn: boolean; toggle(): void } {
  const [userOn, setUserOn] = useState(readUserPref);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    setUserOn((v) => {
      const next = !v;
      writeUserPref(next);
      return next;
    });
  }, []);

  return { enabled: userOn && !reduced, userOn, toggle };
}
