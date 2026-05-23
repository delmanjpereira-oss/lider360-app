'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';
import { useToast } from '../components/ToastProvider';

type StatusBanco = {
  totalRegistros: number;
  tamanhoMB: number;
  totalColabs: number;
  totalIMAs: number;
  totalDPMOs: number;
  totalSemanas: number;
  totalHistorico: number;
  totalOcupacao: number;
  totalFeedbacks: number;
};

type UploadHistorico = {
  id: number;
  arquivo: string;
  tabela: string;
  linhas: number;
  data: string;
  modelo_csv?: string;
};

// ============================================
// 🎯 METAS — TODAS AS CHAVES DO CONFIG
// ============================================

type MetasApp = {
  // Produtividade
  meta_checkin_base: string;
  meta_checkin_alinhado_max: string;
  meta_p2m_base: string;
  meta_p2m_alinhado_max: string;
  
  // Ocupação
  meta_ocupacao_checkin: string;
  meta_ocupacao_p2m: string;
  
  // IMA
  meta_ima_checkin: string;
  meta_ima_p2m: string;
  
  // Streak / Copiloto Vivo
  streak_negativo: string;
  
  // Limites de análise
  janela_performance_dias: string;
  janela_presenca_dias: string;
  presenca_red_flag_pct: string;
};

const METAS_DEFAULT: MetasApp = {
  meta_checkin_base: '296',
  meta_checkin_alinhado_max: '310',
  meta_p2m_base: '329',
  meta_p2m_alinhado_max: '350',
  meta_ocupacao_checkin: '75',
  meta_ocupacao_p2m: '80',
  meta_ima_checkin: '1567',
  meta_ima_p2m: '1567',
  streak_negativo: '5',
  janela_performance_dias: '30',
  janela_presenca_dias: '60',
  presenca_red_flag_pct: '70',
};

const METAS_INFO: Record<keyof MetasApp, { label: string; emoji: string; descricao: string; sufixo: string; categoria: string }> = {
  meta_checkin_base: { label: 'Meta Base Checkin', emoji: '📦', descricao: 'Mínima pra "Alinhado"', sufixo: 'pç/h', categoria: 'Produtividade' },
  meta_checkin_alinhado_max: { label: 'Meta Supera Checkin', emoji: '📦', descricao: 'A partir daqui, vira "Supera"', sufixo: 'pç/h', categoria: 'Produtividade' },
  meta_p2m_base: { label: 'Meta Base P2M', emoji: '🚚', descricao: 'Mínima pra "Alinhado"', sufixo: 'pç/h', categoria: 'Produtividade' },
  meta_p2m_alinhado_max: { label: 'Meta Supera P2M', emoji: '🚚', descricao: 'A partir daqui, vira "Supera"', sufixo: 'pç/h', categoria: 'Produtividade' },
  meta_ocupacao_checkin: { label: 'Ocupação Checkin', emoji: '📊', descricao: 'Mínima desejada', sufixo: '%', categoria: 'Ocupação' },
  meta_ocupacao_p2m: { label: 'Ocupação P2M', emoji: '📊', descricao: 'Mínima desejada', sufixo: '%', categoria: 'Ocupação' },
  meta_ima_checkin: { label: 'IMA Limite Checkin', emoji: '🎯', descricao: 'Máximo (menor é melhor)', sufixo: '', categoria: 'Qualidade' },
  meta_ima_p2m: { label: 'IMA Limite P2M', emoji: '🎯', descricao: 'Máximo (menor é melhor)', sufixo: '', categoria: 'Qualidade' },
  streak_negativo: { label: 'Streak de Alerta', emoji: '🚨', descricao: 'Dias seguidos abaixo da meta = ofensor crítico', sufixo: 'dias', categoria: 'Copiloto Vivo' },
  janela_performance_dias: { label: 'Janela Performance', emoji: '📅', descricao: 'Dias analisados nas estatísticas', sufixo: 'dias', categoria: 'Análise' },
  janela_presenca_dias: { label: 'Janela Presença', emoji: '📅', descricao: 'Dias analisados na assiduidade', sufixo: 'dias', categoria: 'Análise' },
  presenca_red_flag_pct: { label: 'Presença Crítica', emoji: '⚠️', descricao: 'Abaixo disso vira alerta', sufixo: '%', categoria: 'Análise' },
};

