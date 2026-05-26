// ============================================
// 💬 API CHAT COM CLAUDE - Estratega do Time
// ============================================
// 🔧 FIX: Coleta contexto SEMPRE, ignora trava de meta diária
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { chamarClaude } from '../../../../lib/ia/claude-client';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export const maxDuration = 60;

// ============================================
// COLETOR DEDICADO PRO CHAT
// Não tem trava de meta diária - SEMPRE retorna contexto completo
// ============================================
async function coletarContextoChat() {
  const { data: configData } = await supabase.from('config').select('chave, valor');
  
  const metas: Record<string, number> = {};
  (configData || []).forEach((c: any) => {
    metas[c.chave] = Number(c.valor) || 0;
  });
  
  // Data atual
  const dataAtualObj = new Date();
  const diaAtual = dataAtualObj.getDate();
  const mesAtual = dataAtualObj.getMonth() + 1;
  const anoAtual = dataAtualObj.getFullYear();
  const ultimoDiaMes = new Date(anoAtual, mesAtual, 0).getDate();
  
  let contextoTemporal: string;
  if (diaAtual <= 7) contextoTemporal = 'inicio_mes';
  else if (diaAtual <= 22) contextoTemporal = 'meio_mes';
  else contextoTemporal = 'fechamento';
  
  const dataAtual = {
    dia: diaAtual,
    mes: mesAtual,
    ano: anoAtual,
    diasRestantesMes: ultimoDiaMes - diaAtual,
    contextoTemporal,
    fimQuarter: mesAtual % 3 === 0,
    diaSemana: ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][dataAtualObj.getDay()],
  };
  
  // Busca colabs ativos
  const { data: colabsData, error: errColabs } = await supabase
    .from('colaboradores')
    .select('*')
    .eq('status', 'Ativo');
  
  console.log('🔍 [CHAT] Colabs ativos:', colabsData?.length || 0);
  if (errColabs) console.error('❌ Erro buscando colabs:', errColabs);
  
  if (!colabsData || colabsData.length === 0) {
    return {
      colabs: [],
      metas,
      dataAtual,
      saudeTime: null,
      aprendizado: null,
      erro: errColabs?.message || 'Sem colaboradores ativos no banco',
    };
  }
  
  const idsGroot = colabsData.map(c => c.id_groot);
  const dias30atras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dias90atras = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // Busca dados leves pra cada colab
  const [
    { data: historicoData },
    { data: produtividadeMensalData },
    { data: presencaData },
    { data: feedbacksData },
    { data: tarefasFinalizadasData },
  ] = await Promise.all([
    supabase.from('historico')
      .select('id_groot, data_referencia, prod_liquida, status_meta, impacto_net')
      .in('id_groot', idsGroot)
      .gte('data_referencia', dias30atras),
    supabase.from('produtividade_mensal')
      .select('id_groot, mes, ano, processo, prod_liquida_media, unidades_total, dias_trabalhados')
      .in('id_groot', idsGroot)
      .order('ano', { ascending: false })
      .order('mes', { ascending: false }),
    supabase.from('presenca')
      .select('id_groot, motivo, status, data_referencia')
      .in('id_groot', idsGroot)
      .gte('data_referencia', dias90atras),
    supabase.from('feedbacks')
      .select('id_groot, tipo, classificacao, registrado_em')
      .in('id_groot', idsGroot)
      .gte('registrado_em', dias90atras),
    supabase.from('tarefas')
      .select('classificacao_aprendizado, tipo, finalizada_em')
      .eq('status', 'Finalizada')
      .not('classificacao_aprendizado', 'is', null)
      .gte('finalizada_em', dias90atras),
  ]);
  
  console.log('📊 [CHAT] Dados coletados:', {
    historico: historicoData?.length || 0,
    mensal: produtividadeMensalData?.length || 0,
    presenca: presencaData?.length || 0,
    feedbacks: feedbacksData?.length || 0,
    finalizadas: tarefasFinalizadasData?.length || 0,
  });
  
  // Mapeia por colab
  const mapaHistorico: Record<string, any[]> = {};
  (historicoData || []).forEach((h: any) => {
    if (!mapaHistorico[h.id_groot]) mapaHistorico[h.id_groot] = [];
    mapaHistorico[h.id_groot].push(h);
  });
  
  const mapaMensal: Record<string, any[]> = {};
  (produtividadeMensalData || []).forEach((p: any) => {
    if (!mapaMensal[p.id_groot]) mapaMensal[p.id_groot] = [];
    mapaMensal[p.id_groot].push(p);
  });
  
  const mapaPresenca: Record<string, any[]> = {};
  (presencaData || []).forEach((p: any) => {
    if (!mapaPresenca[p.id_groot]) mapaPresenca[p.id_groot] = [];
    mapaPresenca[p.id_groot].push(p);
  });
  
  const mapaFeedbacks: Record<string, any[]> = {};
  (feedbacksData || []).forEach((f: any) => {
    if (!mapaFeedbacks[f.id_groot]) mapaFeedbacks[f.id_groot] = [];
    mapaFeedbacks[f.id_groot].push(f);
  });
  
  // Constrói lista de colabs com dados básicos
  const colabs = colabsData.map((c: any) => {
    const historico = mapaHistorico[c.id_groot] || [];
    const mensais = mapaMensal[c.id_groot] || [];
    const presencas = mapaPresenca[c.id_groot] || [];
    const feedbacks = mapaFeedbacks[c.id_groot] || [];
    
    const liquidas = historico.map(h => Number(h.prod_liquida) || 0).filter(v => v > 0);
    const media30d = liquidas.length > 0 ? liquidas.reduce((s, v) => s + v, 0) / liquidas.length : 0;
    
    const mensalAtual = mensais.find(m => m.mes === mesAtual && m.ano === anoAtual);
    const mensalAnterior = mensais[1];
    
    const ultimoFeedback = feedbacks[0] || null;
    const diasDesdeFeedback = ultimoFeedback 
      ? Math.floor((Date.now() - new Date(ultimoFeedback.registrado_em).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    
    const atestados = presencas.filter(p => (p.motivo || '').toLowerCase().includes('atestado')).length;
    const faltas = presencas.filter(p => (p.motivo || '').toLowerCase().includes('fi - falta')).length;
    
    return {
      id_groot: c.id_groot,
      nome: c.nome,
      processo: c.processo,
      cargo: c.cargo,
      carreira: c.carreira,
      media_30d: Math.round(media30d),
      mensal_atual: mensalAtual ? Number(mensalAtual.prod_liquida_media) : null,
      mensal_anterior: mensalAnterior ? Number(mensalAnterior.prod_liquida_media) : null,
      dias_no_mes: mensalAtual?.dias_trabalhados || 0,
      atestados_90d: atestados,
      faltas_90d: faltas,
      feedbacks_90d: feedbacks.length,
      ultimo_feedback: ultimoFeedback ? {
        tipo: ultimoFeedback.tipo,
        classificacao: ultimoFeedback.classificacao,
        dias_atras: diasDesdeFeedback,
      } : null,
      fonte_dados: liquidas.length > 0 ? 'diario' : (mensalAtual ? 'mensal' : 'sem_dados'),
    };
  });
  
  // Saúde do time
  const META_P2M = metas['meta_liquida_p2m'] || 280;
  const META_CHECKIN = metas['meta_liquida_checkin'] || 100;
  
  const saudeTime = {
    total: colabs.length,
    acima_meta: colabs.filter(c => {
      const meta = c.processo === 'P2M' ? META_P2M : META_CHECKIN;
      const valor = c.media_30d || c.mensal_atual || 0;
      return valor >= meta;
    }).length,
    abaixo_meta: colabs.filter(c => {
      const meta = c.processo === 'P2M' ? META_P2M : META_CHECKIN;
      const valor = c.media_30d || c.mensal_atual || 0;
      return valor > 0 && valor < meta;
    }).length,
    sem_dados: colabs.filter(c => c.fonte_dados === 'sem_dados').length,
    sem_feedback_90d: colabs.filter(c => c.feedbacks_90d === 0).length,
    atestados_alta: colabs.filter(c => c.atestados_90d >= 3).length,
  };
  
  // Aprendizado
  const aprendizado = (() => {
    if (!tarefasFinalizadasData || tarefasFinalizadasData.length === 0) {
      return { totalTarefas: 0, sucessos: 0, falhas: 0, taxaSucesso: 0 };
    }
    const sucessos = tarefasFinalizadasData.filter(t => 
      t.classificacao_aprendizado?.includes('sucesso') || t.classificacao_aprendizado === 'abordagem_funcionou'
    ).length;
    const falhas = tarefasFinalizadasData.filter(t => 
      t.classificacao_aprendizado?.includes('falha') || t.classificacao_aprendizado === 'abordagem_falhou'
    ).length;
    return {
      totalTarefas: tarefasFinalizadasData.length,
      sucessos,
      falhas,
      taxaSucesso: (sucessos + falhas) > 0 ? Math.round((sucessos / (sucessos + falhas)) * 100) : 0,
    };
  })();
  
  return { colabs, metas, dataAtual, saudeTime, aprendizado, erro: null };
}

// ============================================
// POST: Chat com Claude
// ============================================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mensagem, id_conversa } = body;
    
    if (!mensagem) {
      return NextResponse.json({ erro: 'Mensagem obrigatória' }, { status: 400 });
    }
    
    const conversaId = id_conversa || `chat-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    
    // 1️⃣ Salva pergunta
    await supabase.from('chat_conversas').insert({
      id_conversa: conversaId,
      papel: 'user',
      conteudo: mensagem,
    });
    
    // 2️⃣ Busca histórico
    const { data: historicoMsgs } = await supabase
      .from('chat_conversas')
      .select('papel, conteudo')
      .eq('id_conversa', conversaId)
      .order('criado_em', { ascending: true })
      .limit(20);
    
    // 3️⃣ Coleta contexto (SEM trava)
    const ctx = await coletarContextoChat();
    
    console.log(`💬 [CHAT] Pergunta: "${mensagem.slice(0, 50)}..." | Colabs no contexto: ${ctx.colabs.length}`);
    
    // 4️⃣ Monta system prompt
    const systemPrompt = construirSystemPrompt(ctx);
    
    // 5️⃣ Chama Claude
    const messages = (historicoMsgs || []).map(m => ({
      role: m.papel as 'user' | 'assistant',
      content: m.conteudo,
    }));
    
    const resposta = await chamarClaude(messages, {
      systemPrompt,
      temperature: 0.6,
      maxTokens: 3000,
    });
    
    // 6️⃣ Salva resposta
    await supabase.from('chat_conversas').insert({
      id_conversa: conversaId,
      papel: 'assistant',
      conteudo: resposta,
      contexto_usado: {
        total_colabs: ctx.colabs.length,
        sem_dados: ctx.saudeTime?.sem_dados || 0,
      },
    });
    
    return NextResponse.json({
      sucesso: true,
      resposta,
      id_conversa: conversaId,
      debug: {
        total_colabs: ctx.colabs.length,
        com_dados: ctx.colabs.filter(c => c.fonte_dados !== 'sem_dados').length,
      },
    });
    
  } catch (e: any) {
    console.error('❌ Erro chat:', e);
    return NextResponse.json({ sucesso: false, erro: e.message }, { status: 500 });
  }
}

// ============================================
// SYSTEM PROMPT
// ============================================
function construirSystemPrompt(ctx: any): string {
  if (!ctx.colabs || ctx.colabs.length === 0) {
    return `Você é o Estratega do Delman.

ATENÇÃO: Não foram encontrados colaboradores ativos no sistema.
${ctx.erro ? `Erro: ${ctx.erro}` : ''}

Se o Delman perguntar sobre o time, explique que houve um problema de sincronização e peça pra ele verificar:
1. Se há colabs com status="Ativo" no banco
2. Se a tabela colaboradores está populada

Seja honesto sobre não ter dados, mas amigável.`;
  }
  
  const META_P2M = ctx.metas['meta_liquida_p2m'] || 280;
  const META_CHECKIN = ctx.metas['meta_liquida_checkin'] || 100;
  
  // Lista TODOS os colabs com dados básicos
  const colabsTexto = ctx.colabs.map((c: any) => {
    const valor = c.media_30d || c.mensal_atual || 0;
    const meta = c.processo === 'P2M' ? META_P2M : META_CHECKIN;
    const pctMeta = meta > 0 && valor > 0 ? Math.round((valor / meta) * 100) : 0;
    const fonte = c.fonte_dados === 'diario' ? '(diário)' : c.fonte_dados === 'mensal' ? `(mensal ${c.dias_no_mes}d)` : '(SEM dados)';
    
    let linha = `• ${c.nome} (${c.processo || '?'})`;
    if (valor > 0) {
      linha += ` | ${valor} pç/h ${fonte} = ${pctMeta}% meta`;
    } else {
      linha += ` | sem dados de performance`;
    }
    if (c.atestados_90d > 0) linha += ` | ${c.atestados_90d}ates`;
    if (c.faltas_90d > 0) linha += ` | ${c.faltas_90d}faltas`;
    if (c.ultimo_feedback) {
      linha += ` | FB ${c.ultimo_feedback.tipo} há ${c.ultimo_feedback.dias_atras}d`;
    } else {
      linha += ` | SEM feedback 90d`;
    }
    return linha;
  }).join('\n');
  
  return `Você é o ESTRATEGA SÊNIOR do MELI, conversando com Delman (TL do Perus RC01).

# QUEM VOCÊ É
- 15 anos de operações P2M/Checkin/Sorting
- Coach certificado ICF
- Conhece o TIME do Delman como ninguém
- Bate metas há 8 trimestres seguidos

# COMO VOCÊ CONVERSA
- DIRETO mas humano
- Cite NOMES REAIS do time
- Use NÚMEROS REAIS
- Antecipe antes de reagir
- Faça coaching, não comando

NÃO:
- Não dê respostas genéricas
- Não diga "não tenho dados" se TEM dados abaixo
- Não enrole

# CONTEXTO ATUAL (${ctx.dataAtual.dia}/${ctx.dataAtual.mes}/${ctx.dataAtual.ano})

Total: ${ctx.colabs.length} colabs ativos
Contexto: ${ctx.dataAtual.contextoTemporal} (${ctx.dataAtual.diasRestantesMes} dias restantes)

## SAÚDE GERAL:
- Acima meta: ${ctx.saudeTime?.acima_meta || 0}
- Abaixo meta: ${ctx.saudeTime?.abaixo_meta || 0}
- Sem dados: ${ctx.saudeTime?.sem_dados || 0}
- Sem feedback 90d: ${ctx.saudeTime?.sem_feedback_90d || 0}
- Atestados em alta (3+): ${ctx.saudeTime?.atestados_alta || 0}

## METAS:
- P2M: ${META_P2M} pç/h
- Checkin: ${META_CHECKIN} pç/h

## APRENDIZADO:
- Total tarefas finalizadas: ${ctx.aprendizado?.totalTarefas || 0}
- Taxa de sucesso: ${ctx.aprendizado?.taxaSucesso || 0}%

# 👥 TIME COMPLETO DO DELMAN:

${colabsTexto}

# REGRAS DE OURO

1. **USE OS DADOS ACIMA** - o time TEM ${ctx.colabs.length} pessoas, com dados reais
2. **CITE NOMES** - sempre que falar de alguém, use o nome real
3. **NÚMEROS REAIS** - performance, atestados, feedbacks
4. **SEJA ESTRATÉGICO** - vá além do óbvio
5. **CONSIDERE HUMANO** - pessoa por trás do número

Use Markdown leve (negritos, listas).
Resposta DIRETA, sem rodeio.`;
}
