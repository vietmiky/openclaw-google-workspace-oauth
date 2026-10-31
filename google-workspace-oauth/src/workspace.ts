import { Type } from "typebox";
import { required } from "./oauth.js";

type JsonRecord = Record<string, unknown>;

async function googleFetch(token: string, url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 204) return { ok: true };
  const text = await response.text();
  let payload: unknown = text;
  try { payload = JSON.parse(text); } catch { /* retain text */ }
  if (!response.ok) {
    const compact = typeof payload === "string" ? payload.slice(0, 1000) : JSON.stringify(payload).slice(0, 2000);
    throw new Error(`Google API lỗi ${response.status}: ${compact}`);
  }
  return payload;
}

export async function getGoogleProfile(token: string): Promise<{ email?: string }> {
  return googleFetch(token, "https://www.googleapis.com/oauth2/v2/userinfo") as Promise<{ email?: string }>;
}

function withQuery(base: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function encodeMail(to: string, subject: string, body: string): string {
  const message = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");
  return Buffer.from(message).toString("base64url");
}

export const workspaceParameters = Type.Object({
  service: Type.Union([
    Type.Literal("gmail"), Type.Literal("calendar"), Type.Literal("drive"),
    Type.Literal("sheets"), Type.Literal("docs"), Type.Literal("contacts"),
  ]),
  action: Type.String({ description: "Operation, e.g. search/get/send/list/create/append/update/delete/trash." }),
  id: Type.Optional(Type.String()),
  query: Type.Optional(Type.String()),
  maxResults: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  to: Type.Optional(Type.String()),
  subject: Type.Optional(Type.String()),
  body: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  summary: Type.Optional(Type.String()),
  start: Type.Optional(Type.String()),
  end: Type.Optional(Type.String()),
  attendees: Type.Optional(Type.Array(Type.String())),
  calendarId: Type.Optional(Type.String()),
  fileId: Type.Optional(Type.String()),
  spreadsheetId: Type.Optional(Type.String()),
  documentId: Type.Optional(Type.String()),
  range: Type.Optional(Type.String()),
  text: Type.Optional(Type.String()),
  values: Type.Optional(Type.Array(Type.Array(Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()])))),
});

export async function executeWorkspace(token: string, p: JsonRecord): Promise<unknown> {
  const service = required(p.service, "service");
  const action = required(p.action, "action");
  const max = typeof p.maxResults === "number" ? Math.min(100, Math.max(1, p.maxResults)) : 25;

  if (service === "gmail") {
    const base = "https://gmail.googleapis.com/gmail/v1/users/me";
    if (action === "search") return googleFetch(token, withQuery(`${base}/messages`, { q: String(p.query ?? ""), maxResults: max }));
    if (action === "get") return googleFetch(token, `${base}/messages/${encodeURIComponent(required(p.id, "id"))}?format=full`);
    if (action === "send") return googleFetch(token, `${base}/messages/send`, { method: "POST", body: JSON.stringify({ raw: encodeMail(required(p.to, "to"), required(p.subject, "subject"), required(p.body, "body")) }) });
  }

  if (service === "calendar") {
    const calendarId = encodeURIComponent(String(p.calendarId ?? "primary"));
    const base = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
    if (action === "list") return googleFetch(token, withQuery(base, { timeMin: String(p.start ?? new Date().toISOString()), timeMax: p.end as string | undefined, maxResults: max, singleEvents: "true", orderBy: "startTime" }));
    if (action === "create") return googleFetch(token, base, { method: "POST", body: JSON.stringify({ summary: required(p.summary ?? p.title, "summary"), start: { dateTime: required(p.start, "start") }, end: { dateTime: required(p.end, "end") }, attendees: Array.isArray(p.attendees) ? p.attendees.map((email) => ({ email })) : undefined }) });
    if (action === "delete") return googleFetch(token, `${base}/${encodeURIComponent(required(p.id, "id"))}`, { method: "DELETE" });
  }

  if (service === "drive") {
    const base = "https://www.googleapis.com/drive/v3/files";
    if (action === "search") return googleFetch(token, withQuery(base, { q: String(p.query ?? "trashed = false"), pageSize: max, fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName,emailAddress))" }));
    if (action === "get") return googleFetch(token, withQuery(`${base}/${encodeURIComponent(required(p.fileId ?? p.id, "fileId"))}`, { fields: "*" }));
    if (action === "create_folder") return googleFetch(token, base, { method: "POST", body: JSON.stringify({ name: required(p.title, "title"), mimeType: "application/vnd.google-apps.folder" }) });
    if (action === "trash") return googleFetch(token, withQuery(`${base}/${encodeURIComponent(required(p.fileId ?? p.id, "fileId"))}`, { fields: "id,name,trashed" }), { method: "PATCH", body: JSON.stringify({ trashed: true }) });
  }

  if (service === "sheets") {
    if (action === "create") return googleFetch(token, "https://sheets.googleapis.com/v4/spreadsheets", { method: "POST", body: JSON.stringify({ properties: { title: required(p.title, "title") } }) });
    const sheetId = encodeURIComponent(required(p.spreadsheetId ?? p.id, "spreadsheetId"));
    const range = encodeURIComponent(required(p.range, "range"));
    if (action === "get") return googleFetch(token, `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`);
    if (action === "append") return googleFetch(token, `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: p.values ?? [] }) });
    if (action === "update") return googleFetch(token, `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`, { method: "PUT", body: JSON.stringify({ values: p.values ?? [] }) });
  }

  if (service === "docs") {
    if (action === "create") return googleFetch(token, "https://docs.googleapis.com/v1/documents", { method: "POST", body: JSON.stringify({ title: required(p.title, "title") }) });
    const documentId = encodeURIComponent(required(p.documentId ?? p.id, "documentId"));
    const url = `https://docs.googleapis.com/v1/documents/${documentId}`;
    if (action === "get") return googleFetch(token, url);
    if (action === "append") {
      const doc = await googleFetch(token, url) as { body?: { content?: Array<{ endIndex?: number }> } };
      const endIndex = Math.max(1, (doc.body?.content?.at(-1)?.endIndex ?? 1) - 1);
      return googleFetch(token, `${url}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ insertText: { location: { index: endIndex }, text: required(p.text, "text") } }] }) });
    }
  }

  if (service === "contacts" && action === "list") {
    return googleFetch(token, withQuery("https://people.googleapis.com/v1/people/me/connections", { pageSize: max, personFields: "names,emailAddresses,phoneNumbers,organizations" }));
  }

  throw new Error(`Không hỗ trợ ${service}.${action}.`);
}
