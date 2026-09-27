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
  return "ca";
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
  language: "ca",
  themeMode: "system",
  preferredMode: "google",
  googleCalendarName: "",
  googleCalendarMode: "single",
  googleCalendarColors: {},
  googleSubjectCalendarNames: {},
  savedColors: [],
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
  const defaults = {
    enabled: true,
    customText: "",
    prefix: "",
    suffix: "",
    pipeSeparators: token === "room",
  };
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

// Local copy so the picker never depends on google-calendar.js loading for UI.
const FALLBACK_COLOR_PRESETS = [
  { id: "11111111-0001-4000-8000-000000000001", hex: "#AD1457" },
  { id: "11111111-0002-4000-8000-000000000002", hex: "#D81B60" },
  { id: "11111111-0003-4000-8000-000000000003", hex: "#E67C73" },
  { id: "11111111-0004-4000-8000-000000000004", hex: "#D50000" },
  { id: "11111111-0005-4000-8000-000000000005", hex: "#F4511E" },
  { id: "11111111-0006-4000-8000-000000000006", hex: "#EF6C00" },
  { id: "11111111-0007-4000-8000-000000000007", hex: "#F09300" },
  { id: "11111111-0008-4000-8000-000000000008", hex: "#E4C441" },
  { id: "11111111-0024-4000-8000-000000000024", hex: "#F6BF26" },
  { id: "11111111-0009-4000-8000-000000000009", hex: "#C0CA33" },
  { id: "11111111-0010-4000-8000-000000000010", hex: "#7CB342" },
  { id: "11111111-0011-4000-8000-000000000011", hex: "#0B8043" },
  { id: "11111111-0012-4000-8000-000000000012", hex: "#33B679" },
  { id: "11111111-0013-4000-8000-000000000013", hex: "#009688" },
  { id: "11111111-0014-4000-8000-000000000014", hex: "#039BE5" },
  { id: "11111111-0015-4000-8000-000000000015", hex: "#4285F4" },
  { id: "11111111-0016-4000-8000-000000000016", hex: "#3F51B5" },
  { id: "11111111-0017-4000-8000-000000000017", hex: "#7986CB" },
  { id: "11111111-0018-4000-8000-000000000018", hex: "#B39DDB" },
  { id: "11111111-0019-4000-8000-000000000019", hex: "#8E24AA" },
  { id: "11111111-0020-4000-8000-000000000020", hex: "#9E69AF" },
  { id: "11111111-0021-4000-8000-000000000021", hex: "#795548" },
  { id: "11111111-0022-4000-8000-000000000022", hex: "#616161" },
  { id: "11111111-0023-4000-8000-000000000023", hex: "#A79B8E" },
];

function getGoogleColorPresets() {
  const fromApi = window.UpfGoogleCalendar?.COLOR_PRESETS;
  if (Array.isArray(fromApi) && fromApi.length) return fromApi;
  return FALLBACK_COLOR_PRESETS;
}

function getCustomColorPrefix() {
  return window.UpfGoogleCalendar?.CUSTOM_COLOR_PREFIX || "custom:";
}

function isCustomColorRef(ref) {
  return typeof ref === "string" && ref.startsWith(getCustomColorPrefix());
}

function normalizePickerHex(hex) {
  const raw = String(hex || "").trim();
  if (!raw) return null;
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toLowerCase() : null;
}

function formatCustomColorRef(hex) {
  const normalized = normalizePickerHex(hex);
  return normalized ? `${getCustomColorPrefix()}${normalized}` : null;
}

function getHexFromColorRef(ref) {
  if (!ref) return null;
  if (isCustomColorRef(ref)) {
    return normalizePickerHex(ref.slice(getCustomColorPrefix().length));
  }
  const presets = getGoogleColorPresets();
  return presets.find((preset) => preset.id === ref)?.hex || null;
}

const MAX_SAVED_COLORS = 10;

function ensureSavedColors() {
  if (!Array.isArray(settings.savedColors)) {
    settings.savedColors = [];
  }
}

function addSavedColor(hex) {
  const normalized = normalizePickerHex(hex);
  if (!normalized) return false;
  ensureSavedColors();
  settings.savedColors = settings.savedColors.filter((entry) => entry !== normalized);
  settings.savedColors.unshift(normalized);
  if (settings.savedColors.length > MAX_SAVED_COLORS) {
    settings.savedColors = settings.savedColors.slice(0, MAX_SAVED_COLORS);
  }
  return true;
}

function removeSavedColor(hex) {
  const normalized = normalizePickerHex(hex);
  if (!normalized) return;
  ensureSavedColors();
  settings.savedColors = settings.savedColors.filter((entry) => entry !== normalized);
}

let settings = structuredClone(DEFAULT_SETTINGS);
let detectedSubjects = [];
let selectedSubjects = new Set();
let subjectTypeFlags = {};
/** @type {Record<string, string[]>} */
let subjectSeminarGroups = {};
/** @type {Record<string, Set<string>>} */
let selectedSeminarGroups = {};
/** Subjects whose multi-group warning the user has already interacted with. */
let acknowledgedSeminarGroupWarnings = new Set();
/** Subjects where the user has already clicked a seminar group chip (not Tots/Cap). */
let seminarGroupChipInteracted = new Set();
const systemColorScheme = window.matchMedia("(prefers-color-scheme: dark)");

const els = {
  startDate: document.getElementById("startDate"),
  endDate: document.getElementById("endDate"),
  calendarName: document.getElementById("calendarName"),
  googleCalendarName: document.getElementById("googleCalendarName"),
  googleCalendarsStep: document.getElementById("googleCalendarsStep"),
  googleCalendarModePicker: document.getElementById("googleCalendarModePicker"),
  googleCalendarSinglePanel: document.getElementById("googleCalendarSinglePanel"),
  googleCalendarPerSubjectPanel: document.getElementById("googleCalendarPerSubjectPanel"),
  googleCalendarPerSubjectList: document.getElementById("googleCalendarPerSubjectList"),
  googleCalendarPerSubjectEmpty: document.getElementById("googleCalendarPerSubjectEmpty"),
  googleCalendarSingleColorSlot: document.getElementById("googleCalendarSingleColorSlot"),
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
  syncProgress: document.getElementById("syncProgress"),
  syncProgressLabel: document.getElementById("syncProgressLabel"),
  syncProgressCount: document.getElementById("syncProgressCount"),
  syncProgressBar: document.getElementById("syncProgressBar"),
  syncProgressFill: document.getElementById("syncProgressFill"),
  syncProgressDetail: document.getElementById("syncProgressDetail"),
  syncConfirmClear: document.getElementById("syncConfirmClear"),
  syncConfirmClearText: document.getElementById("syncConfirmClearText"),
  syncClearYesBtn: document.getElementById("syncClearYesBtn"),
  syncClearNoBtn: document.getElementById("syncClearNoBtn"),
  syncStopBtn: document.getElementById("syncStopBtn"),
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
  formatBlockRoomSepWrap: document.getElementById("formatBlockSepWrap"),
  formatBlockRoomSeparators: document.getElementById("formatBlockSeparators"),
  formatBlockResetBtn: document.getElementById("formatBlockResetBtn"),
  resetFormatSettingsBtn: document.getElementById("resetFormatSettingsBtn"),
  modeManualBtn: document.getElementById("modeManualBtn"),
  modeGoogleBtn: document.getElementById("modeGoogleBtn"),
  colorPaletteBackdrop: document.getElementById("colorPaletteBackdrop"),
  colorPalettePopover: document.getElementById("colorPalettePopover"),
  colorPaletteGrid: document.getElementById("colorPaletteGrid"),
  colorPaletteSavedGrid: document.getElementById("colorPaletteSavedGrid"),
  colorPaletteCustomWrap: document.getElementById("colorPaletteCustomWrap"),
  colorPaletteSV: document.getElementById("colorPaletteSV"),
  colorPaletteSVThumb: document.getElementById("colorPaletteSVThumb"),
  colorPaletteHue: document.getElementById("colorPaletteHue"),
  colorPaletteHueThumb: document.getElementById("colorPaletteHueThumb"),
  colorPaletteEyedropperBtn: document.getElementById("colorPaletteEyedropperBtn"),
  colorPalettePreview: document.getElementById("colorPalettePreview"),
  colorPaletteHexInput: document.getElementById("colorPaletteHexInput"),
  googleConnectStep: document.getElementById("googleConnectStep"),
  datesCard: document.getElementById("datesCard"),
  subjectsCard: document.getElementById("subjectsCard"),
};

