/** 五子棋规则引擎测试（TEST-004 / GOMOKU-002~019） */
import { describe, expect, it } from 'vitest';
import { GomokuEngine, GOMOKU_SIZE } from '../../src/games/gomoku/engine';

const mk = () => new GomokuEngine();

/** 便捷：按序列落子（'a1','b2',...），断言每步成功 */
function play(e: GomokuEngine, pts: string[]): void {
  for (const p of pts) {
    const r = e.applyMove({ from: p });
    expect(r, p).not.toBeNull();
  }
}

describe('五子棋 · 基础（GOMOKU-002/004/005）', () => {
  it('15×15 棋盘、黑先（a=黑）', () => {
    const e = mk();
    expect(GOMOKU_SIZE).toBe(15);
    expect(e.turn()).toBe('a');
    expect(e.fen().startsWith('gmk15|turn=a|')).toBe(true);
  });

  it('黑白交替（GOMOKU-004）', () => {
    const e = mk();
    play(e, ['h8', 'i9']);
    expect(e.turn()).toBe('a');
    expect(e.pieceAt('h8')).toBe('B');
    expect(e.pieceAt('i9')).toBe('W');
  });

  it('重复落子被拒（GOMOKU-005）', () => {
    const e = mk();
    play(e, ['h8']);
    expect(e.isLegal({ from: 'h8' })).toBe(false);
    expect(e.applyMove({ from: 'h8' })).toBeNull();
  });

  it('越界/非法坐标被拒（GOMOKU-002）', () => {
    const e = mk();
    expect(e.isLegal({ from: 'p1' })).toBe(false); // 15 列 = a..o
    expect(e.isLegal({ from: 'a16' })).toBe(false);
    expect(e.isLegal({ from: 'a0' })).toBe(false);
  });
});

