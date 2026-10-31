/**
 * 中国跳棋棋盘几何模型（Sternhalma 六角星，121 个有效棋位）。
 *
 * 采用标准 17 行表示法（CHECKERS-003/004/005）：
 *   行宽 1,2,3,4,13,12,11,10,9,10,11,12,13,4,3,2,1（合计 121）。
 * 每格坐标 (r, c)：r = 0..16（行），c = 0..16（列），各行 c 区间显式定义：
 *   r0:[0,0] r1:[0,1] r2:[0,2] r3:[0,3]
 *   r4:[0,12] r5:[1,12] r6:[2,12] r7:[3,12] r8:[4,12]
 *   r9:[4,13] r10:[4,14] r11:[4,15] r12:[4,16]
 *   r13:[9,12] r14:[10,12] r15:[11,12] r16:[12,12]
 * 邻接（六方向，标准三角格）：(r,c±1)、(r−1,c−1)、(r−1,c)、(r+1,c)、(r+1,c+1)。
 *
 * 格子 ID：`列字母 + 行号`：列 = c → 'a'..'q'；行 = r+1 → 1..17。
 * 例：北尖 (0,0) = "a1"；南尖 (16,16) = "q17"；中心 (8,8)?? 中心区含 (8,8)。
 *
 * 六个营地（编号 0..5，target(c) = (c+3)%6，全部正对，CHECKERS-017）：
 *   0 = 北（r0-3，尖 "e1"）↔ 3 = 南（r13-16，尖 "m17"）
 *   1 = 东北（r4-7 右，尖 "m5"）↔ 4 = 西南（r9-12 左，尖 "e13"）
 *   2 = 东南（r9-12 右，尖 "q13"）↔ 5 = 西北（r4-7 左，尖 "a5"）
 * 座位映射（SEAT_CAMP_MAPS）：2 人 a↔b 北/南；3 人 北/东北/东南（互为 120°）；
 *   4 人 北/东北/南/西南（两两正对）；6 人全部。
 *
 * 像素换算：px = (c − r/2) × spacing，py = r × (√3/2) × spacing。
 */

export interface CellInfo {
  id: string;
  r: number; // 行 0..16
  c: number; // 列 0..16
  /** −1 = 中心区；0..5 = 营地编号 */
  camp: number;
}

const ROW_RANGES: Array<[number, number]> = [
  [4, 4],
  [4, 5],
  [4, 6],
  [4, 7],
  [0, 12],
  [1, 12],
  [2, 12],
  [3, 12],
  [4, 12],
  [4, 13],
  [4, 14],
  [4, 15],
  [4, 16],
  [9, 12],
  [10, 12],
  [11, 12],
  [12, 12],
];

function idOf(r: number, c: number): string {
  return String.fromCharCode(97 + c) + String(r + 1);
}

/** 营地定义：每营地 4 行，行区间 [cStart, cEnd]（宽 4,3,2,1 或 1,2,3,4） */
const CAMP_DEFS: Array<Array<[number, number, number]>> = [
  // 0 = 北（底边邻接六角上边 c4-7，尖 r0 c4）：行宽 1,2,3,4
  [
    [0, 4, 4],
    [1, 4, 5],
    [2, 4, 6],
    [3, 4, 7],
  ],
  // 1 = 东北（尖 r4 c12）：行宽 4,3,2,1
  [
    [4, 9, 12],
    [5, 10, 12],
    [6, 11, 12],
    [7, 12, 12],
  ],
  // 2 = 东南（尖 r12 c16）：行宽 1,2,3,4
  [
    [9, 13, 13],
    [10, 13, 14],
    [11, 13, 15],
    [12, 13, 16],
  ],
  // 3 = 南（尖 r16 c16）：行宽 4,3,2,1
  [
    [13, 9, 12],
    [14, 10, 12],
    [15, 11, 12],
    [16, 12, 12],
  ],
  // 4 = 西南（尖 r12 c4）：行宽 1,2,3,4（1 格邻接六角）
  [
    [9, 4, 4],
    [10, 4, 5],
    [11, 4, 6],
    [12, 4, 7],
  ],
  // 5 = 西北（尖 r4 c0）：行宽 4,3,2,1
  [
    [4, 0, 3],
    [5, 1, 3],
    [6, 2, 3],
    [7, 3, 3],
  ],
];

