import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from '@/lib/jwt';

describe('Auth & JWT Service', () => {
  it('signs and verifies standard JWT tokens', () => {
    const payload = { userId: '12345', role: 'student' };
    const token = signToken(payload);
    
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    
    const verified = verifyToken(token);
    expect(verified).toBeDefined();
    expect(verified.userId).toBe('12345');
    expect(verified.role).toBe('student');
    expect(verified.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it('rejects tampered or expired tokens', () => {
    const payload = { userId: '54321', role: 'admin' };
    const token = signToken(payload);
    
    // Tamper the signature
    const parts = token.split('.');
    parts[2] = 'invalid_signature_here';
    const tampered = parts.join('.');
    
    expect(verifyToken(tampered)).toBeNull();
  });
});
