/**
 * 三国杀·自由混战 —— 自动对局客户端（真实 socket 协议，无引擎内部访问）。
 * 决策完全依赖服务端下发视图：hints/legalCards/candidates/options。
 * 用途：集成测试完成整局、30 分钟浸泡。
 */
import { io, type Socket } from 'socket.io-client';

export interface SgBot {
  seat: string;
  socket: Socket;
  views: Array<Record<string, unknown>>;
  commands: number;
  errors: number;
  lastReject: string | null;
  stop(): void;
  waitStarted(timeoutMs?: number): Promise<void>;
  waitFinished(timeoutMs?: number): Promise<void>;
  run(maxSteps?: number): Promise<'finished' | 'steps'>;
}

export function connectSgBot(url: string, seat: string, socket?: Socket): SgBot {
  const sock = socket ?? io(url, { transports: ['websocket'], forceNew: true });
  const views: Array<Record<string, unknown>> = [];
  let latest: Record<string, unknown> | null = null;
  let stopped = false;
  const pendingWaiters: Array<() => void> = [];
  const notify = () => {
    for (const w of pendingWaiters.splice(0)) w();
  };
  sock.on('sg:state', (p: { view: Record<string, unknown> }) => {
    views.push(p.view);
    latest = p.view;
    notify();
  });
  let seq = 0;
  const bot: SgBot = {
    seat,
    socket: sock,
    views,
    commands: 0,
    errors: 0,
    lastReject: null,
    stop() {
      stopped = true;
      sock.disconnect();
    },
    async waitStarted(timeoutMs = 30000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        if (latest && (latest as { phase?: string }).phase !== 'select') return;
        await new Promise((r) => setTimeout(r, 60));
      }
      throw new Error(`waitStarted 超时（seat=${seat}）`);
    },
    async waitFinished(timeoutMs = 120000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        if (latest && (latest as { winner?: string }).winner != null) return;
        await new Promise((r) => setTimeout(r, 60));
      }
      throw new Error(`waitFinished 超时（seat=${seat}）`);
    },
    async run(maxSteps = 10000) {
      let steps = 0;
      while (!stopped && steps < maxSteps) {
        const v = latest as {
          winner?: string | null;
          pending?: { kind: string; playerId?: string; need?: string; promptId?: string; min?: number; max?: number; count?: number; options?: string[]; candidates?: string[]; legalCards?: string[]; cards?: string[]; windowId?: string } | null;
          hints?: Array<{ cardId: string; as?: string; ok: boolean; targets: string[]; minTargets: number; maxTargets: number; multi?: boolean }>;
          myHand?: string[];
        } | null;
        if (!v) { await sleep(50); continue; }
        if (v.winner != null) return 'finished';
        const pend = v.pending;
        let acted = false;
        if (pend && pend.kind === 'play' && pend.playerId === seat) {
          // 随机合法出牌（60% 概率出，40% 结束回合）
          const ok = (v.hints ?? []).filter((h) => h.ok);
          if (ok.length > 0 && Math.random() < 0.6) {
            const h = ok[Math.floor(Math.random() * ok.length)];
            const targets = h.multi ? [] : h.targets.slice(0, Math.max(h.minTargets, h.targets.length > 0 ? 1 : 0));
            await cmd({ type: 'play-card', cardId: h.cardId, as: h.as, targets });
            acted = true;
          } else {
            await cmd({ type: 'end-play' });
            acted = true;
          }
        } else if (pend && pend.playerId === seat) {
          const r = respondAuto(pend as never, v.myHand ?? []);
          if (r != null) {
            await cmd(r);
            acted = true;
          }
        }
        if (!acted) await sleep(40);
        steps += 1;
      }
      return 'steps';
    },
  };

  function respondAuto(
    pend: { kind: string; need?: string; promptId?: string; min?: number; max?: number; count?: number; options?: string[]; candidates?: string[]; legalCards?: string[]; cards?: string[] },
    hand: string[],
  ): Record<string, unknown> | null {
    switch (pend.kind) {
      case 'respond': {
        const legal = pend.legalCards ?? [];
        if (legal.length > 0 && (pend.need === 'tao' || pend.need === 'shan' ? Math.random() < 0.7 : Math.random() < 0.5)) {
          return { type: 'respond-play', cardId: legal[Math.floor(Math.random() * legal.length)] };
        }
        return { type: 'respond-pass' };
      }
      case 'discard': {
        const n = pend.count ?? 0;
        return { type: 'discard', cards: hand.slice(0, n) };
      }
      case 'choose': {
        const opts = pend.options ?? [];
        if (opts.length === 0) return null;
        return { type: 'choose', value: opts[Math.floor(Math.random() * opts.length)] };
      }
      case 'cards': {
        const n = pend.min ?? 0;
        if (hand.length < n) return null;
        return { type: 'submit-cards', cards: hand.slice(0, n) };
      }
      case 'targets': {
        const cands = pend.candidates ?? [];
        const n = Math.min(pend.min ?? 1, cands.length);
        if (cands.length < n) return null;
        return { type: 'submit-targets', targets: cands.slice(0, Math.max(n, 1)) };
      }
      case 'guanxing': {
        return { type: 'guanxing-top', top: (pend.cards ?? []).slice(0, 1) };
      }
      default:
        return null;
    }
  }

  let lastSend = 0;
  async function cmd(action: Record<string, unknown>): Promise<void> {
    bot.commands += 1;
    // 客户端节流：避免触发服务端限流造成视图停滞
    const gap = Date.now() - lastSend;
    if (gap < 400) await sleep(400 - gap);
    lastSend = Date.now();
    await new Promise<void>((resolve) => {
      sock.emit(
        'sg:command',
        { commandId: `bot-${seat}-${Date.now().toString(36)}-${++seq}`, expectedRevision: (latest as { revision?: number } | null)?.revision ?? null, action },
        (r: { ok: boolean; error?: { code: string; message: string }; view?: Record<string, unknown> }) => {
          // ack 携带的脱敏视图用于重同步（拒绝时也返回，防卡死在过期视图）
          if (r?.view) {
            latest = r.view;
            views.push(r.view);
            notify();
          }
          if (!r?.ok) {
            bot.errors += 1;
            bot.lastReject = `${JSON.stringify(action).slice(0, 90)} → ${JSON.stringify(r?.error)}`;
          }
          resolve();
        },
      );
    });
  }

  return bot;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
