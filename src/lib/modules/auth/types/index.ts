export type AuthTokens = {
  /** Scopes the token was granted, so a widened SCOPES list can force a re-login. */
  scopes?: string[];
  accessToken: string;
  refreshToken: string;
  expiration: Date;
};
