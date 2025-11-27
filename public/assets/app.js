const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const toastContainer = document.createElement("div");
toastContainer.className = "toast-container";
document.body.appendChild(toastContainer);

const toast = (message, type = "info") => {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-6px)";
  }, 3200);
  setTimeout(() => {
    el.remove();
  }, 3600);
};

const apiFetch = async (url, options = {}) => {
  const defaultHeaders = { "Content-Type": "application/json" };
  const config = {
    method: "GET",
    ...options,
    headers: { ...defaultHeaders, ...(options.headers || {}) },
  };
  const response = await fetch(url, config);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || response.statusText);
  }
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return response.json();
  }
  return response;
};

const toPublicUrl = (path) => {
  if (!path) return "";
  const trimmed = path.trim();
  if (trimmed.startsWith("data:")) {
    return trimmed;
  }
  return trimmed.replace(/^\.?\/?public\/?/, "/");
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const state = {
  overlay: { width: 200, height: 200, x: 50, y: 50, topRadius: 0 },
  text: {
    value: "SAMPLE",
    size: 24,
    x: 100,
    y: 100,
    color: "#ffffff",
    fontFamily: "Arial",
  },
  bgSize: { width: 1000, height: 600 },
  scale: 1,
  latestQrDataUrl: "",
  pointer: null,
  projectOverview: null,
  selectedQrProject: null,
  selectedPostProject: null,
};

const elements = {};

const readOverlayInputs = () => {
  state.overlay = {
    width: Number($("#overlayWidth").value) || 0,
    height: Number($("#overlayHeight").value) || 0,
    x: Number($("#overlayX").value) || 0,
    y: Number($("#overlayY").value) || 0,
    topRadius: Number($("#overlayRadius").value) || 0,
  };
};

const readTextInputs = () => {
  state.text = {
    value: $("#textValue").value || "",
    size: Number($("#textSize").value) || 0,
    x: Number($("#textX").value) || 0,
    y: Number($("#textY").value) || 0,
    color: $("#textColor").value || "#ffffff",
    fontFamily: $("#textFont").value || "Arial",
  };
};

const syncInputsFromState = () => {
  $("#overlayWidth").value = Math.round(state.overlay.width);
  $("#overlayHeight").value = Math.round(state.overlay.height);
  $("#overlayX").value = Math.round(state.overlay.x);
  $("#overlayY").value = Math.round(state.overlay.y);
  $("#overlayRadius").value = Math.round(state.overlay.topRadius);
  $("#textValue").value = state.text.value;
  $("#textSize").value = Math.round(state.text.size);
  $("#textX").value = Math.round(state.text.x);
  $("#textY").value = Math.round(state.text.y);
  $("#textColor").value = state.text.color;
  $("#textFont").value = state.text.fontFamily;
};

const updateOverlayLabel = () => {
  const label = $("#qrOverlayLabel");
  label.textContent = `(${Math.round(state.overlay.x)}, ${Math.round(
    state.overlay.y,
  )})`;
};

const applyOverlayStyles = () => {
  const overlay = $("#qrOverlay");
  const textPreview = $("#textPreview");
  const overlayWidthPx = state.overlay.width * state.scale;
  const overlayHeightPx = state.overlay.height * state.scale;
  overlay.style.width = `${overlayWidthPx}px`;
  overlay.style.height = `${overlayHeightPx}px`;
  overlay.style.left = `${state.overlay.x * state.scale}px`;
  overlay.style.top = `${state.overlay.y * state.scale}px`;
  overlay.style.borderRadius = `${state.overlay.topRadius * state.scale}px`;
  textPreview.style.left = `${state.text.x * state.scale}px`;
  textPreview.style.top = `${state.text.y * state.scale}px`;
  textPreview.textContent = state.text.value;
  textPreview.style.fontSize = `${state.text.size * state.scale}px`;
  textPreview.style.color = state.text.color;
  textPreview.style.fontFamily = state.text.fontFamily;
  updateOverlayLabel();
};

const updateScaleFromBackground = () => {
  const bg = $("#backgroundPreview");
  if (!bg.naturalWidth || !bg.clientWidth) {
    state.scale = 1;
    return;
  }
  state.bgSize = {
    width: bg.naturalWidth,
    height: bg.naturalHeight,
  };
  state.scale = bg.clientWidth / bg.naturalWidth;
  applyOverlayStyles();
};

const setQrProjectSelection = (option, { silent = false } = {}) => {
  const couponsPathInput = $("#couponsPath");
  const generatePathInput = $("#generatePath");
  if (!option || !option.value) {
    state.selectedQrProject = null;
    if (couponsPathInput) couponsPathInput.value = "";
    if (generatePathInput) generatePathInput.value = "";
    if (!silent) {
      loadQrOutputs();
    }
    return;
  }
  const project = option.value;
  const couponPath = option.dataset.couponPath || "";
  const qrPath = option.dataset.qrPath || "";
  if (couponsPathInput) couponsPathInput.value = couponPath;
  if (generatePathInput) generatePathInput.value = qrPath;
  state.selectedQrProject = { name: project, couponPath, qrPath };
  if (!silent) {
    loadQrOutputs();
  }
};

const setPostProcessProjectSelection = (option) => {
  const qrSourceInput = $("#qrSourcePath");
  const qrTargetInput = $("#qrTargetPath");
  if (!option || !option.value) {
    state.selectedPostProject = null;
    if (qrSourceInput) qrSourceInput.value = "";
    if (qrTargetInput) qrTargetInput.value = "";
    return;
  }
  const project = option.value;
  const qrPath = option.dataset.qrPath || "";
  const postPath = option.dataset.postProcessPath || "";
  if (qrSourceInput) qrSourceInput.value = qrPath;
  if (qrTargetInput) qrTargetInput.value = postPath;
  state.selectedPostProject = { name: project, qrPath, postProcessPath: postPath };
};

const renderHistoryList = (selector, items, type) => {
  const list = $(selector);
  if (!list) return;
  list.innerHTML = "";
  if (!items || !items.length) {
    const li = document.createElement("li");
    li.textContent = "Belum ada data";
    list.appendChild(li);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = item.description || item.name;
    const button = document.createElement("button");
    button.className = "btn small";
    button.textContent = "Download";
    button.dataset.historyType = type;
    button.dataset.project = item.name;
    if (item.couponPath) button.dataset.path = item.couponPath;
    if (item.qrPath) button.dataset.path = item.qrPath;
    if (item.postProcessPath) button.dataset.path = item.postProcessPath;
    li.append(span, button);
    list.appendChild(li);
  });
};

