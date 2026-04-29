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

export interface OnyxChatSession {
  id: string;
  name: string;
  persona_id: number;
  time_created: string;     // ISO 8601
  time_updated: string;     // ISO 8601
  shared_status: 'private' | 'public';
  folder_id: number | null;
  current_alternate_model: string | null;
  current_temperature_override: number | null;
  slack_thread_id: string | null;
  project_id: number | null;
  // childAI-specific extension carried through for parity
  is_flagged?: boolean;
}

export interface OnyxSessionListResponse {
  sessions: OnyxChatSession[];
}

/** Convert one of our conversations into Onyx's session shape. */
export function toOnyxSession(conv: {
  id: string;
  title?: string | null;
  created_at: string | Date;
  updated_at?: string | Date | null;
  is_flagged?: boolean;
}): OnyxChatSession {
  const created = typeof conv.created_at === 'string' ? conv.created_at : conv.created_at.toISOString();
  const updated = conv.updated_at
    ? (typeof conv.updated_at === 'string' ? conv.updated_at : conv.updated_at.toISOString())
    : created;
  return {
    id: conv.id,
    name: conv.title ?? `Chat ${conv.id.slice(0, 6)}`,
    persona_id: 0,
    time_created: created,
    time_updated: updated,
    shared_status: 'private',
    folder_id: null,
    current_alternate_model: null,
    current_temperature_override: null,
    slack_thread_id: null,
    project_id: null,
    is_flagged: conv.is_flagged ?? false,
  };
}
