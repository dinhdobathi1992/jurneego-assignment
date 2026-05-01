import { createAuditEvent, CreateAuditEventInput } from '../../repositories/auditRepository';

/**
 * Thin service wrapper around the audit repository.
 * Centralises audit event creation so services don't need to import the repo directly.
 */
export class AuditService {
  async log(input: CreateAuditEventInput): Promise<void> {
    try {
      await createAuditEvent(input);
    } catch (err) {
      // Audit failures must not break the main request flow
      console.error('[audit] Failed to write audit event:', (err as Error).message);
    }
  }
}

export const auditService = new AuditService();
