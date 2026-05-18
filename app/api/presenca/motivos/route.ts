import { NextResponse } from 'next/server';

const MOTIVOS_FALLBACK = [
  'P - Presente',
  'HE - Hora Extra',
  'PCO - Presença com Compensação',
  'FI - Falta Injustificada',
  'AB - Abandono de Posto',
  'AD - Advertência',
  'FJ - Falta Justificada',
  'FE - Férias',
  'FR - Feriado',
  'HCD - Hora Compensada',
  'HTF - Hora Trabalhada de Folga',
  'AP - Afastamento',
  'SIE - Sem Informação Externa',
  'CE - Compromisso Externo',
  'ON - Outras Naturezas',
  'TR - Treinamento',
];

export async function GET() {
  const scriptUrl = process.env.APPS_SCRIPT_URL;
  const token = process.env.APPS_SCRIPT_TOKEN || '';

  if (scriptUrl) {
    try {
      const url = new URL(scriptUrl);
      url.searchParams.set('action', 'getMotivosPresenca');
      if (token) url.searchParams.set('token', token);

      const res = await fetch(url.toString(), { redirect: 'follow' });
      const data = await res.json();

      if (Array.isArray(data?.motivos) && data.motivos.length > 0) {
        return NextResponse.json(data.motivos, {
          headers: { 'Cache-Control': 'public, max-age=3600' },
        });
      }
    } catch {
      // fallback to hardcoded list
    }
  }

  return NextResponse.json(MOTIVOS_FALLBACK, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
