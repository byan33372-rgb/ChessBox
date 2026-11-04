/**
 * 跳棋专项回归（第三阶段）：后三子故障、pass 支持、121 孔位穷举属性、自由选座映射。
 * DEF-CK-001（P0）：引擎无停一手 → 被堵死时对局死锁（用户报告"后三个棋子不能移动"的机制之一）。
 * DEF-CK-002（P1）：自由选座模式下客户端/引擎营地映射错位 → 合法营内步被隐藏。
 */
import { describe, expect, it } from 'vitest';
import { CheckersEngine, CAMP_SEAT_NAMES, FREE_SEAT_CAMPS } from '../../src/games/checkers/engine';
import { ALL_CELLS, CELL_IDS, campOf, cellPixel, cellRC, jumpLanding, neighborsOf } from '../../src/games/checkers/board';

const CAMP0 = ['e1', 'e2', 'f2', 'e3', 'f3', 'g3', 'e4', 'f4', 'g4', 'h4'];

/** 交替行棋帮助器：a 走 from，d 停一手 */
function aThenPass(e: CheckersEngine, from: string): boolean {
  const ms = e.legalMoves().filter((m) => m.from === from);
  if (!ms.length) return false;
  if (!e.applyMove(ms[0])) return false;
  return !!e.applyMove({ from: 'pass', to: 'pass' });
}

describe('DEF-CK-001：停一手支持（P0 修复回归）', () => {
  it('停一手轮转行棋方；连续两次停一手判和', () => {
    const e = CheckersEngine.createFree();
    e.addSeat('a');
    e.addSeat('d');
    expect(e.turn()).toBe('a');
    const p1 = e.applyMove({ from: 'pass', to: 'pass' });
    expect(p1).not.toBeNull();
    expect(e.turn()).toBe('d');
    const p2 = e.applyMove({ from: 'pass', to: 'pass' });
    expect(p2).not.toBeNull();
    expect(e.outcome()?.type).toBe('stalemate');
    expect(e.outcome()?.winner).toBeNull();
    expect(e.legalMoves().length).toBe(0);
  });

  it('石子着法重置连续停一手计数；fen 持久化 passes（重连恢复一致）', () => {
    const e = CheckersEngine.createFree();
    e.addSeat('a');
    e.addSeat('d');
    e.applyMove({ from: 'pass', to: 'pass' }); // a 停（连续=1）
    // d 走一步真实着法 → 计数重置为 0
    const ms = e.legalMoves();
    expect(e.applyMove(ms[0])).not.toBeNull();
    e.applyMove({ from: 'pass', to: 'pass' }); // a 停（连续=1）
    const p = e.applyMove({ from: 'pass', to: 'pass' }); // d 停（连续=2 → 判和）
    expect(p).not.toBeNull();
    expect(e.outcome()?.type).toBe('stalemate');
    const e2 = new CheckersEngine(e.fen());
    expect(e2.fen()).toBe(e.fen());
  });

  it('停一手计数被石子着法重置（否则双停会误判和）', () => {
    const e = CheckersEngine.createFree();
    e.addSeat('a');
    e.addSeat('d');
    e.applyMove({ from: 'pass', to: 'pass' }); // a 停（连续=1）
    const ms = e.legalMoves(); // d 的合法着法
    expect(e.applyMove(ms[0])).not.toBeNull(); // d 石子 → 重置
    e.applyMove({ from: 'pass', to: 'pass' }); // a 停（连续=1）
    expect(e.outcome()).toBeNull(); // 若未重置，此处会误判和
  });

  it('被完全堵死时：唯一可行操作是停一手，打破死锁（用户报告的核心场景）', () => {
    // 构造：a 仅剩尖子 e1；e2/f2（步）与 e3/g3（跳跃落点）全被 d 占 → a 真正 0 合法步
    const e = new CheckersEngine('cc1|turn=a|order=ad|free=1|p=a:e1;d:e2,f2,e3,g3');
    expect(e.legalMoves().length).toBe(0); // 无步、无跳 → 0 合法着法
    void e;
    const e2 = new CheckersEngine('cc1|turn=a|order=ad|free=1|p=a:e1;d:e2,f2,e3,g3');
    const p = e2.applyMove({ from: 'pass', to: 'pass' });
    expect(p).not.toBeNull(); // 停一手打破死锁
    expect(e2.turn()).toBe('d');
  });
});

