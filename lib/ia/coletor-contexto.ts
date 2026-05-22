/**
 * ====================================================
 * COLETOR DE CONTEXTO - VERSÃO ENRIQUECIDA
 * lib/ia/coletor-contexto.ts
 *
 * Busca TODOS os dados do colaborador em tempo real do Supabase
 * inclui PRODUÇÃO + QUALIDADE + OCUPAÇÃO + OCIOSIDADE
 * ====================================================
 */

import { supabase } from '../supabase';

// ============================================
// TIPOS
// ============================================

export interface ContextoColaborador {
  cadastro: any;
  historico30dias: any[];
  feedbacks90dias: any[];
  dpmoEventos: any[];
  dpmoAgregado: any[];
  imaManual: any[];
  ocupacao30dias: any[];
  turnosDiarios: any[];
  tarefas: any[];
  metas: { metaProcesso: number; metaIma: number };
  geradoEm: string;
}

// ============================================
// FUNÇÃO PRINCIPAL — COLETA EM TEMPO REAL
// ============================================

export async function coletarContextoColaborador(
  idGroot: string
): Promise<ContextoColaborador | null> {
  if (!idGroot || idGroot.trim() === '') return null;

  const hoje = new Date();
  const limite30 = new Date(hoje);
  limite30.setDate(limite30.getDate() - 30);
  const limite30Str = limite30.toISOString().split('T')[0];

  const limite90 = new Date(hoje);
  limite90.setDate(limite90.getDate() - 90);
  const limite90Str = limite90.toISOString();

  // 1. CADASTRO
  const { data: cadastro } = await supabase
    .from('colaboradores')
    .select('*')
    .eq('id_groot', idGroot)
    .maybeSingle();

  if (!cadastro) return null;

  const processo = cadastro.processo as string | null;
  const procDpmo = processo === 'Checkin' ? 'CK' : processo === 'P2M' ? 'P2M' : null;

  // 2. METAS do config
  const chaveMetaProc = processo === 'Checkin' ? 'meta_checkin_base' : 'meta_p2m_base';
  const chaveMetaIma = processo === 'Checkin' ? 'meta_ima_checkin' : 'meta_ima_p2m';
  
  const [{ data: confMeta }, { data: confIma }] = await Promise.all([
    supabase.from('config').select('valor').eq('chave', chaveMetaProc).maybeSingle(),
    supabase.from('config').select('valor').eq('chave', chaveMetaIma).maybeSingle(),
  ]);
  
  const metaProcesso = confMeta ? Number(confMeta.valor) : (processo === 'Checkin' ? 296 : 329);
  const metaIma = confIma ? Number(confIma.valor) : 1567;

  // 3. HISTÓRICO PRODUTIVIDADE (30 dias)
  const { data: historicoRaw } = await supabase
    .from('historico')
    .select('*')
    .eq('id_groot', idGroot)
    .gte('data_referencia', limite30Str)
    .order('data_referencia', { ascending: true });

  // 4. FEEDBACKS (90 dias)
  const { data: feedbacksRaw } = await supabase
    .from('feedbacks')
    .select('*')
    .eq('id_groot', idGroot)
    .gte('registrado_em', limite90Str)
    .order('registrado_em', { ascending: false });

  // 5. DPMO EVENTOS (todos os eventos detalhados)
  let dpmoEventosRaw: any[] = [];
  if (procDpmo) {
    const { data: porId } = await supabase
      .from('dpmo_eventos')
      .select('*')
      .eq('id_groot', idGroot)
      .eq('processo', procDpmo)
      .order('checkin_data', { ascending: false });
    dpmoEventosRaw = porId || [];
  }

  // 6. DPMO AGREGADO (semanas com DPMO oficial)
  let dpmoAgregadoRaw: any[] = [];
  if (procDpmo) {
    const { data } = await supabase
      .from('dpmo_agregado')
      .select('*')
      .eq('id_groot', idGroot)
      .eq('processo', procDpmo)
      .order('ano', { ascending: false })
      .order('semana', { ascending: false });
    dpmoAgregadoRaw = data || [];
  }

  // 7. IMA MANUAL (do print OCR)
  let imaManualRaw: any[] = [];
  if (processo) {
    const { data } = await supabase
      .from('ima_manual')
      .select('*')
      .eq('id_groot', idGroot)
      .eq('processo', processo)
      .order('ano', { ascending: false })
      .order('mes', { ascending: false });
    imaManualRaw = data || [];
  }

  // 8. OCUPAÇÃO P2M (só se for P2M)
  let ocupacaoRaw: any[] = [];
  if (processo === 'P2M') {
    const { data } = await supabase
      .from('ocupacao_p2m')
      .select('*')
      .eq('id_groot', idGroot)
      .gte('data_referencia', limite30Str)
      .order('data_referencia', { ascending: false });
    ocupacaoRaw = data || [];
  }

  // 9. TURNOS DIÁRIOS (NET do time)
  const { data: turnosRaw } = await supabase
    .from('net_turno_diario')
    .select('*')
    .gte('data_referencia', limite30Str)
    .order('data_referencia', { ascending: false });

  // 10. TAREFAS pendentes
  const { data: tarefasRaw } = await supabase
    .from('tarefas')
    .select('*')
    .eq('id_groot', idGroot)
    .order('criado_em', { ascending: false })
    .limit(20);

  return {
    cadastro,
    historico30dias: historicoRaw || [],
    feedbacks90dias: feedbacksRaw || [],
    dpmoEventos: dpmoEventosRaw,
    dpmoAgregado: dpmoAgregadoRaw,
    imaManual: imaManualRaw,
    ocupacao30dias: ocupacaoRaw,
    turnosDiarios: turnosRaw || [],
    tarefas: tarefasRaw || [],
    metas: { metaProcesso, metaIma },
    geradoEm: new Date().toISOString(),
  };
}

