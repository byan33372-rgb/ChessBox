import { useRef, useState } from 'react';
import type { ChatMessage } from '../../shared/protocol';
import type { Side } from '../../games/types';

export interface ChatPanelProps {
  chat: ChatMessage[];
  seat: Side | 'spectator' | null;
  onSend(text: string): void;
}

export function ChatPanel({ chat, seat, onSend }: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const submit = () => {
    const t = text.trim();
    if (t) {
      onSend(t);
      setText('');
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
      });
    }
  };

  return (
    <div className={`card chat-card ${open ? 'open' : ''}`}>
      <button type="button" className="chat-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <h3>聊天</h3>
        <span className="chat-count">{open ? '收起 ▾' : chat.length > 0 ? `${chat.length} 条 ▸` : '展开 ▸'}</span>
      </button>
      {open && (
        <>
          <div className="chat-list" ref={listRef}>
            {chat.length === 0 && <p className="hint">说点什么吧</p>}
            {chat.map((m, i) => (
              <div key={i} className={`chat-msg ${m.side === 'a' ? 'a' : m.side === 'b' ? 'b' : 'spec'}`}>
                <span className="chat-name">
                  {m.name}
                  {m.side !== 'spectator' && m.side === seat ? '（你）' : ''}
                </span>
                <span className="chat-text">{m.text}</span>
              </div>
            ))}
          </div>
          <div className="chat-input-row">
            <input
              value={text}
              maxLength={200}
              placeholder="发送消息…"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              aria-label="聊天消息"
            />
            <button type="button" className="btn small" onClick={submit} disabled={text.trim().length === 0}>
              发送
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export type { Side };
