import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Decode the mock token to отримати user info
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return NextResponse.json(
          { message: 'Invalid token' },
          { status: 401 }
        );
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));

      return NextResponse.json({
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        name: payload.email.split('@')[0],
        created_at: new Date().toISOString(),
      });
    } catch {
      return NextResponse.json(
        { message: 'Invalid token format' },
        { status: 401 }
      );
    }
  } catch {
    return NextResponse.json(
      { message: 'Server error' },
      { status: 500 }
    );
  }
}
