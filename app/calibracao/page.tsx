'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Colaborador = {
  id: number;
  id_groot: string;
  nome: string;
  processo: string | null;
  status: string;
  data_admissao: string | null;
};

type HistoricoLinha = {
  id_groot: string;
  data_referencia: string;
  processo: string;
  prod_liquida: number;
  utilizacao: string | null;
  unidades: number;
};

type DpmoEvento = {
  id_groot: string;
  qtd_dif: number;
  semana: number;
  ano: number;
  trimestre: string;
};

type FeedbackTrim = {
  id_groot: string;
  classificacao: string;
  data_referencia: string | null;
  registrado_em: string;
};

type ImaManual = {
  id_groot: string;
  quarter_ref: string;
  valor_ima: number;
};

type ComoManual = {
  id_groot: string;
  quarter_ref: string;
  nota_como: string;
};

type LinhaCalib = {
  id: number;
  idGroot: string;
  nome: string;
  processo: string;
  liqMes1: number;
  liqMes2: number;
  liqMes3: number;
  ocupMes1: number;
  ocupMes2: number;
  ocupMes3: number;
  liqTrim: number;
  ocupTrim: number;
  ima: number;
  imaOrigem: 'auto' | 'manual' | 'vazio';
  que: string;
  como: string;
  comoOrigem: 'auto' | 'manual';
  aptidao: string;
  aptidaoPct: number;
};

function corNota(nota: string): string {
  if (nota === 'Supera') return 'bg-green-500/20 text-green-400';
  if (nota === 'Alinhado') return 'bg-blue-500/20 text-blue-400';
  if (nota === 'Abaixo') return 'bg-red-500/20 text-red-400';
  return 'bg-gray-500/20 text-gray-400';
}

function corAptidao(apt: string): string {
  if (apt === 'APTO') return 'bg-green-500 text-white';
  if (apt === 'EM OBSERVAÇÃO') return 'bg-yellow-500 text-black';
  if (apt === 'NÃO APTO') return 'bg-red-500 text-white';
  return 'bg-gray-500 text-white';
}

const NOMES_MESES_TRIM: Record<string, string[]> = {
  Q1: ['Jan', 'Fev', 'Mar'],
  Q2: ['Abr', 'Mai', 'Jun'],
  Q3: ['Jul', 'Ago', 'Set'],
  Q4: ['Out', 'Nov', 'Dez'],
};

const MESES_POR_TRIM: Record<string, number[]> = {
  Q1: [1, 2, 3],
  Q2: [4, 5, 6],
  Q3: [7, 8, 9],
  Q4: [10, 11, 12],
};

function getTrimestreAtual(): { quarter: string; ano: number } {
  const hoje = new Date();
  const mes = hoje.getMonth() + 1;
  let q = 'Q1';
  if (mes >= 4 && mes <= 6) q = 'Q2';
  else if (mes >= 7 && mes <= 9) q = 'Q3';
  else if (mes >= 10) q = 'Q4';
  return { quarter: q, ano: hoje.getFullYear() };
}

