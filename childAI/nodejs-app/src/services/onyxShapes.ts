/**
 * TypeScript shapes that match Onyx's API response contracts.
 * Sourced from onyx-web/src/lib/types.ts and onyx-web/src/app/app/interfaces.ts.
 * Only the fields the chat page actually reads are modeled.
 */

export interface OnyxAuthType {
  auth_type: 'basic' | 'google_oauth' | 'oidc' | 'saml' | 'cloud' | 'disabled';
  requires_verification: boolean;
  anonymous_user_enabled: boolean;
  password_min_length: number;
  has_users: boolean;
  oauth_enabled: boolean;
}

export interface OnyxUser {
  id: string;
  email: string;
  is_active: boolean;
  is_verified: boolean;
  role: 'limited' | 'basic' | 'admin' | 'curator' | 'global_curator' | 'ext_perm_user' | 'slack_user';
  preferences: Record<string, unknown>;
  is_anonymous_user: boolean;
}