describe('五子棋 · 五连判定（GOMOKU-006~009）', () => {
  it('横向五连（GOMOKU-006）', () => {
    const e = mk();
    play(e, ['a1', 'a15', 'b1', 'b15', 'c1', 'c15', 'd1', 'd15', 'e1']);
    const out = e.outcome();
    expect(out?.winner).toBe('a');
    expect(out?.reason).toContain('五连');
    expect(e.winLine()).toEqual(['a1', 'b1', 'c1', 'd1', 'e1']);
  });

  it('纵向五连（GOMOKU-007）', () => {
    const e = mk();
    play(e, ['h5', 'a1', 'h6', 'a2', 'h7', 'a3', 'h8', 'a4', 'h9']);
    expect(e.outcome()?.winner).toBe('a');
    expect(e.winLine()).toEqual(['h5', 'h6', 'h7', 'h8', 'h9']);
  });

  it('主对角线（\\）五连（GOMOKU-008）', () => {
    const e = mk();
    play(e, ['c3', 'a1', 'd4', 'a2', 'e5', 'a3', 'f6', 'a4', 'g7']);
    expect(e.outcome()?.winner).toBe('a');
    expect(e.winLine()).toEqual(['c3', 'd4', 'e5', 'f6', 'g7']);
  });

  it('副对角线（/）五连（GOMOKU-008）', () => {
    const e = mk();
    play(e, ['g3', 'a15', 'f4', 'a14', 'e5', 'a13', 'd6', 'a12', 'c7']);
    expect(e.outcome()?.winner).toBe('a');
    expect(e.winLine()).toEqual(['c7', 'd6', 'e5', 'f4', 'g3']);
  });

  it('超过五连（长连）同样获胜——自由规则，六连线全部返回（GOMOKU-009）', () => {
    // 对局中第五子即终局（后续着法被拒），长连以预置局面验证：a1..f1 六连黑
    const white = ['a15', 'b15', 'c15', 'd15', 'e15'];
    const e = new GomokuEngine(`gmk15|turn=b|b=a1,b1,c1,d1,e1,f1|w=${white.join(',')}`);
    const out = e.outcome();
    expect(out?.winner).toBe('a');
    expect(e.winLine().length).toBe(6);
    expect(e.winLine()).toEqual(['a1', 'b1', 'c1', 'd1', 'e1', 'f1']);
  });

  it('四连不判胜', () => {
    const e = mk();
    play(e, ['a1', 'a15', 'b1', 'b15', 'c1', 'c15', 'd1']);
    expect(e.outcome()).toBeNull();
  });

  it('被打断的两段四子不判胜（GOMOKU-008 负例）', () => {
    const e = mk();
    play(e, ['a1', 'c1', 'b1', 'e1', 'd1', 'f1', 'g1', 'h1']);
    // a,b,d,g 黑四散不连成五
    expect(e.outcome()).toBeNull();
  });

  it('边界与角落落子获胜（GOMOKU-011）', () => {
    // 底边行 1 横向五连（黑），白子在上方
    const e = mk();
    play(e, ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2', 'e1']);
    expect(e.outcome()?.winner).toBe('a');
    // 角落 a1 起点
    expect(e.winLine()).toContain('a1');
  });

  it('对方已胜后拒绝继续落子（GOMOKU-011/012）', () => {
    const e = mk();
    play(e, ['a1', 'a15', 'b1', 'b15', 'c1', 'c15', 'd1', 'd15', 'e1']);
    expect(e.outcome()).not.toBeNull();
    expect(e.isLegal({ from: 'f1' })).toBe(false);
    expect(e.applyMove({ from: 'f1' })).toBeNull();
    expect(e.legalMoves().length).toBe(0);
  });
});

describe('五子棋 · 和棋与恢复（GOMOKU-010/013/014）', () => {
  it('满盘和棋（GOMOKU-010）：224 子无五连 + 最后一子', () => {
    // BBWW 移位模式：color(x,y) = ((x + 2y) % 4) < 2 ? 黑 : 白 —— 四方向游程 ≤2，数学上无五连
    const colorB = (x: number, y: number) => (x + 2 * y) % 4 < 2;
    const black: string[] = [];
    const white: string[] = [];
    let blackCount = 0;
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        const pt = String.fromCharCode(97 + x) + (y + 1);
        if (pt === 'o15') continue; // 留给最后一手
        if (colorB(x, y)) { black.push(pt); blackCount++; }
        else { white.push(pt); }
      }
    }
    // 轮次必须与子数匹配：黑先，224 手后轮到……由黑白数决定
    const whiteCount = 224 - blackCount;
    const turn = blackCount === whiteCount ? 'a' : blackCount > whiteCount ? 'b' : 'a';
    const e = new GomokuEngine(`gmk15|turn=${turn}|b=${black.join(',')}|w=${white.join(',')}`);
    expect(e.outcome()).toBeNull(); // 布局确无五连
    const side = turn === 'a' ? 'a' : 'b';
    void side;
    const r = e.applyMove({ from: 'o15' });
    expect(r).not.toBeNull();
    expect(r?.outcome?.type).toBe('stalemate');
    expect(r?.outcome?.winner).toBeNull();
    expect(e.outcome()?.type).toBe('stalemate');
  });

  it('fen 往返一致（GOMOKU-013/014）', () => {
    const e = mk();
    play(e, ['h8', 'i9', 'h7']);
    const e2 = new GomokuEngine(e.fen());
    expect(e2.fen()).toBe(e.fen());
    expect(e2.turn()).toBe('b');
    expect(e2.pieceAt('h8')).toBe('B');
  });

  it('加载即胜检测（断线恢复正确性，GOMOKU-014）', () => {
    const black = ['a1', 'b1', 'c1', 'd1', 'e1'];
    const white = ['a15', 'b15', 'c15', 'd15'];
    const e = new GomokuEngine(`gmk15|turn=b|b=${black.join(',')}|w=${white.join(',')}`);
    expect(e.outcome()?.winner).toBe('a');
    expect(e.winLine()).toEqual(['a1', 'b1', 'c1', 'd1', 'e1']);
  });

  it('AppliedMove.extra 携带五连方向线（EVENT-004）', () => {
    const e = mk();
    play(e, ['a1', 'a15', 'b1', 'b15', 'c1', 'c15', 'd1', 'd15']);
    const r = e.applyMove({ from: 'e1' });
    expect(r?.extra?.map((x) => x.from).sort()).toEqual(['a1', 'b1', 'c1', 'd1', 'e1']);
    expect(r?.extra?.[0].piece).toBe('B');
  });
});
