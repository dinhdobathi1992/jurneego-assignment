/**
 * Translates our internal token stream into Onyx-shaped NDJSON Packets.
 *
 * Onyx's `streamingUtils.handleSSEStream` (despite the name) parses the
 * response body as **newline-delimited JSON** — it splits on '\n' and
 * JSON.parses each non-empty line.
 *
 * Each line is a `Packet`:
 *
 *   {
 *     placement: { turn_index: number, tab_index?: number },
 *     obj: { type: '<discriminator>', ...payload }
 *   }
 *
 * The discriminator field is `obj.type` — NOT a top-level `obj` field.
 *
 * Discriminator strings (verified by reading
 * `onyx-web/src/app/app/services/streamingModels.ts`):
 *
 *   message_start  →  { id, content, final_documents, pre_answer_processing_seconds? }
 *   message_delta  →  { content }
 *   message_end    →  { } (rarely used by the renderer; see SECTION_END/STOP)
 *   section_end    →  { }                       — closes one logical section
 *   stop           →  { stop_reason?: 'finished' } — overall stream complete
 *   error          →  { message? }
 *
 * Why we emit `section_end` and `stop` after the assistant text:
 *   - `isFinalAnswerComplete()` requires a SECTION_END (or ERROR) with a
 *     matching turn_index after MESSAGE_START to consider the answer done.
 *   - `isStreamingComplete()` requires a STOP packet anywhere.
 * Without these, the chat UI will spin forever waiting for completion.
 *
 * NOTE: this file departs from the spec docstring (which suggested an
 * `obj`-discriminated shape with `text`/`message_id`/`full_message`
 * fields). Those names do not exist anywhere in the upstream Onyx
 * codebase. The names below are what the Onyx renderer actually reads.
 */

/** All discriminator strings we emit, mirroring `PacketType` upstream. */
export const PACKET = {
  START: 'message_start',
  DELTA: 'message_delta',
  END: 'message_end',
  SECTION_END: 'section_end',
  STOP: 'stop',
  ERROR: 'error',
} as const;

export type PacketDiscriminator = (typeof PACKET)[keyof typeof PACKET];

/** Position of a packet in the Onyx render tree. */
export interface Placement {
  turn_index: number;
  tab_index?: number;
}

/** Inner discriminated-union payload (what lives at packet.obj). */
export interface PacketObj {
  type: PacketDiscriminator;
  [key: string]: unknown;
}

/** Wire-level NDJSON line shape. */
export interface OnyxPacket {
  placement: Placement;
  obj: PacketObj;
}

/**
 * MESSAGE_START — opens a new assistant text section.
 * `id` is a string identifier the renderer carries through; we use the
 * conversation/session id so re-opens in the UI can be correlated.
 */
export function startPacket(p: {
  id: string;
  content?: string;
  turnIndex?: number;
  tabIndex?: number;
}): OnyxPacket {
  return {
    placement: { turn_index: p.turnIndex ?? 0, tab_index: p.tabIndex ?? 0 },
    obj: {
      type: PACKET.START,
      id: p.id,
      content: p.content ?? '',
      final_documents: null,
    },
  };
}

/** MESSAGE_DELTA — one streamed chunk of assistant text. */
export function deltaPacket(content: string, p: { turnIndex?: number; tabIndex?: number } = {}): OnyxPacket {
  return {
    placement: { turn_index: p.turnIndex ?? 0, tab_index: p.tabIndex ?? 0 },
    obj: { type: PACKET.DELTA, content },
  };
}

/** MESSAGE_END — explicit close of a message stream (renderer-optional). */
export function endPacket(p: { turnIndex?: number; tabIndex?: number } = {}): OnyxPacket {
  return {
    placement: { turn_index: p.turnIndex ?? 0, tab_index: p.tabIndex ?? 0 },
    obj: { type: PACKET.END },
  };
}

/**
 * SECTION_END — required for `isFinalAnswerComplete` to detect a finished
 * answer. The Onyx renderer matches turn_index between MESSAGE_START and
 * SECTION_END, so callers must use the same turnIndex they used for start.
 */
export function sectionEndPacket(p: { turnIndex?: number; tabIndex?: number } = {}): OnyxPacket {
  return {
    placement: { turn_index: p.turnIndex ?? 0, tab_index: p.tabIndex ?? 0 },
    obj: { type: PACKET.SECTION_END },
  };
}

/** STOP — overall stream-complete signal; required by `isStreamingComplete`. */
export function stopPacket(p: { stopReason?: 'finished' | 'user_cancelled'; turnIndex?: number; tabIndex?: number } = {}): OnyxPacket {
  return {
    placement: { turn_index: p.turnIndex ?? 0, tab_index: p.tabIndex ?? 0 },
    obj: { type: PACKET.STOP, stop_reason: p.stopReason ?? 'finished' },
  };
}

/** ERROR — surfaced to the user via the renderer's error state. */
export function errorPacket(message: string, p: { turnIndex?: number; tabIndex?: number } = {}): OnyxPacket {
  return {
    placement: { turn_index: p.turnIndex ?? 0, tab_index: p.tabIndex ?? 0 },
    obj: { type: PACKET.ERROR, message },
  };
}

/** Serialize a packet for the wire (NDJSON: one JSON object + '\n'). */
export function encodePacket(p: OnyxPacket): string {
  return JSON.stringify(p) + '\n';
}