let activeColorSubject = null;
let activeColorKind = "main";
let colorPaletteBuilt = false;
let customPickerHue = 214;
let customPickerSat = 82;
let customPickerVal = 100;
let customPickerDragging = null;
let eyedropperActive = false;
let skipHexBlurApply = false;
let ignoreColorPaletteOutsideClick = false;
let ignoreFormatBlockOutsideClick = false;
let activeFormatBlock = null;

function t(key) {
  return I18N[key]?.message || key;
}

function formatErrorMessage(error) {
  const message = String(error?.message || error || "").trim();
  if (message === "No valid token") return t("errorGoogleReconnect");
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

function setStatus(message, type = "", options = {}) {
  if (!els.status) return;

  els.status.classList.remove("error", "warning", "success");
  if (type === "error" || type === "warning" || type === "success") {
    els.status.classList.add(type);
  }

  const hasContent = Boolean(message) || options.support || options.contactEmail;
  els.status.classList.toggle("hidden", !hasContent);
  els.status.replaceChildren();
  if (!hasContent) return;

  if (message) {
    const main = document.createElement("div");
    main.className = "status-main";
    main.textContent = message;
    els.status.append(main);
  }

  if (options.support) {
    const support = document.createElement("p");
    support.className = "status-extra status-support";
    const before = document.createElement("span");
    before.textContent = `${t("supportThanks")} `;
    const link = document.createElement("a");
    link.href = "https://buymeacoffee.com/openextensions";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = t("supportThanksLink");
    support.append(before, link);
    els.status.append(support);
  }

  if (options.contactEmail) {
    const contact = document.createElement("p");
    contact.className = "status-extra status-contact";
    const before = document.createElement("span");
    before.textContent = `${t("supportContactBefore")} `;
    const link = document.createElement("a");
    link.href = "mailto:upfcalendarexporter@gmail.com?subject=" + encodeURIComponent(t("supportContactSubject"));
    link.textContent = "upfcalendarexporter@gmail.com";
    const after = document.createElement("span");
    after.textContent = t("supportContactAfter");
    contact.append(before, link, after);
    els.status.append(contact);
  }
}

function appendStatusDetails(lines, { open = false } = {}) {
  if (!els.status || !lines?.length) return;

  const wrap = document.createElement("details");
  wrap.className = "status-details";
  if (open) wrap.open = true;

  const summary = document.createElement("summary");
  summary.className = "status-details-summary";
  summary.textContent = t("statusTechnicalDetails");

  const body = document.createElement("div");
  body.className = "status-details-body";
  body.textContent = lines.join("\n");

  wrap.append(summary, body);
  els.status.append(wrap);
}

async function persistSessionState() {
  if (!chrome.storage.session) return;

  const seminarGroupsSelected = {};
  for (const [subject, groups] of Object.entries(selectedSeminarGroups)) {
    seminarGroupsSelected[subject] = [...groups];
  }

  await chrome.storage.session.set({
    [SESSION_KEY]: {
      detectedSubjects,
      selectedSubjects: [...selectedSubjects],
      subjectTypeFlags,
      subjectSeminarGroups,
      selectedSeminarGroups: seminarGroupsSelected,
      acknowledgedSeminarGroupWarnings: [...acknowledgedSeminarGroupWarnings],
      seminarGroupChipInteracted: [...seminarGroupChipInteracted],
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

  if (state.subjectSeminarGroups && typeof state.subjectSeminarGroups === "object") {
    subjectSeminarGroups = state.subjectSeminarGroups;
  }

  if (state.subjectTypeFlags && typeof state.subjectTypeFlags === "object") {
    subjectTypeFlags = state.subjectTypeFlags;
  } else {
    // Sessions antigues: reconstrueix els flags a partir de colors i grups desats.
    subjectTypeFlags = {};
    const subjects = Array.isArray(state.detectedSubjects) ? state.detectedSubjects : [];
    for (const subject of subjects) {
      const types = settings.subjectTypeColors?.[subject];
      const hasGroups = Array.isArray(subjectSeminarGroups[subject]) && subjectSeminarGroups[subject].length > 0;
      subjectTypeFlags[subject] = {
        seminar: Boolean(types?.seminar) || hasGroups,
        exam: Boolean(types?.exam),
      };
    }
  }

  if (state.selectedSeminarGroups && typeof state.selectedSeminarGroups === "object") {
    selectedSeminarGroups = {};
    for (const [subject, groups] of Object.entries(state.selectedSeminarGroups)) {
      selectedSeminarGroups[subject] = new Set(Array.isArray(groups) ? groups : []);
    }
  }

  if (Array.isArray(state.acknowledgedSeminarGroupWarnings)) {
    acknowledgedSeminarGroupWarnings = new Set(state.acknowledgedSeminarGroupWarnings);
  }

  if (Array.isArray(state.seminarGroupChipInteracted)) {
    seminarGroupChipInteracted = new Set(state.seminarGroupChipInteracted);
  }

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

function normalizeSeminarGroup(value) {
  return clean(value);
}

function buildSubjectSeminarGroups(items) {
  const map = {};

  for (const item of items) {
    if (!shouldExport(item, false)) continue;
    if (typeKey(item) !== "seminar") continue;

    const subject = normalizeSubject(item);
    if (!subject) continue;

    const group = normalizeSeminarGroup(item.grup);
    if (!group) continue;

    if (!map[subject]) map[subject] = new Set();
    map[subject].add(group);
  }

  const result = {};
  for (const [subject, groups] of Object.entries(map)) {
    result[subject] = [...groups].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }
  return result;
}

function getSeminarGroupsForSubject(subject) {
  return subjectSeminarGroups[subject] || [];
}

function hasMultipleSeminarGroups(subject) {
  return getSeminarGroupsForSubject(subject).length > 1;
}

function hasPendingSeminarGroupWarning(subject) {
  return hasMultipleSeminarGroups(subject) && !acknowledgedSeminarGroupWarnings.has(subject);
}

function acknowledgeSeminarGroupWarning(subject) {
  if (!hasMultipleSeminarGroups(subject)) return;
  acknowledgedSeminarGroupWarnings.add(subject);
}

function syncSelectedSeminarGroups(subjects, { reset = false } = {}) {
  const next = {};

  for (const subject of subjects) {
    const available = getSeminarGroupsForSubject(subject);
    if (!available.length) continue;

    const previous = selectedSeminarGroups[subject];
    if (!reset && previous instanceof Set) {
      const kept = available.filter((group) => previous.has(group));
      next[subject] = new Set(kept.length ? kept : available);
    } else {
      next[subject] = new Set(available);
    }
  }

  selectedSeminarGroups = next;
}

function isSeminarGroupSelected(subject, group) {
  const available = getSeminarGroupsForSubject(subject);
  if (available.length <= 1) return true;

  const selected = selectedSeminarGroups[subject];
  if (!(selected instanceof Set)) return true;
  return selected.has(group);
}

function isItemAllowedBySeminarGroup(item) {
  if (typeKey(item) !== "seminar") return true;

  const subject = normalizeSubject(item);
  if (!subject) return false;

  const available = getSeminarGroupsForSubject(subject);
  if (available.length <= 1) return true;

  const group = normalizeSeminarGroup(item.grup);
  if (!group) return false;
  return isSeminarGroupSelected(subject, group);
}

function setSeminarGroupSelected(subject, group, enabled) {
  if (!selectedSeminarGroups[subject]) {
    selectedSeminarGroups[subject] = new Set(getSeminarGroupsForSubject(subject));
  }

  if (enabled) selectedSeminarGroups[subject].add(group);
  else selectedSeminarGroups[subject].delete(group);
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
  if (kind === "calendar") {
    return getCalendarColorId(subject);
  }
  if (kind === "main") {
    return getSubjectColorId(subject);
  }

  const setting = ensureSubjectTypeSetting(subject, kind);
  return setting.color || pickDefaultAltColor(subject, kind);
}

function setColorForTarget(subject, kind, colorId) {
  if (kind === "calendar") {
    ensureCalendarColorsMap();
    settings.googleCalendarColors[subject] = colorId;
    return;
  }
  if (kind === "main") {
    settings.subjectColors[subject] = colorId;
    return;
  }

  const setting = ensureSubjectTypeSetting(subject, kind);
  setting.color = colorId;
}

const GOOGLE_SINGLE_CALENDAR_KEY = "__single__";

function ensureCalendarColorsMap() {
  if (!settings.googleCalendarColors || typeof settings.googleCalendarColors !== "object") {
    settings.googleCalendarColors = {};
  }
}

function ensureSubjectCalendarNamesMap() {
  if (!settings.googleSubjectCalendarNames || typeof settings.googleSubjectCalendarNames !== "object") {
    settings.googleSubjectCalendarNames = {};
  }
}

function getGoogleCalendarMode() {
  return settings.googleCalendarMode === "perSubject" ? "perSubject" : "single";
}

function getCalendarColorId(key) {
  ensureCalendarColorsMap();
  if (settings.googleCalendarColors[key]) {
    return settings.googleCalendarColors[key];
  }
  if (key !== GOOGLE_SINGLE_CALENDAR_KEY) {
    return getSubjectColorId(key);
  }
  const presets = getGoogleColorPresets();
  return presets[14]?.id || presets[0]?.id || null;
}

function getCalendarColorHex(key) {
  return getHexFromColorRef(getCalendarColorId(key));
}

function getSubjectCalendarName(subject) {
  ensureSubjectCalendarNamesMap();
  const stored = settings.googleSubjectCalendarNames[subject];
  if (typeof stored === "string" && stored.trim()) return stored.trim();
  return subject;
}

function setSubjectCalendarName(subject, name) {
  ensureSubjectCalendarNamesMap();
  settings.googleSubjectCalendarNames[subject] = name;
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

  // Sync banners belong to Google mode; clear leftovers when switching.
  showSyncProgress(false);
  setStatus("");

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
  const hex = getHexFromColorRef(selectedId);
  if (hex) return { id: selectedId, hex };
  return presets[0];
}

function hexToRgb(hex) {
  const normalized = normalizePickerHex(hex);
  if (!normalized) return null;
  const value = parseInt(normalized.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex(r, g, b) {
  const clamp = (channel) => Math.max(0, Math.min(255, Math.round(channel)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === rn) hue = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) hue = ((bn - rn) / delta + 2) * 60;
    else hue = ((rn - gn) / delta + 4) * 60;
  }

  return {
    h: hue,
    s: max === 0 ? 0 : (delta / max) * 100,
    v: max * 100,
  };
}

function hsvToRgb(h, s, v) {
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const vn = Math.max(0, Math.min(100, v)) / 100;
  const hn = (((h % 360) + 360) % 360) / 60;
  const i = Math.floor(hn);
  const f = hn - i;
  const p = vn * (1 - sn);
  const q = vn * (1 - sn * f);
  const t = vn * (1 - sn * (1 - f));
  let r;
  let g;
  let b;

  switch (i) {
    case 0:
      r = vn;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = vn;
      b = p;
      break;
    case 2:
      r = p;
      g = vn;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = vn;
      break;
    case 4:
      r = t;
      g = p;
      b = vn;
      break;
    default:
      r = vn;
      g = p;
      b = q;
  }

  return { r: r * 255, g: g * 255, b: b * 255 };
}

function getCustomPickerHex() {
  const { r, g, b } = hsvToRgb(customPickerHue, customPickerSat, customPickerVal);
  return normalizePickerHex(rgbToHex(r, g, b));
}

function isAchromaticHsv(hsv) {
  return hsv.s < 0.5;
}

function setCustomPickerFromHex(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

  if (isAchromaticHsv(hsv)) {
    if (hsv.v < 0.5) {
      // Negre pur: mantenim to i saturació per no bloquejar el selector.
      customPickerVal = 0;
    } else if (hsv.v > 99.5) {
      // Blanc pur: mateix tractament per no saltar al cantó.
      customPickerVal = 100;
    } else {
      customPickerVal = hsv.v;
      customPickerSat = 0;
    }
  } else {
    customPickerHue = hsv.h;
    customPickerSat = hsv.s;
    customPickerVal = hsv.v;
  }

  updateCustomPickerUI();
}

function releaseHexInputFocus() {
  if (!els.colorPaletteHexInput || document.activeElement !== els.colorPaletteHexInput) return;
  skipHexBlurApply = true;
  els.colorPaletteHexInput.blur();
}

function syncHexInputFromPicker() {
  const hex = getCustomPickerHex();
  if (!hex) return;
  if (els.colorPalettePreview) {
    els.colorPalettePreview.style.backgroundColor = hex;
  }
  if (!els.colorPaletteHexInput) return;
  if (document.activeElement === els.colorPaletteHexInput) return;
  els.colorPaletteHexInput.value = hex;
  els.colorPaletteHexInput.classList.remove("is-invalid");
}

function updateCustomPickerUI() {
  if (els.colorPaletteSV) {
    els.colorPaletteSV.style.setProperty("--picker-hue", String(Math.round(customPickerHue)));
  }
  if (els.colorPaletteSVThumb) {
    els.colorPaletteSVThumb.style.left = `${customPickerSat}%`;
    els.colorPaletteSVThumb.style.top = `${100 - customPickerVal}%`;
  }
  if (els.colorPaletteHueThumb) {
    els.colorPaletteHueThumb.style.left = `${(customPickerHue / 360) * 100}%`;
  }
  if (els.colorPaletteSV) {
    els.colorPaletteSV.setAttribute("aria-valuenow", String(Math.round(customPickerSat)));
  }
  if (els.colorPaletteHue) {
    els.colorPaletteHue.setAttribute("aria-valuenow", String(Math.round(customPickerHue)));
  }
  syncHexInputFromPicker();
}

function parseHexInputValue(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;
  return normalizePickerHex(raw.startsWith("#") ? raw : `#${raw}`);
}

function applyHexInputValue({ commit = false } = {}) {
  const hex = parseHexInputValue(els.colorPaletteHexInput?.value);
  if (!hex) {
    els.colorPaletteHexInput?.classList.add("is-invalid");
    return false;
  }
  els.colorPaletteHexInput?.classList.remove("is-invalid");
  setCustomPickerFromHex(hex);
  previewCustomPickerColor();
  if (commit) commitCustomPickerColor();
  return true;
}

async function pickColorFromScreen() {
  if (!window.EyeDropper || eyedropperActive) return;

  const subject = activeColorSubject;
  const kind = activeColorKind;
  if (!subject) return;

  eyedropperActive = true;
  ignoreColorPaletteOutsideClick = true;

  try {
    const dropper = new EyeDropper();
    const result = await dropper.open();
    const hex = normalizePickerHex(result?.sRGBHex);
    if (!hex) return;

    activeColorSubject = subject;
    activeColorKind = kind;
    setCustomPickerFromHex(hex);
    releaseHexInputFocus();
    syncHexInputFromPicker();
    await commitCustomPickerColor();
  } catch (_) {
    // User cancelled the eyedropper.
  } finally {
    eyedropperActive = false;
    ignoreColorPaletteOutsideClick = false;
  }
}

function updateEyedropperAvailability() {
  if (!els.colorPaletteEyedropperBtn) return;
  els.colorPaletteEyedropperBtn.classList.toggle("is-hidden", !window.EyeDropper);
}

function getPointerRatio(element, clientX, clientY) {
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };
  return {
    x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
  };
}

function updateCustomPickerFromSv(clientX, clientY) {
  if (!els.colorPaletteSV) return;
  const { x, y } = getPointerRatio(els.colorPaletteSV, clientX, clientY);
  customPickerSat = x * 100;
  customPickerVal = (1 - y) * 100;
  updateCustomPickerUI();
}

function updateCustomPickerFromHue(clientX) {
  if (!els.colorPaletteHue) return;
  const { x } = getPointerRatio(els.colorPaletteHue, clientX, 0);
  customPickerHue = x * 360;
  updateCustomPickerUI();
}

async function applyColorRef(ref, { closePalette = true } = {}) {
  if (!ref || !activeColorSubject) return;

  const subject = activeColorSubject;
  const kind = activeColorKind;
  setColorForTarget(subject, kind, ref);
  await saveSettingsData();
  updatePaletteSelection(ref);
  if (kind === "calendar") {
    renderGoogleCalendarsStep();
  } else {
    renderSubjects(detectedSubjects, true);
  }
  if (closePalette) closeColorPalette();
}

function previewCustomPickerColor() {
  const ref = formatCustomColorRef(getCustomPickerHex());
  if (!ref || !activeColorSubject) return;

  setColorForTarget(activeColorSubject, activeColorKind, ref);
  if (activeColorKind === "calendar") {
    renderGoogleCalendarsStep();
  } else {
    renderSubjects(detectedSubjects, true);
  }
}

async function commitCustomPickerColor() {
  const ref = formatCustomColorRef(getCustomPickerHex());
  if (!ref || !activeColorSubject) return;

  setColorForTarget(activeColorSubject, activeColorKind, ref);
  await saveSettingsData();
  updatePaletteSelection(ref);
  if (activeColorKind === "calendar") {
    renderGoogleCalendarsStep();
  } else {
    renderSubjects(detectedSubjects, true);
  }
}

function renderSavedColorsBar() {
  if (!els.colorPaletteSavedGrid) return;
  ensureSavedColors();
  els.colorPaletteSavedGrid.textContent = "";

  for (const hex of settings.savedColors) {
    const slot = document.createElement("div");
    slot.className = "palette-saved-slot";

    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "palette-swatch palette-saved-swatch";
    swatch.style.backgroundColor = hex;
    swatch.dataset.hex = hex;
    swatch.setAttribute("aria-label", hex);
    swatch.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const ref = formatCustomColorRef(hex);
      if (!ref) return;
      await applyColorRef(ref, { closePalette: true });
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "palette-saved-remove";
    remove.setAttribute("aria-label", t("colorPaletteRemoveSaved"));
    remove.textContent = "\u00D7";
    remove.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeSavedColor(hex);
      await saveSettingsData();
      renderSavedColorsBar();
      updatePaletteSelection(getColorIdForTarget(activeColorSubject, activeColorKind));
    });

    slot.append(swatch, remove);
    els.colorPaletteSavedGrid.append(slot);
  }

  const add = document.createElement("button");
  add.type = "button";
  add.className = "palette-saved-add";
  add.setAttribute("aria-label", t("colorPaletteSaveAria"));
  add.textContent = "+";
  add.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const hex = getCustomPickerHex();
    if (!addSavedColor(hex)) return;
    await saveSettingsData();
    renderSavedColorsBar();
  });
  els.colorPaletteSavedGrid.append(add);
}

function finishCustomPickerDrag() {
  if (!customPickerDragging) return;
  customPickerDragging = null;
  commitCustomPickerColor();
}

function ensureColorPaletteCustom() {
  if (!els.colorPaletteSV || els.colorPaletteSV.dataset.bound) return;
  els.colorPaletteSV.dataset.bound = "1";

  const onSvPointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    releaseHexInputFocus();
    customPickerDragging = "sv";
    updateCustomPickerFromSv(event.clientX, event.clientY);
    previewCustomPickerColor();
    els.colorPaletteSV.setPointerCapture(event.pointerId);
  };

  const onHuePointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    releaseHexInputFocus();
    customPickerDragging = "hue";
    updateCustomPickerFromHue(event.clientX);
    previewCustomPickerColor();
    els.colorPaletteHue.setPointerCapture(event.pointerId);
  };

  els.colorPaletteSV.addEventListener("pointerdown", onSvPointerDown);
  els.colorPaletteHue.addEventListener("pointerdown", onHuePointerDown);

  document.addEventListener("pointermove", (event) => {
    if (customPickerDragging === "sv") {
      updateCustomPickerFromSv(event.clientX, event.clientY);
      previewCustomPickerColor();
    } else if (customPickerDragging === "hue") {
      updateCustomPickerFromHue(event.clientX);
      previewCustomPickerColor();
    }
  });

  document.addEventListener("pointerup", finishCustomPickerDrag);
  document.addEventListener("pointercancel", finishCustomPickerDrag);

  els.colorPaletteEyedropperBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    pickColorFromScreen();
  });

  els.colorPaletteHexInput?.addEventListener("input", () => {
    const hex = parseHexInputValue(els.colorPaletteHexInput.value);
    els.colorPaletteHexInput.classList.toggle("is-invalid", Boolean(els.colorPaletteHexInput.value.trim()) && !hex);
    if (hex && els.colorPalettePreview) {
      els.colorPalettePreview.style.backgroundColor = hex;
    }
    if (!hex) return;
    setCustomPickerFromHex(hex);
    previewCustomPickerColor();
  });

  els.colorPaletteHexInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyHexInputValue({ commit: true });
  });

  els.colorPaletteHexInput?.addEventListener("blur", () => {
    if (skipHexBlurApply) {
      skipHexBlurApply = false;
      syncHexInputFromPicker();
      return;
    }
    if (!els.colorPaletteHexInput?.value.trim()) {
      syncHexInputFromPicker();
      els.colorPaletteHexInput.classList.remove("is-invalid");
      return;
    }
    const typedHex = parseHexInputValue(els.colorPaletteHexInput.value);
    const currentHex = getCustomPickerHex();
    if (typedHex && typedHex === currentHex) {
      els.colorPaletteHexInput.classList.remove("is-invalid");
      return;
    }
    applyHexInputValue({ commit: true });
  });

  updateEyedropperAvailability();
  updateCustomPickerUI();
}

