/**
 * SQLite 持久化（better-sqlite3，MIT）。
 * 数据保存在本机 data/ 目录；会话令牌只存 SHA-256 哈希，不存明文。
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import type { GameKind, GameOutcome, Side } from '../games/types';
import type { ChatMessage, OffersState, PublicMove, RoomPhase } from '../shared/protocol';

export interface SeatPersist {
  tokenHash: string;
  name: string;
}

export interface RoomPersist {
  roomId: string;
  kind: GameKind;
  fen: string;
  revision: number;
  phase: RoomPhase;
  outcome: GameOutcome | null;
  offers: OffersState;
  /** 键为该房间有效座位字母（中象/国象 a,b；跳棋 a..f 中前 N 个）；缺失 = 未占用 */
  seats: Partial<Record<Side, SeatPersist | null>>;
  /** 跳棋 2/3/4/6；三国杀 3/4；其余缺省 2 */
  seatCount?: number;
  createdAt: number;
  updatedAt: number;
  /** 三国杀对局（命令历史，重放式恢复）；其余 null */
  sgJson?: string | null;
  /** UNO 对局（命令历史）；其余 null */
  unoJson?: string | null;
  /** 三国杀牌堆配置 */
  sgDeck?: 'standard_only' | 'standard_plus_military' | null;
}

export interface SessionPersist {
  tokenHash: string;
  roomId: string;
  seat: Side | 'spectator';
  name: string;
  createdAt: number;
}

