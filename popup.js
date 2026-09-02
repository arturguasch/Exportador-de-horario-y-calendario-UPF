const SUPPORTED_UPF_ORIGINS = [
  "https://secretariavirtual.upf.edu",
  "https://gestioacademica.upf.edu"
];

const AJAX_PATHS = [
  "/pds/control/[Ajax]selecionarRangoHorarios",
  "/pds/consultaPublica/[Ajax]selecionarRangoHorarios"
];

let I18N = {};

const SUPPORTED_LANGUAGES = ["ca", "es", "en"];

function getDefaultLanguage() {
  const uiLanguage = (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage)
    ? chrome.i18n.getUILanguage()
    : "ca";

  const baseLanguage = String(uiLanguage || "ca").toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.includes(baseLanguage) ? baseLanguage : "ca";
}

async function loadLocaleMessages(language) {
  const selectedLanguage = SUPPORTED_LANGUAGES.includes(language) ? language : getDefaultLanguage();

  try {
    const response = await fetch(chrome.runtime.getURL(`_locales/${selectedLanguage}/messages.json`));
    const messages = await response.json();
    I18N = messages;
    settings.language = selectedLanguage;
  } catch (error) {
    if (selectedLanguage !== "ca") {
      await loadLocaleMessages("ca");
      return;
    }

    I18N = {};
  }
}

const DEFAULT_SETTINGS = {
  language: getDefaultLanguage(),
  themeMode: "system",
  preferredMode: "manual",
  googleCalendarName: "",
  subjectColors: {},
  subjectTypeColors: {},
  formats: {
    theory: ["subject", "room"],
    seminar: ["type", "group", "subject", "room"],
    exam: ["type", "subject", "room"],
  },
  formatBlockSettings: null,
};

const FORMAT_BLOCK_TOKENS = ["type", "subject", "room", "group"];

function createDefaultFormatBlockSetting(kind, token) {
  const defaults = { enabled: true, customText: "", prefix: "", suffix: "" };
  if (token === "group" && kind === "seminar") {
    return { ...defaults, prefix: "G:" };
  }
  return defaults;
}

function createDefaultFormatBlockSettings() {
  const settingsByKind = {};
  for (const kind of ["theory", "seminar", "exam"]) {
    settingsByKind[kind] = {};
    for (const token of FORMAT_BLOCK_TOKENS) {
      settingsByKind[kind][token] = createDefaultFormatBlockSetting(kind, token);
    }
  }
  return settingsByKind;
}

const DEFAULT_FORMAT_BLOCK_SETTINGS = createDefaultFormatBlockSettings();

const EXTENSION_VERSION = chrome.runtime.getManifest().version;
const SESSION_KEY = "upfSessionState";

function getGoogleColorPresets() {
  return window.UpfGoogleCalendar?.COLOR_PRESETS || [];
}

let settings = structuredClone(DEFAULT_SETTINGS);
let detectedSubjects = [];
let selectedSubjects = new Set();
let subjectTypeFlags = {};
const systemColorScheme = window.matchMedia("(prefers-color-scheme: dark)");

const els = {
  startDate: document.getElementById("startDate"),
  endDate: document.getElementById("endDate"),
  calendarName: document.getElementById("calendarName"),
  googleCalendarName: document.getElementById("googleCalendarName"),
  fileName: document.getElementById("fileName"),
  includeHolidays: document.getElementById("includeHolidays"),
  includeDescription: document.getElementById("includeDescription"),
  splitBySubject: document.getElementById("splitBySubject"),
  detectSubjects: document.getElementById("detectSubjects"),
  selectAllSubjects: document.getElementById("selectAllSubjects"),
  clearSubjects: document.getElementById("clearSubjects"),
  subjectsList: document.getElementById("subjectsList"),
  exportBtn: document.getElementById("exportBtn"),
  syncGoogleBtn: document.getElementById("syncGoogleBtn"),
  connectGoogleBtn: document.getElementById("connectGoogleBtn"),
  disconnectGoogleBtn: document.getElementById("disconnectGoogleBtn"),
  googleStatus: document.getElementById("googleStatus"),
  googleRedirectUri: document.getElementById("googleRedirectUri"),
  status: document.getElementById("status"),
  pageNotice: document.getElementById("pageNotice"),
  settingsBtn: document.getElementById("settingsBtn"),
  langCode: document.getElementById("langCode"),
  settingsModal: document.getElementById("settingsModal"),
  closeSettings: document.getElementById("closeSettings"),
  languageSelect: document.getElementById("languageSelect"),
  themeToggle: document.getElementById("themeToggle"),
  theoryBlocks: document.getElementById("theoryBlocks"),
  seminarBlocks: document.getElementById("seminarBlocks"),
  examBlocks: document.getElementById("examBlocks"),
  saveSettings: document.getElementById("saveSettings"),
  resetSettings: document.getElementById("resetSettings"),
  extensionVersionValue: document.getElementById("extensionVersionValue"),
  formatPreview: {
    theory: document.getElementById("theoryFormatPreview"),
    seminar: document.getElementById("seminarFormatPreview"),
    exam: document.getElementById("examFormatPreview"),
  },
  formatBlockPopover: document.getElementById("formatBlockPopover"),
  formatBlockPopoverTitle: document.getElementById("formatBlockPopoverTitle"),
  formatBlockEnabledBtn: document.getElementById("formatBlockEnabledBtn"),
  formatBlockCustomWrap: document.getElementById("formatBlockCustomWrap"),
  formatBlockCustomText: document.getElementById("formatBlockCustomText"),
  formatBlockCustomHint: document.getElementById("formatBlockCustomHint"),
  formatBlockPrefixWrap: document.getElementById("formatBlockPrefixWrap"),
  formatBlockPrefix: document.getElementById("formatBlockPrefix"),
  formatBlockSuffixWrap: document.getElementById("formatBlockSuffixWrap"),
  formatBlockSuffix: document.getElementById("formatBlockSuffix"),
  formatBlockResetBtn: document.getElementById("formatBlockResetBtn"),
  resetFormatSettingsBtn: document.getElementById("resetFormatSettingsBtn"),
  modeManualBtn: document.getElementById("modeManualBtn"),
  modeGoogleBtn: document.getElementById("modeGoogleBtn"),
  colorPalettePopover: document.getElementById("colorPalettePopover"),
  colorPaletteGrid: document.getElementById("colorPaletteGrid"),
  googleConnectStep: document.getElementById("googleConnectStep"),
  googleCalendarStep: document.getElementById("googleCalendarStep"),
  datesCard: document.getElementById("datesCard"),
  subjectsCard: document.getElementById("subjectsCard"),
};

let activeColorSubject = null;
let activeColorKind = "main";
let colorPaletteBuilt = false;
let activeFormatBlock = null;

function t(key) {
  return I18N[key]?.message || key;
}

function formatErrorMessage(error) {
  const message = String(error?.message || error || "").trim();
  if (message && I18N[message]) return t(message);
  return message;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDateInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function setDefaultDates() {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 95);
  els.startDate.value = formatDateInput(today);
  els.endDate.value = formatDateInput(end);
}

function isSupportedUpfUrl(url) {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    if (!SUPPORTED_UPF_ORIGINS.includes(parsed.origin)) return false;

    return [
      "/pds/control/",
      "/pds/consultaPublica/"
    ].some((segment) => parsed.pathname.startsWith(segment));
  } catch (error) {
    return false;
  }
}

function preferredAjaxPaths(url) {
  if (String(url || "").includes("/pds/consultaPublica/")) {
    return [AJAX_PATHS[1], AJAX_PATHS[0]];
  }

  return [AJAX_PATHS[0], AJAX_PATHS[1]];
}

function getGoogleCalendarPlaceholder() {
  return t("googleCalendarNamePlaceholder");
}

function isLegacyDefaultCalendarName(name) {
  return ["Horari UPF", "Horario UPF", "UPF Schedule"].includes((name || "").trim());
}

function getGoogleCalendarNameInputValue() {
  const stored = settings.googleCalendarName ?? "";
  return isLegacyDefaultCalendarName(stored) ? "" : stored;
}

function getResolvedGoogleCalendarName() {
  const raw = els.googleCalendarName?.value ?? settings.googleCalendarName ?? "";
  const trimmed = raw.trim();
  return trimmed || getGoogleCalendarPlaceholder();
}

function readGoogleCalendarNameFromForm() {
  const raw = els.googleCalendarName?.value ?? "";
  settings.googleCalendarName = raw;
  return getResolvedGoogleCalendarName();
}

function updateGoogleCalendarNameField() {
  if (!els.googleCalendarName) return;
  els.googleCalendarName.placeholder = getGoogleCalendarPlaceholder();
}

