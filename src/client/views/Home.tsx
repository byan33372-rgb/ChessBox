import { useState } from 'react';
import { createRoomViaSocket, getSavedName, saveName } from '../net/roomClient';
import type { GameKind } from '../../games/types';

export interface HomeProps {
  onEnter(roomId: string): void;
}

export function Home({ onEnter }: HomeProps) {
  const [name, setName] = useState(getSavedName());
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState<'xiangqi' | 'chess' | null>(null);
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
        <section className="name-row">
          <label htmlFor="nickname">昵称（可选，仅用于展示）</label>
          <input
            id="nickname"
            value={name}
            maxLength={12}
            placeholder="例如：老王"
            onChange={(e) => setName(e.target.value)}
          />
        </section>

        <section className="create-cards">
          <button type="button" className="create-card xiangqi" onClick={() => handleCreate('xiangqi')} disabled={creating !== null}>
            <span className="card-icon" aria-hidden="true">帥</span>
            <span className="card-title">中国象棋</span>
            <span className="card-desc">车马炮 · 九宫格 · 将帅照面</span>
            <span className="card-cta">{creating === 'xiangqi' ? '创建中…' : '创建房间'}</span>
          </button>
          <button type="button" className="create-card chess" onClick={() => handleCreate('chess')} disabled={creating !== null}>
            <span className="card-icon" aria-hidden="true">♞</span>
            <span className="card-title">国际象棋</span>
            <span className="card-desc">王车易位 · 吃过路兵 · 升变</span>
            <span className="card-cta">{creating === 'chess' ? '创建中…' : '创建房间'}</span>
          </button>
        </section>

        <section className="join-card">
          <h2>加入房间</h2>
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

        {error && <div className="alert error" role="alert">{error}</div>}

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
