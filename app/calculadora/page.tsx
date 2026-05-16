'use client';

import { useState, useRef } from 'react';

type TempoUnico = { h: number; m: number };
type Tempos = {
  ociosidade: TempoUnico;
  efetivo: TempoUnico;
  naoSistemico: TempoUnico;
  naoDisponivel: TempoUnico;
};

const TEMPOS_ZERADOS: Tempos = {
  ociosidade: { h: 0, m: 0 },
  efetivo: { h: 0, m: 0 },
  naoSistemico: { h: 0, m: 0 },
  naoDisponivel: { h: 0, m: 0 },
};

const LABELS: Record<keyof Tempos, string> = {
  ociosidade: 'Ociosidade Total',
  efetivo: 'Tempo Efetivo',
  naoSistemico: 'Tempo não sistêmico',
  naoDisponivel: 'Tempo não disponível',
};

function paraDecimal(h: number, m: number): number {
  return (h || 0) + ((m || 0) / 60);
}

function parseVolume(str: string): number {
  if (!str) return 0;
  const limpo = String(str).replace(/[^\d]/g, '');
  const v = parseInt(limpo, 10);
  return isFinite(v) ? v : 0;
}

export default function CalculadoraNetPage() {
  const [tempos, setTempos] = useState<Tempos>(TEMPOS_ZERADOS);
  const [volumeStr, setVolumeStr] = useState('');
  const [gerandoImagem, setGerandoImagem] = useState(false);

  const areaRef = useRef<HTMLDivElement>(null);

  // Cálculos em tempo real
  const ocio = paraDecimal(tempos.ociosidade.h, tempos.ociosidade.m);
  const efe = paraDecimal(tempos.efetivo.h, tempos.efetivo.m);
  const naoSis = paraDecimal(tempos.naoSistemico.h, tempos.naoSistemico.m);
  const naoDisp = paraDecimal(tempos.naoDisponivel.h, tempos.naoDisponivel.m);
  const totalHoras = ocio + efe + naoSis + naoDisp;
  const volume = parseVolume(volumeStr);
  const net = totalHoras > 0 ? volume / totalHoras : 0;

  const decimaisPorTipo: Record<keyof Tempos, number> = {
    ociosidade: ocio,
    efetivo: efe,
    naoSistemico: naoSis,
    naoDisponivel: naoDisp,
  };

  function atualizar(tipo: keyof Tempos, campo: 'h' | 'm', valor: string) {
    const num = parseInt(valor, 10);
    setTempos((prev) => ({
      ...prev,
      [tipo]: {
        ...prev[tipo],
        [campo]: isNaN(num) ? 0 : Math.max(0, campo === 'm' ? Math.min(59, num) : num),
      },
    }));
  }

  function limpar() {
    setTempos(TEMPOS_ZERADOS);
    setVolumeStr('');
    if (typeof window !== 'undefined' && window.showToast) {
      window.showToast('info', 'Calculadora limpa');
    }
  }

  async function salvarPng() {
    if (!areaRef.current) return;
    setGerandoImagem(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(areaRef.current, {
        scale: 2,
        backgroundColor: '#0a0a0a',
        logging: false,
      });
      const link = document.createElement('a');
      const agora = new Date();
      const ts =
        agora.getFullYear().toString() +
        (agora.getMonth() + 1).toString().padStart(2, '0') +
        agora.getDate().toString().padStart(2, '0') +
        '-' +
        agora.getHours().toString().padStart(2, '0') +
        agora.getMinutes().toString().padStart(2, '0');
      link.download = `calculadora-net-${ts}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      if (typeof window !== 'undefined' && window.showToast) {
        window.showToast('success', 'PNG baixado!');
      }
    } catch (e) {
      if (typeof window !== 'undefined' && window.showToast) {
        window.showToast('error', 'Erro ao gerar PNG');
      }
    } finally {
      setGerandoImagem(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black mb-2">
          🧮 Calculadora <span className="text-[#FFD700]">NET</span>
        </h1>
        <p className="text-gray-400">
          Calcule a NET com base no volume produzido e no total de horas do período
        </p>
      </div>

      {/* Grid de 2 colunas: esquerda inputs + direita resultado */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ESQUERDA — Inputs */}
        <div className="lg:col-span-2 space-y-4" ref={areaRef}>
          {/* Card de Tempos */}
          <div
            className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl overflow-hidden"
            style={{ boxShadow: '0 10px 30px -5px rgba(0,0,0,0.5)' }}
          >
            {/* Header do card */}
            <div className="bg-[#0a0a0a] px-5 py-4 flex items-center justify-between border-b border-[#2a2a2a]">
              <div className="flex items-center gap-2">
                <span className="text-xl">🕐</span>
                <h2 className="text-lg font-bold text-white">Tempos do período</h2>
              </div>
              <div className="flex items-center gap-1.5 bg-green-500/10 text-green-300 text-xs px-3 py-1.5 rounded-full border border-green-500/30 font-bold">
                ⚡ Cálculo instantâneo
              </div>
            </div>

            {/* Tabela de tempos */}
            <div className="p-5">
              {/* Header das colunas */}
              <div className="grid grid-cols-12 gap-3 mb-3 pb-2 border-b border-[#2a2a2a] text-xs font-bold text-gray-500 uppercase">
                <div className="col-span-5">TEMPOS</div>
                <div className="col-span-2 text-center">HORA</div>
                <div className="col-span-2 text-center">MINUTO</div>
                <div className="col-span-3 text-center">HORA DECIMAL</div>
              </div>

              {/* Linhas */}
              {(Object.keys(LABELS) as (keyof Tempos)[]).map((tipo) => (
                <div
                  key={tipo}
                  className="grid grid-cols-12 gap-3 items-center py-3 border-b border-[#2a2a2a] last:border-0"
                >
                  <div className="col-span-5 text-white font-bold text-sm">
                    {LABELS[tipo]}
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={tempos[tipo].h || ''}
                      onChange={(e) => atualizar(tipo, 'h', e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-center font-mono focus:border-[#FFD700] outline-none transition-colors"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="0"
                      max="59"
                      placeholder="0"
                      value={tempos[tipo].m || ''}
                      onChange={(e) => atualizar(tipo, 'm', e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-center font-mono focus:border-[#FFD700] outline-none transition-colors"
                    />
                  </div>
                  <div className="col-span-3 text-center text-lg font-bold font-mono text-[#FFD700]">
                    {decimaisPorTipo[tipo].toFixed(1).replace('.', ',')}
                  </div>
                </div>
              ))}

              {/* Total */}
              <div className="mt-4 pt-4 border-t-2 border-[#FFD700]/20 flex items-center justify-between bg-[#FFD700]/5 -mx-5 px-5 py-3">
                <span className="text-white font-black text-base">TOTAL</span>
                <span className="text-[#FFD700] font-black text-2xl font-mono">
                  {totalHoras.toFixed(1).replace('.', ',')} horas
                </span>
              </div>
            </div>
          </div>

          {/* Card de Volume */}
          <div
            className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl overflow-hidden"
            style={{ boxShadow: '0 10px 30px -5px rgba(0,0,0,0.5)' }}
          >
            <div className="flex items-center gap-4 p-5">
              <div className="bg-[#0a0a0a] text-white font-black px-5 py-3 rounded-xl text-sm uppercase tracking-wide border border-[#2a2a2a] flex items-center gap-2">
                <span>📦</span>
                VOLUME PRODUZIDO
              </div>
              <input
                type="text"
                value={volumeStr}
                onChange={(e) => setVolumeStr(e.target.value)}
                placeholder="Ex: 35299 ou 35.299"
                className="flex-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white text-lg font-mono text-center focus:border-[#FFD700] outline-none transition-colors"
              />
            </div>
          </div>

          {/* Botões */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={salvarPng}
              disabled={gerandoImagem}
              className="bg-gradient-to-br from-[#FFD700] to-yellow-500 text-black font-bold px-6 py-3 rounded-xl hover:from-yellow-300 hover:to-yellow-400 transition-all shadow-lg shadow-yellow-500/30 hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2 disabled:opacity-50"
            >
              <span>🖼️</span>
              {gerandoImagem ? 'Gerando...' : 'Salvar PNG'}
            </button>
            <button
              onClick={limpar}
              className="bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] text-white font-bold px-6 py-3 rounded-xl hover:from-[#3a3a3a] transition-all border border-[#3a3a3a] hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2"
            >
              <span>🔄</span> Limpar
            </button>
          </div>
        </div>

        {/* DIREITA — Resultado */}
        <div className="lg:col-span-1">
          <div
            className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-[#2a2a2a] rounded-2xl p-5 sticky top-24"
            style={{ boxShadow: '0 20px 50px -10px rgba(0,0,0,0.6)' }}
          >
            {/* Badge */}
            <div className="flex justify-center mb-5">
              <div className="bg-gradient-to-r from-[#FFD700] to-yellow-500 text-black text-xs font-black px-4 py-2 rounded-full flex items-center gap-2 shadow-lg shadow-yellow-500/30">
                🚀 RESULTADO INSTANTÂNEO
              </div>
            </div>

            {/* NET principal */}
            <div className="bg-white rounded-2xl p-6 mb-4 flex items-center justify-between gap-3 shadow-inner">
              <div className="bg-[#0a0a0a] rounded-xl px-4 py-3 flex-shrink-0">
                <span className="text-green-400 font-black text-xl">NET</span>
              </div>
              <div className="text-right">
                <p className="text-5xl font-black text-black font-mono leading-none">
                  {Math.round(net).toLocaleString('pt-BR')}
                </p>
              </div>
            </div>

            {/* Total de horas */}
            <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4 mb-3">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">
                Total de horas
              </p>
              <p className="text-3xl font-black text-white">
                {totalHoras.toFixed(1).replace('.', ',')} h
              </p>
            </div>

            {/* Volume produzido */}
            <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4 mb-4">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">
                Volume produzido
              </p>
              <p className="text-3xl font-black text-white font-mono">
                {volume.toLocaleString('pt-BR')}
              </p>
            </div>

            {/* Fórmula */}
            <div className="text-xs text-gray-400 space-y-2 leading-relaxed">
              <p>
                <span className="font-bold text-white">A fórmula usada é:</span>
              </p>
              <p className="text-[#FFD700] font-bold font-mono">
                NET = Volume produzido ÷ Total de horas
              </p>
              <p className="text-gray-500">
                O total de horas é a soma das 4 categorias convertidas para hora
                decimal.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
