import { NextResponse } from 'next/server';

// Motivos do dropdown do Google Form (espelha o Form real).
// Se o Form mudar, atualizar aqui também.
const MOTIVOS = [
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
  return NextResponse.json(MOTIVOS, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