function setDefaultTextsForLanguage() {
  if (settings.language === "ca") {
    els.calendarName.value = "Horari UPF";
    els.fileName.value = "upf_calendari.ics";
  } else if (settings.language === "es") {
    els.calendarName.value = "Horario UPF";
    els.fileName.value = "upf_calendario.ics";
  } else {
    els.calendarName.value = "UPF Schedule";
    els.fileName.value = "upf_schedule.ics";
  }
}

function setStatus(message, type = "") {
  els.status.textContent = message || "";
  els.status.classList.toggle("hidden", !message);
  els.status.classList.toggle("error", type === "error");
}

async function persistSessionState() {
  if (!chrome.storage.session) return;

  await chrome.storage.session.set({
    [SESSION_KEY]: {
      detectedSubjects,
      selectedSubjects: [...selectedSubjects],
      startDate: els.startDate.value,
      endDate: els.endDate.value,
      includeHolidays: els.includeHolidays.checked,
      includeDescription: els.includeDescription.checked,
    },
  });
}

async function restoreSessionState() {
  if (!chrome.storage.session) return;

  const data = await chrome.storage.session.get(SESSION_KEY);
  const state = data[SESSION_KEY];
  if (!state) return;

  if (state.startDate) els.startDate.value = state.startDate;
  if (state.endDate) els.endDate.value = state.endDate;
  if (state.includeHolidays !== undefined) els.includeHolidays.checked = state.includeHolidays;
  if (state.includeDescription !== undefined) els.includeDescription.checked = state.includeDescription;

  if (Array.isArray(state.detectedSubjects) && state.detectedSubjects.length) {
    detectedSubjects = state.detectedSubjects;
    selectedSubjects = new Set(state.selectedSubjects || state.detectedSubjects);
    renderSubjects(detectedSubjects);
  }
}

function ensureSubjectColorsMap() {
  if (!settings.subjectColors || typeof settings.subjectColors !== "object") {
    settings.subjectColors = {};
  }
}

function migrateLegacySubjectColors() {
  ensureSubjectColorsMap();
  const presets = getGoogleColorPresets();
  if (!presets.length) return;

  for (const [subject, value] of Object.entries(settings.subjectColors)) {
    if (/^\d{1,2}$/.test(String(value))) {
      const index = Number(value) - 1;
      settings.subjectColors[subject] = presets[index % presets.length].id;
    }
  }
}

function assignDefaultSubjectColors(subjects) {
  ensureSubjectColorsMap();
  const presets = getGoogleColorPresets();
  if (!presets.length) return;

  let index = 0;

  for (const subject of subjects) {
    if (!settings.subjectColors[subject]) {
      settings.subjectColors[subject] = presets[index % presets.length].id;
      index += 1;
    }
  }
}

function getSubjectColorId(subject) {
  ensureSubjectColorsMap();
  return settings.subjectColors[subject] || null;
}

function ensureSubjectTypeColorsMap() {
  if (!settings.subjectTypeColors || typeof settings.subjectTypeColors !== "object") {
    settings.subjectTypeColors = {};
  }
}

function getSubjectTypeFlags(subject) {
  return subjectTypeFlags[subject] || { seminar: false, exam: false };
}

function ensureSubjectTypeSetting(subject, kind) {
  ensureSubjectTypeColorsMap();
  if (!settings.subjectTypeColors[subject]) {
    settings.subjectTypeColors[subject] = {
      seminar: { enabled: false, color: null },
      exam: { enabled: false, color: null },
    };
  }
  if (!settings.subjectTypeColors[subject][kind]) {
    settings.subjectTypeColors[subject][kind] = { enabled: false, color: null };
  }
  return settings.subjectTypeColors[subject][kind];
}

function buildSubjectTypeFlags(items) {
  const flags = {};

  for (const item of items) {
    if (!shouldExport(item, false)) continue;

    const subject = normalizeSubject(item);
    if (!subject) continue;

    if (!flags[subject]) {
      flags[subject] = { seminar: false, exam: false };
    }

    const key = typeKey(item);
    if (key === "seminar") flags[subject].seminar = true;
    if (key === "exam") flags[subject].exam = true;
  }

  return flags;
}

function pickDefaultAltColor(subject, kind) {
  const presets = getGoogleColorPresets();
  if (!presets.length) return null;

  ensureSubjectColorsMap();
  const mainId = settings.subjectColors[subject];
  const mainIndex = Math.max(0, presets.findIndex((preset) => preset.id === mainId));
  const offset = kind === "seminar" ? 5 : 10;

  return presets[(mainIndex + offset) % presets.length].id;
}

function assignDefaultTypeColors(subjects) {
  for (const subject of subjects) {
    const flags = getSubjectTypeFlags(subject);

    if (flags.seminar) {
      const seminar = ensureSubjectTypeSetting(subject, "seminar");
      if (!seminar.color) seminar.color = pickDefaultAltColor(subject, "seminar");
    }

    if (flags.exam) {
      const exam = ensureSubjectTypeSetting(subject, "exam");
      if (!exam.color) exam.color = pickDefaultAltColor(subject, "exam");
    }
  }
}

function getColorIdForTarget(subject, kind = "main") {
  if (kind === "main") {
    return getSubjectColorId(subject);
  }

  const setting = ensureSubjectTypeSetting(subject, kind);
  return setting.color || pickDefaultAltColor(subject, kind);
}

function setColorForTarget(subject, kind, colorId) {
  if (kind === "main") {
    settings.subjectColors[subject] = colorId;
    return;
  }

  const setting = ensureSubjectTypeSetting(subject, kind);
  setting.color = colorId;
}

function getEventColorId(item) {
  const subject = normalizeSubject(item);
  if (!subject) return null;

  const key = typeKey(item);
  if (key === "seminar") {
    const seminar = ensureSubjectTypeSetting(subject, "seminar");
    if (seminar.enabled && seminar.color) return seminar.color;
  }

  if (key === "exam") {
    const exam = ensureSubjectTypeSetting(subject, "exam");
    if (exam.enabled && exam.color) return exam.color;
  }

  return getSubjectColorId(subject);
}

function setMode(mode, persist = true) {
  const next = mode === "google" ? "google" : "manual";
  settings.preferredMode = next;
  document.body.classList.toggle("mode-manual", next === "manual");
  document.body.classList.toggle("mode-google", next === "google");

  if (els.modeManualBtn) {
    els.modeManualBtn.setAttribute("aria-pressed", next === "manual" ? "true" : "false");
  }
  if (els.modeGoogleBtn) {
    els.modeGoogleBtn.setAttribute("aria-pressed", next === "google" ? "true" : "false");
  }

  if (next === "manual") {
    closeColorPalette();
  }

  if (detectedSubjects.length) {
    renderSubjects(detectedSubjects, true);
  }

  updateGoogleSteps();

  if (persist) {
    saveSettingsData();
  }
}

function getSubjectColorPreset(subject, kind = "main") {
  const presets = getGoogleColorPresets();
  if (!presets.length) return null;

  const selectedId = getColorIdForTarget(subject, kind);
  return presets.find((preset) => preset.id === selectedId) || presets[0];
}

function buildColorPaletteGrid() {
  if (colorPaletteBuilt || !els.colorPaletteGrid) return;

  const presets = getGoogleColorPresets();
  els.colorPaletteGrid.textContent = "";

  for (const color of presets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "palette-swatch";
    button.style.backgroundColor = color.hex;
    button.dataset.colorId = color.id;
    button.setAttribute("aria-label", color.hex);
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!activeColorSubject) return;

      setColorForTarget(activeColorSubject, activeColorKind, color.id);
      await saveSettingsData();
      closeColorPalette();
      renderSubjects(detectedSubjects, true);
    });
    els.colorPaletteGrid.append(button);
  }

  colorPaletteBuilt = true;
}

function updatePaletteSelection(selectedId) {
  if (!els.colorPaletteGrid) return;

  els.colorPaletteGrid.querySelectorAll(".palette-swatch").forEach((button) => {
    button.classList.toggle("selected", button.dataset.colorId === selectedId);
  });
}

function positionColorPalette(anchor) {
  if (!els.colorPalettePopover || !anchor) return;

  const margin = 8;
  const rect = anchor.getBoundingClientRect();
  const popoverWidth = els.colorPalettePopover.offsetWidth;
  const popoverHeight = els.colorPalettePopover.offsetHeight;

  let left = rect.right - popoverWidth;
  let top = rect.bottom + 6;

  left = Math.max(margin, Math.min(left, window.innerWidth - popoverWidth - margin));
  if (top + popoverHeight > window.innerHeight - margin) {
    top = rect.top - popoverHeight - 6;
  }
  top = Math.max(margin, top);

  els.colorPalettePopover.style.left = `${left}px`;
  els.colorPalettePopover.style.top = `${top}px`;
}

