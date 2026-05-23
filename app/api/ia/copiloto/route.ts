import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';
import { 
  coletarContextoTime, 
  priorizarParaAnaliseIA,
  type ColabContexto,
  type ContextoTime,
} from '../../../../lib/copiloto/coletor-contexto';

// ============================================
// CONFIGURAÇÃO GROQ
// ============================================

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ============================================
// PROMPT MESTRE - Copiloto Vivo (com presença)
// ============================================

function montarPromptColab(colab: ColabContexto, contexto: ContextoTime): string {
  const a = colab.analiseCarreira;
  const p = colab.presencaQuarter;
  
  return `Você é o motor de inteligência do Copiloto Vivo de gestão de desempenho do MELI.
Sua função é gerar uma TAREFA INTELIGENTE pro Team Leader avaliar.

⚠️ IMPORTANTE: A IA MOSTRA OS DADOS. O TL DECIDE.
NUNCA bloqueie promoção automaticamente. NUNCA diga "não pode ser promovido". 
Apresente os fatos cruzados e deixe a decisão ao TL.

📊 CONTEXTO DO TIME (${contexto.hoje} - ${contexto.quarter}):
- ${contexto.colabsAtivos} colabs ativos
- ${contexto.totalSuperas} Superas | ${contexto.totalAlinhados} Alinhados | ${contexto.totalOfensores} Ofensores
- Streak crítico configurado: ${contexto.metas.streak_negativo} dias

👤 COLABORADOR EM ANÁLISE:
Nome: ${colab.nome}
ID Groot: ${colab.id_groot}
Processo: ${colab.processo}
Carreira atual: ${colab.carreira || 'sem cadastro'}
Próximo nível: ${a.proximoCargo || 'topo'}

📅 CARREIRA:
Status: ${a.status} ${a.emoji}
Meses na carreira atual: ${a.mesesNaCarreira}
${a.mesNaJanela ? `Mês na janela: ${a.mesNaJanela}/3` : ''}
${a.quarterInfo ? `Quarter ${a.quarterInfo.quarter}: ${a.quarterInfo.detalhe} (${a.quarterInfo.mesesBatidos}/${a.quarterInfo.mesesTotal} batidos)` : ''}
${a.quarterInfo?.quebrouNoMes ? `🔴 QUEBROU em: ${a.quarterInfo.quebrouNoMes}` : ''}
${a.mesesPerpetuo ? `⭐ Apto perpétuo há ${a.mesesPerpetuo} mes(es)` : ''}

📈 PERFORMANCE RECENTE (${contexto.metas.janela_performance_dias} dias):
Líquida média: ${colab.liquidaMedia30d} pç/h
Último status: ${colab.ultimoStatus || 'sem dados'}
Última líquida: ${colab.ultimaLiquida || 0} pç/h
Último impacto NET: ${colab.ultimoImpacto !== null ? colab.ultimoImpacto + '%' : 'n/a'}
Taxa de sucesso: ${colab.taxaSucesso}%
Distribuição: ${colab.diasSuperaMes} Superas | ${colab.diasAlinhadoMes} Alinhados | ${colab.diasAbaixoMes} Abaixo

📋 PRESENÇA DO QUARTER (${contexto.quarter}):
Total de dias registrados: ${p.totalDias}
✅ Presenças: ${p.presencas}
🩺 Atestados (FJ): ${p.atestados}
🔴 Faltas Injustificadas (FI): ${p.faltasInjustificadas}
🟡 BH planejado: ${p.bhPlanejado}
🟠 BH NÃO planejado: ${p.bhNaoPlanejado}
🤝 Sinergia Externa (SIE): ${p.sinergiaExterna}
📋 Outras justificadas: ${p.outrasJustificadas}
🚫 Abandono: ${p.abandono}
📉 ABS do Q: ${p.pctAbs}%

🚨 STREAK NEGATIVO: ${colab.streakNegativo} dias seguidos abaixo
(limite crítico: ${contexto.metas.streak_negativo} dias)

🎯 SINAIS DETECTADOS:
${colab.isOfensorCritico ? '🚨 Ofensor crítico (acima do limite de streak)' : ''}
${colab.isJanelaCritica ? '🔥 Janela promocional crítica (mês 3 ou prejudicada)' : ''}
${colab.isAptoMuitoTempo ? '⭐ Apto perpétuo muito tempo (3+ meses)' : ''}
${colab.isAniversarioHoje ? '🎂 Aniversário hoje' : ''}

================================================
INSTRUÇÕES PARA A TAREFA:
================================================

Gere um JSON com:

1. **diagnostico**: O QUE aconteceu (2-3 linhas, factual)
   - Inclua performance + presença + tempo de carreira

2. **analise_ia**: POR QUE — sua análise INOVADORA cruzando TUDO (3-4 linhas)
   • Cruze performance + presença + carreira
   • Se tem atestados/faltas, INCLUA na análise (não esconde)
   • Identifique padrões (ex: "faltas sempre em segunda")
   • Compare com média do time
   • Identifique gargalo técnico, comportamental ou de saúde

3. **hipotese**: Causa raiz provável (1-2 linhas)

4. **prioridade**: 'critica' | 'alta' | 'media' | 'baixa'

5. **tipo**: 'Janela Promocional', 'Feedback Ofensor', 'Janela Prejudicada', 'Apto Perpétuo', 'Reconhecimento Supera', 'Aniversário'

6. **acao_sugerida**: O QUE o TL deve avaliar/conversar (1 linha)
   - Use linguagem como "Avaliar...", "Conversar sobre...", "Considerar..."
   - NUNCA: "promover" ou "não promover" como ordem

REGRAS CRÍTICAS:
- Tom profissional, clínico, sênior
- IA MOSTRA, TL DECIDE — nunca decida por ele
- Se houver dados de presença relevantes (atestados, faltas), MENCIONE
- Cruze informações sempre
- NÃO invente dados que não estão no contexto
- Seja específico (use números, datas, nomes de mês)

Retorne APENAS um JSON válido, sem markdown:

{
  "diagnostico": "...",
  "analise_ia": "...",
  "hipotese": "...",
  "prioridade": "...",
  "tipo": "...",
  "acao_sugerida": "..."
}`;
}

