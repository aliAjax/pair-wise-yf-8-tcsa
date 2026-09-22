// 接片记录的浏览器持久化：只负责读写 localStorage、默认数据和旧数据迁移。
(function () {
  const storageKey = "zfl17-film-strip-desk";

  function makeDefaultState() {
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    const thirdId = crypto.randomUUID();
    const spliceId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    return {
      reelTitle: "春日试映A卷",
      segments: [
        {
          id: firstId,
          code: "A-001",
          base: "醋酸片基",
          duration: 18,
          shift: "正常",
          damage: "完好",
          note: "开场街景，节奏平稳，适合保留原顺序。",
          thumb: ""
        },
        {
          id: secondId,
          code: "A-006",
          base: "醋酸片基",
          duration: 9,
          shift: "偏红",
          damage: "轻微划痕",
          note: "人物近景左侧有划痕，试映时留意是否明显。",
          thumb: ""
        },
        {
          id: thirdId,
          code: "A-012",
          base: "聚酯片基",
          duration: 14,
          shift: "褪色",
          damage: "接片松动",
          note: "片基材质与前一段不同，不能直接胶带接片，需另做处理。",
          thumb: ""
        }
      ],
      splices: [
        {
          id: spliceId,
          fromId: firstId,
          toId: secondId,
          method: "胶带接片",
          tester: "林小满",
          seamLength: 6,
          status: "通过",
          createdAt,
          history: [
            {
              at: createdAt,
              action: "建立接片",
              detail: "胶带接片｜接缝 6 格｜摩擦测试合格｜测试人：林小满"
            }
          ]
        }
      ]
    };
  }

  // 兼容核对台时期的数据：片段补片基材质，缺接片数组时补空数组。
  function migrate(state) {
    const next = state || {};
    if (!Array.isArray(next.segments)) next.segments = [];
    if (!Array.isArray(next.splices)) next.splices = [];
    if (typeof next.reelTitle !== "string") next.reelTitle = "";

    next.segments = next.segments.map((segment) => ({
      id: segment.id || crypto.randomUUID(),
      code: segment.code || "",
      base: segment.base || "",
      duration: Number(segment.duration) || 0,
      shift: segment.shift || "正常",
      damage: segment.damage || "完好",
      note: segment.note || "",
      thumb: segment.thumb || ""
    }));

    next.splices = next.splices
      .filter((splice) => splice && splice.id && splice.fromId && splice.toId)
      .map((splice) => ({
        id: splice.id,
        fromId: splice.fromId,
        toId: splice.toId,
        method: splice.method || "胶带接片",
        tester: splice.tester || "",
        seamLength: Number(splice.seamLength) || 0,
        status:
          splice.status === window.SpliceRules.STATUS.PENDING
            ? window.SpliceRules.STATUS.PENDING
            : window.SpliceRules.STATUS.PASSED,
        createdAt: splice.createdAt || new Date().toISOString(),
        history: Array.isArray(splice.history)
          ? splice.history
          : [
              {
                at: splice.createdAt || new Date().toISOString(),
                action: "建立接片",
                detail: "历史接片记录。"
              }
            ]
      }));

    return next;
  }

  function loadState() {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return makeDefaultState();
    try {
      return migrate(JSON.parse(saved));
    } catch {
      return makeDefaultState();
    }
  }

  function saveState(state) {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  window.FilmStore = { storageKey, makeDefaultState, migrate, loadState, saveState };
})();
