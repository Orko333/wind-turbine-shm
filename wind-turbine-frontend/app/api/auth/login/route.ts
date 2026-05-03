import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { message: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Mock successful login
    const token = Buffer.from(
      JSON.stringify({
        sub: 'user-123',
        email: email,
        role: email.includes('admin') ? 'admin' : 'engineer',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString('base64');

    const response = NextResponse.json(
      {
        success: true,
        message: 'Login successful',
        access_token: `header.${token}.signature`,
        token_type: 'Bearer',
        expires_in: 3600,
        user: { id: 'user-123', email, role: email.includes('admin') ? 'admin' : 'engineer' },
      },
      { status: 200 }
    );

    response.cookies.set('auth_token', `header.${token}.signature`, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 3600,
      path: '/',
    });

    return response;
  } catch {
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
