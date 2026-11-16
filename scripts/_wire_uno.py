# UNO 房间/持久化接线（一次性补丁，幂等）
import pathlib

# ── rooms.ts ──
p = pathlib.Path('src/server/rooms.ts')
s = p.read_text(encoding='utf-8')
if "from '../games/uno/adapter'" not in s:
    s = s.replace(
        "import { SanguoshaStubEngine } from '../games/sanguosha/adapter';",
        "import { SanguoshaStubEngine } from '../games/sanguosha/adapter';\nimport { UnoGame } from '../games/uno/engine';\nimport { UnoStubEngine } from '../games/uno/adapter';")
if 'uno?: UnoGame;' not in s:
    s = s.replace(
        "  /** 三国杀牌堆配置 */\n  sgDeck?: 'standard_only' | 'standard_plus_military';",
        "  /** 三国杀牌堆配置 */\n  sgDeck?: 'standard_only' | 'standard_plus_military';\n  /** UNO 对局（仅 kind==='uno'） */\n  uno?: UnoGame;")
if "room.kind === 'uno') return ['a', 'b', 'c', 'd']" not in s:
    s = s.replace(
        "  if (room.kind === 'sanguosha') return ['a', 'b', 'c', 'd'].slice(0, room.capacity ?? 4) as Side[];\n  return ['a', 'b'];",
        "  if (room.kind === 'sanguosha') return ['a', 'b', 'c', 'd'].slice(0, room.capacity ?? 4) as Side[];\n  if (room.kind === 'uno') return ['a', 'b', 'c', 'd'].slice(0, room.capacity ?? 4) as Side[];\n  return ['a', 'b'];")
if "if (room.kind === 'uno') return seatedCount" not in s:
    s = s.replace(
        "  if (room.kind === 'sanguosha') return seatedCount(room) >= (room.capacity ?? 4);\n  return seatLettersOf(room).every((s) => room.seats[s] != null);",
        "  if (room.kind === 'sanguosha') return seatedCount(room) >= (room.capacity ?? 4);\n  if (room.kind === 'uno') return seatedCount(room) >= (room.capacity ?? 4);\n  return seatLettersOf(room).every((s) => room.seats[s] != null);")
if "room.kind === 'uno') {\n      if (!room.uno) return 'waiting';" not in s:
    s = s.replace(
        "      return room.sg.st.phase === 'select' ? 'waiting' : 'playing';\n    }",
        "      return room.sg.st.phase === 'select' ? 'waiting' : 'playing';\n    }\n    if (room.kind === 'uno') {\n      if (!room.uno) return 'waiting';\n      if (room.uno.st.winner !== null || room.uno.st.phase === 'roundEnd') return 'ended';\n      return room.uno.st.phase === 'select' ? 'waiting' : 'playing';\n    }")
if ": kind === 'sanguosha' || kind === 'uno'" not in s:
    s = s.replace(
        "          : kind === 'sanguosha'\n            ? seatCount === 3\n              ? 3\n              : 4\n            : undefined;",
        "          : kind === 'sanguosha' || kind === 'uno'\n            ? seatCount === 3\n              ? 3\n              : 4\n            : undefined;")
if 'new UnoStubEngine()' not in s:
    s = s.replace(
        "        : kind === 'sanguosha'\n          ? new SanguoshaStubEngine()\n          : createEngine(kind, undefined, boardSize);",
        "        : kind === 'sanguosha'\n          ? new SanguoshaStubEngine()\n          : kind === 'uno'\n            ? new UnoStubEngine()\n            : createEngine(kind, undefined, boardSize);")
if "room.uno = UnoGame.create" not in s:
    s = s.replace(
        "      room.sg = SanguoshaGame.create(['a', 'b', 'c', 'd'].slice(0, room.capacity ?? 4) as never, sgDeck, (Math.random() * 0xffffffff) >>> 0);\n    }",
        "      room.sg = SanguoshaGame.create(['a', 'b', 'c', 'd'].slice(0, room.capacity ?? 4) as never, sgDeck, (Math.random() * 0xffffffff) >>> 0);\n    }\n    if (kind === 'uno') {\n      room.uno = UnoGame.create(['a', 'b', 'c', 'd'].slice(0, room.capacity ?? 4) as never, 'uno_classic_108', 'classic_ffa', (Math.random() * 0xffffffff) >>> 0);\n    }")
if 'unoJson: room.uno' not in s:
    s = s.replace(
        "      sgDeck: room.kind === 'sanguosha' ? room.sgDeck : null,\n    };\n  }",
        "      sgDeck: room.kind === 'sanguosha' ? room.sgDeck : null,\n      unoJson: room.uno ? room.uno.serialize() : null,\n    };\n  }")
