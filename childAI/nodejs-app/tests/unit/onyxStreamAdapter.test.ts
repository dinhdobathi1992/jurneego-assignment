import { describe, it, expect } from 'vitest';
import {
  startPacket,
  deltaPacket,
  endPacket,
  sectionEndPacket,
  stopPacket,
  errorPacket,
  encodePacket,
  PACKET,
} from '../../src/services/onyxStreamAdapter';

describe('onyxStreamAdapter', () => {
  it('startPacket emits Onyx Packet shape with obj.type=message_start and a placement', () => {
    const p = startPacket({ id: 'session-7', content: '', turnIndex: 0, tabIndex: 0 });
    expect(p.obj.type).toBe(PACKET.START);
    expect(p.obj.id).toBe('session-7');
    expect(p.obj.content).toBe('');
    expect(p.obj.final_documents).toBeNull();
    expect(p.placement).toEqual({ turn_index: 0, tab_index: 0 });
  });

  it('deltaPacket carries content (not text) and inherits placement defaults', () => {
    const p = deltaPacket('hi');
    expect(p.obj.type).toBe(PACKET.DELTA);
    expect(p.obj.content).toBe('hi');
    expect(p.placement.turn_index).toBe(0);
  });

  it('endPacket signals message close', () => {
    const p = endPacket({ turnIndex: 1 });
    expect(p.obj.type).toBe(PACKET.END);
    expect(p.placement.turn_index).toBe(1);
  });

  it('sectionEndPacket / stopPacket are required for isFinalAnswerComplete + isStreamingComplete', () => {
    const sec = sectionEndPacket({ turnIndex: 0 });
    expect(sec.obj.type).toBe(PACKET.SECTION_END);

    const stop = stopPacket();
    expect(stop.obj.type).toBe(PACKET.STOP);
    expect(stop.obj.stop_reason).toBe('finished');
  });

  it('errorPacket carries the error message under obj.message', () => {
    const p = errorPacket('boom');
    expect(p.obj.type).toBe(PACKET.ERROR);
    expect(p.obj.message).toBe('boom');
  });

  it('encodePacket appends exactly one trailing newline and round-trips JSON.parse', () => {
    const s = encodePacket(deltaPacket('x'));
    expect(s.endsWith('\n')).toBe(true);
    expect(s.split('\n')).toHaveLength(2); // ['{...}', '']

    const decoded = JSON.parse(s.trimEnd());
    expect(decoded.obj.type).toBe(PACKET.DELTA);
    expect(decoded.obj.content).toBe('x');
  });
});
