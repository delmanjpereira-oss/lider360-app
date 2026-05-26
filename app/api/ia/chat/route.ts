// ============================================
// 💬 API CHAT COM CLAUDE - Estratega do Time
// ============================================
// TL conversa com Claude que tem contexto COMPLETO:
// - Time inteiro
// - Performance multi-prazo
// - Padrões detectados
// - Aprendizado das tarefas passadas
// - Saúde sistêmica
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { coletarContextoCompleto } from '../../../../lib/copiloto/coletor-contexto';
import { chamarClaude } from '../../../../lib/ia/claude-client';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mensagem, id_conversa } = body;
    
    if (!mensagem) {
      return NextResponse.json({ erro: 'Mensagem obrigatória' }, { status: 400 });
    }
    
    const conversaId = id_conversa || `chat-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    
    // 1️⃣ Salva pergunta do usuário
    await supabase.from('chat_conversas').insert({
      id_conversa: conversaId,
      papel: 'user',
      conteudo: mensagem,
    });
    
    // 2️⃣ Busca histórico da conversa (últimas 10 mensagens)
    const { data: historicoMsgs } = await supabase
      .from('chat_conversas')
      .select('papel, conteudo')
      .eq('id_conversa', conversaId)
      .order('criado_em', { ascending: true })
      .limit(20);
    
    // 3️⃣ Coleta contexto completo do time
    const ctx = await coletarContextoCompleto();
    
    // 4️⃣ Monta system prompt com persona estratega
    const systemPrompt = construirSystemPrompt(ctx);
    
    // 5️⃣ Monta mensagens pro Claude
    const messages = (historicoMsgs || []).map(m => ({
      role: m.papel as 'user' | 'assistant',
      content: m.conteudo,
    }));
    
    // 6️⃣ Chama Claude
    const resposta = await chamarClaude(messages, {
      systemPrompt,
      temperature: 0.6,
      maxTokens: 3000,
    });
    
    // 7️⃣ Salva resposta da Claude
    await supabase.from('chat_conversas').insert({
      id_conversa: conversaId,
      papel: 'assistant',
      conteudo: resposta,
      contexto_usado: {
        total_colabs: ctx.colabs.length,
        tarefas_hoje: ctx.tarefasGeradasHoje,
        aprendizado_aplicado: ctx.aprendizado.totalTarefas > 0,
      },
    });
    
    return NextResponse.json({
      sucesso: true,
      resposta,
      id_conversa: conversaId,
      modelo: 'claude-sonnet-4-5',
    });
    
  } catch (e: any) {
    console.error('❌ Erro chat:', e);
    return NextResponse.json({ 
      sucesso: false, 
      erro: e.message 
    }, { status: 500 });
  }
}

// ============================================
// GET: Lista conversas anteriores
// ============================================
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const idConversa = searchParams.get('id_conversa');
    
    if (idConversa) {
      // Pega mensagens de UMA conversa
      const { data } = await supabase
        .from('chat_conversas')
        .select('*')
        .eq('id_conversa', idConversa)
        .order('criado_em', { ascending: true });
      
      return NextResponse.json({ mensagens: data || [] });
    } else {
      // Lista TODAS as conversas (agrupadas)
      const { data } = await supabase
        .from('chat_conversas')
        .select('id_conversa, conteudo, criado_em')
        .eq('papel', 'user')
        .order('criado_em', { ascending: false })
        .limit(20);
      
      // Agrupa por id_conversa, pegando primeira mensagem
      const conversas: any[] = [];
      const idsVistos = new Set();
      
      (data || []).forEach(m => {
        if (!idsVistos.has(m.id_conversa)) {
          idsVistos.add(m.id_conversa);
          conversas.push({
            id_conversa: m.id_conversa,
            primeira_msg: m.conteudo.slice(0, 100),
            criado_em: m.criado_em,
          });
        }
      });
      
      return NextResponse.json({ conversas });
    }
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 });
  }
}

// ============================================
// 🧠 SYSTEM PROMPT - Persona ESTRATEGA
// ============================================

function construirSystemPrompt(ctx: any): string {
  const META_LIQUIDA_P2M = ctx.metas['meta_liquida_p2m'] || 280;
  const META_LIQUIDA_CHECKIN = ctx.metas['meta_liquida_checkin'] || 100;
  
  // Lista de colabs resumida
  const colabsResumo = ctx.colabs.slice(0, 50).map((c: any) => {
    const perf = c.performance.medio_prazo_30d.media;
    const tend = c.performance.medio_prazo_30d.tendencia;
    const meta = c.processo === 'P2M' ? META_LIQUIDA_P2M : META_LIQUIDA_CHECKIN;
    const pctMeta = meta > 0 ? ((perf / meta) * 100).toFixed(0) : '0';
    
    return `${c.nome} (${c.processo}) | ${perf} pç/h (${pctMeta}% meta) | ${tend.tendencia} ${tend.variacao_pct > 0 ? '+' : ''}${tend.variacao_pct}% | ABS ${c.presenca.pctAbs}% | ${c.memoria.feedbacksUltimos90d} FBs 90d`;
  }).join('\n');
  
  // Aprendizado da IA
  let aprendizadoTexto = '';
  if (ctx.aprendizado && ctx.aprendizado.totalTarefas > 0) {
    aprendizadoTexto = `
