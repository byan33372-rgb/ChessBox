import { createRoomViaSocket, getSavedName, saveName } from '../net/roomClient';
import type { GameKind } from '../../games/types';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
const PracticeBoard = lazy(() => import('../components/PracticeBoard').then((m) => ({ default: m.PracticeBoard })));
import { CHECKLIST, CHECKLIST_NOTE } from '../checklist';
import xqArt from '../assets/xiangqi-theme.svg';
import chessArt from '../assets/chess-theme.svg';
import checkersArt from '../assets/checkers-theme.svg';
import goArt from '../assets/go-theme.svg';
import gomokuArt from '../assets/gomoku-theme.svg';
import sanguoshaArt from '../assets/sanguosha-theme.svg';
import unoArt from '../assets/uno-theme.svg';

export interface HomeProps {
  onEnter(roomId: string): void;
}

/** 说明区文案（与参考图一致；界面实现以实际功能为准，见确认卡与审计文档） */
const PROMPTS: Record<
  GameKind,
  { title: string; text: string; reqs: string[]; art: string; alt: string }
> = {
  xiangqi: {
    title: '中国象棋图片提示词',
    text: '请设计一张精美的中国象棋对弈界面图，保持与截图相同的整体风格和布局。要点：使用木质棋盘和传统中国象棋棋子，棋子造型清晰、精致，带有真实的质感；界面左侧为棋盘，右侧为房间信息、棋谱记录、导出按钮和聊天区域；显示房间号、当前回合、棋谱记录、导航按钮与导出功能；底部显示玩家信息和对方状态；采用深棕、暖木与古金的主题风格，界面简洁、清晰、易读；适配桌面端，布局合理，视觉层次分明。',
    reqs: ['木质棋盘', '传统红黑棋子', '楚河汉界', '房间信息', '棋谱记录', '导航与导出', '聊天区域', '响应式设计'],
    art: xqArt,
    alt: '中国象棋主题：木质棋盘与红黑传统棋子（楚河汉界，深棕暖木古金）',
  },
  chess: {
    title: '国际象棋图片提示词',
    text: '请设计一张精美的国际象棋对弈界面图，保持与截图相同的整体风格和布局。要点：使用木质棋盘和标准国际象棋棋子，棋子造型清晰、精致，具有现代感；界面左侧为棋盘，右侧为房间信息、棋谱记录、导出按钮和聊天区域；显示房间号、当前回合、棋谱记录、导航按钮与 FEN/PGN 导出功能；底部显示玩家信息和对方状态；采用深墨绿与金色的主题风格，界面简洁、清晰、易读；适配桌面端，布局合理，视觉层次分明。',
    reqs: ['标准棋盘', '经典造型棋子', '深墨绿主题', '房间信息', '棋谱记录', '导航与导出', '聊天区域', '响应式设计'],
    art: chessArt,
    alt: '国际象棋主题：标准棋盘与经典造型棋子（深墨绿胡桃木，象牙白棋子）',
  },
  go: {
    title: '围棋图片提示词',
    text: '请设计一张精美的围棋对弈界面图，保持与整体相同的深色风格。要点：标准围棋交叉点棋盘（9/13/19 路），木质暖色棋盘、黑白棋子、星位与天元正确；界面左侧为棋盘，右侧为房间信息、提子数、棋谱记录、SGF 导出与聊天区域；显示贴目 7.5（中国规则）与停一手/数子阶段提示。',
    reqs: ['交叉点布局', '星位天元', '提子计数', '停一手', '数子与贴目 7.5', 'SGF 导出', '房间信息', '响应式设计'],
    art: goArt,
    alt: '围棋主题：木质交叉点棋盘与黑白棋子（中国规则，贴目 7.5）',
  },
  gomoku: {
    title: '五子棋图片提示词',
    text: '请设计一张精美的五子棋对弈界面图，保持与整体相同的深色风格。要点：15×15 标准棋盘、黑白棋子、上一手落点标记、五连获胜线高亮；界面左侧为棋盘，右侧为房间信息、棋谱记录、导出与聊天区域。',
    reqs: ['15×15 棋盘', '黑白棋子', '上一手标记', '五连高亮', '棋谱记录', '导出', '房间信息', '响应式设计'],
    art: gomokuArt,
    alt: '五子棋主题：15×15 棋盘与黑白棋子（自由规则，先成五连者胜）',
  },
  checkers: {
    title: '中国跳棋图片提示词',
    text: '请设计一张精美的中国跳棋对弈界面图，保持与整体相同的深色风格。要点：六角星形棋盘（六个彩色营地 + 中心六角蜂窝网格），红蓝绿黄黑紫彩色玻璃质感棋子；界面左侧为棋盘，右侧为房间信息、棋谱记录（含连跳完整路径）、导出按钮和聊天区域；显示房间号、当前回合与多人座位状态；采用深紫夜色与多彩营地的主题风格，界面简洁、清晰、易读；适配桌面端与移动端。',
    reqs: ['六角星棋盘', '六色营地', '连跳路径显示', '房间信息', '多人座位', '棋谱记录', '导航与导出', '响应式设计'],
    art: checkersArt,
    alt: '中国跳棋主题：六角星棋盘与彩色棋子（深紫夜色，连跳路径示意）',
  },
  uno: {
    title: 'UNO 图片提示词',
    text: '请设计一张精美的 UNO 对局界面图，保持与整体相同的深色风格。要点：中央弃牌堆与抽牌堆、四色数字/行动牌手牌（红黄绿蓝）、当前颜色指示、方向指示、队友传牌与 UNO 喊牌提示；界面简洁、清晰、易读；适配桌面端与移动端。',
    reqs: ['四色卡牌', '数字/行动牌', '当前颜色指示', 'UNO 喊牌', '战报', '房间信息', '响应式设计'],
    art: unoArt,
    alt: 'UNO 主题：四色卡牌欢乐牌桌（原创设计）',
  },
  sanguosha: {
    title: '三国杀·自由混战图片提示词',
    text: '请设计一张精美的三国杀自由混战对弈界面图，保持与整体相同的深色风格。要点：中央牌桌、每位玩家一张武将牌与体力值（阴阳鱼）、手牌（基本牌/锦囊牌/装备牌）扇形展开；界面显示牌堆与弃牌堆数量、当前阶段、响应窗口提示；采用暗红鎏金的水墨主题风格；界面简洁、清晰、易读；适配桌面端与移动端。',
    reqs: ['3~4 人混战', '武将技能', '隐藏手牌', '响应窗口', '濒死救援', '战报复盘', '房间信息', '响应式设计'],
    art: sanguoshaArt,
    alt: '三国杀自由混战主题：暗铜金框武将卡牌（自由混战）',
  },
};

