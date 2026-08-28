'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type FriendItem = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  online?: boolean;
  relationshipId?: string;
  createdAt?: string;
};

type Snapshot = {
  friends: FriendItem[];
  incoming: FriendItem[];
  outgoing: FriendItem[];
  blocked: FriendItem[];
};

const EMPTY: Snapshot = { friends: [], incoming: [], outgoing: [], blocked: [] };

function avatar(item: FriendItem) {
  if (item.avatarUrl) return <img src={item.avatarUrl} alt="" referrerPolicy="no-referrer" />;
  return <span className="friends-avatar-fallback">{(item.username || 'B').slice(0,1).toUpperCase()}</span>;
}

export default function FriendsBridge({ accessToken }: { accessToken: string }) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const api = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (!accessToken) throw new Error('Sign in to use friends.');
    const response = await fetch('/api/friends', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action, ...extra }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || `Friends service returned ${response.status}.`);
    return data as Snapshot & { state?: string; target?: FriendItem };
  }, [accessToken]);

  const refresh = useCallback(async (silent = true) => {
    if (!accessToken) return;
    try {
      const data = await api('status');
      setSnapshot({
        friends: data.friends || [],
        incoming: data.incoming || [],
        outgoing: data.outgoing || [],
        blocked: data.blocked || [],
      });
      setLoaded(true);
    } catch (error) {
      if (!silent) setMessage(error instanceof Error ? error.message : 'Could not load friends.');
    }
  }, [accessToken, api]);

  useEffect(() => {
    if (!accessToken) {
      setSnapshot(EMPTY);
      setOpen(false);
      setLoaded(false);
      return;
    }
    void refresh(true);
    const timer = window.setInterval(() => void refresh(true), 30_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [accessToken, refresh]);

  async function mutate(action: string, extra: Record<string, unknown>, success?: string) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const data = await api(action, extra);
      setSnapshot({
        friends: data.friends || [],
        incoming: data.incoming || [],
        outgoing: data.outgoing || [],
        blocked: data.blocked || [],
      });
      setLoaded(true);
      if (success) setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Friend action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function addFriend(event: FormEvent) {
    event.preventDefault();
    const clean = username.trim().replace(/^@/, '');
    if (!clean || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const data = await api('send', { username: clean });
      setSnapshot({
        friends: data.friends || [],
        incoming: data.incoming || [],
        outgoing: data.outgoing || [],
        blocked: data.blocked || [],
      });
      setUsername('');
      setLoaded(true);
      setMessage(data.state === 'accepted'
        ? `You and ${data.target?.username || clean} are now friends.`
        : `Friend request sent to ${data.target?.username || clean}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send friend request.');
    } finally {
      setBusy(false);
    }
  }

  if (!accessToken) return null;

  const onlineCount = snapshot.friends.filter((friend) => friend.online).length;

  return (
    <>
      <button className="friends-dock" type="button" onClick={() => { setOpen(true); void refresh(true); }} aria-label="Open friends list">
        <span className="friends-dock-icon" aria-hidden="true">♣</span>
        <span className="friends-dock-label">Friends</span>
        {snapshot.incoming.length > 0 && <span className="friends-badge" aria-label={`${snapshot.incoming.length} pending friend requests`}>{snapshot.incoming.length}</span>}
      </button>

      {open && (
        <div className="friends-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setOpen(false);
        }}>
          <section className="friends-modal" role="dialog" aria-modal="true" aria-label="Brasta friends">
            <button className="friends-close" type="button" onClick={() => setOpen(false)} aria-label="Close">×</button>
            <div className="friends-modal-head">
              <div className="friends-brand-mark">B</div>
              <div>
                <div className="friends-eyebrow">BRASTA SOCIAL</div>
                <h2>Friends</h2>
                <p>{snapshot.friends.length ? `${onlineCount} online · ${snapshot.friends.length} friend${snapshot.friends.length === 1 ? '' : 's'}` : 'Add players by their Brasta username.'}</p>
              </div>
            </div>

            <form className="friends-add-form" onSubmit={addFriend}>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value.replace(/\s+/g, ''))}
                maxLength={20}
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="Brasta username"
                aria-label="Brasta username"
              />
              <button className="primary" type="submit" disabled={busy || username.trim().length < 3}>Add Friend</button>
            </form>

            {!loaded ? <div className="friends-empty">Loading friends…</div> : (
              <div className="friends-sections">
                {snapshot.incoming.length > 0 && (
                  <section className="friends-section">
                    <div className="friends-section-title">Friend requests <span>{snapshot.incoming.length}</span></div>
                    <div className="friends-list">
                      {snapshot.incoming.map((item) => (
                        <div className="friend-row" key={item.relationshipId}>
                          <div className="friend-avatar">{avatar(item)}</div>
                          <div className="friend-copy"><b>{item.username}</b><small>{item.displayName || 'Wants to be friends'}</small></div>
                          <div className="friend-actions">
                            <button className="friend-accept" disabled={busy} onClick={() => void mutate('accept', { relationshipId: item.relationshipId }, `You and ${item.username} are now friends.`)}>Accept</button>
                            <button disabled={busy} onClick={() => void mutate('decline', { relationshipId: item.relationshipId })}>Decline</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="friends-section">
                  <div className="friends-section-title">Friends <span>{snapshot.friends.length}</span></div>
                  {snapshot.friends.length ? (
                    <div className="friends-list">
                      {snapshot.friends.map((item) => (
                        <div className="friend-row" key={item.relationshipId}>
                          <div className="friend-avatar">{avatar(item)}<i className={item.online ? 'online' : ''} aria-label={item.online ? 'Online' : 'Offline'} /></div>
                          <div className="friend-copy"><b>{item.username}</b><small>{item.online ? 'Online' : 'Offline'}{item.displayName && item.displayName !== item.username ? ` · ${item.displayName}` : ''}</small></div>
                          <div className="friend-actions friend-actions-secondary">
                            <button disabled={busy} onClick={() => {
                              if (window.confirm(`Remove ${item.username} from your friends list?`)) void mutate('remove', { relationshipId: item.relationshipId });
                            }}>Remove</button>
                            <button className="friend-danger" disabled={busy} onClick={() => {
                              if (window.confirm(`Block ${item.username}? This also removes the friendship.`)) void mutate('block', { userId: item.id }, `${item.username} blocked.`);
                            }}>Block</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <div className="friends-empty">No friends yet. Add someone by username above.</div>}
                </section>

                {snapshot.outgoing.length > 0 && (
                  <section className="friends-section">
                    <div className="friends-section-title">Sent requests <span>{snapshot.outgoing.length}</span></div>
                    <div className="friends-list">
                      {snapshot.outgoing.map((item) => (
                        <div className="friend-row" key={item.relationshipId}>
                          <div className="friend-avatar">{avatar(item)}</div>
                          <div className="friend-copy"><b>{item.username}</b><small>Request pending</small></div>
                          <div className="friend-actions"><button disabled={busy} onClick={() => void mutate('cancel', { relationshipId: item.relationshipId })}>Cancel</button></div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {snapshot.blocked.length > 0 && (
                  <details className="friends-blocked">
                    <summary>Blocked players ({snapshot.blocked.length})</summary>
                    <div className="friends-list">
                      {snapshot.blocked.map((item) => (
                        <div className="friend-row" key={item.id}>
                          <div className="friend-avatar">{avatar(item)}</div>
                          <div className="friend-copy"><b>{item.username}</b><small>Blocked</small></div>
                          <div className="friend-actions"><button disabled={busy} onClick={() => void mutate('unblock', { userId: item.id }, `${item.username} unblocked.`)}>Unblock</button></div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {message && <div className="friends-message" aria-live="polite">{message}</div>}
          </section>
        </div>
      )}
    </>
  );
}
