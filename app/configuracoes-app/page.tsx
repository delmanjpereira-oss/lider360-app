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
  const [status, setStatus] = useState<StatusBanco>({
    totalRegistros: 0,
    tamanhoMB: 0,
    totalColabs: 0,
    totalIMAs: 0,
    totalDPMOs: 0,
    totalSemanas: 0,
    totalHistorico: 0,
    totalOcupacao: 0,
    totalFeedbacks: 0,
  });
  const [uploads, setUploads] = useState<UploadHistorico[]>([]);
  const [duplicatas, setDuplicatas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Sections collapse
  const [mostrarUploads, setMostrarUploads] = useState(false);
  const [mostrarDuplicatas, setMostrarDuplicatas] = useState(false);
  const [mostrarAvancado, setMostrarAvancado] = useState(false);
  
  // Limpeza por mês
  const [mesLimpeza, setMesLimpeza] = useState(5);
  const [anoLimpeza, setAnoLimpeza] = useState(2026);
  const [processoLimpeza, setProcessoLimpeza] = useState<'Checkin' | 'P2M' | 'Ambos'>('Ambos');
  const [limpandoMes, setLimpandoMes] = useState(false);
  
  // Limpar histórico/produtividade
  const [limpandoHist, setLimpandoHist] = useState(false);
  
  // Duplicatas
  const [buscandoDup, setBuscandoDup] = useState(false);
  const [limpandoDup, setLimpandoDup] = useState(false);
  
  // Zona perigosa
  const [confirmarApagarTudo, setConfirmarApagarTudo] = useState('');
  const [apagandoTudo, setApagandoTudo] = useState(false);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
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
      
      // Carrega uploads
      console.log('🔍 Buscando uploads do banco...');
      const { data: uploadsData, error: uploadsError } = await supabase
        .from('uploads')
        .select('*')
        .order('data', { ascending: false })
        .limit(15);
      
      if (uploadsError) {
        console.error('❌ ERRO ao carregar uploads:', uploadsError);
        console.error('   Code:', uploadsError.code);
        console.error('   Message:', uploadsError.message);
        
        // Tenta sem ordenar por 'data' (caso a coluna seja diferente)
        console.log('🔄 Tentando sem order...');
        const { data: uploadsSimples, error: erro2 } = await supabase
          .from('uploads')
          .select('*')
          .limit(15);
        if (erro2) {
          console.error('❌ Tentativa simples também falhou:', erro2);
        } else if (uploadsSimples) {
          console.log(`✅ Carregou ${uploadsSimples.length} uploads sem order:`, uploadsSimples);
          setUploads(uploadsSimples as UploadHistorico[]);
        }
      } else if (uploadsData) {
        console.log(`✅ Carregou ${uploadsData.length} uploads do banco:`, uploadsData);
        setUploads(uploadsData as UploadHistorico[]);
      }
    } catch (e: any) {
      toast.error('Erro ao carregar', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function limparMes() {
    if (!confirm(`Apagar dados de IMA + DPMO de ${MESES[mesLimpeza - 1].label}/${anoLimpeza}?`)) return;
    
    setLimpandoMes(true);
    const loadingId = toast.loading('Apagando dados...', `${MESES[mesLimpeza - 1].label}/${anoLimpeza}`);
    
    try {
      let totalIma = 0;
      let totalDpmo = 0;
      
      const procsIma = processoLimpeza === 'Ambos' ? ['Checkin', 'P2M'] : [processoLimpeza];
      for (const proc of procsIma) {
        const { count } = await supabase
          .from('ima_manual')
          .delete({ count: 'exact' })
          .eq('mes', mesLimpeza)
          .eq('ano', anoLimpeza)
          .eq('processo', proc);
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
        const { count } = await supabase
          .from('dpmo_agregado')
          .delete({ count: 'exact' })
          .in('semana', semanasMes)
          .eq('ano', anoLimpeza)
          .eq('processo', proc);
        totalDpmo += count || 0;
      }
      
      toast.update(loadingId, {
        type: 'success',
        title: 'Limpeza concluída',
        description: `${totalIma} IMAs + ${totalDpmo} DPMOs apagados`,
      });
      carregar();
    } catch (e: any) {
      toast.update(loadingId, { type: 'error', title: 'Erro ao limpar', description: e.message });
    } finally {
      setLimpandoMes(false);
    }
  }

  async function limparHistoricoProdutividade() {
    if (!confirm('Apagar TODO o histórico de produtividade diária + ocupação? Os IMAs salvos via print continuam intactos.')) return;
    
    setLimpandoHist(true);
    const loadingId = toast.loading('Apagando histórico...', 'Produtividade + Ocupação');
    
    try {
      const { count: histCount } = await supabase.from('historico').delete({ count: 'exact' }).gt('id', 0);
      const { count: ocupCount } = await supabase.from('ocupacao_p2m').delete({ count: 'exact' }).gt('id', 0);
      const { count: prodCount } = await supabase.from('produtividade_mensal').delete({ count: 'exact' }).gt('id', 0);
      
      toast.update(loadingId, {
        type: 'success',
        title: 'Histórico apagado',
        description: `${(histCount || 0) + (ocupCount || 0) + (prodCount || 0)} registros removidos`,
      });
      carregar();
    } catch (e: any) {
      toast.update(loadingId, { type: 'error', title: 'Erro', description: e.message });
    } finally {
      setLimpandoHist(false);
    }
  }

  async function buscarDuplicatas() {
    setBuscandoDup(true);
    const loadingId = toast.loading('Buscando duplicatas...', 'Verificando histórico de produtividade');
    
    try {
      // Paginação manual pra pegar TODOS (Supabase limita 1000)
      const todos: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      
      while (true) {
        const { data, error } = await supabase
          .from('historico')
          .select('id_groot, data_referencia, processo, unidades, criado_em')
          .range(offset, offset + pageSize - 1)
          .order('criado_em', { ascending: false });
        
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;
        
        todos.push(...data);
        if (data.length < pageSize) break;
        offset += pageSize;
      }
      
      console.log(`🔍 Verificando ${todos.length} registros do histórico`);
      
      if (todos.length === 0) {
        toast.update(loadingId, { 
          type: 'info', 
          title: 'Histórico vazio', 
          description: 'Não há registros para verificar' 
        });
        setDuplicatas([]);
        return;
      }
      
      const grupos: Record<string, any[]> = {};
      todos.forEach((r: any) => {
        const k = `${r.id_groot}|${r.data_referencia}|${r.processo}`;
        if (!grupos[k]) grupos[k] = [];
        grupos[k].push(r);
      });
      
      const dups = Object.entries(grupos)
        .filter(([_, v]) => v.length > 1)
        .map(([k, v]) => ({ chave: k, registros: v }));
      
      setDuplicatas(dups);
      
      // 🎯 Feedback CLARO em qualquer cenário
      if (dups.length === 0) {
        toast.update(loadingId, { 
          type: 'success', 
          title: '✨ Banco limpo!', 
          description: `${todos.length} registros verificados, nenhuma duplicata encontrada` 
        });
      } else {
        const totalCopias = dups.reduce((s, d) => s + d.registros.length - 1, 0);
        toast.update(loadingId, { 
          type: 'info', 
          title: `${dups.length} duplicatas encontradas`, 
          description: `${totalCopias} cópias extras podem ser removidas` 
        });
      }
    } catch (e: any) {
      console.error('Erro buscando duplicatas:', e);
      toast.update(loadingId, { 
        type: 'error', 
        title: 'Erro ao buscar', 
        description: e.message 
      });
    } finally {
      setBuscandoDup(false);
    }
  }

  async function limparDuplicatas() {
    if (!confirm(`Apagar duplicatas (mantém apenas o registro mais recente de cada grupo)?`)) return;
    
    setLimpandoDup(true);
    const loadingId = toast.loading('Removendo duplicatas...');
    
    try {
      let apagados = 0;
      for (const dup of duplicatas) {
        const ordenados = [...dup.registros].sort((a: any, b: any) => 
          new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
        );
        const manter = ordenados[0];
        const apagar = ordenados.slice(1);
        
        for (const r of apagar) {
          await supabase
            .from('historico')
            .delete()
            .eq('id_groot', r.id_groot)
            .eq('data_referencia', r.data_referencia)
            .eq('processo', r.processo)
            .neq('criado_em', manter.criado_em);
          apagados++;
        }
      }
      
      toast.update(loadingId, { type: 'success', title: 'Duplicatas removidas', description: `${apagados} registros apagados` });
      setDuplicatas([]);
      carregar();
    } catch (e: any) {
      toast.update(loadingId, { type: 'error', title: 'Erro', description: e.message });
    } finally {
      setLimpandoDup(false);
    }
  }

  async function apagarTudo() {
    if (confirmarApagarTudo !== 'APAGAR TUDO') return;
    
    setApagandoTudo(true);
    const loadingId = toast.loading('Apagando todos os dados...', 'Pode levar alguns segundos');
    
    try {
      await supabase.from('ima_manual').delete().gt('id', 0);
      await supabase.from('dpmo_agregado').delete().gt('id', 0);
      await supabase.from('dpmo_eventos').delete().gt('id', 0);
      await supabase.from('historico').delete().gt('id', 0);
      await supabase.from('produtividade_mensal').delete().gt('id', 0);
      await supabase.from('ocupacao_p2m').delete().gt('id', 0);
      await supabase.from('uploads').delete().gt('id', 0);
      
      toast.update(loadingId, {
        type: 'success',
        title: 'Banco resetado',
        description: 'Colaboradores e configurações preservados',
      });
      setConfirmarApagarTudo('');
      carregar();
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

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link href="/" className="text-yellow-400 hover:underline text-sm">← Voltar ao início</Link>
          <h1 className="text-4xl font-black mt-3 mb-2">
            ⚙️ <span className="text-[#FFD700]">Banco de Dados</span>
          </h1>
        </div>

        {/* 📊 STATUS - Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatusCard icone="👥" valor={loading ? '...' : status.totalColabs} label="Colaboradores" cor="from-cyan-500/20 to-cyan-600/5" corBorda="border-cyan-500/30" />
          <StatusCard icone="🎯" valor={loading ? '...' : status.totalIMAs} label="IMAs Salvos" cor="from-yellow-500/20 to-yellow-600/5" corBorda="border-yellow-500/30" />
          <StatusCard icone="📊" valor={loading ? '...' : status.totalDPMOs} label="DPMOs Semanais" cor="from-purple-500/20 to-purple-600/5" corBorda="border-purple-500/30" />
          <StatusCard icone="📅" valor={loading ? '...' : status.totalSemanas} label="Semanas c/ Dados" cor="from-emerald-500/20 to-emerald-600/5" corBorda="border-emerald-500/30" />
        </div>

        {/* 🧹 LIMPAR POR MÊS - Seção Principal */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-4 shadow-2xl">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center text-2xl">🧹</div>
            <div>
              <h2 className="text-xl font-bold text-white">Limpar Dados por Mês</h2>
              <p className="text-xs text-gray-500">Remove IMAs + DPMOs de um período específico</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Mês</label>
              <select value={mesLimpeza} onChange={(e) => setMesLimpeza(Number(e.target.value))}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white hover:border-[#3a3a3a] focus:border-yellow-500/50 transition-all outline-none">
                {MESES.map((m) => <option key={m.num} value={m.num}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Ano</label>
              <select value={anoLimpeza} onChange={(e) => setAnoLimpeza(Number(e.target.value))}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white hover:border-[#3a3a3a] focus:border-yellow-500/50 transition-all outline-none">
                {[2024, 2025, 2026, 2027].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Processo</label>
              <select value={processoLimpeza} onChange={(e) => setProcessoLimpeza(e.target.value as any)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white hover:border-[#3a3a3a] focus:border-yellow-500/50 transition-all outline-none">
                <option value="Ambos">Ambos</option>
                <option value="Checkin">Checkin</option>
                <option value="P2M">P2M</option>
              </select>
            </div>
          </div>

          <button onClick={limparMes} disabled={limpandoMes}
            className="w-full bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-50 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-orange-500/30 active:translate-y-0 flex items-center justify-center gap-2">
            {limpandoMes ? <><span className="inline-block animate-spin">⏳</span> Apagando...</> : `🗑️ Apagar ${MESES[mesLimpeza - 1].label}/${anoLimpeza}`}
          </button>
        </div>

        {/* 🗑️ LIMPAR DADOS BRUTOS (produtividade diária + ocupação) */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center text-2xl">📊</div>
            <div>
              <h2 className="text-lg font-bold text-white">Limpar Dados Brutos</h2>
              <p className="text-xs text-gray-500">
                {status.totalHistorico.toLocaleString('pt-BR')} registros de produtividade diária + ocupação P2M
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-3 leading-relaxed">
            Remove dados diários (vindos dos CSVs antigos). Os IMAs salvos via print continuam intactos.
          </p>
          <button onClick={limparHistoricoProdutividade} disabled={limpandoHist}
            className="bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold py-2.5 px-5 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2">
            {limpandoHist ? <><span className="inline-block animate-spin">⏳</span> Apagando...</> : '🗑️ Apagar produtividade + ocupação'}
          </button>
        </div>

        {/* 📥 Histórico de Uploads - Collapse */}
        <details className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl mb-4 group">
          <summary className="cursor-pointer p-5 flex items-center justify-between hover:bg-[#1e1e1e] transition-all rounded-xl list-none">
            <span className="text-sm font-bold text-gray-300 flex items-center gap-2">
              📋 Histórico de Envios (CSVs e Prints)
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs bg-[#0a0a0a] text-gray-400 px-2.5 py-1 rounded-full">{uploads.length}</span>
              <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
            </div>
          </summary>
          <div className="px-5 pb-5 pt-2 space-y-2 border-t border-[#2a2a2a]">
            <p className="text-xs text-gray-500 italic mt-2 mb-3">
              Registro dos últimos uploads (arquivos CSV e prints OCR processados)
            </p>
            {uploads.length === 0 ? (
              <p className="text-xs text-gray-500 py-3 italic text-center">
                ✨ Nenhum upload registrado ainda. Quando você subir um print ou CSV, vai aparecer aqui.
              </p>
            ) : (
              uploads.map((u) => (
                <div key={u.id} className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-3 text-xs flex items-center justify-between flex-wrap gap-3 hover:border-[#3a3a3a] transition-all">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold truncate">{u.arquivo}</p>
                    <p className="text-gray-500 mt-0.5">
                      <span className="text-yellow-500/80">{u.tabela}</span> · {u.linhas} linhas
                    </p>
                  </div>
                  <p className="text-gray-500 text-[10px] font-mono">{formatarData(u.data)}</p>
                </div>
              ))
            )}
          </div>
        </details>

        {/* 🔧 Duplicatas - Collapse */}
        <details className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl mb-4 group">
          <summary className="cursor-pointer p-5 flex items-center justify-between hover:bg-[#1e1e1e] transition-all rounded-xl list-none">
            <span className="text-sm font-bold text-gray-300 flex items-center gap-2">
              🔧 Detectar Duplicatas
            </span>
            <div className="flex items-center gap-3">
              {duplicatas.length > 0 && (
                <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2.5 py-1 rounded-full">{duplicatas.length} grupos</span>
              )}
              <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
            </div>
          </summary>
          <div className="px-5 pb-5 pt-2 border-t border-[#2a2a2a]">
            <p className="text-xs text-gray-400 mb-3 mt-2">
              Verifica registros duplicados no histórico de produtividade (mesmo colab + dia + processo).
            </p>
            <div className="flex gap-2 mb-3 flex-wrap">
              <button onClick={buscarDuplicatas} disabled={buscandoDup}
                className="bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300 font-bold py-2.5 px-5 rounded-lg text-sm transition-all disabled:opacity-50 flex items-center gap-2">
                {buscandoDup ? <><span className="inline-block animate-spin">⏳</span> Verificando...</> : '🔍 Verificar agora'}
              </button>
              {duplicatas.length > 0 && (
                <button onClick={limparDuplicatas} disabled={limpandoDup}
                  className="bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 font-bold py-2.5 px-5 rounded-lg text-sm transition-all disabled:opacity-50 flex items-center gap-2">
                  {limpandoDup ? <><span className="inline-block animate-spin">⏳</span> Limpando...</> : `🗑️ Apagar ${duplicatas.length} duplicatas`}
                </button>
              )}
            </div>
            {duplicatas.length > 0 && (
              <div className="mt-3 space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {duplicatas.slice(0, 15).map((d, i) => (
                  <div key={i} className="text-xs bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 font-mono text-gray-400 flex items-center justify-between">
                    <span className="truncate">{d.chave}</span>
                    <span className="text-yellow-500/80 ml-2 flex-shrink-0">×{d.registros.length}</span>
                  </div>
                ))}
                {duplicatas.length > 15 && (
                  <p className="text-xs text-gray-500 italic pt-2">Mostrando 15 de {duplicatas.length}. O botão remove todas.</p>
                )}
              </div>
            )}
          </div>
        </details>

        {/* ⚙️ AVANÇADO - Collapse */}
        <details className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl mb-6">
          <summary className="cursor-pointer p-4 flex items-center justify-between hover:bg-[#222] transition-all rounded-xl">
            <span className="text-sm font-bold text-gray-300 flex items-center gap-2">📊 Detalhes técnicos</span>
            <span className="text-gray-400">▼</span>
          </summary>
          <div className="px-4 pb-4 grid grid-cols-2 gap-3">
            <DetailItem label="Tamanho estimado" valor={`${status.tamanhoMB.toFixed(2)} MB`} />
            <DetailItem label="Total de registros" valor={status.totalRegistros.toLocaleString('pt-BR')} />
            <DetailItem label="Histórico" valor={status.totalHistorico.toLocaleString('pt-BR')} />
            <DetailItem label="Ocupação P2M" valor={status.totalOcupacao.toLocaleString('pt-BR')} />
            <DetailItem label="Feedbacks" valor={status.totalFeedbacks.toLocaleString('pt-BR')} />
            <DetailItem label="Capacidade Supabase" valor={`${((status.tamanhoMB / 500) * 100).toFixed(1)}% de 500MB`} />
          </div>
        </details>

        {/* 🚨 ZONA DE PERIGO */}
        <div className="bg-gradient-to-br from-red-500/5 to-red-700/5 border border-red-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center text-2xl">🚨</div>
            <div>
              <h2 className="text-xl font-bold text-red-300">Zona de Perigo</h2>
              <p className="text-xs text-red-300/60">Resetar TUDO (preserva apenas colaboradores e config)</p>
            </div>
          </div>

          <div className="bg-[#0a0a0a] border border-red-500/20 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-3">
              Digite <code className="bg-red-500/20 text-red-300 px-2 py-0.5 rounded font-bold">APAGAR TUDO</code> para confirmar:
            </p>
            <input
              type="text"
              value={confirmarApagarTudo}
              onChange={(e) => setConfirmarApagarTudo(e.target.value)}
              placeholder="APAGAR TUDO"
              className="w-full bg-[#0a0a0a] border border-red-500/30 rounded-xl px-4 py-3 text-white mb-3 font-mono outline-none focus:border-red-500"
            />
            <button onClick={apagarTudo} disabled={confirmarApagarTudo !== 'APAGAR TUDO' || apagandoTudo}
              className="w-full bg-gradient-to-br from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {apagandoTudo ? <><span className="inline-block animate-spin">⏳</span> Apagando...</> : '🔥 Resetar Banco'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ icone, valor, label, cor, corBorda }: { icone: string; valor: string | number; label: string; cor: string; corBorda: string }) {
  return (
    <div className={`bg-gradient-to-br ${cor} ${corBorda} border rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-xl`}>
      <div className="text-2xl mb-2">{icone}</div>
      <div className="text-2xl font-black text-white">{typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function DetailItem({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-3">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm font-bold text-white">{valor}</p>
    </div>
  );
}
