import { describe, expect, it } from "vitest";
import plugin, { TOOL_NAME } from "./index.js";
import { buildAuthorizationUrl, parseAuthorizationResponse, parseOAuthClient, SCOPES } from "./oauth.js";

describe("google-workspace-oauth", () => {
  it("parses a desktop OAuth client", () => {
    expect(parseOAuthClient(JSON.stringify({ installed: { client_id: "client", client_secret: "secret" } }))).toEqual({ clientId: "client", clientSecret: "secret" });
  });

  it("builds a PKCE authorization URL with all scopes", () => {
    const url = new URL(buildAuthorizationUrl("client", "state", "challenge"));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("state");
    for (const scope of SCOPES) expect(url.searchParams.get("scope")).toContain(scope);
  });

  it("validates state from redirect URLs", () => {
    expect(parseAuthorizationResponse("http://localhost:1/?code=abc&state=good", "good")).toBe("abc");
    expect(() => parseAuthorizationResponse("http://localhost:1/?code=abc&state=bad", "good")).toThrow(/state/);
  });

  it("declares stable plugin and tool identities", () => {
    expect(plugin.id).toBe("google-workspace-oauth");
    expect(TOOL_NAME).toBe("google_workspace");
  });
});
