/**
 * ====================================================
 * API: /api/perfil/[id]
 * Retorna o perfil comportamental de um colaborador
 *
 * Uso: fetch('/api/perfil/12345')
 * ====================================================
 */

import { NextResponse } from 'next/server';
import { getPerfilComportamental } from '../../../../lib/perfil-comportamental';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id || id.trim() === '') {
      return NextResponse.json(
        { erro: 'ID Groot é obrigatório' },
        { status: 400 }
      );
    }

    const perfil = await getPerfilComportamental(id);

    if (!perfil) {
      return NextResponse.json(
        { erro: 'Colaborador não encontrado', idGroot: id },
        { status: 404 }
      );
    }

    return NextResponse.json(perfil);
  } catch (error: any) {
    console.error('[API /api/perfil/[id]] Erro:', error);
    return NextResponse.json(
      {
        erro: 'Falha ao gerar perfil comportamental',
        detalhe: error?.message || 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}
