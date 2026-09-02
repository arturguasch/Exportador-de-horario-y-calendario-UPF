(function () {
"use strict";

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_USERINFO_API = "https://www.googleapis.com/oauth2/v2/userinfo";
const UID_MAP_KEY = "upfGoogleEventMap";
const TOKEN_STORAGE_KEY = "upfGoogleAuthToken";
const UPF_CALENDAR_STORAGE_KEY = "upfGoogleCalendar";
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

async function ensureCalendarLabels(token, calendarId) {
  const calendarPath = `/calendars/${encodeURIComponent(calendarId)}?${EVENT_LABEL_VERSION}`;
  let existing = [];

  try {
    const calendar = await calendarRequest(token, calendarPath);
    existing = calendar?.labelProperties?.eventLabels || [];
  } catch (error) {
    console.warn("UPF labels read failed", error);
  }

  const existingIds = new Set(existing.map((label) => label.id));
  const merged = [...existing];

  for (const preset of GOOGLE_COLOR_PRESETS) {
    if (!existingIds.has(preset.id)) {
      merged.push({
        id: preset.id,
        backgroundColor: preset.hex,
      });
    }
  }

  if (merged.length === existing.length) return;

  await calendarRequest(token, calendarPath, {
    method: "PATCH",
    body: JSON.stringify({
      labelProperties: {
        eventLabels: merged,
      },
    }),
  });
}

function isLabelColorId(value) {
  return typeof value === "string" && value.includes("-");
}

function getOAuthClientId() {
  const configured = window.UPF_OAUTH_CONFIG?.webClientId;
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

async function verifyCalendarExists(token, calendarId) {
  try {
    const calendar = await calendarRequest(
      token,
      `/calendars/${encodeURIComponent(calendarId)}`
    );
    return calendar?.id ? { id: calendar.id, summary: calendar.summary || UPF_CALENDAR_NAME } : null;
  } catch (error) {
    return null;
  }
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

async function resolveUpfCalendar(token, calendarName) {
  const name = (calendarName || "").trim() || UPF_CALENDAR_NAME;

  const byName = await findCalendarInList(token, name);
  if (byName) {
    await saveStoredCalendar(byName);
    return { calendar: byName, created: false };
  }

  const stored = await loadStoredCalendar();
  if (stored?.id) {
    const verified = await verifyCalendarExists(token, stored.id);
    if (verified) {
      if (verified.summary !== name) {
        const updated = await calendarRequest(
          token,
          `/calendars/${encodeURIComponent(verified.id)}`,
          { method: "PATCH", body: JSON.stringify({ summary: name }) }
        );
        const calendar = { id: verified.id, summary: updated?.summary || name };
        await saveStoredCalendar(calendar);
        return { calendar, created: false };
      }

      await saveStoredCalendar(verified);
      return { calendar: verified, created: false };
    }
  }

  const created = await createUpfCalendar(token, name);
  await saveStoredCalendar(created);
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

  const subject = helpers.normalizeSubject(item);
  const colorRef = helpers.getEventColorId?.(item) ?? helpers.getSubjectColorId?.(subject);
  if (colorRef) {
    if (isLabelColorId(colorRef)) {
      event.eventLabelId = colorRef;
    } else {
      event.colorId = String(colorRef);
    }
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
}

async function getStoredConnection() {
  const data = await chrome.storage.local.get({ upfGoogleConnection: null });
  return data.upfGoogleConnection;
}

async function syncEvents(items, helpers) {
  const token = await getAuthToken(true);
  const calendarName = (helpers.calendarName || "").trim() || UPF_CALENDAR_NAME;
  const { calendar, created: calendarCreated } = await resolveUpfCalendar(token, calendarName);
  const calendarId = calendar.id;

  try {
    await ensureCalendarLabels(token, calendarId);
  } catch (error) {
    console.warn("UPF labels setup failed, falling back to legacy colors", error);
  }

  const eventsBase = `/calendars/${encodeURIComponent(calendarId)}/events?${EVENT_LABEL_VERSION}`;
  const uidMap = await loadUidMap();
  const exportable = items.filter((item) => helpers.shouldExport(item, helpers.includeHolidays));
  const activeUids = new Set();

  let created = 0;
  let updated = 0;
  let deleted = 0;
  let skipped = 0;
  let failed = 0;
  let firstError = null;

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

    const uid = helpers.makeUid(item);

    const summary = sanitizeText(helpers.buildCleanSummary(item));
    if (!summary) {
      skipped += 1;
      continue;
    }

    activeUids.add(uid);

    try {
      const body = buildGoogleEvent(item, helpers);
      const existing = uidMap[uid];
      const sameCalendar = existing?.calendarId === calendarId;

      if (existing?.eventId && sameCalendar) {
        await calendarRequest(
          token,
          `${eventsBase.split("?")[0]}/${encodeURIComponent(existing.eventId)}?${EVENT_LABEL_VERSION}`,
          { method: "PATCH", body: JSON.stringify(body) }
        );
        uidMap[uid] = {
          eventId: existing.eventId,
          calendarId,
          syncedAt: Date.now(),
        };
        updated += 1;
      } else {
        const createdEvent = await calendarRequest(
          token,
          eventsBase,
          { method: "POST", body: JSON.stringify(body) }
        );
        uidMap[uid] = {
          eventId: createdEvent.id,
          calendarId,
          syncedAt: Date.now(),
        };
        created += 1;
      }
    } catch (error) {
      failed += 1;
      if (!firstError) firstError = error;
      console.error("UPF sync item failed", item, error);
    }
  }

  for (const [uid, entry] of Object.entries(uidMap)) {
    if (activeUids.has(uid)) continue;
    if (!entry?.eventId || entry.calendarId !== calendarId) continue;

    try {
      await calendarRequest(
        token,
        `${eventsBase.split("?")[0]}/${encodeURIComponent(entry.eventId)}`,
        { method: "DELETE" }
      );
      delete uidMap[uid];
      deleted += 1;
    } catch (error) {
      failed += 1;
      if (!firstError) firstError = error;
      console.error("UPF sync delete failed", uid, error);
    }
  }

  await saveUidMap(uidMap);

  if (failed > 0 && created === 0 && updated === 0 && deleted === 0) {
    throw firstError || new Error("errorGoogleSyncNone");
  }

  return {
    created,
    updated,
    deleted,
    skipped,
    failed,
    total: exportable.length,
    calendarName: calendar.summary || calendarName,
    calendarCreated,
  };
}

window.UpfGoogleCalendar = {
  getAuthToken,
  getUserEmail,
  connectGoogle,
  disconnectGoogle,
  getStoredConnection,
  syncEvents,
  getRedirectUrl,
  UPF_CALENDAR_NAME,
  COLOR_PRESETS: GOOGLE_COLOR_PRESETS,
};

})();