const populateProjectSelectors = () => {
  const overview = state.projectOverview;
  const qrSelect = $("#qrProjectSelect");
  if (qrSelect) {
    const previous = state.selectedQrProject?.name;
    qrSelect.innerHTML = "<option value=\"\">Pilih project...</option>";
    const pending = overview?.couponsWithoutQr || [];
    if (!pending.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Semua project sudah memiliki QR";
      option.disabled = true;
      qrSelect.appendChild(option);
      setQrProjectSelection(null, { silent: true });
    } else {
      pending.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.name;
        option.textContent = `${item.name} (${item.pendingCount} file)`;
        option.dataset.couponPath = item.couponPath;
        option.dataset.qrPath = item.qrPath;
        option.dataset.pending = item.pendingCsv?.join(",") || "";
        qrSelect.appendChild(option);
      });
      const match = pending.find((item) => item.name === previous);
      if (match) {
        qrSelect.value = previous;
        const option = qrSelect.options[qrSelect.selectedIndex];
        setQrProjectSelection(option, { silent: true });
      } else {
        qrSelect.value = "";
        setQrProjectSelection(null, { silent: true });
      }
    }
  }

  const postSelect = $("#postProcessProjectSelect");
  if (postSelect) {
    const previous = state.selectedPostProject?.name;
    postSelect.innerHTML = "<option value=\"\">Pilih project...</option>";
    const pendingPost = overview?.qrWithoutPostProcess || [];
    if (!pendingPost.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Tidak ada project menunggu post-process";
      option.disabled = true;
      postSelect.appendChild(option);
      setPostProcessProjectSelection(null);
    } else {
      pendingPost.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.name;
        option.textContent = `${item.name} (${item.pendingCount} folder)`;
        option.dataset.qrPath = item.qrPath;
        option.dataset.postProcessPath = item.postProcessPath;
        postSelect.appendChild(option);
      });
      const match = pendingPost.find((item) => item.name === previous);
      if (match) {
        postSelect.value = previous;
        const option = postSelect.options[postSelect.selectedIndex];
        setPostProcessProjectSelection(option);
      } else {
        postSelect.value = "";
        setPostProcessProjectSelection(null);
      }
    }
  }
};

