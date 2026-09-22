// 接片工艺规则判定：纯函数，不读写 DOM，也不碰 localStorage。
(function () {
  const FILM_BASES = ["醋酸片基", "硝酸片基", "聚酯片基"];
  const SPLICE_METHODS = ["胶带接片", "胶水接片"];
  const TEST_RESULTS = ["合格", "不合格"];
  const MAX_SEAM_FRAMES = 8;

  const STATUS = {
    PASSED: "通过",
    PENDING: "待复核"
  };

  function indexOfSegment(segments, id) {
    return segments.findIndex((segment) => segment.id === id);
  }

  // 只有放映顺序中前后紧邻的两个片段才能建立接片。
  function areAdjacent(segments, fromId, toId) {
    const fromIndex = indexOfSegment(segments, fromId);
    const toIndex = indexOfSegment(segments, toId);
    return fromIndex >= 0 && toIndex === fromIndex + 1;
  }

  function findPairSplice(splices, fromId, toId) {
    return (splices || []).find(
      (splice) => splice.fromId === fromId && splice.toId === toId
    );
  }

  function findSegmentSplice(splices, segmentId) {
    return (splices || []).find(
      (splice) => splice.fromId === segmentId || splice.toId === segmentId
    );
  }

  // 整次拒绝：任何一项不满足都返回全部原因，调用方不得落库、不得改动顺序。
  function validateSpliceDraft(draft) {
    const { segments, splices, fromId, toId, method, tester, seamLength, testResult } = draft;
    const errors = [];

    const from = segments.find((segment) => segment.id === fromId);
    const to = segments.find((segment) => segment.id === toId);

    if (!from || !to) {
      errors.push("接片两端的片段不存在，无法建立接片。");
    } else {
      if (!areAdjacent(segments, fromId, toId)) {
        errors.push("只能在放映顺序中相邻的两个片段之间建立接片。");
      }
      if (!from.base || !to.base) {
        errors.push("两端片段的片基材质未登记，属于缺项。");
      } else if (from.base !== to.base) {
        errors.push(`片基材质不同（${from.base}／${to.base}），不能建立接片。`);
      }
    }

    if (!method) {
      errors.push("接片方式为缺项。");
    } else if (method !== "胶带接片") {
      errors.push("仅允许采用胶带接片，其他接片方式整次拒绝。");
    }

    if (!tester || !String(tester).trim()) {
      errors.push("摩擦测试人为缺项，必须登记测试人。");
    }

    const length = Number(seamLength);
    if (
      seamLength === "" ||
      seamLength === null ||
      seamLength === undefined ||
      !Number.isFinite(length) ||
      !Number.isInteger(length) ||
      length <= 0
    ) {
      errors.push(`接缝长度为缺项或不是正整数，需填写 1–${MAX_SEAM_FRAMES} 格。`);
    } else if (length > MAX_SEAM_FRAMES) {
      errors.push(`接缝长度 ${length} 格，超过八格上限，整次拒绝。`);
    }

    if (!testResult) {
      errors.push("摩擦测试结果为缺项。");
    } else if (testResult !== "合格") {
      errors.push("摩擦测试不合格，整次拒绝。");
    }

    if (from && to && findPairSplice(splices, fromId, toId)) {
      errors.push("该接缝已有接片记录，既有接片须原样保留，不能重复登记。");
    }

    return { ok: errors.length === 0, errors };
  }

  function historyEntry(action, detail) {
    return { at: new Date().toISOString(), action, detail };
  }

  // 校验通过后才允许调用，直接建成“通过”状态并写下首条历史。
  function buildSplice(draft) {
    const { fromId, toId, method, tester, seamLength } = draft;
    const length = Number(seamLength);
    const testerName = String(tester).trim();
    const entry = historyEntry(
      "建立接片",
      `${method}｜接缝 ${length} 格｜摩擦测试合格｜测试人：${testerName}`
    );
    return {
      id: crypto.randomUUID(),
      fromId,
      toId,
      method,
      tester: testerName,
      seamLength: length,
      status: STATUS.PASSED,
      createdAt: entry.at,
      history: [entry]
    };
  }

  // 接片通过之后复测异常：转为待复核，历史原样追加。
  function markFrictionAnomaly(splice) {
    const next = structuredClone(splice);
    next.status = STATUS.PENDING;
    next.history.push(
      historyEntry("摩擦测试异常", "接片通过后的复测中发现摩擦测试异常，转为待复核。")
    );
    return next;
  }

  // 复核台上确认复测合格：恢复通过，同样留下历史。
  function markReviewPassed(splice) {
    const next = structuredClone(splice);
    next.status = STATUS.PASSED;
    next.history.push(
      historyEntry("复核通过", "重新复核摩擦测试合格，恢复通过状态。")
    );
    return next;
  }

  window.SpliceRules = {
    FILM_BASES,
    SPLICE_METHODS,
    TEST_RESULTS,
    MAX_SEAM_FRAMES,
    STATUS,
    areAdjacent,
    findPairSplice,
    findSegmentSplice,
    validateSpliceDraft,
    buildSplice,
    markFrictionAnomaly,
    markReviewPassed
  };
})();
