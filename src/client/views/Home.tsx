import { useState } from 'react';
import { createRoomViaSocket, getSavedName, saveName } from '../net/roomClient';
import type { GameKind } from '../../games/types';
import { PracticeBoard } from '../components/PracticeBoard';
import { CHECKLIST, CHECKLIST_NOTE } from '../checklist';
import xqArt from '../assets/xiangqi-theme.svg';
import chessArt from '../assets/chess-theme.svg';

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
};

const CARDS: Array<{ kind: GameKind; icon: string; title: string; sub: string }> = [
  { kind: 'xiangqi', icon: '帥', title: '中国象棋', sub: '车马炮 · 九宫格 · 将帅照面' },
  { kind: 'chess', icon: '♞', title: '国际象棋', sub: '王车易位 · 吃过路兵 · 升变' },
];

export function Home({ onEnter }: HomeProps) {
  const [name, setName] = useState(getSavedName());
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState<GameKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (kind: GameKind) => {
    setError(null);
    setCreating(kind);
    saveName(name.trim());
    try {
      const ack = await createRoomViaSocket(kind, name.trim() || undefined);
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
            <h1>双人对弈</h1>
            <p className="brand-sub">中国象棋 · 国际象棋 · 打开链接即玩</p>
          </div>
        </div>
      </header>

      <main className="home-main">
        {/* —— 上半：双棋种并排展示（真实交互棋盘沙盒 + 创建房间） —— */}
        <section className="showcase-grid" aria-label="选择棋种">
          {CARDS.map(({ kind, icon, title, sub }) => {
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
                  <PracticeBoard kind={kind} />
                </div>
                <footer className="gc-foot">
                  <span className="card-desc">本地规则沙盒 · 点击棋子试走 · 创建房间后与朋友联机对弈</span>
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
          })}
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
          {(['xiangqi', 'chess'] as const).map((kind) => {
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
