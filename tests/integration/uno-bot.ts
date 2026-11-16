/**
 * UNO 自动对局客户端（真实 socket 协议）。
 * 决策依赖服务端视图（myHand/pending/currentColor）。
 */
import { io, type Socket } from 'socket.io-client';

export interface UnoBot {
  seat: string;
  socket: Socket;
  views: Array<Record<string, unknown>>;
  commands: number;
  errors: number;
  lastReject: string | null;
  stop(): void;
  run(maxSteps?: number): Promise<'finished' | 'steps'>;
}

export function connectUnoBot(url: string, seat: string, socket?: Socket): UnoBot {
  const sock = socket ?? io(url, { transports: ['websocket'], forceNew: true });
  const views: Array<Record<string, unknown>> = [];
  let latest: Record<string, unknown> | null = null;
  let stopped = false;
  let seq = 0;
  let lastSend = 0;
  const bot: UnoBot = {
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
    async run(maxSteps = 20000) {
      let steps = 0;
      while (!stopped && steps < maxSteps) {
        const v = latest as {
          winner?: string | null;
          phase?: string;
          turn?: string;
          pendingDraw?: number;
          pending?: { kind: string; playerId?: string; picks?: Record<string, string> } | null;
          myHand?: string[];
          teamPassDone?: boolean;
        } | null;
        if (!v) { await sleep(50); steps += 1; continue; }
        if (v.winner != null || v.phase === 'roundEnd') return 'finished';
        let acted = false;
        const gap = Date.now() - lastSend;
        if (gap < 100) await sleep(100 - gap);
        if (v.phase === 'select') {
          await cmd({ type: 'ready', ready: true });
          acted = true;
        } else if (v.pending?.kind === 'team-pass' && v.pending.picks?.[seat] == null) {
          await cmd({ type: 'team-pass', cardId: (v.myHand ?? [])[0] });
          acted = true;
        } else if (v.pending?.kind === 'challenge' && v.pending.playerId === seat) {
          await cmd({ type: 'challenge', challenge: Math.random() < 0.5 });
          acted = true;
        } else if (v.pending?.kind === 'choose-color' && v.pending.playerId === seat) {
          await cmd({ type: 'choose-color', color: ['R', 'Y', 'G', 'B'][Math.floor(Math.random() * 4)] });
          acted = true;
        } else if (v.pending?.kind === 'swap-target' && v.pending.playerId === seat) {
          const cands = (v.players ?? []).filter((p) => p.id !== seat).map((p) => p.id);
          await cmd({ type: 'choose-target', target: cands[0] });
          acted = true;
        } else if (v.turn === seat) {
          const playable = (v as { playableIds?: string[] }).playableIds ?? [];
          if (v.pendingDraw === 0 && playable.length > 0 && Math.random() < 0.85) {
            const id = playable[Math.floor(Math.random() * playable.length)];
            const card = cardOf(id);
            await cmd({ type: 'play-card', cardId: id, chosenColor: card && card.kind.startsWith('wild') ? ['R', 'Y', 'G', 'B'][Math.floor(Math.random() * 4)] : undefined });
          } else {
            await cmd({ type: 'draw' });
          }
          acted = true;
        } else if (v.turn !== seat) {
          // 其他人回合：偶尔喊 UNO（自己剩 2 张时）
          if ((v.myHand ?? []).length === 2 && Math.random() < 0.5) {
            await cmd({ type: 'call-uno' });
            acted = true;
          }
        }
        if (!acted) await sleep(60);
        steps += 1;
      }
      return 'steps';
    },
  };

  function vColorOf(v: unknown): string {
    return ((v as { currentColor?: string })?.currentColor ?? 'R');
  }
  function topCardOf(v: unknown) {
    const id = (v as { discardTop?: string })?.discardTop;
    return id ? cardOf(id) : null;
  }
  function topNumber(v: unknown): number | undefined {
    return topCardOf(v)?.number;
  }
  function topKind(v: unknown): string {
    return topCardOf(v)?.kind ?? 'number';
  }
  function cardOf(id: string) {
    // 通过全局注册表：由调用方注入 —— 简化：依赖 id 编码解析
    const m = /^u-(?:c108|c112|t112)-\d+-([a-z_0-4]+?)(R|Y|G|B)?(\d*)$/.exec(id);
    if (!m) return null;
    const kind = m[1];
    const color = (m[2] as 'R' | 'Y' | 'G' | 'B' | undefined) ?? null;
    const number = m[3] ? Number(m[3]) : undefined;
    return { kind, color, number };
  }
  async function cmd(action: Record<string, unknown>): Promise<void> {
    bot.commands += 1;
    lastSend = Date.now();
    await new Promise<void>((resolve) => {
      sock.emit(
        'uno:command',
        { commandId: `uno-${seat}-${Date.now().toString(36)}-${++seq}`, expectedRevision: (latest as { revision?: number } | null)?.revision ?? null, action },
        (r: { ok: boolean; error?: { code: string; message: string }; view?: Record<string, unknown> }) => {
          if (r?.view) {
            latest = r.view;
            views.push(r.view);
          }
          if (!r?.ok) {
            bot.errors += 1;
            bot.lastReject = `${JSON.stringify(action).slice(0, 80)} → ${JSON.stringify(r?.error)}`;
          }
          resolve();
        },
      );
    });
  }

  sock.on('uno:state', (p: { view: Record<string, unknown> }) => {
    latest = p.view;
    views.push(p.view);
  });

  return bot;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