function buildColorPaletteGrid() {
  if (!els.colorPaletteGrid) return;
  ensureColorPaletteCustom();
  if (colorPaletteBuilt && els.colorPaletteGrid.childElementCount > 0) return;

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
      event.preventDefault();
      event.stopPropagation();
      if (!activeColorSubject) return;

      await applyColorRef(color.id, { closePalette: true });
    });
    els.colorPaletteGrid.append(button);
  }

  colorPaletteBuilt = presets.length > 0;
}

function updatePaletteSelection(selectedRef) {
  const isCustom = isCustomColorRef(selectedRef);
  const hex = getHexFromColorRef(selectedRef);

  els.colorPaletteGrid?.querySelectorAll(".palette-swatch").forEach((button) => {
    button.classList.toggle("selected", !isCustom && button.dataset.colorId === selectedRef);
  });

  els.colorPaletteSavedGrid?.querySelectorAll(".palette-saved-swatch").forEach((button) => {
    button.classList.toggle("selected", isCustom && button.dataset.hex === hex);
  });

  if (!hex) return;
  if (getCustomPickerHex() === hex) {
    syncHexInputFromPicker();
    return;
  }
  setCustomPickerFromHex(hex);
}

function positionColorPalette() {
  if (!els.colorPalettePopover) return;

  const margin = 12;
  const popoverHeight = els.colorPalettePopover.offsetHeight;
  const preferredTop = 72;
  const maxTop = Math.max(margin, window.innerHeight - popoverHeight - margin);

  els.colorPalettePopover.style.top = `${Math.min(preferredTop, maxTop)}px`;
}