// ============================================
// CHAMA GROQ
// ============================================

async function analisarColabComIA(
  colab: ColabContexto,
  contexto: ContextoTime
): Promise<{
  diagnostico: string;
  analise_ia: string;
  hipotese: string;
  prioridade: string;
  tipo: string;
  acao_sugerida: string;
} | null> {
  if (!GROQ_API_KEY) {
    console.error('❌ GROQ_API_KEY não configurada');
    return null;
  }

  try {
    const prompt = montarPromptColab(colab, contexto);
    
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Você é um analista sênior de gestão de pessoas e desempenho. Responda SEMPRE em JSON válido, sem markdown. Sua função é APRESENTAR DADOS, não decidir pelo TL.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.5,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const erro = await response.text();
      console.error(`❌ Erro Groq pro ${colab.nome}:`, erro);
      return null;
    }

    const data = await response.json();
    const conteudo = data.choices?.[0]?.message?.content;
    
    if (!conteudo) {
      console.error(`❌ Resposta vazia pro ${colab.nome}`);
      return null;
    }
    
    const parsed = JSON.parse(conteudo);
    return parsed;
    
  } catch (e: any) {
    console.error(`❌ Erro analisando ${colab.nome}:`, e.message);
    return null;
  }
}

// ============================================
// SALVA TAREFA NO BANCO
// ============================================

async function salvarTarefa(
  colab: ColabContexto,
  analise: any,
  contexto: ContextoTime
): Promise<boolean> {
  try {
    const gatilhoOrigem = determinarGatilho(colab);
    const idTarefa = `TASK-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`.toUpperCase();
    const p = colab.presencaQuarter;
    
    // Cria nova tarefa (anti-duplicata já feito no priorizador)
    const { error } = await supabase
      .from('tarefas')
      .insert({
        id_tarefa: idTarefa,
        id_groot: colab.id_groot,
        nome: colab.nome,
        processo: colab.processo,
        tipo: analise.tipo,
        prioridade: analise.prioridade,
        motivo: analise.acao_sugerida,
        diagnostico: analise.diagnostico,
        analise_ia: analise.analise_ia,
        hipotese: analise.hipotese,
        gatilho_origem: gatilhoOrigem,
        feedback_obrigatorio: true,
        gerado_por_ia: true,
        status: 'Pendente',
        contexto_dados: {
          streakNegativo: colab.streakNegativo,
          ultimoStatus: colab.ultimoStatus,
          mesesNaCarreira: colab.analiseCarreira.mesesNaCarreira,
          statusCarreira: colab.analiseCarreira.status,
          quarter: contexto.quarter,
          mesNaJanela: colab.analiseCarreira.mesNaJanela,
          // 🆕 SNAPSHOT DE PRESENÇA
          presencaQuarter: {
            presencas: p.presencas,
            atestados: p.atestados,
            faltasInjustificadas: p.faltasInjustificadas,
            bhPlanejado: p.bhPlanejado,
            bhNaoPlanejado: p.bhNaoPlanejado,
            pctAbs: p.pctAbs,
          },
          performance: {
            liquidaMedia: colab.liquidaMedia30d,
            taxaSucesso: colab.taxaSucesso,
            diasSupera: colab.diasSuperaMes,
            diasAlinhado: colab.diasAlinhadoMes,
            diasAbaixo: colab.diasAbaixoMes,
          },
        },
      });
    
    if (error) {
      console.error(`❌ Erro insert pro ${colab.nome}:`, error);
      return false;
    }
    
    return true;
    
  } catch (e: any) {
    console.error(`❌ Erro salvando tarefa pro ${colab.nome}:`, e.message);
    return false;
  }
}

