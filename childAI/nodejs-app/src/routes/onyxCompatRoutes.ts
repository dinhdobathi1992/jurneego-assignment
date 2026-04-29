import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { OnyxAuthType, OnyxUser } from '../services/onyxShapes';
import { authenticate } from '../middleware/authMiddleware';
import { canAccessConversation } from '../auth/ownership';
import { listLearnerConversations, getConversation, createNewConversation } from '../services/conversationService';
import { toOnyxSession, toOnyxMessages } from '../services/onyxShapes';
import { SSEWriter, SSEEvent } from '../services/streaming/sseWriter';
import { handleStreamingMessage } from '../services/streaming/streamMessageService';
import { sseStreamsActive, sseStreamDurationSeconds } from '../services/observability/metrics';
import {
  encodePacket,
  startPacket,
  deltaPacket,
  sectionEndPacket,
  stopPacket,
  errorPacket,
  OnyxPacket,
} from '../services/onyxStreamAdapter';

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
   * Two code paths reach this endpoint:
   *   1. Client-side fetch via the Next.js catch-all proxy — the proxy
   *      patch translates the `app_token` cookie into `Authorization: Bearer`.
   *   2. Server-side fetch via fetchSS (`getCurrentUserSS()`) — bypasses
   *      the proxy entirely and sends cookies directly. No Authorization
   *      header is set.
   * To handle both, we look for the JWT in the Authorization header first,
   * then fall back to parsing the `app_token` cookie ourselves.
   *
   * Note: our JWT payload doesn't carry the user's email (it's only stored
   * in the DB users table). For the Onyx /api/me display, we synthesize
   * `<sub>@bubbli.local`. A future improvement could look up the real email
   * from userRepository if needed.
   */
  fastify.get<{ Reply: OnyxUser }>('/api/me', async (request) => {
    let token: string | null = null;

    const authHeader = request.headers.authorization ?? '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else {
      const cookieHeader = request.headers.cookie ?? '';
      const match = cookieHeader.match(/(?:^|;\s*)app_token=([^;]+)/);
      if (match) token = decodeURIComponent(match[1]);
    }

    if (token) {
      try {
        const { verifyJwt } = await import('../auth/jwt');
        const payload = await verifyJwt(token);
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

  /**
   * Onyx fires POST /api/auth/refresh on a timer (useTokenRefresh hook).
   * Real Onyx rotates a JWT here; for our shim the cookie-bridge already
   * carries a fresh JWT, so we just acknowledge with 200 — anything else
   * triggers Onyx's onRefreshFail() which logs the user out.
   */
  fastify.post('/api/auth/refresh', async () => ({ refreshed: true }));

  /** Best-effort no-op so Onyx's signout flow doesn't error. */
  fastify.post('/api/auth/logout', async (_request, reply) => reply.status(204).send());

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
  fastify.get('/api/user/projects/session/:sessionId/files', async () => ([]));
  fastify.get('/api/user/projects/session/:sessionId/token-count', async () => ({ token_count: 0 }));
  fastify.get('/api/federated/oauth-status', async () => ([]));

  // ── Notifications ─────────────────────────────────────────────────────────
  // Onyx's useNotifications hook does `data ?? []` then `.filter(...)`, so
  // the response must be a flat array — NOT `{ notifications: [] }`.
  fastify.get('/api/notifications', async () => ([]));

  // ── Assistant preferences ─────────────────────────────────────────────────
  fastify.get('/api/user/assistant/preferences', async () => ({
    chosen_assistants: null,
    hidden_assistants: [],
    visible_assistants: [],
  }));

  // ── Connectors / document sets (empty for chat-only mode) ────────────────
  fastify.get('/api/manage/connector', async () => ([]));
  fastify.get('/api/manage/connector-status', async () => ([]));
  fastify.get('/api/manage/document-set', async () => ([]));
  fastify.get('/api/federated', async () => ([]));
  fastify.get('/api/build/connectors', async () => ([]));
  fastify.get('/api/build/user-library/tree', async () => ([]));

  // ── Enterprise / licensing extras ─────────────────────────────────────────
  fastify.get('/api/enterprise-settings/custom-analytics-script', async () => null);
  fastify.get('/api/license', async () => ({
    license: null,
    is_valid: true,
    is_expired: false,
    expiration_date: null,
  }));

  // ── Tools / prompts / search settings ─────────────────────────────────────
  fastify.get('/api/tool', async () => ([]));
  fastify.get('/api/tool/openapi', async () => ([]));
  fastify.get('/api/input_prompt', async () => ([]));
  fastify.get('/api/mcp/servers', async () => ([]));
  fastify.get('/api/query/valid-tags', async () => ({ tags: [] }));
  fastify.get('/api/search-settings/get-current-search-settings', async () => null);
  fastify.get('/api/search-settings/get-secondary-search-settings', async () => null);
  fastify.get('/api/search-settings/unstructured-api-key-set', async () => false);

  // ── User extras (files, PATs, OAuth status, voice, pinned assistants) ────
  fastify.get('/api/user/files/recent', async () => ([]));
  fastify.get('/api/user/pats', async () => ([]));
  fastify.get('/api/user-oauth-token/status', async () => ({}));
  fastify.get('/api/voice/status', async () => ({ voice_enabled: false }));

  // No-op for now — clicking the pin/unpin icon on agents in the sidebar
  // hits this. Returning 204 lets the optimistic UI stay in sync without
  // us having to persist anything.
  fastify.patch('/api/user/pinned-assistants', async (_request, reply) => reply.status(204).send());

  // ── Chat sessions: list ───────────────────────────────────────────────────
  fastify.get('/api/chat/get-user-chat-sessions', { preHandler: [authenticate] }, async (request) => {
    const user = request.user!;
    const conversations = await listLearnerConversations(user.dbId, 50);
    return { sessions: conversations.map(toOnyxSession) };
  });

  // ── Chat sessions: detail ─────────────────────────────────────────────────
  fastify.get<{ Params: { sessionId: string } }>(
    '/api/chat/get-chat-session/:sessionId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user!;
      const { sessionId } = request.params;

      const allowed = await canAccessConversation(sessionId, user.dbId, user.role);
      if (!allowed) return reply.status(403).send({ detail: 'Access denied' });

      const conv = await getConversation(sessionId, true);
      if (!conv) return reply.status(404).send({ detail: 'Not found' });

      const session = toOnyxSession({
        id: conv.id,
        title: conv.title,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        is_flagged: conv.is_flagged,
      });

      const messages = toOnyxMessages(
        (conv.messages ?? []).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
          is_safe: m.is_safe ?? undefined,
        }))
      );

      // Onyx's processRawChatHistory expects packets[agentMessageInd] for
      // every assistant message — one Packet[] per assistant turn. For an
      // already-finalized chat history we have no live packets to replay,
      // so each entry is an empty array. The count must match the number
      // of assistant messages or the indexer reads `undefined`.
      const assistantCount = messages.filter((m) => m.message_type === 'assistant').length;
      const packets: never[][] = Array.from({ length: assistantCount }, () => []);

      return {
        chat_session_id: session.id,
        description: session.name,
        persona_id: 0,
        persona_name: 'Bubbli',
        current_alternate_model: null,
        current_temperature_override: null,
        messages,
        packets,
        time_created: session.time_created,
        shared_status: 'private',
        current_folder_id: null,
      };
    }
  );

  // ── Chat sessions: create ─────────────────────────────────────────────────
  fastify.post<{ Body: { persona_id?: number; description?: string; project_id?: number | null } }>(
    '/api/chat/create-chat-session',
    { preHandler: [authenticate] },
    async (request) => {
      const user = request.user!;
      const body = request.body ?? {};
      const conv = await createNewConversation({
        learnerUserId: user.dbId,
        title: body.description?.slice(0, 255), // matches conversations.title varchar(255)
      });
      return { chat_session_id: conv.id };
    }
  );

  // ── Chat sessions: rename / delete (best-effort) ──────────────────────────
  fastify.put<{ Body: { chat_session_id: string; name: string } }>(
    '/api/chat/rename-chat-session',
    { preHandler: [authenticate] },
    async (request, reply) => {
      // Our backend doesn't currently expose a rename endpoint. For the demo
      // we accept the call and no-op so the UI doesn't show an error.
      void request.body;
      return reply.status(204).send();
    }
  );

  fastify.delete<{ Params: { sessionId: string } }>(
    '/api/chat/delete-chat-session/:sessionId',
    { preHandler: [authenticate] },
    async (_request, reply) => {
      // Same: no-op for now. A future task can wire this to a real delete.
      return reply.status(204).send();
    }
  );

  // ── Chat: send message (NDJSON streaming) ─────────────────────────────────
  //
  // Onyx's `sendMessage()` POSTs to `/api/chat/send-chat-message` and parses
  // the response body as **newline-delimited JSON** (one Packet per line)
  // via `handleSSEStream`. We translate from our internal SSE-shaped event
  // stream (`assistant.chunk`, `assistant.completed`, `error`) into the
  // Onyx Packet shape (`message_start`, `message_delta`, `section_end`,
  // `stop`, `error`) on the wire.
  //
  // Implementation note: rather than duplicate the safety pipeline, we
  // reuse `handleStreamingMessage()` by passing it a writer that has the
  // same surface as `SSEWriter` but emits Onyx Packets to the raw socket.
  // The cast through `unknown` is required because `SSEWriter` exposes
  // private class fields (TS nominal typing), but at runtime Fastify only
  // ever calls public methods (`write`, `close`, `onClose`, `start`).
  fastify.post<{
    Body: {
      message: string;
      chat_session_id: string;
      parent_message_id?: number | null;
    };
  }>(
    '/api/chat/send-chat-message',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user!;
      const body = request.body ?? ({} as { message?: string; chat_session_id?: string });
      const message = body.message;
      const chatSessionId = body.chat_session_id;

      if (!message || !chatSessionId) {
        return reply.status(400).send({ detail: 'message and chat_session_id required' });
      }

      const allowed = await canAccessConversation(chatSessionId, user.dbId, user.role);
      if (!allowed) {
        return reply.status(403).send({ detail: 'Access denied' });
      }

      // Build a packet writer that satisfies the public SSEWriter surface.
      const packetWriter = new OnyxPacketWriter(reply, chatSessionId);
      packetWriter.start(request.headers.origin ?? '*');

      const abortController = new AbortController();
      packetWriter.onClose(() => abortController.abort());

      // Don't await — packets stream out as the underlying flow runs.
      // Errors inside the flow are translated to error packets by the
      // writer, so we don't expect rejects here in practice.
      handleStreamingMessage({
        conversationId: chatSessionId,
        learnerDbId: user.dbId,
        content: message,
        requestId: request.requestId,
        sse: packetWriter as unknown as SSEWriter,
        abortSignal: abortController.signal,
      }).catch((err) => {
        request.log.error({ err }, 'Onyx send-chat-message handler error');
        packetWriter.close('error');
      });

      return reply;
    }
  );
};

