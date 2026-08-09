import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { countUnreadMessages, subscribeMessagesSeen } from '../lib/unreadMessages';

const REFRESH_MS = 30_000;

/** Compteur de messages non lus pour le badge de la tab bar. */
export function useUnreadMessages(): number {
  const { user, currentBox } = useAuth();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!user || !currentBox) { setUnread(0); return; }
    setUnread(await countUnreadMessages(user.id, currentBox.id));
  }, [user, currentBox]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    const unsubscribe = subscribeMessagesSeen(() => setUnread(0));
    return () => { clearInterval(timer); unsubscribe(); };
  }, [refresh]);

  return unread;
}
