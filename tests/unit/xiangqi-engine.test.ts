import { describe, expect, it } from 'vitest';
import { XiangqiEngine, START_FEN, kingsFacing, parseFen } from '../../src/games/xiangqi/engine';
import { chineseNotation } from '../../src/games/xiangqi/notation';

/**
 * 测试用 FEN 行序约定（与引擎一致）：第 1 行 = r0 = 黑方底线（棋盘上方），
 * 第 10 行 = r9 = 红方底线（下方）。大写红、小写黑，w=红走。
 * 默认黑将 d0（c3）、红帅 e9（c4），异列避免意外照面。
 */

function movesFrom(e: XiangqiEngine, from: string): string[] {
  return e.legalMoves().filter((m) => m.from === from).map((m) => m.to).sort();
}

describe('象棋引擎 · 初始局面', () => {
  it('初始 FEN 可解析并还原，红先行', () => {
    const e = new XiangqiEngine();
    expect(e.fen()).toBe(START_FEN);
    expect(e.turn()).toBe('a');
    expect(e.inCheck()).toBe(false);
  });

  it('开局红方合法走法 = 44，各兵种数量正确', () => {
    const e = new XiangqiEngine();
    const moves = e.legalMoves();
    expect(moves.length).toBe(44);
    const count = (sq: string) => moves.filter((m) => m.from === sq).length;
    expect(count('a9')).toBe(2); // 车：被 a6 己兵挡住，仅 a8/a7
    expect(count('i9')).toBe(2);
    expect(count('b7')).toBe(12); // 炮：上 4、下 1、左 1、右 5、隔 b2 炮架吃 b0 马
    expect(count('h7')).toBe(12);
    expect(count('b9')).toBe(2); // 马：马腿限制
    expect(count('g9')).toBe(2);
    expect(count('c9')).toBe(2); // 相：象眼无阻挡
    expect(count('g9') + count('c9')).toBe(4);
    expect(count('d9')).toBe(1); // 边仕只能进中 e8
    expect(count('f9')).toBe(1);
    expect(count('e9')).toBe(1); // 帅
    expect(count('a6')).toBe(1); // 兵：未过河只能直进
  });

  it('开局炮无炮架不能隔空吃 b2，但隔 b2 炮架可吃 b0', () => {
    const e = new XiangqiEngine();
    expect(e.isLegal({ from: 'b7', to: 'b2' })).toBe(false);
    expect(e.isLegal({ from: 'b7', to: 'b0' })).toBe(true);
    expect(e.isLegal({ from: 'b7', to: 'e7' })).toBe(true);
  });
});

describe('象棋引擎 · 马腿', () => {
  it('空盘马 8 个走法', () => {
    const e = new XiangqiEngine('3k5/9/9/9/9/9/9/4N4/9/4K4 w');
    expect(movesFrom(e, 'e7').length).toBe(8);
  });

  it('e6 有子蹩马腿，向前的两格被封', () => {
    const e = new XiangqiEngine('3k5/9/9/9/9/9/4P4/4N4/9/4K4 w');
    const t = movesFrom(e, 'e7');
    expect(t).not.toContain('d5');
    expect(t).not.toContain('f5');
    expect(t).toContain('c6');
    expect(t).toContain('g6');
    expect(t).toContain('c8');
    expect(t).toContain('g8');
    expect(t).toContain('d9');
    expect(t).toContain('f9');
    expect(t.length).toBe(6);
  });
});

describe('象棋引擎 · 象眼与过河', () => {
  it('塞象眼：b8 有黑子则相不能走 a7', () => {
    const e = new XiangqiEngine('3k5/9/9/9/9/9/9/9/1p7/2B1K4 w');
    expect(movesFrom(e, 'c9')).toEqual(['e7']);
  });

  it('相不能过河', () => {
    // 加红车 i9 避免触发"无攻击子力判和"
    const e = new XiangqiEngine('3k5/9/9/9/9/2B6/9/9/9/4K3R w');
    expect(movesFrom(e, 'c5')).toEqual(['a7', 'e7']);
  });
});

