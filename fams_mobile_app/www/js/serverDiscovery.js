// Scan local Wi‑Fi for a running FAMS backend (port 3007)

const DISCOVERY_PORT = 3007;
const PROBE_TIMEOUT_MS = 1200;

async function probeHealth(baseUrl) {
  const url = baseUrl.replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.status === 'ok') return url;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildCandidateUrls() {
  const seen = new Set();
  const list = [];

  function add(url) {
    const u = url.replace(/\/+$/, '');
    if (!seen.has(u)) {
      seen.add(u);
      list.push(u);
    }
  }

  const saved = localStorage.getItem('fams_server_url');
  if (saved) add(saved.startsWith('http') ? saved : `http://${saved}`);

  const lastGood = localStorage.getItem('fams_last_good_server');
  if (lastGood) add(lastGood);

  // Common home / office subnets — laptop is rarely .1 (router)
  for (const third of [0, 1, 2, 5, 10, 31, 43]) {
    for (const fourth of [2, 3, 4, 5, 8, 10, 11, 12, 15, 20, 25, 50, 100, 101, 102, 105, 110, 150, 200, 254]) {
      add(`http://192.168.${third}.${fourth}:${DISCOVERY_PORT}`);
    }
  }
  for (const fourth of [2, 5, 10, 50, 100, 150]) {
    add(`http://10.0.0.${fourth}:${DISCOVERY_PORT}`);
    add(`http://10.0.1.${fourth}:${DISCOVERY_PORT}`);
  }

  return list;
}

async function discoverServerOnLan(onProgress) {
  const candidates = buildCandidateUrls();
  const batchSize = 12;
  let checked = 0;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    onProgress?.({ checked, total: candidates.length, message: `Scanning Wi‑Fi… ${checked}/${candidates.length}` });
    const results = await Promise.all(batch.map(probeHealth));
    checked += batch.length;
    const found = results.find(Boolean);
    if (found) {
      localStorage.setItem('fams_last_good_server', found);
      onProgress?.({ checked, total: candidates.length, message: 'Server found', found });
      return found;
    }
  }

  onProgress?.({ checked, total: candidates.length, message: 'No server found on this Wi‑Fi', found: null });
  return null;
}

window.famsDiscovery = {
  probeHealth,
  discoverServerOnLan,
};