const CARDS: Array<{ kind: GameKind; icon: string; title: string; sub: string }> = [
  { kind: 'xiangqi', icon: '帥', title: '中国象棋', sub: '车马炮 · 九宫格 · 将帅照面' },
  { kind: 'chess', icon: '♞', title: '国际象棋', sub: '王车易位 · 吃过路兵 · 升变' },
  { kind: 'checkers', icon: '⬡', title: '中国跳棋', sub: '六角星盘 · 六色营地 · 2~6 人' },
  { kind: 'go', icon: '碁', title: '围棋', sub: '交叉点博弈 · 9/13/19 路 · 贴目 7.5' },
  { kind: 'gomoku', icon: '五', title: '五子棋', sub: '15 路 · 自由规则 · 先成五连者胜' },
  { kind: 'sanguosha', icon: '杀', title: '三国杀·自由混战', sub: '3~4 人 · 无身份乱斗 · 最后存活者胜' },
  { kind: 'uno', icon: 'U', title: 'UNO', sub: '3~4 人 · 经典规则 · 先出完者胜' },
];

const CHECKER_SEAT_COUNTS = [2, 3, 4, 6] as const;
const GO_SIZES = [9, 13, 19] as const;


/** 进入视口才加载沙盒（LIGHT-004：首页不一次性加载全部引擎/棋盘） */
function LazyPractice({ kind }: { kind: GameKind }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: '120px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return (
    <div ref={ref} style={{ minHeight: 180 }}>
      {show ? (
        <Suspense fallback={<div className="practice-loading">棋盘加载中…</div>}>
          <PracticeBoard kind={kind} />
        </Suspense>
      ) : (
        <div className="practice-loading" aria-hidden="true">滚动到此处加载试玩棋盘</div>
      )}
    </div>
  );
}

