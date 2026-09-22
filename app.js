// 接片工艺复核台 —— 事件编排层：
// 规则判定见 rules.js，浏览器持久化见 store.js，DOM 渲染见 render.js。

let state = window.FilmStore.loadState();

// 只保存界面临时状态：新建接缝草稿、错误提示、操作反馈，不落库。
let ui = {
  createOpen: null,
  draft: null,
  formErrors: null,
  expandedSplice: null,
  notice: null
};

let draggedId = null;

const els = {
  reelTitle: document.querySelector("#reelTitle"),
  colorFilter: document.querySelector("#colorFilter"),
  searchInput: document.querySelector("#searchInput"),
  segmentForm: document.querySelector("#segmentForm"),
  baseInput: document.querySelector("#baseInput"),
  codeInput: document.querySelector("#codeInput"),
  durationInput: document.querySelector("#durationInput"),
  shiftInput: document.querySelector("#shiftInput"),
  damageInput: document.querySelector("#damageInput"),
  thumbInput: document.querySelector("#thumbInput"),
  noteInput: document.querySelector("#noteInput"),
  segmentList: document.querySelector("#segmentList"),
  reviewList: document.querySelector("#reviewList"),
  warningList: document.querySelector("#warningList"),
  notice: document.querySelector("#notice"),
  totalDuration: document.querySelector("#totalDuration"),
  damageCount: document.querySelector("#damageCount"),
  segmentCount: document.querySelector("#segmentCount"),
  spliceCount: document.querySelector("#spliceCount"),
  pendingCount: document.querySelector("#pendingCount"),
  exportBtn: document.querySelector("#exportBtn")
};

function getUiSnapshot() {
  return {
    colorFilter: els.colorFilter.value,
    searchKeyword: els.searchInput.value,
    createOpen: ui.createOpen,
    draft: ui.draft,
    formErrors: ui.formErrors,
    expandedSplice: ui.expandedSplice,
    notice: ui.notice
  };
}

function commit(message, type = "success") {
  window.FilmStore.saveState(state);
  ui.notice = { text: message, type };
  window.FilmView.renderAll(state, getUiSnapshot(), els);
}

function repaint() {
  window.FilmView.renderAll(state, getUiSnapshot(), els);
}

function setNotice(message, type = "error") {
  ui.notice = { text: message, type };
  window.FilmView.renderNotice(getUiSnapshot(), els);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function readDraft(form) {
  const fields = {};
  form.querySelectorAll("[data-field]").forEach((input) => {
    fields[input.dataset.field] = input.value;
  });
  return fields;
}

async function addSegment(event) {
  event.preventDefault();
  const thumb = await readFileAsDataUrl(els.thumbInput.files[0]);
  state.segments.push({
    id: crypto.randomUUID(),
    code: els.codeInput.value.trim(),
    base: els.baseInput.value,
    duration: Number(els.durationInput.value),
    shift: els.shiftInput.value,
    damage: els.damageInput.value,
    note: els.noteInput.value.trim(),
    thumb
  });
  els.segmentForm.reset();
  els.durationInput.value = 12;
  els.baseInput.value = "醋酸片基";
  commit(`片段已加入放映顺序，共 ${state.segments.length} 段。`);
}

function moveSegment(id, direction) {
  const index = state.segments.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.segments.length) return;
  const [item] = state.segments.splice(index, 1);
  state.segments.splice(target, 0, item);
  // 拖拽/上下移只调整片段顺序，既有接片记录原样保留，不改动接缝本身。
  ui.createOpen = null;
  ui.draft = null;
  ui.formErrors = null;
  commit("放映顺序已调整，既有接片记录原样保留。");
}

function deleteSegment(id) {
  const linked = window.SpliceRules.findSegmentSplice(state.splices, id);
  if (linked) {
    // 顺序和既有接片都须原样保留，带接片的片段不允许直接删除。
    const index = state.segments.findIndex((item) => item.id === id);
    const code = state.segments[index]?.code || "该片段";
    setNotice(`${code} 已有接片记录，接片须原样保留，不能删除；请先保留该片段。`);
    return;
  }
  state.segments = state.segments.filter((item) => item.id !== id);
  ui.createOpen = null;
  ui.draft = null;
  ui.formErrors = null;
  commit("片段已删除，其余片段顺序保持不变。");
}

function submitSplice(form, realIndex) {
  const from = state.segments[realIndex];
  const to = state.segments[realIndex + 1];
  const fields = readDraft(form);
  const key = window.FilmView.pairKey(from.id, to.id);

  const draft = {
    segments: state.segments,
    splices: state.splices,
    fromId: from.id,
    toId: to.id,
    method: fields.method,
    tester: (fields.tester || "").trim(),
    seamLength: fields.seamLength,
    testResult: fields.testResult
  };

  // 整次拒绝：任何缺项/超八格/测试不合格都不允许落库，顺序保持原样。
  const result = window.SpliceRules.validateSpliceDraft(draft);
  if (!result.ok) {
    ui.createOpen = key;
    ui.draft = fields;
    ui.formErrors = { key, messages: result.errors };
    setNotice(`接片被整次拒绝：${result.errors.join("；")}`);
    return;
  }

  state.splices.push(window.SpliceRules.buildSplice(draft));
  ui.createOpen = null;
  ui.draft = null;
  ui.formErrors = null;
  commit(`接片已建立并通过摩擦测试：${from.code} → ${to.code}。`);
}

