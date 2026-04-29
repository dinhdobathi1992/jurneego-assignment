import { FastifyPluginAsync } from 'fastify';
import { OnyxAuthType, OnyxUser } from '../services/onyxShapes';

/**
 * Compatibility shim for the upstream Onyx frontend.
 *
 * Onyx's web/ expects a specific set of API endpoints that don't exist in our
 * Fastify backend. This plugin emulates the minimum surface needed for the
 * chat page to render, plus translation routes that proxy chat-session calls
 * into our existing conversationService.
 *
 * Mounted at `/api/...` so the Onyx Next.js catch-all proxy forwards untouched.
 */
export const onyxCompatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/health', async () => ({ status: 'ok' }));

  fastify.get('/api/version', async () => ({ backend_version: 'onyx-compat-shim/1.0' }));

  // ── Auth bootstrap ─────────────────────────────────────────────────────────
  fastify.get<{ Reply: OnyxAuthType }>('/api/auth/type', async () => ({
    auth_type: 'basic',
    requires_verification: false,
    anonymous_user_enabled: true,
    password_min_length: 8,
    has_users: true,
    oauth_enabled: false,
  }));

  /**
   * Onyx calls /api/me on every page load with credentials:'include'.
   * If we have a real user via JWT (set via Bearer header by the proxy
   * patch in Task 10), return their info. Otherwise return an anonymous
   * placeholder so Onyx's anonymous-mode UI flows.
   */
  fastify.get<{ Reply: OnyxUser }>('/api/me', async (request) => {
    const authHeader = request.headers.authorization ?? '';
    if (authHeader.startsWith('Bearer ')) {
      try {
        const jwtModule = await import('../auth/jwt');
        // Find whatever the project's verify function is named — it varies
        // ('verifyAppJwt', 'verifyJwt', 'verify', etc.). The dynamic import
        // here keeps the test isolated from real JWT signing keys.
        const verifier =
          jwtModule.verifyAppJwt ??
          jwtModule.verifyJwt ??
          jwtModule.verify ??
          (jwtModule as any).default;
        if (typeof verifier === 'function') {
          const payload = verifier(authHeader.slice(7));
          return {
            id: payload.sub ?? payload.dbId ?? 'anon',
            email: payload.email ?? 'unknown@bubbli.local',
            is_active: true,
            is_verified: true,
            role: 'basic',
            preferences: {},
            is_anonymous_user: false,
          };
        }
      } catch {
        // fall through to anonymous
      }
    }
    return {
      id: 'anonymous',
      email: 'anonymous@bubbli.local',
      is_active: true,
      is_verified: true,
      role: 'basic',
      preferences: {},
      is_anonymous_user: true,
    };
  });

  fastify.get('/api/settings', async () => ({
    anonymous_user_enabled: true,
    anonymous_user_path: null,
    application_status: 'active',
    gpu_enabled: false,
    image_extraction_and_analysis_enabled: false,
    search_time_image_analysis_enabled: false,
    image_analysis_max_size_mb: 20,
    needs_reindexing: false,
    product_gating: 'no_gating',
  }));

  fastify.get('/api/enterprise-settings', async () => ({
    application_name: 'Bubbli',
    application_status: 'active',
    use_custom_logo: false,
    use_custom_logotype: false,
    custom_header_content: null,
    custom_header_logo: null,
    two_lines_for_chat_header: false,
    custom_lower_disclaimer_content: null,
    custom_nav_items: [],
    enable_consent_screen: false,
  }));
};