const renderHistoryLists = () => {
  const overview = state.projectOverview;
  renderHistoryList(
    "#couponHistory",
    overview?.history?.coupons?.map((item) => ({
      name: item.name,
      couponPath: item.couponPath,
      description: `${item.name}`,
    })),
    "coupon",
  );
  renderHistoryList(
    "#qrHistory",
    overview?.history?.qr?.map((item) => ({
      name: item.name,
      qrPath: item.qrPath,
      description: `${item.name}`,
    })),
    "qr",
  );
  renderHistoryList(
    "#postHistory",
    overview?.history?.postProcess?.map((item) => ({
      name: item.name,
      postProcessPath: item.postProcessPath,
      description: `${item.name}`,
    })),
    "post",
  );
};

const loadProjectOverview = async (showToast = false) => {
  try {
    const data = await apiFetch("/api/coupon/projects/overview");
    state.projectOverview = data;
    populateProjectSelectors();
    renderHistoryLists();
    if (showToast) {
      toast("Status project diperbarui", "success");
    }
    if (state.selectedQrProject?.qrPath) {
      await loadQrOutputs();
    }
  } catch (error) {
    toast(`Gagal memuat status project: ${error.message}`, "error");
  }
};

const handleHistoryDownload = (event) => {
  const button = event.target.closest("button[data-history-type]");
  if (!button) {
    return;
  }
  const { historyType, project, path } = button.dataset;
  if (historyType === "coupon") {
    if (!project) {
      toast("Project tidak ditemukan", "warn");
      return;
    }
    window.open(`/api/coupon/downloadAll/${encodeURIComponent(project)}`);
  } else if (historyType === "qr") {
    if (!path) {
      toast("Path tidak ditemukan", "warn");
      return;
    }
    window.open(
      `/api/coupon/qr/download?generatePath=${encodeURIComponent(path)}`,
    );
  } else if (historyType === "post") {
    if (!path && !project) {
      toast("Path tidak ditemukan", "warn");
      return;
    }
    const query = path
      ? `path=${encodeURIComponent(path)}`
      : `project=${encodeURIComponent(project)}`;
    window.open(`/api/coupon/post-process/download?${query}`);
  }
};

const refreshCouponList = async () => {
  const project = $("#project").value.trim();
  if (!project) return;
  try {
    const files = await apiFetch(`/api/coupon/generated/${project.toUpperCase()}`);
    const list = $("#couponFiles");
    list.innerHTML = "";
    if (!files.length) {
      const li = document.createElement("li");
      li.textContent = "Belum ada file";
      list.appendChild(li);
      return;
    }
    files.forEach((file) => {
      const li = document.createElement("li");
      li.textContent = file;
      list.appendChild(li);
    });
  } catch (error) {
    toast(`Gagal memuat daftar: ${error.message}`, "error");
  }
};