// ============================================
// HELPERS DE ANÁLISE
// ============================================

function tempoParaSegundos(tempo: string | null): number {
  if (!tempo) return 0;
  const partes = String(tempo).split(':').map(Number);
  if (partes.length === 3) return partes[0] * 3600 + partes[1] * 60 + partes[2];
  if (partes.length === 2) return partes[0] * 3600 + partes[1] * 60;
  return 0;
}

function segundosParaHM(seg: number): string {
  if (seg < 0) seg = Math.abs(seg);
  if (seg === 0) return '0min';
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

// ============================================
// FORMATAÇÃO PRA IA — MARKDOWN ESTRUTURADO
// ============================================

export function formatarContextoParaIA(ctx: ContextoColaborador): string {
  const linhas: string[] = [];
  
  const c = ctx.cadastro;
  const metaProc = ctx.metas.metaProcesso;
  const metaIma = ctx.metas.metaIma;
  
  // ─────────────────────────────────────
  // CADASTRO
  // ─────────────────────────────────────
  linhas.push('# 📋 DADOS DO COLABORADOR');
  linhas.push('');
  linhas.push('## 👤 Cadastro');
  linhas.push(`- **Nome:** ${c.nome || '—'}`);
  linhas.push(`- **ID Groot:** ${c.id_groot}`);
  linhas.push(`- **Processo:** ${c.processo || '—'}`);
  linhas.push(`- **Cargo:** ${c.cargo || '—'}`);
  linhas.push(`- **Carreira:** ${c.carreira || '—'}`);
  linhas.push(`- **Status:** ${c.status || '—'}`);
  if (c.data_admissao) {
    linhas.push(`- **Admissão:** ${formatarData(c.data_admissao)} (${mesesDesde(c.data_admissao)} meses de empresa)`);
  }
  linhas.push('');
  linhas.push(`**Metas do processo:** ${metaProc} pç/h (líquida) | IMA máximo: ${metaIma}`);
  linhas.push('');
  
  // ─────────────────────────────────────
  // PRODUÇÃO (com análise de ociosidade saudável!)
  // ─────────────────────────────────────
  linhas.push('## 📊 Produção (últimos 30 dias)');
  if (ctx.historico30dias.length === 0) {
    linhas.push('_Sem registros de produção._');
  } else {
    const validos = ctx.historico30dias.filter((h: any) => h.prod_liquida > 0);
    const liquidas = validos.map((h: any) => Number(h.prod_liquida));
    const media = liquidas.length > 0 ? liquidas.reduce((a, b) => a + b, 0) / liquidas.length : 0;
    const max = Math.max(...liquidas, 0);
    const min = liquidas.length > 0 ? Math.min(...liquidas) : 0;
    
    const bateuMeta = validos.filter((h: any) => Number(h.prod_liquida) >= metaProc).length;
    const pctBateuMeta = validos.length > 0 ? Math.round((bateuMeta / validos.length) * 100) : 0;
    
    // 🎯 ANÁLISE DE OCIOSIDADE SAUDÁVEL
    let diasSaudavel = 0;
    let diasAcima = 0;
    let diasApertado = 0;
    let velocidadeEfetivaMedia = 0;
    let validosOcio = 0;
    
    validos.forEach((h: any) => {
      const procSeg = tempoParaSegundos(h.tempo_processo);
      const efeSeg = tempoParaSegundos(h.tempo_efetivo);
      if (procSeg > 0 && h.unidades > 0) {
        const tempoEsperadoSeg = (Number(h.unidades) / metaProc) * 3600;
        const ocioSaudavel = procSeg - tempoEsperadoSeg;
        const ocioReal = procSeg - efeSeg;
        
        if (ocioSaudavel < 0) diasApertado++;
        else if (ocioReal <= ocioSaudavel + 15 * 60) diasSaudavel++;
        else diasAcima++;
        
        if (efeSeg > 0) {
          velocidadeEfetivaMedia += (Number(h.unidades) / (efeSeg / 3600));
          validosOcio++;
        }
      }
    });
    velocidadeEfetivaMedia = validosOcio > 0 ? velocidadeEfetivaMedia / validosOcio : 0;
    
    linhas.push(`- **Dias com registro:** ${validos.length}`);
    linhas.push(`- **Média líquida:** ${Math.round(media)} pç/h (meta: ${metaProc})`);
    linhas.push(`- **Pico máximo:** ${Math.round(max)} pç/h`);
    linhas.push(`- **Mínimo:** ${Math.round(min)} pç/h`);
    linhas.push(`- **Bateu meta:** ${bateuMeta} de ${validos.length} dias (${pctBateuMeta}%)`);
    linhas.push(`- **Velocidade efetiva média:** ${Math.round(velocidadeEfetivaMedia)} pç/h (quando trabalha)`);
    linhas.push('');
    linhas.push('### ⏱️ Análise de Ociosidade Saudável');
    linhas.push(`- ✅ Dias com ociosidade saudável: ${diasSaudavel}`);
    linhas.push(`- 🔴 Dias com ociosidade ACIMA: ${diasAcima}`);
    linhas.push(`- 🟠 Dias com turno apertado: ${diasApertado}`);
    
    if (diasAcima > diasSaudavel) {
      linhas.push('- ⚠️ **ALERTA:** Mais dias com ociosidade acima do saudável que dentro.');
    }
    if (velocidadeEfetivaMedia > metaProc * 1.15 && diasAcima >= 3) {
      linhas.push(`- 🚀 **PERFIL RUSHER:** Velocidade efetiva ${Math.round(((velocidadeEfetivaMedia / metaProc) - 1) * 100)}% acima da meta, mas perde tempo parado.`);
    }
    linhas.push('');
    
    // Últimos 7 dias detalhado
    const ultimos7 = validos.slice(-7);
    if (ultimos7.length > 0) {
      linhas.push('### Últimos dias');
      ultimos7.forEach((h: any) => {
        linhas.push(`- ${formatarData(h.data_referencia)}: **${Number(h.prod_liquida).toFixed(0)} pç/h** (${h.unidades} pç em ${h.tempo_processo || '—'}) [${h.status_meta || '—'}]`);
      });
      linhas.push('');
    }
  }
  
  // ─────────────────────────────────────
  // 🎯 QUALIDADE - DPMO/IMA (NOVO!)
  // ─────────────────────────────────────
  linhas.push('## 📊 QUALIDADE (DPMO/IMA)');
  
  if (ctx.imaManual.length > 0) {
    const ultimoIma = ctx.imaManual[0];
    const mediaIma = Math.round(ctx.imaManual.reduce((s, m) => s + Number(m.ima || 0), 0) / ctx.imaManual.length);
    
    linhas.push(`- **IMA Total Geral (média ${ctx.imaManual.length} meses):** ${mediaIma}`);
    linhas.push(`- **Meta IMA:** ${metaIma} (menor = melhor)`);
    
    if (mediaIma > metaIma) {
      linhas.push(`- 🔴 **ACIMA DA META** em ${mediaIma - metaIma} pontos (atenção)`);
    } else {
      linhas.push(`- ✅ **NA META** com folga de ${metaIma - mediaIma} pontos`);
    }
    
    linhas.push('### Histórico mensal:');
    ctx.imaManual.slice(0, 6).forEach((m: any) => {
      const ima = Number(m.ima);
      const nome = `${String(m.mes).padStart(2, '0')}/${m.ano}`;
      const status = ima > metaIma ? '🔴 acima' : '✅ na meta';
      linhas.push(`- ${nome}: IMA ${ima} ${status}`);
    });
    linhas.push('');
  } else if (ctx.dpmoAgregado.length > 0) {
    const semanas = ctx.dpmoAgregado.slice(0, 8);
    const mediaDpmo = Math.round(semanas.reduce((s, d) => s + Number(d.dpmo || 0), 0) / semanas.length);
    
    linhas.push(`- **DPMO médio (últimas ${semanas.length} semanas):** ${mediaDpmo}`);
    linhas.push(`- **Meta:** ${metaIma}`);
    
    if (mediaDpmo > metaIma) {
      linhas.push(`- 🔴 **ACIMA DA META** (atenção em qualidade)`);
    } else {
      linhas.push(`- ✅ **NA META** em qualidade`);
    }
    
    linhas.push('### Por semana:');
    semanas.forEach((d: any) => {
      const dpmo = Number(d.dpmo);
      const status = dpmo > metaIma ? '🔴' : '✅';
      linhas.push(`- S${d.semana}/${d.ano}: ${dpmo} ${status}`);
    });
    linhas.push('');
  } else if (ctx.dpmoEventos.length > 0) {
    const totalDef = ctx.dpmoEventos.reduce((s, e) => s + Number(e.qtd_dif || 0), 0);
    const datasUnicas = new Set(ctx.dpmoEventos.map((e: any) => e.checkin_data));
    
    linhas.push(`- **Defeitos totais:** ${totalDef} em ${datasUnicas.size} dias auditados`);
    linhas.push(`- **Eventos:** ${ctx.dpmoEventos.length} registros de inventário`);
    linhas.push('_Aguardando cálculo do DPMO (precisa de produtividade no mesmo período)._');
    linhas.push('');
  } else {
    linhas.push('_Sem dados de DPMO/IMA registrados._');
    linhas.push('');
  }
  
  // ─────────────────────────────────────
  // 🎯 OCUPAÇÃO P2M (NOVO!)
  // ─────────────────────────────────────
  if (c.processo === 'P2M') {
    linhas.push('## 📦 Ocupação P2M (últimos 30 dias)');
    
    if (ctx.ocupacao30dias.length === 0) {
      linhas.push('_Sem dados de ocupação registrados._');
    } else {
      const media = ctx.ocupacao30dias.reduce((s, o) => s + Number(o.ocupacao_pct), 0) / ctx.ocupacao30dias.length;
      const totalTotes = ctx.ocupacao30dias.reduce((s, o) => s + Number(o.qtd_totes || 0), 0);
      const naMeta = media >= 80;
      
      linhas.push(`- **Ocupação média:** ${media.toFixed(1)}% (meta: 80%)`);
      linhas.push(`- **Total de totes:** ${totalTotes}`);
      linhas.push(`- **Dias com registro:** ${ctx.ocupacao30dias.length}`);
      
      if (naMeta) {
        linhas.push(`- ✅ **NA META** de ocupação`);
      } else {
        linhas.push(`- 🔴 **ABAIXO DA META** de 80%`);
      }
    }
    linhas.push('');
  }
  
  // ─────────────────────────────────────
  // 🎯 NET DO TIME (NOVO!)
  // ─────────────────────────────────────
  if (ctx.turnosDiarios.length > 0) {
    linhas.push('## ⭐ NET do Time (turnos registrados)');
    
    const netMedia = ctx.turnosDiarios.reduce((s, t) => s + Number(t.net_geral_real || 0), 0) / ctx.turnosDiarios.length;
    const ocioMediaCt = ctx.turnosDiarios.reduce((s, t) => s + Number(t.pct_ocioso || 0), 0) / ctx.turnosDiarios.length;
    
    linhas.push(`- **NET média do CT:** ${Math.round(netMedia)} pç/h`);
    linhas.push(`- **Ociosidade média do CT:** ${ocioMediaCt.toFixed(1)}%`);
    linhas.push(`- **Dias com registro:** ${ctx.turnosDiarios.length}`);
    linhas.push('');
    
    // Compara colab com CT
    const validos = ctx.historico30dias.filter((h: any) => h.prod_liquida > 0);
    let somaImpacto = 0;
    let qtdComTurno = 0;
    validos.forEach((h: any) => {
      const turno = ctx.turnosDiarios.find((t: any) => t.data_referencia === h.data_referencia);
      if (turno) {
        const procSeg = tempoParaSegundos(h.tempo_processo);
        if (procSeg > 0 && h.unidades > 0) {
          const netInd = Number(h.unidades) / (procSeg / 3600);
          const impacto = ((netInd - Number(turno.net_geral_real)) / Number(turno.net_geral_real)) * 100;
          somaImpacto += impacto;
          qtdComTurno++;
        }
      }
    });
    
    if (qtdComTurno > 0) {
      const impactoMedio = somaImpacto / qtdComTurno;
      linhas.push(`### Impacto real do colab no time:`);
      linhas.push(`- **Impacto NET médio:** ${impactoMedio > 0 ? '+' : ''}${impactoMedio.toFixed(1)}% vs NET do CT`);
      linhas.push(`- **Calculado em ${qtdComTurno} dias com turno registrado**`);
      
      if (impactoMedio > 20) {
        linhas.push(`- 🚀 **CARREGOU O TIME** - está puxando a média do CT pra cima`);
      } else if (impactoMedio > 5) {
        linhas.push(`- 🟢 Contribui POSITIVAMENTE pra média do time`);
      } else if (impactoMedio < -20) {
        linhas.push(`- 🚨 **PUXANDO O TIME PRA BAIXO** - ofensor da média do CT`);
      } else if (impactoMedio < -5) {
        linhas.push(`- 🔴 Contribui NEGATIVAMENTE pra média do time`);
      } else {
        linhas.push(`- ⚪ Está NO PADRÃO do time`);
      }
      linhas.push('');
    }
  }
  
  // ─────────────────────────────────────
  // FEEDBACKS
  // ─────────────────────────────────────
  linhas.push('## 💬 Feedbacks (últimos 90 dias)');
  if (ctx.feedbacks90dias.length === 0) {
    linhas.push('_Nenhum feedback registrado nos últimos 90 dias._');
    linhas.push('- ⚠️ **ALERTA:** Sem feedback recente — vínculo pode estar esfriando.');
  } else {
    linhas.push(`- **Total:** ${ctx.feedbacks90dias.length} feedback(s)`);
    
    const porTipo: Record<string, number> = {};
    const porClassif: Record<string, number> = {};
    ctx.feedbacks90dias.forEach((f: any) => {
      porTipo[f.tipo] = (porTipo[f.tipo] || 0) + 1;
      porClassif[f.classificacao] = (porClassif[f.classificacao] || 0) + 1;
    });
    
    linhas.push(`- **Por tipo:** ${Object.entries(porTipo).map(([t, n]) => `${t}: ${n}`).join(' | ')}`);
    linhas.push(`- **Por classificação:** ${Object.entries(porClassif).map(([c, n]) => `${c}: ${n}`).join(' | ')}`);
    
    linhas.push('### Mais recentes:');
    ctx.feedbacks90dias.slice(0, 5).forEach((f: any) => {
      const data = formatarData(f.registrado_em);
      const obs = (f.observacao || '').substring(0, 200);
      linhas.push(`- ${data} [${f.classificacao} / ${f.tipo}]: ${obs}`);
    });
  }
  linhas.push('');
  
  // ─────────────────────────────────────
  // TAREFAS
  // ─────────────────────────────────────
  if (ctx.tarefas.length > 0) {
    linhas.push('## ✅ Tarefas');
    const abertas = ctx.tarefas.filter((t: any) => (t.status || '').toLowerCase() !== 'concluida');
    linhas.push(`- **Total:** ${ctx.tarefas.length} • **Em aberto:** ${abertas.length}`);
    abertas.slice(0, 5).forEach((t: any) => {
      const desc = t.descricao || t.titulo || '(sem descrição)';
      linhas.push(`- ${desc} [${t.status || '—'}]`);
    });
    linhas.push('');
  }
  
  // ─────────────────────────────────────
  // RODAPÉ
  // ─────────────────────────────────────
  linhas.push('---');
  linhas.push(`_Dados coletados em tempo real do Supabase em ${new Date(ctx.geradoEm).toLocaleString('pt-BR')}._`);
  
  return linhas.join('\n');
}

// ============================================
// HELPERS DE FORMATAÇÃO
// ============================================

function formatarData(data: any): string {
  if (!data) return '—';
  try {
    const d = new Date(data);
    return d.toLocaleDateString('pt-BR');
  } catch {
    return String(data);
  }
}

function mesesDesde(dataStr: string): number {
  try {
    const inicio = new Date(dataStr);
    const agora = new Date();
    const meses =
      (agora.getFullYear() - inicio.getFullYear()) * 12 +
      (agora.getMonth() - inicio.getMonth());
    return Math.max(0, meses);
  } catch {
    return 0;
  }
}