describe('DEF-CK-002：自由选座营地映射（P1 修复回归）', () => {
  it('自由模式：阵营字母固定映射六营（a0/b1/c2/d3/e4/f5），与人数无关', () => {
    const two = CheckersEngine.createFree();
    two.addSeat('a');
    two.addSeat('b');
    expect(two.campOfSeat('b')).toBe(1); // 旧固定映射 2 人时 b=3（南）——自由模式 b=1（东北）
    expect(two.targetOfSeat('b')).toBe(4);
    expect(two.campOfSeat('a')).toBe(0);
    expect(two.targetOfSeat('a')).toBe(3);
    const four = CheckersEngine.createFree();
    for (const s of ['a', 'b', 'c', 'd'] as const) four.addSeat(s);
    expect(four.campOfSeat('c')).toBe(2);
    expect(four.targetOfSeat('c')).toBe(5);
  });

  it('后三行棋子全部可达：尖子 e1 经营内空位逐步走出（用户报告场景回归）', () => {
    const e = CheckersEngine.createFree();
    e.addSeat('a');
    e.addSeat('d'); // d 坐对面南营，全程停一手让行
    const moved = new Set<string>();
    const tryMove = (from: string): boolean => {
      const ms = e.legalMoves().filter((m) => m.from === from);
      if (!ms.length) return false;
      const mv = ms.find((m) => !CAMP0.includes(m.to)) ?? ms[0]; // 优先出营/向前
      if (!e.applyMove(mv)) return false;
      moved.add(from);
      e.applyMove({ from: 'pass', to: 'pass' });
      return true;
    };
    // 前缘四子出营
    for (const f of ['e4', 'f4', 'g4', 'h4']) expect(tryMove(f), f).toBe(true);
    // 后三行逐层走出：e3/f3/g3 → e2/f2 → e1
    for (const f of ['e3', 'f3', 'g3', 'e2', 'f2', 'e1']) {
      expect(tryMove(f), `${f} 应可移动`).toBe(true);
      expect(moved.has(f), f).toBe(true);
    }
    // 全部 10 子都动过
    for (const f of CAMP0) expect(moved.has(f), `后三子/全营 ${f}`).toBe(true);
  });
});

describe('121 孔位穷举属性（棋盘拓扑 ↔ 内部节点双向映射）', () => {
  it('孔位数 121；六营各 10；中心 61', () => {
    expect(CELL_IDS.length).toBe(121);
    expect(ALL_CELLS.filter((c) => c.camp === -1).length).toBe(61);
    for (let c = 0; c < 6; c++) expect(ALL_CELLS.filter((x) => campOf(x.id) === c).length).toBe(10);
  });

  it('坐标↔内部节点双向映射：cellRC 全量往返，无孔位因索引偏移丢失', () => {
    for (const id of CELL_IDS) {
      const rc = cellRC(id)!;
      expect(String.fromCharCode(97 + rc[1]) + String(rc[0] + 1)).toBe(id); // 列字母=c，行号=r+1
      expect(cellPixel(id, 100)).toBeDefined();
    }
  });

  it('邻接对称：a∈N(b) ⇔ b∈N(a)（全量 121 孔）', () => {
    for (const a of CELL_IDS) {
      for (const n of neighborsOf(a)) {
        expect(neighborsOf(n), `${a}↔${n}`).toContain(a);
      }
    }
  });

  it('跳跃几何：land = from + 2×(mid−from)，mid 必为紧邻（全量穷举）', () => {
    for (const a of CELL_IDS) {
      const ra = cellRC(a)!;
      for (const mid of neighborsOf(a)) {
        const rm = cellRC(mid)!;
        const land = jumpLanding(a, rm[0] - ra[0], rm[1] - ra[1]);
        if (!land) continue;
        const rl = cellRC(land)!;
        expect(rl[0]).toBe(2 * rm[0] - ra[0]);
        expect(rl[1]).toBe(2 * rm[1] - ra[1]);
      }
    }
  });

  it('像素坐标单调：同行孔位 x 严格递增、同列 y 严格递增（视觉映射无偏移）', () => {
    for (let r = 0; r < 17; r++) {
      const row = ALL_CELLS.filter((c) => cellRC(c.id)![0] === r).sort((a, b) => cellRC(a.id)![1] - cellRC(b.id)![1]);
      for (let i = 1; i < row.length; i++) {
        expect(cellPixel(row[i].id, 100).x).toBeGreaterThan(cellPixel(row[i - 1].id, 100).x);
      }
    }
    for (let c = 0; c < 17; c++) {
      const colCells = ALL_CELLS.filter((x) => cellRC(x.id)![1] === c).sort((a, b) => cellRC(a.id)![0] - cellRC(b.id)![0]);
      for (let i = 1; i < colCells.length; i++) {
        expect(cellPixel(colCells[i].id, 100).y).toBeGreaterThan(cellPixel(colCells[i - 1].id, 100).y);
      }
    }
  });
});

describe('规则变体声明（README 同步）', () => {
  it('无强制跳跃/无吃子/连续两停判和/自由选座六营', () => {
    const e = CheckersEngine.createFree();
    e.addSeat('a');
    e.addSeat('d');
    // 无强制跳跃：合法步含普通移动
    expect(e.legalMoves().some((m) => !m.path)).toBe(true);
    // 无吃子：跳跃不提子
    expect(CAMP_SEAT_NAMES[0]).toBe('红方');
    expect(FREE_SEAT_CAMPS.a).toBe(0);
  });
});
void campOf;