function openColorPalette(subject, anchor, kind = "main") {
  if (!document.body.classList.contains("mode-google")) return;

  buildColorPaletteGrid();
  renderSavedColorsBar();
  if (!els.colorPalettePopover) return;
  if (!els.colorPaletteGrid?.childElementCount) return;

  if (
    activeColorSubject === subject &&
    activeColorKind === kind &&
    !els.colorPalettePopover.classList.contains("hidden")
  ) {
    closeColorPalette();
    return;
  }

  if (els.colorPaletteBackdrop?.parentElement !== document.body) {
    document.body.append(els.colorPaletteBackdrop);
  }
  if (els.colorPalettePopover.parentElement !== document.body) {
    document.body.append(els.colorPalettePopover);
  }

  activeColorSubject = subject;
  activeColorKind = kind;
  updatePaletteSelection(getColorIdForTarget(subject, kind) || getGoogleColorPresets()[0]?.id);
  updateEyedropperAvailability();

  // Opening the palette can resize the popup; ignore the same-tick outside click.
  ignoreColorPaletteOutsideClick = true;
  setTimeout(() => {
    ignoreColorPaletteOutsideClick = false;
  }, 50);

  els.colorPaletteBackdrop?.classList.remove("hidden");
  els.colorPaletteBackdrop?.setAttribute("aria-hidden", "false");
  els.colorPalettePopover.classList.remove("hidden");
  els.colorPalettePopover.setAttribute("aria-hidden", "false");
  anchor.setAttribute("aria-expanded", "true");

  document.querySelectorAll(".color-picker-trigger[aria-expanded='true']").forEach((trigger) => {
    if (trigger !== anchor) trigger.setAttribute("aria-expanded", "false");
  });

  requestAnimationFrame(() => positionColorPalette());
}

