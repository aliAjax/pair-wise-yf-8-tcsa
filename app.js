// 接片工艺复核台入口：只做事件编排，规则判定 / 持久化 / 渲染分别在三个业务文件
const store = FilmStore;
const view = FilmRender;
const { els } = view;

// 仅属于本页交互的临时状态：打开的接缝表单、异常表单、拒绝提示、表单草稿
const ui = {
  openSpliceJunction: null,
  openAnomaly: null,
  spliceFormError: "",
  spliceDrafts: {}
};

let draggedId = null;

function refresh() {
  view.renderAll(store.getState(), ui);
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

async function addSegment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const thumb = await readFileAsDataUrl(form.querySelector("#thumbInput").files[0]);
  store.addSegment({
    id: crypto.randomUUID(),
    code: form.querySelector("#codeInput").value.trim(),
    duration: Number(form.querySelector("#durationInput").value),
    baseMaterial: form.querySelector("#baseInput").value,
    shift: form.querySelector("#shiftInput").value,
    damage: form.querySelector("#damageInput").value,
    note: form.querySelector("#noteInput").value.trim(),
    thumb
  });
  form.reset();
  form.querySelector("#durationInput").value = 12;
  refresh();
}

function exportList() {
  const state = store.getState();
  const blob = new Blob([view.buildExportText(state)], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.reelTitle || "film-reel"}-splice-review.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function parseJunctionKey(key) {
  const [firstId, secondId] = key.split("|");
  return { firstId, secondId };
}

function openSpliceForm(key) {
  ui.openSpliceJunction = key;
  ui.spliceFormError = "";
  ui.openAnomaly = null;
  refresh();
}

function closeForms() {
  ui.openSpliceJunction = null;
  ui.openAnomaly = null;
  ui.spliceFormError = "";
  ui.spliceDrafts = {};
  refresh();
}

function submitSpliceForm(form) {
  const key = form.dataset.spliceForm;
  const { firstId, secondId } = parseJunctionKey(key);
  const method = form.querySelector("[data-splice-method]").value;
  const tester = form.querySelector("[data-splice-tester]").value;
  const lengthRaw = form.querySelector("[data-splice-length]").value;
  const pass = form.querySelector("[data-splice-pass]").checked;
  const result = store.addSplice({
    firstId,
    secondId,
    method,
    tester,
    joinLength: lengthRaw === "" ? "" : Number(lengthRaw),
    testPassed: pass
  });
  if (!result.ok) {
    // 整次拒绝：不写入、不改顺序，保留已填内容并显示原因
    ui.openSpliceJunction = key;
    ui.spliceFormError = result.error;
    ui.spliceDrafts[key] = { method, tester, length: lengthRaw, pass };
    refresh();
    return;
  }
  closeForms();
}

function submitAnomalyForm(form) {
  const spliceId = form.dataset.anomalyForm;
  const result = store.markAnomaly(spliceId, {
    tester: form.querySelector("[data-anomaly-tester]").value.trim(),
    note: form.querySelector("[data-anomaly-note]").value.trim()
  });
  if (!result.ok) {
    alert(result.error);
    return;
  }
  closeForms();
}

// ---- 事件绑定 ----
els.reelTitle.value = store.getState().reelTitle;

els.reelTitle.addEventListener("input", (event) => {
  store.setReelTitle(event.target.value);
});
els.colorFilter.addEventListener("change", refresh);
els.searchInput.addEventListener("input", refresh);
document.querySelector("#segmentForm").addEventListener("submit", addSegment);
document.querySelector("#exportBtn").addEventListener("click", exportList);

els.segmentList.addEventListener("click", (event) => {
  const add = event.target.closest("[data-splice-add]");
  if (add) {
    openSpliceForm(add.dataset.spliceAdd);
    return;
  }
  const cancelSplice = event.target.closest("[data-splice-cancel]");
  if (cancelSplice) {
    closeForms();
    return;
  }
  const anomalyAdd = event.target.closest("[data-anomaly-add]");
  if (anomalyAdd) {
    ui.openAnomaly = anomalyAdd.dataset.anomalyAdd;
    ui.openSpliceJunction = null;
    ui.spliceFormError = "";
    refresh();
    return;
  }
  const anomalyCancel = event.target.closest("[data-anomaly-cancel]");
  if (anomalyCancel) {
    closeForms();
    return;
  }
  const up = event.target.closest("[data-move-up]");
  const down = event.target.closest("[data-move-down]");
  const remove = event.target.closest("[data-delete]");
  if (up) {
    store.moveSegment(up.dataset.moveUp, -1);
    refresh();
  }
  if (down) {
    store.moveSegment(down.dataset.moveDown, 1);
    refresh();
  }
  if (remove) {
    store.removeSegment(remove.dataset.delete);
    refresh();
  }
});

els.segmentList.addEventListener("submit", (event) => {
  const spliceForm = event.target.closest("[data-splice-form]");
  if (spliceForm) {
    event.preventDefault();
    submitSpliceForm(spliceForm);
    return;
  }
  const anomalyForm = event.target.closest("[data-anomaly-form]");
  if (anomalyForm) {
    event.preventDefault();
    submitAnomalyForm(anomalyForm);
  }
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
  if (store.reorderSegment(draggedId, card.dataset.id)) refresh();
});

refresh();
