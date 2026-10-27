import { useCallback, useEffect, useState } from 'react';
import { Home } from './views/Home';
import { Room } from './views/Room';

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
    return <Room roomId={roomId} onExit={goHome} />;
  }
  return <Home onEnter={enterRoom} />;
}
