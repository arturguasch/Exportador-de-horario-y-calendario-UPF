(function () {
"use strict";

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_USERINFO_API = "https://www.googleapis.com/oauth2/v2/userinfo";
const UID_MAP_KEY = "upfGoogleEventMap";
const TOKEN_STORAGE_KEY = "upfGoogleAuthToken";
const UPF_CALENDAR_STORAGE_KEY = "upfGoogleCalendar";
const UPF_CALENDARS_MAP_KEY = "upfGoogleCalendarsMap";
const SINGLE_CALENDAR_KEY = "__single__";
const UPF_CALENDAR_NAME = "Horari UPF";
const UPF_CALENDAR_TIMEZONE = "Europe/Madrid";
const EVENT_LABEL_VERSION = "eventLabelVersion=1";

// 24 colors in Google Calendar picker order (warm → cool → neutral).
const GOOGLE_COLOR_PRESETS = [
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

function normalizeColorHex(hex) {
  let value = String(hex || "").trim().toLowerCase();
  if (!value) return "";
  if (!value.startsWith("#")) value = `#${value}`;
  return value;
}

const CUSTOM_COLOR_PREFIX = "custom:";

function isCustomColorRef(value) {
  return typeof value === "string" && value.startsWith(CUSTOM_COLOR_PREFIX);
}

function customLabelIdFromHex(hex) {
  const h = normalizeColorHex(hex).replace("#", "");
  if (!/^[0-9a-f]{6}$/.test(h)) return null;
  return `11111111-${h.slice(0, 4)}-4000-8000-${h.slice(4).padEnd(12, "0")}`;
}

function resolveColorRef(colorRef) {
  if (!colorRef) return null;

  if (isCustomColorRef(colorRef)) {
    const hex = normalizeColorHex(colorRef.slice(CUSTOM_COLOR_PREFIX.length));
    if (!/^#[0-9a-f]{6}$/.test(hex)) return null;
    const eventLabelId = customLabelIdFromHex(hex);
    if (!eventLabelId) return null;
    return { eventLabelId, hex };
  }

  if (isLabelColorId(colorRef)) {
    const preset = GOOGLE_COLOR_PRESETS.find((entry) => entry.id === colorRef);
    return { eventLabelId: colorRef, hex: preset?.hex || null };
  }

  return { colorId: String(colorRef) };
}

function collectUsedLabelColors(events) {
  const colors = new Map();

  for (const entry of events) {
    const labelId = entry?.body?.eventLabelId;
    if (!labelId || !isLabelColorId(labelId)) continue;

    const hex = entry.labelHex || GOOGLE_COLOR_PRESETS.find((preset) => preset.id === labelId)?.hex;
    if (!hex) continue;
    colors.set(labelId, hex);
  }

  return colors;
}

function applyLabelIdRemap(events, idRemap) {
  if (!(idRemap instanceof Map) || !idRemap.size) return;

  for (const entry of events) {
    const body = entry?.body;
    if (!body?.eventLabelId) continue;

    const mapped = idRemap.get(body.eventLabelId);
    if (mapped) {
      body.eventLabelId = mapped;
    } else {
      delete body.eventLabelId;
    }
  }
}

function stripEventLabelIds(events) {
  for (const entry of events) {
    if (entry?.body?.eventLabelId) delete entry.body.eventLabelId;
  }
}

function isInvalidEventLabelError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("invalid event label id");
}

async function ensureCalendarLabels(token, calendarId, neededLabelColors) {
  const idRemap = new Map();
  if (!(neededLabelColors instanceof Map) || !neededLabelColors.size) return idRemap;

  const calendarPath = `/calendars/${encodeURIComponent(calendarId)}?${EVENT_LABEL_VERSION}`;
  let existing = [];

  try {
    const calendar = await calendarRequest(token, calendarPath);
    existing = calendar?.labelProperties?.eventLabels || [];
  } catch (error) {
    console.warn("UPF labels read failed", error);
    return idRemap;
  }

  const hexToId = new Map();
  const existingIds = new Set();

  for (const label of existing) {
    if (!label?.id) continue;
    existingIds.add(label.id);
    const hex = normalizeColorHex(label.backgroundColor);
    if (hex) hexToId.set(hex, label.id);
  }

  const merged = [...existing];
  let changed = false;

  for (const [desiredId, hexValue] of neededLabelColors) {
    const hex = normalizeColorHex(hexValue);
    if (!/^#[0-9a-f]{6}$/.test(hex)) continue;

    const existingIdForHex = hexToId.get(hex);
    if (existingIdForHex) {
      idRemap.set(desiredId, existingIdForHex);
      continue;
    }

    if (existingIds.has(desiredId)) {
      idRemap.set(desiredId, desiredId);
      continue;
    }

    merged.push({
      id: desiredId,
      backgroundColor: hex,
    });
    hexToId.set(hex, desiredId);
    existingIds.add(desiredId);
    idRemap.set(desiredId, desiredId);
    changed = true;
  }

  if (!changed) return idRemap;

  try {
    await calendarRequest(token, calendarPath, {
      method: "PATCH",
      body: JSON.stringify({
        labelProperties: {
          eventLabels: merged,
        },
      }),
    });
  } catch (error) {
    console.warn("UPF labels patch failed", error);
    for (const [desiredId, actualId] of [...idRemap.entries()]) {
      if (actualId === desiredId) idRemap.delete(desiredId);
    }
  }

  return idRemap;
}

function isLabelColorId(value) {
  return typeof value === "string" && value.includes("-");
}

function getOAuthClientId() {
  const configured = globalThis.UPF_OAUTH_CONFIG?.webClientId;
  return configured || "771957706968-d60p0k5afl5l4kj7f6gm0al4buu0qu0s.apps.googleusercontent.com";
}

const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function lastSunday(year, monthIndex) {
  const date = new Date(year, monthIndex + 1, 0);
  while (date.getDay() !== 0) date.setDate(date.getDate() - 1);
  return date;
}

function madridOffsetHours(year, month, day, hour, minute, second) {
  const probe = new Date(year, month - 1, day, hour, minute, second || 0, 0);
  const y = probe.getFullYear();
  const dstStart = lastSunday(y, 2);
  dstStart.setHours(2, 0, 0, 0);
  const dstEnd = lastSunday(y, 9);
  dstEnd.setHours(3, 0, 0, 0);
  return probe >= dstStart && probe < dstEnd ? 2 : 1;
}

function parseUpfToParts(value) {
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

function partsToDate(parts) {
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
}

function dateToParts(date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  };
}

function formatGoogleDateTime(parts) {
  const offset = madridOffsetHours(
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return [
    parts.year,
    "-",
    pad(parts.month),
    "-",
    pad(parts.day),
    "T",
    pad(parts.hour),
    ":",
    pad(parts.minute),
    ":",
    pad(parts.second),
    "+",
    pad(offset),
    ":00",
  ].join("");
}

function sanitizeText(value, maxLen = 1024) {
  return String(value ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim()
    .slice(0, maxLen);
}

function getRedirectUrl() {
  return chrome.identity.getRedirectURL();
}

function parseAuthResponse(responseUrl) {
  const url = new URL(responseUrl);
  const params = new URLSearchParams(
    url.hash && url.hash.length > 1 ? url.hash.slice(1) : url.search.slice(1)
  );

  const error = params.get("error");
  if (error) {
    const description = params.get("error_description") || error;
    if (error === "redirect_uri_mismatch") {
      throw new Error(
        `redirect_uri_mismatch. A Google Cloud, credencial tipo Aplicacion web, anade: ${getRedirectUrl()}`
      );
    }
    throw new Error(description);
  }

  const accessToken = params.get("access_token");
  if (!accessToken) {
    throw new Error("No access token received");
  }

  const expiresIn = Number(params.get("expires_in") || 3600);
  return {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000 - 120000,
  };
}

async function saveToken(tokenData) {
  await chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: tokenData });
}

async function loadToken() {
  const data = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
  return data[TOKEN_STORAGE_KEY] || null;
}

async function loadStoredCalendar() {
  const data = await chrome.storage.local.get(UPF_CALENDAR_STORAGE_KEY);
  return data[UPF_CALENDAR_STORAGE_KEY] || null;
}

async function saveStoredCalendar(calendar) {
  await chrome.storage.local.set({
    [UPF_CALENDAR_STORAGE_KEY]: {
      id: calendar.id,
      summary: calendar.summary || UPF_CALENDAR_NAME,
    },
  });
}

async function loadStoredCalendarsMap() {
  const data = await chrome.storage.local.get({
    [UPF_CALENDARS_MAP_KEY]: null,
    [UPF_CALENDAR_STORAGE_KEY]: null,
  });
  if (data[UPF_CALENDARS_MAP_KEY] && typeof data[UPF_CALENDARS_MAP_KEY] === "object") {
    return { ...data[UPF_CALENDARS_MAP_KEY] };
  }
  if (data[UPF_CALENDAR_STORAGE_KEY]?.id) {
    return { [SINGLE_CALENDAR_KEY]: data[UPF_CALENDAR_STORAGE_KEY] };
  }
  return {};
}

async function saveStoredCalendarForKey(key, calendar) {
  const map = await loadStoredCalendarsMap();
  map[key] = {
    id: calendar.id,
    summary: calendar.summary || UPF_CALENDAR_NAME,
  };
  await chrome.storage.local.set({ [UPF_CALENDARS_MAP_KEY]: map });
  if (key === SINGLE_CALENDAR_KEY) {
    await saveStoredCalendar(calendar);
  }
}

function contrastForeground(hex) {
  const raw = String(hex || "").replace("#", "");
  if (raw.length !== 6) return "#ffffff";
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#000000" : "#ffffff";
}

async function applyCalendarColor(token, calendarId, colorHex) {
  if (!calendarId || !colorHex) return;
  await calendarRequest(
    token,
    `/users/me/calendarList/${encodeURIComponent(calendarId)}?colorRgbFormat=true`,
    {
      method: "PATCH",
      body: JSON.stringify({
        backgroundColor: colorHex,
        foregroundColor: contrastForeground(colorHex),
      }),
    }
  );
}

async function launchWebAuthFlow(interactive = true) {
  const redirectUrl = getRedirectUrl();
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", getOAuthClientId());
  authUrl.searchParams.set("response_type", "token");
  authUrl.searchParams.set("redirect_uri", redirectUrl);
  authUrl.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  authUrl.searchParams.set("prompt", "select_account");
  authUrl.searchParams.set("include_granted_scopes", "true");

  const responseUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive,
    }, (redirectedTo) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!redirectedTo) {
        reject(new Error("OAuth flow cancelled"));
        return;
      }
      resolve(redirectedTo);
    });
  });

  const tokenData = parseAuthResponse(responseUrl);
  await saveToken(tokenData);
  return tokenData.accessToken;
}