export class Store {
  private db: Database.Database;
  private stmtUpsertRoom: Database.Statement;
  private stmtLoadRooms: Database.Statement;
  private stmtDeleteRoom: Database.Statement;
  private stmtAppendMove: Database.Statement;
  private stmtLoadMoves: Database.Statement;
  private stmtDeleteMovesFrom: Database.Statement;
  private stmtClearMoves: Database.Statement;
  private stmtInsertSession: Database.Statement;
  private stmtLoadSessions: Database.Statement;
  private stmtDeleteSessionsOfRoom: Database.Statement;
  private stmtAppendChat: Database.Statement;
  private stmtLoadChat: Database.Statement;
  private stmtSelectStaleRooms: Database.Statement;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        room_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        fen TEXT NOT NULL,
        revision INTEGER NOT NULL,
        phase TEXT NOT NULL,
        outcome_json TEXT,
        offers_json TEXT NOT NULL,
        seats_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS moves (
        room_id TEXT NOT NULL,
        ply INTEGER NOT NULL,
        side TEXT NOT NULL,
        from_sq TEXT NOT NULL,
        to_sq TEXT NOT NULL,
        promotion TEXT,
        notation TEXT NOT NULL,
        fen_before TEXT NOT NULL,
        fen_after TEXT NOT NULL,
        captured TEXT,
        check_flag INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        PRIMARY KEY (room_id, ply)
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        seat TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat (
        room_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        name TEXT NOT NULL,
        side TEXT NOT NULL,
        text TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_moves_room ON moves(room_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_room ON sessions(room_id);
    `);
    // 三棋升级迁移（DATA-001~003）：全部为「可空附加列」，向后兼容。
    // 回滚设计：旧版本代码 SELECT * 会忽略新增列、INSERT 不含新列（默认 NULL），
    // 因此回滚到旧构建时无需任何数据库操作；本迁移亦不修改/删除任何既有列。
    // rooms.seat_count：跳棋房间座位数（2/3/4/6）；旧行为 NULL（=2）。
    // moves.path_json / extra_json / captured_sq：跳棋连跳路径、特殊动作轨迹、被吃子实际格。
    const migrate = (sql: string) => {
      try {
        this.db.exec(sql);
      } catch {
        // 列已存在（重复启动）：忽略
      }
    };
    migrate('ALTER TABLE rooms ADD COLUMN seat_count INTEGER');
    migrate('ALTER TABLE rooms ADD COLUMN sg_json TEXT');
    migrate('ALTER TABLE rooms ADD COLUMN uno_json TEXT');
    migrate('ALTER TABLE moves ADD COLUMN captured_sq TEXT');
    migrate('ALTER TABLE moves ADD COLUMN path_json TEXT');
    migrate('ALTER TABLE moves ADD COLUMN extra_json TEXT');
    this.stmtUpsertRoom = this.db.prepare(
      `INSERT INTO rooms (room_id, kind, fen, revision, phase, outcome_json, offers_json, seats_json, seat_count, sg_json, uno_json, created_at, updated_at)
       VALUES (@roomId, @kind, @fen, @revision, @phase, @outcomeJson, @offersJson, @seatsJson, @seatCount, @sgJson, @unoJson, @createdAt, @updatedAt)
       ON CONFLICT(room_id) DO UPDATE SET kind=@kind, fen=@fen, revision=@revision, phase=@phase,
         outcome_json=@outcomeJson, offers_json=@offersJson, seats_json=@seatsJson, seat_count=@seatCount, sg_json=@sgJson, uno_json=@unoJson, updated_at=@updatedAt`,
    );
    this.stmtLoadRooms = this.db.prepare('SELECT * FROM rooms ORDER BY created_at');
    this.stmtDeleteRoom = this.db.prepare('DELETE FROM rooms WHERE room_id = ?');
    this.stmtAppendMove = this.db.prepare(
      `INSERT INTO moves (room_id, ply, side, from_sq, to_sq, promotion, notation, fen_before, fen_after, captured, captured_sq, path_json, extra_json, check_flag, ts)
       VALUES (@roomId, @ply, @side, @from, @to, @promotion, @notation, @fenBefore, @fenAfter, @captured, @capturedSq, @pathJson, @extraJson, @check, @ts)`,
    );
    this.stmtLoadMoves = this.db.prepare('SELECT * FROM moves WHERE room_id = ? ORDER BY ply');
    this.stmtDeleteMovesFrom = this.db.prepare('DELETE FROM moves WHERE room_id = ? AND ply >= ?');
    this.stmtClearMoves = this.db.prepare('DELETE FROM moves WHERE room_id = ?');
    this.stmtInsertSession = this.db.prepare(
      `INSERT OR REPLACE INTO sessions (token_hash, room_id, seat, name, created_at) VALUES (@tokenHash, @roomId, @seat, @name, @createdAt)`,
    );
    this.stmtLoadSessions = this.db.prepare('SELECT * FROM sessions');
    this.stmtDeleteSessionsOfRoom = this.db.prepare('DELETE FROM sessions WHERE room_id = ?');
    this.stmtAppendChat = this.db.prepare(
      'INSERT INTO chat (room_id, ts, name, side, text) VALUES (@roomId, @ts, @name, @side, @text)',
    );
    this.stmtLoadChat = this.db.prepare('SELECT * FROM (SELECT * FROM chat WHERE room_id = ? ORDER BY ts DESC LIMIT 100) ORDER BY ts');
    this.stmtSelectStaleRooms = this.db.prepare(
      'SELECT room_id FROM rooms WHERE (phase = ? AND updated_at < ?) OR updated_at < ?',
    );
  }

  saveRoom(r: RoomPersist): void {
    this.stmtUpsertRoom.run({
      roomId: r.roomId,
      kind: r.kind,
      fen: r.fen,
      revision: r.revision,
      phase: r.phase,
      outcomeJson: r.outcome ? JSON.stringify(r.outcome) : null,
      offersJson: JSON.stringify(r.offers),
      seatsJson: JSON.stringify(r.seats),
      seatCount: r.seatCount ?? null,
      sgJson: r.sgJson ?? null,
      unoJson: r.unoJson ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    });
  }

  loadRooms(): RoomPersist[] {
    const rows = this.stmtLoadRooms.all() as Array<Record<string, unknown>>;
    const out: RoomPersist[] = [];
    for (const row of rows) {
      try {
        out.push({
          roomId: String(row.room_id),
          kind: row.kind as GameKind,
          fen: String(row.fen),
          revision: Number(row.revision),
          phase: row.phase as RoomPhase,
          outcome: row.outcome_json ? (JSON.parse(String(row.outcome_json)) as GameOutcome) : null,
          offers: JSON.parse(String(row.offers_json)) as OffersState,
          seats: JSON.parse(String(row.seats_json)) as RoomPersist['seats'],
          seatCount: row.seat_count != null ? Number(row.seat_count) : undefined,
          sgJson: (row.sg_json as string | null) ?? null,
          unoJson: (row.uno_json as string | null) ?? null,
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at),
        });
      } catch {
        // 跳过损坏行（不中断启动）
      }
    }
    return out;
  }

  deleteRoom(roomId: string): void {
    const tx = this.db.transaction(() => {
      this.stmtDeleteRoom.run(roomId);
      this.stmtClearMoves.run(roomId);
      this.stmtDeleteSessionsOfRoom.run(roomId);
    });
    tx();
  }

  appendMove(roomId: string, m: PublicMove): void {
    this.stmtAppendMove.run({
      roomId,
      ply: m.ply,
      side: m.side,
      from: m.from,
      to: m.to,
      promotion: m.promotion ?? null,
      notation: m.notation,
      fenBefore: m.fenBefore,
      fenAfter: m.fenAfter,
      captured: m.captured ?? null,
      capturedSq: m.capturedSq ?? null,
      pathJson: m.path ? JSON.stringify(m.path) : null,
      extraJson: m.extra ? JSON.stringify(m.extra) : null,
      check: m.check ? 1 : 0,
      ts: m.ts,
    });
  }

  /** 走棋与房间行保存同事务：崩溃时不出现"棋谱有而房间行落后"的半写状态 */
  appendMoveAndSaveRoom(roomId: string, m: PublicMove, r: RoomPersist): void {
    const tx = this.db.transaction(() => {
      this.appendMove(roomId, m);
      this.saveRoom(r);
    });
    tx();
  }

  loadMoves(roomId: string): PublicMove[] {
    const rows = this.stmtLoadMoves.all(roomId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      ply: Number(row.ply),
      side: row.side as Side,
      from: String(row.from_sq),
      to: String(row.to_sq),
      promotion: row.promotion ? String(row.promotion) : undefined,
      notation: String(row.notation),
      fenBefore: String(row.fen_before),
      fenAfter: String(row.fen_after),
      captured: row.captured ? String(row.captured) : null,
      capturedSq: row.captured_sq ? String(row.captured_sq) : undefined,
      path: row.path_json ? (JSON.parse(String(row.path_json)) as string[]) : undefined,
      extra: row.extra_json ? (JSON.parse(String(row.extra_json)) as PublicMove['extra']) : undefined,
      check: Number(row.check_flag) === 1,
      ts: Number(row.ts),
    }));
  }

  deleteMovesFrom(roomId: string, ply: number): void {
    this.stmtDeleteMovesFrom.run(roomId, ply);
  }

  clearMoves(roomId: string): void {
    this.stmtClearMoves.run(roomId);
  }

  saveSession(s: SessionPersist): void {
    this.stmtInsertSession.run(s);
  }

  loadSessions(): SessionPersist[] {
    const rows = this.stmtLoadSessions.all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      tokenHash: String(row.token_hash),
      roomId: String(row.room_id),
      seat: row.seat as SessionPersist['seat'],
      name: String(row.name),
      createdAt: Number(row.created_at),
    }));
  }

  appendChat(roomId: string, msg: ChatMessage): void {
    this.stmtAppendChat.run({ roomId, ts: msg.ts, name: msg.name, side: msg.side, text: msg.text });
  }

  loadChat(roomId: string): ChatMessage[] {
    const rows = this.stmtLoadChat.all(roomId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      name: String(row.name),
      side: row.side as Side | 'spectator',
      text: String(row.text),
      ts: Number(row.ts),
    }));
  }

  /** 清理已结束超时的房间；不会影响活跃对局 */
  cleanup(endedBefore: number, staleBefore: number): number {
    const stale = this.stmtSelectStaleRooms.all('ended', endedBefore, staleBefore) as Array<{ room_id: string }>;
    if (stale.length === 0) return 0;
    const tx = this.db.transaction(() => {
      for (const row of stale) {
        const roomId = String(row.room_id);
        this.stmtDeleteRoom.run(roomId);
        this.stmtClearMoves.run(roomId);
        this.stmtDeleteSessionsOfRoom.run(roomId);
      }
    });
    tx();
    return stale.length;
  }

  close(): void {
    this.db.close();
  }
}
