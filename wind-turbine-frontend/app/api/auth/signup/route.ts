import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'https://test1111ww-wind-turbine-shm-api.hf.space';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const upstream = await fetch(`${BACKEND}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return NextResponse.json(data, { status: upstream.status });
    }

    const response = NextResponse.json(data, { status: 201 });

    if (data.access_token) {
      response.cookies.set('auth_token', data.access_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 86400,
        path: '/',
      });
    }

    return response;
  } catch {
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