function repositionOpenColorPalette() {
  if (els.colorPalettePopover?.classList.contains("hidden")) return;
  positionColorPalette();
}

function closeColorPalette() {
  activeColorSubject = null;
  activeColorKind = "main";

  if (els.colorPaletteBackdrop) {
    els.colorPaletteBackdrop.classList.add("hidden");
    els.colorPaletteBackdrop.setAttribute("aria-hidden", "true");
  }
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
  chevron.textContent = "\u25BE";

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
    renderGoogleCalendarsStep();
  });
  return checkbox;
}

function fillSubjectTypeColorSlot(slot, subject, kind, enabled) {
  slot.replaceChildren();
  if (enabled) {
    slot.append(createColorPickerTrigger(subject, kind));
    return;
  }

  const preset = getSubjectColorPreset(subject, "main");
  const inherited = document.createElement("span");
  inherited.className = "subject-type-color-inherited";
  inherited.title = t("googleAltColorInherited");
  inherited.setAttribute("aria-label", t("googleAltColorInherited"));
  inherited.style.backgroundColor = preset?.hex || "#616161";
  slot.append(inherited);
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
  const block = document.createElement("div");
  block.className = "subject-type-block";

  const row = document.createElement("div");
  row.className = "subject-type-row";

  const main = document.createElement("div");
  main.className = "subject-type-main";

  const label = document.createElement("span");
  label.className = "subject-type-label";
  label.textContent = t(kind === "seminar" ? "googleColorSeminar" : "googleColorExam");

  const hint = document.createElement("p");
  hint.className = "mini subject-type-hint";
  hint.textContent = t(kind === "seminar" ? "googleAltColorSeminarHint" : "googleAltColorExamHint");

  const colorSlot = document.createElement("div");
  colorSlot.className = "subject-type-color-slot";
  fillSubjectTypeColorSlot(colorSlot, subject, kind, setting.enabled);

  const controls = document.createElement("div");
  controls.className = "subject-type-controls";
  controls.append(createSubjectTypeToggle(subject, kind, colorSlot), colorSlot);

  main.append(label, controls);
  row.append(main, hint);
  block.append(row);
  return block;
}

function hideSeminarGroupTooltip() {
  document.querySelectorAll(".subject-group-tooltip-floating").forEach((node) => node.remove());
}

function showSeminarGroupTooltip(anchor, text) {
  hideSeminarGroupTooltip();

  const tip = document.createElement("div");
  tip.className = "subject-group-tooltip-floating";
  tip.setAttribute("role", "tooltip");
  tip.textContent = text;
  document.body.append(tip);

  const rect = anchor.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const margin = 8;
  let left = rect.right - tipRect.width;
  let top = rect.top - tipRect.height - 8;

  left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));
  if (top < margin) {
    top = rect.bottom + 8;
  }

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function createSeminarGroupWarning(subject) {
  const warning = document.createElement("button");
  warning.type = "button";
  warning.className = "subject-group-warning";
  warning.setAttribute("aria-label", t("seminarGroupsWarningTooltip"));

  const icon = document.createElement("span");
  icon.className = "subject-group-warning-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "\u26A0\uFE0F";
  warning.append(icon);

  const tooltipText = t("seminarGroupsWarningTooltip");
  warning.addEventListener("mouseenter", () => showSeminarGroupTooltip(warning, tooltipText));
  warning.addEventListener("mouseleave", hideSeminarGroupTooltip);
  warning.addEventListener("focus", () => showSeminarGroupTooltip(warning, tooltipText));
  warning.addEventListener("blur", hideSeminarGroupTooltip);
  warning.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    hideSeminarGroupTooltip();
    const card = warning.closest("details.subject-card");
    if (card) card.open = true;
  });
  return warning;
}

function createSeminarGroupSelector(subject) {
  const groups = getSeminarGroupsForSubject(subject);
  const section = document.createElement("div");
  section.className = "subject-group-section";

  const title = document.createElement("p");
  title.className = "subject-group-title";
  title.textContent = t("seminarGroupsWarningTitle");

  const hint = document.createElement("p");
  hint.className = "mini subject-group-hint";
  hint.textContent = t("seminarGroupsWarningHint");

  const list = document.createElement("div");
  list.className = "subject-group-list";

  const refreshAfterInteraction = () => {
    acknowledgeSeminarGroupWarning(subject);
    renderSubjects(detectedSubjects, true);
    persistSessionState();
  };

  for (const group of groups) {
    const selected = isSeminarGroupSelected(subject, group);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `subject-group-chip${selected ? " is-selected" : ""}`;
    chip.setAttribute("aria-pressed", selected ? "true" : "false");
    chip.textContent = group;
    chip.title = t("seminarGroupLabel").replace("{group}", group);
    chip.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!seminarGroupChipInteracted.has(subject)) {
        seminarGroupChipInteracted.add(subject);
        selectedSeminarGroups[subject] = new Set([group]);
      } else {
        setSeminarGroupSelected(subject, group, !selected);
      }
      refreshAfterInteraction();
    });
    list.append(chip);
  }

  const actions = document.createElement("div");
  actions.className = "subject-group-actions";

  const selectAll = document.createElement("button");
  selectAll.type = "button";
  selectAll.className = "subject-group-action is-all";
  selectAll.textContent = t("seminarGroupsSelectAll");
  selectAll.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    selectedSeminarGroups[subject] = new Set(groups);
    refreshAfterInteraction();
  });

  const selectNone = document.createElement("button");
  selectNone.type = "button";
  selectNone.className = "subject-group-action is-none";
  selectNone.textContent = t("seminarGroupsSelectNone");
  selectNone.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    selectedSeminarGroups[subject] = new Set();
    refreshAfterInteraction();
  });

  actions.append(selectAll, selectNone);
  section.append(title, hint, list, actions);
  return section;
}

