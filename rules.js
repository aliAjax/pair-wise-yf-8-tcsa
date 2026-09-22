// 接片工艺规则判定：只负责规则，不碰存储与 DOM
const SpliceRules = (() => {
  const TAPE_METHOD = "胶带接片";
  const METHODS = ["胶带接片", "药水接片"];
  const MAX_JOIN_FRAMES = 8;
  const STATUS_PASSED = "已通过";
  const STATUS_PENDING = "待复核";

  const ERROR_MESSAGES = {
    SEGMENT_NOT_FOUND: "整次拒绝：相邻片段不存在，无法建立接片。",
    NOT_ADJACENT: "整次拒绝：两个片段在当前顺序中不相邻。",
    BASE_MISMATCH: "整次拒绝：片基材质不同，不得接片。",
    METHOD_REJECTED: "整次拒绝：仅允许采用胶带接片。",
    MISSING_TESTER: "整次拒绝：缺项——摩擦测试人未登记。",
    MISSING_LENGTH: "整次拒绝：缺项——接缝长度未登记。",
    LENGTH_EXCEEDED: `整次拒绝：接缝长度超过${MAX_JOIN_FRAMES}格。`,
    LENGTH_INVALID: "整次拒绝：接缝长度必须为 1 格以上。",
    TEST_FAILED: "整次拒绝：摩擦测试不合格。",
    ALREADY_JOINED: "整次拒绝：该相邻位置已有接片记录。"
  };

  function findSegment(segments, id) {
    return segments.find((item) => item.id === id) || null;
  }

  function areAdjacent(segments, firstId, secondId) {
    const first = segments.findIndex((item) => item.id === firstId);
    const second = segments.findIndex((item) => item.id === secondId);
    return first >= 0 && second >= 0 && second === first + 1;
  }

  // 按顺序核对一次接片登记：任何一项不过都整次拒绝
  function evaluateJoin(segments, input, existingSplices = []) {
    const first = findSegment(segments, input.firstId);
    const second = findSegment(segments, input.secondId);
    if (!first || !second) return fail("SEGMENT_NOT_FOUND");
    if (!areAdjacent(segments, input.firstId, input.secondId)) return fail("NOT_ADJACENT");
    if (first.baseMaterial !== second.baseMaterial) return fail("BASE_MISMATCH");
    if (input.method !== TAPE_METHOD) return fail("METHOD_REJECTED");

    const tester = String(input.tester || "").trim();
    if (!tester) return fail("MISSING_TESTER");

    if (input.joinLength === "" || input.joinLength === null || input.joinLength === undefined) {
      return fail("MISSING_LENGTH");
    }
    const length = Number(input.joinLength);
    if (!Number.isFinite(length) || length < 1) return fail("LENGTH_INVALID");
    if (length > MAX_JOIN_FRAMES) return fail("LENGTH_EXCEEDED");

    if (input.testPassed !== true) return fail("TEST_FAILED");

    const duplicated = existingSplices.some(
      (splice) => splice.firstId === input.firstId && splice.secondId === input.secondId
    );
    if (duplicated) return fail("ALREADY_JOINED");

    return {
      ok: true,
      record: {
        id: crypto.randomUUID(),
        firstId: input.firstId,
        secondId: input.secondId,
        method: TAPE_METHOD,
        baseMaterial: first.baseMaterial,
        tester,
        joinLength: length,
        status: STATUS_PASSED,
        createdAt: input.now || new Date().toISOString(),
        history: [
          {
            type: "join",
            at: input.now || new Date().toISOString(),
            tester,
            joinLength: length,
            note: `胶带接片登记，接缝 ${length} 格，摩擦测试合格（测试人：${tester}）。`
          }
        ]
      }
    };
  }

  // 接片通过后摩擦测试异常：转为待复核并留下历史
  function reportAnomaly(splice, input = {}) {
    if (!splice || splice.status !== STATUS_PASSED) {
      return { ok: false, error: "仅已通过的接片可以上报摩擦测试异常。" };
    }
    const at = input.now || new Date().toISOString();
    const tester = String(input.tester || "").trim() || splice.tester;
    const note = String(input.note || "").trim();
    return {
      ok: true,
      status: STATUS_PENDING,
      historyEntry: {
        type: "anomaly",
        at,
        tester,
        note: `摩擦测试异常，转入待复核。${note ? `情况：${note}` : ""}`.trim()
      }
    };
  }

  // 顺序或删除后，既有接片是否还落在相邻位置
  function junctionState(splice, segments) {
    const firstIndex = segments.findIndex((item) => item.id === splice.firstId);
    const secondIndex = segments.findIndex((item) => item.id === splice.secondId);
    if (firstIndex < 0 || secondIndex < 0) {
      return { adjacent: false, reason: "接片所连片段已缺失，记录原样保留。" };
    }
    if (secondIndex !== firstIndex + 1) {
      return { adjacent: false, reason: "接片所连片段已不相邻，记录原样保留。" };
    }
    return { adjacent: true, reason: "" };
  }

  function fail(code) {
    return { ok: false, code, error: ERROR_MESSAGES[code] };
  }

  return {
    TAPE_METHOD,
    METHODS,
    MAX_JOIN_FRAMES,
    STATUS_PASSED,
    STATUS_PENDING,
    ERROR_MESSAGES,
    evaluateJoin,
    reportAnomaly,
    junctionState
  };
})();