export default function CalibracaoPage() {
  const trimAtual = getTrimestreAtual();
  const [trimestreSelecionado, setTrimestreSelecionado] = useState(
    `${trimAtual.ano}-${trimAtual.quarter}`
  );

  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [historico, setHistorico] = useState<HistoricoLinha[]>([]);
  const [dpmoEventos, setDpmoEventos] = useState<DpmoEvento[]>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackTrim[]>([]);
  const [imaManual, setImaManual] = useState<ImaManual[]>([]);
  const [comoManual, setComoManual] = useState<ComoManual[]>([]);
  const [metaIma, setMetaIma] = useState({ checkin: 1567, p2m: 1567 });
  const [metaOcup, setMetaOcup] = useState({ checkin: 75, p2m: 80 });
  const [metaLiq, setMetaLiq] = useState({ checkin: 296, p2m: 329 });
  const [loading, setLoading] = useState(true);

  // Edição inline
  const [editandoIma, setEditandoIma] = useState<string | null>(null);
  const [valorImaTemp, setValorImaTemp] = useState('');

  useEffect(() => {
    carregar();
  }, [trimestreSelecionado]);

  async function carregar() {
    setLoading(true);
    try {
      const [colabResp, histResp, dpmoResp, fbResp, imaResp, comoResp, confResp] =
        await Promise.all([
          supabase.from('colaboradores').select('*').eq('status', 'Ativo'),
          supabase
            .from('historico')
            .select('id_groot, data_referencia, processo, prod_liquida, utilizacao, unidades'),
          supabase
            .from('dpmo_eventos')
            .select('id_groot, qtd_dif, semana, ano, trimestre'),
          supabase
            .from('feedbacks')
            .select('id_groot, classificacao, data_referencia, registrado_em'),
          supabase.from('ima_manual').select('*'),
          supabase.from('como_manual').select('*'),
          supabase.from('config').select('chave, valor'),
        ]);

      if (colabResp.data) setColaboradores(colabResp.data);
      if (histResp.data) setHistorico(histResp.data);
      if (dpmoResp.data) setDpmoEventos(dpmoResp.data);
      if (fbResp.data) setFeedbacks(fbResp.data as FeedbackTrim[]);
      if (imaResp.data) setImaManual(imaResp.data);
      if (comoResp.data) setComoManual(comoResp.data);
      if (confResp.data) {
        const map: Record<string, number> = {};
        confResp.data.forEach((c: { chave: string; valor: string }) => {
          map[c.chave] = Number(c.valor);
        });
        setMetaIma({
          checkin: map.meta_ima_checkin || 1567,
          p2m: map.meta_ima_p2m || 1567,
        });
        setMetaOcup({
          checkin: map.meta_ocupacao_checkin || 75,
          p2m: map.meta_ocupacao_p2m || 80,
        });
        setMetaLiq({
          checkin: map.meta_checkin_base || 296,
          p2m: map.meta_p2m_base || 329,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  // Parse trimestre selecionado
  const [anoSel, quarterSel] = trimestreSelecionado.split('-');
  const anoNum = parseInt(anoSel);
  const mesesTrim = MESES_POR_TRIM[quarterSel] || [1, 2, 3];
  const nomesMesesTrim = NOMES_MESES_TRIM[quarterSel] || ['Jan', 'Fev', 'Mar'];

  // ════════════════════════════════════════════════════════
  // CÁLCULO PRINCIPAL — monta linhas da calibração
  // ════════════════════════════════════════════════════════
  const linhasCalibracao: LinhaCalib[] = colaboradores.map((c) => {
    // Filtra histórico do colaborador no trimestre
    const histColab = historico.filter((h) => {
      if (h.id_groot !== c.id_groot) return false;
      const data = new Date(h.data_referencia + 'T12:00:00');
      const mes = data.getMonth() + 1;
      const ano = data.getFullYear();
      return ano === anoNum && mesesTrim.includes(mes);
    });

    // Médias mensais (líquida e ocupação)
    const mediasPorMes: Record<number, { liq: number[]; ocup: number[] }> = {};
    histColab.forEach((h) => {
      const data = new Date(h.data_referencia + 'T12:00:00');
      const mes = data.getMonth() + 1;
      if (!mediasPorMes[mes]) mediasPorMes[mes] = { liq: [], ocup: [] };
      if (h.prod_liquida > 0) mediasPorMes[mes].liq.push(h.prod_liquida);
      // Parseia ocupação tipo "85%"
      if (h.utilizacao) {
        const num = parseFloat(h.utilizacao.replace('%', '').replace(',', '.'));
        if (!isNaN(num) && num > 0) mediasPorMes[mes].ocup.push(num);
      }
    });

    const mediaMes = (mes: number, tipo: 'liq' | 'ocup') => {
      const arr = mediasPorMes[mes]?.[tipo] || [];
      if (arr.length === 0) return 0;
      return arr.reduce((s, v) => s + v, 0) / arr.length;
    };

    const liqMes1 = Math.round(mediaMes(mesesTrim[0], 'liq'));
    const liqMes2 = Math.round(mediaMes(mesesTrim[1], 'liq'));
    const liqMes3 = Math.round(mediaMes(mesesTrim[2], 'liq'));
    const ocupMes1 = Math.round(mediaMes(mesesTrim[0], 'ocup'));
    const ocupMes2 = Math.round(mediaMes(mesesTrim[1], 'ocup'));
    const ocupMes3 = Math.round(mediaMes(mesesTrim[2], 'ocup'));

    // Médias trimestrais (só meses com dado)
    const liqsValidas = [liqMes1, liqMes2, liqMes3].filter((v) => v > 0);
    const ocupsValidas = [ocupMes1, ocupMes2, ocupMes3].filter((v) => v > 0);
    const liqTrim =
      liqsValidas.length > 0
        ? Math.round(liqsValidas.reduce((s, v) => s + v, 0) / liqsValidas.length)
        : 0;
    const ocupTrim =
      ocupsValidas.length > 0
        ? Math.round(ocupsValidas.reduce((s, v) => s + v, 0) / ocupsValidas.length)
        : 0;

    // ━━━━ IMA — Auto (cruzando DPMO com Histórico) ou Manual ━━━━
    const quarterKey = `${anoNum}-${quarterSel}`;
    const manualIma = imaManual.find(
      (m) => m.id_groot === c.id_groot && m.quarter_ref === quarterKey
    );

    let ima = 0;
    let imaOrigem: 'auto' | 'manual' | 'vazio' = 'vazio';

    if (manualIma) {
      ima = manualIma.valor_ima;
      imaOrigem = 'manual';
    } else if (c.processo === 'Checkin' || c.processo === 'P2M') {
      // Calcula IMA automático: cruza DIF (dpmo_eventos) com UNIDADES (historico) do trimestre
      const totalDif = dpmoEventos
        .filter(
          (e) =>
            e.id_groot === c.id_groot &&
            e.ano === anoNum &&
            e.trimestre === quarterSel
        )
        .reduce((s, e) => s + e.qtd_dif, 0);
      const totalUnidades = histColab.reduce((s, h) => s + h.unidades, 0);
      if (totalUnidades > 0 && totalDif > 0) {
        ima = Math.round((totalDif / totalUnidades) * 1_000_000);
        imaOrigem = 'auto';
      }
    }

    // ━━━━ QUE — combina Líquida + Ocupação + IMA ━━━━
    let que = 'Sem dados';
    if (c.processo === 'Checkin' || c.processo === 'P2M') {
      const metaL =
        c.processo === 'Checkin' ? metaLiq.checkin : metaLiq.p2m;
      const metaO =
        c.processo === 'Checkin' ? metaOcup.checkin : metaOcup.p2m;
      const metaI = c.processo === 'Checkin' ? metaIma.checkin : metaIma.p2m;

      let pontos = 0;
      if (liqTrim >= metaL) pontos++;
      if (ocupTrim >= metaO) pontos++;
      if (ima > 0 && ima <= metaI) pontos++;

      if (liqTrim === 0 && ocupTrim === 0 && ima === 0) que = 'Sem dados';
      else if (pontos === 3) que = 'Supera';
      else if (pontos >= 1) que = 'Alinhado';
      else que = 'Abaixo';
    } else if (c.processo === 'Sorting') {
      // Sorting só usa líquida
      if (liqTrim === 0) que = 'Sem dados';
      else if (liqTrim > 0) que = 'Alinhado';
    }

    // ━━━━ COMO — automático (dos feedbacks) ou manual ━━━━
    const manualComo = comoManual.find(
      (m) => m.id_groot === c.id_groot && m.quarter_ref === quarterKey
    );

    let como = 'Sem feedbacks';
    let comoOrigem: 'auto' | 'manual' = 'auto';

    if (manualComo) {
      como = manualComo.nota_como;
      comoOrigem = 'manual';
    } else {
      // Calcula a partir dos feedbacks do trimestre
      const fbsTrim = feedbacks.filter((f) => {
        if (f.id_groot !== c.id_groot) return false;
        const dataRef = f.data_referencia || f.registrado_em;
        const data = new Date(dataRef);
        const mes = data.getMonth() + 1;
        const ano = data.getFullYear();
        return ano === anoNum && mesesTrim.includes(mes);
      });

      if (fbsTrim.length > 0) {
        const supera = fbsTrim.filter((f) => f.classificacao === 'Supera').length;
        const alinhado = fbsTrim.filter((f) => f.classificacao === 'Alinhado').length;
        const abaixo = fbsTrim.filter((f) => f.classificacao === 'Abaixo').length;

        if (abaixo > supera + alinhado) como = 'Abaixo';
        else if (supera >= alinhado && supera >= abaixo) como = 'Supera';
        else como = 'Alinhado';
      }
    }

    // ━━━━ APTIDÃO ━━━━
    let aptidao = 'Sem dados';
    let aptidaoPct = 0;
    if (que !== 'Sem dados') {
      if (que === 'Abaixo' || como === 'Abaixo') {
        aptidao = 'NÃO APTO';
        aptidaoPct = 30;
      } else if (que === 'Supera' && (como === 'Supera' || como === 'Alinhado')) {
        aptidao = 'APTO';
        aptidaoPct = 100;
      } else {
        aptidao = 'EM OBSERVAÇÃO';
        aptidaoPct = 60;
      }
    }

    return {
      id: c.id,
      idGroot: c.id_groot,
      nome: c.nome,
      processo: c.processo || 'Sem processo',
      liqMes1,
      liqMes2,
      liqMes3,
      ocupMes1,
      ocupMes2,
      ocupMes3,
      liqTrim,
      ocupTrim,
      ima,
      imaOrigem,
      que,
      como,
      comoOrigem,
      aptidao,
      aptidaoPct,
    };
  });

  // Agrupa por processo
  const porProcesso = {
    Checkin: linhasCalibracao.filter((l) => l.processo === 'Checkin'),
    P2M: linhasCalibracao.filter((l) => l.processo === 'P2M'),
    Sorting: linhasCalibracao.filter((l) => l.processo === 'Sorting'),
  };

  // Stats globais
  const totalAptos = linhasCalibracao.filter((l) => l.aptidao === 'APTO').length;
  const totalObs = linhasCalibracao.filter((l) => l.aptidao === 'EM OBSERVAÇÃO').length;
  const totalNaoAptos = linhasCalibracao.filter((l) => l.aptidao === 'NÃO APTO').length;

  // Lista de trimestres pra seletor (3 anos)
  const trimestresDisponiveis: string[] = [];
  for (let ano = new Date().getFullYear(); ano >= new Date().getFullYear() - 2; ano--) {
    ['Q4', 'Q3', 'Q2', 'Q1'].forEach((q) => {
      trimestresDisponiveis.push(`${ano}-${q}`);
    });
  }

  // ━━━━ SALVAR IMA MANUAL ━━━━
  async function salvarImaManual(linha: LinhaCalib, valor: number) {
    const quarterKey = `${anoNum}-${quarterSel}`;
    const { error } = await supabase.from('ima_manual').upsert(
      {
        id_groot: linha.idGroot,
        nome: linha.nome,
        processo: linha.processo,
        quarter_ref: quarterKey,
        valor_ima: valor,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'id_groot,quarter_ref' }
    );
    if (error) {
      alert('Erro: ' + error.message);
    } else {
      setEditandoIma(null);
      carregar();
    }
  }

  async function salvarComoManual(linha: LinhaCalib, nota: string) {
    const quarterKey = `${anoNum}-${quarterSel}`;
    const { error } = await supabase.from('como_manual').upsert(
      {
        id_groot: linha.idGroot,
        nome: linha.nome,
        processo: linha.processo,
        quarter_ref: quarterKey,
        nota_como: nota,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'id_groot,quarter_ref' }
    );
    if (error) {
      alert('Erro: ' + error.message);
    } else {
      carregar();
    }
  }

  async function resetarIma(linha: LinhaCalib) {
    if (!window.confirm('Resetar IMA manual (volta pro automático)?')) return;
    const quarterKey = `${anoNum}-${quarterSel}`;
    await supabase
      .from('ima_manual')
      .delete()
      .eq('id_groot', linha.idGroot)
      .eq('quarter_ref', quarterKey);
    carregar();
  }

  async function resetarComo(linha: LinhaCalib) {
    if (!window.confirm('Resetar COMO manual (volta pro automático)?')) return;
    const quarterKey = `${anoNum}-${quarterSel}`;
    await supabase
      .from('como_manual')
      .delete()
      .eq('id_groot', linha.idGroot)
      .eq('quarter_ref', quarterKey);
    carregar();
  }

  if (loading) {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
        <span className="text-6xl block mb-4">⏳</span>
        <p className="text-gray-400">Calculando calibração...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black mb-2">
          🎯 Calibração <span className="text-[#FFD700]">Trimestral</span>
        </h1>
        <p className="text-gray-400">
          Avaliação completa: QUE + COMO = Aptidão para promoção
        </p>
      </div>

      {/* Seletor de trimestre */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-sm font-bold text-gray-300">Trimestre:</label>
          <select
            value={trimestreSelecionado}
            onChange={(e) => setTrimestreSelecionado(e.target.value)}
            className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-2 text-white font-bold focus:border-[#FFD700] focus:outline-none"
          >
            {trimestresDisponiveis.map((t) => {
              const [a, q] = t.split('-');
              const meses = NOMES_MESES_TRIM[q].join('/');
              return (
                <option key={t} value={t}>
                  {a} • {q} ({meses})
                </option>
              );
            })}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-center">
            <div className="text-2xl font-black text-green-400">{totalAptos}</div>
            <div className="text-xs text-gray-500">Aptos</div>
          </div>
          <div className="w-px h-10 bg-[#2a2a2a]"></div>
          <div className="text-center">
            <div className="text-2xl font-black text-yellow-400">{totalObs}</div>
            <div className="text-xs text-gray-500">Observação</div>
          </div>
          <div className="w-px h-10 bg-[#2a2a2a]"></div>
          <div className="text-center">
            <div className="text-2xl font-black text-red-400">{totalNaoAptos}</div>
            <div className="text-xs text-gray-500">Não Aptos</div>
          </div>
        </div>
      </div>

      {/* Tabela por processo */}
      {(['Checkin', 'P2M', 'Sorting'] as const).map((proc) => {
        const linhas = porProcesso[proc];
        if (linhas.length === 0) return null;

        return (
          <div
            key={proc}
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden"
          >
            <div className="bg-[#0a0a0a] px-6 py-3 border-b border-[#2a2a2a]">
              <h2 className="text-lg font-bold text-[#FFD700]">
                {proc === 'Checkin' ? '📦' : proc === 'P2M' ? '🚚' : '📋'} {proc}{' '}
                <span className="text-sm font-normal text-gray-400">
                  ({linhas.length} colaboradores)
                </span>
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-left text-xs text-gray-400">
                    <th className="py-3 px-3">Colab.</th>
                    <th className="py-3 px-2 text-center" colSpan={2}>
                      {nomesMesesTrim[0]}
                    </th>
                    <th className="py-3 px-2 text-center" colSpan={2}>
                      {nomesMesesTrim[1]}
                    </th>
                    <th className="py-3 px-2 text-center" colSpan={2}>
                      {nomesMesesTrim[2]}
                    </th>
                    <th className="py-3 px-2 text-center bg-[#0a0a0a]" colSpan={2}>
                      Trim.
                    </th>
                    <th className="py-3 px-3 text-center">IMA</th>
                    <th className="py-3 px-2 text-center">QUE</th>
                    <th className="py-3 px-2 text-center">COMO</th>
                    <th className="py-3 px-2 text-center">APTIDÃO</th>
                  </tr>
                  <tr className="border-b border-[#2a2a2a] text-xs text-gray-500">
                    <th className="py-1"></th>
                    <th className="py-1 text-center">Líq</th>
                    <th className="py-1 text-center">Oc%</th>
                    <th className="py-1 text-center">Líq</th>
                    <th className="py-1 text-center">Oc%</th>
                    <th className="py-1 text-center">Líq</th>
                    <th className="py-1 text-center">Oc%</th>
                    <th className="py-1 text-center bg-[#0a0a0a]">Líq</th>
                    <th className="py-1 text-center bg-[#0a0a0a]">Oc%</th>
                    <th></th>
                    <th></th>
                    <th></th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr
                      key={l.idGroot}
                      className="border-b border-[#2a2a2a] hover:bg-[#0a0a0a] transition-colors"
                    >
                      <td className="py-2 px-3">
                        <div className="text-white text-xs font-bold truncate max-w-[140px]">
                          {l.nome}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">
                          {l.idGroot}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-center text-gray-300 font-mono text-xs">
                        {l.liqMes1 || '-'}
                      </td>
                      <td className="py-2 px-2 text-center text-gray-300 font-mono text-xs">
                        {l.ocupMes1 || '-'}
                      </td>
                      <td className="py-2 px-2 text-center text-gray-300 font-mono text-xs">
                        {l.liqMes2 || '-'}
                      </td>
                      <td className="py-2 px-2 text-center text-gray-300 font-mono text-xs">
                        {l.ocupMes2 || '-'}
                      </td>
                      <td className="py-2 px-2 text-center text-gray-300 font-mono text-xs">
                        {l.liqMes3 || '-'}
                      </td>
                      <td className="py-2 px-2 text-center text-gray-300 font-mono text-xs">
                        {l.ocupMes3 || '-'}
                      </td>
                      <td className="py-2 px-2 text-center bg-[#0a0a0a] text-white font-bold font-mono">
                        {l.liqTrim || '-'}
                      </td>
                      <td className="py-2 px-2 text-center bg-[#0a0a0a] text-white font-bold font-mono">
                        {l.ocupTrim ? l.ocupTrim + '%' : '-'}
                      </td>

                      {/* IMA editável */}
                      <td className="py-2 px-3 text-center">
                        {editandoIma === l.idGroot ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={valorImaTemp}
                              onChange={(e) => setValorImaTemp(e.target.value)}
                              className="w-20 bg-[#0a0a0a] border border-[#FFD700] rounded px-2 py-1 text-white text-xs"
                              autoFocus
                            />
                            <button
                              onClick={() =>
                                salvarImaManual(l, parseInt(valorImaTemp) || 0)
                              }
                              className="text-green-400 hover:text-green-300 text-xs"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => setEditandoIma(null)}
                              className="text-red-400 hover:text-red-300 text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div
                            className="cursor-pointer hover:bg-[#1a1a1a] rounded px-1 py-0.5"
                            onClick={() => {
                              setEditandoIma(l.idGroot);
                              setValorImaTemp(l.ima.toString());
                            }}
                            title="Clica pra editar"
                          >
                            <div className="text-white font-bold font-mono text-xs">
                              {l.ima || '-'}
                            </div>
                            {l.imaOrigem === 'manual' && (
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-[8px] text-yellow-400 font-bold">
                                  manual
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    resetarIma(l);
                                  }}
                                  className="text-[8px] text-gray-500 hover:text-red-400"
                                  title="Resetar"
                                >
                                  ↺
                                </button>
                              </div>
                            )}
                            {l.imaOrigem === 'auto' && (
                              <div className="text-[8px] text-green-400">
                                auto
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* QUE */}
                      <td className="py-2 px-2 text-center">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-bold ${corNota(
                            l.que
                          )}`}
                        >
                          {l.que}
                        </span>
                      </td>

                      {/* COMO editável */}
                      <td className="py-2 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <select
                            value={l.como === 'Sem feedbacks' ? '' : l.como}
                            onChange={(e) => {
                              if (e.target.value) salvarComoManual(l, e.target.value);
                            }}
                            className={`text-xs px-2 py-0.5 rounded-full font-bold border-0 cursor-pointer ${corNota(
                              l.como
                            )}`}
                          >
                            <option value="">{l.como}</option>
                            <option value="Supera">Supera</option>
                            <option value="Alinhado">Alinhado</option>
                            <option value="Abaixo">Abaixo</option>
                          </select>
                          {l.comoOrigem === 'manual' && (
                            <button
                              onClick={() => resetarComo(l)}
                              className="text-[10px] text-gray-500 hover:text-red-400"
                              title="Resetar"
                            >
                              ↺
                            </button>
                          )}
                        </div>
                      </td>

                      {/* APTIDÃO */}
                      <td className="py-2 px-2 text-center">
                        <span
                          className={`text-xs px-2 py-1 rounded font-bold ${corAptidao(
                            l.aptidao
                          )}`}
                        >
                          {l.aptidao}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {linhasCalibracao.length === 0 && (
        <div className="bg-[#1a1a1a] border-2 border-dashed border-[#2a2a2a] rounded-2xl p-12 text-center">
          <span className="text-6xl block mb-4">📭</span>
          <h3 className="text-xl font-bold text-white mb-2">
            Nenhum colaborador ativo
          </h3>
          <p className="text-gray-400">Cadastre colaboradores no MEU TIME</p>
        </div>
      )}

      {/* Legenda */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 text-sm text-blue-300">
        <p className="font-bold mb-2">💡 Como funciona:</p>
        <ul className="space-y-1 list-disc pl-5 text-xs">
          <li>
            <strong>QUE</strong> = Líquida + Ocupação + IMA do trimestre (3
            indicadores valem 1 ponto cada)
          </li>
          <li>
            <strong>COMO</strong> = derivado dos feedbacks do trimestre. Você
            pode SOBRESCREVER clicando no campo
          </li>
          <li>
            <strong>IMA</strong> = calculado automaticamente (DPMO ÷ Unidades).
            Pode editar clicando no número
          </li>
          <li>
            <strong>APTIDÃO</strong>: QUE=Supera + COMO≥Alinhado → APTO | Algum
            Abaixo → NÃO APTO | Resto → EM OBSERVAÇÃO
          </li>
        </ul>
      </div>
    </div>
  );
}