function createSubjectMainRow(subject, { expandButton = null, warningBadge = null } = {}) {
  const row = document.createElement("div");
  row.className = "subject-row";

  const name = document.createElement("div");
  name.className = "subject-name";
  name.textContent = subject;

  row.append(createSubjectCheckbox(subject), name);

  if (document.body.classList.contains("mode-google")) {
    row.append(createColorPickerTrigger(subject, "main"));
  }

  if (warningBadge) {
    row.append(warningBadge);
  }

  if (expandButton) {
    row.append(expandButton);
  }

  return row;
}

function createExpandableSubjectCard(subject, flags, open = false) {
  const card = document.createElement("details");
  card.className = "subject-card";
  if (hasPendingSeminarGroupWarning(subject)) {
    card.classList.add("has-pending-group-warning");
  }
  card.open = open;

  const expandBtn = document.createElement("button");
  expandBtn.type = "button";
  expandBtn.className = "subject-expand-btn";
  expandBtn.setAttribute(
    "aria-label",
    hasMultipleSeminarGroups(subject) ? t("googleExpandSubjectTypesWithGroups") : t("googleExpandSubjectTypes")
  );
  expandBtn.setAttribute("aria-expanded", open ? "true" : "false");

  const expandIcon = document.createElement("span");
  expandIcon.className = "subject-expand-icon";
  expandIcon.setAttribute("aria-hidden", "true");
  expandIcon.textContent = "\u25BE";
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

  const warningBadge = hasPendingSeminarGroupWarning(subject)
    ? createSeminarGroupWarning(subject)
    : null;

  const summary = document.createElement("summary");
  summary.className = "subject-summary";
  summary.append(createSubjectMainRow(subject, { expandButton: expandBtn, warningBadge }));

  const panel = document.createElement("div");
  panel.className = "subject-type-panel";

  if (hasMultipleSeminarGroups(subject)) {
    panel.append(createSeminarGroupSelector(subject));
  }

  const isGoogle = document.body.classList.contains("mode-google");
  if (isGoogle && flags.seminar) panel.append(createSubjectTypeRow(subject, "seminar"));
  if (isGoogle && flags.exam) panel.append(createSubjectTypeRow(subject, "exam"));

  card.append(summary, panel);
  return card;
}

function updateGoogleSteps() {
  const connected = els.googleStatus?.classList.contains("connected");
  const hasDates = Boolean(els.startDate?.value && els.endDate?.value);
  const hasSubjects = detectedSubjects.length > 0;
  const calendarConfigured = getGoogleCalendarMode() === "single"
    || [...selectedSubjects].length > 0;

  els.googleConnectStep?.classList.toggle("step-done", Boolean(connected));
  els.datesCard?.classList.toggle("step-done", hasDates);
  els.subjectsCard?.classList.toggle("step-done", hasSubjects);
  els.googleCalendarsStep?.classList.toggle("step-done", Boolean(connected) && calendarConfigured);
}

function renderGoogleCalendarsStep() {
  const mode = getGoogleCalendarMode();
  els.googleCalendarModePicker?.querySelectorAll(".calendar-mode-card").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  els.googleCalendarSinglePanel?.classList.toggle("hidden", mode !== "single");
  els.googleCalendarPerSubjectPanel?.classList.toggle("hidden", mode !== "perSubject");

  if (els.googleCalendarSingleColorSlot) {
    els.googleCalendarSingleColorSlot.replaceChildren(
      createColorPickerTrigger(GOOGLE_SINGLE_CALENDAR_KEY, "calendar")
    );
  }

  const list = els.googleCalendarPerSubjectList;
  if (!list) return;

  list.textContent = "";
  const subjects = [...selectedSubjects].sort((a, b) => a.localeCompare(b));
  const hasSubjects = subjects.length > 0;
  els.googleCalendarPerSubjectEmpty?.classList.toggle("hidden", hasSubjects || mode !== "perSubject");

  if (!hasSubjects) {
    updateGoogleSteps();
    return;
  }

  for (const subject of subjects) {
    const row = document.createElement("div");
    row.className = "google-calendar-subject-row";

    const label = document.createElement("span");
    label.className = "google-calendar-subject-label";
    label.textContent = subject;

    const nameField = document.createElement("label");
    nameField.className = "field google-calendar-subject-name";
    const nameSpan = document.createElement("span");
    nameSpan.textContent = t("calendarName");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.maxLength = 100;
    nameInput.autocomplete = "off";
    nameInput.placeholder = subject;
    nameInput.value = settings.googleSubjectCalendarNames?.[subject] ?? "";
    nameInput.addEventListener("input", () => {
      setSubjectCalendarName(subject, nameInput.value);
      saveSettingsData();
    });
    nameField.append(nameSpan, nameInput);

    const colorRow = document.createElement("div");
    colorRow.className = "calendar-color-row";
    const colorLabel = document.createElement("span");
    colorLabel.className = "mini";
    colorLabel.textContent = t("googleCalendarColorLabel");
    const colorSlot = document.createElement("div");
    colorSlot.className = "calendar-color-slot";
    colorSlot.append(createColorPickerTrigger(subject, "calendar"));
    colorRow.append(colorLabel, colorSlot);

    row.append(label, nameField, colorRow);
    list.append(row);
  }

  updateGoogleSteps();
}

