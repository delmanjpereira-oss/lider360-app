'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';
import { useToast } from '../components/ToastProvider';

type StatusBanco = {
  totalRegistros: number;
  tamanhoMB: number;
  ultimoUpload?: string;
  totalColabs: number;
  totalIMAs: number;
  totalDPMOs: number;
  totalSemanas: number;
};

const MESES = [
  { num: 1, label: 'Janeiro' }, { num: 2, label: 'Fevereiro' },
  { num: 3, label: 'Março' }, { num: 4, label: 'Abril' },
  { num: 5, label: 'Maio' }, { num: 6, label: 'Junho' },
  { num: 7, label: 'Julho' }, { num: 8, label: 'Agosto' },
  { num: 9, label: 'Setembro' }, { num: 10, label: 'Outubro' },
  { num: 11, label: 'Novembro' }, { num: 12, label: 'Dezembro' },
];

export default function ConfiguracoesPage() {
  const toast = useToast();
  const [status, setStatus] = useState<StatusBanco>({
    totalRegistros: 0,
    tamanhoMB: 0,
    totalColabs: 0,
    totalIMAs: 0,
    totalDPMOs: 0,
    totalSemanas: 0,
  });
  const [loading, setLoading] = useState(true);
  const [mostrarAvancado, setMostrarAvancado] = useState(false);
  
  // Limpeza por mês
  const [mesLimpeza, setMesLimpeza] = useState(5);
  const [anoLimpeza, setAnoLimpeza] = useState(2026);
  const [processoLimpeza, setProcessoLimpeza] = useState<'Checkin' | 'P2M' | 'Ambos'>('Ambos');
  const [limpandoMes, setLimpandoMes] = useState(false);
  
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
      ] = await Promise.all([
        supabase.from('colaboradores').select('id', { count: 'exact', head: true }),
        supabase.from('ima_manual').select('id', { count: 'exact', head: true }),
        supabase.from('dpmo_agregado').select('id', { count: 'exact', head: true }),
      ]);

      const { data: semanas } = await supabase
        .from('dpmo_agregado')
        .select('semana, ano')
        .limit(5000);

      const semanasUnicas = new Set<string>();
      (semanas || []).forEach((s: any) => semanasUnicas.add(`${s.ano}-${s.semana}`));

      const totalReg = (colabs || 0) + (imas || 0) + (dpmos || 0);
      const tamMB = (totalReg * 250) / (1024 * 1024);

      setStatus({
        totalRegistros: totalReg,
        tamanhoMB: tamMB,
        totalColabs: colabs || 0,
        totalIMAs: imas || 0,
        totalDPMOs: dpmos || 0,
        totalSemanas: semanasUnicas.size,
      });
    } catch (e: any) {
      toast.error('Erro ao carregar status', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function limparMes() {
    if (!confirm(`Apagar dados de ${MESES[mesLimpeza - 1].label}/${anoLimpeza}?`)) return;
    
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

  async function apagarTudo() {
    if (confirmarApagarTudo !== 'APAGAR TUDO') return;
    
    setApagandoTudo(true);
    const loadingId = toast.loading('Apagando todos os dados...', 'Isso pode levar alguns segundos');
    
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
        title: 'Tudo apagado',
        description: 'Banco resetado. Colaboradores e config mantidos.',
      });
      setConfirmarApagarTudo('');
      carregar();
    } catch (e: any) {
      toast.update(loadingId, { type: 'error', title: 'Erro', description: e.message });
    } finally {
      setApagandoTudo(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link href="/configuracoes" className="text-yellow-400 hover:underline text-sm">← Voltar</Link>
          <h1 className="text-4xl font-black mt-3 mb-2">
            ⚙️ <span className="text-[#FFD700]">Banco de Dados</span>
          </h1>
        </div>

        {/* 📊 STATUS - Cards bonitos */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatusCard
            icone="👥"
            valor={loading ? '...' : status.totalColabs}
            label="Colaboradores"
            cor="from-cyan-500/20 to-cyan-600/5"
            corBorda="border-cyan-500/30"
          />
          <StatusCard
            icone="🎯"
            valor={loading ? '...' : status.totalIMAs}
            label="IMAs Salvos"
            cor="from-yellow-500/20 to-yellow-600/5"
            corBorda="border-yellow-500/30"
          />
          <StatusCard
            icone="📊"
            valor={loading ? '...' : status.totalDPMOs}
            label="DPMOs Semanais"
            cor="from-purple-500/20 to-purple-600/5"
            corBorda="border-purple-500/30"
          />
          <StatusCard
            icone="📅"
            valor={loading ? '...' : status.totalSemanas}
            label="Semanas com Dados"
            cor="from-emerald-500/20 to-emerald-600/5"
            corBorda="border-emerald-500/30"
          />
        </div>

        {/* 🧹 LIMPAR POR MÊS - Seção Principal */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center text-2xl">
              🧹
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Limpar Dados por Mês</h2>
              <p className="text-xs text-gray-500">Remove IMAs + DPMOs de um período específico</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Mês</label>
              <select
                value={mesLimpeza}
                onChange={(e) => setMesLimpeza(Number(e.target.value))}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white hover:border-[#3a3a3a] focus:border-yellow-500/50 transition-all outline-none"
              >
                {MESES.map((m) => <option key={m.num} value={m.num}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Ano</label>
              <select
                value={anoLimpeza}
                onChange={(e) => setAnoLimpeza(Number(e.target.value))}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white hover:border-[#3a3a3a] focus:border-yellow-500/50 transition-all outline-none"
              >
                {[2024, 2025, 2026, 2027].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Processo</label>
              <select
                value={processoLimpeza}
                onChange={(e) => setProcessoLimpeza(e.target.value as any)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white hover:border-[#3a3a3a] focus:border-yellow-500/50 transition-all outline-none"
              >
                <option value="Ambos">Ambos</option>
                <option value="Checkin">Checkin</option>
                <option value="P2M">P2M</option>
              </select>
            </div>
          </div>

          <button
            onClick={limparMes}
            disabled={limpandoMes}
            className="w-full bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-50 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-orange-500/30 active:translate-y-0 flex items-center justify-center gap-2"
          >
            {limpandoMes ? (
              <><span className="inline-block animate-spin">⏳</span> Apagando...</>
            ) : (
              <>🗑️ Apagar {MESES[mesLimpeza - 1].label}/{anoLimpeza}</>
            )}
          </button>
        </div>

        {/* ⚙️ AVANÇADO - Collapse */}
        <button
          onClick={() => setMostrarAvancado(!mostrarAvancado)}
          className="w-full bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] rounded-xl p-4 mb-6 flex items-center justify-between transition-all"
        >
          <span className="text-sm font-bold text-gray-300 flex items-center gap-2">
            ⚙️ Opções avançadas
          </span>
          <span className={`text-gray-400 transition-transform ${mostrarAvancado ? 'rotate-180' : ''}`}>▼</span>
        </button>

        {mostrarAvancado && (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 mb-6 space-y-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Tamanho estimado</p>
              <p className="text-2xl font-black text-white">{status.tamanhoMB.toFixed(2)} <span className="text-sm text-gray-500 font-normal">MB</span></p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Total de registros</p>
              <p className="text-2xl font-black text-white">{status.totalRegistros.toLocaleString('pt-BR')}</p>
            </div>
            <p className="text-xs text-gray-500 pt-3 border-t border-[#2a2a2a]">
              Dica: o Supabase Free aceita até 500 MB. Você está usando {((status.tamanhoMB / 500) * 100).toFixed(1)}%.
            </p>
          </div>
        )}

        {/* 🚨 ZONA DE PERIGO */}
        <div className="bg-gradient-to-br from-red-500/5 to-red-700/5 border border-red-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center text-2xl">
              🚨
            </div>
            <div>
              <h2 className="text-xl font-bold text-red-300">Zona de Perigo</h2>
              <p className="text-xs text-red-300/60">Resetar TUDO (preserva apenas colaboradores)</p>
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
            <button
              onClick={apagarTudo}
              disabled={confirmarApagarTudo !== 'APAGAR TUDO' || apagandoTudo}
              className="w-full bg-gradient-to-br from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
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