function markAnomaly(spliceId) {
  const splice = state.splices.find((item) => item.id === spliceId);
  if (!splice || splice.status !== window.SpliceRules.STATUS.PASSED) return;
  // 通过后复测异常：转为待复核，旧状态作为历史保留。
  const index = state.splices.findIndex((item) => item.id === spliceId);
  state.splices[index] = window.SpliceRules.markFrictionAnomaly(splice);
  ui.expandedSplice = spliceId;
  commit("摩擦测试异常已登记，该接片转为待复核，历史已留存。");
}

function reviewPass(spliceId) {
  const splice = state.splices.find((item) => item.id === spliceId);
  if (!splice || splice.status !== window.SpliceRules.STATUS.PENDING) return;
  const index = state.splices.findIndex((item) => item.id === spliceId);
  state.splices[index] = window.SpliceRules.markReviewPassed(splice);
  commit("复核完成，摩擦测试恢复合格，接片状态已更新。");
}

function exportList() {
  const text = window.FilmView.buildExportText(state);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.reelTitle || "film-reel"}-splice-review.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
  setNotice("清单（含接片与复核历史）已导出。", "success");
}

els.reelTitle.addEventListener("input", () => {
  state.reelTitle = els.reelTitle.value;
  window.FilmStore.saveState(state);
});
els.colorFilter.addEventListener("change", repaint);
els.searchInput.addEventListener("input", repaint);
els.segmentForm.addEventListener("submit", addSegment);
els.exportBtn.addEventListener("click", exportList);

els.segmentList.addEventListener("click", (event) => {
  const up = event.target.closest("[data-move-up]");
  const down = event.target.closest("[data-move-down]");
  const remove = event.target.closest("[data-delete]");
  const open = event.target.closest("[data-splice-open]");
  const cancel = event.target.closest("[data-splice-cancel]");
  const toggle = event.target.closest("[data-splice-toggle]");
  const anomaly = event.target.closest("[data-anomaly]");
  const reviewPassBtn = event.target.closest("[data-review-pass]");

  if (up) return moveSegment(up.dataset.moveUp, -1);
  if (down) return moveSegment(down.dataset.moveDown, 1);
  if (remove) return deleteSegment(remove.dataset.delete);
  if (anomaly) return markAnomaly(anomaly.dataset.anomaly);
  if (reviewPassBtn) return reviewPass(reviewPassBtn.dataset.reviewPass);

  if (toggle) {
    const id = toggle.dataset.spliceToggle;
    ui.expandedSplice = ui.expandedSplice === id ? null : id;
    return repaint();
  }

  if (cancel) {
    // 取消不改动顺序，也不留下任何接缝。
    ui.createOpen = null;
    ui.draft = null;
    ui.formErrors = null;
    ui.notice = null;
    return repaint();
  }

  if (open) {
    const index = Number(open.dataset.spliceOpen);
    const from = state.segments[index];
    const to = state.segments[index + 1];
    if (!from || !to) return;
    ui.createOpen = window.FilmView.pairKey(from.id, to.id);
    ui.draft = null;
    ui.formErrors = null;
    ui.notice = null;
    return repaint();
  }
});

els.segmentList.addEventListener("submit", (event) => {
  const form = event.target.closest(".splice-form");
  if (!form) return;
  event.preventDefault();
  const submit = form.querySelector("[data-splice-submit]");
  submitSplice(form, Number(submit.dataset.spliceSubmit));
});

els.reviewList.addEventListener("click", (event) => {
  const pass = event.target.closest("[data-review-pass]");
  if (pass) reviewPass(pass.dataset.reviewPass);
});

els.segmentList.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card) return;
  draggedId = card.dataset.id;
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
});

els.segmentList.addEventListener("dragend", (event) => {
  event.target.closest("[data-id]")?.classList.remove("dragging");
  draggedId = null;
});

els.segmentList.addEventListener("dragover", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card || !draggedId || card.dataset.id === draggedId) return;
  event.preventDefault();
  const fromIndex = state.segments.findIndex((item) => item.id === draggedId);
  const toIndex = state.segments.findIndex((item) => item.id === card.dataset.id);
  if (fromIndex < 0 || toIndex < 0) return;
  const [item] = state.segments.splice(fromIndex, 1);
  state.segments.splice(toIndex, 0, item);
  draggedId = item.id;
  window.FilmStore.saveState(state);
  repaint();
});

repaint();
