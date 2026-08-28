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

type GameInvite = FriendItem & {
  inviteId: string;
  inviteType: 'private' | 'ranked_2v2';
  mode: '1v1' | '2v2' | null;
  roomCode: string | null;
  partyCode: string | null;
  expiresAt: string;
};

type Snapshot = {
  friends: FriendItem[];
  incoming: FriendItem[];
  outgoing: FriendItem[];
  blocked: FriendItem[];
  gameInvitesIncoming: GameInvite[];
  gameInvitesOutgoing: GameInvite[];
};

const EMPTY: Snapshot = {
  friends: [],
  incoming: [],
  outgoing: [],
  blocked: [],
  gameInvitesIncoming: [],
  gameInvitesOutgoing: [],
};

function avatar(item: FriendItem) {
  if (item.avatarUrl) return <img src={item.avatarUrl} alt="" referrerPolicy="no-referrer" />;
  return <span className="friends-avatar-fallback">{(item.username || 'B').slice(0,1).toUpperCase()}</span>;
}

function roomCodeFromUrl(): string {
  try {
    return String(new URLSearchParams(location.search).get('room') || '')
      .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  } catch { return ''; }
}

function currentPrivateRoomCode(): string {
  const code = roomCodeFromUrl();
  if (!code) return '';
  try {
    if (localStorage.getItem(`brasta-ranked-room:${code}`) || localStorage.getItem(`brasta-ranked-2v2-room:${code}`)) return '';
  } catch {}
  return code;
}

function anyRoomActive(): boolean {
  return Boolean(roomCodeFromUrl());
}

function inviteLabel(invite: GameInvite): string {
  if (invite.inviteType === 'ranked_2v2') return 'Ranked 2v2 Duo';
  return invite.mode ? `Private ${invite.mode}` : 'Private Room';
}

function expiryLabel(value: string): string {
  const ms = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'Expiring';
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return `Expires in ${minutes}m`;
}

