import { REDIRECT_URI, SCOPES } from "$lib/config/spotify";
import { toQueryParams, buildUrl } from "$lib/shared/helpers/url";
import type { AuthTokens } from "../types";

const TOKEN_URL = "https://accounts.spotify.com/api/token";

const base64Url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

/**
 * PKCE, not a client secret: the public client ids have none, and a desktop
 * app could not keep one anyway.
 */
export const createAuthRequest = async (clientId: string) => {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = base64Url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );

  const url = buildUrl("https://accounts.spotify.com/authorize", {
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(" "),
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  return { url, verifier };
};

const requestTokens = async (params: Record<string, string>) => {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    body: toQueryParams(params),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error_description ?? data.error ?? `HTTP ${response.status}`,
    );
  }

  return data as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
};

export const getTokensFromCode = async (
  code: string,
  verifier: string,
  clientId: string,
): Promise<AuthTokens> => {
  const data = await requestTokens({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    code_verifier: verifier,
  });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiration: new Date(Date.now() + data.expires_in * 1000),
    scopes: data.scope?.split(" ") ?? [],
  };
};

export const refreshTokens = async (
  tokens: AuthTokens,
  clientId: string,
): Promise<AuthTokens> => {
  const data = await requestTokens({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    client_id: clientId,
  });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? tokens.refreshToken,
    expiration: new Date(Date.now() + data.expires_in * 1000),
    scopes: data.scope?.split(" ") ?? tokens.scopes,
  };
};