function setGoogleCalendarMode(mode, persist = true) {
  settings.googleCalendarMode = mode === "perSubject" ? "perSubject" : "single";
  renderGoogleCalendarsStep();
  if (persist) saveSettingsData();
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

let activeSyncControl = null;
let syncConfirmWaiter = null;

function makeSyncCancelledError() {
  const error = new Error("syncCancelled");
  error.code = "syncCancelled";
  return error;
}

function isSyncCancelledError(error) {
  return error?.code === "syncCancelled" || String(error?.message || error) === "syncCancelled";
}

function setSyncStopVisible(visible) {
  els.syncStopBtn?.classList.toggle("hidden", !visible);
  if (els.syncStopBtn) els.syncStopBtn.disabled = !visible ? false : els.syncStopBtn.disabled;
  if (visible && els.syncStopBtn) els.syncStopBtn.disabled = false;
}

function hideSyncConfirmClear() {
  els.syncConfirmClear?.classList.add("hidden");
  if (els.syncClearYesBtn) els.syncClearYesBtn.onclick = null;
  if (els.syncClearNoBtn) els.syncClearNoBtn.onclick = null;
  syncConfirmWaiter = null;
}

function requestSyncAbort() {
  if (!activeSyncControl) return;
  activeSyncControl.aborted = true;
  if (els.syncStopBtn) els.syncStopBtn.disabled = true;
  if (syncConfirmWaiter) {
    const { reject } = syncConfirmWaiter;
    hideSyncConfirmClear();
    reject(makeSyncCancelledError());
  }
}

function askClearExistingCalendar(info) {
  return new Promise((resolve, reject) => {
    if (!els.syncConfirmClear) {
      resolve(false);
      return;
    }

    const name = info?.calendarName || "Horari UPF";
    const tracked = Number(info?.trackedCount) || 0;
    els.syncConfirmClearText.textContent = tracked > 0
      ? t("syncClearExistingTracked").replace("{name}", name).replace("{n}", String(tracked))
      : t("syncClearExisting").replace("{name}", name);

    els.syncConfirmClear.classList.remove("hidden");
    setStatus(t("syncClearExistingHint"), "warning");

    syncConfirmWaiter = { resolve, reject };

    els.syncClearYesBtn.onclick = () => {
      hideSyncConfirmClear();
      setStatus(t("googleSyncKeepOpen"), "warning");
      resolve(true);
    };
    els.syncClearNoBtn.onclick = () => {
      hideSyncConfirmClear();
      setStatus(t("googleSyncKeepOpen"), "warning");
      resolve(false);
    };
  });
}

async function syncGoogleCalendar() {
  saveOrderFromContainer("theory");
  saveOrderFromContainer("seminar");
  saveOrderFromContainer("exam");
  readGoogleCalendarNameFromForm();
  await saveSettingsData();

  els.syncGoogleBtn.disabled = true;
  setStatus(t("googleSyncing"));
  showSyncProgress(true);
  updateSyncProgress({
    phase: "preparing",
    current: 0,
    total: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    failed: 0,
  });

  activeSyncControl = { aborted: false };
  setSyncStopVisible(true);

  try {
    validateForm();
    setStatus(t("reading"));
    const items = await readItemsFromUpf();
    subjectSeminarGroups = buildSubjectSeminarGroups(items);
    syncSelectedSeminarGroups([...selectedSubjects]);
    selectedSubjectsForExport(items);

    const calendarName = readGoogleCalendarNameFromForm();
    const job = window.UpfGoogleCalendar.prepareSyncJob(items, {
      shouldExport,
      normalizeSubject,
      makeUid,
      buildCleanSummary,
      buildDescription,
      parseUpfDateTime,
      includeHolidays: els.includeHolidays.checked,
      includeDescription: els.includeDescription.checked,
      selectedSubjects,
      isItemAllowedBySeminarGroup,
      getSubjectColorId,
      getEventColorId,
      calendarName,
      calendarMode: getGoogleCalendarMode(),
      getCalendarNameForSubject: getSubjectCalendarName,
      getCalendarColorHex,
      getSingleCalendarColorHex: () => getCalendarColorHex(GOOGLE_SINGLE_CALENDAR_KEY),
    });

    if (!job.events.length && !job.prepareFailures?.length) {
      throw new Error("errorNoEventsToExport");
    }

    setStatus(t("googleSyncKeepOpen"), "warning");
    updateSyncProgress({
      phase: "preparing",
      current: 0,
      total: job.events.length,
      created: 0,
      updated: 0,
      deleted: 0,
      failed: job.prepareFailures?.length || 0,
    });

    const result = await window.UpfGoogleCalendar.runPreparedSync(
      job,
      updateSyncProgress,
      {
        interactive: true,
        shouldAbort: () => Boolean(activeSyncControl?.aborted),
        confirmClearExisting: askClearExistingCalendar,
      }
    );
    applySyncResultToUi(result);
  } catch (error) {
    console.error(error);
    updateSyncProgress({
      phase: "error",
      current: 0,
      total: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      failed: 0,
    });
    if (isSyncCancelledError(error)) {
      setStatus(t("syncCancelled"), "warning");
    } else {
      setStatus(`${t("error")}: ${formatErrorMessage(error)}`, "error", { contactEmail: true });
    }
    els.syncGoogleBtn.disabled = false;
    window.setTimeout(() => showSyncProgress(false), 1800);
  } finally {
    activeSyncControl = null;
    setSyncStopVisible(false);
    hideSyncConfirmClear();
  }
}

function applySyncResultToUi(result) {
  updateSyncProgress({
    phase: "done",
    current: result.total,
    total: result.total,
    created: result.created,
    updated: result.updated,
    deleted: result.deleted,
    failed: result.failed,
  });

  const details = [
    `${t("googleCalendarUsed")}: ${result.calendarName}`,
    result.calendarCreated ? t("googleCalendarCreated") : "",
    `${t("googleCreated")}: ${result.created}`,
    `${t("googleUpdated")}: ${result.updated}`,
    `${t("ignored")}: ${result.skipped}`,
    result.deleted ? `${t("googleDeleted")}: ${result.deleted}` : "",
    result.failed ? `${t("googleFailed")}: ${result.failed}` : "",
  ].filter(Boolean);

  if (result.failures?.length) {
    details.push("", `${t("googleFailedList")}:`, formatFailedEvents(result.failures));
  }

  const succeeded = (Number(result.created) || 0) + (Number(result.updated) || 0) + (Number(result.deleted) || 0);
  const failed = Number(result.failed) || 0;

  if (failed > 0 && succeeded === 0) {
    setStatus(t("googleSyncFailed"), "error", { contactEmail: true });
  } else if (failed > 0) {
    setStatus(t("googleSyncPartial"), "warning", { contactEmail: true });
  } else {
    setStatus(t("googleSyncDoneSuccess"), "success", { support: true });
  }
  appendStatusDetails(details);

  els.syncGoogleBtn.disabled = false;
  window.setTimeout(() => showSyncProgress(false), 1800);
}

function showSyncProgress(visible) {
  if (!els.syncProgress) return;
  els.syncProgress.classList.toggle("hidden", !visible);
  if (!visible) {
    if (els.syncProgressFill) els.syncProgressFill.style.width = "0%";
    if (els.syncProgressBar) els.syncProgressBar.setAttribute("aria-valuenow", "0");
    if (els.syncProgressCount) els.syncProgressCount.textContent = "0/0";
    if (els.syncProgressDetail) els.syncProgressDetail.textContent = "";
    hideSyncConfirmClear();
    setSyncStopVisible(false);
  }
}

function updateSyncProgress(progress = {}) {
  if (!els.syncProgress) return;
  const current = Number(progress.current) || 0;
  const total = Number(progress.total) || 0;
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : (progress.phase === "done" ? 100 : 0);

  if (els.syncProgressFill) els.syncProgressFill.style.width = `${percent}%`;
  if (els.syncProgressBar) els.syncProgressBar.setAttribute("aria-valuenow", String(percent));
  if (els.syncProgressCount) {
    els.syncProgressCount.textContent = total > 0 ? `${current}/${total}` : `${percent}%`;
  }

  let label = t("syncProgressLabel");
  if (progress.phase === "preparing") label = t("syncProgressPreparing");
  if (progress.phase === "confirm") label = t("syncProgressConfirm");
  if (progress.phase === "clearing") label = t("syncProgressClearing");
  if (progress.phase === "syncing") label = t("syncProgressLabel");
  if (progress.phase === "cleanup") label = t("syncProgressCleanup");
  if (progress.phase === "done") label = t("syncProgressDone");
  if (progress.phase === "error") label = t("syncProgressError");
  if (els.syncProgressLabel) els.syncProgressLabel.textContent = label;

  const parts = [];
  if (progress.created) parts.push(`${t("googleCreated")}: ${progress.created}`);
  if (progress.updated) parts.push(`${t("googleUpdated")}: ${progress.updated}`);
  if (progress.deleted) parts.push(`${t("googleDeleted")}: ${progress.deleted}`);
  if (progress.failed) parts.push(`${t("googleFailed")}: ${progress.failed}`);
  if (els.syncProgressDetail) els.syncProgressDetail.textContent = parts.join(" · ");
}

function formatFailedEvents(failures) {
  const maxShown = 12;
  const lines = failures.slice(0, maxShown).map((failure, index) => {
    const label = failure.label || failure.title || "?";
    const reasonKey = failure.reason || "";
    const reasonText = reasonKey && t(reasonKey) !== reasonKey ? t(reasonKey) : reasonKey;
    return `${index + 1}. ${label}${reasonText ? ` — ${reasonText}` : ""}`;
  });
  if (failures.length > maxShown) {
    lines.push(t("googleFailedMore").replace("{n}", String(failures.length - maxShown)));
  }
  return lines.join("\n");
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
      // Room keeps "|" by default; other blocks only if explicitly enabled.
      if (token === "room") {
        normalized[kind][token].pipeSeparators = stored.pipeSeparators !== false;
      } else if (stored.pipeSeparators !== undefined) {
        normalized[kind][token].pipeSeparators = stored.pipeSeparators === true;
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
  const parts = (Array.isArray(tokens) && tokens.length ? tokens : ["subject", "room"])
    .filter((token) => getFormatBlockSetting(kind, token).enabled)
    .filter((token) => values[token])
    .map((token) => ({
      value: values[token],
      pipe: getFormatBlockSetting(kind, token).pipeSeparators === true,
    }));

  if (!parts.length) return "";

  let title = parts[0].value;
  for (let i = 1; i < parts.length; i += 1) {
    // One "|" between neighbors if either side asks for separators (never "||").
    const usePipe = parts[i - 1].pipe || parts[i].pipe;
    title += usePipe ? ` | ${parts[i].value}` : ` ${parts[i].value}`;
  }
  return title.trim();
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
    if (!isItemAllowedBySeminarGroup(item)) continue;

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
    renderGoogleCalendarsStep();
    return;
  }

  const openCards = collectOpenSubjectCards();

  els.subjectsList.className = "subjects-list";
  els.subjectsList.textContent = "";

  subjects.forEach((subject) => {
    const flags = getSubjectTypeFlags(subject);
    const isGoogle = document.body.classList.contains("mode-google");
    const hasTypeOptions = isGoogle && (flags.seminar || flags.exam);
    const hasMultiGroups = hasMultipleSeminarGroups(subject);

    if (hasTypeOptions || hasMultiGroups) {
      els.subjectsList.append(createExpandableSubjectCard(subject, flags, openCards.has(subject)));
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "subject-card subject-card-simple";
    wrapper.append(createSubjectMainRow(subject));
    els.subjectsList.append(wrapper);
  });

  renderGoogleCalendarsStep();
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
    subjectSeminarGroups = buildSubjectSeminarGroups(items);

    const subjects = [...new Set(
      items
        .filter((item) => shouldExport(item, els.includeHolidays.checked))
        .map(normalizeSubject)
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    selectedSubjects = new Set(subjects);
    acknowledgedSeminarGroupWarnings = new Set();
    seminarGroupChipInteracted = new Set();
    syncSelectedSeminarGroups(subjects, { reset: true });
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
    subjectSeminarGroups = buildSubjectSeminarGroups(items);
    syncSelectedSeminarGroups([...selectedSubjects]);
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

      setStatus(t("exportDoneSuccess"), "success", { support: true });
      appendStatusDetails([
        t("createdMany"),
        `${t("exportedSubjects")}: ${subjects.length}`,
        `${t("exported")}: ${totalExported}`,
      ]);
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

      setStatus(t("exportDoneSuccess"), "success", { support: true });
      appendStatusDetails([
        t("createdOne"),
        `${t("received")}: ${result.received}`,
        `${t("exported")}: ${result.exported}`,
        `${t("ignored")}: ${result.ignored}`,
      ]);
    }
  } catch (error) {
    console.error(error);
    setStatus(`${t("error")}: ${formatErrorMessage(error)}`, "error", { contactEmail: true });
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

  if (els.formatBlockRoomSepWrap) {
    els.formatBlockRoomSepWrap.classList.remove("hidden");
  }
  if (els.formatBlockRoomSeparators) {
    els.formatBlockRoomSeparators.checked = config.pipeSeparators === true;
  }
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
  if (els.formatBlockRoomSeparators) {
    config.pipeSeparators = els.formatBlockRoomSeparators.checked;
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
  ignoreFormatBlockOutsideClick = true;
  setTimeout(() => {
    ignoreFormatBlockOutsideClick = false;
  }, 50);
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
    gear.textContent = "\u2699";
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
  renderSavedColorsBar();
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
    language: SUPPORTED_LANGUAGES.includes(storedSettings.language)
      ? storedSettings.language
      : DEFAULT_SETTINGS.language,
    formats: normalizeFormats(storedSettings.formats),
    formatBlockSettings: normalizeFormatBlockSettings(storedSettings.formatBlockSettings),
    subjectColors: storedSettings.subjectColors || {},
    subjectTypeColors: storedSettings.subjectTypeColors || {},
    googleCalendarName: storedSettings.googleCalendarName ?? DEFAULT_SETTINGS.googleCalendarName,
    googleCalendarMode: storedSettings.googleCalendarMode === "perSubject" ? "perSubject" : "single",
    googleCalendarColors: storedSettings.googleCalendarColors || {},
    googleSubjectCalendarNames: storedSettings.googleSubjectCalendarNames || {},
    savedColors: Array.isArray(storedSettings.savedColors)
      ? storedSettings.savedColors.map((hex) => normalizePickerHex(hex)).filter(Boolean)
      : [],
    preferredMode: storedSettings.preferredMode === "manual" ? "manual" : "google",
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
els.syncStopBtn?.addEventListener("click", requestSyncAbort);
els.modeManualBtn?.addEventListener("click", () => setMode("manual"));
els.modeGoogleBtn?.addEventListener("click", () => setMode("google"));

window.addEventListener("resize", repositionOpenColorPalette);

document.addEventListener("click", (event) => {
  if (
    !ignoreColorPaletteOutsideClick &&
    !eyedropperActive &&
    !els.colorPalettePopover?.classList.contains("hidden")
  ) {
    if (!event.target.closest(".color-picker-trigger") && !event.target.closest("#colorPalettePopover")) {
      closeColorPalette();
    }
  }

  if (!ignoreFormatBlockOutsideClick && !els.formatBlockPopover?.classList.contains("hidden")) {
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

els.formatBlockRoomSeparators?.addEventListener("change", applyFormatBlockPopoverChanges);

els.formatBlockEnabledBtn?.addEventListener("click", toggleFormatBlockEnabled);
els.formatBlockResetBtn?.addEventListener("click", resetActiveFormatBlockSettings);
els.resetFormatSettingsBtn?.addEventListener("click", resetAllFormatSettings);

els.settingsBtn.addEventListener("click", openSettings);
els.closeSettings.addEventListener("click", closeSettings);
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
  closeColorPalette();
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
els.googleCalendarModePicker?.addEventListener("click", (event) => {
  const button = event.target.closest(".calendar-mode-card[data-mode]");
  if (!button || !els.googleCalendarModePicker.contains(button)) return;
  setGoogleCalendarMode(button.dataset.mode);
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
  setMode(settings.preferredMode || "google", false);
  renderGoogleCalendarsStep();
  updateVersionLabel();
  applyI18n();
  await restoreSessionState();
  if (detectedSubjects.length) {
    assignDefaultSubjectColors(detectedSubjects);
    renderSubjects(detectedSubjects, true);
  }
  await checkGoogleConnection();
  chrome.storage.local.remove(["upfGoogleSyncState", "upfGoogleSyncPendingJob"]);
})();
