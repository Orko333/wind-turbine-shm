import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'https://test1111ww-wind-turbine-shm-api.hf.space';

export async function GET(request: NextRequest) {
  try {
    const token =
      request.cookies.get('auth_token')?.value ||
      request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const upstream = await fetch(`${BACKEND}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await upstream.json();
    if (upstream.ok) {
      return NextResponse.json({ ...data, access_token: token }, { status: 200 });
    }
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
