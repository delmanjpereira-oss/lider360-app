import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const scriptUrl = process.env.APPS_SCRIPT_URL;
  const token = process.env.APPS_SCRIPT_TOKEN || '';

  if (!scriptUrl) {
    return NextResponse.json(
      { error: 'APPS_SCRIPT_URL não configurada. Adicione nas variáveis de ambiente.' },
      { status: 503 }
    );
  }

  const body = await req.json();
  const { linha, coluna, motivo, comentario } = body as {
    linha: number;
    coluna: number;
    motivo: string;
    comentario?: string;
  };

  if (!linha || !coluna || !motivo) {
    return NextResponse.json(
      { error: 'Campos obrigatórios: linha, coluna, motivo' },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'salvarPresenca',
        token,
        payload: { linha, coluna, motivo, comentario: comentario ?? '' },
      }),
      redirect: 'follow',
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error('[presenca/marcar]', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
