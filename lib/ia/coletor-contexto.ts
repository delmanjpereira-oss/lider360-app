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

  const limite90 = new Date(hoje);
  limite90.setDate(limite90.getDate() - 90);
  const limite90Str = limite90.toISOString();

  // 1. CADASTRO (obrigatório — se não achar, retorna null)
  const { data: cadastro } = await supabase
    .from('colaboradores')
    .select('*')
    .eq('id_groot', idGroot)
    .maybeSingle();

  if (!cadastro) return null;

  // 2. HISTÓRICO (30 dias) — produtividade diária
  const { data: historicoRaw } = await supabase
    .from('historico')
    .select('*')
    .eq('id_groot', idGroot)
    .gte('data', limite30Str)
    .order('data', { ascending: true });

  // 3. FEEDBACKS (90 dias)
  const { data: feedbacksRaw } = await supabase
    .from('feedbacks')
    .select('*')
    .eq('id_groot', idGroot)
    .gte('created_at', limite90Str)
    .order('created_at', { ascending: false });

  // 4. DPMO (últimas 5 semanas)
  const { data: dpmoRaw } = await supabase
    .from('dpmo_agregado')
    .select('*')
    .eq('id_groot', idGroot)
    .order('ano', { ascending: false })
    .order('semana', { ascending: false })
    .limit(5);

  // 5. OCUPAÇÃO P2M (30 dias) — só se for P2M
  let ocupacaoRaw: any[] = [];
  if ((cadastro.processo || '').toLowerCase().includes('p2m')) {
    const { data } = await supabase
      .from('ocupacao_p2m')
      .select('*')
      .eq('id_groot', idGroot)
      .gte('data_referencia', limite30Str)
      .order('data_referencia', { ascending: false });
    ocupacaoRaw = data || [];
  }

  // 6. TAREFAS (em aberto)
  const { data: tarefasRaw } = await supabase
    .from('tarefas')
    .select('*')
    .eq('id_groot', idGroot)
    .order('created_at', { ascending: false })
    .limit(20);

  return {
    cadastro,
    historico30dias: historicoRaw || [],
    feedbacks90dias: feedbacksRaw || [],
    dpmoUltimasSemanas: dpmoRaw || [],
    ocupacao30dias: ocupacaoRaw,
    tarefas: tarefasRaw || [],
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
      const data = formatarData(h.data);
      const liq = Number(h.prod_liquida) || 0;
      const status = h.status_meta || '—';
      linhas.push(`- ${data}: ${liq} und/h • ${status}`);
    });
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
      const data = f.created_at ? formatarData(f.created_at) : '—';
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
    const abertas = tarefas.filter((t) => (t.status || '').toLowerCase() !== 'concluida');
    linhas.push(`- **Total:** ${tarefas.length} • **Em aberto:** ${abertas.length}`);
    abertas.slice(0, 10).forEach((t) => {
      const desc = t.descricao || t.titulo || t.texto || '(sem descrição)';
      linhas.push(`- ${desc} [status: ${t.status || '—'}]`);
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
