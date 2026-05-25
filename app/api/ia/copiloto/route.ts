import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { coletarContextoCompleto } from '../../../../lib/copiloto/coletor-contexto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.3-70b-versatile';

export const maxDuration = 60;

// ============================================
// API DO COPILOTO VIVO
// ============================================

export async function POST() {
  try {
    // 1️⃣ Coleta contexto COMPLETO (mensal + diário + presença)
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
    
    // 2️⃣ Filtra colabs SEM tarefa pendente (anti-duplicação)
    const colabsComVaga = colabs.filter(c => c.tarefasPendentes === 0);
    
    if (colabsComVaga.length === 0) {
      return NextResponse.json({ 
        sucesso: true, 
        tarefas_geradas: 0,
        motivo: 'Todos colabs já têm tarefa pendente'
      });
    }
    
    // 3️⃣ Limita análise pela quantidade de vagas
    const vagasDisponiveis = colabsComVaga[0]?.vagasNoLimite || 10;
    const colabsAnalisar = colabsComVaga.slice(0, Math.min(vagasDisponiveis, 20));
    
    // 4️⃣ Constrói prompt RICO com dados mensais
    const prompt = construirPrompt(colabsAnalisar, metas);
    
    // 5️⃣ Chama Groq
    const tarefasGeradas = await chamarIA(prompt);
    
    if (!tarefasGeradas || tarefasGeradas.length === 0) {
      return NextResponse.json({ sucesso: true, tarefas_geradas: 0 });
    }
    
    // 6️⃣ Salva tarefas no Supabase
    let inseridas = 0;
    for (const tarefa of tarefasGeradas) {
      const colab = colabs.find(c => c.id_groot === tarefa.id_groot);
      if (!colab) continue;
      
      // Anti-duplicata final
      const { count } = await supabase
        .from('tarefas')
        .select('id', { count: 'exact', head: true })
        .eq('id_groot', tarefa.id_groot)
        .eq('status', 'Pendente');
      
      if ((count || 0) > 0) continue;
      
      // Snapshot dos dados pra contexto
      const contextoDados = {
        mensalAtual: colab.mensalAtual,
        historicoMensal: colab.historicoMensal,
        diarioRecente: colab.diarioRecente,
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
        gatilho_origem: tarefa.gatilho || 'analise_mensal',
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
      analisados: colabsAnalisar.length
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
// CONSTRUIR PROMPT - com dados MENSAIS
// ============================================

function construirPrompt(colabs: any[], metas: Record<string, number>): string {
  const META_LIQUIDA_P2M = metas['meta_liquida_p2m'] || 280;
  const META_LIQUIDA_CHECKIN = metas['meta_liquida_checkin'] || 100;
  const META_SUPERA = metas['meta_supera'] || 95;
  
  const colabsDescricao = colabs.map(c => {
    let descricao = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    descricao += `👤 ${c.nome} | ID: ${c.id_groot} | ${c.processo || 'sem processo'}\n`;
    descricao += `   ${c.cargo || 'sem cargo'} | ${c.carreira || 'sem carreira'}\n`;
    
    // 🎯 DADOS MENSAIS (foco principal)
    if (c.mensalAtual) {
      descricao += `\n📊 PRODUTIVIDADE MENSAL (${c.mensalAtual.mes}/${c.mensalAtual.ano}):\n`;
      descricao += `   • Líquida média: ${c.mensalAtual.prod_liquida} pç/h\n`;
      descricao += `   • Unidades totais: ${c.mensalAtual.unidades_total.toLocaleString('pt-BR')}\n`;
      descricao += `   • Dias trabalhados: ${c.mensalAtual.dias_trabalhados}\n`;
      
      // Comparação com meta
      const meta = c.processo === 'P2M' ? META_LIQUIDA_P2M : META_LIQUIDA_CHECKIN;
      const pctMeta = ((c.mensalAtual.prod_liquida / meta) * 100).toFixed(1);
      descricao += `   • % da meta (${meta}): ${pctMeta}%\n`;
    } else {
      descricao += `\n⚠️ SEM DADOS MENSAIS PARA O MÊS ATUAL\n`;
    }
    
    // Histórico mensal (tendência)
    if (c.historicoMensal && c.historicoMensal.length > 1) {
      descricao += `\n📈 HISTÓRICO ÚLTIMOS MESES:\n`;
      c.historicoMensal.forEach((h: any) => {
        descricao += `   • ${h.mes}/${h.ano}: ${h.prod_liquida} pç/h (${h.dias_trabalhados} dias)\n`;
      });
      
      // Calcula tendência
      if (c.historicoMensal.length >= 2) {
        const atual = c.historicoMensal[0].prod_liquida;
        const anterior = c.historicoMensal[1].prod_liquida;
        const diff = atual - anterior;
        const pctDiff = ((diff / anterior) * 100).toFixed(1);
        
        const tendencia = diff > 0 ? '📈 SUBINDO' : diff < 0 ? '📉 CAINDO' : '➡️ ESTÁVEL';
        descricao += `   • Tendência: ${tendencia} (${pctDiff}%)\n`;
      }
    }
    
    // Dados diários (fallback ou complementar)
    if (c.diarioRecente && c.diarioRecente.dias_com_dado > 0) {
      descricao += `\n📅 DIÁRIO RECENTE (últimos 30 dias):\n`;
      descricao += `   • Líquida média: ${c.diarioRecente.liquida_media.toFixed(0)} pç/h\n`;
      descricao += `   • Supera média: ${c.diarioRecente.supera_media.toFixed(1)}%\n`;
      descricao += `   • Dias com dado: ${c.diarioRecente.dias_com_dado}\n`;
    }
    
    // Presença
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
    
    // Carreira
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
    
    // IMA / Calibração
    if (c.imaUltimo) descricao += `\n📋 IMA: ${c.imaUltimo}\n`;
    if (c.calibracaoUltima) descricao += `📋 Calibração: ${c.calibracaoUltima}\n`;
    
    return descricao;
  }).join('\n');
  
  return `Você é um analista sênior do MELI. Analisa os dados de produtividade MENSAL dos colaboradores e identifica quem precisa de atenção.

🎯 OBJETIVO: Gerar tarefas de feedback INTELIGENTES baseadas em DADOS REAIS.

📋 INSTRUÇÕES CRÍTICAS:
1. ANALISE OS DADOS MENSAIS (foco principal)
2. Use a tendência (subindo/caindo/estável) pra decidir prioridade
3. CONSIDERE presença - alto ABS é sinal de problema
4. RESPEITE carreira - quem tá há muito tempo no nível atual pode estar pronto pra promover
5. NÃO BLOQUEIE PROMOÇÃO automaticamente - só MOSTRA os dados pro líder decidir
6. Se NÃO TEM dados suficientes pra um colab, pula ele (não inventa)

🎯 PRIORIDADES:
- **CRÍTICA**: Líquida MUITO abaixo da meta (>20%) OU ABS > 10% OU caindo 3+ meses seguidos
- **ALTA**: Líquida abaixo da meta (10-20%) OU 1 mês caindo significativamente
- **MEDIA**: Performance ok mas pode melhorar OU pode promover OU oportunidade de feedback construtivo
- **BAIXA**: Performance excelente - reconhecimento

📋 TIPOS DE TAREFA:
- "Performance Crítica" - quando tá MUITO abaixo
- "Performance Abaixo" - quando tá um pouco abaixo  
- "Oportunidade de Promoção" - quando atende critérios
- "Reconhecimento" - quando tá ÓTIMO
- "ABS Alto" - quando presença tá ruim
- "Tendência Negativa" - quando caindo nos últimos meses

📝 ESTRUTURA DA TAREFA:
- diagnostico: o QUE tá acontecendo (com NÚMEROS)
- analise_ia: POR QUE tá acontecendo (sua interpretação)
- hipotese: o que PODE ser a causa
- acao_sugerida: o QUE o líder DEVE fazer
- gatilho: o que disparou (ex: "liquida_abaixo_meta", "tendencia_negativa")

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
- Pra cada tarefa, seja ESPECÍFICO com os números do colab

Responda APENAS um JSON array (sem texto antes/depois):
[
  {
    "id_groot": "1710556",
    "tipo": "Performance Abaixo",
    "prioridade": "alta",
    "diagnostico": "Jessiele teve líquida média de 324 pç/h em Maio, 15% acima da meta P2M (280)",
    "analise_ia": "Apesar de estar acima da meta, a tendência mensal mostra estabilidade. Com 24 dias trabalhados e 45.425 unidades, mantém ritmo consistente.",
    "hipotese": "Performance sólida, mas pode ter potencial pra crescer mais",
    "acao_sugerida": "Feedback de reconhecimento + alinhamento sobre potencial de crescimento",
    "gatilho": "performance_estavel",
    "feedback_obrigatorio": true
  }
]`;
}

// ============================================
// CHAMAR IA - Groq
// ============================================

async function chamarIA(prompt: string): Promise<any[]> {
  if (!GROQ_API_KEY) {
    console.error('GROQ_API_KEY não configurada');
    return [];
  }
  
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: 'Você é um analista de RH sênior do MELI. Responde sempre em JSON válido.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq erro:', response.status, errorText);
      return [];
    }
    
    const data = await response.json();
    const conteudo = data.choices?.[0]?.message?.content || '';
    
    // Parseia o JSON
    let resultado: any;
    try {
      resultado = JSON.parse(conteudo);
    } catch (e) {
      // Tenta extrair JSON do meio do texto
      const match = conteudo.match(/\[[\s\S]*\]/);
      if (match) {
        resultado = JSON.parse(match[0]);
      } else {
        console.error('Falha ao parsear JSON da IA');
        return [];
      }
    }
    
    // Aceita tanto array direto quanto objeto com "tarefas"
    if (Array.isArray(resultado)) return resultado;
    if (resultado.tarefas && Array.isArray(resultado.tarefas)) return resultado.tarefas;
    if (resultado.tasks && Array.isArray(resultado.tasks)) return resultado.tasks;
    
    return [];
  } catch (e: any) {
    console.error('Erro chamando IA:', e);
    return [];
  }
}