describe('象棋引擎 · 炮架', () => {
  it('炮需恰好一个炮架才能吃子', () => {
    // 红炮 e7，黑卒 e4 作炮架，黑车 e2 为目标
    const e = new XiangqiEngine('3k5/9/4r4/9/4p4/9/9/4C4/9/4K4 w');
    const t = movesFrom(e, 'e7');
    expect(t).toContain('e2'); // 隔 e4 吃 e2
    expect(t).not.toContain('e4'); // 无炮架不能直接吃
    expect(t).toContain('e6');
    expect(t).toContain('e5');
    expect(t).toContain('e8');
    expect(t.filter((s) => s[0] !== 'e').length).toBe(8); // 横向 8 格
    expect(t.length).toBe(12);
  });

  it('两个炮架时不能吃最远的子（但可隔一子吃第二子）', () => {
    const e = new XiangqiEngine('3k5/9/4r4/9/4p4/4p4/9/4C4/9/4K4 w');
    const t = movesFrom(e, 'e7');
    expect(t).not.toContain('e2'); // 隔两个子不能吃
    expect(t).not.toContain('e5'); // 无炮架不能直接吃
    expect(t).toContain('e4'); // 隔 e5 一个炮架可吃 e4
    expect(t).toContain('e6');
    expect(t.length).toBe(11);
  });
});

describe('象棋引擎 · 兵卒', () => {
  it('红兵未过河只能直进', () => {
    const e = new XiangqiEngine('3k5/9/9/9/9/4P4/9/9/9/4K4 w');
    expect(movesFrom(e, 'e5')).toEqual(['e4']);
  });

  it('红兵过河后可横走、不能后退', () => {
    const e = new XiangqiEngine('3k5/9/9/9/4P4/9/9/9/9/4K4 w');
    expect(movesFrom(e, 'e4')).toEqual(['d4', 'e3', 'f4']);
  });

  it('黑卒过河后可横走', () => {
    const e = new XiangqiEngine('3k5/9/9/9/9/4p4/9/9/9/4K4 b');
    expect(movesFrom(e, 'e5')).toEqual(['d5', 'e6', 'f5']);
  });

  it('红兵到底线只能横走，且不可吃将', () => {
    // 黑将 d0 与红兵 e0 相邻：d0 是将不可吃，只可走 f0
    const e = new XiangqiEngine('3kP4/9/9/9/9/9/9/9/9/4K4 w');
    expect(movesFrom(e, 'e0')).toEqual(['f0']);
  });
});

describe('象棋引擎 · 九宫', () => {
  it('仕只能在九宫内斜走', () => {
    const e = new XiangqiEngine('3k5/9/9/9/9/9/9/9/4A4/4K3R w');
    expect(movesFrom(e, 'e8')).toEqual(['d7', 'd9', 'f7', 'f9']);
  });

  it('仕在宫边只能进中路（d8 仕唯一走法 e7）', () => {
    const e = new XiangqiEngine('3k5/9/9/9/9/9/9/9/3A5/4K3R w');
    expect(movesFrom(e, 'd8')).toEqual(['e7']);
  });

  it('帅九宫直走 + 照面约束（f9 与 f0 黑将同列，被禁止）', () => {
    const e = new XiangqiEngine('5k3/9/9/9/9/9/9/9/9/4K3R w');
    const t = movesFrom(e, 'e9');
    expect(t).toContain('d9');
    expect(t).toContain('e8');
    expect(t).not.toContain('f9'); // 与 f 列黑将照面
  });
});

describe('象棋引擎 · 将帅照面', () => {
  it('挡子沿原列移动（仍在中途）合法，离开此列即照面非法', () => {
    // 红帅 e9、黑将 e0，红车 e5 挡在中间
    const e = new XiangqiEngine('4k4/9/9/9/9/4R4/9/9/9/4K4 w');
    const t = movesFrom(e, 'e5');
    // 沿 e 列移动（e1-e8，仍挡在两将之间）全部合法
    expect(t).toEqual(['e1', 'e2', 'e3', 'e4', 'e6', 'e7', 'e8']);
    // 横向离开 e 列会导致照面 → 非法（不在列表中）
    expect(t).not.toContain('a5');
    expect(t).not.toContain('i5');
    expect(t).not.toContain('e0'); // 也不可吃将
  });

  it('kingsFacing 工具正确', () => {
    expect(kingsFacing(parseFen('4k4/9/9/9/9/9/9/9/9/4K4 w').board)).toBe(true);
    expect(kingsFacing(parseFen('4k4/9/9/9/9/4R4/9/9/9/4K4 w').board)).toBe(false);
  });
});