function openColorPalette(subject, anchor, kind = "main") {
  if (!document.body.classList.contains("mode-google")) return;

  buildColorPaletteGrid();
  if (!els.colorPalettePopover) return;

  if (
    activeColorSubject === subject &&
    activeColorKind === kind &&
    !els.colorPalettePopover.classList.contains("hidden")
  ) {
    closeColorPalette();
    return;
  }

  activeColorSubject = subject;
  activeColorKind = kind;
  updatePaletteSelection(getColorIdForTarget(subject, kind) || getGoogleColorPresets()[0]?.id);

  els.colorPalettePopover.classList.remove("hidden");
  els.colorPalettePopover.setAttribute("aria-hidden", "false");
  anchor.setAttribute("aria-expanded", "true");

  document.querySelectorAll(".color-picker-trigger[aria-expanded='true']").forEach((trigger) => {
    if (trigger !== anchor) trigger.setAttribute("aria-expanded", "false");
  });

  requestAnimationFrame(() => positionColorPalette(anchor));
}

function closeColorPalette() {
  activeColorSubject = null;
  activeColorKind = "main";

  if (els.colorPalettePopover) {
    els.colorPalettePopover.classList.add("hidden");
    els.colorPalettePopover.setAttribute("aria-hidden", "true");
  }

  document.querySelectorAll(".color-picker-trigger[aria-expanded='true']").forEach((trigger) => {
    trigger.setAttribute("aria-expanded", "false");
  });
}

function createColorPickerTrigger(subject, kind = "main") {
  const preset = getSubjectColorPreset(subject, kind);
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "color-picker-trigger";
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", t("googlePickColor"));

  const swatch = document.createElement("span");
  swatch.className = "color-picker-swatch";
  swatch.style.backgroundColor = preset?.hex || "#616161";

  const chevron = document.createElement("span");
  chevron.className = "color-picker-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "▾";

  trigger.append(swatch, chevron);
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openColorPalette(subject, trigger, kind);
  });

  return trigger;
}

function createSubjectCheckbox(subject) {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = selectedSubjects.has(subject);
  checkbox.addEventListener("click", (event) => event.stopPropagation());
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) selectedSubjects.add(subject);
    else selectedSubjects.delete(subject);
    persistSessionState();
  });
  return checkbox;
}

function fillSubjectTypeColorSlot(slot, subject, kind, enabled) {
  slot.replaceChildren();
  if (enabled) {
    slot.append(createColorPickerTrigger(subject, kind));
  }
}

function createSubjectTypeToggle(subject, kind, colorSlot) {
  const setting = ensureSubjectTypeSetting(subject, kind);
  const toggleId = `type-color-${kind}-${safeFilePart(subject)}`;

  const toggleRow = document.createElement("label");
  toggleRow.className = "switch-row switch-row-compact subject-type-toggle";
  toggleRow.setAttribute("for", toggleId);
  toggleRow.addEventListener("click", (event) => event.stopPropagation());

  const toggleLabel = document.createElement("span");
  toggleLabel.className = "switch-label";
  toggleLabel.textContent = t("googleAltColorToggle");

  const toggleSwitch = document.createElement("span");
  toggleSwitch.className = "toggle-switch compact";

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.id = toggleId;
  toggle.role = "switch";
  toggle.checked = setting.enabled;
  toggle.addEventListener("click", (event) => event.stopPropagation());
  toggle.addEventListener("change", async () => {
    setting.enabled = toggle.checked;
    if (setting.enabled && !setting.color) {
      setting.color = pickDefaultAltColor(subject, kind);
    }
    fillSubjectTypeColorSlot(colorSlot, subject, kind, setting.enabled);
    await saveSettingsData();
  });

  const slider = document.createElement("span");
  slider.className = "toggle-slider";
  slider.setAttribute("aria-hidden", "true");

  toggleSwitch.append(toggle, slider);
  toggleRow.append(toggleLabel, toggleSwitch);
  return toggleRow;
}

function createSubjectTypeRow(subject, kind) {
  const setting = ensureSubjectTypeSetting(subject, kind);
  const row = document.createElement("div");
  row.className = "subject-type-row";

  const label = document.createElement("span");
  label.className = "subject-type-label";
  label.textContent = t(kind === "seminar" ? "googleColorSeminar" : "googleColorExam");

  const colorSlot = document.createElement("div");
  colorSlot.className = "subject-type-color-slot";
  fillSubjectTypeColorSlot(colorSlot, subject, kind, setting.enabled);

  row.append(label, createSubjectTypeToggle(subject, kind, colorSlot), colorSlot);

  return row;
}

function createSubjectMainRow(subject, { expandButton = null } = {}) {
  const row = document.createElement("div");
  row.className = "subject-row";

  const name = document.createElement("div");
  name.className = "subject-name";
  name.textContent = subject;

  row.append(createSubjectCheckbox(subject), name);

  if (document.body.classList.contains("mode-google")) {
    row.append(createColorPickerTrigger(subject, "main"));
  }

  if (expandButton) {
    row.append(expandButton);
  }

  return row;
}

function createExpandableSubjectCard(subject, flags, open = false) {
  const card = document.createElement("details");
  card.className = "subject-card";
  card.open = open;

  const expandBtn = document.createElement("button");
  expandBtn.type = "button";
  expandBtn.className = "subject-expand-btn";
  expandBtn.setAttribute("aria-label", t("googleExpandSubjectTypes"));
  expandBtn.setAttribute("aria-expanded", open ? "true" : "false");

  const expandIcon = document.createElement("span");
  expandIcon.className = "subject-expand-icon";
  expandIcon.setAttribute("aria-hidden", "true");
  expandIcon.textContent = "▾";
  expandBtn.append(expandIcon);

  expandBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    card.open = !card.open;
    expandBtn.setAttribute("aria-expanded", card.open ? "true" : "false");
  });

  card.addEventListener("toggle", () => {
    expandBtn.setAttribute("aria-expanded", card.open ? "true" : "false");
  });

  const summary = document.createElement("summary");
  summary.className = "subject-summary";
  summary.append(createSubjectMainRow(subject, { expandButton: expandBtn }));

  const panel = document.createElement("div");
  panel.className = "subject-type-panel";
  if (flags.seminar) panel.append(createSubjectTypeRow(subject, "seminar"));
  if (flags.exam) panel.append(createSubjectTypeRow(subject, "exam"));

  card.append(summary, panel);
  return card;
}

function updateGoogleSteps() {
  const connected = els.googleStatus?.classList.contains("connected");
  const hasDates = Boolean(els.startDate?.value && els.endDate?.value);

  els.googleConnectStep?.classList.toggle("step-done", Boolean(connected));
  els.googleCalendarStep?.classList.toggle("step-done", Boolean(connected));
  els.datesCard?.classList.toggle("step-done", hasDates);
  els.subjectsCard?.classList.toggle("step-done", detectedSubjects.length > 0);
}

function updateGoogleUI(email) {
  const connected = Boolean(email);

  els.connectGoogleBtn.classList.toggle("hidden", connected);
  els.disconnectGoogleBtn.classList.toggle("hidden", !connected);
  els.syncGoogleBtn.classList.toggle("hidden", !connected);

  els.googleStatus.classList.toggle("connected", connected);
  els.googleStatus.classList.toggle("disconnected", !connected);
  els.googleStatus.textContent = connected
    ? `${t("googleConnectedAs")} ${email}`
    : t("googleNotConnected");

  updateGoogleSteps();
}

async function checkGoogleConnection() {
  const stored = await window.UpfGoogleCalendar.getStoredConnection();
  if (!stored?.email) {
    updateGoogleUI(null);
    return;
  }

  try {
    const token = await window.UpfGoogleCalendar.getAuthToken(false);
    const email = await window.UpfGoogleCalendar.getUserEmail(token);
    updateGoogleUI(email);
  } catch (error) {
    updateGoogleUI(null);
    try {
      await window.UpfGoogleCalendar.disconnectGoogle();
    } catch (disconnectError) {
      console.warn(disconnectError);
    }
  }
}

function updateGoogleSetupHint() {
  if (!els.googleRedirectUri) return;
  els.googleRedirectUri.classList.add("hidden");
  els.googleRedirectUri.textContent = "";
}

function showGoogleRedirectHint(redirectUrl) {
  if (!els.googleRedirectUri) return;
  els.googleRedirectUri.classList.remove("hidden");
  els.googleRedirectUri.textContent = `${t("googleRedirectUri")}: ${redirectUrl}`;
}