const handleCouponSubmit = async (event) => {
  event.preventDefault();
  const project = $("#project").value.trim();
  const prefix = $("#prefix").value.trim();
  const postfix = $("#postfix").value.trim();
  const lengths = Number($("#lengths").value);
  const count = Number($("#count").value);
  const char = $("#char").value.trim();
  const type = $$('input[name="type"]').find((input) => input.checked)?.value;
  if (!project) {
    toast("Project wajib diisi", "error");
    return;
  }
  try {
    await apiFetch("/api/coupon/generate", {
      method: "POST",
      body: JSON.stringify({
        project,
        prefix,
        postfix,
        lengths,
        count,
        char: char || undefined,
        type,
      }),
    });
    toast("Request generate dikirim ke antrian", "success");
    refreshCouponList();
    loadProjectOverview();
  } catch (error) {
    toast(`Gagal generate: ${error.message}`, "error");
  }
};

const handleCouponDownload = () => {
  const project = $("#project").value.trim();
  if (!project) {
    toast("Isi nama project terlebih dahulu", "warn");
    return;
  }
  window.open(`/api/coupon/downloadAll/${project.toUpperCase()}`);
};

const handleQrPreview = async () => {
  const content = $("#previewContent").value.trim() || "SAMPLE";
  const style = $("#style").value;
  const colorRange = [$("#colorStart").value, $("#colorEnd").value];
  const iconPath = $("#iconPath").value.trim();
  try {
    const result = await apiFetch("/api/coupon/preview/qr", {
      method: "POST",
      body: JSON.stringify({
        content,
        style,
        colorRange,
        iconPath: iconPath || undefined,
      }),
    });
    const dataUrl = result?.dataUrl;
    if (dataUrl) {
      $("#qrPreviewImage").src = dataUrl;
      $("#qrOverlayImage").src = dataUrl;
      state.latestQrDataUrl = dataUrl;
      toast("Preview QR berhasil diperbarui", "success");
    }
  } catch (error) {
    toast(`Gagal membuat preview QR: ${error.message}`, "error");
  }
};