describe('象棋引擎 · 将军与应将', () => {
  it('被将军时必须应将：其余走法全部非法', () => {
    // 黑车 e5 将红帅 e9；红方无其他子，只能帅走 d9/f9
    // （黑将 e0 与红帅同列但被黑车挡住，不照面）
    const e = new XiangqiEngine('4k4/9/9/9/9/4r4/9/9/9/4K4 w');
    expect(e.inCheck()).toBe(true);
    expect(e.checkedKingSquare()).toBe('e9');
    const t = e.legalMoves();
    expect(t.length).toBe(2);
    expect(t.map((m) => m.from).every((f) => f === 'e9')).toBe(true);
    expect(new Set(t.map((m) => m.to))).toEqual(new Set(['d9', 'f9']));
  });

  it('其他棋子不解将时其所有走法均非法', () => {
    // 红车 a9 无法解 e 线将军 → a9 无任何合法走法
    const e = new XiangqiEngine('4k4/9/9/9/9/4r4/9/9/9/R3K4 w');
    expect(movesFrom(e, 'a9').length).toBe(0);
    expect(e.legalMoves().length).toBe(2); // 帅的 d9/f9
  });
});

describe('象棋引擎 · 将死与困毙', () => {
  it('将死：黑将 e0 被红车 a0 将军、e8 车封线', () => {
    const e = new XiangqiEngine('R3k4/9/9/9/9/9/9/9/4R4/3K5 b');
    expect(e.inCheck()).toBe(true);
    expect(e.legalMoves().length).toBe(0);
    expect(e.outcome()).toEqual({ type: 'checkmate', winner: 'a', reason: '将死' });
  });

  it('困毙：无子可动且未被将军，判负', () => {
    // 黑将 e0；黑士 d0/f0 被 a0/h0 红车钉死（士动则露将）；
    // e1 红马受 e9 红车保护，将吃马仍被将；黑将自身三面皆不可走
    const e = new XiangqiEngine('R2aka1R1/4N4/9/9/9/9/9/9/9/3KR4 b');
    expect(e.inCheck()).toBe(false);
    expect(e.legalMoves().length).toBe(0);
    expect(e.outcome()).toEqual({ type: 'stalemate', winner: 'a', reason: '困毙（无子可动判负）' });
  });

  it('将死局面不再接受走法', () => {
    const e = new XiangqiEngine('R3k4/9/9/9/9/9/9/9/4R4/3K5 b');
    expect(e.applyMove({ from: 'e0', to: 'e1' })).toBeNull(); // e1 被 e8 车控制
    expect(e.applyMove({ from: 'e0', to: 'd0' })).toBeNull(); // d0 被车控制
  });
});

describe('象棋引擎 · 重复局面与长将', () => {
  it('三次重复局面且无长将 → 判和', () => {
    // 红帅 e9、黑将 d0；红车 a5、黑车 i5 往返平移
    const e = new XiangqiEngine('3k5/9/9/9/9/R7r/9/9/9/4K4 w');
    const seq: Array<[string, string]> = [
      ['a5', 'b5'],
      ['i5', 'h5'],
      ['b5', 'a5'],
      ['h5', 'i5'], // 第 2 次出现
      ['a5', 'b5'],
      ['i5', 'h5'],
      ['b5', 'a5'],
      ['h5', 'i5'], // 第 3 次出现 → 判和
    ];
    for (const [from, to] of seq) {
      const r = e.applyMove({ from, to });
      expect(r).not.toBeNull();
    }
    expect(e.outcome()).toEqual({ type: 'repetition', winner: null, reason: '三次重复局面，判和' });
    expect(e.applyMove({ from: 'a5', to: 'b5' })).toBeNull();
  });

  it('长将方三次重复后判负', () => {
    // 黑将 e0 只能 e0/e1 挪动；红车 a0/a1 反复将军；红帅 d9
    const e = new XiangqiEngine('R3k4/9/9/9/9/9/9/9/9/3K5 b');
    const seq: Array<[string, string]> = [
      ['e0', 'e1'],
      ['a0', 'a1'], // 红将军
      ['e1', 'e0'],
      ['a1', 'a0'], // 红将军
      ['e0', 'e1'],
      ['a0', 'a1'],
      ['e1', 'e0'],
      ['a1', 'a0'], // 第 3 次重复 → 红长将判负
    ];
    let redChecks = 0;
    for (const [from, to] of seq) {
      const r = e.applyMove({ from, to });
      expect(r).not.toBeNull();
      if (r && r.gaveCheck && r.notation.includes('车')) redChecks++;
    }
    expect(redChecks).toBe(4); // 红方每步都在将军
    const oc = e.outcome();
    expect(oc?.type).toBe('repetition');
    expect(oc?.winner).toBe('b'); // 红长将判负 → 黑胜
  });
});

