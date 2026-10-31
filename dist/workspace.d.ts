import { Type } from "typebox";
type JsonRecord = Record<string, unknown>;
export declare function getGoogleProfile(token: string): Promise<{
    email?: string;
}>;
export declare const workspaceParameters: Type.TObject<{
    service: Type.TUnion<[Type.TLiteral<"gmail">, Type.TLiteral<"calendar">, Type.TLiteral<"drive">, Type.TLiteral<"sheets">, Type.TLiteral<"docs">, Type.TLiteral<"contacts">]>;
    action: Type.TString;
    id: Type.TOptional<Type.TString>;
    query: Type.TOptional<Type.TString>;
    maxResults: Type.TOptional<Type.TNumber>;
    to: Type.TOptional<Type.TString>;
    subject: Type.TOptional<Type.TString>;
    body: Type.TOptional<Type.TString>;
    title: Type.TOptional<Type.TString>;
    summary: Type.TOptional<Type.TString>;
    start: Type.TOptional<Type.TString>;
    end: Type.TOptional<Type.TString>;
    attendees: Type.TOptional<Type.TArray<Type.TString>>;
    calendarId: Type.TOptional<Type.TString>;
    fileId: Type.TOptional<Type.TString>;
    spreadsheetId: Type.TOptional<Type.TString>;
    documentId: Type.TOptional<Type.TString>;
    range: Type.TOptional<Type.TString>;
    text: Type.TOptional<Type.TString>;
    values: Type.TOptional<Type.TArray<Type.TArray<Type.TUnion<[Type.TString, Type.TNumber, Type.TBoolean, Type.TNull]>>>>;
}>;
export declare function executeWorkspace(token: string, p: JsonRecord): Promise<unknown>;
export {};