async function connectGoogle() {
  els.connectGoogleBtn.disabled = true;
  setStatus(t("googleConnecting"));

  try {
    const email = await window.UpfGoogleCalendar.connectGoogle();
    updateGoogleUI(email);
    setStatus(t("googleConnected"));
  } catch (error) {
    console.error(error);
    const redirectUrl = window.UpfGoogleCalendar.getRedirectUrl();
    const message = String(error.message || error);
    if (message.includes("redirect_uri_mismatch")) {
      showGoogleRedirectHint(redirectUrl);
      setStatus(
        `${t("googleRedirectMismatch")}\n` +
        `${t("googleRedirectUri")}: ${redirectUrl}\n` +
        t("googleRedirectSteps"),
        "error"
      );
    } else {
      setStatus(`${t("error")}: ${formatErrorMessage(error)}`, "error");
    }
  } finally {
    els.connectGoogleBtn.disabled = false;
  }
}

async function disconnectGoogle() {
  els.disconnectGoogleBtn.disabled = true;

  try {
    await window.UpfGoogleCalendar.disconnectGoogle();
    updateGoogleUI(null);
    setStatus(t("googleDisconnected"));
  } catch (error) {
    console.error(error);
    setStatus(`${t("error")}: ${formatErrorMessage(error)}`, "error");
  } finally {
    els.disconnectGoogleBtn.disabled = false;
  }
}

async function syncGoogleCalendar() {
  saveOrderFromContainer("theory");
  saveOrderFromContainer("seminar");
  saveOrderFromContainer("exam");
  readGoogleCalendarNameFromForm();
  await saveSettingsData();

  els.syncGoogleBtn.disabled = true;
  setStatus(t("googleSyncing"));

  try {
    validateForm();
    setStatus(t("reading"));
    const items = await readItemsFromUpf();
    selectedSubjectsForExport(items);

    const calendarName = readGoogleCalendarNameFromForm();

    const result = await window.UpfGoogleCalendar.syncEvents(items, {
      shouldExport,
      normalizeSubject,
      makeUid,
      buildCleanSummary,
      buildDescription,
      parseUpfDateTime,
      includeHolidays: els.includeHolidays.checked,
      includeDescription: els.includeDescription.checked,
      selectedSubjects,
      getSubjectColorId,
      getEventColorId,
      calendarName,
    });

    setStatus(
      `${t("googleSyncDone")}\n` +
      `${t("googleCalendarUsed")}: ${result.calendarName}\n` +
      (result.calendarCreated ? `${t("googleCalendarCreated")}\n` : "") +
      `${t("googleCreated")}: ${result.created}\n` +
      `${t("googleUpdated")}: ${result.updated}\n` +
      `${t("ignored")}: ${result.skipped}` +
      (result.deleted ? `\n${t("googleDeleted")}: ${result.deleted}` : "") +
      (result.failed ? `\n${t("googleFailed")}: ${result.failed}` : "")
    );
  } catch (error) {
    console.error(error);
    setStatus(`${t("error")}: ${formatErrorMessage(error)}`, "error");
  } finally {
    els.syncGoogleBtn.disabled = false;
  }
}

function htmlDecode(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value ?? "";
  return textarea.value.trim();
}

function clean(value) {
  if (value === undefined || value === null) return "";
  return htmlDecode(String(value)).trim();
}

function normalizeSubject(item) {
  return clean(item.title).replace(/\s+/g, " ").trim();
}

function typeKey(item) {
  const type = clean(item.tipologia).toLowerCase();
  if (type.includes("semin")) return "seminar";
  if (type.includes("examen") || type.includes("exam")) return "exam";
  return "theory";
}

function typeLabel(item) {
  const key = typeKey(item);

  const labels = {
    ca: { theory: "TEORIA", seminar: "SEMINARI", exam: "EXAMEN" },
    es: { theory: "TEORÍA", seminar: "SEMINARIO", exam: "EXAMEN" },
    en: { theory: "THEORY", seminar: "SEMINAR", exam: "EXAM" },
  };

  return (labels[settings.language] || labels.ca)[key] || labels.ca[key];
}

function tokenLabel(token, kind) {
  const labels = {
    ca: { type: kind === "theory" ? "TEORIA" : kind === "seminar" ? "SEMINARI" : "EXAMEN", subject: "Assignatura", room: "Aula", group: "Grup" },
    es: { type: kind === "theory" ? "TEORÍA" : kind === "seminar" ? "SEMINARIO" : "EXAMEN", subject: "Asignatura", room: "Aula", group: "Grupo" },
    en: { type: kind === "theory" ? "THEORY" : kind === "seminar" ? "SEMINAR" : "EXAM", subject: "Subject", room: "Room", group: "Group" },
  };
  return (labels[settings.language] || labels.ca)[token] || token;
}

function formatPreviewTypeLabel(kind) {
  const tipologia = kind === "seminar" ? "seminari" : kind === "exam" ? "examen" : "teoria";
  return typeLabel({ tipologia });
}

const FORMAT_PREVIEW_SAMPLES = {
  ca: {
    theory: { subject: "Gestió Pública", room: "40.248", group: "" },
    seminar: { subject: "Gestió Pública", room: "13.002", group: "102" },
    exam: { subject: "Teoria Política I", room: "40.250", group: "" },
  },
  es: {
    theory: { subject: "Gestión Pública", room: "40.248", group: "" },
    seminar: { subject: "Gestión Pública", room: "13.002", group: "102" },
    exam: { subject: "Teoría Política I", room: "40.250", group: "" },
  },
  en: {
    theory: { subject: "Public Management", room: "40.248", group: "" },
    seminar: { subject: "Public Management", room: "13.002", group: "102" },
    exam: { subject: "Political Theory I", room: "40.250", group: "" },
  },
};

function normalizeFormatInputText(value) {
  return String(value ?? "").trim();
}

function normalizeFormatBlockSettings(incoming) {
  const normalized = createDefaultFormatBlockSettings();
  const source = incoming || {};

  for (const kind of ["theory", "seminar", "exam"]) {
    for (const token of FORMAT_BLOCK_TOKENS) {
      const stored = source?.[kind]?.[token];
      if (!stored || typeof stored !== "object") continue;
      normalized[kind][token] = {
        ...createDefaultFormatBlockSetting(kind, token),
        enabled: stored.enabled !== false,
        customText: normalizeFormatInputText(stored.customText),
      };
      if (stored.prefix !== undefined) {
        normalized[kind][token].prefix = normalizeFormatInputText(stored.prefix);
      }
      if (stored.suffix !== undefined) {
        normalized[kind][token].suffix = normalizeFormatInputText(stored.suffix);
      }
    }
  }

  return normalized;
}

function ensureFormatBlockSettings() {
  if (!settings.formatBlockSettings) {
    settings.formatBlockSettings = createDefaultFormatBlockSettings();
  }
  settings.formatBlockSettings = normalizeFormatBlockSettings(settings.formatBlockSettings);
}

function getFormatBlockSetting(kind, token) {
  ensureFormatBlockSettings();
  return settings.formatBlockSettings[kind][token];
}

function combinePrefixSuffix(value, prefix, suffix) {
  let result = value || "";
  const pre = normalizeFormatInputText(prefix);
  const suf = normalizeFormatInputText(suffix);

  if (pre) {
    result = /[\s:]$/.test(pre) || !result ? `${pre}${result}` : `${pre} ${result}`;
  }
  if (suf) {
    result = /^[\s:]/.test(suf) || !result ? `${result}${suf}` : `${result} ${suf}`;
  }

  return result.trim();
}

function resolveFormatGroupValue(rawGroup, kind) {
  const config = getFormatBlockSetting(kind, "group");
  if (!config.enabled) return "";

  let value = clean(rawGroup);
  if (!value) return "";

  const prefix = normalizeFormatInputText(config.prefix);
  if (prefix && kind === "seminar") {
    if (!/^g\s*:/i.test(value)) {
      const normalized = prefix.endsWith(":") ? prefix : `${prefix}:`;
      value = `${normalized} ${value}`;
    }
  } else if (prefix) {
    value = combinePrefixSuffix(value, prefix, "");
  }

  return combinePrefixSuffix(value, "", config.suffix);
}

function getFormatBlockFieldVisibility(kind, token) {
  if (token === "subject" || token === "room" || token === "group") {
    return { customText: false, prefix: true, suffix: true };
  }
  if (token === "type" && kind === "exam") {
    return { customText: true, prefix: false, suffix: false };
  }
  if (token === "type" && kind === "seminar") {
    return { customText: true, prefix: true, suffix: false };
  }
  return { customText: true, prefix: true, suffix: true };
}

