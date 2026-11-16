# UNO socket 接线（一次性补丁，幂等）
import pathlib

NL = chr(10)

p = pathlib.Path('src/server/socket.ts')
s = p.read_text(encoding='utf-8')

if "from '../games/uno/engine'" not in s:
    s = s.replace(
        "import type { SgAction, SgPlayerId } from '../games/sanguosha/types';",
        "import type { SgAction, SgPlayerId } from '../games/sanguosha/types';" + NL + "import type { UnoSeat } from '../games/uno/engine';")

if 'unoCommand' not in s:
    uno_schema = (
        "  unoCommand: z.object({" + NL
        + "    commandId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/)," + NL
        + "    expectedRevision: z.number().int().nonnegative().nullable().optional()," + NL
        + "    action: z.object({ type: z.string().max(24) }).passthrough()," + NL
        + "  })," + NL
    )
    s = s.replace("  sgCommand: z.object({", uno_schema + "  sgCommand: z.object({")

if "kind === 'uno' && room.uno" not in s:
    uno_broadcast = (
        "    if (room?.kind === 'uno' && room.uno) {" + NL
        + "      const socketIds = io.of('/').adapter.rooms.get(roomId);" + NL
        + "      if (socketIds && socketIds.size > 0) {" + NL
        + "        for (const sid of socketIds) {" + NL
        + "          const sock = io.of('/').sockets.get(sid);" + NL
        + "          const seat = sock?.data?.session?.seat;" + NL
        + "          const view = seat && seat !== 'spectator' ? room.uno.view(seat as UnoSeat) : room.uno.view(null);" + NL
        + "          io.to(sid).emit('uno:state', { view, reason });" + NL
        + "        }" + NL
        + "        return;" + NL
        + "      }" + NL
        + "    }" + NL
    )
    s = s.replace(
        "    const room = rooms.roomById(roomId);" + NL + "    if (room?.kind === 'sanguosha' && room.sg) {",
        "    const room = rooms.roomById(roomId);" + NL + uno_broadcast + "    if (room?.kind === 'sanguosha' && room.sg) {")

if "socket.on('uno:command'" not in s:
    uno_handler_lines = [
        "    socket.on('uno:command', (payload, ack) => {",
        "      if (typeof ack !== 'function') return;",
        "      const parsed = Schemas.unoCommand.safeParse(payload);",
        "      if (!parsed.success) return fail(ack, 'INVALID_INPUT', '参数不合法');",
        "      const bound = requireSession();",
        "      if (!bound) return fail(ack, 'SESSION_INVALID', '会话失效，请重新加入房间');",
        "      const { room, session } = bound;",
        "      if (room.kind !== 'uno' || !room.uno) return fail(ack, 'NOT_ALLOWED', '房间类型不匹配');",
        "      if (session.seat === 'spectator') return fail(ack, 'NOT_PLAYER', '观战者不能操作');",
        "      const seat = session.seat;",
        "      if (!['a', 'b', 'c', 'd'].includes(seat)) return fail(ack, 'NOT_PLAYER', '座位无效');",
        "      if (!moveLimit.allow(socket.id)) {",
        "        const v = room.uno.view(seat as UnoSeat);",
        "        ack({ ok: false, error: { code: 'RATE_LIMITED', message: '操作过于频繁，请稍后再试' }, revision: room.uno.st.revision, view: v });",
        "        return;",
        "      }",
        "      void rooms.enqueue(room, () => {",
        "        try {",
        "          const uno = room.uno!;",
        "          const r = uno.command(seat as UnoSeat, parsed.data.action as Record<string, unknown>, parsed.data.expectedRevision ?? null, parsed.data.commandId);",
        "          if (r.ok) rooms.persistUno(room);",
        "          const view = uno.view(seat as UnoSeat);",
        "          if (r.ok) {",
        "            ack({ ok: true, revision: r.revision, view });",
        "            rooms.broadcast(room.id, rooms.publicState(room), 'sg');",
        "          } else if (r.error) {",
        "            ack({ ok: false, error: r.error as AppError, revision: r.revision, view });",
        "          } else {",
        "            ack({ ok: false, revision: r.revision, view });",
        "          }",
        "        } catch (e) {",
        "          console.error(`[io] UNO 命令异常 ${room.id}:`, (e as Error).message);",
        "          ack({ ok: false, error: { code: 'INTERNAL', message: '服务器内部错误' } });",
        "        }",
        "      });",
        "    });",
        "",
    ]
    uno_handler = NL.join(uno_handler_lines)
    s = s.replace("    socket.on('sg:command', (payload, ack) => {", uno_handler + NL + "    socket.on('sg:command', (payload, ack) => {")

s = s.replace(
    "kind: z.enum(['xiangqi', 'chess', 'checkers', 'go', 'gomoku', 'sanguosha']),",
    "kind: z.enum(['xiangqi', 'chess', 'checkers', 'go', 'gomoku', 'sanguosha', 'uno']),")

p.write_text(s, encoding='utf-8')
print('socket ok')

# ── protocol.ts ──
p = pathlib.Path('src/shared/protocol.ts')
s = p.read_text(encoding='utf-8')

if "'uno:command'" not in s:
    uno_cmd = [
        "  /** UNO 命令（服务端权威校验+结算） */",
        "  'uno:command': (",
        "    p: { commandId: string; expectedRevision?: number | null; action: { type: string } & Record<string, unknown> },",
        "    ack: (r: { ok: boolean; error?: AppError; revision?: number; view?: UnoClientView }) => void,",
        "  ) => void;",
    ]
    s = s.replace("  /** 三国杀命令（服务端权威校验+结算） */", NL.join(uno_cmd) + NL + "  /** 三国杀命令（服务端权威校验+结算） */")

if "'uno:state'" not in s:
    uno_state = [
        "  /** UNO 个性化脱敏视图（每 socket 独立） */",
        "  'uno:state': (p: { view: UnoClientView; reason: StateReason }) => void;",
    ]
    s = s.replace("  /** 三国杀个性化脱敏视图（每 socket 独立） */", NL.join(uno_state) + NL + "  /** 三国杀个性化脱敏视图（每 socket 独立） */")

if 'export interface UnoClientView' not in s:
    view = [
        "/** UNO 客户端视图（服务端 uno.view 序列化） */",
        "export interface UnoClientView {",
        "  revision: number;",
        "  phase: string;",
        "  ruleProfile: string;",
        "  deckProfile: string;",
        "  turnNumber: number;",
        "  turn: string;",
        "  direction: 1 | -1;",
        "  currentColor: string;",
        "  drawCount: number;",
        "  discardCount: number;",
        "  discardTop: string | null;",
        "  myHand: string[];",
        "  myUnoCalled: boolean;",
        "  winner: string | null;",
        "  winningTeam: string | null;",
        "  roundWinner: string | null;",
        "  teamPassDone: boolean;",
        "  pendingDraw: number;",
        "  lastActor: { seat: string; calledUno: boolean } | null;",
        "  players: Array<{ id: string; team: string | null; handCount: number; unoCalled: boolean; isOut: boolean; ready: boolean }>;",
        "  pending: { kind: string; playerId?: string; windowId?: string; picks?: Record<string, string> } | null;",
        "  log: Array<{ seq: number; rev: number; t: string; [k: string]: unknown }>;",
        "}",
        "",
    ]
    s = s.replace("export interface MoveAck extends AckBase {", NL.join(view) + "export interface MoveAck extends AckBase {")

p.write_text(s, encoding='utf-8')
print('protocol ok')
