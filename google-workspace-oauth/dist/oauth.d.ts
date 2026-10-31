export declare const PROVIDER_ID = "google-workspace";
export declare const SCOPES: string[];
export declare const REDIRECT_URI = "http://localhost:1";
export type OAuthClient = {
    clientId: string;
    clientSecret: string;
};
type JsonRecord = Record<string, unknown>;
export declare function parseOAuthClient(value: unknown): OAuthClient;
export declare function createPkce(): {
    verifier: string;
    challenge: string;
    state: string;
};
export declare function buildAuthorizationUrl(clientId: string, state: string, challenge: string): string;
export declare function parseAuthorizationResponse(input: string, expectedState: string): string;
export declare function postForm(url: string, params: Record<string, string>, signal?: AbortSignal): Promise<JsonRecord>;
export declare function required(value: unknown, name: string): string;
export {};
