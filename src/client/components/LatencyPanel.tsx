/**
 * 延迟诊断面板（阶段二）：
 * - 默认隐藏，普通玩家不可见；地址栏 ?latency=1 或 Ctrl+Shift+L 打开（localStorage 记忆）。
 * - 只展示本机可观测数据：传输方式、RTT、服务端分阶段耗时、客户端渲染耗时、重连/超时计数。
 * - 不含会话令牌、房间内容或任何私密信息。
 */
import { useEffect, useState } from 'react';
import type { LatencyStats } from '../net/roomClient';

function ms(v: number | null | undefined): string {
  if (v == null) return '—';
  return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(v < 10 ? 2 : 1)}ms`;
}

function enabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).has('latency')) return true;
    return window.localStorage.getItem('dc:latency') === '1';
  } catch {
    return false;
  }
}

export function LatencyPanel({ latency, conn }: { latency: LatencyStats; conn: string }) {
  const [show, setShow] = useState(enabled);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault();
        setShow((s) => {
          const next = !s;
          try {
            window.localStorage.setItem('dc:latency', next ? '1' : '0');
          } catch {
            /* 忽略隐私模式写入失败 */
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!show) return null;
  const m = latency.lastMove;
  const st = m?.serverTiming;

  return (
    <aside className="latency-panel" data-testid="latency-panel" aria-label="延迟诊断">
      <button type="button" className="latency-head" onClick={() => setOpen((v) => !v)}>
        <span>延迟诊断</span>
        <span className={`latency-dot ${conn === 'online' ? 'ok' : 'warn'}`} />
        <span>{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        <dl>
          <dt>连接</dt>
          <dd>
            {conn} · {latency.transport ?? '—'}
          </dd>
          <dt>RTT（中位）</dt>
          <dd>
            {ms(latency.rttMs)} <small>n={latency.rttSamples}</small>
          </dd>
          <dt>重连 / 超时</dt>
          <dd>
            {latency.reconnects} / {latency.timeouts}
          </dd>
          <dt>stateVersion</dt>
          <dd>{latency.stateVersion ?? '—'}</dd>
          <dt>上一手 requestId</dt>
          <dd className="mono">{m ? m.requestId.slice(0, 8) : '—'}</dd>
          <dt>点击→ack</dt>
          <dd>{ms(m?.ackMs)}</dd>
          <dt>服务端 total</dt>
          <dd>{ms(st?.totalMs)}</dd>
          <dt>服务端分项</dt>
          <dd className="mono latency-sub">
            队列 {ms(st?.queueMs)} · 校验 {ms(st?.validateMs)} · 规则 {ms(st?.applyMs)} · 落库 {ms(st?.persistMs)} ·
            状态 {ms(st?.stateMs)} · 广播 {ms(st?.broadcastMs)}
          </dd>
          <dt>事件→棋盘</dt>
          <dd>{ms(latency.renderMs)}</dd>
          <dt>结果</dt>
          <dd>
            {m ? (m.ok ? 'ok' : `失败 ${m.errorCode ?? ''}`) : '—'} · v{m?.revision ?? '—'}
          </dd>
        </dl>
      )}
    </aside>
  );
}