function determinarGatilho(colab: ColabContexto): string {
  if (colab.analiseCarreira.status === 'JANELA_PREJUDICADA') return 'janela_prejudicada';
  if (colab.analiseCarreira.status === 'JANELA_ATIVA' && colab.analiseCarreira.mesNaJanela === 3) return 'promocao_iminente';
  if (colab.analiseCarreira.status === 'APTO_PERPETUO' && (colab.analiseCarreira.mesesPerpetuo || 0) >= 3) return 'apto_perpetuo';
  if (colab.isOfensorCritico) return 'streak_negativo';
  if (colab.isAniversarioHoje) return 'aniversario';
  return 'analise_geral';
}

// ============================================
// HANDLER PRINCIPAL
// ============================================

export async function POST() {
  try {
    console.log('🤖 Copiloto Vivo - iniciando análise...');
    
    // 1. Coleta contexto do time
    const contexto = await coletarContextoTime();
    
    // 🛑 2. SE LIMITE ATINGIDO, retorna sem chamar IA
    if (contexto.limiteAtingido) {
      console.log(`🛑 Limite atingido: ${contexto.tarefasPendentesAtual}/${contexto.metas.limite_tarefas_pendentes}`);
      return NextResponse.json({
        ok: true,
        message: `Limite de ${contexto.metas.limite_tarefas_pendentes} tarefas atingido. Conclua pra liberar análises.`,
        analisados: 0,
        limiteAtingido: true,
        contexto: {
          totalAtivos: contexto.colabsAtivos,
          tarefasPendentes: contexto.tarefasPendentesAtual,
          limite: contexto.metas.limite_tarefas_pendentes,
          vagasDisponiveis: 0,
          ofensoresCriticos: contexto.ofensoresCriticos.length,
          janelasIminentes: contexto.janelaPromocaoIminente.length,
          janelasPrejudicadas: contexto.janelaPrejudicada.length,
          aptosPerpetuos: contexto.aptosPerpetuosAvalidos.length,
          quarter: contexto.quarter,
        },
      });
    }
    
    // 3. Filtra prioritários (já respeita limite + anti-duplicata)
    const prioritarios = priorizarParaAnaliseIA(contexto);
    
    console.log(`📋 ${prioritarios.length} colab(s) prioritários (vagas: ${contexto.vagasDisponiveis})`);
    
    if (prioritarios.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'Nenhum colab requer análise no momento. Tudo em ordem!',
        analisados: 0,
        contexto: {
          totalAtivos: contexto.colabsAtivos,
          tarefasPendentes: contexto.tarefasPendentesAtual,
          limite: contexto.metas.limite_tarefas_pendentes,
          vagasDisponiveis: contexto.vagasDisponiveis,
          ofensoresCriticos: contexto.ofensoresCriticos.length,
          janelasIminentes: contexto.janelaPromocaoIminente.length,
          janelasPrejudicadas: contexto.janelaPrejudicada.length,
          aptosPerpetuos: contexto.aptosPerpetuosAvalidos.length,
          quarter: contexto.quarter,
        },
      });
    }
    
    // 4. Roda IA em PARALELO (mais rápido)
    const resultados = await Promise.allSettled(
      prioritarios.map(async (colab) => {
        console.log(`🧠 Analisando ${colab.nome}...`);
        const analise = await analisarColabComIA(colab, contexto);
        
        if (!analise) {
          return { colab: colab.nome, sucesso: false, erro: 'IA não retornou' };
        }
        
        const salvou = await salvarTarefa(colab, analise, contexto);
        return { colab: colab.nome, sucesso: salvou, analise };
      })
    );
    
    // 5. Conta resultados
    const sucessos = resultados.filter(
      (r) => r.status === 'fulfilled' && r.value.sucesso
    ).length;
    
    const falhas = resultados.filter(
      (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.sucesso)
    ).length;
    
    console.log(`✅ Copiloto Vivo: ${sucessos} análises ok, ${falhas} falhas`);
    
    return NextResponse.json({
      ok: true,
      analisados: sucessos,
      falhas,
      total: prioritarios.length,
      contexto: {
        totalAtivos: contexto.colabsAtivos,
        tarefasPendentes: contexto.tarefasPendentesAtual + sucessos,
        limite: contexto.metas.limite_tarefas_pendentes,
        vagasDisponiveis: Math.max(0, contexto.vagasDisponiveis - sucessos),
        ofensoresCriticos: contexto.ofensoresCriticos.length,
        janelasIminentes: contexto.janelaPromocaoIminente.length,
        janelasPrejudicadas: contexto.janelaPrejudicada.length,
        aptosPerpetuos: contexto.aptosPerpetuosAvalidos.length,
        quarter: contexto.quarter,
      },
      resumo: resultados
        .filter((r) => r.status === 'fulfilled')
        .map((r: any) => r.value),
    });
    
  } catch (e: any) {
    console.error('❌ Erro no Copiloto Vivo:', e);
    return NextResponse.json(
      { ok: false, error: e.message || 'Erro desconhecido' },
      { status: 500 }
    );
  }
}

// ============================================
// GET — pra rotina automática (cron job futuro)
// ============================================

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: 'Copiloto Vivo API. Use POST pra rodar análise.',
    endpoints: {
      analise: 'POST /api/ia/copiloto',
    },
    descricao: 'Analisa colabs prioritários com IA. Respeita limite de tarefas. Mostra dados, TL decide.',
  });
}
