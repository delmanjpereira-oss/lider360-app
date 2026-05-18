import { NextResponse } from 'next/server';

const FORM_POST_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSeoLU8cuNPZQ2d2YiklE2GeYKVyfj52Hl4Rs1gO9QRIE3KHxQ/formResponse';

const ENTRY = {
  DATA:     'entry.1712372407',
  ID_GROOT: 'entry.1617968739',
  MOTIVO:   'entry.572465964',
  COMENT:   'entry.2108908568',
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { idGroot, dataISO, motivo, comentario } = body as {
      idGroot: string;
      dataISO: string;
      motivo: string;
      comentario?: string;
    };

    if (!idGroot || !dataISO || !motivo) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: idGroot, dataISO, motivo' },
        { status: 400 }
      );
    }

    const formData = new URLSearchParams();
    formData.append(ENTRY.DATA,     dataISO);
    formData.append(ENTRY.ID_GROOT, String(idGroot));
    formData.append(ENTRY.MOTIVO,   motivo);
    formData.append(ENTRY.COMENT,   comentario ?? '');

    const resp = await fetch(FORM_POST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
      redirect: 'follow',
    });

    // O Form redireciona após sucesso (302) — qualquer 2xx ou 3xx é OK
    if (resp.ok || resp.status === 302 || resp.redirected) {
      return NextResponse.json({ success: true, message: 'Presença registrada via formulário!' });
    }

    return NextResponse.json(
      { error: `Form retornou status ${resp.status}` },
      { status: 502 }
    );
  } catch (err: unknown) {
    console.error('[presenca/marcar]', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