function resolveFormatTokenValue(token, rawValue, kind, typeLabelStr) {
  const config = getFormatBlockSetting(kind, token);
  if (!config.enabled) return "";

  const visibility = getFormatBlockFieldVisibility(kind, token);
  const custom = visibility.customText ? normalizeFormatInputText(config.customText) : "";
  if (custom) return custom;

  if (token === "group") return resolveFormatGroupValue(rawValue, kind);

  let value = token === "type" ? typeLabelStr : clean(rawValue);
  if (!value) return "";

  const prefix = visibility.prefix ? config.prefix : "";
  const suffix = visibility.suffix ? config.suffix : "";
  return combinePrefixSuffix(value, prefix, suffix);
}

function getFormatPreviewSample(kind) {
  const samples = FORMAT_PREVIEW_SAMPLES[settings.language] || FORMAT_PREVIEW_SAMPLES.ca;
  return samples[kind];
}

function getTokensFromContainer(kind) {
  const container = getBlockContainer(kind);
  if (!container) return settings.formats[kind] || DEFAULT_SETTINGS.formats[kind];
  const tokens = [...container.querySelectorAll(".block-item")].map((item) => item.dataset.token);
  return tokens.length ? tokens : settings.formats[kind] || DEFAULT_SETTINGS.formats[kind];
}

function buildFormatPreviewTitle(kind, tokens) {
  const sample = getFormatPreviewSample(kind);
  const type = formatPreviewTypeLabel(kind);
  return buildTitleFromTokens(sample.subject, sample.room, type, tokens, sample.group, kind);
}

function buildTitleFromTokens(subject, room, type, tokens, group = "", kind = "theory") {
  const values = {
    type: resolveFormatTokenValue("type", "", kind, type),
    subject: resolveFormatTokenValue("subject", subject, kind, type),
    room: resolveFormatTokenValue("room", room, kind, type),
    group: resolveFormatGroupValue(group, kind),
  };
  const cleanTokens = (Array.isArray(tokens) && tokens.length ? tokens : ["subject", "room"])
    .filter((token) => getFormatBlockSetting(kind, token).enabled)
    .filter((token) => values[token]);

  const roomIndex = cleanTokens.indexOf("room");

  if (roomIndex === -1) {
    return cleanTokens.map((token) => values[token]).join(" ").trim();
  }

  const before = cleanTokens.slice(0, roomIndex).map((token) => values[token]).join(" ").trim();
  const after = cleanTokens.slice(roomIndex + 1).map((token) => values[token]).join(" ").trim();
  const formattedRoom = values.room;

  if (before && after) return `${before} | ${formattedRoom} | ${after}`;
  if (before) return `${before} | ${formattedRoom}`;
  if (after) return `${formattedRoom} | ${after}`;
  return formattedRoom;
}

function buildCleanSummary(item) {
  const subject = normalizeSubject(item);
  const room = clean(item.aula);
  const key = typeKey(item);
  const group = clean(item.grup);
  const tokens = settings.formats[key] || DEFAULT_SETTINGS.formats[key];
  return buildTitleFromTokens(subject, room, typeLabel(item), tokens, group, key);
}

function buildDescription(item) {
  const lines = [];
  const aula = clean(item.aula);
  const edificio = clean(item.descEdificio);
  const grupo = clean(item.grup);
  const tipo = clean(item.tipologia);
  const observacion = clean(item.observacion);
  const comentario = clean(item.comentario);

  if (tipo) lines.push(`${t("descriptionType")}: ${tipo}`);
  if (grupo) lines.push(`${t("descriptionGroup")}: ${grupo}`);
  if (aula) lines.push(`${t("descriptionRoom")}: ${aula}`);
  if (edificio) lines.push(`${t("descriptionBuilding")}: ${edificio}`);
  if (observacion) lines.push(`${t("descriptionObservation")}: ${observacion}`);
  if (comentario) lines.push(`${t("descriptionComment")}: ${comentario}`);

  return lines.join("\n");
}

const MADRID_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Madrid",
  "X-LIC-LOCATION:Europe/Madrid",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function lastSunday(year, monthIndex) {
  const date = new Date(year, monthIndex + 1, 0);
  while (date.getDay() !== 0) date.setDate(date.getDate() - 1);
  return date;
}

function parseUpfDateTimeParts(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const [datePart, timePart = "00:00:00"] = raw.split(/\s+/);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;

  const [year, month, day] = datePart.split("-").map(Number);
  const timeBits = timePart.split(":");
  const hour = Number(timeBits[0] || 0);
  const minute = Number(timeBits[1] || 0);
  const second = Number(timeBits[2] || 0);

  if (!year || !month || !day) return null;
  if ([hour, minute, second].some((n) => Number.isNaN(n))) return null;

  return { year, month, day, hour, minute, second };
}

function madridOffsetHoursForParts(year, month, day, hour, minute, second = 0) {
  const probe = new Date(year, month - 1, day, hour, minute, second, 0);
  const y = probe.getFullYear();
  const dstStart = lastSunday(y, 2);
  dstStart.setHours(2, 0, 0, 0);
  const dstEnd = lastSunday(y, 9);
  dstEnd.setHours(3, 0, 0, 0);
  return probe >= dstStart && probe < dstEnd ? 2 : 1;
}

function parseUpfDateTime(value) {
  return parseUpfDateTimeParts(value);
}

function icsDateTimeFromParts(parts) {
  return [
    parts.year,
    pad(parts.month),
    pad(parts.day),
    "T",
    pad(parts.hour),
    pad(parts.minute),
    pad(parts.second),
  ].join("");
}

function dateToMadridTimestamp(dateText, endOfDay = false) {
  const [year, month, day] = dateText.split("-").map(Number);
  const hour = endOfDay ? 23 : 0;
  const minute = endOfDay ? 59 : 0;
  const second = endOfDay ? 59 : 0;
  const offset = madridOffsetHoursForParts(year, month, day, hour, minute, second);
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offset * 60 * 60 * 1000;
  return Math.floor(utcMs / 1000);
}

function icsUtcDateTime(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsEscape(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\n");
}

function foldIcsLine(line) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts = [];
  let current = "";
  let currentLength = 0;

  for (const char of line) {
    const charLength = encoder.encode(char).length;
    if (currentLength + charLength > 75) {
      parts.push(current);
      current = " " + char;
      currentLength = 1 + charLength;
    } else {
      current += char;
      currentLength += charLength;
    }
  }

  if (current) parts.push(current);
  return parts.join("\r\n");
}

function makeUid(item) {
  const raw = [
    "upf",
    clean(item.codAsignatura),
    clean(item.reseId),
    clean(item.blocID),
    clean(item.start).replace(/\s+/g, "T"),
    clean(item.aula).replace(/\s+/g, "_"),
  ].join("-");

  const safe = raw.replace(/[^a-zA-Z0-9_.@-]/g, "-");
  return `${safe}@upf-calendar-exporter`;
}

function shouldExport(item, includeHolidays) {
  if ("mostrarMensaje" in item) return false;
  if (!item.start || !item.end) return false;
  if (item.festivoNoLectivo === true && !includeHolidays) return false;
  if (!clean(item.title)) return false;
  return true;
}

