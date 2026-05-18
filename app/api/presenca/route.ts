import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const scriptUrl = process.env.APPS_SCRIPT_URL;
  const token = process.env.APPS_SCRIPT_TOKEN || '';

  if (!scriptUrl) {
    return NextResponse.json(
      { error: 'APPS_SCRIPT_URL não configurada. Adicione nas variáveis de ambiente.' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const forcar = searchParams.get('forcar') === '1';

  const url = new URL(scriptUrl);
  url.searchParams.set('action', 'getDadosPresenca');
  if (forcar) url.searchParams.set('forcar', '1');
  if (token) url.searchParams.set('token', token);

  try {
    const res = await fetch(url.toString(), { redirect: 'follow' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error('[presenca/GET]', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
