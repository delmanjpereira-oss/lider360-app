import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { coletarContextoCompleto } from '../../../../lib/copiloto/coletor-contexto';
import { chamarClaudeJson } from '../../../../lib/ia/claude-client';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export const maxDuration = 60;

export async function POST() {
  try {
    const { colabs, metas, limiteAtingido } = await coletarContextoCompleto();
    
    if (limiteAtingido) {
      return NextResponse.json({ 
        sucesso: true, 
        tarefas_geradas: 0,
        motivo: 'Limite de tarefas pendentes atingido'
      });
    }
    
    if (colabs.length === 0) {
      return NextResponse.json({ sucesso: true, tarefas_geradas: 0 });
    }
    
    const colabsComVaga = colabs.filter(c => 
      c.tarefasPendentes === 0 && c.fonteDados !== 'nenhum'
    );
    
    if (colabsComVaga.length === 0) {
      return NextResponse.json({ 
        sucesso: true, 
        tarefas_geradas: 0,
        motivo: 'Todos colabs já têm tarefa pendente OU sem dados'
      });
    }
    
    const vagasDisponiveis = colabsComVaga[0]?.vagasNoLimite || 10;
    const colabsAnalisar = colabsComVaga.slice(0, Math.min(vagasDisponiveis, 20));
    
    const prompt = construirPrompt(colabsAnalisar, metas);
    const systemPrompt = construirSystemPrompt();
    
    // 🎯 USA CLAUDE em vez de Groq
    const tarefasGeradas = await chamarClaudeJson<any[]>(
      [{ role: 'user', content: prompt }],
      {
        systemPrompt,
        temperature: 0.3,
        maxTokens: 4000,
      }
    ).catch(e => {
      console.error('Erro Claude:', e);
      return [];
    });
    
    if (!tarefasGeradas || tarefasGeradas.length === 0) {
      return NextResponse.json({ sucesso: true, tarefas_geradas: 0 });
    }
    
    // Aceita tanto array quanto { tarefas: [...] }
    const tarefas = Array.isArray(tarefasGeradas) 
      ? tarefasGeradas 
      : (tarefasGeradas as any).tarefas || (tarefasGeradas as any).tasks || [];
    
    let inseridas = 0;
    for (const tarefa of tarefas) {
      const colab = colabs.find(c => c.id_groot === tarefa.id_groot);
      if (!colab) continue;
      
      const { count } = await supabase
        .from('tarefas')
        .select('id', { count: 'exact', head: true })
        .eq('id_groot', tarefa.id_groot)
        .eq('status', 'Pendente');
      
      if ((count || 0) > 0) continue;
      
      const contextoDados = {
        fonteDados: colab.fonteDados,
        diarioRecente: colab.diarioRecente,
        mensalAtual: colab.mensalAtual,
        presencaQuarter: colab.presencaQuarter,
        analiseCarreira: colab.analiseCarreira,
        imaUltimo: colab.imaUltimo,
        calibracaoUltima: colab.calibracaoUltima,
      };
      
      const tarefaId = 'TASK-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      
      await supabase.from('tarefas').insert({
        id_tarefa: tarefaId,
        id_groot: colab.id_groot,
        nome: colab.nome,
        processo: colab.processo,
        tipo: tarefa.tipo || 'Análise',
        prioridade: tarefa.prioridade || 'media',
        diagnostico: tarefa.diagnostico || null,
        analise_ia: tarefa.analise_ia || null,
        hipotese: tarefa.hipotese || null,
        motivo: tarefa.acao_sugerida || null,
        gatilho_origem: tarefa.gatilho || colab.fonteDados,
        feedback_obrigatorio: tarefa.feedback_obrigatorio !== false,
        contexto_dados: contextoDados,
        gerado_por_ia: true,
        status: 'Pendente',
        criado_em: new Date().toISOString(),
      });
      
      inseridas++;
    }
    
    return NextResponse.json({ 
      sucesso: true, 
      tarefas_geradas: inseridas,
      analisados: colabsAnalisar.length,
      modelo: 'claude-sonnet-4-5'
    });
    
  } catch (e: any) {
    console.error('❌ Erro Copiloto:', e);
    return NextResponse.json({ 
      sucesso: false, 
      erro: e.message || 'Erro desconhecido'
    }, { status: 500 });
  }
}

// ============================================
// SYSTEM PROMPT - persona da Claude
// ============================================

