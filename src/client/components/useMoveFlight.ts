/**
 * 走棋飞行状态 Hook（FLIP 模型）。
 *
 * 输入：服务端已确认后的 BoardAnim（Room/PracticeBoard 构造）。
 * 输出：flight（含 started 标志）与 landSq（落位强调格）。
 *
 * 关键约束：
 * - 动画永不改变棋局状态：飞行层只是视觉叠加，底层棋子始终按 fenAfter 渲染；
 *   飞行中仅暂时隐藏 to/rook.to 处的底层棋子，结束/取消立即恢复（ANIM-026/028）。
 * - started 经双 rAF 置位：先以初始 transform 挂载，再释放过渡（合成器动画，ANIM-027）。
 * - 兜底：600ms 安全计时器 + visibilitychange（切后台/回前台）立即落位
 *   ——任何路径都保证棋子不会停在半途（ANIM-022）。
 * - 卸载清理 rAF/计时器/监听（ANIM-023）。
 * - prefers-reduced-motion 由调用方（Room）在构造 anim 时跳过；CSS 侧也归零双保险（ANIM-024）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardAnim } from './boardAnim';

export interface FlightState {
  anim: BoardAnim;
  started: boolean;
}

export function useMoveFlight(anim: BoardAnim | null): {
  flight: FlightState | null;
  landSq: string | null;
  finish(): void;
} {
  const [flight, setFlight] = useState<FlightState | null>(null);
  const [landSq, setLandSq] = useState<string | null>(null);
  const landTimer = useRef(0);
  const finishRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!anim) return;
    setLandSq(null);
    setFlight({ anim, started: false });

    let r1 = 0;
    let r2 = 0;
    let timer = 0;
    const finish = () => {
      setFlight((f) => (f && f.anim.key === anim.key ? null : f));
      setLandSq(anim.to);
      clearTimeout(landTimer.current);
      landTimer.current = window.setTimeout(() => setLandSq(null), 340);
    };
    finishRef.current = finish;
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => {
        setFlight((f) => (f && f.anim.key === anim.key ? { ...f, started: true } : f));
      });
    });
    timer = window.setTimeout(finish, 600);
    const onVis = () => finish();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim?.key]);

  useEffect(() => () => clearTimeout(landTimer.current), []);

  const finish = useCallback(() => finishRef.current(), []);

  return { flight, landSq, finish };
}
