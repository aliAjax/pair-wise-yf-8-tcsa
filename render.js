// 渲染层：所有 DOM 文本与 HTML 都在这里生成，不做规则判定，也不直接持久化。
(function () {
  const fallbackThumbs = ["#d49b35", "#347d89", "#b54d48", "#4d7656", "#6d6378"];

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

  function formatTime(iso) {
    if (!iso) return "时间未登记";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "时间未登记";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`;
  }

  function optionHtml(options, selected) {
    return options
      .map(
        (option) =>
          `<option value="${escapeHtml(option)}"${
            option === selected ? " selected" : ""
          }>${escapeHtml(option)}</option>`
      )
      .join("");
  }

  function pairKey(fromId, toId) {
    return `${fromId}=>${toId}`;
  }

  function resolvePairCodes(state, splice) {
    const from = state.segments.find((segment) => segment.id === splice.fromId);
    const to = state.segments.find((segment) => segment.id === splice.toId);
    return {
      fromCode: from ? from.code : "（片段已删除）",
      toCode: to ? to.code : "（片段已删除）",
      fromBase: from ? from.base : "",
      toBase: to ? to.base : "",
      adjacent: window.SpliceRules.areAdjacent(state.segments, splice.fromId, splice.toId),
      bothExist: Boolean(from && to)
    };
  }

  function getFilteredSegments(state, ui) {
    const color = ui.colorFilter;
    const keyword = (ui.searchKeyword || "").trim();
    return state.segments.filter((item) => {
      const matchesColor = color === "all" || item.shift === color;
      const matchesKeyword =
        !keyword || `${item.code}${item.note}${item.damage}${item.base}`.includes(keyword);
      return matchesColor && matchesKeyword;
    });
  }

  function renderStats(state, els) {
    const total = state.segments.reduce((sum, item) => sum + Number(item.duration), 0);
    const damaged = state.segments.filter((item) => item.damage !== "完好").length;
    const passed = state.splices.filter(
      (splice) => splice.status === window.SpliceRules.STATUS.PASSED
    ).length;
    const pending = state.splices.filter(
      (splice) => splice.status === window.SpliceRules.STATUS.PENDING
    ).length;
    els.totalDuration.textContent = formatDuration(total);
    els.damageCount.textContent = damaged;
    els.segmentCount.textContent = state.segments.length;
    els.spliceCount.textContent = state.splices.length;
    els.pendingCount.textContent = pending;
    els.pendingCount.closest("div").classList.toggle("has-pending", pending > 0);
    // 合格接片数仅作为悬停补充，统计首屏仍以总接片数/待复核数为准。
    els.spliceCount.title = `其中摩擦测试通过：${passed} 处`;
  }

  function renderSpliceBadges(state, segment) {
    const links = state.splices
      .filter(
        (splice) => splice.fromId === segment.id || splice.toId === segment.id
      )
      .map((splice) => {
        const label = splice.status === window.SpliceRules.STATUS.PENDING ? "接缝待复核" : "已接片";
        const cls = splice.status === window.SpliceRules.STATUS.PENDING ? "damage" : "ok";
        return `<span class="tag ${cls}">${label}</span>`;
      });
    return links.join("");
  }

  function segmentCardHtml(state, item, realIndex) {
    const hasDamage = item.damage !== "完好";
    return `
      <article class="segment-card" draggable="true" data-id="${item.id}">
        <div class="thumb">
          ${
            item.thumb
              ? `<img src="${item.thumb}" alt="${escapeHtml(item.code)}缩略图" />`
              : `<div class="film-placeholder" style="background:${fallbackThumbs[realIndex % fallbackThumbs.length]}">${escapeHtml(item.code)}</div>`
          }
        </div>
        <div class="segment-main">
          <div class="segment-title">
            <strong>${realIndex + 1}. ${escapeHtml(item.code)}</strong>
            <span>${formatDuration(item.duration)}</span>
          </div>
          <div class="tag-row">
            <span class="tag">${escapeHtml(item.base || "片基未登记")}</span>
            <span class="tag">${escapeHtml(item.shift)}</span>
            <span class="tag ${hasDamage ? "damage" : "ok"}">${escapeHtml(item.damage)}</span>
            ${renderSpliceBadges(state, item)}
          </div>
          <p class="segment-note">${escapeHtml(item.note || "没有备注。")}</p>
        </div>
        <div class="segment-actions">
          <button type="button" title="上移" data-move-up="${item.id}">↑</button>
          <button type="button" title="下移" data-move-down="${item.id}">↓</button>
          <button type="button" title="删除" data-delete="${item.id}">×</button>
        </div>
      </article>
    `;
  }

  function spliceHistoryHtml(splice) {
    const rows = splice.history
      .map(
        (entry) =>
          `<li><span>${formatTime(entry.at)}</span><strong>${escapeHtml(
            entry.action
          )}</strong><em>${escapeHtml(entry.detail)}</em></li>`
      )
      .join("");
    return `<ul class="splice-history">${rows}</ul>`;
  }

  function existingConnectorHtml(state, ui, splice, from, to) {
    const pending = splice.status === window.SpliceRules.STATUS.PENDING;
    const expanded = ui.expandedSplice === splice.id;
    const codes = resolvePairCodes(state, splice);
    const positionNote = codes.bothExist && !codes.adjacent ? "（顺序调整后已不相邻，记录原样保留）" : "";
    const action = pending
      ? `<button type="button" class="splice-act" data-review-pass="${splice.id}">复核通过</button>`
      : `<button type="button" class="splice-act" data-anomaly="${splice.id}">摩擦测试异常</button>`;
    return `
      <div class="splice-connector${pending ? " pending" : ""}" data-splice-id="${splice.id}">
        <div class="splice-chip">
          <span class="splice-knot">${pending ? "◈" : "⬢"}</span>
          <div class="splice-info">
            <strong>${escapeHtml(codes.fromCode)} → ${escapeHtml(codes.toCode)}</strong>
            <span>${escapeHtml(splice.method)}｜接缝 ${escapeHtml(splice.seamLength)} 格｜摩擦测试：${escapeHtml(splice.tester)} ${positionNote}</span>
          </div>
          <span class="tag ${pending ? "damage" : "ok"}">${escapeHtml(splice.status)}</span>
          ${action}
          <button type="button" class="splice-toggle" title="查看历史" data-splice-toggle="${splice.id}">${expanded ? "收起" : "历史"}</button>
        </div>
        ${expanded ? spliceHistoryHtml(splice) : ""}
      </div>
    `;
  }

  function createSpliceHtml(ui, from, to, realIndex) {
    const draft = ui.draft || {};
    const sameBase = Boolean(from.base && to.base && from.base === to.base);
    const method = draft.method || "胶带接片";
    const testResult = draft.testResult || "合格";
    const seamLength = draft.seamLength ?? 6;
    const tester = draft.tester ?? "";
    const key = pairKey(from.id, to.id);
    const errors = ui.formErrors && ui.formErrors.key === key ? ui.formErrors.messages : [];

    return `
      <div class="splice-connector creating" data-pair="${escapeHtml(key)}">
        <form class="splice-form" novalidate>
          <p class="splice-form-title">
            登记接片：<strong>${escapeHtml(from.code)}</strong>（${escapeHtml(
      from.base || "片基未登记"
    )}）→ <strong>${escapeHtml(to.code)}</strong>（${escapeHtml(to.base || "片基未登记")}）
          </p>
          <div class="splice-fields">
            <label>接片方式
              <select data-field="method">${optionHtml(window.SpliceRules.SPLICE_METHODS, method)}</select>
            </label>
            <label>摩擦测试人
              <input data-field="tester" type="text" maxlength="30" placeholder="必填" value="${escapeHtml(tester)}" />
            </label>
            <label>接缝长度（格，≤8）
              <input data-field="seamLength" type="number" min="1" max="8" step="1" value="${escapeHtml(seamLength)}" />
            </label>
            <label>摩擦测试
              <select data-field="testResult">${optionHtml(window.SpliceRules.TEST_RESULTS, testResult)}</select>
            </label>
          </div>
          ${
            !sameBase
              ? `<p class="splice-hint">两端片基材质不同，提交将整次拒绝。</p>`
              : ""
          }
          ${
            errors.length
              ? `<div class="splice-errors">${errors
                  .map((error) => `<p>整次拒绝：${escapeHtml(error)}</p>`)
                  .join("")}</div>`
              : ""
          }
          <div class="splice-form-actions">
            <button type="submit" class="primary" data-splice-submit="${realIndex}">提交并建立接片</button>
            <button type="button" data-splice-cancel>取消</button>
          </div>
        </form>
      </div>
    `;
  }

  function newSpliceButtonHtml(from, to, realIndex) {
    const sameBase = Boolean(from.base && to.base && from.base === to.base);
    if (sameBase) {
      return `
        <div class="splice-connector gap">
          <button type="button" class="splice-open" data-splice-open="${realIndex}">＋ 登记胶带接片接缝</button>
        </div>
      `;
    }
    return `
      <div class="splice-connector gap blocked">
        <button type="button" class="splice-open" disabled title="片基材质不同，不能建立接片">
          ＋ 片基材质不同（${escapeHtml(from.base || "未登记")}／${escapeHtml(
      to.base || "未登记"
    )}），禁止接片
        </button>
      </div>
    `;
  }

  function renderList(state, ui, els) {
    const visible = new Set(getFilteredSegments(state, ui).map((item) => item.id));
    const html = [];
    const renderedSpliceIds = new Set();

    state.segments.forEach((segment, realIndex) => {
      if (!visible.has(segment.id)) return;
      html.push(segmentCardHtml(state, segment, realIndex));

      const next = state.segments[realIndex + 1];
      if (!next || !visible.has(next.id)) return;

      const existing = window.SpliceRules.findPairSplice(state.splices, segment.id, next.id);
      if (existing) {
        renderedSpliceIds.add(existing.id);
        html.push(existingConnectorHtml(state, ui, existing, segment, next));
        return;
      }
      if (ui.createOpen === pairKey(segment.id, next.id)) {
        html.push(createSpliceHtml(ui, segment, next, realIndex));
      } else {
        html.push(newSpliceButtonHtml(segment, next, realIndex));
      }
    });

    // 换序后两端已不相邻、但两端都在筛选结果中的既有接缝：记录原样保留，另列提示。
    const detached = state.splices.filter(
      (splice) =>
        !renderedSpliceIds.has(splice.id) &&
        visible.has(splice.fromId) &&
        visible.has(splice.toId)
    );
    if (detached.length) {
      html.push(`<div class="detached-head">以下接缝在当前顺序中两端已不相邻，记录原样保留：</div>`);
      detached.forEach((splice) => {
        html.push(existingConnectorHtml(state, ui, splice, null, null));
      });
    }

    els.segmentList.innerHTML = html.join("") || `<p class="empty">没有符合筛选的片段。</p>`;
  }

  function reviewItemHtml(state, splice) {
    const codes = resolvePairCodes(state, splice);
    const last = splice.history[splice.history.length - 1];
    return `
      <div class="warning-item review-item" data-splice-id="${splice.id}">
        <strong>${escapeHtml(codes.fromCode)} → ${escapeHtml(codes.toCode)}</strong>
        <span>${escapeHtml(splice.method)}｜接缝 ${escapeHtml(splice.seamLength)} 格｜测试人：${escapeHtml(splice.tester)}</span>
        <span class="review-reason">${escapeHtml(last ? `${last.action}：${last.detail}` : "")}</span>
        <button type="button" data-review-pass="${splice.id}">复核通过</button>
      </div>
    `;
  }

  function renderReviews(state, els) {
    const pending = state.splices.filter(
      (splice) => splice.status === window.SpliceRules.STATUS.PENDING
    );
    els.reviewList.innerHTML =
      pending
        .map((splice) => reviewItemHtml(state, splice))
        .join("") || `<p class="empty">暂无待复核接片。</p>`;
  }

  function renderWarnings(state, els) {
    const warnings = state.segments.filter((item) => item.damage !== "完好" || item.shift !== "正常");
    els.warningList.innerHTML =
      warnings
        .map((item) => {
          const index = state.segments.findIndex((segment) => segment.id === item.id) + 1;
          const reasons = [
            item.shift !== "正常" ? item.shift : "",
            item.damage !== "完好" ? item.damage : ""
          ]
            .filter(Boolean)
            .join(" · ");
          return `
            <div class="warning-item">
              <strong>${index}. ${escapeHtml(item.code)}</strong>
              <span>${escapeHtml(reasons)}${item.note ? `：${escapeHtml(item.note)}` : ""}</span>
            </div>
          `;
        })
        .join("") || `<p class="empty">当前清单没有颜色偏移或破损提醒。</p>`;
  }

  function renderNotice(ui, els) {
    if (!ui.notice) {
      els.notice.innerHTML = "";
      els.notice.className = "notice";
      return;
    }
    els.notice.className = `notice show ${ui.notice.type === "success" ? "success" : "error"}`;
    els.notice.textContent = ui.notice.text;
  }

  function buildExportText(state) {
    const total = state.segments.reduce((sum, item) => sum + Number(item.duration), 0);
    const passed = state.splices.filter(
      (splice) => splice.status === window.SpliceRules.STATUS.PASSED
    ).length;
    const pending = state.splices.filter(
      (splice) => splice.status === window.SpliceRules.STATUS.PENDING
    ).length;

    const lines = [
      `胶片卷：${state.reelTitle || "未命名胶片卷"}`,
      `总时长：${formatDuration(total)}`,
      `片段数：${state.segments.length}`,
      `接片：${state.splices.length} 处（通过 ${passed}，待复核 ${pending}）`,
      "",
      "【片段放映顺序】",
      ...state.segments.map(
        (item, index) =>
          `${index + 1}. ${item.code}｜${item.base || "片基未登记"}｜${formatDuration(
            item.duration
          )}｜${item.shift}｜${item.damage}｜${item.note || "无备注"}`
      ),
      "",
      "【接片工艺记录】"
    ];

    if (!state.splices.length) {
      lines.push("暂无接片记录。");
    } else {
      state.splices.forEach((splice, index) => {
        const codes = resolvePairCodes(state, splice);
        lines.push(
          `${index + 1}. ${codes.fromCode} → ${codes.toCode}｜${splice.method}｜接缝 ${
            splice.seamLength
          } 格｜摩擦测试人：${splice.tester}｜状态：${splice.status}`
        );
        splice.history.forEach((entry) => {
          lines.push(
            `   - ${formatTime(entry.at)}｜${entry.action}｜${entry.detail}`
          );
        });
      });
    }

    return lines.join("\n");
  }

  function renderAll(state, ui, els) {
    els.reelTitle.value = state.reelTitle;
    renderStats(state, els);
    renderList(state, ui, els);
    renderReviews(state, els);
    renderWarnings(state, els);
    renderNotice(ui, els);
  }

  window.FilmView = {
    escapeHtml,
    formatDuration,
    formatTime,
    pairKey,
    resolvePairCodes,
    getFilteredSegments,
    renderStats,
    renderList,
    renderReviews,
    renderWarnings,
    renderNotice,
    renderAll,
    buildExportText
  };
})();