const handleGenerateQr = async () => {
  if (!state.selectedQrProject) {
    toast("Pilih project coupon yang akan dibuat QR", "warn");
    return;
  }
  const payload = {
    couponsPath: $("#couponsPath").value.trim(),
    generatePath: $("#generatePath").value.trim(),
    iconPath: $("#iconPath").value.trim(),
    colorRange: [$("#colorStart").value, $("#colorEnd").value],
    style: $("#style").value,
  };
  if (!payload.couponsPath || !payload.generatePath) {
    toast("Lengkapi field path terlebih dahulu", "warn");
    return;
  }
  try {
    const result = await apiFetch("/api/coupon/bulk-qr", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const jobId = result?.jobId ?? "-";
    toast(`Bulk QR dijadwalkan (job ${jobId})`, "success");
    await loadQrOutputs();
    loadProjectOverview();
  } catch (error) {
    toast(`Gagal mengantri bulk QR: ${error.message}`, "error");
  }
};

async function loadQrOutputs() {
  const generatePath =
    state.selectedQrProject?.qrPath || $("#generatePath").value.trim();
  if (!generatePath) {
    toast("Isi path output terlebih dahulu", "warn");
    return;
  }
  try {
    const result = await apiFetch(
      `/api/coupon/qr/list?generatePath=${encodeURIComponent(generatePath)}`,
    );
    const folderList = $("#qrFolders");
    const fileList = $("#qrFiles");
    folderList.innerHTML = "";
    fileList.innerHTML = "";
    if (result.directories?.length) {
      result.directories.forEach((dir) => {
        const li = document.createElement("li");
        li.textContent = dir;
        folderList.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "Tidak ada folder";
      folderList.appendChild(li);
    }
    if (result.files?.length) {
      result.files.forEach((file) => {
        const li = document.createElement("li");
        li.textContent = file;
        fileList.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "Tidak ada file";
      fileList.appendChild(li);
    }
  } catch (error) {
    toast(`Gagal memuat output: ${error.message}`, "error");
  }
}

const handleDownloadQrZip = () => {
  const generatePath =
    state.selectedQrProject?.qrPath || $("#generatePath").value.trim();
  if (!generatePath) {
    toast("Isi path output terlebih dahulu", "warn");
    return;
  }
  window.open(
    `/api/coupon/qr/download?generatePath=${encodeURIComponent(generatePath)}`,
  );
};

const loadBackgroundPreview = () => {
  const backgroundPath = $("#backgroundPath").value.trim();
  const img = $("#backgroundPreview");
  if (!backgroundPath) {
    toast("Isi background path", "warn");
    return;
  }
  img.src = toPublicUrl(backgroundPath);
};

const updateStateFromOverlayInputs = () => {
  readOverlayInputs();
  applyOverlayStyles();
};

const updateStateFromTextInputs = () => {
  readTextInputs();
  applyOverlayStyles();
};

const getOverlayPayload = () => ({
  path: state.latestQrDataUrl || "",
  width: state.overlay.width,
  height: state.overlay.height,
  x: state.overlay.x,
  y: state.overlay.y,
  topRadius: state.overlay.topRadius,
});

const getTextPayload = () => ({
  value: state.text.value,
  size: state.text.size,
  fontFamily: state.text.fontFamily,
  color: state.text.color,
  x: state.text.x,
  y: state.text.y,
});

const handleMergePreview = async () => {
  if (!state.latestQrDataUrl) {
    toast("Buat preview QR terlebih dahulu", "warn");
    return;
  }
  const backgroundPath = $("#backgroundPath").value.trim();
  if (!backgroundPath) {
    toast("Isi background path", "warn");
    return;
  }
  try {
    const result = await apiFetch("/api/coupon/preview/merge", {
      method: "POST",
      body: JSON.stringify({
        baseImage: { path: backgroundPath },
        filename: "preview.png",
        overlayImage: getOverlayPayload(),
        pathSave: "/tmp",
        text: getTextPayload(),
      }),
    });
    if (result?.dataUrl) {
      $("#mergePreviewImage").src = result.dataUrl;
      toast("Preview merge berhasil", "success");
    }
  } catch (error) {
    toast(`Gagal membuat preview merge: ${error.message}`, "error");
  }
};

const handleQueuePostProcess = async () => {
  if (!state.selectedPostProject) {
    toast("Pilih project yang akan diproses", "warn");
    return;
  }
  const payload = {
    backgroundPath: $("#backgroundPath").value.trim(),
    qrPath: $("#qrSourcePath").value.trim(),
    qrTargetPath: $("#qrTargetPath").value.trim(),
    overlayImage: getOverlayPayload(),
    text: getTextPayload(),
  };
  if (!payload.backgroundPath || !payload.qrPath || !payload.qrTargetPath) {
    toast("Lengkapi background, qr path, dan target path", "warn");
    return;
  }
  try {
    await apiFetch("/api/coupon/post-process-qr", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    toast("Antrian post-process dibuat", "success");
    loadProjectOverview();
  } catch (error) {
    toast(`Gagal mengantri post-process: ${error.message}`, "error");
  }
};

const handleBulkProjectProcess = async () => {
  const projectPath = $("#projectPath").value.trim();
  if (!projectPath) {
    toast("Isi project path", "warn");
    return;
  }
  try {
    await apiFetch("/api/coupon/post-process-image/bulk", {
      method: "POST",
      body: JSON.stringify({
        projectPath,
        overlayImage: getOverlayPayload(),
        text: getTextPayload(),
      }),
    });
    toast("Bulk post-process dijadwalkan", "success");
  } catch (error) {
    toast(`Gagal menjalankan bulk post-process: ${error.message}`, "error");
  }
};

const pointerHandlers = () => {
  const overlay = $("#qrOverlay");
  const resizeHandle = $("#resizeHandle");
  overlay.style.touchAction = "none";

  const startPointer = (event, type) => {
    event.preventDefault();
    overlay.setPointerCapture(event.pointerId);
    state.pointer = {
      type,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOverlay: { ...state.overlay },
    };
  };

  overlay.addEventListener("pointerdown", (event) => {
    if (event.target === resizeHandle) {
      startPointer(event, "resize");
    } else {
      startPointer(event, "drag");
    }
  });

  overlay.addEventListener("pointermove", (event) => {
    if (!state.pointer || state.pointer.pointerId !== event.pointerId) {
      return;
    }
    const dxPx = event.clientX - state.pointer.startX;
    const dyPx = event.clientY - state.pointer.startY;
    const dx = dxPx / state.scale;
    const dy = dyPx / state.scale;
    if (state.pointer.type === "drag") {
      const maxX = Math.max(state.bgSize.width - state.overlay.width, 0);
      const maxY = Math.max(state.bgSize.height - state.overlay.height, 0);
      state.overlay.x = clamp(
        state.pointer.startOverlay.x + dx,
        0,
        maxX,
      );
      state.overlay.y = clamp(
        state.pointer.startOverlay.y + dy,
        0,
        maxY,
      );
    } else {
      const newWidth = clamp(
        state.pointer.startOverlay.width + dx,
        10,
        state.bgSize.width - state.overlay.x,
      );
      const newHeight = clamp(
        state.pointer.startOverlay.height + dy,
        10,
        state.bgSize.height - state.overlay.y,
      );
      state.overlay.width = newWidth;
      state.overlay.height = newHeight;
    }
    syncInputsFromState();
    applyOverlayStyles();
  });

  const endPointer = (event) => {
    if (state.pointer && state.pointer.pointerId === event.pointerId) {
      overlay.releasePointerCapture(event.pointerId);
      state.pointer = null;
    }
  };

  overlay.addEventListener("pointerup", endPointer);
  overlay.addEventListener("pointercancel", endPointer);
};

const bindInputs = () => {
  [
    "#overlayWidth",
    "#overlayHeight",
    "#overlayX",
    "#overlayY",
    "#overlayRadius",
  ].forEach((selector) => {
    $(selector).addEventListener("input", () => {
      updateStateFromOverlayInputs();
      syncInputsFromState();
    });
  });

  ["#textValue", "#textSize", "#textX", "#textY", "#textColor", "#textFont"].forEach(
    (selector) => {
      $(selector).addEventListener("input", () => {
        updateStateFromTextInputs();
        syncInputsFromState();
      });
    },
  );
};

const init = () => {
  elements.qrPreviewImage = $("#qrPreviewImage");
  $("#couponForm").addEventListener("submit", handleCouponSubmit);
  $("#refreshCouponList").addEventListener("click", refreshCouponList);
  $("#downloadCouponZip").addEventListener("click", handleCouponDownload);

  $("#previewQrBtn").addEventListener("click", handleQrPreview);
  $("#generateQrBtn").addEventListener("click", handleGenerateQr);
  $("#listQrOutputBtn").addEventListener("click", loadQrOutputs);
  $("#downloadQrZipBtn").addEventListener("click", handleDownloadQrZip);

  $("#qrProjectSelect").addEventListener("change", (event) => {
    const option = event.target.options[event.target.selectedIndex];
    setQrProjectSelection(option);
  });

  $("#postProcessProjectSelect").addEventListener("change", (event) => {
    const option = event.target.options[event.target.selectedIndex];
    setPostProcessProjectSelection(option);
  });

  $("#loadBackgroundBtn").addEventListener("click", loadBackgroundPreview);
  $("#mergePreviewBtn").addEventListener("click", handleMergePreview);
  $("#postProcessBulkBtn").addEventListener("click", handleQueuePostProcess);
  $("#postProcessBulkBtn").insertAdjacentHTML(
    "afterend",
    '<button type="button" id="projectBulkBtn" class="btn secondary">Bulk via Project Path</button>',
  );
  $("#projectBulkBtn").addEventListener("click", handleBulkProjectProcess);

  $("#refreshProjectStatus").addEventListener("click", () =>
    loadProjectOverview(true),
  );

  document.addEventListener("click", handleHistoryDownload);

  $("#backgroundPreview").addEventListener("load", () => {
    updateScaleFromBackground();
    applyOverlayStyles();
  });

  pointerHandlers();
  bindInputs();
  readOverlayInputs();
  readTextInputs();
  syncInputsFromState();
  applyOverlayStyles();
  refreshCouponList();
  loadProjectOverview();
};

document.addEventListener("DOMContentLoaded", init);
