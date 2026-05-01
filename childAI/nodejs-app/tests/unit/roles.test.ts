import { describe, it, expect } from 'vitest';
import { hasRole, canModerate, isAdmin, isAdult } from '../../src/auth/roles';

describe('roles', () => {
  it('learner does not have admin role', () => {
    expect(hasRole('learner', 'admin')).toBe(false);
  });

  it('admin has admin role', () => {
    expect(hasRole('admin', 'admin')).toBe(true);
  });

  it('teacher can moderate', () => {
    expect(canModerate('teacher')).toBe(true);
  });

  it('learner cannot moderate', () => {
    expect(canModerate('learner')).toBe(false);
  });

  it('parent is adult', () => {
    expect(isAdult('parent')).toBe(true);
  });

  it('learner is not adult', () => {
    expect(isAdult('learner')).toBe(false);
  });

  it('service is not admin', () => {
    expect(isAdmin('service')).toBe(false);
  });
});