describe('象棋引擎 · 子力不足与限着', () => {
  it('双方仅剩将/士/象时自动判和', () => {
    const e = new XiangqiEngine('3k1b3/9/9/9/9/9/9/9/4A4/4K4 w');
    expect(e.outcome()?.type).toBe('insufficient');
    expect(e.legalMoves().length).toBe(0);
    expect(e.applyMove({ from: 'e9', to: 'd9' })).toBeNull();
  });

  it('120 步（60 回合）无吃子判和', () => {
    // 用多个固定种子尝试随机无吃子走法，直到某一局安全走满 120 步
    let hit = false;
    for (let seed = 1; seed <= 60 && !hit; seed++) {
      const e = new XiangqiEngine();
      let s = seed * 7919;
      const rand = () => {
        s = (s * 1103515245 + 12345) % 2147483648;
        return s / 2147483648;
      };
      let plies = 0;
      while (plies < 120 && !e.outcome()) {
        const nonCapture = e.legalMoves().filter((m) => !m.capture);
        if (nonCapture.length === 0) break;
        const m = nonCapture[Math.floor(rand() * nonCapture.length)];
        if (!e.applyMove(m)) break;
        plies++;
      }
      if (plies === 120 && e.outcome()?.type === 'fifty-move') {
        hit = true;
      }
    }
    expect(hit).toBe(true);
  });
});

describe('象棋引擎 · 记谱与 FEN', () => {
  it('开局常用记谱正确', () => {
    const e = new XiangqiEngine();
    const b = parseFen(e.fen()).board;
    expect(chineseNotation(b, 'h7', 'e7')).toBe('炮二平五');
    expect(chineseNotation(b, 'b9', 'c7')).toBe('马八进七');
    expect(chineseNotation(b, 'h0', 'g2')).toBe('马8进7');
    expect(chineseNotation(b, 'a9', 'a4')).toBe('车九进五');
  });

  it('applyMove 返回中文记谱与吃子信息', () => {
    const e = new XiangqiEngine();
    const r = e.applyMove({ from: 'h7', to: 'e7' });
    expect(r).not.toBeNull();
    expect(r!.notation).toBe('炮二平五');
    expect(r!.captured).toBeNull();
    expect(r!.fenAfter).not.toBe(r!.fenBefore);
    const r2 = e.applyMove({ from: 'h0', to: 'g2' });
    expect(r2!.notation).toBe('马8进7');
  });

  it('前后消歧：同线两车用前/后', () => {
    // 红车 a5 与 a9 同线
    const b = parseFen('3k5/9/9/9/9/R8/9/9/9/R3K4 w').board;
    expect(chineseNotation(b, 'a5', 'b5')).toBe('前车平八');
    expect(chineseNotation(b, 'a9', 'a4')).toBe('后车进五');
  });

  it('FEN 解析拒绝非法输入', () => {
    expect(() => new XiangqiEngine('invalid')).toThrow();
    expect(() => new XiangqiEngine('9/9/9/9/9/9/9/9/9/9 w')).toThrow(); // 缺将帅
    expect(() => new XiangqiEngine('4k4/9/9/9/9/9/9/9/9/4K4 x')).toThrow(); // 走棋方非法
  });
});