const MESES = [
  { num: 1, label: 'Janeiro' }, { num: 2, label: 'Fevereiro' },
  { num: 3, label: 'Março' }, { num: 4, label: 'Abril' },
  { num: 5, label: 'Maio' }, { num: 6, label: 'Junho' },
  { num: 7, label: 'Julho' }, { num: 8, label: 'Agosto' },
  { num: 9, label: 'Setembro' }, { num: 10, label: 'Outubro' },
  { num: 11, label: 'Novembro' }, { num: 12, label: 'Dezembro' },
];

export default function ConfiguracoesBancoPage() {
  const toast = useToast();
  
  // 🎯 ABA ATIVA
  const [abaAtiva, setAbaAtiva] = useState<'metas' | 'banco'>('metas');
  
  // 🎯 METAS
  const [metas, setMetas] = useState<MetasApp>(METAS_DEFAULT);
  const [metasOriginal, setMetasOriginal] = useState<MetasApp>(METAS_DEFAULT);
  const [salvandoMetas, setSalvandoMetas] = useState(false);
  const [carregandoMetas, setCarregandoMetas] = useState(true);
  
  // Banco
  const [status, setStatus] = useState<StatusBanco>({
    totalRegistros: 0, tamanhoMB: 0, totalColabs: 0, totalIMAs: 0,
    totalDPMOs: 0, totalSemanas: 0, totalHistorico: 0, totalOcupacao: 0, totalFeedbacks: 0,
  });
  const [uploads, setUploads] = useState<UploadHistorico[]>([]);
  const [abaHistorico, setAbaHistorico] = useState<'csv' | 'print'>('csv');
  const [duplicatas, setDuplicatas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [mesLimpeza, setMesLimpeza] = useState(5);
  const [anoLimpeza, setAnoLimpeza] = useState(2026);
  const [processoLimpeza, setProcessoLimpeza] = useState<'Checkin' | 'P2M' | 'Ambos'>('Ambos');
  const [limpandoMes, setLimpandoMes] = useState(false);
  const [limpandoHist, setLimpandoHist] = useState(false);
  const [buscandoDup, setBuscandoDup] = useState(false);
  const [limpandoDup, setLimpandoDup] = useState(false);
  
  const [confirmarApagarTudo, setConfirmarApagarTudo] = useState('');
  const [apagandoTudo, setApagandoTudo] = useState(false);

  // ============================================
  // CARREGAR METAS DO SUPABASE
  // ============================================
  
  useEffect(() => {
    carregarMetas();
    carregarBanco();
  }, []);

  async function carregarMetas() {
    setCarregandoMetas(true);
    try {
      const { data, error } = await supabase
        .from('config')
        .select('chave, valor');
      
      if (error) {
        console.error('Erro carregando config:', error);
        return;
      }
      
      const carregadas = { ...METAS_DEFAULT };
      (data || []).forEach((c: any) => {
        if (c.chave in carregadas) {
          (carregadas as any)[c.chave] = String(c.valor);
        }
      });
      
      setMetas(carregadas);
      setMetasOriginal(carregadas);
    } catch (e: any) {
      console.error(e);
    } finally {
      setCarregandoMetas(false);
    }
  }

  async function salvarMetas() {
    setSalvandoMetas(true);
    const loadingId = toast.loading('Salvando metas...', 'Aplicando no app inteiro');
    
    try {
      const upserts = (Object.keys(metas) as (keyof MetasApp)[]).map(chave => ({
        chave,
        valor: metas[chave],
        descricao: METAS_INFO[chave].descricao,
        atualizado_em: new Date().toISOString(),
      }));
      
      const { error } = await supabase
        .from('config')
        .upsert(upserts, { onConflict: 'chave' });
      
      if (error) throw new Error(error.message);
      
      setMetasOriginal({ ...metas });
      
      toast.update(loadingId, {
        type: 'success',
        title: '✅ Metas salvas!',
        description: 'O app inteiro vai usar esses valores',
      });
    } catch (e: any) {
      toast.update(loadingId, {
        type: 'error',
        title: 'Erro ao salvar',
        description: e.message,
      });
    } finally {
      setSalvandoMetas(false);
    }
  }
  
  function resetarMetas() {
    if (!confirm('Voltar pros valores padrão? Você precisa clicar em "Salvar" pra confirmar.')) return;
    setMetas({ ...METAS_DEFAULT });
  }
  
  const houveMudanca = JSON.stringify(metas) !== JSON.stringify(metasOriginal);

  // ============================================
  // BANCO
  // ============================================
  
  async function carregarBanco() {
    setLoading(true);
    try {
      const [
        { count: colabs },
        { count: imas },
        { count: dpmos },
        { count: hist },
        { count: ocup },
        { count: fbs },
      ] = await Promise.all([
        supabase.from('colaboradores').select('id', { count: 'exact', head: true }),
        supabase.from('ima_manual').select('id', { count: 'exact', head: true }),
        supabase.from('dpmo_agregado').select('id', { count: 'exact', head: true }),
        supabase.from('historico').select('id', { count: 'exact', head: true }),
        supabase.from('ocupacao_p2m').select('id', { count: 'exact', head: true }),
        supabase.from('feedbacks').select('feedback_id', { count: 'exact', head: true }),
      ]);

      const { data: semanas } = await supabase
        .from('dpmo_agregado')
        .select('semana, ano')
        .limit(5000);

      const semanasUnicas = new Set<string>();
      (semanas || []).forEach((s: any) => semanasUnicas.add(`${s.ano}-${s.semana}`));

      const totalReg = (colabs || 0) + (imas || 0) + (dpmos || 0) + (hist || 0) + (ocup || 0) + (fbs || 0);
      const tamMB = (totalReg * 300) / (1024 * 1024);

      setStatus({
        totalRegistros: totalReg,
        tamanhoMB: tamMB,
        totalColabs: colabs || 0,
        totalIMAs: imas || 0,
        totalDPMOs: dpmos || 0,
        totalSemanas: semanasUnicas.size,
        totalHistorico: hist || 0,
        totalOcupacao: ocup || 0,
        totalFeedbacks: fbs || 0,
      });
      
      const { data: uploadsData } = await supabase
        .from('uploads')
        .select('*')
        .order('data', { ascending: false })
        .limit(15);
      
      if (uploadsData) setUploads(uploadsData as UploadHistorico[]);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function limparMes() {
    if (!confirm(`Apagar dados de IMA + DPMO de ${MESES[mesLimpeza - 1].label}/${anoLimpeza}?`)) return;
    setLimpandoMes(true);
    const loadingId = toast.loading('Apagando dados...', `${MESES[mesLimpeza - 1].label}/${anoLimpeza}`);
    try {
      let totalIma = 0, totalDpmo = 0;
      const procsIma = processoLimpeza === 'Ambos' ? ['Checkin', 'P2M'] : [processoLimpeza];
      for (const proc of procsIma) {
        const { count } = await supabase.from('ima_manual').delete({ count: 'exact' })
          .eq('mes', mesLimpeza).eq('ano', anoLimpeza).eq('processo', proc);
        totalIma += count || 0;
      }
      const semanasMes: number[] = [];
      for (let dia = 1; dia <= 31; dia++) {
        const data = new Date(anoLimpeza, mesLimpeza - 1, dia);
        if (data.getMonth() + 1 !== mesLimpeza) break;
        const utc = new Date(Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()));
        const dow = utc.getUTCDay() || 7;
        utc.setUTCDate(utc.getUTCDate() + 4 - dow);
        const inicio = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
        const semana = Math.ceil((((utc.getTime() - inicio.getTime()) / 86400000) + 1) / 7);
        if (!semanasMes.includes(semana)) semanasMes.push(semana);
      }
      const procsDpmo = processoLimpeza === 'Ambos' ? ['CK', 'P2M'] : [processoLimpeza === 'Checkin' ? 'CK' : 'P2M'];
      for (const proc of procsDpmo) {
        const { count } = await supabase.from('dpmo_agregado').delete({ count: 'exact' })
          .in('semana', semanasMes).eq('ano', anoLimpeza).eq('processo', proc);
        totalDpmo += count || 0;
      }
      toast.update(loadingId, { type: 'success', title: 'Limpeza concluída', description: `${totalIma} IMAs + ${totalDpmo} DPMOs apagados` });
      carregarBanco();
    } catch (e: any) {
      toast.update(loadingId, { type: 'error', title: 'Erro', description: e.message });
    } finally {
      setLimpandoMes(false);
    }
  }

  async function limparHistoricoProdutividade() {
    if (!confirm('Apagar TODO o histórico de produtividade diária + ocupação?')) return;
    setLimpandoHist(true);
    const loadingId = toast.loading('Apagando histórico...');
    try {
      const { count: histCount } = await supabase.from('historico').delete({ count: 'exact' }).gt('id', 0);
      const { count: ocupCount } = await supabase.from('ocupacao_p2m').delete({ count: 'exact' }).gt('id', 0);
      const { count: prodCount } = await supabase.from('produtividade_mensal').delete({ count: 'exact' }).gt('id', 0);
      toast.update(loadingId, { type: 'success', title: 'Histórico apagado', description: `${(histCount || 0) + (ocupCount || 0) + (prodCount || 0)} registros removidos` });
      carregarBanco();
    } catch (e: any) {
      toast.update(loadingId, { type: 'error', title: 'Erro', description: e.message });
    } finally {
      setLimpandoHist(false);
    }
  }

  async function buscarDuplicatas() {
    setBuscandoDup(true);
    const loadingId = toast.loading('Buscando duplicatas...');
    try {
      const todos: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase.from('historico')
          .select('id_groot, data_referencia, processo, unidades, criado_em')
          .range(offset, offset + pageSize - 1)
          .order('criado_em', { ascending: false });
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;
        todos.push(...data);
        if (data.length < pageSize) break;
        offset += pageSize;
      }
      const grupos: Record<string, any[]> = {};
      todos.forEach((r: any) => {
        const k = `${r.id_groot}|${r.data_referencia}|${r.processo}`;
        if (!grupos[k]) grupos[k] = [];
        grupos[k].push(r);
      });
      const dups = Object.entries(grupos).filter(([_, v]) => v.length > 1).map(([k, v]) => ({ chave: k, registros: v }));
      setDuplicatas(dups);
      if (dups.length === 0) {
        toast.update(loadingId, { type: 'success', title: '✨ Banco limpo!', description: `${todos.length} registros verificados` });
      } else {
        toast.update(loadingId, { type: 'info', title: `${dups.length} duplicatas encontradas`, description: `${dups.reduce((s, d) => s + d.registros.length - 1, 0)} cópias extras` });
      }
    } catch (e: any) {
      toast.update(loadingId, { type: 'error', title: 'Erro', description: e.message });
    } finally {
      setBuscandoDup(false);
    }
  }

  async function limparDuplicatas() {
    if (!confirm('Apagar duplicatas?')) return;
    setLimpandoDup(true);
    const loadingId = toast.loading('Removendo duplicatas...');
    try {
      let apagados = 0;
      for (const dup of duplicatas) {
        const ordenados = [...dup.registros].sort((a: any, b: any) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());
        const manter = ordenados[0];
        const apagar = ordenados.slice(1);
        for (const r of apagar) {
          await supabase.from('historico').delete()
            .eq('id_groot', r.id_groot).eq('data_referencia', r.data_referencia)
            .eq('processo', r.processo).neq('criado_em', manter.criado_em);
          apagados++;
        }
      }
      toast.update(loadingId, { type: 'success', title: 'Duplicatas removidas', description: `${apagados} apagadas` });
      setDuplicatas([]);
      carregarBanco();
    } catch (e: any) {
      toast.update(loadingId, { type: 'error', title: 'Erro', description: e.message });
    } finally {
      setLimpandoDup(false);
    }
  }

  async function apagarTudo() {
    if (confirmarApagarTudo !== 'APAGAR TUDO') return;
    setApagandoTudo(true);
    const loadingId = toast.loading('Apagando todos os dados...');
    try {
      await supabase.from('ima_manual').delete().gt('id', 0);
      await supabase.from('dpmo_agregado').delete().gt('id', 0);
      await supabase.from('dpmo_eventos').delete().gt('id', 0);
      await supabase.from('historico').delete().gt('id', 0);
      await supabase.from('produtividade_mensal').delete().gt('id', 0);
      await supabase.from('ocupacao_p2m').delete().gt('id', 0);
      await supabase.from('uploads').delete().gt('id', 0);
      toast.update(loadingId, { type: 'success', title: 'Banco resetado' });
      setConfirmarApagarTudo('');
      carregarBanco();
    } catch (e: any) {
      toast.update(loadingId, { type: 'error', title: 'Erro', description: e.message });
    } finally {
      setApagandoTudo(false);
    }
  }

  function formatarData(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  // 🎯 Agrupa metas por categoria
  const metasPorCategoria: Record<string, (keyof MetasApp)[]> = {};
  (Object.keys(METAS_INFO) as (keyof MetasApp)[]).forEach(chave => {
    const cat = METAS_INFO[chave].categoria;
    if (!metasPorCategoria[cat]) metasPorCategoria[cat] = [];
    metasPorCategoria[cat].push(chave);
  });

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/" className="text-yellow-400 hover:underline text-sm">← Voltar ao início</Link>
          <h1 className="text-4xl font-black mt-3 mb-2">
            ⚙️ <span className="text-[#FFD700]">Configurações</span>
          </h1>
          <p className="text-gray-400 text-sm">Metas do app + gerenciamento do banco</p>
        </div>

        {/* 🎯 TABS PRINCIPAIS */}
        <div className="flex gap-2 mb-6 border-b border-[#2a2a2a]">
          <button
            onClick={() => setAbaAtiva('metas')}
            className={`px-6 py-3 font-bold text-sm transition-all border-b-2 -mb-px ${
              abaAtiva === 'metas'
                ? 'border-[#FFD700] text-[#FFD700]'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            🎯 Metas e Limites
          </button>
          <button
            onClick={() => setAbaAtiva('banco')}
            className={`px-6 py-3 font-bold text-sm transition-all border-b-2 -mb-px ${
              abaAtiva === 'banco'
                ? 'border-orange-400 text-orange-300'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            🗄️ Banco de Dados
          </button>
        </div>

        {/* ============================================ */}
        {/* 🎯 ABA METAS */}
        {/* ============================================ */}
        {abaAtiva === 'metas' && (
          <>
            {carregandoMetas ? (
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
                <span className="text-5xl block mb-3 animate-pulse">⏳</span>
                <p className="text-gray-400">Carregando metas...</p>
              </div>
            ) : (
              <>
                {/* Aviso */}
                <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/30 rounded-2xl p-4 mb-6 flex items-start gap-3">
                  <span className="text-2xl">💡</span>
                  <div className="text-sm">
                    <p className="text-blue-300 font-bold mb-1">As metas valem pro app inteiro</p>
                    <p className="text-gray-400 text-xs">
                      Quando você muda aqui, TODO o app responde — Boletim, Calibração, Copiloto, Detalhe colab. 
                      Os valores ficam salvos no Supabase e persistem entre sessões.
                    </p>
                  </div>
                </div>

                {/* Metas agrupadas por categoria */}
                <div className="space-y-4 mb-6">
                  {Object.entries(metasPorCategoria).map(([categoria, chaves]) => (
                    <div key={categoria} className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6">
                      <h2 className="text-lg font-bold text-[#FFD700] mb-4 flex items-center gap-2">
                        {categoria === 'Produtividade' && '📈'}
                        {categoria === 'Ocupação' && '📊'}
                        {categoria === 'Qualidade' && '🎯'}
                        {categoria === 'Copiloto Vivo' && '🤖'}
                        {categoria === 'Análise' && '📅'}
                        {categoria}
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {chaves.map(chave => {
                          const info = METAS_INFO[chave];
                          return (
                            <div key={chave} className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xl">{info.emoji}</span>
                                <div className="flex-1">
                                  <p className="text-sm font-bold text-white">{info.label}</p>
                                  <p className="text-[10px] text-gray-500">{info.descricao}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  value={metas[chave]}
                                  onChange={(e) => setMetas({ ...metas, [chave]: e.target.value })}
                                  className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] focus:border-[#FFD700] rounded-lg px-3 py-2 text-white font-mono text-base outline-none transition-colors"
                                />
                                {info.sufixo && (
                                  <span className="text-xs text-gray-400 font-bold w-12">{info.sufixo}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Botões de ação */}
                <div className="sticky bottom-4 bg-gradient-to-br from-[#1a1a1a] to-[#141414] border-2 border-[#FFD700]/30 rounded-2xl p-4 flex gap-3 flex-wrap shadow-2xl shadow-yellow-500/10">
                  {houveMudanca && (
                    <span className="text-yellow-400 font-bold text-sm flex items-center gap-2">
                      ⚠️ Alterações não salvas
                    </span>
                  )}
                  <button
                    onClick={resetarMetas}
                    disabled={salvandoMetas}
                    className="bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white font-bold px-4 py-2 rounded-xl transition-all text-sm disabled:opacity-50"
                  >
                    🔄 Resetar Padrão
                  </button>
                  <button
                    onClick={salvarMetas}
                    disabled={salvandoMetas || !houveMudanca}
                    className="flex-1 min-w-[200px] bg-gradient-to-br from-[#FFD700] to-yellow-500 hover:from-yellow-300 text-black font-black px-6 py-3 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-yellow-500/30 flex items-center justify-center gap-2"
                  >
                    {salvandoMetas ? <><span className="animate-spin">⏳</span> Salvando...</> : '💾 Salvar Metas'}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ============================================ */}
        {/* 🗄️ ABA BANCO */}
        {/* ============================================ */}
        {abaAtiva === 'banco' && (
          <>
            {/* Cards de status */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatusCard icone="👥" valor={loading ? '...' : status.totalColabs} label="Colaboradores" cor="from-cyan-500/20 to-cyan-600/5" corBorda="border-cyan-500/30" />
              <StatusCard icone="🎯" valor={loading ? '...' : status.totalIMAs} label="IMAs Salvos" cor="from-yellow-500/20 to-yellow-600/5" corBorda="border-yellow-500/30" />
              <StatusCard icone="📊" valor={loading ? '...' : status.totalDPMOs} label="DPMOs Semanais" cor="from-purple-500/20 to-purple-600/5" corBorda="border-purple-500/30" />
              <StatusCard icone="📅" valor={loading ? '...' : status.totalSemanas} label="Semanas c/ Dados" cor="from-emerald-500/20 to-emerald-600/5" corBorda="border-emerald-500/30" />
            </div>

            {/* Limpar por mês */}
            <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-4">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center text-2xl">🧹</div>
                <div>
                  <h2 className="text-xl font-bold text-white">Limpar Dados por Mês</h2>
                  <p className="text-xs text-gray-500">Remove IMAs + DPMOs de um período específico</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase mb-2 block">Mês</label>
                  <select value={mesLimpeza} onChange={(e) => setMesLimpeza(Number(e.target.value))} className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white outline-none">
                    {MESES.map((m) => <option key={m.num} value={m.num}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase mb-2 block">Ano</label>
                  <select value={anoLimpeza} onChange={(e) => setAnoLimpeza(Number(e.target.value))} className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white outline-none">
                    {[2024, 2025, 2026, 2027].map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase mb-2 block">Processo</label>
                  <select value={processoLimpeza} onChange={(e) => setProcessoLimpeza(e.target.value as any)} className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white outline-none">
                    <option value="Ambos">Ambos</option>
                    <option value="Checkin">Checkin</option>
                    <option value="P2M">P2M</option>
                  </select>
                </div>
              </div>
              <button onClick={limparMes} disabled={limpandoMes} className="w-full bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-400 text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-50">
                {limpandoMes ? '⏳ Apagando...' : `🗑️ Apagar ${MESES[mesLimpeza - 1].label}/${anoLimpeza}`}
              </button>
            </div>

            {/* Limpar histórico */}
            <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center text-2xl">📊</div>
                <div>
                  <h2 className="text-lg font-bold text-white">Limpar Dados Brutos</h2>
                  <p className="text-xs text-gray-500">{status.totalHistorico.toLocaleString('pt-BR')} registros</p>
                </div>
              </div>
              <button onClick={limparHistoricoProdutividade} disabled={limpandoHist} className="bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold py-2.5 px-5 rounded-xl transition-all disabled:opacity-50">
                {limpandoHist ? '⏳ Apagando...' : '🗑️ Apagar produtividade + ocupação'}
              </button>
            </div>

            {/* Histórico de uploads */}
            <details className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl mb-4 group">
              <summary className="cursor-pointer p-5 flex items-center justify-between hover:bg-[#1e1e1e] transition-all rounded-xl list-none">
                <span className="text-sm font-bold text-gray-300">📋 Histórico de Envios</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-[#0a0a0a] text-gray-400 px-2.5 py-1 rounded-full">{uploads.length}</span>
                  <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                </div>
              </summary>
              <div className="px-5 pb-5 pt-2 space-y-2 border-t border-[#2a2a2a]">
                {(() => {
                  const isPrint = (u: UploadHistorico) =>
                    String(u.modelo_csv || '').toLowerCase().includes('print') ||
                    String(u.arquivo || '').toLowerCase().includes('print ocr') ||
                    String(u.tabela || '').includes('ima_manual');
                  const uploadsPrint = uploads.filter(isPrint);
                  const uploadsCsv = uploads.filter((u) => !isPrint(u));
                  const uploadsAtivos = abaHistorico === 'csv' ? uploadsCsv : uploadsPrint;
                  return (
                    <>
                      <div className="flex gap-2 mt-3 border-b border-[#2a2a2a] -mx-5 px-5 pb-0">
                        <button onClick={() => setAbaHistorico('csv')} className={`px-4 py-2 text-xs font-bold transition-all border-b-2 -mb-px ${abaHistorico === 'csv' ? 'border-[#FFD700] text-[#FFD700]' : 'border-transparent text-gray-500'}`}>
                          📊 CSVs ({uploadsCsv.length})
                        </button>
                        <button onClick={() => setAbaHistorico('print')} className={`px-4 py-2 text-xs font-bold transition-all border-b-2 -mb-px ${abaHistorico === 'print' ? 'border-purple-400 text-purple-300' : 'border-transparent text-gray-500'}`}>
                          📸 Prints OCR ({uploadsPrint.length})
                        </button>
                      </div>
                      {uploadsAtivos.length === 0 ? (
                        <p className="text-xs text-gray-500 py-3 italic text-center mt-3">✨ Nenhum upload ainda</p>
                      ) : (
                        uploadsAtivos.map((u) => (
                          <div key={u.id} className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-3 text-xs flex items-center justify-between flex-wrap gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-bold truncate flex items-center gap-2">
                                <span>{isPrint(u) ? '📸' : '📊'}</span>{u.arquivo}
                              </p>
                              <p className="text-gray-500 mt-0.5">{u.tabela} · {u.linhas} linhas</p>
                            </div>
                            <p className="text-gray-500 text-[10px] font-mono">{formatarData(u.data)}</p>
                          </div>
                        ))
                      )}
                    </>
                  );
                })()}
              </div>
            </details>

            {/* Duplicatas */}
            <details className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl mb-4 group">
              <summary className="cursor-pointer p-5 flex items-center justify-between hover:bg-[#1e1e1e] transition-all rounded-xl list-none">
                <span className="text-sm font-bold text-gray-300">🔧 Detectar Duplicatas</span>
                <div className="flex items-center gap-3">
                  {duplicatas.length > 0 && <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2.5 py-1 rounded-full">{duplicatas.length} grupos</span>}
                  <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                </div>
              </summary>
              <div className="px-5 pb-5 pt-2 border-t border-[#2a2a2a]">
                <div className="flex gap-2 mb-3 flex-wrap mt-3">
                  <button onClick={buscarDuplicatas} disabled={buscandoDup} className="bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300 font-bold py-2.5 px-5 rounded-lg text-sm transition-all disabled:opacity-50">
                    {buscandoDup ? '⏳ Verificando...' : '🔍 Verificar agora'}
                  </button>
                  {duplicatas.length > 0 && (
                    <button onClick={limparDuplicatas} disabled={limpandoDup} className="bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 font-bold py-2.5 px-5 rounded-lg text-sm transition-all disabled:opacity-50">
                      {limpandoDup ? '⏳ Limpando...' : `🗑️ Apagar ${duplicatas.length}`}
                    </button>
                  )}
                </div>
              </div>
            </details>

            {/* Zona perigo */}
            <div className="bg-gradient-to-br from-red-500/5 to-red-700/5 border border-red-500/30 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center text-2xl">🚨</div>
                <div>
                  <h2 className="text-xl font-bold text-red-300">Zona de Perigo</h2>
                  <p className="text-xs text-red-300/60">Resetar TUDO</p>
                </div>
              </div>
              <div className="bg-[#0a0a0a] border border-red-500/20 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-3">Digite <code className="bg-red-500/20 text-red-300 px-2 py-0.5 rounded font-bold">APAGAR TUDO</code>:</p>
                <input type="text" value={confirmarApagarTudo} onChange={(e) => setConfirmarApagarTudo(e.target.value)} placeholder="APAGAR TUDO" className="w-full bg-[#0a0a0a] border border-red-500/30 rounded-xl px-4 py-3 text-white mb-3 font-mono outline-none" />
                <button onClick={apagarTudo} disabled={confirmarApagarTudo !== 'APAGAR TUDO' || apagandoTudo} className="w-full bg-gradient-to-br from-red-600 to-red-700 text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-30">
                  {apagandoTudo ? '⏳ Apagando...' : '🔥 Resetar Banco'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusCard({ icone, valor, label, cor, corBorda }: { icone: string; valor: string | number; label: string; cor: string; corBorda: string }) {
  return (
    <div className={`bg-gradient-to-br ${cor} ${corBorda} border rounded-2xl p-4 transition-all hover:-translate-y-0.5`}>
      <div className="text-2xl mb-2">{icone}</div>
      <div className="text-2xl font-black text-white">{typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}