if "p.kind === 'uno' && p.unoJson" not in s:
    s = s.replace(
        "        if (p.kind === 'sanguosha' && p.sgJson) {",
        "        if (p.kind === 'uno' && p.unoJson) {\n          const uno = UnoGame.deserialize(p.unoJson);\n          if (uno) room.uno = uno;\n        }\n        if (p.kind === 'sanguosha' && p.sgJson) {")
if "UNO 请使用 uno:command" not in s:
    s = s.replace(
        "    if (room.kind === 'sanguosha') return ackFail('NOT_ALLOWED', '三国杀请使用 sg:command');",
        "    if (room.kind === 'sanguosha') return ackFail('NOT_ALLOWED', '三国杀请使用 sg:command');\n    if (room.kind === 'uno') return ackFail('NOT_ALLOWED', 'UNO 请使用 uno:command');")
for name in ('resign', 'drawOffer', 'undoOffer', 'restartOffer'):
    anchor = f"  {name}(room: Room, session: SessionInfo): AckBase {{\n    if (room.kind === 'sanguosha') return {{ ok: false, error: err('NOT_ALLOWED', '三国杀不支持该操作') }};"
    if anchor in s and "UNO 不支持该操作') }};\n" not in s.split(anchor)[1].split('\n')[1]:
        s = s.replace(
            anchor,
            anchor + "\n    if (room.kind === 'uno') return { ok: false, error: err('NOT_ALLOWED', 'UNO 不支持该操作') };")
if 'persistUno' not in s:
    s = s.replace(
        """  /** 三国杀：持久化对局（命令历史重放式恢复） */
  persistSanguosha(room: Room): void {
    if (room.kind !== 'sanguosha' || !room.sg) return;
    try {
      this.persist(room);
    } catch {
      // 持久化失败不阻断对局（内存权威；重启后该局退回选将态）
    }
  }""",
        """  /** 三国杀：持久化对局（命令历史重放式恢复） */
  persistSanguosha(room: Room): void {
    if (room.kind !== 'sanguosha' || !room.sg) return;
    try {
      this.persist(room);
    } catch {
      // 持久化失败不阻断对局（内存权威；重启后该局退回选将态）
    }
  }

  /** UNO：持久化对局 */
  persistUno(room: Room): void {
    if (room.kind !== 'uno' || !room.uno) return;
    try {
      this.persist(room);
    } catch {
      // 同上
    }
  }""")
p.write_text(s, encoding='utf-8')
print('rooms ok')

# ── store.ts ──
p = pathlib.Path('src/server/store.ts')
s = p.read_text(encoding='utf-8')
if 'unoJson?: string | null;' not in s:
    s = s.replace(
        "  /** 三国杀对局（命令历史，重放式恢复）；其余 null */\n  sgJson?: string | null;",
        "  /** 三国杀对局（命令历史，重放式恢复）；其余 null */\n  sgJson?: string | null;\n  /** UNO 对局（命令历史）；其余 null */\n  unoJson?: string | null;")
if "ADD COLUMN uno_json TEXT" not in s:
    s = s.replace("    migrate('ALTER TABLE rooms ADD COLUMN sg_json TEXT');",
                  "    migrate('ALTER TABLE rooms ADD COLUMN sg_json TEXT');\n    migrate('ALTER TABLE rooms ADD COLUMN uno_json TEXT');")
if '@unoJson' not in s:
    s = s.replace(
        " VALUES (@roomId, @kind, @fen, @revision, @phase, @outcomeJson, @offersJson, @seatsJson, @seatCount, @sgJson, @createdAt, @updatedAt)",
        " VALUES (@roomId, @kind, @fen, @revision, @phase, @outcomeJson, @offersJson, @seatsJson, @seatCount, @sgJson, @unoJson, @createdAt, @updatedAt)")
    s = s.replace(
        "seats_json=@seatsJson, seat_count=@seatCount, sg_json=@sgJson, updated_at=@updatedAt",
        "seats_json=@seatsJson, seat_count=@seatCount, sg_json=@sgJson, uno_json=@unoJson, updated_at=@updatedAt")
if 'unoJson: r.unoJson' not in s:
    s = s.replace(
        "      sgJson: r.sgJson ?? null,\n      createdAt: r.createdAt,",
        "      sgJson: r.sgJson ?? null,\n      unoJson: r.unoJson ?? null,\n      createdAt: r.createdAt,")
if 'row.uno_json' not in s:
    s = s.replace(
        "          sgJson: (row.sg_json as string | null) ?? null,",
        "          sgJson: (row.sg_json as string | null) ?? null,\n          unoJson: (row.uno_json as string | null) ?? null,")
p.write_text(s, encoding='utf-8')
print('store ok')