export function Home({ onEnter }: HomeProps) {
  const [name, setName] = useState(getSavedName());
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState<GameKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkerSeats, setCheckerSeats] = useState<2 | 3 | 4 | 6>(2);
  const [sgSeats, setSgSeats] = useState<3 | 4>(4);
  const [goSize, setGoSize] = useState<9 | 13 | 19>(19);


  const handleCreate = async (kind: GameKind) => {
    setError(null);
    setCreating(kind);
    saveName(name.trim());
    try {
      const ack = await createRoomViaSocket(
        kind,
        name.trim() || undefined,
        kind === 'checkers' ? checkerSeats : kind === 'sanguosha' || kind === 'uno' ? sgSeats : undefined,
        kind === 'go' ? goSize : undefined,
      );
      if (ack.ok && ack.roomId) {
        onEnter(ack.roomId);
      } else {
        setError(ack.error?.message ?? '创建房间失败，请检查服务是否已启动');
      }
    } catch {
      setError('无法连接服务器，请确认后端已运行（npm run dev 或 npm start）');
    } finally {
      setCreating(null);
    }
  };

  const handleJoin = () => {
    const code = joinCode.trim().toLowerCase();
    const m = /([a-z2-9]{10})/.exec(code);
    if (m) {
      saveName(name.trim());
      onEnter(m[1]);
    } else {
      setError('房间号格式不正确：请粘贴完整邀请链接或 10 位房间号');
    }
  };

  return (
    <div className="home">
      <header className="home-header">
        <div className="brand">
          <span className="brand-mark">弈</span>
          <div>
            <h1>脆饼的棋盒</h1>
            <p className="brand-sub">中国象棋 · 国际象棋 · 中国跳棋 · 围棋 · 五子棋 · 三国杀 · UNO · 打开链接即玩</p>
          </div>
        </div>
      </header>

      <main className="home-main">
        {/* —— 上半：双棋种并排展示（真实交互棋盘沙盒 + 创建房间） —— */}
        <section className="showcase-grid" aria-label="选择棋种">
          {(() => {
            const renderCard = ({ kind, icon, title, sub }: (typeof CARDS)[number]) => {
            return (
              <article key={kind} className={`create-card theme-${kind} ${kind}`}>
                <header className="gc-head">
                  <span className="card-icon" aria-hidden="true">
                    {icon}
                  </span>
                  <span className="gc-titles">
                    <span className="card-title">{title}</span>
                    <span className="card-sub">{sub}</span>
                  </span>
                  <span className="gc-dot" aria-hidden="true" />
                </header>
                {/* 真实引擎沙盒：可交互试玩；点击棋盘不会误创建房间 */}
                <div className="gc-preview practice" onClick={(e) => e.stopPropagation()}>
                  {kind === 'sanguosha' ? (
                    <img src={sanguoshaArt} alt="三国杀自由混战封面" className="sg-cover-img" draggable={false} />
                  ) : kind === 'uno' ? (
                    <img src={unoArt} alt="UNO 封面" className="sg-cover-img" draggable={false} />
                  ) : (
                    <LazyPractice kind={kind} />
                  )}
                </div>
                <footer className="gc-foot">
                  {kind === 'checkers' && (
                    <div className="seat-count-row" role="radiogroup" aria-label="跳棋人数上限">
                      {CHECKER_SEAT_COUNTS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={checkerSeats === n}
                          className={`seat-count-btn chk-seat-btn ${checkerSeats === n ? 'on' : ''}`}
                          onClick={() => setCheckerSeats(n)}
                        >
                          {n}人
                        </button>
                      ))}
                    </div>
                  )}
                  {kind === 'uno' && (
                    <div className="seat-count-row" role="radiogroup" aria-label="UNO 人数">
                      {[3, 4].map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={sgSeats === n}
                          className={`seat-count-btn sg-seat-btn ${sgSeats === n ? 'on' : ''}`}
                          onClick={() => setSgSeats(n as 3 | 4)}
                        >
                          {n}人
                        </button>
                      ))}
                      <span className="go-komi-note">经典 108 张 · 个人混战</span>
                    </div>
                  )}
                  {kind === 'sanguosha' && (
                    <div className="seat-count-row" role="radiogroup" aria-label="三国杀人数">
                      {[3, 4].map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={sgSeats === n}
                          className={`seat-count-btn sg-seat-btn ${sgSeats === n ? 'on' : ''}`}
                          onClick={() => setSgSeats(n as 3 | 4)}
                        >
                          {n}人
                        </button>
                      ))}
                      <span className="go-komi-note">160 张牌堆（标准+军争）</span>
                    </div>
                  )}
                  {kind === 'go' && (
                    <div className="seat-count-row" role="radiogroup" aria-label="围棋棋盘路数">
                      {GO_SIZES.map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={goSize === n}
                          className={`seat-count-btn go-size-btn ${goSize === n ? 'on' : ''}`}
                          onClick={() => setGoSize(n)}
                        >
                          {n}路
                        </button>
                      ))}
                      <span className="go-komi-note">中国规则 · 贴目 7.5</span>
                    </div>
                  )}
                  <span className="card-desc">
                    {kind === 'checkers'
                    ? '六色营地沙盒（6 人演示）· 建房后在右侧面板自由选择六色阵营'
                    : kind === 'sanguosha'
                      ? '自由混战：无身份无队友，所有其他存活玩家皆为敌；濒死时任何人可用桃救援'
                      : kind === 'uno'
                        ? '经典 UNO：颜色/数字/符号匹配；万能牌变色；先出完手牌者获胜'
                        : '本地规则沙盒 · 点击棋子试走 · 建房后在右侧面板选择阵营'}
                  </span>
                  <button
                    type="button"
                    className="btn primary gc-create-btn"
                    onClick={() => void handleCreate(kind)}
                    disabled={creating !== null}
                  >
                    {creating === kind ? '创建中…' : '创建房间'}
                  </button>
                </footer>
              </article>
            );
            };
            const railCard = CARDS.find((c) => c.kind === 'checkers')!;
            return (
              <>
                <div className="showcase-main">{CARDS.filter((c) => c.kind !== 'checkers').map(renderCard)}</div>
                <div className="showcase-rail">{renderCard(railCard)}</div>
              </>
            );
          })()}
        </section>

        {error && (
          <div className="alert error" role="alert" style={{ marginTop: 16 }}>
            {error}
          </div>
        )}

        {/* —— 加入房间 —— */}
        <section className="join-card card">
          <h2>加入房间</h2>
          <div className="name-row join-name">
            <label htmlFor="nickname">昵称（可选，仅用于展示）</label>
            <input
              id="nickname"
              value={name}
              maxLength={12}
              placeholder="例如：老王"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="join-row">
            <input
              value={joinCode}
              placeholder="粘贴邀请链接或输入房间号"
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleJoin();
              }}
              aria-label="房间号或邀请链接"
            />
            <button type="button" className="btn primary" onClick={handleJoin} disabled={joinCode.trim().length === 0}>
              加入
            </button>
          </div>
          <p className="hint">第三位及以后的访客自动进入观战模式，不影响对局。</p>
        </section>

        {/* —— 下半：图片提示词 + 功能确认（人工维护的真实记录） —— */}
        <section className="prompt-docs">
          {(['xiangqi', 'chess', 'checkers', 'go', 'gomoku'] as const).map((kind) => {
            const p = PROMPTS[kind];
            const group = CHECKLIST.find((g) => g.kind === kind)!;
            return (
              <div key={kind} className="prompt-col">
                <img className="theme-art" src={p.art} alt={p.alt} loading="lazy" />
                <h3>{p.title}</h3>
                <p className="prompt-text">{p.text}</p>
                <ul className="req-list">
                  {p.reqs.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <div className="confirm-box">
                  <h4>{group.title}</h4>
                  <ul className="confirm-list">
                    {group.items.map((it) => (
                      <li key={it.label} className={it.status}>
                        <span className="status-ico" aria-hidden="true">
                          {it.status === 'pass' ? '✓' : it.status === 'fail' ? '✕' : '?'}
                        </span>
                        <span className="status-label" title={it.evidence}>
                          {it.label}
                          {it.status === 'pass' ? '（已通过）' : it.status === 'fail' ? '（未通过）' : '（未验证）'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="confirm-note">{CHECKLIST_NOTE}</p>
                </div>
              </div>
            );
          })}
        </section>

        <section className="howto">
          <h2>怎么和朋友对弈？</h2>
          <ol>
            <li>选择棋种，点击「创建房间」。</li>
            <li>点击房间页面的「复制邀请链接」，发给朋友（微信/QQ 均可）。</li>
            <li>朋友打开链接即自动入座，开始对弈；走棋由服务器校验，规则权威。</li>
            <li>断线重连、悔棋、提和、认输、重开、复盘导出全都支持。</li>
          </ol>
        </section>
      </main>

      <footer className="home-footer">
        <p>无需注册 · 数据保存在房主本机 · 公网访问需由房主启动隧道（见 README）</p>
      </footer>
    </div>
  );
}