async function getAuthToken(interactive = true) {
  const stored = await loadToken();
  if (stored?.accessToken && stored.expiresAt > Date.now()) {
    return stored.accessToken;
  }

  if (!interactive) {
    throw new Error("No valid token");
  }

  return launchWebAuthFlow(true);
}

async function getUserEmail(token) {
  const response = await fetch(GOOGLE_USERINFO_API, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`User info HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.email || "";
}

function formatCalendarError(path, status, text) {
  let detail = text;
  try {
    const parsed = JSON.parse(text);
    const apiMessage = parsed?.error?.message;
    const first = parsed?.error?.errors?.[0];
    if (apiMessage && first?.reason) {
      detail = `${apiMessage} (${first.reason})`;
    } else if (apiMessage) {
      detail = apiMessage;
    }
  } catch (error) {
    // Keep raw text.
  }
  return `Calendar API ${status} [${path}]: ${detail}`;
}

async function calendarRequest(token, path, options = {}) {
  const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(formatCalendarError(path, response.status, text));
  }

  if (response.status === 204) return null;
  return response.json();
}

async function findCalendarInList(token, name) {
  let pageToken = "";

  do {
    const query = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "";
    const list = await calendarRequest(token, `/users/me/calendarList${query}`);
    const match = (list.items || []).find((entry) => entry.summary === name);
    if (match?.id) {
      return { id: match.id, summary: match.summary || name };
    }
    pageToken = list.nextPageToken || "";
  } while (pageToken);

  return null;
}

async function findCalendarByIdInList(token, calendarId) {
  if (!calendarId) return null;
  let pageToken = "";

  do {
    const query = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "";
    const list = await calendarRequest(token, `/users/me/calendarList${query}`);
    const match = (list.items || []).find((entry) => entry.id === calendarId);
    if (match?.id) {
      return { id: match.id, summary: match.summary || UPF_CALENDAR_NAME };
    }
    pageToken = list.nextPageToken || "";
  } while (pageToken);

  return null;
}

function isGoneError(error) {
  const message = String(error?.message || error || "");
  return /\bCalendar API (404|410)\b/.test(message);
}

async function purgeUidMapForCalendar(calendarId) {
  if (!calendarId) return;
  const uidMap = await loadUidMap();
  let changed = false;
  for (const [uid, entry] of Object.entries(uidMap)) {
    if (entry?.calendarId === calendarId) {
      delete uidMap[uid];
      changed = true;
    }
  }
  if (changed) await saveUidMap(uidMap);
}

async function createUpfCalendar(token, calendarName) {
  const name = (calendarName || "").trim() || UPF_CALENDAR_NAME;
  const created = await calendarRequest(token, "/calendars", {
    method: "POST",
    body: JSON.stringify({
      summary: name,
    }),
  });

  return { id: created.id, summary: created.summary || name };
}

async function resolveUpfCalendar(token, calendarName, storageKey = SINGLE_CALENDAR_KEY) {
  const name = (calendarName || "").trim() || UPF_CALENDAR_NAME;
  const map = await loadStoredCalendarsMap();
  const stored = map[storageKey] || null;

  const byName = await findCalendarInList(token, name);
  if (byName) {
    if (stored?.id && stored.id !== byName.id) {
      await purgeUidMapForCalendar(stored.id);
    }
    await saveStoredCalendarForKey(storageKey, byName);
    return { calendar: byName, created: false };
  }

  if (stored?.id) {
    // Només reutilitza el calendari desat si encara és a la llista activa.
    // GET /calendars/{id} pot respondre per calendaris a la paperera; la llista no.
    const inList = await findCalendarByIdInList(token, stored.id);
    if (inList) {
      if (inList.summary !== name) {
        const updated = await calendarRequest(
          token,
          `/calendars/${encodeURIComponent(inList.id)}`,
          { method: "PATCH", body: JSON.stringify({ summary: name }) }
        );
        const calendar = { id: inList.id, summary: updated?.summary || name };
        await saveStoredCalendarForKey(storageKey, calendar);
        return { calendar, created: false };
      }

      await saveStoredCalendarForKey(storageKey, inList);
      return { calendar: inList, created: false };
    }

    await purgeUidMapForCalendar(stored.id);
  }

  const created = await createUpfCalendar(token, name);
  await saveStoredCalendarForKey(storageKey, created);
  return { calendar: created, created: true };
}

async function loadUidMap() {
  const data = await chrome.storage.local.get({ [UID_MAP_KEY]: {} });
  return data[UID_MAP_KEY] || {};
}

async function saveUidMap(map) {
  await chrome.storage.local.set({ [UID_MAP_KEY]: map });
}

function compareParts(a, b) {
  const key = (parts) => [
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  ].map((value) => String(value).padStart(2, "0")).join("-");

  return key(a).localeCompare(key(b));
}

function addMinutesToParts(parts, minutes) {
  const totalMinutes = parts.hour * 60 + parts.minute + minutes;
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  return { ...parts, hour, minute };
}

function buildGoogleEvent(item, helpers) {
  const startParts = parseUpfToParts(item.start);
  const endParts = parseUpfToParts(item.end);
  if (!startParts || !endParts) {
    throw new Error("errorInvalidDate");
  }

  let endPartsForEvent = endParts;
  if (compareParts(endParts, startParts) <= 0) {
    endPartsForEvent = addMinutesToParts(startParts, 15);
  }

  const summary = sanitizeText(helpers.buildCleanSummary(item));
  if (!summary) {
    throw new Error("errorEmptyEventTitle");
  }

  const event = {
    summary,
    start: {
      dateTime: formatGoogleDateTime(startParts),
      timeZone: UPF_CALENDAR_TIMEZONE,
    },
    end: {
      dateTime: formatGoogleDateTime(endPartsForEvent),
      timeZone: UPF_CALENDAR_TIMEZONE,
    },
  };

  if (helpers.includeDescription) {
    const description = sanitizeText(helpers.buildDescription(item), 8000);
    if (description) event.description = description;
  }

  if (helpers.eventReminderEnabled) {
    const minutes = Math.floor(Number(helpers.eventReminderMinutes));
    if (Number.isFinite(minutes) && minutes >= 0) {
      event.reminders = {
        useDefault: false,
        overrides: [{
          method: "popup",
          minutes: Math.min(minutes, 40320),
        }],
      };
    }
  }

  // Calendar sidebar colour comes from the calendar resource itself.
  // Event colours (main / seminar / exam) are applied here in both modes.
  const subject = helpers.normalizeSubject(item);
  const colorRef = helpers.getEventColorId?.(item) ?? helpers.getSubjectColorId?.(subject);
  const resolved = resolveColorRef(colorRef);
  if (resolved?.eventLabelId) {
    event.eventLabelId = resolved.eventLabelId;
  } else if (resolved?.colorId) {
    event.colorId = resolved.colorId;
  }

  return event;
}

async function connectGoogle() {
  const token = await getAuthToken(true);
  const email = await getUserEmail(token);
  await chrome.storage.local.set({ upfGoogleConnection: { email } });
  return email;
}

async function disconnectGoogle() {
  await chrome.storage.local.remove(TOKEN_STORAGE_KEY);
  await chrome.storage.local.remove("upfGoogleConnection");
  await chrome.storage.local.remove(UID_MAP_KEY);
  await chrome.storage.local.remove(UPF_CALENDAR_STORAGE_KEY);
  await chrome.storage.local.remove(UPF_CALENDARS_MAP_KEY);
}

async function getStoredConnection() {
  const data = await chrome.storage.local.get({ upfGoogleConnection: null });
  return data.upfGoogleConnection;
}

function prepareSyncJob(items, helpers) {
  const calendarName = (helpers.calendarName || "").trim() || UPF_CALENDAR_NAME;
  const calendarMode = helpers.calendarMode === "perSubject" ? "perSubject" : "single";
  const exportable = items.filter((item) => helpers.shouldExport(item, helpers.includeHolidays));
  const events = [];
  const failures = [];
  let skipped = 0;

  for (const item of exportable) {
    const subject = helpers.normalizeSubject(item);
    if (!subject) {
      skipped += 1;
      continue;
    }
    if (helpers.selectedSubjects?.size && !helpers.selectedSubjects.has(subject)) {
      skipped += 1;
      continue;
    }
    if (helpers.isItemAllowedBySeminarGroup && !helpers.isItemAllowedBySeminarGroup(item)) {
      skipped += 1;
      continue;
    }

    let summary = "";
    try {
      summary = sanitizeText(helpers.buildCleanSummary(item));
    } catch (error) {
      skipped += 1;
      continue;
    }
    if (!summary) {
      skipped += 1;
      continue;
    }

    const when = String(item?.start || item?.end || "").trim();
    const label = when ? `${summary} (${when})` : summary;

    try {
      const body = buildGoogleEvent(item, helpers);
      const colorRef = helpers.getEventColorId?.(item) ?? helpers.getSubjectColorId?.(subject);
      const resolved = resolveColorRef(colorRef);
      events.push({
        uid: helpers.makeUid(item),
        body,
        label,
        subject,
        labelHex: resolved?.hex || null,
      });
    } catch (error) {
      failures.push({
        title: summary || subject,
        when,
        action: "prepare",
        reason: error?.message || String(error || "unknown"),
        label,
      });
    }
  }

  let calendars;
  if (calendarMode === "perSubject") {
    const bySubject = new Map();
    for (const event of events) {
      if (!bySubject.has(event.subject)) bySubject.set(event.subject, []);
      bySubject.get(event.subject).push(event);
    }
    calendars = [...bySubject.entries()].map(([subject, subjectEvents]) => ({
      key: subject,
      name: (helpers.getCalendarNameForSubject?.(subject) || subject).trim() || subject,
      colorHex: helpers.getCalendarColorHex?.(subject) || null,
      events: subjectEvents,
    }));
  } else {
    calendars = [{
      key: SINGLE_CALENDAR_KEY,
      name: calendarName,
      colorHex: helpers.getSingleCalendarColorHex?.() || null,
      events,
    }];
  }

  return {
    calendarMode,
    calendarName,
    calendars,
    events,
    skipped,
    prepareFailures: failures,
    total: exportable.length,
  };
}

async function writeCalendarEventEntry(token, { eventsPath, eventsBase, existing, calendarId, body }) {
  const payload = { ...body };

  const performWrite = async (eventBody) => {
    if (existing?.eventId && existing.calendarId === calendarId) {
      try {
        await calendarRequest(
          token,
          `${eventsPath}/${encodeURIComponent(existing.eventId)}?${EVENT_LABEL_VERSION}`,
          { method: "PATCH", body: JSON.stringify(eventBody) }
        );
        return { mode: "updated", eventId: existing.eventId };
      } catch (error) {
        if (!isGoneError(error)) throw error;
        const createdEvent = await calendarRequest(
          token,
          eventsBase,
          { method: "POST", body: JSON.stringify(eventBody) }
        );
        return { mode: "created", eventId: createdEvent.id };
      }
    }

    const createdEvent = await calendarRequest(
      token,
      eventsBase,
      { method: "POST", body: JSON.stringify(eventBody) }
    );
    return { mode: "created", eventId: createdEvent.id };
  };

  try {
    return await performWrite(payload);
  } catch (error) {
    if (!isInvalidEventLabelError(error) || !payload.eventLabelId) throw error;
    const fallback = { ...payload };
    delete fallback.eventLabelId;
    return performWrite(fallback);
  }
}

async function runPreparedSync(job, onProgress = () => {}, options = {}) {
  const progressCb = typeof onProgress === "function" ? onProgress : () => {};
  const interactive = options.interactive !== false;
  const shouldAbort = typeof options.shouldAbort === "function" ? options.shouldAbort : () => false;
  const confirmClearExisting =
    typeof options.confirmClearExisting === "function" ? options.confirmClearExisting : null;

  const throwIfAborted = () => {
    if (shouldAbort()) {
      const error = new Error("syncCancelled");
      error.code = "syncCancelled";
      throw error;
    }
  };

  const token = await getAuthToken(interactive);
  throwIfAborted();

  const calendarTargets = Array.isArray(job.calendars) && job.calendars.length
    ? job.calendars
    : [{
        key: SINGLE_CALENDAR_KEY,
        name: (job.calendarName || "").trim() || UPF_CALENDAR_NAME,
        colorHex: null,
        events: Array.isArray(job.events) ? job.events : [],
      }];

  const preparedEvents = calendarTargets.flatMap((target) => target.events || []);
  const failures = [...(job.prepareFailures || [])];
  let skipped = Number(job.skipped) || 0;
  let created = 0;
  let updated = 0;
  let deleted = 0;
  let failed = failures.length;
  let firstError = failures.length ? new Error(failures[0].reason) : null;
  let processed = 0;
  let anyCalendarCreated = false;
  const resolvedCalendars = [];

  progressCb({
    phase: "preparing",
    current: 0,
    total: preparedEvents.length,
    created,
    updated,
    deleted,
    failed,
  });

  const resolvedTargets = [];
  for (const target of calendarTargets) {
    throwIfAborted();
    const { calendar, created: calendarCreated } = await resolveUpfCalendar(
      token,
      target.name,
      target.key || SINGLE_CALENDAR_KEY
    );
    if (calendarCreated) anyCalendarCreated = true;
    resolvedCalendars.push(calendar.summary || target.name);
    resolvedTargets.push({
      ...target,
      calendar,
      calendarCreated,
      calendarId: calendar.id,
    });

    try {
      const neededLabelColors = collectUsedLabelColors(target.events || []);
      const labelIdRemap = await ensureCalendarLabels(token, calendar.id, neededLabelColors);
      applyLabelIdRemap(target.events || [], labelIdRemap);
    } catch (error) {
      console.warn("UPF labels setup failed, syncing without event colors", error);
      stripEventLabelIds(target.events || []);
    }

    if (target.colorHex) {
      try {
        await applyCalendarColor(token, calendar.id, target.colorHex);
      } catch (error) {
        console.warn("UPF calendar color failed", error);
      }
    }
  }

  const uidMap = await loadUidMap();
  const activeUids = new Set();
  const targetIds = new Set(resolvedTargets.map((entry) => entry.calendarId));

  let clearExisting = false;
  let removeOrphans = true;

  if (!anyCalendarCreated && confirmClearExisting) {
    const trackedCount = Object.values(uidMap).filter(
      (entry) => entry?.eventId && targetIds.has(entry.calendarId)
    ).length;
    const displayName = resolvedCalendars.length > 1
      ? resolvedCalendars.join(", ")
      : (resolvedCalendars[0] || UPF_CALENDAR_NAME);
    progressCb({
      phase: "confirm",
      current: 0,
      total: preparedEvents.length,
      created,
      updated,
      deleted,
      failed,
      calendarName: displayName,
      trackedCount,
    });
    clearExisting = await confirmClearExisting({
      calendarName: displayName,
      trackedCount,
    });
    throwIfAborted();
    removeOrphans = clearExisting;
  }

  if (clearExisting) {
    progressCb({
      phase: "clearing",
      current: 0,
      total: preparedEvents.length,
      created,
      updated,
      deleted,
      failed,
    });

    for (const [uid, entry] of Object.entries(uidMap)) {
      throwIfAborted();
      if (!entry?.eventId || !targetIds.has(entry.calendarId)) continue;
      try {
        await calendarRequest(
          token,
          `/calendars/${encodeURIComponent(entry.calendarId)}/events/${encodeURIComponent(entry.eventId)}`,
          { method: "DELETE" }
        );
        delete uidMap[uid];
        deleted += 1;
      } catch (error) {
        if (isGoneError(error)) {
          delete uidMap[uid];
          deleted += 1;
        } else {
          failed += 1;
          if (!firstError) firstError = error;
          failures.push({
            title: uid,
            when: "",
            action: "delete",
            reason: error?.message || String(error || "unknown"),
            label: `${uid}`,
          });
          console.error("UPF sync pre-clear failed", uid, error);
        }
      }
      progressCb({
        phase: "clearing",
        current: 0,
        total: preparedEvents.length,
        created,
        updated,
        deleted,
        failed,
      });
    }
    await saveUidMap(uidMap);
  }

  progressCb({
    phase: "syncing",
    current: 0,
    total: preparedEvents.length,
    created,
    updated,
    deleted,
    failed,
  });

  for (const target of resolvedTargets) {
    const calendarId = target.calendarId;
    const eventsPath = `/calendars/${encodeURIComponent(calendarId)}/events`;
    const eventsBase = `${eventsPath}?${EVENT_LABEL_VERSION}`;

    for (const entry of target.events || []) {
      throwIfAborted();
      const uid = entry.uid;
      const body = entry.body;
      activeUids.add(uid);

      try {
        const existing = uidMap[uid];
        const result = await writeCalendarEventEntry(token, {
          eventsPath,
          eventsBase,
          existing,
          calendarId,
          body,
        });

        uidMap[uid] = {
          eventId: result.eventId,
          calendarId,
          syncedAt: Date.now(),
        };
        if (result.mode === "updated") updated += 1;
        else created += 1;
      } catch (error) {
        failed += 1;
        if (!firstError) firstError = error;
        failures.push({
          title: entry.label || uid,
          when: "",
          action: "sync",
          reason: error?.message || String(error || "unknown"),
          label: entry.label || uid,
        });
        console.error("UPF sync item failed", entry, error);
      }

      processed += 1;
      progressCb({
        phase: "syncing",
        current: processed,
        total: preparedEvents.length,
        created,
        updated,
        deleted,
        failed,
      });
    }
  }

  if (removeOrphans) {
    progressCb({
      phase: "cleanup",
      current: processed,
      total: preparedEvents.length,
      created,
      updated,
      deleted,
      failed,
    });

    for (const [uid, entry] of Object.entries(uidMap)) {
      throwIfAborted();
      if (activeUids.has(uid)) continue;
      if (!entry?.eventId || !targetIds.has(entry.calendarId)) continue;

      try {
        await calendarRequest(
          token,
          `/calendars/${encodeURIComponent(entry.calendarId)}/events/${encodeURIComponent(entry.eventId)}`,
          { method: "DELETE" }
        );
        delete uidMap[uid];
        deleted += 1;
      } catch (error) {
        if (isGoneError(error)) {
          delete uidMap[uid];
          deleted += 1;
        } else {
          failed += 1;
          if (!firstError) firstError = error;
          failures.push({
            title: uid,
            when: "",
            action: "delete",
            reason: error?.message || String(error || "unknown"),
            label: `${uid}`,
          });
          console.error("UPF sync delete failed", uid, error);
        }
      }
      progressCb({
        phase: "cleanup",
        current: processed,
        total: preparedEvents.length,
        created,
        updated,
        deleted,
        failed,
      });
    }
  }

  await saveUidMap(uidMap);
  throwIfAborted();

  if (failed > 0 && created === 0 && updated === 0 && deleted === 0) {
    throw firstError || new Error("errorGoogleSyncNone");
  }

  progressCb({
    phase: "done",
    current: preparedEvents.length,
    total: preparedEvents.length,
    created,
    updated,
    deleted,
    failed,
  });

  return {
    created,
    updated,
    deleted,
    skipped,
    failed,
    failures,
    total: Number(job.total) || preparedEvents.length,
    calendarName: resolvedCalendars.length > 1
      ? resolvedCalendars.join(", ")
      : (resolvedCalendars[0] || UPF_CALENDAR_NAME),
    calendarCreated: anyCalendarCreated,
    clearedExisting: clearExisting,
  };
}

async function syncEvents(items, helpers) {
  const onProgress = typeof helpers.onProgress === "function" ? helpers.onProgress : () => {};
  onProgress({
    phase: "preparing",
    current: 0,
    total: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    failed: 0,
  });
  const job = prepareSyncJob(items, helpers);
  return runPreparedSync(job, onProgress, { interactive: true });
}

globalThis.UpfGoogleCalendar = {
  getAuthToken,
  getUserEmail,
  connectGoogle,
  disconnectGoogle,
  getStoredConnection,
  syncEvents,
  prepareSyncJob,
  runPreparedSync,
  getRedirectUrl,
  UPF_CALENDAR_NAME,
  COLOR_PRESETS: GOOGLE_COLOR_PRESETS,
  CUSTOM_COLOR_PREFIX,
  resolveColorRef,
};

})();