function construirSystemPrompt(): string {
  return `Você é um analista sênior do MELI (Mercado Livre), especialista em gestão de operações e desempenho de equipes em centros de distribuição.

Sua experiência cobre:
- **Operações P2M e Checkin**: processos, métricas, KPIs
- **Produtividade**: Líquida, Supera, NET, Ociosidade, Velocidade Efetiva
- **Qualidade**: DPMO, IMA, defeitos, auditorias
- **Carreira**: trilhas P1→P2→P3→P4, critérios de promoção, tempo mínimo
- **Presença**: ABS, atestados, faltas justificadas/injustificadas, BH
- **Calibração**: classificação Supera/Alinhado/Abaixo

Sua MISSÃO:
- Analisar com PROFUNDIDADE (não superficialmente)
- Propor AÇÕES CONCRETAS (não genéricas como "fazer feedback")
- Mencionar NÚMEROS específicos no diagnóstico
- Considerar CONTEXTO COMPLETO (performance + presença + carreira)
- Pensar como um TL EXPERIENTE que conhece o operacional
- NÃO bloquear promoções automaticamente - mostrar dados para o líder decidir
- Ser DIRETO e ACIONÁVEL

Você responde SEMPRE em JSON válido, sem texto antes ou depois.`;
}

// ============================================
// PROMPT PRINCIPAL
// ============================================

