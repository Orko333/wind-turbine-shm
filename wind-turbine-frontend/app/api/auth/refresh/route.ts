import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'https://test1111ww-wind-turbine-shm-api.hf.space';

export async function POST(request: NextRequest) {
  try {
    const token =
      request.cookies.get('auth_token')?.value ||
      request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const upstream = await fetch(`${BACKEND}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return NextResponse.json(data, { status: upstream.status });
    }

    const response = NextResponse.json(data, { status: 200 });

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
