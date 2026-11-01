/** 跳棋 UI 纯函数直测（MOVE-017/HISTORY-003 前端同源规则）：FEN 解析、连跳防循环、逐段交互 */
import { describe, expect, it } from 'vitest';
import { CheckersEngine } from '../../src/games/checkers/engine';
import {
  checkersClick,
  nextChainTargets,
  parseCheckersFenPieces,
  stepTargetsFrom,
  type CheckersSim,
} from '../../src/client/components/checkersUi';

const TARGET_2P_A = 3; // 2 人局 a 的目标营地 = 南
const OWN_2P_A = 0; // 2 人局 a 的起始营地 = 北

describe('parseCheckersFenPieces（DATA-004 前端解析）', () => {
  it('解析 cc1 FEN 为座位→格子映射；兼容 ; 与 , 分隔', () => {
    const sim = parseCheckersFenPieces('cc1|turn=a|order=ab|p=a:i10,b:j10;j11');
    expect(sim).not.toBeNull();
    expect(sim!.get('i10')).toBe('a');
    expect(sim!.get('j10')).toBe('b');
    expect(sim!.get('j11')).toBe('b');
    expect(sim!.size).toBe(3);
  });

  it('非 cc1 前缀返回 null；空 p 段返回空表', () => {
    expect(parseCheckersFenPieces('rnbqkbnr/... w KQkq - 0 1')).toBeNull();
    const empty = parseCheckersFenPieces('cc1|turn=a|order=ab|p=');
    expect(empty).not.toBeNull();
    expect(empty!.size).toBe(0);
  });

  it('非法格子被忽略（不进入映射）', () => {
    const sim = parseCheckersFenPieces('cc1|turn=a|order=ab|p=a:i10,zz99,b:j10');
    expect(sim!.size).toBe(2);
    expect(sim!.has('zz99')).toBe(false);
  });
});

describe('nextChainTargets（SEC-006 前端同源防循环）', () => {
  it('排除链内已用格：e3→e5 后不提供跳回 e3/e5 的延伸', () => {
    // 局面：a 在 e3/e4/f5 附近构造跳板
    const e = new CheckersEngine('cc1|turn=a|order=ab|p=a:e3,a:e4,a:f5,b:m14');
    const sim = parseCheckersFenPieces(e.fen())!;
    // 链 [e3, e5]：从 e5 的后续跳跃中，e3（链内起点）不得出现
    const next = nextChainTargets(sim, ['e3', 'e5'], TARGET_2P_A, OWN_2P_A);
    expect(next).not.toContain('e3');
    expect(next).not.toContain('e5');
  });

  it('合法延伸仍可用：f5 跳板让 e5→g5 成立', () => {
    const e = new CheckersEngine('cc1|turn=a|order=ab|p=a:e3,a:e4,a:f5,b:m14');
    const sim = parseCheckersFenPieces(e.fen())!;
    const next = nextChainTargets(sim, ['e3', 'e5'], TARGET_2P_A, OWN_2P_A);
    expect(next).toContain('g5');
  });
});

describe('checkersClick 逐段交互（CHECKERS-010/011 UI 层）', () => {
  const mkSim = (fen: string): CheckersSim => parseCheckersFenPieces(fen)!;

  it('选己方棋子 → select；点非法格 → none', () => {
    const sim = mkSim('cc1|turn=a|order=ab|p=a:i10,b:j11');
    expect(checkersClick(sim, 'a', TARGET_2P_A, OWN_2P_A, null, null, 'i10')).toEqual({ type: 'select', cell: 'i10' });
    expect(checkersClick(sim, 'a', TARGET_2P_A, OWN_2P_A, 'i10', null, 'j11')).toEqual({ type: 'none' });
  });

  it('普通移动直接 commit；跳跃有延伸时 extend、无延伸时自动 commit 完整路径', () => {
    // f4→f5 普通单步
    const e1 = new CheckersEngine();
    const s1 = mkSim(e1.fen());
    expect(checkersClick(s1, 'a', TARGET_2P_A, OWN_2P_A, 'f4', null, 'f5')).toEqual({ type: 'commit', from: 'f4', to: 'f5' });
    // e3→e5 单跳（e4 为跳板）：e5 之后 f5 侧有己方延伸 → extend
    const e2 = new CheckersEngine('cc1|turn=a|order=ab|p=a:e3,a:e4,a:f5,b:m14');
    const s2 = mkSim(e2.fen());
    const ext = checkersClick(s2, 'a', TARGET_2P_A, OWN_2P_A, 'e3', null, 'e5');
    expect(ext).toEqual({ type: 'extend', chain: ['e3', 'e5'], canContinue: true });
    // 续点 g5（越过 f5）：g5 之后仅剩跳回链内格（被过滤）→ 自动 commit 三段路径
    const commit = checkersClick(s2, 'a', TARGET_2P_A, OWN_2P_A, 'e3', ['e3', 'e5'], 'g5');
    expect(commit).toEqual({ type: 'commit', from: 'e3', to: 'g5', path: ['e3', 'e5', 'g5'] });
  });

  it('普通移动不可作为连跳第二段（n>2 每段必须跳跃）', () => {
    const sim = mkSim('cc1|turn=a|order=ab|p=a:e3,a:e4,b:m14');
    // 链 [e3,e5] 后，e5 的相邻普通空位不允许直接点走（仅跳跃目标有效）
    const r = checkersClick(sim, 'a', TARGET_2P_A, OWN_2P_A, 'e3', ['e3', 'e5'], 'f5');
    // f5 非空（无该子）→ none 或 extend；此处 f5 为空，但普通移动在链内非法 → 不 commit 单步
    expect(r.type).not.toBe('commit');
  });
});

describe('stepTargetsFrom（CHECKERS-006 UI 层）', () => {
  it('只列相邻空位且不进他人营地', () => {
    const sim = parseCheckersFenPieces('cc1|turn=a|order=ab|p=a:i10')!;
    const ts = stepTargetsFrom(sim, 'i10', TARGET_2P_A, OWN_2P_A);
    for (const t of ts) {
      expect(t).not.toBe('j14'); // 南营格
    }
    expect(ts.length).toBeGreaterThan(0);
  });
});