function buildCells(): Map<string, CellInfo> {
  const map = new Map<string, CellInfo>();
  const add = (r: number, c: number, camp: number) => {
    map.set(idOf(r, c), { id: idOf(r, c), r, c, camp });
  };
  for (let r = 0; r <= 16; r++) {
    const [cs, ce] = ROW_RANGES[r];
    for (let c = cs; c <= ce; c++) add(r, c, -1);
  }
  CAMP_DEFS.forEach((rows, camp) => {
    for (const [r, cs, ce] of rows) {
      for (let c = cs; c <= ce; c++) add(r, c, camp);
    }
  });
  return map;
}

const CELLS: Map<string, CellInfo> = buildCells();

export const ALL_CELLS: CellInfo[] = [...CELLS.values()].sort((a, b) => (a.id < b.id ? -1 : 1));

export const CELL_IDS: string[] = ALL_CELLS.map((c) => c.id);

export function isValidCell(id: string): boolean {
  return CELLS.has(id);
}

export function cellInfo(id: string): CellInfo | null {
  return CELLS.get(id) ?? null;
}

export function cellRC(id: string): [number, number] | null {
  const c = CELLS.get(id);
  return c ? [c.r, c.c] : null;
}

export function campOf(id: string): number {
  return CELLS.get(id)?.camp ?? -1;
}

/** 六方向邻接（限盘内） */
export function neighborsOf(id: string): string[] {
  const cell = CELLS.get(id);
  if (!cell) return [];
  const { r, c } = cell;
  const candidates: Array<[number, number]> = [
    [r, c - 1],
    [r, c + 1],
    [r - 1, c - 1],
    [r - 1, c],
    [r + 1, c],
    [r + 1, c + 1],
  ];
  const out: string[] = [];
  for (const [nr, nc] of candidates) {
    if (nr < 0 || nr > 16) continue;
    const [cs, ce] = ROW_RANGES[nr];
    if (nc < cs || nc > ce) continue;
    out.push(idOf(nr, nc));
  }
  return out;
}

/** 沿 (dr,dc) 方向的跳跃落点：越过 (r+dr, c+dc) 的棋子落在 (r+2dr, c+2dc) */
export function jumpLanding(id: string, dr: number, dc: number): string | null {
  const cell = CELLS.get(id);
  if (!cell) return null;
  const r2 = cell.r + 2 * dr;
  const c2 = cell.c + 2 * dc;
  if (r2 < 0 || r2 > 16) return null;
  const [cs, ce] = ROW_RANGES[r2];
  if (c2 < cs || c2 > ce) return null;
  return idOf(r2, c2);
}

export function cellPixel(id: string, spacing: number): { x: number; y: number } {
  const cell = CELLS.get(id);
  if (!cell) return { x: 0, y: 0 };
  return { x: (cell.c - cell.r / 2) * spacing, y: cell.r * spacing * 0.866 };
}

export function targetCamp(camp: number): number {
  return (camp + 3) % 6;
}

export const SEAT_CAMP_MAPS: Record<number, Record<string, number>> = {
  2: { a: 0, b: 3 },
  3: { a: 0, b: 1, c: 2 },
  4: { a: 0, b: 1, c: 3, d: 4 },
  6: { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5 },
};

export const SUPPORTED_SEAT_COUNTS = [2, 3, 4, 6] as const;

export function cellsOfCamp(camp: number): string[] {
  return ALL_CELLS.filter((c) => c.camp === camp).map((c) => c.id);
}
