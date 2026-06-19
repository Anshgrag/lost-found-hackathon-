import { describe, it, expect, vi, afterEach } from 'vitest';
import { POST } from '../app/api/auth/route';
import store from '../lib/store';

describe('Auth Route Email Domain Restriction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows Google login for @dsce.edu.in emails', async () => {
    const req = new Request('http://localhost/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'google',
        email: 'test@dsce.edu.in',
        name: 'Test Student',
        picture: 'https://pfp.png'
      })
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    const resData = await response.json();
    expect(resData.token).toBeDefined();
    expect(resData.user.email).toBe('test@dsce.edu.in');
  });

  it('blocks Google login for non-@dsce.edu.in emails', async () => {
    const req = new Request('http://localhost/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'google',
        email: 'test@gmail.com',
        name: 'Test Student',
        picture: 'https://pfp.png'
      })
    });

    const response = await POST(req);
    expect(response.status).toBe(403);
    const resData = await response.json();
    expect(resData.error).toContain('Only @dsce.edu.in email addresses are allowed');
  });

  it('blocks traditional signup for non-@dsce.edu.in emails', async () => {
    const req = new Request('http://localhost/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'signup',
        name: 'Test Student',
        email: 'test@gmail.com',
        phone: '1234567890',
        password: 'securePassword'
      })
    });

    const response = await POST(req);
    expect(response.status).toBe(403);
    const resData = await response.json();
    expect(resData.error).toContain('Only @dsce.edu.in email addresses are allowed');
  });

  it('blocks traditional login for non-@dsce.edu.in emails', async () => {
    const req = new Request('http://localhost/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'login',
        email: 'test@gmail.com',
        password: 'securePassword'
      })
    });

    const response = await POST(req);
    expect(response.status).toBe(403);
    const resData = await response.json();
    expect(resData.error).toContain('Only @dsce.edu.in email addresses are allowed');
  });
});
