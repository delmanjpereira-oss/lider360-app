/**
 * ====================================================
 * COLETOR DE CONTEXTO
 * lib/ia/coletor-contexto.ts
 *
 * Busca TODOS os dados do colaborador em tempo real do Supabase
 * e formata pra IA conseguir analisar.
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
  dpmoUltimasSemanas: any[];
  ocupacao30dias: any[];
  presenca90dias: any[];
  tarefas: any[];
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

  const limite90Date = new Date(hoje);
  limite90Date.setDate(limite90Date.getDate() - 90);
  const limite90Str = limite90Date.toISOString();          // timestamp (feedbacks)
  const limite90StrData = limite90Date.toISOString().split('T')[0]; // date (presenca)

  // 1. CADASTRO (obrigatório — se não achar, retorna null)
  const { data: cadastro } = await supabase
    .from('colaboradores')
    .select('*')
    .eq('id_groot', idGroot)
    .maybeSingle();

  if (!cadastro) return null;

  const ehP2M = (cadastro.processo || '').toLowerCase().includes('p2m');

  // 2..7 — busca tudo em paralelo (mais rápido que sequencial)
  const [
    historicoRes,
    feedbacksRes,
    dpmoRes,
    ocupacaoRes,
    presencaRes,
    tarefasRes,
  ] = await Promise.all([
    // HISTÓRICO (30 dias) — produtividade diária ✅ coluna correta: data_referencia
    supabase
      .from('historico')
      .select('*')
      .eq('id_groot', idGroot)
      .gte('data_referencia', limite30Str)
      .order('data_referencia', { ascending: true }),
    // FEEDBACKS (90 dias) ✅ coluna correta: registrado_em
    supabase
      .from('feedbacks')
      .select('*')
      .eq('id_groot', idGroot)
      .gte('registrado_em', limite90Str)
      .order('registrado_em', { ascending: false }),
    // DPMO (últimas 5 semanas)
    supabase
      .from('dpmo_agregado')
      .select('*')
      .eq('id_groot', idGroot)
      .order('ano', { ascending: false })
      .order('semana', { ascending: false })
      .limit(5),
    // OCUPAÇÃO P2M (30 dias) — só se for P2M
    ehP2M
      ? supabase
          .from('ocupacao_p2m')
          .select('*')
          .eq('id_groot', idGroot)
          .gte('data_referencia', limite30Str)
          .order('data_referencia', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    // 🆕 PRESENÇA (90 dias) — absenteísmo/atestados pra IA ter contexto
    supabase
      .from('presenca')
      .select('*')
      .eq('id_groot', idGroot)
      .gte('data_referencia', limite90StrData)
      .neq('status', 'descartado')
      .order('data_referencia', { ascending: false }),
    // TAREFAS ✅ coluna correta: criado_em
    supabase
      .from('tarefas')
      .select('*')
      .eq('id_groot', idGroot)
      .order('criado_em', { ascending: false })
      .limit(20),
  ]);

  return {
    cadastro,
    historico30dias: historicoRes.data || [],
    feedbacks90dias: feedbacksRes.data || [],
    dpmoUltimasSemanas: dpmoRes.data || [],
    ocupacao30dias: ocupacaoRes.data || [],
    presenca90dias: presencaRes.data || [],
    tarefas: tarefasRes.data || [],
    geradoEm: hoje.toISOString(),
  };
}

// ============================================
// FORMATADOR — TURNA DADOS EM MARKDOWN PRA IA
// ============================================

export function formatarContextoParaIA(contexto: ContextoColaborador): string {
  const {
    cadastro,
    historico30dias,
    feedbacks90dias,
    dpmoUltimasSemanas,
    ocupacao30dias,
    presenca90dias,
    tarefas,
    geradoEm,
  } = contexto;

  const linhas: string[] = [];

  // ─────────────────────────────────────
  // CADASTRO
  // ─────────────────────────────────────
  linhas.push('# 📋 DADOS DO COLABORADOR');
  linhas.push('');
  linhas.push('## Cadastro');
  linhas.push(`- **Nome:** ${cadastro.nome || '—'}`);
  linhas.push(`- **ID Groot:** ${cadastro.id_groot || '—'}`);
  linhas.push(`- **Processo:** ${cadastro.processo || '—'}`);
  if (cadastro.cargo) linhas.push(`- **Cargo:** ${cadastro.cargo}`);
  if (cadastro.carreira) linhas.push(`- **Carreira:** ${cadastro.carreira}`);
  linhas.push(`- **Status:** ${cadastro.status || 'Ativo'}`);
  if (cadastro.aniversario) {
    const dataAniv = formatarData(cadastro.aniversario);
    linhas.push(`- **Aniversário:** ${dataAniv}`);
  }
  if (cadastro.data_admissao) {
    const dataAdm = formatarData(cadastro.data_admissao);
    const meses = mesesDesde(cadastro.data_admissao);
    linhas.push(`- **Admissão:** ${dataAdm} (${meses} meses no MELI)`);
  }
  linhas.push('');

  // ─────────────────────────────────────
  // PRODUÇÃO
  // ─────────────────────────────────────
  linhas.push('## 📊 Produção (últimos 30 dias)');
  if (historico30dias.length === 0) {
    linhas.push('_Sem registros de produção no período._');
  } else {
    const liquidas = historico30dias
      .map((h) => Number(h.prod_liquida) || 0)
      .filter((v) => v > 0);
    const media =
      liquidas.length > 0
        ? Math.round(liquidas.reduce((a, b) => a + b, 0) / liquidas.length)
        : 0;
    const max = liquidas.length > 0 ? Math.max(...liquidas) : 0;
    const min = liquidas.length > 0 ? Math.min(...liquidas) : 0;

    linhas.push(`- **Dias com registro:** ${historico30dias.length}`);
    linhas.push(`- **Média líquida:** ${media} und/h`);
    linhas.push(`- **Pico máximo:** ${max} und/h`);
    linhas.push(`- **Mínimo:** ${min} und/h`);
    linhas.push('');
    linhas.push('**Detalhe diário (mais recente primeiro):**');
    [...historico30dias].reverse().slice(0, 30).forEach((h) => {
      const data = formatarData(h.data_referencia);
      const liq = Number(h.prod_liquida) || 0;
      const status = h.status_meta || '—';
      linhas.push(`- ${data}: ${liq} und/h • ${status}`);
    });
  }
  linhas.push('');

  // ─────────────────────────────────────
  // 🩺 PRESENÇA / ABSENTEÍSMO (90 dias)
  // ─────────────────────────────────────
  linhas.push('## 🩺 Presença / Absenteísmo (últimos 90 dias)');
  if (presenca90dias.length === 0) {
    linhas.push('_Sem registros de presença no período._');
  } else {
    const pres = { presencas: 0, atestados: 0, faltas: 0, bhNaoPlan: 0, ferias: 0, afastado: 0, sinergia: 0, abandono: 0 };
    presenca90dias.forEach((p) => {
      const m = (p.motivo || '').toLowerCase();
      if (m.includes('p - presente') || p.status === 'presente') pres.presencas++;
      else if (m.includes('atestado')) pres.atestados++;
      else if (m.includes('fi - falta')) pres.faltas++;
      else if (m.includes('bh - banco de horas n')) pres.bhNaoPlan++;
      else if (m.includes('sinergia')) pres.sinergia++;
      else if (m.includes('abandono')) pres.abandono++;
      else if (m.includes('férias') || m.includes('ferias')) pres.ferias++;
      else if (m.includes('afasta')) pres.afastado++;
    });
    const totalContab = pres.presencas + pres.faltas + pres.bhNaoPlan + pres.atestados;
    const pctAbs = totalContab > 0 ? (((pres.faltas + pres.bhNaoPlan) / totalContab) * 100).toFixed(1) : '0';

    linhas.push(`- **Presenças:** ${pres.presencas} dia(s)`);
    linhas.push(`- **Faltas injustificadas:** ${pres.faltas}${pres.bhNaoPlan > 0 ? ` (+${pres.bhNaoPlan} BH não planejado)` : ''}`);
    linhas.push(`- **Atestados:** ${pres.atestados}`);
    if (pres.ferias > 0) linhas.push(`- **Férias:** ${pres.ferias} dia(s) _(não conta como falta)_`);
    if (pres.afastado > 0) linhas.push(`- **Afastado (INSS):** ${pres.afastado} dia(s) _(fora da operação)_`);
    if (pres.sinergia > 0) linhas.push(`- **Sinergia externa:** ${pres.sinergia} dia(s)`);
    if (pres.abandono > 0) linhas.push(`- **⚠️ Abandono registrado:** ${pres.abandono} dia(s)`);
    linhas.push(`- **ABS%:** ${pctAbs}% ${Number(pctAbs) > 10 ? '🔴 alto' : Number(pctAbs) > 5 ? '🟡 atenção' : '🟢 ok'}`);
    if (pres.ferias > 5 || pres.afastado > 5) {
      linhas.push(`- _Obs.: colaborador teve muitos dias fora da operação — considere isso ao avaliar a produção._`);
    }
  }
  linhas.push('');

  // ─────────────────────────────────────
  // FEEDBACKS
  // ─────────────────────────────────────
  linhas.push('## 💬 Feedbacks aplicados (últimos 90 dias)');
  if (feedbacks90dias.length === 0) {
    linhas.push('_Nenhum feedback no período. **Atenção:** vínculo pode estar esfriando._');
  } else {
    linhas.push(`- **Total:** ${feedbacks90dias.length} feedback(s)`);
    linhas.push('');
    feedbacks90dias.forEach((f) => {
      const data = f.registrado_em ? formatarData(f.registrado_em) : '—';
      const tipo = f.tipo || '—';
      const classe = f.classificacao || '—';
      const obs = f.observacao || f.texto || '(sem observação)';
      linhas.push(`- **${data}** [${tipo} / ${classe}]: ${obs}`);
    });
  }
  linhas.push('');

  // ─────────────────────────────────────
  // DPMO
  // ─────────────────────────────────────
  linhas.push('## 🎯 DPMO (qualidade — últimas 5 semanas)');
  if (dpmoUltimasSemanas.length === 0) {
    linhas.push('_Sem dados de DPMO._');
  } else {
    dpmoUltimasSemanas.forEach((d) => {
      const dpmo = Number(d.dpmo) || 0;
      let nivel = '🟢 Bom';
      if (dpmo >= 5000) nivel = '🔴 Ruim';
      else if (dpmo >= 2000) nivel = '🟡 Médio';
      linhas.push(`- **Semana ${d.semana}/${d.ano}:** ${dpmo.toLocaleString('pt-BR')} ${nivel}`);
    });
  }
  linhas.push('');

  // ─────────────────────────────────────
  // OCUPAÇÃO P2M
  // ─────────────────────────────────────
  if (ocupacao30dias.length > 0) {
    linhas.push('## 📦 Ocupação P2M / Totefullness (últimos 30 dias)');
    const ocs = ocupacao30dias.map((o) => Number(o.ocupacao_pct) || 0);
    const mediaOc = ocs.reduce((a, b) => a + b, 0) / ocs.length;
    linhas.push(`- **Dias registrados:** ${ocupacao30dias.length}`);
    linhas.push(`- **Ocupação média:** ${mediaOc.toFixed(1)}% (meta: ≥80%)`);
    linhas.push('');
  }

  // ─────────────────────────────────────
  // TAREFAS
  // ─────────────────────────────────────
  linhas.push('## ✅ Tarefas');
  if (tarefas.length === 0) {
    linhas.push('_Nenhuma tarefa registrada._');
  } else {
    // ✅ status reais: Pendente / Finalizada (não "concluida")
    const abertas = tarefas.filter((t) => (t.status || '').toLowerCase() === 'pendente');
    linhas.push(`- **Total:** ${tarefas.length} • **Em aberto:** ${abertas.length}`);
    abertas.slice(0, 10).forEach((t) => {
      // ✅ campos reais da tabela tarefas
      const desc = t.motivo || t.diagnostico || t.tipo || '(sem descrição)';
      linhas.push(`- [${t.tipo || 'Tarefa'}] ${desc} [status: ${t.status || '—'}]`);
    });
  }
  linhas.push('');

  // ─────────────────────────────────────
  // RODAPÉ
  // ─────────────────────────────────────
  linhas.push('---');
  linhas.push(
    `_Dados coletados em tempo real do Supabase em ${new Date(geradoEm).toLocaleString('pt-BR')}._`
  );

  return linhas.join('\n');
}

// ============================================
// HELPERS
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