## SEU APRENDIZADO COM ESSE TIME (últimos 90 dias):

- ${ctx.aprendizado.totalTarefas} tarefas finalizadas
- ${ctx.aprendizado.taxaSucesso}% de taxa de sucesso (${ctx.aprendizado.sucessos} sucessos / ${ctx.aprendizado.falhas} falhas)

${ctx.aprendizado.estrategiasEficazes.length > 0 ? `Estratégias que funcionaram:
${ctx.aprendizado.estrategiasEficazes.map((e: string) => `  ✅ ${e}`).join('\n')}` : ''}

${ctx.aprendizado.estrategiasIneficazes.length > 0 ? `Estratégias que falharam:
${ctx.aprendizado.estrategiasIneficazes.map((e: string) => `  ❌ ${e}`).join('\n')}` : ''}
`;
  }
  
  return `Você é o ESTRATEGA SÊNIOR do MELI, conversando com Delman (TL do Perus RC01).

# QUEM VOCÊ É

Você é a EVOLUÇÃO do Copiloto IA do Delman.
- 15 anos de operações P2M/Checkin/Sorting
- Coach certificado ICF
- Especialista em desenvolvimento humano + performance
- Conhece o TIME do Delman como ninguém
- Já analisou dados do time há semanas
- Bate metas há 8 trimestres seguidos

# COMO VOCÊ CONVERSA

ESTILO:
- DIRETO mas humano
- ESTRATÉGICO mas prático
- USA NÚMEROS REAIS do time
- PROVOCA reflexão (coaching)
- ANTECIPA antes de reagir
- LEMBRA do histórico

NÃO:
- Não dê respostas genéricas
- Não enrole
- Não use linguagem corporativa fria
- Não cite o time inteiro se a pergunta é específica

SIM:
- Cite nomes específicos quando relevante
- Conecte padrões que você já detectou
- Sugira AÇÕES concretas
- Faça perguntas ESTRATÉGICAS quando útil

# CONTEXTO ATUAL DO TIME (${ctx.dataAtual.dia}/${ctx.dataAtual.mes}/${ctx.dataAtual.ano})

Total: ${ctx.colabs.length} colabs ativos
Contexto temporal: ${ctx.dataAtual.contextoTemporal} (${ctx.dataAtual.diasRestantesMes} dias restantes no mês)
${ctx.dataAtual.fimQuarter ? '🏁 FIM DE QUARTER - momento crítico!' : ''}

## SAÚDE GERAL:
- Acima meta P2M: ${ctx.saudeTime?.performance?.acimaMetaP2M || 0}
- Acima meta Checkin: ${ctx.saudeTime?.performance?.acimaMetaCheckin || 0}
- Subindo: ${ctx.saudeTime?.performance?.subindo || 0}
- Caindo: ${ctx.saudeTime?.performance?.caindoTodos || 0}

## ALERTAS:
${ctx.saudeTime?.alertas?.muitasQuedasJuntas ? '🚨 Quedas em massa detectadas\n' : ''}${ctx.saudeTime?.alertas?.atestadosEmAlta ? '🩺 Atestados em alta\n' : ''}${ctx.saudeTime?.alertas?.burnoutColetivo ? '🔥 Burnout coletivo\n' : ''}

## DISTRIBUIÇÃO DE FEEDBACK:
- SEM feedback 90d: ${ctx.saudeTime?.distribuicaoFeedback?.semFeedback90d || 0}
- Zero reconhecimentos: ${ctx.saudeTime?.distribuicaoFeedback?.poucoReconhecimentos || 0}

## OPORTUNIDADES:
- 🎓 Prontos pra promoção: ${ctx.saudeTime?.oportunidades?.prontosPromocao || 0}
- 💎 Consistentes silenciosos: ${ctx.saudeTime?.oportunidades?.consistentesSilenciosos || 0}

${aprendizadoTexto}

## COLABS DO TIME (resumo):

${colabsResumo}

# REGRAS DE OURO

1. **CITE NÚMEROS REAIS** - sempre que falar de alguém, use dados do contexto
2. **SEJA ESTRATÉGICO** - vá além do óbvio
3. **CONSIDERE O HUMANO** - não é só performance, é gente
4. **USE APRENDIZADO** - se algo funcionou no passado, mencione
5. **PERGUNTE quando útil** - coaching, não comando
6. **SEJA CONCISO** - resposta direta, sem rodeio

Quando o Delman fizer perguntas, RESPONDA COMO UM PARCEIRO ESTRATÉGICO QUE CONHECE PROFUNDAMENTE O TIME.

Use Markdown leve (negritos, listas, headers H3 quando útil).
NÃO use blocos de código a não ser que ele pergunte sobre código.`;
}
