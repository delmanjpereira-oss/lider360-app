'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabase';

type TempoCalculado = {
  tempo_efetivo: string;
  tempo_ocioso: string;
  tempo_nao_sistemico: string;
  tempo_nao_disponivel: string;
  pct_efetivo: number;
  pct_ocioso: number;
  pct_nao_sistemico: number;
  pct_nao_disponivel: number;
  unidades_total: number;
  net_geral_real: number;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  tempos: TempoCalculado;
};

function formatarTempoHHMM(t: string): string {
  if (!t) return '--:--';
  const partes = t.split(':');
  if (partes.length < 2) return t;
  return `${partes[0]}h ${partes[1]}min`;
}

export default function RegistrarTurnoModal({ isOpen, onClose, tempos }: Props) {
  const [dataRef, setDataRef] = useState(() => new Date().toISOString().split('T')[0]);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  if (!isOpen) return null;

  async function salvar() {
    setSalvando(true);

    try {
      const { error } = await supabase
        .from('net_turno_diario')
        .upsert(
          {
            data_referencia: dataRef,
            tempo_efetivo: tempos.tempo_efetivo,
            tempo_ocioso: tempos.tempo_ocioso,
            tempo_nao_sistemico: tempos.tempo_nao_sistemico,
            tempo_nao_disponivel: tempos.tempo_nao_disponivel,
            pct_efetivo: tempos.pct_efetivo,
            pct_ocioso: tempos.pct_ocioso,
            pct_nao_sistemico: tempos.pct_nao_sistemico,
            pct_nao_disponivel: tempos.pct_nao_disponivel,
            unidades_total: tempos.unidades_total,
            net_geral_real: tempos.net_geral_real,
            observacao: observacao || null,
            registrado_em: new Date().toISOString(),
          },
          { onConflict: 'data_referencia' }
        );

      if (error) {
        console.error('❌ Erro ao registrar:', error);
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast('error', `Erro: ${error.message}`);
        } else {
          alert(`Erro ao registrar: ${error.message}`);
        }
      } else {
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast('success', `✅ Turno do dia ${dataRef} registrado!`);
        }
        setTimeout(onClose, 800);
      }
    } catch (e: any) {
      console.error('Exceção:', e);
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('error', e.message || 'Erro desconhecido');
      }
    } finally {
      setSalvando(false);
      setConfirmando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9500] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      style={{ animation: 'fadeIn 0.2s ease' }}
    >
      <div
        className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-[#FFD700]/30 rounded-3xl max-w-2xl w-full p-8 shadow-2xl shadow-[#FFD700]/10"
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: 'modalIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#2a2a2a]">
          <div>
            <h2 className="text-2xl font-black text-white flex items-center gap-3">
              <span className="text-3xl">📥</span>
              Registrar Fim de Turno
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Salva os 4 tempos do CT + NET geral real
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-2xl w-10 h-10 rounded-full hover:bg-[#2a2a2a] transition-all flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Data */}
        <div className="mb-6">
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            📅 Data do turno
          </label>
          <input
            type="date"
            value={dataRef}
            onChange={(e) => setDataRef(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] hover:border-[#3a3a3a] focus:border-[#FFD700] rounded-xl px-4 py-3 text-white text-lg font-bold transition-all outline-none"
          />
        </div>

        {/* Os 4 tempos - cards bonitos */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <TempoCard
            icone="🟢"
            label="Tempo Efetivo"
            tempo={formatarTempoHHMM(tempos.tempo_efetivo)}
            pct={tempos.pct_efetivo}
            cor="green"
          />
          <TempoCard
            icone="🟠"
            label="Ociosidade Total"
            tempo={formatarTempoHHMM(tempos.tempo_ocioso)}
            pct={tempos.pct_ocioso}
            cor="amber"
          />
          <TempoCard
            icone="🔵"
            label="Não Sistêmico/Medido"
            tempo={formatarTempoHHMM(tempos.tempo_nao_sistemico)}
            pct={tempos.pct_nao_sistemico}
            cor="blue"
          />
          <TempoCard
            icone="🔴"
            label="Não Disponível"
            tempo={formatarTempoHHMM(tempos.tempo_nao_disponivel)}
            pct={tempos.pct_nao_disponivel}
            cor="red"
          />
        </div>

        {/* NET Geral Real - destaque */}
        <div className="bg-gradient-to-br from-[#FFD700]/10 to-yellow-600/5 border border-[#FFD700]/30 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs text-yellow-300/70 uppercase tracking-wider mb-1 font-bold">
                ⭐ NET Geral Real
              </p>
              <p className="text-4xl font-black text-[#FFD700]">
                {tempos.net_geral_real.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                <span className="text-base text-gray-400 ml-2">pç/h</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1 font-bold">Unidades Totais</p>
              <p className="text-2xl font-bold text-white font-mono">
                {tempos.unidades_total.toLocaleString('pt-BR')}
              </p>
            </div>
          </div>
        </div>

        {/* Observação opcional */}
        <div className="mb-6">
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            📝 Observação <span className="text-gray-600 normal-case font-normal">(opcional)</span>
          </label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex: Pico de volume, manutenção sistema, etc."
            rows={2}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] hover:border-[#3a3a3a] focus:border-[#FFD700] rounded-xl px-4 py-3 text-white text-sm transition-all outline-none resize-none"
          />
        </div>

        {/* Botões / Confirmação */}
        {!confirmando ? (
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={onClose}
              className="flex-1 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white font-bold py-3 px-6 rounded-xl transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={() => setConfirmando(true)}
              className="flex-1 bg-gradient-to-br from-[#FFD700] to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 text-black font-black py-3 px-6 rounded-xl transition-all shadow-lg shadow-yellow-500/30 hover:shadow-xl hover:shadow-yellow-500/40 hover:-translate-y-0.5"
            >
              📥 Registrar Turno
            </button>
          </div>
        ) : (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-5">
            <p className="text-sm text-yellow-300 font-bold mb-3 flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              Confirmar registro?
            </p>
            <p className="text-xs text-gray-300 mb-4">
              Vai salvar os 4 tempos + NET geral pra <strong className="text-yellow-300">{new Date(dataRef + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>.
              <br />
              Se já existir registro pra essa data, será sobrescrito.
            </p>
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => setConfirmando(false)}
                disabled={salvando}
                className="flex-1 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-50"
              >
                ← Voltar
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="flex-1 bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black py-3 px-6 rounded-xl transition-all shadow-lg shadow-green-500/30 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {salvando ? (
                  <>
                    <span className="animate-spin">⏳</span> Salvando...
                  </>
                ) : (
                  <>✅ Sim, registrar</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.9) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function TempoCard({ icone, label, tempo, pct, cor }: { icone: string; label: string; tempo: string; pct: number; cor: string }) {
  const cores: Record<string, { bg: string; border: string; text: string; accent: string }> = {
    green: { bg: 'from-green-500/10 to-emerald-700/5', border: 'border-green-500/30', text: 'text-green-300', accent: 'text-green-400' },
    amber: { bg: 'from-amber-500/10 to-orange-700/5', border: 'border-amber-500/30', text: 'text-amber-300', accent: 'text-amber-400' },
    blue: { bg: 'from-blue-500/10 to-cyan-700/5', border: 'border-blue-500/30', text: 'text-blue-300', accent: 'text-blue-400' },
    red: { bg: 'from-red-500/10 to-rose-700/5', border: 'border-red-500/30', text: 'text-red-300', accent: 'text-red-400' },
  };
  const c = cores[cor] || cores.green;

  return (
    <div className={`bg-gradient-to-br ${c.bg} border ${c.border} rounded-xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icone}</span>
        <p className={`text-[10px] ${c.text} uppercase tracking-wider font-bold`}>{label}</p>
      </div>
      <p className={`text-2xl font-black ${c.accent} font-mono`}>
        {pct.toFixed(1)}<span className="text-xs">%</span>
      </p>
      <p className="text-xs text-gray-400 mt-1 font-mono">{tempo}</p>
    </div>
  );
}