function construirPrompt(colabs: any[], metas: Record<string, number>): string {
  const META_LIQUIDA_P2M = metas['meta_liquida_p2m'] || 280;
  const META_LIQUIDA_CHECKIN = metas['meta_liquida_checkin'] || 100;
  const META_SUPERA = metas['meta_supera'] || 95;
  
  const colabsDescricao = colabs.map(c => {
    let descricao = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    descricao += `👤 ${c.nome} | ID: ${c.id_groot} | ${c.processo || 'sem processo'}\n`;
    descricao += `   ${c.cargo || 'sem cargo'} | ${c.carreira || 'sem carreira'}\n`;
    descricao += `   🔍 Fonte: ${c.fonteDados.toUpperCase()}\n`;
    
    if (c.diarioRecente && c.diarioRecente.dias_com_dado > 0) {
      descricao += `\n📅 PERFORMANCE DIÁRIA (últimos 30 dias):\n`;
      descricao += `   • Líquida média: ${c.diarioRecente.liquida_media.toFixed(0)} pç/h\n`;
      descricao += `   • Supera média: ${c.diarioRecente.supera_media.toFixed(1)}%\n`;
      descricao += `   • Dias com dado: ${c.diarioRecente.dias_com_dado}\n`;
      if (c.diarioRecente.ultimo_dia) {
        descricao += `   • Último dia: ${c.diarioRecente.ultimo_dia}\n`;
      }
      
      const meta = c.processo === 'P2M' ? META_LIQUIDA_P2M : META_LIQUIDA_CHECKIN;
      const pctMeta = ((c.diarioRecente.liquida_media / meta) * 100).toFixed(1);
      descricao += `   • % da meta (${meta}): ${pctMeta}%\n`;
    }
    
    if (c.mensalAtual) {
      const labelFonte = c.fonteDados === 'mensal' 
        ? '📊 PRODUTIVIDADE MENSAL (fonte principal - sem diário disponível):'
        : '📊 RESUMO MENSAL (complementar):';
      
      descricao += `\n${labelFonte}\n`;
      descricao += `   • Mês: ${c.mensalAtual.mes}/${c.mensalAtual.ano}\n`;
      descricao += `   • Líquida média: ${c.mensalAtual.prod_liquida} pç/h\n`;
      descricao += `   • Unidades totais: ${c.mensalAtual.unidades_total.toLocaleString('pt-BR')}\n`;
      descricao += `   • Dias trabalhados: ${c.mensalAtual.dias_trabalhados}\n`;
      
      const meta = c.processo === 'P2M' ? META_LIQUIDA_P2M : META_LIQUIDA_CHECKIN;
      const pctMeta = ((c.mensalAtual.prod_liquida / meta) * 100).toFixed(1);
      descricao += `   • % da meta (${meta}): ${pctMeta}%\n`;
    }
    
    const p = c.presencaQuarter;
    if (p.presencas > 0 || p.atestados > 0 || p.faltasInjustificadas > 0) {
      descricao += `\n🩺 PRESENÇA NO QUARTER:\n`;
      descricao += `   • Presenças: ${p.presencas}\n`;
      if (p.atestados > 0) descricao += `   • Atestados: ${p.atestados}\n`;
      if (p.faltasInjustificadas > 0) descricao += `   • Faltas injustificadas: ${p.faltasInjustificadas} ⚠️\n`;
      if (p.bhNaoPlanejado > 0) descricao += `   • BH não planejado: ${p.bhNaoPlanejado}\n`;
      if (p.sinergiaExterna > 0) descricao += `   • Sinergia externa: ${p.sinergiaExterna}\n`;
      if (p.pctAbs > 0) descricao += `   • % ABS: ${p.pctAbs}%\n`;
    }
    
    if (c.analiseCarreira) {
      descricao += `\n🎯 CARREIRA:\n`;
      descricao += `   • ${c.analiseCarreira.mesesNaEmpresa} meses na empresa\n`;
      descricao += `   • ${c.analiseCarreira.mesesNaCarreira} meses em ${c.carreira || 'carreira atual'}\n`;
      if (c.proxima_carreira) {
        descricao += `   • Próxima: ${c.proxima_carreira}\n`;
      }
      if (c.analiseCarreira.podeProximaCarreira) {
        descricao += `   • 🎉 PODE PROMOVER (atende tempo mínimo)\n`;
      }
    }
    
    if (c.imaUltimo) descricao += `\n📋 IMA: ${c.imaUltimo}\n`;
    if (c.calibracaoUltima) descricao += `📋 Calibração: ${c.calibracaoUltima}\n`;
    
    return descricao;
  }).join('\n');
  
  return `Analise os dados dos colaboradores abaixo e gere tarefas de feedback PRIORITÁRIAS.

🎯 OBJETIVO: Identificar quem precisa de atenção e gerar tarefas ACIONÁVEIS.

📋 INSTRUÇÕES:
1. PRIORIZE dados DIÁRIOS (mais granulares); MENSAL como fallback
2. Sempre referencie NÚMEROS específicos no diagnóstico
3. CONSIDERE presença - alto ABS é sinal vermelho
4. RESPEITE carreira - quem está apto pra promoção MERECE conversa
5. NÃO BLOQUEIE PROMOÇÃO automaticamente - mostre os dados pro líder
6. Se NÃO TEM dados, NÃO gere tarefa (fonte = 'nenhum')

🎯 NÍVEIS DE PRIORIDADE:
- **critica**: Líquida >20% abaixo da meta OU ABS >10%
- **alta**: Líquida 10-20% abaixo da meta
- **media**: Performance ok mas pode melhorar OU pode promover
- **baixa**: Performance excelente - reconhecimento

📋 TIPOS DE TAREFA:
- "Performance Crítica"
- "Performance Abaixo"
- "Oportunidade de Promoção"
- "Reconhecimento"
- "ABS Alto"

═══════════════════════════════════════════════════════════
📊 DADOS DOS COLABORADORES:
${colabsDescricao}
═══════════════════════════════════════════════════════════

🎯 METAS DO TIME:
- Líquida P2M: ${META_LIQUIDA_P2M} pç/h
- Líquida Checkin: ${META_LIQUIDA_CHECKIN} pç/h
- Supera: ${META_SUPERA}%

⚠️ IMPORTANTE:
- VAGAS DISPONÍVEIS: ${colabs[0]?.vagasNoLimite || 10}
- Gere NO MÁXIMO esse número de tarefas
- Priorize por urgência (críticas primeiro)
- Pra cada tarefa, MENCIONE A FONTE no diagnóstico

Responda APENAS um JSON array (sem texto antes/depois):
[
  {
    "id_groot": "1710556",
    "tipo": "Reconhecimento",
    "prioridade": "baixa",
    "diagnostico": "Jessiele com 324 pç/h em Maio (dados mensais), 15.7% acima da meta P2M",
    "analise_ia": "Performance consistente com 24 dias trabalhados e 45.425 unidades, indicando estabilidade operacional",
    "hipotese": "Combina velocidade com consistência. Apta pra próxima carreira (8m em P2)",
    "acao_sugerida": "Conversa de reconhecimento + alinhar trilha de carreira P3",
    "gatilho": "mensal_acima_meta",
    "feedback_obrigatorio": true
  }
]`;
}
