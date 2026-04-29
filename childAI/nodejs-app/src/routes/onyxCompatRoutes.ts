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
   *
   * Note: our JWT payload doesn't carry the user's email (it's only stored
   * in the DB users table). For the Onyx /api/me display, we synthesize
   * `<sub>@bubbli.local`. A future improvement could look up the real email
   * from userRepository if needed.
   */
  fastify.get<{ Reply: OnyxUser }>('/api/me', async (request) => {
    const authHeader = request.headers.authorization ?? '';
    if (authHeader.startsWith('Bearer ')) {
      try {
        const { verifyJwt } = await import('../auth/jwt');
        const payload = await verifyJwt(authHeader.slice(7));
        return {
          id: payload.userId ?? payload.sub,
          email: `${payload.sub}@bubbli.local`,
          is_active: true,
          is_verified: true,
          role: 'basic',
          preferences: {},
          is_anonymous_user: false,
        };
      } catch {
        // invalid/expired token — fall through to anonymous
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

  // ── Persona / agents ──────────────────────────────────────────────────────
  fastify.get('/api/persona', async () => ([
    {
      id: 0,
      name: 'Bubbli',
      description: 'Child-safe AI assistant',
      is_default_persona: true,
      display_priority: 0,
      starter_messages: [
        { name: 'Help with math', message: 'Help me with my math homework. Can you explain how to add fractions?' },
        { name: 'Tell me a story', message: 'Tell me a fun adventure story about a brave little dragon.' },
        { name: 'Explain something', message: 'Why is the sky blue? Explain it in a fun way.' },
        { name: 'Be creative', message: 'Write a short rhyming poem about a curious little cat.' },
      ],
      tools: [],
      document_sets: [],
      icon_color: '#0A3D3C',
      icon_shape: 1,
      is_visible: true,
      is_public: true,
      builtin_persona: false,
      labels: [],
      owner: null,
      groups: [],
      users: [],
      llm_model_provider_override: null,
      llm_model_version_override: null,
      num_chunks: null,
      llm_relevance_filter: false,
      llm_filter_extraction: false,
      recency_bias: 'auto',
      prompts: [],
    },
  ]));

  fastify.get('/api/persona/labels', async () => ([]));

  // ── LLM providers ─────────────────────────────────────────────────────────
  fastify.get('/api/llm/provider', async () => ([
    {
      id: 0,
      name: 'default',
      provider: 'openai',
      api_key_set: true,
      default_model_name: 'gpt-4o-mini',
      fast_default_model_name: null,
      model_names: ['gpt-4o-mini'],
      display_model_names: ['gpt-4o-mini'],
      is_default_provider: true,
      is_public: true,
      groups: [],
      custom_config: {},
    },
  ]));

  // ── Projects ──────────────────────────────────────────────────────────────
  fastify.get('/api/user/projects', async () => ([]));

  // ── Notifications ─────────────────────────────────────────────────────────
  fastify.get('/api/notifications', async () => ({ notifications: [] }));

  // ── Assistant preferences ─────────────────────────────────────────────────
  fastify.get('/api/user/assistant/preferences', async () => ({
    chosen_assistants: null,
    hidden_assistants: [],
    visible_assistants: [],
  }));

  // ── Connectors / document sets (empty for chat-only mode) ────────────────
  fastify.get('/api/manage/connector', async () => ([]));
  fastify.get('/api/manage/document-set', async () => ([]));
  fastify.get('/api/federated', async () => ([]));
};
