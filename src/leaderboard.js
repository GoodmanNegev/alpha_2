// Optional leaderboard backed by server/ (mota-server).  Every call degrades
// gracefully: the game never depends on the API being there.

const TIMEOUT_MS = 4000;

async function call(path, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(path, { ...init, signal: controller.signal, headers: { Accept: 'application/json', ...(init?.headers ?? {}) } });
    let body;
    try { body = await res.json(); }
    catch { throw new Error(`服务器返回了无效的响应（${res.status}）`); }
    if (!res.ok || !body?.success) throw new Error(body?.error ?? `请求失败（${res.status}）`);
    return body.data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('请求超时');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** @returns {Promise<boolean>} whether the leaderboard API is reachable. */
export async function detectApi() {
  if (!/^https?:$/.test(globalThis.location?.protocol ?? '')) return false;
  try {
    const data = await call('/api/health');
    return data?.status === 'ok';
  } catch {
    return false;
  }
}

/** @param {'normal'|'true'|''} ending */
export function fetchBoard(ending = '', limit = 20) {
  const q = new URLSearchParams();
  if (ending) q.set('ending', ending);
  q.set('limit', String(limit));
  return call(`/api/leaderboard?${q}`);
}

/** Builds the payload from a finished game state. */
export function scoreFrom(state, name) {
  return {
    name,
    ending: state.ending,
    playMs: state.stats.playMs,
    steps: state.stats.steps,
    kills: state.stats.kills,
    lv: state.hero.lv,
    hp: state.hero.hp,
    atk: state.hero.atk,
    def: state.hero.def,
  };
}

export function submitScore(entry) {
  return call('/api/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
}

export function fetchProgress() { return call('/api/progress'); }

export function submitProgress(state) {
  return call('/api/progress', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: state.adventurerId, name: state.heroName, floor: state.maxFloor }),
  });
}