describe('象棋引擎 · 车的直线走法与阻挡（XI-004）', () => {
  it('车沿纵线滑行，遇阻挡不能越过', () => {
    // 红车 e5；黑卒 e4 挡在通向黑方一侧（可吃、不可越过）；红兵 e6 挡在己方一侧
    const e = new XiangqiEngine('3k5/9/9/9/4p4/4R4/4P4/9/9/4K4 w');
    const t = movesFrom(e, 'e5');
    expect(t).toContain('e4'); // 可吃阻挡的黑卒
    expect(t).not.toContain('e3'); // 不能越过 e4
    expect(t).not.toContain('e2'); // 不能越过 e4
    expect(t).not.toContain('e6'); // 不可吃己方红兵
    expect(t).not.toContain('e7'); // 不能越过 e6
    expect(t).toContain('a5'); // 横向空线可走
    expect(t).not.toContain('e0'); // 不可吃将
    expect(t).not.toContain('e9'); // 不可吃己帅
    expect(t.length).toBe(9); // 纵向 1 + 横向 8
  });

  it('车沿横线滑行同样受阻', () => {
    // 红车 a9；黑卒 c9 在横线上（黑卒在 r9 只攻击 b9/d9，不将军）；红帅 e9
    const e = new XiangqiEngine('3k5/9/9/9/9/9/9/9/9/R1p1K4 w');
    const t = movesFrom(e, 'a9');
    expect(t).toContain('b9'); // 空格可走
    expect(t).toContain('c9'); // 可吃黑卒
    expect(t).not.toContain('d9'); // 不能越过 c9
    expect(t).toContain('a8'); // 纵线下行
    expect(t).not.toContain('e9'); // 不可吃己帅
  });
});

describe('象棋引擎 · 吃子约束（XI-011）', () => {
  it('不可吃己方棋子', () => {
    const e = new XiangqiEngine('3k5/9/9/9/9/4R4/4P4/9/9/4K4 w');
    expect(e.isLegal({ from: 'e5', to: 'e6' })).toBe(false); // e6 为红兵
    expect(e.applyMove({ from: 'e5', to: 'e6' })).toBeNull();
  });

  it('吃子后棋子数量与棋谱一致', () => {
    const e = new XiangqiEngine('3k5/9/9/9/4p4/4R4/9/9/9/4K4 w');
    const r = e.applyMove({ from: 'e5', to: 'e4' });
    expect(r).not.toBeNull();
    expect(r!.captured).toBe('p'); // 吃黑卒
    expect(e.pieceAt('e4')).toBe('R');
    expect(e.pieceAt('e5')).toBeNull();
    expect(r!.notation).toBe('车五进一'); // e=红方第五线，进=向黑方前进 1 格
  });
});

describe('象棋引擎 · 轮次约束（XI-015）', () => {
  it('非当前走棋方的走法被拒绝且不改变状态', () => {
    const e = new XiangqiEngine(); // 红先行
    const fenBefore = e.fen();
    // 黑方（后手）在红回合试图走子 → 非法
    expect(e.isLegal({ from: 'h0', to: 'g2' })).toBe(false);
    expect(e.applyMove({ from: 'h0', to: 'g2' })).toBeNull();
    expect(e.fen()).toBe(fenBefore);
    expect(e.turn()).toBe('a');
    // 红走完后轮到黑方，红再走被拒
    e.applyMove({ from: 'h7', to: 'e7' });
    expect(e.turn()).toBe('b');
    expect(e.applyMove({ from: 'a9', to: 'a4' })).toBeNull();
    expect(e.turn()).toBe('b');
  });
});

describe('象棋引擎 · 非法坐标与越界（XI-016 引擎层）', () => {
  it('非法/越界坐标被拒绝', () => {
    const e = new XiangqiEngine();
    expect(e.applyMove({ from: 'z9', to: 'e7' })).toBeNull();
    expect(e.applyMove({ from: 'h7', to: 'e10' })).toBeNull();
    expect(e.applyMove({ from: '', to: 'e7' })).toBeNull();
    expect(e.applyMove({ from: 'h7', to: '' })).toBeNull();
    expect(e.applyMove({ from: 'e9', to: 'e9' })).toBeNull(); // 原地不走
  });
});