/**
 * Adapter that exposes the same public surface as `SSEWriter` but writes
 * Onyx-shaped NDJSON Packets to the raw HTTP response. Each call to
 * `.write()` is translated into 0..n Packets and serialized with
 * `encodePacket()` (which appends a single trailing '\n').
 *
 * Mapping:
 *   first `assistant.chunk`  → `message_start` (id=session_id) + `message_delta`
 *   subsequent chunks        → `message_delta`
 *   `assistant.completed`    → `section_end` + `stop`
 *   `error`                  → `error` packet
 *   `done`                   → no-op (we already sent stop on completed,
 *                              and unsafe-input flows go straight to
 *                              `assistant.completed` in the producer)
 *   `safety.checked` etc.    → no-op (Onyx doesn't surface these)
 *
 * The class is intentionally NOT a subclass of `SSEWriter`: SSEWriter's
 * fields are `private`, which would block subclassing without modifying
 * sseWriter.ts. We satisfy the type at the call site via a structural cast.
 */
class OnyxPacketWriter {
  private reply: FastifyReply;
  private sessionId: string;
  private closed = false;
  private startedMessage = false;
  private startedAt = 0;
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(reply: FastifyReply, sessionId: string) {
    this.reply = reply;
    this.sessionId = sessionId;
  }

