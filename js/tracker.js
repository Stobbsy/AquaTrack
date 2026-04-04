// tracker.js — Data layer for water tests, feedings, and water changes

const Tracker = (() => {
  // ── localStorage helpers ──
  function load(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch { return []; }
  }

  function save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  // ── Water Tests (API Freshwater Master Test Kit) ──
  const TESTS_KEY = 'aquatrack_tests';

  // Exact values from API kit colour cards
  const KIT_VALUES = {
    ph:       [6.0, 6.4, 6.6, 6.8, 7.0, 7.2, 7.6],
    highPh:   [7.4, 7.8, 8.0, 8.2, 8.4, 8.8],
    ammonia:  [0, 0.25, 0.50, 1.0, 2.0, 4.0, 8.0],
    nitrite:  [0, 0.25, 0.50, 1.0, 2.0, 5.0],
    nitrate:  [0, 5, 10, 20, 40, 80, 160]
  };

  // Colours matching the API Freshwater Master Test Kit card
  const KIT_COLORS = {
    ph: {
      '6.0': '#F0D020', '6.4': '#D4D048', '6.6': '#A8C040',
      '6.8': '#6C9838', '7.0': '#4A7830', '7.2': '#387058', '7.6': '#2878A8'
    },
    highPh: {
      '7.4': '#E0A030', '7.8': '#D07028', '8.0': '#C04030',
      '8.2': '#A83040', '8.4': '#783060', '8.8': '#483080'
    },
    ammonia: {
      '0': '#F0E030', '0.25': '#D0D838', '0.50': '#A8C830',
      '1.0': '#58A830', '2.0': '#389030', '4.0': '#287830', '8.0': '#186028'
    },
    nitrite: {
      '0': '#88D0E8', '0.25': '#B8A0D0', '0.50': '#A880C0',
      '1.0': '#9060A8', '2.0': '#704090', '5.0': '#582080'
    },
    nitrate: {
      '0': '#F0E030', '5': '#F0A030', '10': '#E87828',
      '20': '#E05028', '40': '#D02828', '80': '#A82020', '160': '#701818'
    }
  };

  // Safe ranges for colour coding: [greenMax, yellowMax] — above yellowMax = red
  const SAFE_RANGES = {
    ammonia: { green: 0, yellow: 0.25 },
    nitrite: { green: 0, yellow: 0.25 },
    nitrate: { green: 20, yellow: 40 },
    ph:      { greenMin: 6.5, greenMax: 7.5 }
  };

  function getTestStatus(param, value) {
    if (value === null || value === undefined || value === '') return 'unknown';
    const v = parseFloat(value);
    if (isNaN(v)) return 'unknown';

    if (param === 'ph' || param === 'highPh') {
      if (v >= SAFE_RANGES.ph.greenMin && v <= SAFE_RANGES.ph.greenMax) return 'green';
      return 'yellow';
    }
    const range = SAFE_RANGES[param];
    if (!range) return 'unknown';
    if (v <= range.green) return 'green';
    if (v <= range.yellow) return 'yellow';
    return 'red';
  }

  function saveTest(test) {
    const tests = load(TESTS_KEY);
    test.id = Date.now();
    test.date = test.date || new Date().toISOString();
    tests.unshift(test);
    save(TESTS_KEY, tests);
    return test;
  }

  function getTests() { return load(TESTS_KEY); }

  function deleteTest(id) {
    save(TESTS_KEY, load(TESTS_KEY).filter(t => t.id !== id));
  }

  // ── Feeding Log ──
  const FEED_KEY = 'aquatrack_feedings';

  function saveFeed(feed) {
    const feedings = load(FEED_KEY);
    feed.id = Date.now();
    feed.date = feed.date || new Date().toISOString();
    feedings.unshift(feed);
    save(FEED_KEY, feedings);
    return feed;
  }

  function getFeedings() { return load(FEED_KEY); }

  function deleteFeed(id) {
    save(FEED_KEY, load(FEED_KEY).filter(f => f.id !== id));
  }

  // ── Water Changes ──
  const WC_KEY = 'aquatrack_waterchanges';

  function saveWaterChange(wc) {
    const changes = load(WC_KEY);
    wc.id = Date.now();
    wc.date = wc.date || new Date().toISOString();
    changes.unshift(wc);
    save(WC_KEY, changes);
    return wc;
  }

  function getWaterChanges() { return load(WC_KEY); }

  function deleteWaterChange(id) {
    save(WC_KEY, load(WC_KEY).filter(w => w.id !== id));
  }

  // ── Tank Settings ──
  const TANK_KEY = 'aquatrack_tank';
  const DEFAULT_TANK = {
    name: 'My Aquarium',
    lengthCm: 120,
    widthCm: 44.5,
    heightCm: 50,
    fillMarginCm: 8,
    primeMlPer200L: 5
  };

  function getTank() {
    try {
      return { ...DEFAULT_TANK, ...JSON.parse(localStorage.getItem(TANK_KEY)) };
    } catch { return { ...DEFAULT_TANK }; }
  }

  function saveTank(tank) {
    localStorage.setItem(TANK_KEY, JSON.stringify(tank));
  }

  // ── Data export / clear ──
  function exportAll() {
    return JSON.stringify({
      tank: getTank(),
      tests: getTests(),
      feedings: getFeedings(),
      waterChanges: getWaterChanges(),
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  function clearAll() {
    localStorage.removeItem(TESTS_KEY);
    localStorage.removeItem(FEED_KEY);
    localStorage.removeItem(WC_KEY);
  }

  // ── Dashboard summaries ──
  function lastWaterChange() {
    const wc = getWaterChanges();
    return wc.length > 0 ? wc[0] : null;
  }

  function lastFeeding() {
    const f = getFeedings();
    return f.length > 0 ? f[0] : null;
  }

  function lastTest() {
    const t = getTests();
    return t.length > 0 ? t[0] : null;
  }

  function timeAgo(isoDate) {
    if (!isoDate) return 'Never';
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  }

  return {
    KIT_VALUES, KIT_COLORS, SAFE_RANGES, getTestStatus,
    saveTest, getTests, deleteTest,
    saveFeed, getFeedings, deleteFeed,
    saveWaterChange, getWaterChanges, deleteWaterChange,
    getTank, saveTank, DEFAULT_TANK,
    exportAll, clearAll,
    lastWaterChange, lastFeeding, lastTest, timeAgo
  };
})();
