// 接片工艺渲染：统计、片段与接缝列表、复核提示、导出文本都归这里
const FilmRender = (() => {
  const fallbackThumbs = ["#d49b35", "#347d89", "#b54d48", "#4d7656", "#6d6378"];

  const els = {
    reelTitle: document.querySelector("#reelTitle"),
    colorFilter: document.querySelector("#colorFilter"),
    searchInput: document.querySelector("#searchInput"),
    segmentList: document.querySelector("#segmentList"),
    warningList: document.querySelector("#warningList"),
    totalDuration: document.querySelector("#totalDuration"),
    damageCount: document.querySelector("#damageCount"),
    segmentCount: document.querySelector("#segmentCount"),
    spliceCount: document.querySelector("#spliceCount"),
    pendingCount: document.querySelector("#pendingCount")
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDuration(seconds) {
    const value = Number(seconds) || 0;
    const minutes = Math.floor(value / 60);
    const rest = String(value % 60).padStart(2, "0");
    return `${minutes}:${rest}`;
  }

  function formatDateTime(iso) {
    if (!iso) return "时间未登记";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`;
  }

  function getVisibleSegments(state) {
    const color = els.colorFilter.value;
    const keyword = els.searchInput.value.trim();
    return state.segments.filter((item) => {
      const matchesColor = color === "all" || item.shift === color;
      const matchesKeyword =
        !keyword || `${item.code}${item.note}${item.damage}${item.baseMaterial}`.includes(keyword);
      return matchesColor && matchesKeyword;
    });
  }

  function findSpliceBetween(state, firstId, secondId) {
    return (
      state.splices.find(
        (splice) => splice.firstId === firstId && splice.secondId === secondId
      ) || null
    );
  }

  function renderStats(state) {
    const total = state.segments.reduce((sum, item) => sum + Number(item.duration), 0);
    const damaged = state.segments.filter((item) => item.damage !== "完好").length;
    const pending = state.splices.filter(
      (splice) => splice.status === SpliceRules.STATUS_PENDING
    ).length;
    els.totalDuration.textContent = formatDuration(total);
    els.damageCount.textContent = damaged;
    els.segmentCount.textContent = state.segments.length;
    els.spliceCount.textContent = state.splices.length;
    els.pendingCount.textContent = pending;
  }

  function renderCard(state, item) {
    const realIndex = state.segments.findIndex((segment) => segment.id === item.id);
    const hasDamage = item.damage !== "完好";
    return `
      <article class="segment-card" draggable="true" data-id="${escapeHtml(item.id)}">
        <div class="thumb">
          ${
            item.thumb
              ? `<img src="${item.thumb}" alt="${escapeHtml(item.code)}缩略图" />`
              : `<div class="film-placeholder" style="background:${
                  fallbackThumbs[realIndex % fallbackThumbs.length]
                }">${escapeHtml(item.code)}</div>`
          }
        </div>
        <div class="segment-main">
          <div class="segment-title">
            <strong>${realIndex + 1}. ${escapeHtml(item.code)}</strong>
            <span>${formatDuration(item.duration)}</span>
          </div>
          <div class="tag-row">
            <span class="tag material">${escapeHtml(item.baseMaterial)}</span>
            <span class="tag">${escapeHtml(item.shift)}</span>
            <span class="tag ${hasDamage ? "damage" : "ok"}">${escapeHtml(item.damage)}</span>
          </div>
          <p class="segment-note">${escapeHtml(item.note || "没有备注。")}</p>
        </div>
        <div class="segment-actions">
          <button type="button" title="上移" data-move-up="${escapeHtml(item.id)}">↑</button>
          <button type="button" title="下移" data-move-down="${escapeHtml(item.id)}">↓</button>
          <button type="button" title="删除" data-delete="${escapeHtml(item.id)}">×</button>
        </div>
      </article>
    `;
  }

  function renderSpliceHistory(splice) {
    if (!splice.history.length) return "";
    return `
      <ol class="splice-history">
        ${splice.history
          .map(
            (entry) => `
            <li class="${entry.type === "anomaly" ? "anomaly" : "join"}">
              <span>${formatDateTime(entry.at)}</span>
              ${escapeHtml(entry.note || "")}
            </li>`
          )
          .join("")}
      </ol>
    `;
  }

  function renderSpliceForm(first, second, ui) {
    const key = `${first.id}|${second.id}`;
    const error = ui.spliceFormError && ui.openSpliceJunction === key ? ui.spliceFormError : "";
    const draft = (ui.spliceDrafts && ui.spliceDrafts[key]) || {};
    const checked = draft.pass === undefined ? true : draft.pass;
    const attr = (value) => (value === undefined || value === null ? "" : `value="${escapeHtml(value)}"`);
    return `
      <form class="splice-form" data-splice-form="${escapeHtml(key)}">
        <div class="splice-form-grid">
          <label>
            接片方式
            <select data-splice-method>
              ${SpliceRules.METHODS.map(
                (method) =>
                  `<option value="${escapeHtml(method)}" ${
                    draft.method === method ? "selected" : ""
                  }>${escapeHtml(method)}</option>`
              ).join("")}
            </select>
          </label>
          <label>
            接缝长度（格，至多 ${SpliceRules.MAX_JOIN_FRAMES}）
            <input data-splice-length type="number" min="1" max="${
              SpliceRules.MAX_JOIN_FRAMES
            }" placeholder="例：6" ${attr(draft.length)} />
          </label>
          <label>
            摩擦测试人
            <input data-splice-tester type="text" placeholder="登记测试人姓名" ${attr(
              draft.tester
            )} />
          </label>
          <label class="check-label">
            <input data-splice-pass type="checkbox" ${checked ? "checked" : ""} />
            摩擦测试合格
          </label>
        </div>
        ${error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : ""}
        <div class="splice-form-actions">
          <button class="primary" type="submit">登记接片</button>
          <button type="button" data-splice-cancel>取消</button>
        </div>
      </form>
    `;
  }

  function renderAnomalyForm(splice) {
    return `
      <form class="anomaly-form" data-anomaly-form="${escapeHtml(splice.id)}">
        <label>
          异常情况（可选）
          <textarea data-anomaly-note rows="2" placeholder="例：过机时接缝处有顿挫感"></textarea>
        </label>
        <label>
          登记人（默认原测试人）
          <input data-anomaly-tester type="text" placeholder="${escapeHtml(splice.tester)}" />
        </label>
        <div class="splice-form-actions">
          <button class="danger" type="submit">确认上报异常</button>
          <button type="button" data-anomaly-cancel>取消</button>
        </div>
      </form>
    `;
  }

  function renderSpliceChip(state, splice, ui) {
    const pending = splice.status === SpliceRules.STATUS_PENDING;
    const first = state.segments.find((item) => item.id === splice.firstId);
    const second = state.segments.find((item) => item.id === splice.secondId);
    const pair = `${first ? first.code : "缺失片段"} → ${second ? second.code : "缺失片段"}`;
    return `
      <div class="splice-chip ${pending ? "pending" : "passed"}" data-splice-id="${escapeHtml(
      splice.id
    )}">
        <div class="splice-chip-head">
          <strong>🔗 ${escapeHtml(pair)} · ${escapeHtml(splice.method)}</strong>
          <span class="splice-status ${pending ? "pending" : "ok"}">${escapeHtml(splice.status)}</span>
        </div>
        <div class="splice-meta">
          <span>片基材质：${escapeHtml(splice.baseMaterial)}</span>
          <span>接缝长度：${escapeHtml(splice.joinLength)} 格</span>
          <span>摩擦测试人：${escapeHtml(splice.tester)}</span>
          <span>登记时间：${formatDateTime(splice.createdAt)}</span>
        </div>
        ${
          !pending
            ? `<button class="text-btn" type="button" data-anomaly-add="${escapeHtml(
                splice.id
              )}">接片通过后上报摩擦测试异常</button>`
            : ""
        }
        ${ui.openAnomaly === splice.id ? renderAnomalyForm(splice) : ""}
        ${renderSpliceHistory(splice)}
      </div>
    `;
  }

  function renderJunction(state, first, second, ui) {
    const key = `${first.id}|${second.id}`;
    const splice = findSpliceBetween(state, first.id, second.id);
    let body;
    if (splice) {
      body = renderSpliceChip(state, splice, ui);
    } else if (first.baseMaterial === second.baseMaterial) {
      body =
        ui.openSpliceJunction === key
          ? renderSpliceForm(first, second, ui)
          : `<button class="junction-add" type="button" data-splice-add="${escapeHtml(
              key
            )}">＋ 在此登记胶带接片（${escapeHtml(first.baseMaterial)}，相邻同材质）</button>`;
    } else {
      body = `<p class="junction-locked">片基材质不同（${escapeHtml(
        first.baseMaterial
      )} / ${escapeHtml(second.baseMaterial)}），不得建立接片。</p>`;
    }
    return `<div class="junction">${body}</div>`;
  }

  function renderOrphanSplices(state, ui, visibleIds) {
    const orphans = state.splices.filter((splice) => {
      const info = SpliceRules.junctionState(splice, state.segments);
      return !info.adjacent && (visibleIds.has(splice.firstId) || visibleIds.has(splice.secondId));
    });
    if (!orphans.length) return "";
    return `
      <div class="orphan-block">
        <h3>未落在相邻位置的既有接片（记录原样保留）</h3>
        ${orphans
          .map((splice) => {
            const info = SpliceRules.junctionState(splice, state.segments);
            return `
              <div class="junction orphan">
                <p class="orphan-reason">${escapeHtml(info.reason)}</p>
                ${renderSpliceChip(state, splice, ui)}
              </div>`;
          })
          .join("")}
      </div>
    `;
  }

  function renderList(state, ui = {}) {
    const visible = getVisibleSegments(state);
    const visibleIds = new Set(visible.map((item) => item.id));
    if (!visible.length) {
      els.segmentList.innerHTML = `<p class="empty">没有符合筛选的片段。</p>`;
      return;
    }
    const html = visible
      .map((item) => {
        const orderIndex = state.segments.findIndex((segment) => segment.id === item.id);
        const next = state.segments[orderIndex + 1];
        const card = renderCard(state, item);
        // 仅当相邻两段都在筛选结果中时，接缝行才夹在中间显示
        const junction = next && visibleIds.has(next.id)
          ? renderJunction(state, item, next, ui)
          : "";
        return card + junction;
      })
      .join("");
    els.segmentList.innerHTML = html + renderOrphanSplices(state, ui, visibleIds);
  }

  function renderWarnings(state) {
    const entries = [];

    state.splices.forEach((splice) => {
      const info = SpliceRules.junctionState(splice, state.segments);
      const first = state.segments.find((item) => item.id === splice.firstId);
      const second = state.segments.find((item) => item.id === splice.secondId);
      const pair = `${first ? first.code : "缺失片段"} → ${second ? second.code : "缺失片段"}`;
      if (splice.status === SpliceRules.STATUS_PENDING) {
        entries.push({
          tone: "pending",
          title: `接片待复核：${pair}`,
          detail: `接缝 ${splice.joinLength} 格，测试人 ${splice.tester}；摩擦测试异常，需复核后再放映。`
        });
      }
      if (!info.adjacent) {
        entries.push({ tone: "broken", title: `接片位置异常：${pair}`, detail: info.reason });
      }
    });

    state.segments.forEach((item, index) => {
      if (item.damage === "完好" && item.shift === "正常") return;
      const reasons = [
        item.shift !== "正常" ? item.shift : "",
        item.damage !== "完好" ? item.damage : ""
      ]
        .filter(Boolean)
        .join(" · ");
      entries.push({
        tone: "damage",
        title: `${index + 1}. ${item.code}`,
        detail: `${reasons}${item.note ? `：${item.note}` : ""}`
      });
    });

    els.warningList.innerHTML =
      entries
        .map(
          (entry) => `
        <div class="warning-item ${escapeHtml(entry.tone)}">
          <strong>${escapeHtml(entry.title)}</strong>
          <span>${escapeHtml(entry.detail)}</span>
        </div>`
        )
        .join("") || `<p class="empty">当前清单没有待复核接片、位置异常或破损提醒。</p>`;
  }

  function buildExportText(state) {
    const lines = [
      `胶片卷：${state.reelTitle || "未命名胶片卷"}`,
      `总时长：${formatDuration(
        state.segments.reduce((sum, item) => sum + Number(item.duration), 0)
      )}`,
      `片段数：${state.segments.length}`,
      `接片数：${state.splices.length}（待复核 ${
        state.splices.filter((splice) => splice.status === SpliceRules.STATUS_PENDING).length
      }）`,
      "",
      "【放映顺序】"
    ];
    state.segments.forEach((item, index) => {
      lines.push(
        `${index + 1}. ${item.code}｜${formatDuration(item.duration)}｜${item.baseMaterial}｜${
          item.shift
        }｜${item.damage}｜${item.note || "无备注"}`
      );
    });

    lines.push("", "【接片工艺记录】");
    if (!state.splices.length) {
      lines.push("暂无接片记录。");
    }
    state.splices.forEach((splice) => {
      const first = state.segments.find((item) => item.id === splice.firstId);
      const second = state.segments.find((item) => item.id === splice.secondId);
      const pair = `${first ? first.code : "缺失片段"} → ${second ? second.code : "缺失片段"}`;
      const info = SpliceRules.junctionState(splice, state.segments);
      lines.push(
        `- ${pair}｜${splice.method}｜${splice.baseMaterial}｜接缝 ${splice.joinLength} 格｜摩擦测试人：${splice.tester}｜状态：${splice.status}${
          info.adjacent ? "" : "｜" + info.reason
        }`
      );
      splice.history.forEach((entry) => {
        lines.push(`    · ${formatDateTime(entry.at)} ${entry.note || ""}`);
      });
    });
    return lines.join("\n");
  }

  function renderAll(state, ui = {}) {
    renderStats(state);
    renderList(state, ui);
    renderWarnings(state);
  }

  return {
    els,
    renderAll,
    renderList,
    renderStats,
    renderWarnings,
    buildExportText,
    formatDuration,
    formatDateTime,
    escapeHtml
  };
})();
