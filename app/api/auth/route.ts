import { NextResponse } from 'next/server';
import store from '@/lib/store';
import { signToken, verifyToken } from '@/lib/jwt';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'google') {
      const { email, name, picture } = body;

      if (!email || !name) {
        return NextResponse.json({ error: 'Missing required Google profile fields' }, { status: 400 });
      }

      if (!email.toLowerCase().endsWith('@dsce.edu.in')) {
        return NextResponse.json({ error: 'Only @dsce.edu.in email addresses are allowed to register or login' }, { status: 403 });
      }

      let user = store.getUserByEmail(email);
      if (!user) {
        const role = (email.endsWith('@admin.com') || email.toLowerCase().includes('admin')) ? 'admin' : 'student';
        user = {
          id: uuidv4(),
          name,
          email,
          phone: '',
          studentId: '',
          role,
          picture: picture || '',
          createdAt: new Date().toISOString(),
        };
        store.addUser(user);
      } else {
        if (picture && user.picture !== picture) {
          user.picture = picture;
        }
      }

      const { hashedPassword, ...userWithoutPassword } = user as any;
      const token = signToken({ userId: user.id, role: user.role, email: user.email });

      return NextResponse.json({ user: userWithoutPassword, token });
    }

    if (action === 'signup') {
      const { name, email, phone, studentId, password } = body;
      
      if (!name || !email || !phone || !password) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }

      if (!email.toLowerCase().endsWith('@dsce.edu.in')) {
        return NextResponse.json({ error: 'Only @dsce.edu.in email addresses are allowed to register or login' }, { status: 403 });
      }

      // Check if user already exists
      const existing = store.getUserByEmail(email);
      if (existing) {
        return NextResponse.json({ error: 'User already exists with this email' }, { status: 400 });
      }

      const newUser = {
        id: uuidv4(),
        name,
        email,
        phone,
        studentId,
        hashedPassword: hashPassword(password),
        role: 'student' as const,
        createdAt: new Date().toISOString(),
      };

      store.addUser(newUser);

      // Remove password from response
      const { hashedPassword, ...userWithoutPassword } = newUser;
      const token = signToken({ userId: newUser.id, role: newUser.role, email: newUser.email });

      return NextResponse.json({ user: userWithoutPassword, token });
    }

    if (action === 'login') {
      const { email, password } = body;

      if (!email || !password) {
        return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
      }

      if (!email.toLowerCase().endsWith('@dsce.edu.in')) {
        return NextResponse.json({ error: 'Only @dsce.edu.in email addresses are allowed to register or login' }, { status: 403 });
      }

      const user = store.getUserByEmail(email);
      if (!user || user.hashedPassword !== hashPassword(password)) {
        return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
      }

      const { hashedPassword, ...userWithoutPassword } = user;
      const token = signToken({ userId: user.id, role: user.role, email: user.email });

      return NextResponse.json({ user: userWithoutPassword, token });
    }

    if (action === 'me') {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'No authorization token' }, { status: 401 });
      }

      const token = authHeader.split(' ')[1];
      const decoded = verifyToken(token);
      if (!decoded) {
        return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
      }

      const user = store.getUserById(decoded.userId);
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const { hashedPassword, ...userWithoutPassword } = user;
      return NextResponse.json({ user: userWithoutPassword });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    console.error('Auth API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