  start(origin = '*'): void {
    this.startedAt = Date.now();
    sseStreamsActive.inc();
    this.reply.raw.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    });
    // Newline-only "heartbeat" — empty lines are safely skipped by
    // Onyx's NDJSON parser (`if (line.trim() === '') continue;`).
    this.heartbeatTimer = setInterval(() => {
      if (this.closed) return;
      this.reply.raw.write('\n');
    }, 15_000);
  }

  async write(event: SSEEvent): Promise<void> {
    if (this.closed) return;

    switch (event.event) {
      case 'assistant.chunk': {
        const content = String((event.data as { content?: unknown }).content ?? '');
        if (!this.startedMessage) {
          await this.writePacket(startPacket({ id: this.sessionId, content: '' }));
          this.startedMessage = true;
        }
        if (content.length > 0) {
          await this.writePacket(deltaPacket(content));
        }
        return;
      }
      case 'assistant.completed': {
        // Unsafe-input flows skip the chunk events entirely — they jump
        // straight to assistant.completed with the deflection content.
        // We still need to open and close a message section here, or the
        // Onyx UI will spin forever on an empty turn.
        if (!this.startedMessage) {
          const content = String((event.data as { content?: unknown }).content ?? '');
          await this.writePacket(startPacket({ id: this.sessionId, content }));
          if (content.length > 0) {
            await this.writePacket(deltaPacket(content));
          }
          this.startedMessage = true;
        }
        await this.writePacket(sectionEndPacket());
        await this.writePacket(stopPacket({ stopReason: 'finished' }));
        return;
      }
      case 'error': {
        const data = event.data as { message?: string; code?: string };
        await this.writePacket(errorPacket(data.message ?? data.code ?? 'stream error'));
        return;
      }
      // Onyx doesn't surface these; drop on the floor.
      case 'message.accepted':
      case 'safety.checked':
      case 'ai.started':
      case 'ai.progress':
      case 'done':
        return;
    }
  }

  /** Write a packet with backpressure handling — awaits 'drain' if the buffer is full. */
  private async writePacket(p: OnyxPacket): Promise<void> {
    if (this.closed) return;
    const canContinue = this.reply.raw.write(encodePacket(p));
    if (!canContinue) {
      await new Promise<void>((resolve) => this.reply.raw.once('drain', resolve));
    }
  }

  close(status: 'complete' | 'aborted' | 'error' = 'complete'): void {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    sseStreamsActive.dec();
    if (this.startedAt) {
      sseStreamDurationSeconds.observe({ status }, (Date.now() - this.startedAt) / 1000);
    }
    if (!this.reply.raw.destroyed) {
      this.reply.raw.end();
    }
  }

  get isClosed(): boolean {
    return this.closed || this.reply.raw.destroyed;
  }

  onClose(fn: () => void): void {
    this.reply.raw.on('close', () => {
      this.closed = true;
      fn();
    });
  }
}
