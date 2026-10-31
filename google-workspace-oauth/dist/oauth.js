import { createHash, randomBytes } from "node:crypto";
export const PROVIDER_ID = "google-workspace";
export const SCOPES = [
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/contacts.readonly",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/documents",
];
export const REDIRECT_URI = "http://localhost:1";
export function parseOAuthClient(value) {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error("Plugin chưa được cấu hình oauthClientJson trong kho bí mật.");
    }
    let root;
    try {
        root = JSON.parse(value);
    }
    catch {
        throw new Error("OAuth client JSON không hợp lệ.");
    }
    const section = (root.installed ?? root.web);
    const clientId = section?.client_id;
    const clientSecret = section?.client_secret;
    if (typeof clientId !== "string" || typeof clientSecret !== "string") {
        throw new Error("OAuth JSON phải chứa installed.client_id và installed.client_secret.");
    }
    return { clientId, clientSecret };
}
function base64Url(bytes) {
    return bytes.toString("base64url");
}
export function createPkce() {
    const verifier = base64Url(randomBytes(48));
    return {
        verifier,
        challenge: base64Url(createHash("sha256").update(verifier).digest()),
        state: base64Url(randomBytes(24)),
    };
}
export function buildAuthorizationUrl(clientId, state, challenge) {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    return url.toString();
}
export function parseAuthorizationResponse(input, expectedState) {
    const trimmed = input.trim();
    if (!trimmed)
        throw new Error("Thiếu authorization code.");
    if (!trimmed.includes("://"))
        return trimmed;
    const url = new URL(trimmed);
    const error = url.searchParams.get("error");
    if (error)
        throw new Error(`Google OAuth từ chối: ${error}`);
    if (url.searchParams.get("state") !== expectedState) {
        throw new Error("OAuth state không khớp; hãy chạy lại đăng nhập.");
    }
    const code = url.searchParams.get("code");
    if (!code)
        throw new Error("Redirect URL không chứa authorization code.");
    return code;
}
export async function postForm(url, params, signal) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params),
        signal,
    });
    const payload = (await response.json().catch(() => ({})));
    if (!response.ok) {
        throw new Error(`Google OAuth lỗi ${response.status}: ${String(payload.error_description ?? payload.error ?? "unknown")}`);
    }
    return payload;
}
export function required(value, name) {
    if (typeof value !== "string" || !value.trim())
        throw new Error(`Thiếu tham số ${name}.`);
    return value.trim();
}
