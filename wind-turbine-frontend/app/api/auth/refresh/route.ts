import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Decode the застарілі token to отримати user info
    interface TokenPayload {
      sub: string;
      email: string;
      role: string;
      iat: number;
      exp: number;
    }

    let payload: TokenPayload;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return NextResponse.json(
          { message: 'Invalid token' },
          { status: 401 }
        );
      }

      payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    } catch {
      return NextResponse.json(
        { message: 'Invalid token format' },
        { status: 401 }
      );
    }

    // Створити a new token with extended expiration
    const newToken = Buffer.from(
      JSON.stringify({
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString('base64');

    const response = NextResponse.json(
      {
        success: true,
        message: 'Token refreshed',
        access_token: `header.${newToken}.signature`,
        token_type: 'Bearer',
        expires_in: 3600,
      },
      { status: 200 }
    );

    // Оновити the auth token cookie
    response.cookies.set('auth_token', `header.${newToken}.signature`, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 3600,
      path: '/',
    });

    return response;
  } catch {
    return NextResponse.json(
      { message: 'Server error' },
      { status: 500 }
    );
  }
}