function createIcs(items, options) {
  const now = new Date();
  const prodIdLang = { ca: "CA", es: "ES", en: "EN" }[options.language || settings.language] || "CA";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Calendar exporter for UPF//${prodIdLang}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(options.calendarName)}`,
    "X-WR-TIMEZONE:Europe/Madrid",
    ...MADRID_VTIMEZONE,
  ];

  let exported = 0;
  const sorted = [...items].sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")));

  for (const item of sorted) {
    if (!shouldExport(item, options.includeHolidays)) continue;

    const subject = normalizeSubject(item);
    if (options.subjectFilter && subject !== options.subjectFilter) continue;
    if (options.selectedSubjects?.size && !options.selectedSubjects.has(subject)) continue;

    const startParts = parseUpfDateTimeParts(item.start);
    const endParts = parseUpfDateTimeParts(item.end);
    if (!startParts || !endParts) continue;

    const summary = buildCleanSummary(item);
    if (!summary.trim()) continue;

    const description = buildDescription(item);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${icsEscape(makeUid(item))}`);
    lines.push(`DTSTAMP:${icsUtcDateTime(now)}`);
    lines.push(`DTSTART;TZID=Europe/Madrid:${icsDateTimeFromParts(startParts)}`);
    lines.push(`DTEND;TZID=Europe/Madrid:${icsDateTimeFromParts(endParts)}`);
    lines.push(`SUMMARY:${icsEscape(summary)}`);

    if (options.includeDescription && description) {
      lines.push(`DESCRIPTION:${icsEscape(description)}`);
    }

    lines.push("END:VEVENT");
    exported += 1;
  }

  lines.push("END:VCALENDAR");

  return {
    ics: lines.map(foldIcsLine).join("\r\n") + "\r\n",
    exported,
    ignored: items.length - exported,
    received: items.length,
  };
}

function safeFilePart(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replaceAll(" ", "_")
    .slice(0, 90) || "materia";
}

function baseFileName(value) {
  const name = value.trim() || "upf_calendari.ics";
  return name.toLowerCase().endsWith(".ics") ? name.slice(0, -4) : name;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function checkCurrentPage() {
  const tab = await getActiveTab();

  if (!isSupportedUpfUrl(tab?.url)) {
    els.pageNotice.innerHTML = t("pageNotUpf");
    els.pageNotice.className = "notice error";
    return false;
  }

  els.pageNotice.textContent = t("pageUpf");
  els.pageNotice.className = "notice ok";
  return true;
}

async function fetchEventsFromPage(tabId, ajaxPaths, startTimestamp, endTimestamp) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    args: [ajaxPaths, startTimestamp, endTimestamp],
    func: async (candidatePaths, start, end) => {
      const errors = [];

      for (const ajaxPath of candidatePaths) {
        try {
          const rnd = `${Math.floor(Math.random() * 9000) + 1000}.0`;
          const url = `${location.origin}${ajaxPath}?rnd=${encodeURIComponent(rnd)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;

          const response = await fetch(url, {
            method: "GET",
            credentials: "include",
            headers: {
              "Accept": "application/json, text/javascript, */*; q=0.01",
              "X-Requested-With": "XMLHttpRequest"
            }
          });

          const text = await response.text();

          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          if (text.trim().startsWith("<")) return { __upfError: "errorUpfHtml" };

          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) return parsed;

          throw new Error("errorUpfNotArray");
        } catch (error) {
          errors.push(`${ajaxPath} -> ${error.message || error}`);
        }
      }

      return { __upfError: "errorUpfFetchFailed", details: errors.join(" | ") };
    }
  });

  if (result?.__upfError) {
    throw new Error(result.__upfError);
  }

  if (!Array.isArray(result)) throw new Error("errorUpfNotArray");
  return result;
}

