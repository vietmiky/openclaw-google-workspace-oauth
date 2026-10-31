import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { getPreparedPluginSecretInput, resolveConfiguredSecretInputString, } from "openclaw/plugin-sdk/secret-input-runtime";
import { buildAuthorizationUrl, createPkce, parseAuthorizationResponse, parseOAuthClient, postForm, PROVIDER_ID, REDIRECT_URI, required, } from "./oauth.js";
import { executeWorkspace, getGoogleProfile, workspaceParameters } from "./workspace.js";
export const TOOL_NAME = "google_workspace";
export default definePluginEntry({
    id: "google-workspace-oauth",
    name: "Google Workspace OAuth",
    description: "Unified OAuth connector and tools for Gmail, Calendar, Drive, Sheets, Docs, and Contacts.",
    register(api) {
        // Manifest-owned secret inputs are deliberately not materialized into pluginConfig.
        // Read the currently prepared capability value at use time so secrets.reload
        // revokes and replaces it safely.
        const readClient = async () => {
            const prepared = getPreparedPluginSecretInput("google-workspace-oauth", "oauthClientJson").value
                ?? globalThis[Symbol.for("openclaw.google-workspace.oauthClientJson")];
            if (prepared !== undefined)
                return parseOAuthClient(prepared);
            // CLI provider login in OpenClaw 2026.10.5 runs outside the Gateway's
            // prepared-secret request scope. Resolve the authored SecretRef through
            // the public SDK instead of reading a secret file or patching core.
            const resolved = await resolveConfiguredSecretInputString({
                config: api.config,
                env: process.env,
                value: api.pluginConfig?.oauthClientJson,
                path: "plugins.entries.google-workspace-oauth.config.oauthClientJson",
            });
            return parseOAuthClient(resolved.value);
        };
        api.registerProvider({
            id: PROVIDER_ID,
            label: "Google Workspace",
            auth: [{
                    id: "oauth",
                    label: "Google Workspace OAuth",
                    hint: "One consent flow for Gmail, Calendar, Drive, Sheets, Docs, and Contacts",
                    kind: "oauth",
                    async run(ctx) {
                        const client = await readClient();
                        const { verifier, challenge, state } = createPkce();
                        const spin = ctx.prompter.progress("Đang chờ Google OAuth");
                        const handlers = ctx.oauth.createVpsAwareHandlers({
                            isRemote: ctx.isRemote,
                            prompter: ctx.prompter,
                            runtime: ctx.runtime,
                            spin,
                            openUrl: ctx.openUrl,
                            localBrowserMessage: "Trình duyệt đã mở Google OAuth.",
                            manualPromptMessage: "Mở link đăng nhập, cấp quyền, rồi dán URL chuyển hướng vào ô nhập bảo mật.",
                            manualPromptSignal: ctx.signal,
                        });
                        await handlers.onAuth({ url: buildAuthorizationUrl(client.clientId, state, challenge) });
                        const response = await handlers.onPrompt({
                            message: "Dán URL chuyển hướng Google OAuth",
                            placeholder: "http://localhost:1/?code=...&state=...",
                        });
                        const code = parseAuthorizationResponse(response, state);
                        const tokens = await postForm("https://oauth2.googleapis.com/token", {
                            client_id: client.clientId,
                            client_secret: client.clientSecret,
                            code,
                            code_verifier: verifier,
                            grant_type: "authorization_code",
                            redirect_uri: REDIRECT_URI,
                        }, ctx.signal);
                        const access = required(tokens.access_token, "access_token");
                        const refresh = required(tokens.refresh_token, "refresh_token");
                        const expires = Date.now() + Number(tokens.expires_in ?? 3600) * 1000;
                        let email;
                        try {
                            email = (await getGoogleProfile(access)).email;
                        }
                        catch { /* optional */ }
                        spin.stop("Google Workspace đã kết nối");
                        return {
                            profiles: [{
                                    profileId: `${PROVIDER_ID}:default`,
                                    credential: { type: "oauth", provider: PROVIDER_ID, access, refresh, expires, clientId: client.clientId, email },
                                }],
                            notes: ["Đã cấp một token OAuth thống nhất cho các dịch vụ Google Workspace."],
                        };
                    },
                }],
            formatApiKey: (credential) => credential.type === "oauth" ? credential.access : "",
            async refreshOAuth(credential) {
                const client = await readClient();
                const tokens = await postForm("https://oauth2.googleapis.com/token", {
                    client_id: client.clientId,
                    client_secret: client.clientSecret,
                    refresh_token: credential.refresh,
                    grant_type: "refresh_token",
                });
                return {
                    ...credential,
                    access: required(tokens.access_token, "access_token"),
                    refresh: typeof tokens.refresh_token === "string" ? tokens.refresh_token : credential.refresh,
                    expires: Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
                };
            },
        });
        api.registerTool((toolContext) => ({
            name: TOOL_NAME,
            label: "Google Workspace",
            description: "Use Google Workspace through OAuth. Gmail: search/get/send. Calendar: list/create/delete. Drive: search/get/create_folder/trash. Sheets: create/get/append/update. Docs: create/get/append. Contacts: list. Write operations are external side effects and require clear user intent.",
            parameters: workspaceParameters,
            async execute(_id, params) {
                const token = await toolContext.resolveApiKeyForProvider?.(PROVIDER_ID);
                if (!token)
                    throw new Error("Google Workspace chưa đăng nhập. Chạy OAuth login cho provider google-workspace.");
                const details = await executeWorkspace(token, params);
                return {
                    content: [{ type: "text", text: JSON.stringify(details, null, 2).slice(0, 30_000) }],
                    details,
                };
            },
        }), { name: TOOL_NAME });
    },
});
