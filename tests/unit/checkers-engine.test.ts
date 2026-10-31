/** 中国跳棋规则引擎专项测试（TEST-003~014 + SEC-005/006 边界） */

import { describe, expect, it } from 'vitest';
import { CheckersEngine } from '../../src/games/checkers/engine';
import {
  ALL_CELLS,
  CELL_IDS,
  SEAT_CAMP_MAPS,
  campOf,
  cellPixel,
  cellRC,
  isValidCell,
  neighborsOf,
  targetCamp,
} from '../../src/games/checkers/board';

describe('跳棋棋盘几何（TEST-003/004）', () => {
  it('恰好 121 个有效棋位：61 中心 + 6×10 营地', () => {
    expect(ALL_CELLS.length).toBe(121);
    expect(ALL_CELLS.filter((c) => c.camp === -1).length).toBe(61);
    for (let camp = 0; camp < 6; camp++) {
      expect(ALL_CELLS.filter((c) => c.camp === camp).length).toBe(10);
    }
  });

  it('格子 ID 唯一且可往返解析', () => {
    const ids = new Set(CELL_IDS);
    expect(ids.size).toBe(121);
    for (const id of CELL_IDS) {
      expect(isValidCell(id)).toBe(true);
      const [r, c] = cellRC(id)!;
      expect(String.fromCharCode(97 + c) + String(r + 1)).toBe(id);
    }
  });

  it('六个星尖位置正确且分属六个营地', () => {
    expect(campOf('e1')).toBe(0); // 北尖 (0,4)
    expect(campOf('m5')).toBe(1); // 东北尖 (4,12)
    expect(campOf('q13')).toBe(2); // 东南尖 (12,16)
    expect(campOf('m17')).toBe(3); // 南尖 (16,12)
    expect(campOf('e13')).toBe(4); // 西南尖 (12,4)
    expect(campOf('a5')).toBe(5); // 西北尖 (4,0)
  });

  it('六方向邻接：中心格 6 邻；星尖邻居在盘内、不重复、同营地', () => {
    expect(neighborsOf('i10').length).toBe(6); // 中心附近
    for (const tip of ['e1', 'm5', 'q13', 'm17', 'e13', 'a5']) {
      const ns = neighborsOf(tip);
      expect(ns.length, tip).toBeGreaterThanOrEqual(2);
      expect(new Set(ns).size, tip).toBe(ns.length);
      for (const n of ns) {
        expect(campOf(n), `${tip}->${n}`).toBe(campOf(tip));
      }
    }
  });

  it('像素换算：121 格两两不重合', () => {
    const pts = CELL_IDS.map((id) => cellPixel(id, 100));
    const seen = new Set(pts.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`));
    expect(seen.size).toBe(121);
  });

  it('目标营地恒为正对面（target = (c+3)%6）', () => {
    for (let c = 0; c < 6; c++) expect(targetCamp(c)).toBe((c + 3) % 6);
  });
});

describe('跳棋初始局面与座位映射（TEST-013/036）', () => {
  it('2/3/4/6 人映射全部为正对营地组合', () => {
    for (const count of Object.keys(SEAT_CAMP_MAPS)) {
      const n = Number(count);
      const map = SEAT_CAMP_MAPS[n];
      const seats = Object.keys(map);
      if (n !== 3) {
        // 2/4/6 人：每个座位的目标 = 本局对手的正对营地
        for (const s of seats) {
          const opposite = seats[(seats.indexOf(s) + Math.floor(n / 2)) % n];
          expect(targetCamp(map[s]), `${n}人 ${s}`).toBe(map[opposite]);
        }
      }
      if (n === 2) {
        expect(map.a).toBe(0);
        expect(map.b).toBe(3);
      }
      if (n === 3) {
        // 3 人局：目标为未占用的对面营地（3,4,5），无同局对手正对
        expect(map.a).toBe(0);
        expect(map.b).toBe(1);
        expect(map.c).toBe(2);
        expect(targetCamp(map.a)).toBe(3);
        expect(targetCamp(map.b)).toBe(4);
        expect(targetCamp(map.c)).toBe(5);
      }
      if (n === 4) {
        expect(targetCamp(map.a)).toBe(map.c);
        expect(targetCamp(map.b)).toBe(map.d);
      }
      if (n === 6) {
        expect(Object.values(map).sort()).toEqual([0, 1, 2, 3, 4, 5]);
      }
    }
  });

  it('每种人数初始局面：每人 10 枚在自己营地、无重叠', () => {
    for (const n of [2, 3, 4, 6] as const) {
      const e = CheckersEngine.create(n);
      const all = new Set<string>();
      for (const seat of e.seatOrder()) {
        const pieces = e.piecesOf(seat);
        expect(pieces.length).toBe(10);
        for (const c of pieces) {
          expect(campOf(c)).toBe(SEAT_CAMP_MAPS[n][seat]);
          expect(all.has(c)).toBe(false);
          all.add(c);
        }
      }
      expect(all.size).toBe(10 * n);
    }
  });

  it('不支持的人数构造抛错', () => {
    expect(() => CheckersEngine.create(5 as never)).toThrow();
    expect(() => new CheckersEngine('cc1|turn=a|order=abcde|p=')).toThrow();
  });
});

describe('普通移动（TEST-005/012）', () => {
  it('开局全部为相邻单步或单跳；走一步后轮转', () => {
    const e = CheckersEngine.create(2);
    const moves = e.legalMoves();
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      const a = cellPixel(m.from, 100);
      const b = cellPixel(m.to, 100);
      const d = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
      // 相邻 = 100；单段跳 = 200（开局无多段跳）
      expect([100, 200], `${m.from}→${m.to} d=${d}`).toContain(d);
    }
    const r = e.applyMove(moves[0]);
    expect(r).not.toBeNull();
    expect(e.turn()).toBe('b');
  });

  it('不能落在已有棋子的位置（TEST-012）', () => {
    const e = CheckersEngine.create(2);
    for (const m of e.legalMoves()) {
      expect(e.pieceAt(m.to)).toBeNull();
    }
  });

  it('非法坐标/盘外坐标被拒（SEC-005）', () => {
    const e = CheckersEngine.create(2);
    expect(e.isLegal({ from: 'i10', to: 'z99' })).toBe(false);
    expect(e.isLegal({ from: 'zz', to: 'i10' })).toBe(false);
    expect(e.isLegal({ from: '', to: 'i10' })).toBe(false);
    expect(e.applyMove({ from: 'i10', to: 'z99' })).toBeNull();
  });
});

describe('跳跃与连续跳跃（TEST-006~010）', () => {
  it('越过紧邻棋子；落点被占则非法；跳板保留（TEST-006/007/008）', () => {
    // 中心行 i10(8,4), j10(8,5), k10(8,6)：i10 跳过 j10 落 k10
    const blocked = new CheckersEngine('cc1|turn=a|order=ab|p=a:i10,b:j10,b:k10');
    expect(blocked.isLegal({ from: 'i10', to: 'k10', path: ['i10', 'k10'] })).toBe(false);
    const e = new CheckersEngine('cc1|turn=a|order=ab|p=a:i10,b:j10');
    expect(e.isLegal({ from: 'i10', to: 'k10', path: ['i10', 'k10'] })).toBe(true);
    const r = e.applyMove({ from: 'i10', to: 'k10', path: ['i10', 'k10'] });
    expect(r).not.toBeNull();
    expect(e.pieceAt('j10')).toBe('B'); // 跳板保留（无吃子）
    expect(e.pieceAt('i10')).toBeNull();
    expect(e.pieceAt('k10')).toBe('A');
  });

  it('可以跳过己方棋子（TEST-006）', () => {
    const e = new CheckersEngine('cc1|turn=a|order=ab|p=a:i10,a:j10');
    expect(e.isLegal({ from: 'i10', to: 'k10', path: ['i10', 'k10'] })).toBe(true);
  });

  it('连续跳跃：逐段校验、落点为空、跳板全部保留（TEST-009）', () => {
    // i10 → 跳过 j10 落 k10 → 再跳过 l10 落 m10
    const e = new CheckersEngine('cc1|turn=a|order=ab|p=a:i10,b:j10,b:l10');
    const path = ['i10', 'k10', 'm10'];
    expect(e.isLegal({ from: 'i10', to: 'm10', path })).toBe(true);
    const r = e.applyMove({ from: 'i10', to: 'm10', path });
    expect(r).not.toBeNull();
    expect(r!.path).toEqual(path);
    expect(e.pieceAt('j10')).toBe('B');
    expect(e.pieceAt('l10')).toBe('B');
    expect(e.pieceAt('m10')).toBe('A'); // 连跳后棋子落在最终落点 m10
    expect(e.pieceAt('k10')).toBeNull(); // 中间落点已离开，为空
  });

  it('路径非法：混入普通移动/重复落点/超长/空路径/盘外/落点被占（TEST-010/SEC-005/006）', () => {
    // 普通移动混入多段路径（n>2 时每段必须跳跃）
    const e = new CheckersEngine('cc1|turn=a|order=ab|p=a:i10,a:j10,b:k11');
    expect(e.isLegal({ from: 'j10', to: 'k10', path: ['i10', 'j10', 'k10'] })).toBe(false);
    // 重复落点（循环）
    expect(e.isLegal({ from: 'i10', to: 'i10', path: ['i10', 'j10', 'i10'] })).toBe(false);
    // 超长路径（>16 点，SEC-006 防失控）
    const long = Array.from({ length: 20 }, () => 'i10');
    expect(e.isLegal({ from: 'i10', to: 'i10', path: long })).toBe(false);
    // 空路径
    expect(e.isLegal({ from: 'i10', to: 'i10', path: [] })).toBe(false);
    // 盘外坐标
    expect(e.isLegal({ from: 'i10', to: 'zz', path: ['i10', 'zz'] })).toBe(false);
    // 落点被占
    expect(e.isLegal({ from: 'i10', to: 'j10', path: ['i10', 'j10'] })).toBe(false);
  });

  it('只能移动自己的棋子（TEST-029 部分）', () => {
    const e = new CheckersEngine('cc1|turn=a|order=ab|p=a:i10,b:j11');
    expect(e.isLegal({ from: 'j11', to: 'k12' })).toBe(false);
    expect(e.applyMove({ from: 'j11', to: 'k12' })).toBeNull();
  });
});

describe('目标营地规则与胜利（TEST-011/012/022）', () => {
  it('进入目标营地后不得离开；营内可移动（TEST-022）', () => {
    // 2 人局 a 的目标营地 = camp3（南）。摆一个 a 子在南营内（有盘外邻格的位置）
    const targetCells = ALL_CELLS.filter((c) => c.camp === 3).map((c) => c.id);
    const inside = targetCells.find((c) => neighborsOf(c).some((n) => campOf(n) === -1))!;
    const e = new CheckersEngine(`cc1|turn=a|order=ab|p=a:${inside},b:i10`);
    const moves = e.legalMoves();
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      expect(campOf(m.to), `${m.from}→${m.to}`).toBe(3);
    }
  });

  it('不得进入他人营地（TEST-011）', () => {
    // a 在中心 i10：任何落点不得是营地格
    const e = new CheckersEngine('cc1|turn=a|order=ab|p=a:i10,b:j11');
    for (const m of e.legalMoves()) {
      expect(campOf(m.to)).toBe(-1);
    }
  });

  it('胜利判定：全部棋子进入目标营地（TEST-012）', () => {
    const targetCells = ALL_CELLS.filter((c) => c.camp === 3).map((c) => c.id);
    const e = new CheckersEngine(`cc1|turn=a|order=ab|p=a:${targetCells.join(',')},b:i10`);
    expect(e.outcome()).not.toBeNull();
    expect(e.outcome()?.winner).toBe('a');
    expect(e.outcome()?.type).toBe('goal');
    expect(e.legalMoves().length).toBe(0);
  });

  it('未全部到达不判胜', () => {
    const targetCells = ALL_CELLS.filter((c) => c.camp === 3).map((c) => c.id);
    const p = `a:${targetCells.slice(0, 9).join(',')},i10`;
    const e = new CheckersEngine(`cc1|turn=a|order=ab|p=${p},b:i10`);
    expect(e.outcome()).toBeNull();
  });
});

describe('多人轮次与认输（TEST-014/CHECKERS-020/024）', () => {
  it('3 人局轮转 a→b→c→a；认输后跳过退出者', () => {
    const e = CheckersEngine.create(3);
    e.applyMove(e.legalMoves()[0]);
    expect(e.turn()).toBe('b');
    e.applyMove(e.legalMoves()[0]);
    expect(e.turn()).toBe('c');
    e.resignSeat('b');
    e.applyMove(e.legalMoves()[0]);
    expect(e.turn()).toBe('a');
    expect(e.activeSeats()).toEqual(['a', 'c']);
  });

  it('多人局只剩一人时判定获胜（CHECKERS-024）', () => {
    const e = CheckersEngine.create(3);
    e.resignSeat('b');
    expect(e.outcome()).toBeNull();
    e.resignSeat('c');
    expect(e.outcome()?.winner).toBe('a');
    expect(e.outcome()?.type).toBe('resignation');
  });

  it('6 人局可创建且每人 10 枚', () => {
    const e = CheckersEngine.create(6);
    expect(e.seatOrder().length).toBe(6);
    for (const s of e.seatOrder()) expect(e.piecesOf(s).length).toBe(10);
  });

  it('状态序列化往返一致（断线恢复基础）', () => {
    const e = CheckersEngine.create(4);
    for (let i = 0; i < 3; i++) e.applyMove(e.legalMoves()[0]);
    const fen = e.fen();
    const e2 = new CheckersEngine(fen);
    expect(e2.fen()).toBe(fen);
    expect(e2.turn()).toBe(e.turn());
    for (const seat of e.seatOrder()) {
      expect(e2.piecesOf(seat).sort()).toEqual(e.piecesOf(seat).sort());
    }
  });
});
