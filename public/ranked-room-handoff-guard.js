(() => {
  if (window.__BRASTA_RANKED_HANDOFF_GUARD__) return;
  window.__BRASTA_RANKED_HANDOFF_GUARD__ = true;

  const nativeFetch = window.fetch.bind(window);

  function currentRoomCode() {
    try {
      return String(new URLSearchParams(location.search).get('room') || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6);
    } catch {
      return '';
    }
  }

  window.fetch = async function brastaRankedHandoffFetch(input, init) {
    const response = await nativeFetch(input, init);

    try {
      const roomCode = currentRoomCode();
      if (!roomCode) return response;

      const requestUrl = typeof input === 'string' ? input : String(input?.url || '');
      if (!requestUrl.includes('/api/competitive')) return response;

      let body = null;
      if (typeof init?.body === 'string') body = JSON.parse(init.body);
      if (body?.action !== 'status') return response;

      const data = await response.clone().json();
      const assignedRoom = String(data?.assignment?.roomCode || '').toUpperCase();
      if (data?.state !== 'matched' || assignedRoom !== roomCode) return response;

      // The browser has already accepted this assignment and is on the assigned
      // room URL. Treat the stale queue assignment as consumed locally so the
      // ranked UI cannot navigate to the same URL again on every auth/profile
      // initialization cycle.
      const guarded = {
        ...data,
        state: 'in_room',
        assignment: null,
      };

      return new Response(JSON.stringify(guarded), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch {
      return response;
    }
  };
})();
