import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Home } from './views/Home';

// 路由级代码分割（LIGHT-003）：首屏仅加载首页，进入房间才加载房间包（含各棋类引擎/棋盘）
const Room = lazy(() => import('./views/Room').then((m) => ({ default: m.Room })));

function roomIdFromPath(): string | null {
  const m = /^\/r\/([a-z2-9]{10})$/.exec(window.location.pathname);
  return m ? m[1] : null;
}

export function App() {
  const [roomId, setRoomId] = useState<string | null>(() => roomIdFromPath());

  useEffect(() => {
    const onPop = () => setRoomId(roomIdFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const enterRoom = useCallback((id: string) => {
    window.history.pushState({}, '', `/r/${id}`);
    setRoomId(id);
  }, []);

  const goHome = useCallback(() => {
    window.history.pushState({}, '', '/');
    setRoomId(null);
  }, []);

  if (roomId) {
    return (
      <Suspense
        fallback={
          <div className="room room-center">
            <div className="loading">
              <div className="spinner" aria-hidden="true" />
              <p>正在加载棋局…</p>
            </div>
          </div>
        }
      >
        <Room roomId={roomId} onExit={goHome} />
      </Suspense>
    );
  }
  return <Home onEnter={enterRoom} />;
}