export default function FriendsBridge({ accessToken }: { accessToken: string }) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [openInviteFor, setOpenInviteFor] = useState<string | null>(null);

  const applySnapshot = useCallback((data: Partial<Snapshot>) => {
    setSnapshot({
      friends: data.friends || [],
      incoming: data.incoming || [],
      outgoing: data.outgoing || [],
      blocked: data.blocked || [],
      gameInvitesIncoming: data.gameInvitesIncoming || [],
      gameInvitesOutgoing: data.gameInvitesOutgoing || [],
    });
    setLoaded(true);
  }, []);

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

  const competitiveApi = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (!accessToken) throw new Error('Sign in to use ranked play.');
    const response = await fetch('/api/competitive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action, mode: '2v2', ...extra }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || `Ranked service returned ${response.status}.`);
    return data as {
      state?: string;
      message?: string;
      party?: { code?: string; full?: boolean; members?: Array<{ username?: string; you?: boolean }> } | null;
    };
  }, [accessToken]);

  const refresh = useCallback(async (silent = true) => {
    if (!accessToken) return;
    try {
      applySnapshot(await api('status'));
    } catch (error) {
      if (!silent) setMessage(error instanceof Error ? error.message : 'Could not load friends.');
    }
  }, [accessToken, api, applySnapshot]);

  useEffect(() => {
    if (!accessToken) {
      setSnapshot(EMPTY);
      setOpen(false);
      setLoaded(false);
      return;
    }
    void refresh(true);
    const timer = window.setInterval(() => void refresh(true), 12_000);
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
      applySnapshot(await api(action, extra));
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
      applySnapshot(data);
      setUsername('');
      setMessage(data.state === 'accepted'
        ? `You and ${data.target?.username || clean} are now friends.`
        : `Friend request sent to ${data.target?.username || clean}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send friend request.');
    } finally {
      setBusy(false);
    }
  }

  function createPrivateRoom(mode: '1v1' | '2v2'): Promise<{ code: string; mode: '1v1' | '2v2' }> {
    return new Promise((resolve, reject) => {
      let finished = false;
      const cleanup = () => {
        window.removeEventListener('brasta-friend-room-created', onCreated as EventListener);
        window.removeEventListener('brasta-friend-room-create-error', onError as EventListener);
        window.clearTimeout(timer);
      };
      const onCreated = (event: Event) => {
        if (finished) return;
        const detail = (event as CustomEvent<{ code?: string; mode?: '1v1' | '2v2' }>).detail || {};
        if (!detail.code) return;
        finished = true;
        cleanup();
        resolve({ code: detail.code, mode: detail.mode === '2v2' ? '2v2' : '1v1' });
      };
      const onError = (event: Event) => {
        if (finished) return;
        finished = true;
        cleanup();
        const message = (event as CustomEvent<{ message?: string }>).detail?.message || 'Could not create private room.';
        reject(new Error(message));
      };
      const timer = window.setTimeout(() => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error('Private room creation timed out.'));
      }, 12_000);

      window.addEventListener('brasta-friend-room-created', onCreated as EventListener);
      window.addEventListener('brasta-friend-room-create-error', onError as EventListener);
      window.dispatchEvent(new CustomEvent('brasta-create-friend-room', { detail: { mode, targetScore: 110 } }));
    });
  }

  async function invitePrivate(friend: FriendItem, mode: '1v1' | '2v2') {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      let code = currentPrivateRoomCode();
      let inviteMode: '1v1' | '2v2' | null = null;
      if (!code) {
        if (anyRoomActive()) throw new Error('Finish or leave your current match before creating another private room.');
        setMessage(`Creating a Private ${mode} room for ${friend.username}…`);
        const created = await createPrivateRoom(mode);
        code = created.code;
        inviteMode = created.mode;
      }
      const data = await api('send-invite', {
        userId: friend.id,
        inviteType: 'private',
        mode: inviteMode || mode,
        roomCode: code,
      });
      applySnapshot(data);
      setMessage(`Private ${inviteMode || mode} invite sent to ${friend.username}. Room ${code} is ready.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send private room invite.');
    } finally {
      setBusy(false);
    }
  }

  async function inviteCurrentRoom(friend: FriendItem) {
    const code = currentPrivateRoomCode();
    if (!code) return;
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const data = await api('send-invite', {
        userId: friend.id,
        inviteType: 'private',
        roomCode: code,
      });
      applySnapshot(data);
      setMessage(`Room invite sent to ${friend.username}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send room invite.');
    } finally {
      setBusy(false);
    }
  }

  async function inviteRankedDuo(friend: FriendItem) {
    if (busy) return;
    if (anyRoomActive()) {
      setMessage('Finish or leave your current match before changing your ranked duo.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      let status = await competitiveApi('party-status');
      if (status.state === 'unavailable') throw new Error(status.message || 'Ranked 2v2 is unavailable.');
      if (!status.party) status = await competitiveApi('party-create');
      if (!status.party?.code) throw new Error('Could not create your ranked duo.');
      if (status.party.full) throw new Error('Your ranked duo already has two players. Leave that duo before inviting someone else.');

      const data = await api('send-invite', {
        userId: friend.id,
        inviteType: 'ranked_2v2',
        mode: '2v2',
        partyCode: status.party.code,
      });
      applySnapshot(data);
      setMessage(`Ranked 2v2 duo invite sent to ${friend.username}.`);
      setOpen(false);
      window.dispatchEvent(new CustomEvent('brasta-competitive-updated'));
      window.dispatchEvent(new CustomEvent('brasta-open-ranked-2v2-duo'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send ranked duo invite.');
    } finally {
      setBusy(false);
    }
  }

  async function acceptGameInvite(invite: GameInvite) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (invite.inviteType === 'private') {
        if (!invite.roomCode) throw new Error('That private room invite is no longer valid.');
        const current = roomCodeFromUrl();
        if (current && current !== invite.roomCode && !window.confirm(`Leave room ${current} and join ${invite.username}?`)) return;
        await api('consume-invite', { inviteId: invite.inviteId });
        location.assign(`/?room=${encodeURIComponent(invite.roomCode)}`);
        return;
      }

      if (!invite.partyCode) throw new Error('That ranked duo invite is no longer valid.');
      if (anyRoomActive()) throw new Error('Finish or leave your current match before joining a ranked duo.');
      const party = await competitiveApi('party-join', { partyCode: invite.partyCode });
      if (party.state === 'unavailable') throw new Error(party.message || 'Ranked 2v2 is unavailable.');
      applySnapshot(await api('consume-invite', { inviteId: invite.inviteId }));
      setMessage(`Ranked duo ready with ${invite.username}. Open Ranked 2v2 and choose Queue Together.`);
      window.dispatchEvent(new CustomEvent('brasta-competitive-updated'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not accept game invite.');
    } finally {
      setBusy(false);
    }
  }

  if (!accessToken) return null;

  const onlineCount = snapshot.friends.filter((friend) => friend.online).length;
  const notificationCount = snapshot.incoming.length + snapshot.gameInvitesIncoming.length;
  const currentRoom = currentPrivateRoomCode();
  const inRoom = anyRoomActive();

  return (
    <>
      <button className="friends-dock" type="button" onClick={() => { setOpen(true); void refresh(true); }} aria-label="Open friends list">
        <span className="friends-dock-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M8.25 11.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Zm7.5-1.25a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2.75 18.5c0-3.05 2.46-5.5 5.5-5.5s5.5 2.45 5.5 5.5v.75h-11v-.75Zm11.7.75v-.75c0-1.73-.6-3.33-1.6-4.58.86-.57 1.9-.92 3.02-.92 2.98 0 5.38 2.41 5.38 5.38v.87h-6.8Z" />
          </svg>
        </span>
        <span className="friends-dock-label">Friends</span>
        {notificationCount > 0 && <span className="friends-badge" aria-label={`${notificationCount} pending friend notifications`}>{notificationCount}</span>}
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
                {snapshot.gameInvitesIncoming.length > 0 && (
                  <section className="friends-section game-invites-section">
                    <div className="friends-section-title">Game invites <span>{snapshot.gameInvitesIncoming.length}</span></div>
                    <div className="friends-list">
                      {snapshot.gameInvitesIncoming.map((invite) => (
                        <div className="friend-row game-invite-row" key={invite.inviteId}>
                          <div className="friend-avatar">{avatar(invite)}</div>
                          <div className="friend-copy">
                            <b>{invite.username}</b>
                            <small>{inviteLabel(invite)} · {expiryLabel(invite.expiresAt)}</small>
                          </div>
                          <div className="friend-actions">
                            <button className="friend-accept" disabled={busy} onClick={() => void acceptGameInvite(invite)}>Join</button>
                            <button disabled={busy} onClick={() => void mutate('decline-invite', { inviteId: invite.inviteId })}>Decline</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

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
                        <div className={`friend-row friend-row-social${openInviteFor === item.id ? ' invite-expanded' : ''}`} key={item.relationshipId}>
                          <div className="friend-avatar">{avatar(item)}<i className={item.online ? 'online' : ''} aria-label={item.online ? 'Online' : 'Offline'} /></div>
                          <div className="friend-copy"><b>{item.username}</b><small>{item.online ? 'Online' : 'Offline'}{item.displayName && item.displayName !== item.username ? ` · ${item.displayName}` : ''}</small></div>
                          <div className="friend-actions friend-actions-secondary">
                            {!inRoom || currentRoom ? (
                              <button
                                className={openInviteFor === item.id ? 'friend-invite-trigger active' : 'friend-invite-trigger'}
                                disabled={busy}
                                aria-expanded={openInviteFor === item.id}
                                onClick={() => setOpenInviteFor((current) => current === item.id ? null : item.id)}
                              >
                                {openInviteFor === item.id ? 'Close' : 'Invite'}
                              </button>
                            ) : null}
                            <button disabled={busy} onClick={() => {
                              if (window.confirm(`Remove ${item.username} from your friends list?`)) void mutate('remove', { relationshipId: item.relationshipId });
                            }}>Remove</button>
                            <button className="friend-danger" disabled={busy} onClick={() => {
                              if (window.confirm(`Block ${item.username}? This also removes the friendship.`)) void mutate('block', { userId: item.id }, `${item.username} blocked.`);
                            }}>Block</button>
                          </div>
                          {openInviteFor === item.id && (
                            <div className="friend-invite-inline" aria-label={`Invite ${item.username}`}>
                              {currentRoom ? (
                                <button disabled={busy} onClick={() => { setOpenInviteFor(null); void inviteCurrentRoom(item); }}>Invite to Current Room</button>
                              ) : (
                                <>
                                  <button disabled={busy} onClick={() => { setOpenInviteFor(null); void invitePrivate(item, '1v1'); }}>Private 1v1</button>
                                  <button disabled={busy} onClick={() => { setOpenInviteFor(null); void invitePrivate(item, '2v2'); }}>Private 2v2</button>
                                  <button className="ranked-duo-invite" disabled={busy} onClick={() => { setOpenInviteFor(null); void inviteRankedDuo(item); }}>Ranked 2v2 Duo</button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : <div className="friends-empty">No friends yet. Add someone by username above.</div>}
                </section>

                {snapshot.gameInvitesOutgoing.length > 0 && (
                  <section className="friends-section">
                    <div className="friends-section-title">Sent game invites <span>{snapshot.gameInvitesOutgoing.length}</span></div>
                    <div className="friends-list">
                      {snapshot.gameInvitesOutgoing.map((invite) => (
                        <div className="friend-row" key={invite.inviteId}>
                          <div className="friend-avatar">{avatar(invite)}</div>
                          <div className="friend-copy"><b>{invite.username}</b><small>{inviteLabel(invite)} · {expiryLabel(invite.expiresAt)}</small></div>
                          <div className="friend-actions"><button disabled={busy} onClick={() => void mutate('cancel-invite', { inviteId: invite.inviteId })}>Cancel</button></div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

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
