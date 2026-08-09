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
    
    const colabsElegiveis = ctx.colabs.filter((c: any) => 
      c.podeSerSugerido && c.performance.fonteDados !== 'nenhum'
    );
    
    if (colabsElegiveis.length === 0) {
      return NextResponse.json({ 
        sucesso: true, 
        tarefas_geradas: 0,
        motivo: `Todo o time está em dia no ciclo de feedback (${ctx.dataAtual.cicloFeedbackDias || 6} dias). Ninguém venceu o prazo ainda.`,
      });
    }
    
    const prompt = construirPrompt(colabsElegiveis, ctx.saudeTime, ctx.dataAtual, ctx.metas, ctx.aprendizado, ctx.colabs, ctx.vagasHoje);
    const systemPrompt = construirSystemPrompt();
    
    const tarefasGeradas = await chamarClaudeJson<any>(
      [{ role: 'user', content: prompt }],
      { systemPrompt, temperature: 0.5, maxTokens: 6000 }
    ).catch(e => {
      console.error('Erro Claude:', e);
      return [];
    });
    
    if (!tarefasGeradas) {
      return NextResponse.json({ sucesso: true, tarefas_geradas: 0 });
    }
    
    const tarefas = Array.isArray(tarefasGeradas) 
      ? tarefasGeradas 
      : (tarefasGeradas.tarefas || tarefasGeradas.tasks || []);
    
    const tarefasParaInserir = tarefas.slice(0, ctx.vagasHoje);
    
    let inseridas = 0;
    for (const tarefa of tarefasParaInserir) {
      const colab = ctx.colabs.find((c: any) => c.id_groot === tarefa.id_groot);
      if (!colab) continue;
      
      // 🆕 janela de bloqueio segue o ciclo de feedback (não mais 14 dias fixo)
      const cicloDias = ctx.dataAtual.cicloFeedbackDias || 6;
      const diasCicloAtras = new Date(Date.now() - cicloDias * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('tarefas')
        .select('id', { count: 'exact', head: true })
        .eq('id_groot', tarefa.id_groot)
        .or(`status.eq.Pendente,criado_em.gte.${diasCicloAtras}`);
      
      if ((count || 0) > 0) continue;
      
      const contextoDados = {
        fonteDados: colab.performance.fonteDados,
        performance: colab.performance,
        ocupacao: colab.ocupacao,
        ima: colab.ima,
        padroes: colab.padroes,
        presenca: colab.presenca,
        carreira_info: colab.carreira_info,
        acompanhamento: colab.acompanhamento,
        cicloFeedback: colab.cicloFeedback,
        memoria: colab.memoria,
        aprendizadoColab: colab.aprendizadoColab,
        vieses: colab.vieses,
        burnout: colab.burnout,
        reconhecimentoInvisivel: colab.reconhecimentoInvisivel,
        contexto_temporal: ctx.dataAtual,
        aprendizado_geral: ctx.aprendizado,
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
        gatilho_origem: tarefa.gatilho || 'analise_com_aprendizado',
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
      aprendizado_usado: ctx.aprendizado.totalTarefas > 0,
    });
    
  } catch (e: any) {
    console.error('❌ Erro Copiloto:', e);
    return NextResponse.json({ 
      sucesso: false, 
      erro: e.message || 'Erro desconhecido'
    }, { status: 500 });
  }
}
function construirSystemPrompt(): string {
  return `Você é o ANALISTA SÊNIOR DE GENTE & OPERAÇÕES MAIS EXPERIENTE DO MELI.
# QUEM VOCÊ É
- 15 anos de operações P2M/Checkin/Sorting
- Coach certificado pela ICF
- Especialista em desenvolvimento humano + performance
- Bate metas há 8 trimestres seguidos
- Conhecido por DESENVOLVER PESSOAS, não só cobrar números
# SUA MISSÃO
Você NÃO é uma máquina de tarefas. Você É um PARCEIRO ESTRATÉGICO do TL.
Cada tarefa que você sugere pode mudar uma carreira.
# SUPERPODERES (12)
1. Multi-prazo: curto/médio/longo
2. Contexto temporal: dia do mês, fim de Q
3. Acompanhamento: vê se feedback funcionou
4. Saúde sistêmica: time como organismo
5. Ciclos: 30/60/90 dias
6. Coaching: perguntas, não comandos
7. Reconhecimento estratégico: público/privado/invisível
8. Anti-vieses: protege TL de armadilhas
9. Memória histórica: lembra tudo
10. Radar de burnout: sinais sutis
11. Detetive de padrões: vê o invisível
12. Defensora: considera fatores humanos
# 📊 OS 3 INDICADORES DE RESULTADO (ANALISE OS TRÊS, SEMPRE)
Você NÃO analisa só produtividade. Todo colaborador tem 3 indicadores de resultado, e você cruza os três:
1. LÍQUIDA (produtividade — peças/hora): quanto produz. Meta base = alinhado, acima do teto = supera.
2. OCUPAÇÃO (%): quão bem aproveita o tempo. Dentro da meta = bom; abaixo = fora (ofensor de ocupação). Só P2M tem ocupação.
3. IMA / QUALIDADE: erros/qualidade. ATENÇÃO: no IMA, MENOR É MELHOR (tipo DPMO). Abaixo do limite = dentro (bom); acima = fora (qualidade ruim).
O DIAGNÓSTICO RICO cruza os três. Exemplos:
- "Líquida OK (batendo a meta), MAS ocupação caiu pra 72% e IMA subiu (qualidade piorando) — está produzindo rápido mas com desperdício de tempo e mais erros."
- "Ocupação excelente e líquida boa, mas IMA acima do limite — velocidade sem qualidade."
- "Tudo dentro (líquida, ocupação e IMA) — referência, reconhecer."
NUNCA analise só um indicador se tiver dados dos outros. O poder do seu diagnóstico está em conectar os três.
# 🧠 APRENDIZADO REAL
Você TEM MEMÓRIA das tarefas anteriores.
Você VÊ o que funcionou e o que não.
Você ADAPTA estratégias baseado nos RESULTADOS reais do TIME ESPECÍFICO.
QUANDO O TL DEU UM FEEDBACK ANTES:
- Se MELHOROU → use estratégia parecida em casos similares
- Se PIOROU → mude abordagem
- Se NEUTRO → aprofunde, talvez mude ângulo
# 🔄 VOCÊ É UMA IA VIVA (acompanha e aprende)
Seu trabalho é ACOMPANHAR o time com CONSTÂNCIA, não só gerar tarefa solta.
- Cada colaborador tem um CICLO de feedback (ex: 6 dias). Quando o ciclo vence, ele precisa de nova atenção.
- Depois que o TL dá um feedback e ESCREVE o que falou, você LÊ, GUARDA e APRENDE com aquele colaborador específico.
- Você acompanha se o feedback funcionou: melhorou? caiu? manteve? E ajusta.
- Priorize quem está há mais tempo sem atenção (venceu o ciclo ou nunca recebeu).
# 🌟 SUA ESTRELA-GUIA (o que define seu sucesso)
Seu sucesso NÃO é gerar tarefas bonitas. É MEXER O PONTEIRO no acumulado do mês:
- O painel de OFENSORES precisa DIMINUIR mês a mês (nas 3 dimensões: líquida, ocupação, qualidade).
- Mais gente precisa migrar pra ALINHADO e SUPERA.
- Priorize quem está PERTO de mudar de faixa (quick wins) — sem NUNCA abandonar os casos profundos.
- Reconhecer quem está bem MANTÉM a pessoa lá: recuo de bom desempenho também é perda.
# 📡 PRINCÍPIO DO RADAR (não esqueça de ninguém)
- TODOS existem no seu radar. NINGUÉM pode ficar invisível.
- Quem nunca recebeu feedback ou está há muito tempo sem atenção tem PRIORIDADE de inclusão.
- Reconhecer o silencioso e consistente é tão importante quanto corrigir o ofensor.
- Cada pessoa que fica sem sua atenção por muito tempo é uma falha sua.
# 🔗 PENSE COMO SISTEMA (um liga o outro)
- Um grupo caindo junto no mesmo processo pode ser problema COLETIVO (escala, volume, clima) — não individual. Diga isso quando perceber.
- Referências consistentes podem PUXAR o time: sugira mentoria informal ou reconhecimento que inspira os outros.
- Sempre conecte o indivíduo ao contexto do time — não analise ninguém no vácuo.
# 🧠 APRENDA DE VERDADE COM O TL
- LEIA com atenção as observações que o TL escreveu nos feedbacks anteriores — elas revelam o que funciona com CADA pessoa.
- Cada colaborador é DIFERENTE: a mesma estratégia não serve pra todos. Calibre pelo perfil, pela memória e pelo que o TL registrou.
- Se algo funcionou com um perfil, repita em perfis parecidos. Se falhou, mude o ângulo — não insista no que já não deu certo.
# COMO ESCREVER
DIAGNÓSTICO: dados dos 3 indicadores (líquida + ocupação + IMA) + padrão + tempo + memória
ANÁLISE: vai além do número, considera contexto humano
HIPÓTESE: especulação humana e empática
A�ÃO: estratégia em PASSOS com COACHING
# REGRAS DE OURO
1. NÃO duplicar (já filtrado)
2. EQUILIBRAR tipos (reconhecimento, coaching, prevenção)
3. PROFUNDIDADE: dados dos 3 indicadores + padrão + estratégia
4. HUMANIDADE: pessoa por trás do número
5. USAR APRENDIZADO: aplicar o que funcionou no time
# FORMATO
Responda APENAS JSON válido:
[
  {
    "id_groot": "1710556",
    "tipo": "Reconhecimento Estratégico" | "Acompanhamento de Evolução" | "Antecipação de Queda" | "Coaching Preventivo" | "Cuidado de Bem-Estar" | "Oportunidade de Carreira" | "Quebra de Padrão" | "Reconhecimento Invisível" | "Alerta de Ocupação" | "Alerta de Qualidade (IMA)",
    "prioridade": "critica" | "alta" | "media" | "baixa",
    "diagnostico": "Análise rica CRUZANDO líquida + ocupação + IMA + PADRÕES + TEMPO + REFERÊNCIA HISTÓRICA",
    "analise_ia": "Sua interpretação ESTRATÉGICA",
    "hipotese": "Especulação HUMANA",
    "acao_sugerida": "Estratégia em PASSOS com COACHING",
    "gatilho": "padrao_ou_oportunidade",
    "feedback_obrigatorio": true
  }
]`;
}
function construirPrompt(colabs: any[], saudeTime: any, dataAtual: any, metas: Record<string, number>, aprendizado: any, todosColabs: any[] = [], vagasHoje = 2): string {
  // ✅ FIX: chaves reais do config (antes usava meta_liquida_* que não existe → caía em 280/100)
  const META_LIQUIDA_P2M = Number(metas['meta_p2m_base']) || 329;
  const META_LIQUIDA_CHECKIN = Number(metas['meta_checkin_base']) || 296;
  const META_P2M_MAX = Number(metas['meta_p2m_alinhado_max']) || 350;
  const META_CHECKIN_MAX = Number(metas['meta_checkin_alinhado_max']) || 308;
  // ============================================
  // 🔗 ANÁLISE CRUZADA (um liga o outro) — ADITIVO, não altera nada existente
  // Enxerga o time como sistema: quem cai junto, quem puxa, quick wins, radar
  // ============================================
  const mediaColab = (c: any): number =>
    Number(c?.performance?.medio_prazo_30d?.media) ||
    Number(c?.performance?.mensal_atual?.liquida) ||
    Number(c?.performance?.curto_prazo_7d?.media) || 0;
  const metaBaseProc = (p: string): number =>
    p === 'P2M' ? META_LIQUIDA_P2M : p === 'Checkin' ? META_LIQUIDA_CHECKIN : 0;
  const metaMaxProc = (p: string): number =>
    p === 'P2M' ? META_P2M_MAX : p === 'Checkin' ? META_CHECKIN_MAX : 0;
  const estaCaindo = (c: any): boolean => {
    const t = c?.performance?.medio_prazo_30d?.tendencia;
    return t?.tendencia === 'caindo' || (typeof t?.variacao_pct === 'number' && t.variacao_pct < -3);
  };
  const estaSubindo = (c: any): boolean => {
    const t = c?.performance?.medio_prazo_30d?.tendencia;
    return t?.tendencia === 'subindo' || (typeof t?.variacao_pct === 'number' && t.variacao_pct > 3);
  };
  const listar = (arr: string[], max = 8): string =>
    arr.length <= max ? arr.join(', ') : `${arr.slice(0, max).join(', ')} +${arr.length - max} mais`;
  const roster: any[] = Array.isArray(todosColabs) && todosColabs.length ? todosColabs : colabs;
  const processosLista = ['P2M', 'Checkin', 'Sorting'];
  const emojiProc: Record<string, string> = { P2M: '🚚', Checkin: '📦', Sorting: '📋' };
  let porProcessoTexto = '';
  processosLista.forEach((proc) => {
    const doProc = roster.filter((c) => c.processo === proc);
    if (doProc.length === 0) return;
    const base = metaBaseProc(proc);
    const max = metaMaxProc(proc);
    const abaixo = doProc.filter((c) => base > 0 && mediaColab(c) > 0 && mediaColab(c) < base);
    const superando = doProc.filter((c) => max > 0 && mediaColab(c) > max);
    const alinhados = doProc.filter((c) => {
      const m = mediaColab(c);
      return base > 0 && m >= base && m <= max;
    });
    const caindo = doProc.filter(estaCaindo).length;
    const subindo = doProc.filter(estaSubindo).length;
    const abaixoTxt = abaixo
      .slice()
      .sort((a, b) => (base - mediaColab(a)) - (base - mediaColab(b)))
      .map((c) => `${c.nome} (${mediaColab(c)}, -${Math.round(base - mediaColab(c))})`);
    const superTxt = superando
      .slice()
      .sort((a, b) => mediaColab(b) - mediaColab(a))
      .map((c) => `${c.nome} (${mediaColab(c)})`);
    porProcessoTexto += `\n### ${emojiProc[proc]} ${proc}${base > 0 ? ` — meta ${base}${max > base ? '-' + max : ''} pç/h` : ''}\n`;
    if (base > 0) {
      porProcessoTexto += `   🔴 Abaixo (${abaixo.length}): ${abaixo.length ? listar(abaixoTxt) : '—'}\n`;
      porProcessoTexto += `   🔵 Alinhados (${alinhados.length})  ·  🟢 Superando (${superando.length}): ${superando.length ? listar(superTxt) : '—'}\n`;
    }
    porProcessoTexto += `   📈 Tendência: ${caindo}↓ caindo · ${subindo}↑ subindo\n`;
  });
  // 🎯 QUICK WINS: ofensores ELEGÍVEIS a <=5% da meta (um empurrão certo reclassifica pro alinhado)
  const quickWins = colabs
    .filter((c) => {
      const base = metaBaseProc(c.processo);
      const m = mediaColab(c);
      if (base <= 0 || m <= 0 || m >= base) return false;
      return (base - m) <= base * 0.05;
    })
    .sort((a, b) => (metaBaseProc(a.processo) - mediaColab(a)) - (metaBaseProc(b.processo) - mediaColab(b)))
    .slice(0, 8)
    .map((c) => {
      const base = metaBaseProc(c.processo);
      return `   • ${c.nome} (${c.processo}): ${mediaColab(c)} pç/h — faltam só ${Math.round(base - mediaColab(c))} pra meta (${base})`;
    });
  // 💎 REFERÊNCIAS: consistentes acima do teto (candidatos a puxar o time / reconhecer)
  const referencias = roster
    .filter((c) => {
      const max = metaMaxProc(c.processo);
      return max > 0 && mediaColab(c) > max && c?.padroes?.consistente;
    })
    .sort((a, b) => mediaColab(b) - mediaColab(a))
    .slice(0, 6)
    .map((c) => `   • ${c.nome} (${c.processo}): ${mediaColab(c)} pç/h — consistente`);
  // ⚠️ PADRÕES COLETIVOS (>= 3 pessoas = causa comum provável, não individual)
  const caemSegunda = roster.filter((c) => c?.padroes?.cai_segunda).map((c) => c.nome);
  const caemSexta = roster.filter((c) => c?.padroes?.cai_sexta).map((c) => c.nome);
  const atestadosUp = roster.filter((c) => c?.presenca?.tendenciaAtestados === 'subindo').map((c) => c.nome);
  const burnoutRisco = roster.filter((c) => (c?.burnout?.pontuacao || 0) >= 2).map((c) => c.nome);
  const padroesLinhas: string[] = [];
  if (caemSegunda.length >= 3) padroesLinhas.push(`   • ⚠️ Caem SEGUNDA (${caemSegunda.length}): ${listar(caemSegunda)} → escala/retorno de folga?`);
  if (caemSexta.length >= 3) padroesLinhas.push(`   • ⚠️ Caem SEXTA (${caemSexta.length}): ${listar(caemSexta)} → cansaço de fim de semana?`);
  if (atestadosUp.length >= 3) padroesLinhas.push(`   • 🩺 Atestados subindo (${atestadosUp.length}): ${listar(atestadosUp)} → bem-estar coletivo`);
  if (burnoutRisco.length >= 3) padroesLinhas.push(`   • 🔥 Risco de burnout (${burnoutRisco.length}): ${listar(burnoutRisco)}`);
  const analiseCruzadaTexto = `
# 🔗 VISÃO SISTÊMICA (um liga o outro — pense no TIME antes do indivíduo)
Um grupo caindo junto no mesmo processo raramente é coincidência: pode ser escala, volume, processo ou clima. Antes de responsabilizar alguém, pergunte se a causa é COLETIVA.
${porProcessoTexto}${quickWins.length ? `
## 🎯 QUICK WINS — reduza o painel de OFENSORES hoje
(ofensores elegíveis a menos de 5% da meta; o empurrão certo já reclassifica pro ALINHADO)
${quickWins.join('\n')}` : ''}${referencias.length ? `
## 💎 REFERÊNCIAS QUE PODEM PUXAR O TIME
(consistentes acima da meta — use como mentoria informal ou reconhecimento que inspira os outros)
${referencias.join('\n')}` : ''}${padroesLinhas.length ? `
## ⚠️ PADRÕES COLETIVOS DETECTADOS (>= 3 pessoas = investigue a causa comum)
${padroesLinhas.join('\n')}` : ''}
`;
  // 📡 RADAR — não esquecer de ninguém (prioriza, entre os elegíveis, quem está há mais tempo sem atenção)
  const negligencia = (c: any): number => {
    if (c?.vieses?.nuncaReceberFeedback) return 100000;
    if ((c?.memoria?.feedbacksUltimos90d || 0) === 0) return 10000;
    const d = c?.acompanhamento?.diasDesdeFeedback;
    return typeof d === 'number' ? d : 5000;
  };
  const radar = colabs
    .slice()
    .sort((a, b) => negligencia(b) - negligencia(a))
    .slice(0, 8)
    .map((c) => {
      const nunca = c?.vieses?.nuncaReceberFeedback;
      const semRec = (c?.memoria?.feedbacksReconhecimento || 0) === 0;
      const d = c?.acompanhamento?.diasDesdeFeedback;
      const tempo = nunca ? 'NUNCA recebeu feedback' : (typeof d === 'number' ? `${d}d sem feedback` : 'sem feedback recente');
      return `   • ${c.nome} (${c.processo}): ${tempo}${semRec && !nunca ? ' · zero reconhecimentos' : ''}`;
    });
  const radarTexto = radar.length ? `
# 📡 RADAR — NÃO ESQUEÇA DE NINGUÉM
Entre os elegíveis hoje, estes estão há mais tempo sem sua atenção. Todos precisam existir no seu radar — não deixe ninguém invisível:
${radar.join('\n')}
` : '';
  // 🆕 PAINÉIS DE OCUPAÇÃO E QUALIDADE (dentro/fora) — visão de resultado além da líquida
  const p = saudeTime?.paineis;
  let paineisTexto = '';
  if (p) {
    const ocupForaTxt = (p.ocupacao?.listaFora || []).slice(0, 8)
      .map((x: any) => `${x.nome} (${x.valor}% / meta ${x.meta}%)`).join(', ');
    const imaForaTxt = (p.ima?.listaFora || []).slice(0, 8)
      .map((x: any) => `${x.nome} (IMA ${x.valor} / limite ${x.meta})`).join(', ');
    paineisTexto = `
# 📊 PAINÉIS DE RESULTADO (as 3 dimensões do time)
## 📈 LÍQUIDA (produtividade)
   🔴 Ofensores: ${p.liquida?.ofensor || 0}  ·  🔵 Alinhados: ${p.liquida?.alinhado || 0}  ·  🟢 Superas: ${p.liquida?.supera || 0}
## 📊 OCUPAÇÃO (só P2M · dentro vs fora da meta)
   ✅ Dentro: ${p.ocupacao?.dentro || 0}  ·  🔴 Fora: ${p.ocupacao?.fora || 0}${ocupForaTxt ? `
   Fora da meta: ${ocupForaTxt}` : ''}
## 🎯 IMA / QUALIDADE (menor é melhor · dentro vs fora do limite)
   ✅ Dentro: ${p.ima?.dentro || 0}  ·  🔴 Fora: ${p.ima?.fora || 0}${imaForaTxt ? `
   Fora do limite: ${imaForaTxt}` : ''}
`;
  }
  const contextoTemporalTexto = {
    inicio_mes: '🌅 INÍCIO DO MÊS (alinhamento, planejamento)',
    meio_mes: '☀️ MEIO DO MÊS (aceleração, ajustes)',
    fechamento: '🌆 FECHAMENTO (recuperação, fechar bem)',
  }[dataAtual.contextoTemporal as string] || '';
  
  let alertasSistemicos = '';
  if (saudeTime?.alertas) {
    const alerts = [];
    if (saudeTime.alertas.muitasQuedasJuntas) alerts.push(`🚨 ${saudeTime.performance.caindoTodos} colabs caindo juntos - PROBLEMA COLETIVO?`);
    if (saudeTime.alertas.atestadosEmAlta) alerts.push(`🩺 Atestados em alta - bem-estar`);
    if (saudeTime.alertas.burnoutColetivo) alerts.push(`🔥 Burnout coletivo detectado`);
    if (saudeTime.alertas.ocupacaoBaixaColetiva) alerts.push(`📊 Ocupação baixa coletiva (5+ colabs fora da meta)`);
    if (saudeTime.alertas.imaAltoColetivo) alerts.push(`🎯 Qualidade ruim coletiva (5+ colabs com IMA acima do limite)`);
    if (saudeTime.distribuicaoFeedback.semFeedback90d > 5) alerts.push(`⚠️ ${saudeTime.distribuicaoFeedback.semFeedback90d} colabs SEM FEEDBACK 90+ dias`);
    if (saudeTime.distribuicaoFeedback.poucoReconhecimentos > 10) alerts.push(`💔 ${saudeTime.distribuicaoFeedback.poucoReconhecimentos} colabs NUNCA reconhecidos`);
    if (alerts.length > 0) {
      alertasSistemicos = '\n## 🚨 ALERTAS SISTÊMICOS\n' + alerts.map(a => `   ${a}`).join('\n') + '\n';
    }
  }
  
  // 🧠 SEÇÃO DE APRENDIZADO
  let secaoAprendizado = '';
  if (aprendizado && aprendizado.totalTarefas > 0) {
    secaoAprendizado = `
# 🧠 SEU APRENDIZADO COM ESSE TIME (últimos 90 dias)
## Estatísticas gerais:
- Total tarefas finalizadas: ${aprendizado.totalTarefas}
- ✅ Sucessos: ${aprendizado.sucessos} (${aprendizado.taxaSucesso}%)
- ❌ Falhas: ${aprendizado.falhas}
- ⏳ Neutros: ${aprendizado.neutros}
${aprendizado.estrategiasEficazes.length > 0 ? `## 🎯 ESTRATÉGIAS QUE FUNCIONARAM:
${aprendizado.estrategiasEficazes.map((e: string) => `   ✅ ${e}`).join('\n')}` : ''}
${aprendizado.estrategiasIneficazes.length > 0 ? `## ⚠️ ESTRATÉGIAS QUE NÃO FUNCIONARAM:
${aprendizado.estrategiasIneficazes.map((e: string) => `   ❌ ${e}`).join('\n')}` : ''}
${aprendizado.historicoDetalhado.length > 0 ? `## 📚 HISTÓRICO DETALHADO (últimas tarefas finalizadas):
${aprendizado.historicoDetalhado.slice(0, 5).map((h: any) => `
   • ${h.nome} (${h.diasAtras}d atrás):
     Tipo: ${h.tipo} | Ação: ${h.acao_tomada}
     Resultado: ${h.resultado}${h.variacao_30d !== null ? ` (${h.variacao_30d > 0 ? '+' : ''}${h.variacao_30d}% em 30d)` : ''}
     ${h.observacao ? `Observação TL: "${h.observacao.slice(0, 100)}"` : ''}
`).join('\n')}` : ''}
USE esses aprendizados para CALIBRAR suas próximas sugestões.
Se algo funcionou, REPITA o padrão. Se falhou, EVITE.
`;
  } else {
    secaoAprendizado = `
# 🧠 APRENDIZADO
Você ainda NÃO tem histórico de feedbacks finalizados.
À medida que o TL for finalizando tarefas e marcando resultado,
você vai aprender o que FUNCIONA com esse time específico.
`;
  }
  
  const colabsDescricao = colabs.map(c => {
    let desc = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    desc += `👤 ${c.nome} | ID: ${c.id_groot} | ${c.processo || 'sem processo'}\n`;
    desc += `   ${c.cargo || 'sem cargo'} | ${c.carreira || 'sem carreira'}\n`;
    desc += `   ${c.carreira_info.mesesNaEmpresa}m empresa | ${c.carreira_info.mesesNaCarreira}m carreira\n`;
    
    desc += `\n📊 PERFORMANCE (LÍQUIDA):\n`;
    if (c.performance.curto_prazo_7d.dias > 0) {
      const t = c.performance.curto_prazo_7d.tendencia;
      desc += `   • 7d: ${c.performance.curto_prazo_7d.media} pç/h (${t.tendencia} ${t.variacao_pct > 0 ? '+' : ''}${t.variacao_pct}%)\n`;
    }
    if (c.performance.medio_prazo_30d.dias > 0) {
      const t = c.performance.medio_prazo_30d.tendencia;
      desc += `   • 30d: ${c.performance.medio_prazo_30d.media} pç/h (${t.tendencia} ${t.variacao_pct > 0 ? '+' : ''}${t.variacao_pct}% - ${t.forca})\n`;
      const meta = c.processo === 'P2M' ? META_LIQUIDA_P2M : META_LIQUIDA_CHECKIN;
      desc += `   • % meta (${meta}): ${((c.performance.medio_prazo_30d.media / meta) * 100).toFixed(1)}%\n`;
    }
    if (c.performance.historico_mensal.length > 1) {
      desc += `   • Histórico: ${c.performance.historico_mensal.map((h: any) => `${h.mes}=${h.liquida}`).join(' → ')}\n`;
    }
    if (c.performance.mensal_atual) {
      desc += `   • Mensal atual: ${c.performance.mensal_atual.liquida} pç/h (${c.performance.mensal_atual.dias}d)\n`;
    }
    
    // 🆕 OCUPAÇÃO
    if (c.ocupacao && c.ocupacao.tem) {
      const oIcon = c.ocupacao.status === 'dentro' ? '✅' : '🔴';
      desc += `\n📊 OCUPAÇÃO: ${oIcon} ${c.ocupacao.media30d}% (meta ${c.ocupacao.meta}% · ${c.ocupacao.status})\n`;
      desc += `   • 7d: ${c.ocupacao.media7d}% · tendência: ${c.ocupacao.tendencia?.tendencia || 'sem dados'}\n`;
    }
    
    // 🆕 IMA / QUALIDADE
    if (c.ima && c.ima.tem) {
      const iIcon = c.ima.status === 'dentro' ? '✅' : '🔴';
      const tIma = c.ima.tendencia === 'melhorou' ? '📉 melhorou' : c.ima.tendencia === 'piorou' ? '📈 piorou' : c.ima.tendencia;
      desc += `\n🎯 IMA/QUALIDADE: ${iIcon} ${c.ima.atual} (limite ${c.ima.meta} · menor=melhor · ${c.ima.status})\n`;
      desc += `   • Tendência: ${tIma}${c.ima.variacao_pct ? ` (${c.ima.variacao_pct > 0 ? '+' : ''}${c.ima.variacao_pct}%)` : ''}\n`;
    }
    
    if (c.padroes.cai_segunda || c.padroes.cai_sexta || c.padroes.consistente || c.padroes.volatil) {
      desc += `\n🔍 PADRÕES:\n`;
      if (c.padroes.cai_segunda) desc += `   • ⚠️ Cai SEGUNDAS\n`;
      if (c.padroes.cai_sexta) desc += `   • ⚠️ Cai SEXTAS\n`;
      if (c.padroes.consistente) desc += `   • ✅ Consistente (var ${c.padroes.variancia}%)\n`;
      if (c.padroes.volatil) desc += `   • ⚠️ Volátil (var ${c.padroes.variancia}%)\n`;
    }
    
    if (c.presenca.presencas > 0 || c.presenca.atestados > 0) {
      desc += `\n🩺 PRESENÇA 90d:\n`;
      desc += `   • Pres: ${c.presenca.presencas} | Atest: ${c.presenca.atestados}`;
      if (c.presenca.faltasInjustificadas > 0) desc += ` | Faltas: ${c.presenca.faltasInjustificadas}`;
      if (c.presenca.pctAbs > 0) desc += ` | ABS: ${c.presenca.pctAbs}%`;
      desc += `\n`;
      if (c.presenca.tendenciaAtestados === 'subindo') desc += `   • 🚨 ATESTADOS EM ALTA\n`;
    }
    
    if (c.burnout.pontuacao >= 2) {
      desc += `\n🔥 BURNOUT (${c.burnout.pontuacao}/3): `;
      const sinais = [];
      if (c.burnout.atestadosSubindo) sinais.push('atestados↑');
      if (c.burnout.performanceCaindo) sinais.push('perf↓');
      if (c.burnout.absAlto) sinais.push('ABS alto');
      desc += sinais.join(', ') + '\n';
    }
    
    desc += `\n🎯 CARREIRA: `;
    if (c.carreira_info.podePromover) {
      desc += `🎉 PRONTO P/ PROMOÇÃO (${c.carreira_info.mesesNaCarreira}m em ${c.carreira} → ${c.proxima_carreira})\n`;
    } else {
      desc += `${c.carreira_info.mesesNaCarreira}m em ${c.carreira}\n`;
    }
    
    // 🆕 CICLO DE FEEDBACK
    if (c.cicloFeedback) {
      if (c.cicloFeedback.nunca) {
        desc += `\n🔄 CICLO: NUNCA recebeu feedback — prioridade de inclusão\n`;
      } else if (c.cicloFeedback.diasDesdeUltimo !== null) {
        desc += `\n🔄 CICLO: ${c.cicloFeedback.diasDesdeUltimo}d desde último feedback (ciclo ${c.cicloFeedback.ciclo}d · ${c.cicloFeedback.venceu ? 'VENCIDO' : 'em dia'})\n`;
      }
    }
    
    if (c.acompanhamento) {
      desc += `\n📝 ÚLTIMO FEEDBACK (TL deu):\n`;
      desc += `   • Há ${c.acompanhamento.diasDesdeFeedback}d: ${c.acompanhamento.tipoFeedback} (${c.acompanhamento.classificacao})\n`;
      desc += `   • Tema: "${c.acompanhamento.observacao}"\n`;
      if (c.acompanhamento.evolucao === 'melhorou') desc += `   • ✅ MELHOROU (${c.acompanhamento.mediaAntes} → ${c.acompanhamento.mediaDepois})\n`;
      else if (c.acompanhamento.evolucao === 'piorou') desc += `   • 🔴 PIOROU (${c.acompanhamento.mediaAntes} → ${c.acompanhamento.mediaDepois})\n`;
      else if (c.acompanhamento.evolucao === 'igual') desc += `   • ⚠️ IGUAL - aprofundar\n`;
    }
    
    desc += `\n🧠 MEMÓRIA:\n`;
    desc += `   • FB 90d: ${c.memoria.feedbacksUltimos90d} (${c.memoria.feedbacksConstrutivos}C / ${c.memoria.feedbacksReconhecimento}R)\n`;
    if (c.memoria.calibracoesPassadas.length > 0) {
      desc += `   • Calibrações: ${c.memoria.calibracoesPassadas.map((cal: any) => cal.classificacao).join(' → ')}\n`;
    }
    
    // 🧠 APRENDIZADO ESPECÍFICO DESSE COLAB
    if (c.aprendizadoColab && c.aprendizadoColab.length > 0) {
      desc += `\n🎓 HISTÓRICO DE TAREFAS COM ESSE COLAB:\n`;
      c.aprendizadoColab.slice(0, 3).forEach((a: any) => {
        desc += `   • ${a.diasAtras}d: ${a.tipo} → ${a.acao} → ${a.resultado}`;
        if (a.variacao !== null) desc += ` (${a.variacao > 0 ? '+' : ''}${a.variacao}%)`;
        desc += `\n`;
        if (a.observacao) desc += `     Obs TL: "${a.observacao}"\n`;
      });
    }
    
    if (c.vieses.nuncaReceberFeedback) desc += `\n   ⚠️ NUNCA RECEBEU FEEDBACK - INCLUSÃO!\n`;
    if (c.vieses.desbalanceadoConstrutivo) desc += `   ⚠️ Só construtivos, zero reconhecimentos\n`;
    if (c.vieses.recebeMuitoFeedback) desc += `   ⚠️ Muito feedback (${c.memoria.feedbacksUltimos90d} em 90d)\n`;
    
    if (c.reconhecimentoInvisivel.consistenteSilencioso) desc += `\n💎 CONSISTENTE SILENCIOSO - URGENTE reconhecer!\n`;
    if (c.reconhecimentoInvisivel.evolucaoSilenciosa) desc += `📈 EVOLUÇÃO SILENCIOSA - reconhecer crescimento\n`;
    
    return desc;
  }).join('\n');
  
  return `# 📅 HOJE: ${dataAtual.diaSemana.toUpperCase()}, ${dataAtual.dia}/${dataAtual.mes}/${dataAtual.ano}
${contextoTemporalTexto}
Dias restantes mês: ${dataAtual.diasRestantesMes}
${dataAtual.fimQuarter ? '🏁 FIM DE Q - momento crítico!' : ''}
Ciclo de feedback configurado: ${dataAtual.cicloFeedbackDias || 6} dias
${alertasSistemicos}
${secaoAprendizado}
# 🎯 MISSÃO HOJE
Gerar **${vagasHoje} tarefa(s)** estratégica(s).
Use TODO o contexto:
- Os 3 INDICADORES (líquida + ocupação + IMA/qualidade)
- Multi-prazo (7d/30d/longo)
- Padrões detectados
- Memória de feedbacks
- APRENDIZADO do que funcionou/falhou
- Saúde sistêmica do time
- Ciclo de feedback (quem venceu o prazo)
- Contexto temporal (dia do mês)
# 📊 SAÚDE DO TIME
Total: ${saudeTime?.total || 0}
- Acima meta P2M: ${saudeTime?.performance?.acimaMetaP2M || 0}
- Acima meta Checkin: ${saudeTime?.performance?.acimaMetaCheckin || 0}
- Subindo: ${saudeTime?.performance?.subindo || 0} | Caindo: ${saudeTime?.performance?.caindoTodos || 0}
Distribuição feedback:
- SEM feedback 90d: ${saudeTime?.distribuicaoFeedback?.semFeedback90d || 0}
- Zero reconhecimentos: ${saudeTime?.distribuicaoFeedback?.poucoReconhecimentos || 0}
Oportunidades:
- 🎓 Prontos promoção: ${saudeTime?.oportunidades?.prontosPromocao || 0}
- 💎 Consistentes silenciosos: ${saudeTime?.oportunidades?.consistentesSilenciosos || 0}
- 📈 Evoluções invisíveis: ${saudeTime?.oportunidades?.evolucoesInvisiveis || 0}
${paineisTexto}${analiseCruzadaTexto}${radarTexto}
# 👥 COLABORADORES ELEGÍVEIS
${colabsDescricao}
# 🎯 INSTRUÇÕES FINAIS
Gere ${vagasHoje} tarefa(s) considerando:
1. OS 3 INDICADORES: cruze líquida + ocupação + IMA no diagnóstico
2. APRENDIZADO: o que funcionou vs falhou no PASSADO
3. INDIVIDUAL: histórico específico do colab (se houver)
4. SISTÊMICO: saúde geral do time
5. TEMPORAL: dia do mês, fim de Q
6. HUMANO: contexto da pessoa, não só números
7. EQUILÍBRIO: misture tipos (reconhecimento, coaching, prevenção)
Responda APENAS o JSON array (sem texto antes/depois).`;
}
