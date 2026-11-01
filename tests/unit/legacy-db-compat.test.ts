/** DATA-003/DATA-002：旧版 schema 数据库向后兼容 + 服务重启恢复 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { Store } from '../../src/server/store';

/** 用旧版（无 seat_count/captured_sq/path_json/extra_json 列）schema 手工建库并写入两棋种数据 */
function buildLegacyDb(path: string): void {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE rooms (
      room_id TEXT PRIMARY KEY, kind TEXT NOT NULL, fen TEXT NOT NULL, revision INTEGER NOT NULL,
      phase TEXT NOT NULL, outcome_json TEXT, offers_json TEXT NOT NULL, seats_json TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE moves (
      room_id TEXT NOT NULL, ply INTEGER NOT NULL, side TEXT NOT NULL, from_sq TEXT NOT NULL, to_sq TEXT NOT NULL,
      promotion TEXT, notation TEXT NOT NULL, fen_before TEXT NOT NULL, fen_after TEXT NOT NULL,
      captured TEXT, check_flag INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (room_id, ply)
    );
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, room_id TEXT NOT NULL, seat TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE chat (room_id TEXT NOT NULL, ts INTEGER NOT NULL, name TEXT NOT NULL, side TEXT NOT NULL, text TEXT NOT NULL);
  `);
  db.prepare(
    `INSERT INTO rooms VALUES ('legacyroom1', 'chess', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 3, 'playing', NULL, '{}', '{"a":{"tokenHash":"hashA","name":"老白"},"b":null}', 1, 2)`,
  ).run();
  db.prepare(
    `INSERT INTO moves VALUES ('legacyroom1', 1, 'a', 'e2', 'e4', NULL, 'e4', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPPPPPP/RNBQKBNR b KQkq e3 0 1', NULL, 0, 1700000000000)`,
  ).run();
  db.prepare(`INSERT INTO sessions VALUES ('hashA', 'legacyroom1', 'a', '老白', 1)`).run();
  db.close();
}

describe('旧版数据库向后兼容（DATA-003）', () => {
  let dir: string;
  let dbPath: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'acc-legacy-'));
    dbPath = join(dir, 'legacy.db');
    buildLegacyDb(dbPath);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('新代码打开旧库：自动补列、读出房间与棋谱、新列缺省', () => {
    expect(existsSync(dbPath)).toBe(true);
    const store = new Store(dbPath); // 构造即执行迁移
    try {
      const rooms = store.loadRooms();
      expect(rooms).toHaveLength(1);
      expect(rooms[0].roomId).toBe('legacyroom1');
      expect(rooms[0].kind).toBe('chess');
      expect(rooms[0].seats.a?.name).toBe('老白');
      expect(rooms[0].seatCount).toBeUndefined(); // 旧行无 seat_count → undefined（=双人）
      const moves = store.loadMoves('legacyroom1');
      expect(moves).toHaveLength(1);
      expect(moves[0].from).toBe('e2');
      expect(moves[0].path).toBeUndefined();
      expect(moves[0].capturedSq).toBeUndefined();
      // 新代码写入（含新列）不破坏旧行
      store.appendMove('legacyroom1', {
        ply: 2, side: 'b', from: 'e7', to: 'e5', notation: 'e5',
        fenBefore: 'x', fenAfter: 'y', captured: null, capturedSq: null,
        path: ['e7', 'e5'], extra: undefined, check: false, ts: 1700000001000,
      });
      const moves2 = store.loadMoves('legacyroom1');
      expect(moves2).toHaveLength(2);
      expect(moves2[1].path).toEqual(['e7', 'e5']);
    } finally {
      store.close();
    }
  });

  it('迁移幂等：重复打开同一旧库不报错', () => {
    const store = new Store(dbPath);
    const rooms = store.loadRooms();
    expect(rooms.length).toBe(1);
    store.close();
  });
});
