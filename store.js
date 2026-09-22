// 接片记录持久化：状态、localStorage 读写与写操作都归这里
const FilmStore = (() => {
  const storageKey = "zfl17-film-strip-desk";
  const fallbackBase = "醋酸片基";

  function buildDefaultState() {
    const first = {
      id: crypto.randomUUID(),
      code: "A-001",
      duration: 18,
      baseMaterial: "醋酸片基",
      shift: "正常",
      damage: "完好",
      note: "开场街景，节奏平稳，适合保留原顺序。",
      thumb: ""
    };
    const second = {
      id: crypto.randomUUID(),
      code: "A-006",
      duration: 9,
      baseMaterial: "醋酸片基",
      shift: "偏红",
      damage: "轻微划痕",
      note: "人物近景左侧有划痕，试映时留意是否明显；与前段为胶带接片，已转待复核。",
      thumb: ""
    };
    const third = {
      id: crypto.randomUUID(),
      code: "A-012",
      duration: 14,
      baseMaterial: "硝酸片基",
      shift: "褪色",
      damage: "接片松动",
      note: "片基材质与前段不同，按规则不得直接胶带接片。",
      thumb: ""
    };
    const splice = {
      id: crypto.randomUUID(),
      firstId: first.id,
      secondId: second.id,
      method: SpliceRules.TAPE_METHOD,
      baseMaterial: "醋酸片基",
      tester: "林素珍",
      joinLength: 6,
      status: SpliceRules.STATUS_PENDING,
      createdAt: "2026-09-10T09:30:00.000Z",
      history: [
        {
          type: "join",
          at: "2026-09-10T09:30:00.000Z",
          tester: "林素珍",
          joinLength: 6,
          note: "胶带接片登记，接缝 6 格，摩擦测试合格（测试人：林素珍）。"
        },
        {
          type: "anomaly",
          at: "2026-09-12T15:10:00.000Z",
          tester: "周启明",
          note: "摩擦测试异常，转入待复核。情况：过机时接缝处有一顿挫感，需复测。"
        }
      ]
    };
    return {
      reelTitle: "春日试映A卷",
      segments: [first, second, third],
      splices: [splice]
    };
  }

  function normalize(raw) {
    const state = {
      reelTitle: String(raw.reelTitle ?? ""),
      segments: Array.isArray(raw.segments) ? raw.segments : [],
      splices: Array.isArray(raw.splices) ? raw.splices : []
    };
    state.segments = state.segments.map((item) => ({
      id: item.id,
      code: item.code ?? "",
      duration: Number(item.duration) || 0,
      baseMaterial: item.baseMaterial || fallbackBase,
      shift: item.shift ?? "正常",
      damage: item.damage ?? "完好",
      note: item.note ?? "",
      thumb: item.thumb ?? ""
    }));
    state.splices = state.splices.map((splice) => ({
      id: splice.id || crypto.randomUUID(),
      firstId: splice.firstId,
      secondId: splice.secondId,
      method: splice.method || SpliceRules.TAPE_METHOD,
      baseMaterial: splice.baseMaterial || fallbackBase,
      tester: splice.tester || "",
      joinLength: Number(splice.joinLength) || 0,
      status: splice.status === SpliceRules.STATUS_PENDING ? SpliceRules.STATUS_PENDING : SpliceRules.STATUS_PASSED,
      createdAt: splice.createdAt || "",
      history: Array.isArray(splice.history) ? splice.history : []
    }));
    return state;
  }

  function loadState() {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return buildDefaultState();
    try {
      return normalize(JSON.parse(saved));
    } catch {
      return buildDefaultState();
    }
  }

  let state = loadState();

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  // 登记接片：规则不过则整次拒绝，顺序与既有接片原样不动
  function addSplice(input) {
    const result = SpliceRules.evaluateJoin(state.segments, input, state.splices);
    if (!result.ok) return result;
    state.splices.push(result.record);
    saveState();
    return { ok: true, record: result.record };
  }

  // 摩擦测试异常：状态转待复核，历史追加一条，其余字段与顺序原样保留
  function markAnomaly(spliceId, input = {}) {
    const splice = state.splices.find((item) => item.id === spliceId);
    const result = SpliceRules.reportAnomaly(splice, input);
    if (!result.ok) return result;
    splice.status = result.status;
    splice.history.push(result.historyEntry);
    saveState();
    return { ok: true, record: splice };
  }

  function addSegment(segment) {
    state.segments.push(segment);
    saveState();
  }

  function removeSegment(id) {
    state.segments = state.segments.filter((item) => item.id !== id);
    // 既有接片记录原样保留，仅由规则层提示其已不相邻
    saveState();
  }

  function moveSegment(id, direction) {
    const index = state.segments.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= state.segments.length) return false;
    const [item] = state.segments.splice(index, 1);
    state.segments.splice(target, 0, item);
    saveState();
    return true;
  }

  function reorderSegment(draggedId, targetId) {
    const fromIndex = state.segments.findIndex((item) => item.id === draggedId);
    const toIndex = state.segments.findIndex((item) => item.id === targetId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return false;
    const [item] = state.segments.splice(fromIndex, 1);
    state.segments.splice(toIndex, 0, item);
    saveState();
    return true;
  }

  function setReelTitle(title) {
    state.reelTitle = title;
    saveState();
  }

  function getState() {
    return state;
  }

  return {
    getState,
    saveState,
    addSplice,
    markAnomaly,
    addSegment,
    removeSegment,
    moveSegment,
    reorderSegment,
    setReelTitle
  };
})();
