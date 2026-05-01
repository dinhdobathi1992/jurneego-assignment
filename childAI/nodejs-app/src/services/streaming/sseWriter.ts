import { FastifyReply } from 'fastify';
import { sseStreamsActive, sseStreamDurationSeconds } from '../observability/metrics';

export type SSEEvent =
  | { event: 'message.accepted'; data: Record<string, unknown> }
  | { event: 'safety.checked'; data: Record<string, unknown> }
  | { event: 'ai.started'; data: Record<string, unknown> }
  | { event: 'ai.progress'; data: Record<string, unknown> }
  | { event: 'assistant.chunk'; data: { content: string } }
  | { event: 'assistant.completed'; data: Record<string, unknown> }
  | { event: 'done'; data: Record<string, unknown> }
  | { event: 'error'; data: { code: string; message: string } };

export class SSEWriter {
  private reply: FastifyReply;
  private heartbeatTimer?: NodeJS.Timeout;
  private closed = false;
  private startedAt = 0;

  constructor(reply: FastifyReply) {
    this.reply = reply;
  }

  /** Send SSE headers and start the stream */
  start(origin = '*'): void {
    this.startedAt = Date.now();
    sseStreamsActive.inc();
    this.reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    });

    this.startHeartbeat();
  }

  /** Write an SSE event with backpressure handling */
  async write(event: SSEEvent): Promise<void> {
    if (this.closed) return;

    const chunk = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
    const canContinue = this.reply.raw.write(chunk);

    if (!canContinue) {
      // Wait for drain before continuing
      await new Promise<void>((resolve) => {
        this.reply.raw.once('drain', resolve);
      });
    }
  }

  /** Send a heartbeat comment every N seconds to keep the connection alive */
  private startHeartbeat(intervalMs = 15_000): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.closed) return;
      this.reply.raw.write(': heartbeat\n\n');
    }, intervalMs);
  }

  /** Close the SSE stream cleanly */
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

  /** Whether the client has disconnected */
  get isClosed(): boolean {
    return this.closed || this.reply.raw.destroyed;
  }

  /** Register a close callback when client disconnects */
  onClose(fn: () => void): void {
    this.reply.raw.on('close', () => {
      this.closed = true;
      fn();
    });
  }
}
