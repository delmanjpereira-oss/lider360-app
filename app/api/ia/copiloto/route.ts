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
    const ctx = await coletarContextoCompleto();
    
    if (!ctx.podeGerar) {
      return NextResponse.json({ 
        sucesso: true, 
        tarefas_geradas: 0,
        motivo: `Meta diária já cumprida: ${ctx.tarefasGeradasHoje}/${ctx.metaDiariaIA}`,
        proxima_geracao: 'Amanhã',
      });
    }
    
    if (ctx.colabs.length === 0) {
      return NextResponse.json({ sucesso: true, tarefas_geradas: 0 });
    }
    
    // Filtra colabs que podem receber tarefa
    const colabsElegiveis = ctx.colabs.filter(c => 
      c.podeSerSugerido && c.performance.fonteDados !== 'nenhum'
    );
    
    if (colabsElegiveis.length === 0) {
      return NextResponse.json({ 
        sucesso: true, 
        tarefas_geradas: 0,
        motivo: 'Todos colabs já têm tarefa pendente ou recente (14 dias)',
      });
    }
    
    // Prepara prompt
    const prompt = construirPrompt(colabsElegiveis, ctx.saudeTime, ctx.dataAtual, ctx.metas);
    const systemPrompt = construirSystemPrompt();
    
    // 🎯 CLAUDE SONNET 4.5 com persona PROFUNDA
    const tarefasGeradas = await chamarClaudeJson<any>(
      [{ role: 'user', content: prompt }],
      {
        systemPrompt,
        temperature: 0.5, // Um pouco mais criativo
        maxTokens: 6000,  // Mais espaço pra análise rica
      }
    ).catch(e => {
      console.error('Erro Claude:', e);
      return [];
    });
    
    if (!tarefasGeradas) {
      return NextResponse.json({ sucesso: true, tarefas_geradas: 0 });
    }
    
    // Aceita array ou { tarefas: [...] }
    const tarefas = Array.isArray(tarefasGeradas) 
      ? tarefasGeradas 
      : (tarefasGeradas.tarefas || tarefasGeradas.tasks || []);
    
    // 🎯 Limita pela meta diária
    const tarefasParaInserir = tarefas.slice(0, ctx.vagasHoje);
    
    let inseridas = 0;
    for (const tarefa of tarefasParaInserir) {
      const colab = ctx.colabs.find(c => c.id_groot === tarefa.id_groot);
      if (!colab) continue;
      
      // Double-check anti-duplicação
      const { count } = await supabase
        .from('tarefas')
        .select('id', { count: 'exact', head: true })
        .eq('id_groot', tarefa.id_groot)
        .or('status.eq.Pendente,criado_em.gte.' + new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());
      
      if ((count || 0) > 0) continue;
      
      const contextoDados = {
        fonteDados: colab.performance.fonteDados,
        performance: colab.performance,
        padroes: colab.padroes,
        presenca: colab.presenca,
        carreira_info: colab.carreira_info,
        acompanhamento: colab.acompanhamento,
        memoria: colab.memoria,
        vieses: colab.vieses,
        burnout: colab.burnout,
        reconhecimentoInvisivel: colab.reconhecimentoInvisivel,
        contexto_temporal: ctx.dataAtual,
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
        gatilho_origem: tarefa.gatilho || 'analise_inteligente',
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
      meta_diaria: ctx.metaDiariaIA,
      tarefas_hoje: ctx.tarefasGeradasHoje + inseridas,
      modelo: 'claude-sonnet-4-5',
      contexto: ctx.dataAtual.contextoTemporal,
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
// 🧠 SYSTEM PROMPT MESTRE - Persona profunda
// ============================================

function construirSystemPrompt(): string {
  return `Você é o ANALISTA SÊNIOR DE GENTE & OPERAÇÕES MAIS EXPERIENTE DO MELI.

# QUEM VOCÊ É

Sua persona:
- 15 anos de operações P2M/Checkin/Sorting no Mercado Livre
- Já gerenciou times de 5 a 200 colaboradores  
- Coach certificado pela ICF (International Coach Federation)
- Especialista em desenvolvimento humano + performance
- Bate metas há 8 trimestres seguidos
- Conhecido por DESENVOLVER PESSOAS, não só cobrar números

# SUA MISSÃO

Você NÃO é uma máquina de gerar tarefas.
Você É um PARCEIRO ESTRATÉGICO do TL.

Cada tarefa que você sugere = uma intervenção pensada que pode mudar uma carreira, salvar um talento, evitar uma demissão, ou impulsionar alguém pra cima.

# SEUS 12 SUPERPODERES

## 1. INTELIGÊNCIA MULTI-PRAZO
- CURTO (7 dias): variações pontuais, eventos
- MÉDIO (30 dias): tendências, consistência  
- LONGO (3+ meses): padrões, evolução, carreira

## 2. CONTEXTO TEMPORAL
Você SABE qual dia/mês/Q é hoje:
- Início do mês (1-7): alinhamento, planejamento
- Meio do mês (8-22): aceleração, ajustes
- Fechamento (23-31): recuperação, fechar bem

## 3. ACOMPANHAMENTO DE FEEDBACK
Você LEMBRA dos feedbacks dados pelo TL:
- Se TL deu feedback e MELHOROU → reconheça a evolução
- Se TL deu feedback e tá IGUAL → sugerir aprofundar
- Se TL deu feedback e PIOROU → mudar abordagem

## 4. SAÚDE SISTÊMICA DO TIME
Você vê o TIME como organismo:
- 5+ pessoas caindo juntas? Pode ser problema coletivo
- Atestados em alta? Cuidar do bem-estar
- Burnout coletivo? Alertar ANTES de virar crise

## 5. CICLOS DE DESENVOLVIMENTO (30/60/90)
Você pensa em ondas:
- 1-30 dias: semente (primeira mudança)
- 30-60 dias: crescimento (consolidação)  
- 60-90 dias: maturidade (próximo nível)

## 6. COACHING COM PERGUNTAS
Você NÃO impõe. Você PROVOCA REFLEXÃO:
- "Antes da conversa, REFLITA: ..."
- "Pergunta poderosa pra começar: ..."
- "OUÇA antes de falar"

## 7. RECONHECIMENTO ESTRATÉGICO
Você sabe que existem 4 tipos:
- PÚBLICO: pros que inspiram time
- PRIVADO: pros tímidos
- DE EVOLUÇÃO: pros que cresceram (mesmo devagar)
- DO INVISÍVEL: pros silenciosos e consistentes

## 8. ANTI-VIESES
Você protege o TL de armadilhas:
- VIÉS DA RECÊNCIA: "Você lembra só do que aconteceu hoje"
- VIÉS DA FREQUÊNCIA: "Você foca nos difíceis, esquece bons"
- VIÉS DO ESFORÇO APARENTE: "Quem corre nem sempre produz"

## 9. MEMÓRIA HISTÓRICA
Você LEMBRA tudo:
- "Faz 3 meses você conversou X com ela. Hoje ela faz Y. CRESCEU."
- "Ele já foi APTO no Q1, EM OBSERVAÇÃO no Q2. Padrão sazonal?"

## 10. RADAR DE BURNOUT
Você detecta sinais SUTIS:
- ABS subindo + performance caindo + horário irregular
- "Não é hora de COBRAR. É hora de CUIDAR."

## 11. DETETIVE DE PADRÕES
Você acha o que outros não veem:
- "Quedas sempre em segunda → fim de semana ruim?"
- "Todos caem dia 15 → mudança operacional?"

## 12. DEFENSORA DA HUMANIDADE
Você considera contexto HUMANO:
- Saúde, família, situação financeira
- "Cuidado com decisões precipitadas. Estratégia longa, não Q único."

# COMO VOCÊ ESCREVE

## DIAGNÓSTICO
NÃO faça:
❌ "Performance abaixo da meta"

FAÇA:
✅ "Maria 305 pç/h nos últimos 30 dias (vs meta 280).
    PORÉM cai 3 semanas consecutivas (320 → 310 → 305).
    Tendência preocupante apesar de ainda acima da meta."

## ANÁLISE_IA
Vá ALÉM dos números:
✅ "Padrão de queda gradual + ABS estável + sem feedback há 45 dias
    sugere possível desconexão emocional. Performance é sintoma, 
    não causa raiz."

## HIPÓTESE
Especule HUMANAMENTE:
✅ "Pode estar: sentindo-se invisível (sem feedback recente),
    cansada (família, saúde), ou desmotivada (sem perspectiva).
    Conversa privada antes de cobrar."

## AÇÃO_SUGERIDA
Faça COACHING:
✅ "Estratégia em 3 passos:
    
    1. ANTES (preparação interna):
       Relembre: quando foi a última conversa não-trabalho?
       Lembre: ela teve algum momento difícil recente?
    
    2. CONVERSA (não comece pelo número):
       'Maria, queria saber como você tem se sentido nessas 
        semanas. Notei que tem sido diferente.'
       OUÇA. Não interrompa. Não defenda.
    
    3. DEPOIS (acompanhamento):
       Em 7 dias, breve check-in: 'Como tá?'
       Em 30 dias, avaliar evolução."

# REGRAS DE OURO

1. **NÃO DUPLICAR** - Se a pessoa tem tarefa pendente ou recebeu 
   tarefa nos últimos 14 dias, NÃO sugerir.

2. **EQUILIBRAR** - Em 5 tarefas, varie:
   - Performance (não só)
   - Reconhecimento (essencial!)
   - Carreira (oportunidade)
   - Cuidado preventivo

3. **PROFUNDIDADE** - Cada tarefa deve ter:
   - Dado real (números)
   - Padrão identificado (não só evento)
   - Estratégia humana (não só comando)

4. **HUMANIDADE** - Sempre considere:
   - A pessoa pode estar passando algo
   - O número não conta toda história
   - Liderança é desenvolver, não cobrar

5. **MEMÓRIA** - Use o histórico:
   - "Já recebeu feedback há X dias sobre Y"
   - "Calibração passada foi Z"

# FORMATO DE RESPOSTA

Responda SEMPRE em JSON válido (sem texto antes/depois):

[
  {
    "id_groot": "1710556",
    "tipo": "Reconhecimento Estratégico" | "Acompanhamento de Evolução" | "Antecipação de Queda" | "Coaching Preventivo" | "Cuidado de Bem-Estar" | "Oportunidade de Carreira" | "Quebra de Padrão" | "Reconhecimento Invisível",
    "prioridade": "critica" | "alta" | "media" | "baixa",
    "diagnostico": "Análise rica com NÚMEROS + PADRÕES + TEMPO",
    "analise_ia": "Sua interpretação ESTRATÉGICA do que tá por trás",
    "hipotese": "Especulação HUMANA do que pode estar acontecendo",
    "acao_sugerida": "Estratégia em PASSOS com COACHING, não comando",
    "gatilho": "padrao_detectado_ou_oportunidade",
    "feedback_obrigatorio": true
  }
]`;
}

// ============================================
// 📝 PROMPT COM DADOS DO TIME
// ============================================

function construirPrompt(colabs: any[], saudeTime: any, dataAtual: any, metas: Record<string, number>): string {
  const META_LIQUIDA_P2M = metas['meta_liquida_p2m'] || 280;
  const META_LIQUIDA_CHECKIN = metas['meta_liquida_checkin'] || 100;
  
  // Contexto temporal explícito
  const contextoTemporalTexto = {
    inicio_mes: '🌅 INÍCIO DO MÊS (foco em alinhamento, planejamento)',
    meio_mes: '☀️ MEIO DO MÊS (foco em aceleração, ajustes)',
    fechamento: '🌆 FECHAMENTO (foco em recuperação, fechar bem)',
  }[dataAtual.contextoTemporal as string] || '';
  
  // 🆕 ALERTAS SISTÊMICOS
  let alertasSistemicos = '';
  if (saudeTime?.alertas) {
    const alerts = [];
    if (saudeTime.alertas.muitasQuedasJuntas) {
      alerts.push(`🚨 ${saudeTime.performance.caindoTodos} colabs caindo juntos - pode ser problema COLETIVO`);
    }
    if (saudeTime.alertas.atestadosEmAlta) {
      alerts.push(`🩺 Múltiplos colabs com atestados em alta - radar de bem-estar`);
    }
    if (saudeTime.alertas.burnoutColetivo) {
      alerts.push(`🔥 Sinais de burnout em vários colabs - cuidado preventivo`);
    }
    if (saudeTime.distribuicaoFeedback.semFeedback90d > 5) {
      alerts.push(`⚠️ ${saudeTime.distribuicaoFeedback.semFeedback90d} colabs SEM FEEDBACK há 90+ dias`);
    }
    if (saudeTime.distribuicaoFeedback.poucoReconhecimentos > 10) {
      alerts.push(`💔 ${saudeTime.distribuicaoFeedback.poucoReconhecimentos} colabs nunca foram RECONHECIDOS`);
    }
    if (alerts.length > 0) {
      alertasSistemicos = '\n## 🚨 ALERTAS SISTÊMICOS DO TIME\n' + alerts.map(a => `   ${a}`).join('\n') + '\n';
    }
  }
  
  // Descreve cada colab COM PROFUNDIDADE
  const colabsDescricao = colabs.map(c => {
    let desc = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    desc += `👤 ${c.nome} | ID: ${c.id_groot} | ${c.processo || 'sem processo'}\n`;
    desc += `   ${c.cargo || 'sem cargo'} | Carreira: ${c.carreira || 'não informada'}\n`;
    desc += `   ${c.carreira_info.mesesNaEmpresa}m na empresa | ${c.carreira_info.mesesNaCarreira}m na carreira atual\n`;
    
    // 📅 PERFORMANCE MULTI-PRAZO
    desc += `\n📊 PERFORMANCE MULTI-PRAZO:\n`;
    
    if (c.performance.curto_prazo_7d.dias > 0) {
      const t7d = c.performance.curto_prazo_7d.tendencia;
      desc += `   • 7 DIAS: ${c.performance.curto_prazo_7d.media} pç/h `;
      desc += `(${c.performance.curto_prazo_7d.dias} dias, ${t7d.tendencia} ${t7d.variacao_pct > 0 ? '+' : ''}${t7d.variacao_pct}%)\n`;
    }
    
    if (c.performance.medio_prazo_30d.dias > 0) {
      const t30d = c.performance.medio_prazo_30d.tendencia;
      desc += `   • 30 DIAS: ${c.performance.medio_prazo_30d.media} pç/h `;
      desc += `(${c.performance.medio_prazo_30d.dias} dias, ${t30d.tendencia} ${t30d.variacao_pct > 0 ? '+' : ''}${t30d.variacao_pct}% - força ${t30d.forca})\n`;
      
      const meta = c.processo === 'P2M' ? META_LIQUIDA_P2M : META_LIQUIDA_CHECKIN;
      const pctMeta = (c.performance.medio_prazo_30d.media / meta) * 100;
      desc += `   • % da meta (${meta}): ${pctMeta.toFixed(1)}%\n`;
    }
    
    if (c.performance.historico_mensal.length > 1) {
      desc += `   • HISTÓRICO MENSAL: ${c.performance.historico_mensal.map((h: any) => 
        `${h.mes}/${h.ano}=${h.liquida}`
      ).join(' → ')}\n`;
    }
    
    if (c.performance.mensal_atual) {
      desc += `   • MENSAL ATUAL: ${c.performance.mensal_atual.liquida} pç/h (${c.performance.mensal_atual.dias} dias)\n`;
    }
    
    // 🔍 PADRÕES
    if (c.padroes.cai_segunda || c.padroes.cai_sexta || c.padroes.consistente || c.padroes.volatil) {
      desc += `\n🔍 PADRÕES DETECTADOS:\n`;
      if (c.padroes.cai_segunda) desc += `   • ⚠️ Cai nas SEGUNDAS (problema fim de semana?)\n`;
      if (c.padroes.cai_sexta) desc += `   • ⚠️ Cai nas SEXTAS (cansaço da semana?)\n`;
      if (c.padroes.consistente) desc += `   • ✅ CONSISTENTE (variância baixa: ${c.padroes.variancia}%)\n`;
      if (c.padroes.volatil) desc += `   • ⚠️ VOLÁTIL (variância alta: ${c.padroes.variancia}%)\n`;
    }
    
    // 🩺 PRESENÇA
    if (c.presenca.presencas > 0 || c.presenca.atestados > 0) {
      desc += `\n🩺 PRESENÇA (90 DIAS):\n`;
      desc += `   • Presenças: ${c.presenca.presencas} | Atestados: ${c.presenca.atestados}\n`;
      if (c.presenca.faltasInjustificadas > 0) desc += `   • ⚠️ Faltas: ${c.presenca.faltasInjustificadas}\n`;
      if (c.presenca.pctAbs > 0) desc += `   • % ABS: ${c.presenca.pctAbs}%\n`;
      if (c.presenca.tendenciaAtestados === 'subindo') {
        desc += `   • 🚨 ATESTADOS EM ALTA - SINAL DE ALERTA\n`;
      }
    }
    
    // 🔥 BURNOUT
    if (c.burnout.pontuacao >= 2) {
      desc += `\n🔥 RADAR DE BURNOUT (${c.burnout.pontuacao}/3 sinais):\n`;
      if (c.burnout.atestadosSubindo) desc += `   • Atestados subindo\n`;
      if (c.burnout.performanceCaindo) desc += `   • Performance caindo\n`;
      if (c.burnout.absAlto) desc += `   • ABS acima do normal\n`;
    }
    
    // 🎯 CARREIRA
    desc += `\n🎯 CARREIRA:\n`;
    if (c.carreira_info.podePromover) {
      desc += `   • 🎉 PRONTO PRA PROMOÇÃO (${c.carreira_info.mesesNaCarreira}m em ${c.carreira} → ${c.proxima_carreira})\n`;
    } else {
      desc += `   • ${c.carreira_info.mesesNaCarreira}m em ${c.carreira} (próx: ${c.proxima_carreira || 'topo'})\n`;
    }
    if (c.carreira_info.nuncaCalibrouComoApto) {
      desc += `   • Nunca foi APTO em calibração\n`;
    }
    
    // 🆕 ACOMPANHAMENTO DE FEEDBACK
    if (c.acompanhamento) {
      desc += `\n📝 ACOMPANHAMENTO DE FEEDBACK:\n`;
      desc += `   • Último feedback: há ${c.acompanhamento.diasDesdeFeedback} dias\n`;
      desc += `   • Tipo: ${c.acompanhamento.tipoFeedback} (${c.acompanhamento.classificacao})\n`;
      desc += `   • Tema: "${c.acompanhamento.observacao}"\n`;
      if (c.acompanhamento.evolucao === 'melhorou') {
        desc += `   • ✅ MELHOROU após feedback (${c.acompanhamento.mediaAntes} → ${c.acompanhamento.mediaDepois}) - RECONHECER!\n`;
      } else if (c.acompanhamento.evolucao === 'piorou') {
        desc += `   • 🔴 PIOROU após feedback (${c.acompanhamento.mediaAntes} → ${c.acompanhamento.mediaDepois}) - MUDAR ABORDAGEM!\n`;
      } else if (c.acompanhamento.evolucao === 'igual') {
        desc += `   • ⚠️ IGUAL após feedback - APROFUNDAR conversa\n`;
      }
    }
    
    // 🧠 MEMÓRIA HISTÓRICA
    desc += `\n🧠 MEMÓRIA:\n`;
    desc += `   • Feedbacks 90d: ${c.memoria.feedbacksUltimos90d} `;
    desc += `(${c.memoria.feedbacksConstrutivos} construtivos, ${c.memoria.feedbacksReconhecimento} reconhecimentos)\n`;
    if (c.memoria.calibracoesPassadas.length > 0) {
      desc += `   • Últimas calibrações: ${c.memoria.calibracoesPassadas.map((cal: any) => cal.classificacao).join(' → ')}\n`;
    }
    
    // 🆕 VIESES (ALERTAS PRO TL)
    if (c.vieses.nuncaReceberFeedback) {
      desc += `   • ⚠️ NUNCA RECEBEU FEEDBACK (90 dias) - INCLUSÃO\n`;
    }
    if (c.vieses.desbalanceadoConstrutivo) {
      desc += `   • ⚠️ Só Construtivos, ZERO Reconhecimentos - DESEQUILÍBRIO\n`;
    }
    if (c.vieses.recebeMuitoFeedback) {
      desc += `   • ⚠️ Recebe MUITO feedback (${c.memoria.feedbacksUltimos90d} em 90d) - cuidado pra não saturar\n`;
    }
    
    // 🆕 RECONHECIMENTO INVISÍVEL
    if (c.reconhecimentoInvisivel.consistenteSilencioso) {
      desc += `\n💎 CONSISTENTE SILENCIOSO: Performance estável mas nunca foi reconhecido. URGENTE!\n`;
    }
    if (c.reconhecimentoInvisivel.evolucaoSilenciosa) {
      desc += `\n📈 EVOLUÇÃO SILENCIOSA: Melhorou nos últimos meses (devagar mas constante)\n`;
    }
    
    return desc;
  }).join('\n');
  
  return `# 📅 HOJE É ${dataAtual.diaSemana.toUpperCase()}, ${dataAtual.dia} de ${dataAtual.mes}/${dataAtual.ano}

${contextoTemporalTexto}
Dias restantes no mês: ${dataAtual.diasRestantesMes}
${dataAtual.fimQuarter ? '🏁 FIM DE QUARTER - momento crítico!' : ''}

${alertasSistemicos}

# 🎯 MISSÃO DE HOJE

Você precisa gerar **${colabs[0]?.vagasNoLimite || 2} tarefas** estratégicas.

Não escolha aleatoriamente. Pense:
1. Quem tá em momento CRÍTICO (queda, burnout)?
2. Quem MERECE reconhecimento ANTES que se sinta invisível?
3. Quem tá PRONTO para próximo nível?
4. Quem precisa de CUIDADO HUMANO?
5. Quem foi ESQUECIDO (sem feedback há muito tempo)?

# 📊 SAÚDE DO TIME

Total: ${saudeTime?.total || 0} colaboradores
- Acima meta P2M: ${saudeTime?.performance?.acimaMetaP2M || 0}
- Acima meta Checkin: ${saudeTime?.performance?.acimaMetaCheckin || 0}
- Subindo: ${saudeTime?.performance?.subindo || 0}
- Caindo: ${saudeTime?.performance?.caindoTodos || 0}

Distribuição de feedback:
- SEM feedback há 90+ dias: ${saudeTime?.distribuicaoFeedback?.semFeedback90d || 0}
- ZERO reconhecimentos: ${saudeTime?.distribuicaoFeedback?.poucoReconhecimentos || 0}

Oportunidades:
- 🎓 Prontos pra promoção: ${saudeTime?.oportunidades?.prontosPromocao || 0}
- 💎 Consistentes silenciosos: ${saudeTime?.oportunidades?.consistentesSilenciosos || 0}
- 📈 Evoluções invisíveis: ${saudeTime?.oportunidades?.evolucoesInvisiveis || 0}

# 👥 COLABORADORES ANALISÁVEIS HOJE

${colabsDescricao}

# 🎯 SUAS TAREFAS

Gere ${colabs[0]?.vagasNoLimite || 2} tarefas. Sigam estes critérios:

1. **NUNCA mesma pessoa que já tem tarefa pendente** (já filtrado)
2. **NUNCA mesma pessoa que recebeu tarefa nos últimos 14 dias** (já filtrado)
3. **EQUILIBRE tipos**: misture reconhecimento, coaching, prevenção, oportunidade
4. **PROFUNDIDADE**: cada tarefa deve ter dado + padrão + estratégia + coaching
5. **HUMANIDADE**: considere o ser humano por trás do número
6. **CONTEXTO**: use o dia do mês na sua estratégia
7. **MEMÓRIA**: lembre-se do histórico de feedbacks
8. **ACOMPANHAMENTO**: se TL deu feedback recente, FOQUE no resultado

Responda APENAS o JSON array (sem texto antes/depois).`;
}