async function downloadIcs(ics, fileName) {
  const safeFileName = fileName.toLowerCase().endsWith(".ics") ? fileName : `${fileName}.ics`;
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  await chrome.downloads.download({
    url,
    filename: safeFileName,
    saveAs: true,
  });

  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function validateForm() {
  if (!els.startDate.value || !els.endDate.value) throw new Error(t("errorDates"));
  if (els.endDate.value < els.startDate.value) throw new Error(t("errorDateOrder"));
  setDefaultTextsForLanguage();
}

function collectOpenSubjectCards() {
  const open = new Set();

  els.subjectsList?.querySelectorAll("details.subject-card[open]").forEach((card) => {
    const name = card.querySelector(".subject-name")?.textContent?.trim();
    if (name) open.add(name);
  });

  return open;
}

function renderSubjects(subjects, preserveEmptySelection = false) {
  detectedSubjects = subjects;
  if (!selectedSubjects.size && !preserveEmptySelection) selectedSubjects = new Set(subjects);

  if (!subjects.length) {
    els.subjectsList.className = "subjects-empty";
    els.subjectsList.textContent = t("noSubjectsInRange");
    return;
  }

  const openCards = collectOpenSubjectCards();

  els.subjectsList.className = "subjects-list";
  els.subjectsList.textContent = "";

  subjects.forEach((subject) => {
    const flags = getSubjectTypeFlags(subject);
    const isGoogle = document.body.classList.contains("mode-google");
    const hasTypeOptions = isGoogle && (flags.seminar || flags.exam);

    if (hasTypeOptions) {
      els.subjectsList.append(createExpandableSubjectCard(subject, flags, openCards.has(subject)));
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "subject-card subject-card-simple";
    wrapper.append(createSubjectMainRow(subject));
    els.subjectsList.append(wrapper);
  });

  updateGoogleSteps();
}

async function readItemsFromUpf() {
  const tab = await getActiveTab();
  if (!tab?.id || !isSupportedUpfUrl(tab?.url)) {
    throw new Error(t("errorOpenUpf"));
  }

  const startTimestamp = dateToMadridTimestamp(els.startDate.value);
  const endTimestamp = dateToMadridTimestamp(els.endDate.value, true);
  const ajaxPaths = preferredAjaxPaths(tab.url);
  return fetchEventsFromPage(tab.id, ajaxPaths, startTimestamp, endTimestamp);
}

async function detectSubjects() {
  els.detectSubjects.disabled = true;
  setStatus(t("detecting"));

  try {
    validateForm();
    const items = await readItemsFromUpf();
    subjectTypeFlags = buildSubjectTypeFlags(items);

    const subjects = [...new Set(
      items
        .filter((item) => shouldExport(item, els.includeHolidays.checked))
        .map(normalizeSubject)
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    selectedSubjects = new Set(subjects);
    assignDefaultSubjectColors(subjects);
    assignDefaultTypeColors(subjects);
    renderSubjects(subjects);
    await saveSettingsData();
    await persistSessionState();
    setStatus(`${t("subjectsDetected")}: ${subjects.length}`);
  } catch (error) {
    console.error(error);
    setStatus(`${t("error")}: ${formatErrorMessage(error)}`, "error");
  } finally {
    els.detectSubjects.disabled = false;
  }
}

function selectedSubjectsForExport(items) {
  const allInItems = [...new Set(
    items
      .filter((item) => shouldExport(item, els.includeHolidays.checked))
      .map(normalizeSubject)
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  if (!detectedSubjects.length) {
    detectedSubjects = allInItems;
    selectedSubjects = new Set(allInItems);
    renderSubjects(allInItems);
  }

  if (!selectedSubjects.size) throw new Error(t("errorNoSubjectsSelected"));

  return [...selectedSubjects].filter((subject) => allInItems.includes(subject));
}

async function exportCalendar() {
  saveOrderFromContainer("theory");
  saveOrderFromContainer("seminar");
  saveOrderFromContainer("exam");
  await saveSettingsData();

  els.exportBtn.disabled = true;
  setStatus(t("preparing"));

  try {
    validateForm();

    setStatus(t("reading"));
    const items = await readItemsFromUpf();
    const subjects = selectedSubjectsForExport(items);

    if (els.splitBySubject.checked) {
      let totalExported = 0;
      const base = baseFileName(els.fileName.value);

      for (const subject of subjects) {
        const result = createIcs(items, {
          includeHolidays: els.includeHolidays.checked,
          includeDescription: els.includeDescription.checked,
          calendarName: subject,
          subjectFilter: subject,
          language: settings.language,
        });

        if (result.exported > 0) {
          totalExported += result.exported;
          const fileName = `${base}_${safeFilePart(subject)}.ics`;
          await downloadIcs(result.ics, fileName);
        }
      }

      if (totalExported === 0) {
        throw new Error(t("errorNoEventsToExport"));
      }

      setStatus(
        `${t("createdMany")}\n` +
        `${t("exportedSubjects")}: ${subjects.length}\n` +
        `${t("exported")}: ${totalExported}`
      );
    } else {
      const result = createIcs(items, {
        includeHolidays: els.includeHolidays.checked,
        includeDescription: els.includeDescription.checked,
        calendarName: els.calendarName.value.trim(),
        selectedSubjects,
        language: settings.language,
      });

      if (result.exported === 0) {
        throw new Error(t("errorNoEventsToExport"));
      }

      await downloadIcs(result.ics, els.fileName.value.trim());

      setStatus(
        `${t("createdOne")}\n` +
        `${t("received")}: ${result.received}\n` +
        `${t("exported")}: ${result.exported}\n` +
        `${t("ignored")}: ${result.ignored}`
      );
    }
  } catch (error) {
    console.error(error);
    setStatus(`${t("error")}: ${formatErrorMessage(error)}`, "error");
  } finally {
    els.exportBtn.disabled = false;
  }
}


function getBlockContainer(kind) {
  if (kind === "theory") return els.theoryBlocks;
  if (kind === "seminar") return els.seminarBlocks;
  return els.examBlocks;
}

function updateBlockItemState(item, kind, token) {
  const config = getFormatBlockSetting(kind, token);
  const chip = item.querySelector(".block-chip");
  if (!chip) return;
  chip.classList.toggle("is-disabled", !config.enabled);
  chip.setAttribute("aria-disabled", config.enabled ? "false" : "true");
}

function closeFormatBlockPopover() {
  if (!els.formatBlockPopover) return;
  els.formatBlockPopover.classList.add("hidden");
  els.formatBlockPopover.setAttribute("aria-hidden", "true");
  activeFormatBlock = null;
}

function updateFormatBlockEnabledButton(enabled) {
  if (!els.formatBlockEnabledBtn) return;
  els.formatBlockEnabledBtn.classList.toggle("is-enabled", enabled);
  els.formatBlockEnabledBtn.classList.toggle("is-disabled", !enabled);
  els.formatBlockEnabledBtn.textContent = enabled ? t("formatBlockTitleEnabled") : t("formatBlockTitleDisabled");
  els.formatBlockEnabledBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
}

function syncFormatBlockPopoverFields() {
  if (!activeFormatBlock) return;
  const { kind, token } = activeFormatBlock;
  const config = getFormatBlockSetting(kind, token);
  const visibility = getFormatBlockFieldVisibility(kind, token);

  els.formatBlockPopoverTitle.textContent = `${tokenLabel(token, kind)} · ${t(kind === "theory" ? "theoryFormat" : kind === "seminar" ? "seminarFormat" : "examFormat")}`;
  updateFormatBlockEnabledButton(config.enabled);
  els.formatBlockCustomText.value = config.customText || "";
  els.formatBlockPrefix.value = config.prefix || "";
  els.formatBlockSuffix.value = config.suffix || "";

  els.formatBlockCustomWrap.classList.toggle("hidden", !visibility.customText);
  els.formatBlockCustomHint.classList.add("hidden");
  els.formatBlockPrefixWrap.classList.toggle("hidden", !visibility.prefix);
  els.formatBlockSuffixWrap.classList.toggle("hidden", !visibility.suffix);
}

function positionFormatBlockPopover(anchor) {
  const popover = els.formatBlockPopover;
  if (!popover || !anchor) return;

  popover.classList.remove("hidden");
  popover.setAttribute("aria-hidden", "false");

  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  let left = rect.left + rect.width / 2 - width / 2;
  let top = rect.bottom + margin;

  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
  if (top + height > window.innerHeight - margin) {
    top = rect.top - height - margin;
  }

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function applyFormatBlockPopoverChanges() {
  if (!activeFormatBlock) return;
  const { kind, token } = activeFormatBlock;
  const config = getFormatBlockSetting(kind, token);
  const visibility = getFormatBlockFieldVisibility(kind, token);

  config.enabled = els.formatBlockEnabledBtn.classList.contains("is-enabled");
  if (visibility.customText) {
    config.customText = normalizeFormatInputText(els.formatBlockCustomText.value);
  }
  if (visibility.prefix) {
    config.prefix = normalizeFormatInputText(els.formatBlockPrefix.value);
  }
  if (visibility.suffix) {
    config.suffix = normalizeFormatInputText(els.formatBlockSuffix.value);
  }

  const container = getBlockContainer(kind);
  const item = container?.querySelector(`.block-item[data-token="${token}"]`);
  if (item) updateBlockItemState(item, kind, token);

  updateFormatPreview();
  saveSettingsData();
}

function toggleFormatBlockEnabled() {
  if (!activeFormatBlock) return;
  const { kind, token } = activeFormatBlock;
  const config = getFormatBlockSetting(kind, token);
  config.enabled = !config.enabled;
  updateFormatBlockEnabledButton(config.enabled);
  applyFormatBlockPopoverChanges();
}

function openFormatBlockSettings(kind, token, anchor) {
  activeFormatBlock = { kind, token };
  syncFormatBlockPopoverFields();
  positionFormatBlockPopover(anchor);
}

function resetActiveFormatBlockSettings() {
  if (!activeFormatBlock) return;
  const { kind, token } = activeFormatBlock;
  settings.formatBlockSettings[kind][token] = createDefaultFormatBlockSetting(kind, token);
  syncFormatBlockPopoverFields();
  applyFormatBlockPopoverChanges();
}

function resetAllFormatSettings() {
  settings.formats = structuredClone(DEFAULT_SETTINGS.formats);
  settings.formatBlockSettings = createDefaultFormatBlockSettings();
  closeFormatBlockPopover();
  renderAllBlockBuilders();
  saveSettingsData();
  setStatus(t("formatResetAllDone"));
}

function renderBlockBuilder(kind) {
  const container = getBlockContainer(kind);
  container.textContent = "";
  container.dataset.kind = kind;

  const tokens = settings.formats[kind] || DEFAULT_SETTINGS.formats[kind];

  tokens.forEach((token) => {
    const item = document.createElement("div");
    item.className = "block-item";
    item.draggable = true;
    item.dataset.token = token;

    const chipWrap = document.createElement("div");
    chipWrap.className = "block-chip-wrap";

    const gear = document.createElement("button");
    gear.type = "button";
    gear.className = "block-gear";
    gear.setAttribute("aria-label", t("formatBlockGearLabel"));
    gear.textContent = "⚙";
    gear.addEventListener("mousedown", (event) => event.stopPropagation());
    gear.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openFormatBlockSettings(kind, token, gear);
    });

    const chip = document.createElement("div");
    chip.className = "block-chip";
    chip.dataset.token = token;
    chip.textContent = tokenLabel(token, kind);

    chipWrap.append(gear, chip);
    item.append(chipWrap);
    updateBlockItemState(item, kind, token);

    item.addEventListener("dragstart", (event) => {
      if (event.target.closest(".block-gear")) {
        event.preventDefault();
        return;
      }
      item.classList.add("dragging");
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      saveOrderFromContainer(kind);
      updateFormatPreview();
    });

    container.appendChild(item);
  });

  if (!container.dataset.dragBound) {
    container.dataset.dragBound = "1";
    container.addEventListener("dragover", (event) => {
      event.preventDefault();
      const dragging = container.querySelector(".block-item.dragging");
      if (!dragging) return;

      const afterElement = getDragAfterElement(container, event.clientX);
      if (afterElement == null) {
        container.appendChild(dragging);
      } else {
        container.insertBefore(dragging, afterElement);
      }

      updateFormatPreview();
    });
  }
}

function getDragAfterElement(container, x) {
  const draggableElements = [...container.querySelectorAll(".block-item:not(.dragging)")];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = x - box.left - box.width / 2;

    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }

    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function saveOrderFromContainer(kind) {
  const container = getBlockContainer(kind);
  settings.formats[kind] = [...container.querySelectorAll(".block-item")].map((item) => item.dataset.token);
}

function renderAllBlockBuilders() {
  closeFormatBlockPopover();
  renderBlockBuilder("theory");
  renderBlockBuilder("seminar");
  renderBlockBuilder("exam");
  updateFormatPreview();
}

function renderEmptySubjectsState() {
  detectedSubjects = [];
  selectedSubjects = new Set();
  subjectTypeFlags = {};
  closeColorPalette();
  els.subjectsList.className = "subjects-empty";
  els.subjectsList.textContent = t("subjectsEmpty");
  updateGoogleSteps();
}

function updateVersionLabel() {
  if (!els.extensionVersionValue) return;
  els.extensionVersionValue.textContent = EXTENSION_VERSION;
}

function resetFormControls() {
  setDefaultDates();
  setDefaultTextsForLanguage();
  els.includeHolidays.checked = false;
  els.includeDescription.checked = false;
  els.splitBySubject.checked = false;
  renderEmptySubjectsState();
}

function updateLanguageButton() {
  const meta = {
    ca: { code: "CAT" },
    es: { code: "ES" },
    en: { code: "EN" },
  };

  const current = meta[settings.language] || meta.ca;
  if (els.langCode) els.langCode.textContent = current.code;
  if (els.settingsBtn) {
    els.settingsBtn.title = t("ariaLanguage");
    els.settingsBtn.setAttribute("aria-label", t("ariaLanguage"));
  }
}

function applyI18n() {
  document.documentElement.lang = settings.language;
  document.title = t("extName");
  updateLanguageButton();

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });

  document.querySelectorAll("[data-i18n-html]").forEach((node) => {
    node.innerHTML = t(node.dataset.i18nHtml);
  });

  document.querySelectorAll("[data-i18n-aria]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAria));
  });

  const langLabels = { ca: "langOptionCa", es: "langOptionEs", en: "langOptionEn" };
  els.languageSelect?.querySelectorAll("option").forEach((option) => {
    if (langLabels[option.value]) option.textContent = t(langLabels[option.value]);
  });

  renderAllBlockBuilders();
  updateFormatPreview();
  updateThemeToggle();
  updateVersionLabel();
  updateGoogleSetupHint();
  updateGoogleCalendarNameField();
  if (activeFormatBlock) syncFormatBlockPopoverFields();
  if (!detectedSubjects.length) renderEmptySubjectsState();
  checkCurrentPage();
  checkGoogleConnection();
  updateGoogleSteps();
}

function updateFormatPreview() {
  ["theory", "seminar", "exam"].forEach((kind) => {
    const previewEl = els.formatPreview?.[kind];
    if (!previewEl) return;
    const tokens = getTokensFromContainer(kind);
    previewEl.textContent = buildFormatPreviewTitle(kind, tokens);
  });
}

function normalizeFormats(formats) {
  const normalized = structuredClone(DEFAULT_SETTINGS.formats);
  const incoming = formats || {};

  for (const kind of ["theory", "seminar", "exam"]) {
    if (Array.isArray(incoming[kind])) {
      const allowed = incoming[kind].filter((token) => ["type", "subject", "room", "group"].includes(token));
      if (allowed.length) normalized[kind] = allowed;
    } else if (typeof incoming[kind] === "string") {
      const legacy = {
        subject_room: ["subject", "room"],
        room_subject: ["room", "subject"],
        type_subject_room: ["type", "subject", "room"],
        room_type_subject: ["room", "type", "subject"],
        subject_only: ["subject"],
      };
      normalized[kind] = legacy[incoming[kind]] || normalized[kind];
    }
  }

  if (!normalized.seminar.includes("group")) {
    normalized.seminar.splice(1, 0, "group");
  }

  const oldDefaultSeminar = ["type", "subject", "room", "group"];
  if (
    normalized.seminar.length === oldDefaultSeminar.length &&
    normalized.seminar.every((token, index) => token === oldDefaultSeminar[index])
  ) {
    normalized.seminar = ["type", "group", "subject", "room"];
  }

  return normalized;
}

async function loadSettings() {
  const data = await chrome.storage.local.get({ upfExporterSettings: DEFAULT_SETTINGS });
  const storedSettings = data.upfExporterSettings || {};
  const themeMode = ["system", "light", "dark"].includes(storedSettings.themeMode)
    ? storedSettings.themeMode
    : storedSettings.darkMode === true
      ? "dark"
      : storedSettings.darkMode === false
        ? "light"
        : DEFAULT_SETTINGS.themeMode;

  settings = {
    ...structuredClone(DEFAULT_SETTINGS),
    ...storedSettings,
    themeMode,
    formats: normalizeFormats(storedSettings.formats),
    formatBlockSettings: normalizeFormatBlockSettings(storedSettings.formatBlockSettings),
    subjectColors: storedSettings.subjectColors || {},
    subjectTypeColors: storedSettings.subjectTypeColors || {},
    googleCalendarName: storedSettings.googleCalendarName ?? DEFAULT_SETTINGS.googleCalendarName,
    preferredMode: storedSettings.preferredMode === "google" ? "google" : "manual",
  };

  migrateLegacySubjectColors();

  ensureFormatBlockSettings();

  delete settings.darkMode;
}

async function saveSettingsData() {
  await chrome.storage.local.set({ upfExporterSettings: settings });
}

function isDarkModeActive() {
  if (settings.themeMode === "dark") return true;
  if (settings.themeMode === "light") return false;
  return systemColorScheme.matches;
}

function updateThemeToggle() {
  const darkModeActive = isDarkModeActive();
  document.body.classList.toggle("dark-mode", darkModeActive);
  if (!els.themeToggle) return;
  els.themeToggle.checked = darkModeActive;
  els.themeToggle.setAttribute("aria-checked", String(darkModeActive));
  els.themeToggle.setAttribute("aria-label", t("darkModeLabel"));
}

async function toggleDarkMode() {
  settings.themeMode = els.themeToggle?.checked ? "dark" : "light";
  updateThemeToggle();
  await saveSettingsData();
}

function syncSettingsForm() {
  els.languageSelect.value = settings.language;
  updateThemeToggle();
  renderAllBlockBuilders();
}

function openSettings() {
  syncSettingsForm();
  els.settingsModal.classList.remove("hidden");
  els.settingsModal.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  els.settingsModal.classList.add("hidden");
  els.settingsModal.setAttribute("aria-hidden", "true");
}

async function saveSettingsFromForm() {
  const previousLanguage = settings.language;
  settings.language = els.languageSelect.value;
  await loadLocaleMessages(settings.language);

  saveOrderFromContainer("theory");
  saveOrderFromContainer("seminar");
  saveOrderFromContainer("exam");

  await saveSettingsData();
  applyI18n();

  if (previousLanguage !== settings.language) {
    setDefaultTextsForLanguage();
  }

  setStatus(t("settingsSaved"));
  closeSettings();
}

async function resetSettings() {
  if (!confirm(t("resetConfirm"))) return;

  await chrome.storage.local.clear();
  settings = structuredClone(DEFAULT_SETTINGS);
  await loadLocaleMessages(settings.language);
  syncSettingsForm();
  resetFormControls();
  setMode(settings.preferredMode, false);
  applyI18n();
  setStatus(t("appResetDone"));
}

els.detectSubjects.addEventListener("click", detectSubjects);

els.selectAllSubjects.addEventListener("click", () => {
  selectedSubjects = new Set(detectedSubjects);
  renderSubjects(detectedSubjects);
  persistSessionState();
});

els.clearSubjects.addEventListener("click", () => {
  selectedSubjects = new Set();
  renderSubjects(detectedSubjects, true);
  persistSessionState();
});

els.exportBtn.addEventListener("click", exportCalendar);
els.connectGoogleBtn.addEventListener("click", connectGoogle);
els.disconnectGoogleBtn.addEventListener("click", disconnectGoogle);
els.syncGoogleBtn.addEventListener("click", syncGoogleCalendar);
els.modeManualBtn?.addEventListener("click", () => setMode("manual"));
els.modeGoogleBtn?.addEventListener("click", () => setMode("google"));

document.addEventListener("click", (event) => {
  if (!els.colorPalettePopover?.classList.contains("hidden")) {
    if (!event.target.closest(".color-picker-trigger") && !event.target.closest("#colorPalettePopover")) {
      closeColorPalette();
    }
  }

  if (!els.formatBlockPopover?.classList.contains("hidden")) {
    if (!event.target.closest(".block-gear") && !event.target.closest("#formatBlockPopover")) {
      closeFormatBlockPopover();
    }
  }
});

[
  els.formatBlockCustomText,
  els.formatBlockPrefix,
  els.formatBlockSuffix,
].forEach((input) => {
  input?.addEventListener("input", applyFormatBlockPopoverChanges);
  input?.addEventListener("change", applyFormatBlockPopoverChanges);
});

els.formatBlockEnabledBtn?.addEventListener("click", toggleFormatBlockEnabled);
els.formatBlockResetBtn?.addEventListener("click", resetActiveFormatBlockSettings);
els.resetFormatSettingsBtn?.addEventListener("click", resetAllFormatSettings);

window.addEventListener("resize", closeColorPalette);
els.settingsBtn.addEventListener("click", openSettings);
els.closeSettings.addEventListener("click", closeSettings);
els.saveSettings.addEventListener("click", saveSettingsFromForm);
els.resetSettings.addEventListener("click", resetSettings);
els.themeToggle.addEventListener("change", toggleDarkMode);

els.languageSelect.addEventListener("change", async () => {
  settings.language = els.languageSelect.value;
  await loadLocaleMessages(settings.language);
  setDefaultTextsForLanguage();
  applyI18n();
  await saveSettingsData();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!els.settingsModal.classList.contains("hidden")) closeSettings();
  if (!els.formatBlockPopover?.classList.contains("hidden")) closeFormatBlockPopover();
  if (!els.colorPalettePopover?.classList.contains("hidden")) closeColorPalette();
});

els.settingsModal.addEventListener("click", (event) => {
  if (event.target === els.settingsModal) closeSettings();
});

systemColorScheme.addEventListener("change", () => {
  if (settings.themeMode === "system") updateThemeToggle();
});

els.startDate.addEventListener("change", () => {
  persistSessionState();
  updateGoogleSteps();
});
els.endDate.addEventListener("change", () => {
  persistSessionState();
  updateGoogleSteps();
});
els.includeHolidays.addEventListener("change", persistSessionState);
els.includeDescription.addEventListener("change", persistSessionState);
els.googleCalendarName?.addEventListener("input", () => {
  readGoogleCalendarNameFromForm();
  saveSettingsData();
});

(async function init() {
  document.body.classList.add("mode-manual");
  setDefaultDates();
  await loadSettings();
  await loadLocaleMessages(settings.language);
  syncSettingsForm();
  setDefaultTextsForLanguage();
  if (els.googleCalendarName) {
    els.googleCalendarName.value = getGoogleCalendarNameInputValue();
    updateGoogleCalendarNameField();
  }
  setMode(settings.preferredMode || "manual", false);
  updateVersionLabel();
  applyI18n();
  await restoreSessionState();
  if (detectedSubjects.length) {
    assignDefaultSubjectColors(detectedSubjects);
    renderSubjects(detectedSubjects, true);
  }
  await checkGoogleConnection();
})();
