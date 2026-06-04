/**
 * ====================================================
 * API: /api/ia/perfil/[id]
 * app/api/ia/perfil/[id]/route.ts
 *
 * Gera relatório comportamental usando a IA Especialista (Groq + Llama)
 * - Verifica cache (válido por 24h)
 * - Se não existe ou expirou, gera via Groq
 * - Salva no cache (tabela ia_insights)
 *
 * Query param: ?force=1  → ignora cache e gera novo
 * ====================================================
 */

import { NextResponse } from 'next/server';
import { supabase } from '../../../../../lib/supabase';
import {
  coletarContextoColaborador,
  formatarContextoParaIA,
} from '../../../../../lib/ia/coletor-contexto';
import { chamarClaude } from '../../../../../lib/ia/claude-client';
import { SYSTEM_PROMPT_BASE } from '../../../../../lib/ia/system-prompt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const TIPO_CACHE = 'perfil';
const CACHE_HORAS = 24;
const MODELO_USADO = 'claude-haiku-4-5-20251001';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const force = url.searchParams.get('force') === '1';

    if (!id || id.trim() === '') {
      return NextResponse.json(
        { erro: 'ID Groot é obrigatório' },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────
    // 1) VERIFICAR CACHE (se não forçar)
    // ─────────────────────────────────────
    if (!force) {
      const { data: cache } = await supabase
        .from('ia_insights')
        .select('*')
        .eq('id_groot', id)
        .eq('tipo', TIPO_CACHE)
        .gt('valido_ate', new Date().toISOString())
        .maybeSingle();

      if (cache) {
        return NextResponse.json({
          cadastro: cache.cadastro_snapshot,
          relatorio: cache.conteudo,
          modelo: cache.modelo,
          geradoEm: cache.gerado_em,
          validoAte: cache.valido_ate,
          fromCache: true,
        });
      }
    }

    // ─────────────────────────────────────
    // 2) COLETAR CONTEXTO EM TEMPO REAL
    // ─────────────────────────────────────
    const contexto = await coletarContextoColaborador(id);

    if (!contexto) {
      return NextResponse.json(
        { erro: 'Colaborador não encontrado', idGroot: id },
        { status: 404 }
      );
    }

    const contextoMarkdown = formatarContextoParaIA(contexto);

    // ─────────────────────────────────────
    // 3) PROMPT ESPECÍFICO PRO RELATÓRIO
    // ─────────────────────────────────────
    const prompt = `Gere um RELATÓRIO COMPORTAMENTAL completo e narrativo do colaborador com base nos dados abaixo.

ESTRUTURA OBRIGATÓRIA (markdown, exatamente nesta ordem):

## Perfil Geral
Um a dois parágrafos descrevendo a pessoa como um todo. Cite o nome dela. Conecte dados com leitura comportamental.

## Estilo de Trabalho
Análise de COMO ela entrega. Consistência? Picos? Oscilação? Cite números específicos.

## Resposta a Feedback
Análise da relação dela com o histórico de feedbacks. Aceita bem? Padrão de ofensor? Sem feedback recente?

## Pontos de Atenção
Red flags observáveis. Use bullet points com **negrito** no início de cada item.

## Pontos Fortes
Strengths comportamentais. Bullet points com **negrito** no início.

## Recomendações de Abordagem
3 a 5 ações concretas e específicas. Numerada (1., 2., 3.).

REGRAS:
- Português brasileiro, tom profissional mas humano
- CITE números específicos do contexto ("taxa de 79%", "DPMO de 1.450")
- Recomende com convicção
- Se faltar algum dado, mencione brevemente
- Não invente

CONTEXTO DO COLABORADOR:

${contextoMarkdown}`;

    // ─────────────────────────────────────
    // 4) CHAMAR IA (Claude)
    // ─────────────────────────────────────
    const relatorio = await chamarClaude(
      [{ role: 'user', content: prompt }],
      {
        modelo: 'claude-haiku-4-5-20251001',
        systemPrompt: SYSTEM_PROMPT_BASE,
        temperature: 0.7,
        maxTokens: 4096,
      }
    );

    // ─────────────────────────────────────
    // 5) SALVAR NO CACHE (24h)
    // ─────────────────────────────────────
    const agora = new Date();
    const validoAte = new Date(agora);
    validoAte.setHours(validoAte.getHours() + CACHE_HORAS);

    const { error: erroUpsert } = await supabase.from('ia_insights').upsert(
      {
        id_groot: id,
        tipo: TIPO_CACHE,
        conteudo: relatorio,
        cadastro_snapshot: contexto.cadastro,
        modelo: MODELO_USADO,
        gerado_em: agora.toISOString(),
        valido_ate: validoAte.toISOString(),
      },
      { onConflict: 'id_groot,tipo' }
    );

    if (erroUpsert) {
      console.error('[API /api/ia/perfil] Erro ao salvar cache:', erroUpsert);
      // Não falha — retorna o relatório mesmo sem cache
    }

    return NextResponse.json({
      cadastro: contexto.cadastro,
      relatorio,
      modelo: MODELO_USADO,
      geradoEm: agora.toISOString(),
      validoAte: validoAte.toISOString(),
      fromCache: false,
    });
  } catch (error: any) {
    console.error('[API /api/ia/perfil/[id]] Erro:', error);
    return NextResponse.json(
      {
        erro: 'Falha ao gerar relatório IA',
        detalhe: error?.message || 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}
