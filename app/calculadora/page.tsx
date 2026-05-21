'use client';

import { useState, useRef } from 'react';
import RegistrarTurnoModal from '../components/RegistrarTurnoModal';

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

// Converte HH e MM em string "HH:MM:00"
function tempoParaString(h: number, m: number): string {
  const hh = String(h || 0).padStart(2, '0');
  const mm = String(m || 0).padStart(2, '0');
  return `${hh}:${mm}:00`;
}

// 🧠 Extrai tempos do texto OCR usando regex inteligente
function extrairTemposDoTexto(texto: string): Partial<Tempos> {
  const t = texto.toLowerCase().replace(/\s+/g, ' ');
  const result: Partial<Tempos> = {};

  const rotulosLista: { pos: number; tipo: keyof Tempos }[] = [];
  const buscarRotulos = [
    { tipo: 'ociosidade' as const, termos: ['ociosidade total', 'ociosidade'] },
    { tipo: 'efetivo' as const, termos: ['tempo efetivo'] },
    { tipo: 'naoSistemico' as const, termos: ['não sistêmico', 'nao sistemico', 'não medido'] },
    { tipo: 'naoDisponivel' as const, termos: ['não disponível', 'nao disponivel'] },
  ];

  for (const item of buscarRotulos) {
    for (const termo of item.termos) {
      const idx = t.indexOf(termo);
      if (idx !== -1) {
        rotulosLista.push({ pos: idx, tipo: item.tipo });
        break;
      }
    }
  }

  rotulosLista.sort((a, b) => a.pos - b.pos);

  const primeiroMatch = t.match(/(\d+)\s*h\w*\s*(\d+)\s*min|(\d+)\s*min/);
  const posPrimeiroTempo = primeiroMatch ? primeiroMatch.index || 0 : -1;

  const ultimoRotuloPos = rotulosLista.length > 0 ? rotulosLista[rotulosLista.length - 1].pos : 0;
  const modoOrdenado = rotulosLista.length >= 3 && posPrimeiroTempo > ultimoRotuloPos + 10;

  function acharTempoProximo(palavrasChave: string[]): TempoUnico | null {
    for (const chave of palavrasChave) {
      const idx = t.indexOf(chave);
      if (idx === -1) continue;
      const trecho = t.substring(idx, idx + 60);
      const m1 = trecho.match(/(\d+)\s*h\w*\s*(\d+)\s*m/);
      if (m1) return { h: parseInt(m1[1]), m: parseInt(m1[2]) };
      const m2 = trecho.match(/(\d+)\s*min/);
      if (m2) return { h: 0, m: parseInt(m2[1]) };
      const m3 = trecho.match(/(\d+)\s*h\b/);
      if (m3) return { h: parseInt(m3[1]), m: 0 };
    }
    return null;
  }

  if (!modoOrdenado) {
    const ociosidade = acharTempoProximo(['ociosidade total', 'ociosidade']);
    if (ociosidade) result.ociosidade = ociosidade;
    const efetivo = acharTempoProximo(['tempo efetivo', 'efetivo']);
    if (efetivo) result.efetivo = efetivo;
    const naoSistemico = acharTempoProximo([
      'não sistêmico', 'nao sistemico', 'não sistémico', 'não medido', 'sistêmico', 'sistemico',
    ]);
    if (naoSistemico) result.naoSistemico = naoSistemico;
    const naoDisponivel = acharTempoProximo([
      'não disponível', 'nao disponivel', 'não disponivel', 'disponível', 'disponivel',
    ]);
    if (naoDisponivel) result.naoDisponivel = naoDisponivel;
  }

  const camposVazios: (keyof Tempos)[] = [];
  if (!result.ociosidade) camposVazios.push('ociosidade');
  if (!result.efetivo) camposVazios.push('efetivo');
  if (!result.naoSistemico) camposVazios.push('naoSistemico');
  if (!result.naoDisponivel) camposVazios.push('naoDisponivel');

  if (camposVazios.length > 0) {
    const todosOsTempos: { pos: number; tempo: TempoUnico }[] = [];

    const regexHorMin = /(\d+)\s*h\w*\s*(\d+)\s*min/g;
    const matchesHM: { pos: number; fim: number; tempo: TempoUnico }[] = [];
    let mhm;
    while ((mhm = regexHorMin.exec(t)) !== null) {
      matchesHM.push({
        pos: mhm.index,
        fim: mhm.index + mhm[0].length,
        tempo: { h: parseInt(mhm[1]), m: parseInt(mhm[2]) },
      });
      todosOsTempos.push({
        pos: mhm.index,
        tempo: { h: parseInt(mhm[1]), m: parseInt(mhm[2]) },
      });
    }

    const regexSoMin = /(\d+)\s*min/g;
    let mm;
    while ((mm = regexSoMin.exec(t)) !== null) {
      const fimMatch = mm.index + mm[0].length;
      const dentroDeHM = matchesHM.some(
        (h) => mm!.index >= h.pos && fimMatch <= h.fim
      );
      if (!dentroDeHM) {
        todosOsTempos.push({
          pos: mm.index,
          tempo: { h: 0, m: parseInt(mm[1]) },
        });
      }
    }

    todosOsTempos.sort((a, b) => a.pos - b.pos);

    if (rotulosLista.length === todosOsTempos.length) {
      rotulosLista.forEach((r, idx) => {
        if (!result[r.tipo] && todosOsTempos[idx]) {
          result[r.tipo] = todosOsTempos[idx].tempo;
        }
      });
    } else if (rotulosLista.length > 0 && todosOsTempos.length > 0) {
      const minLen = Math.min(rotulosLista.length, todosOsTempos.length);
      for (let i = 0; i < minLen; i++) {
        if (!result[rotulosLista[i].tipo]) {
          result[rotulosLista[i].tipo] = todosOsTempos[i].tempo;
        }
      }
    }
  }

  return result;
}

export default function CalculadoraNetPage() {
  const [tempos, setTempos] = useState<Tempos>(TEMPOS_ZERADOS);
  const [volumeStr, setVolumeStr] = useState('');
  const [gerandoImagem, setGerandoImagem] = useState(false);
  const [mostrarOcr, setMostrarOcr] = useState(false);
  const [mostrarRegistrarTurno, setMostrarRegistrarTurno] = useState(false);

  // OCR
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [ocrProgresso, setOcrProgresso] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [textoExtraido, setTextoExtraido] = useState('');

  const areaRef = useRef<HTMLDivElement>(null);

  const ocio = paraDecimal(tempos.ociosidade.h, tempos.ociosidade.m);
  const efe = paraDecimal(tempos.efetivo.h, tempos.efetivo.m);
  const naoSis = paraDecimal(tempos.naoSistemico.h, tempos.naoSistemico.m);
  const naoDisp = paraDecimal(tempos.naoDisponivel.h, tempos.naoDisponivel.m);
  const totalHoras = ocio + efe + naoSis + naoDisp;
  const volume = parseVolume(volumeStr);
  const net = totalHoras > 0 ? volume / totalHoras : 0;

  // 🎯 Percentuais pro registro do turno
  const pctEfetivo = totalHoras > 0 ? (efe / totalHoras) * 100 : 0;
  const pctOcioso = totalHoras > 0 ? (ocio / totalHoras) * 100 : 0;
  const pctNaoSistemico = totalHoras > 0 ? (naoSis / totalHoras) * 100 : 0;
  const pctNaoDisponivel = totalHoras > 0 ? (naoDisp / totalHoras) * 100 : 0;

  // 🎯 Dados que vão pro modal de Registrar Turno
  const dadosTurno = {
    tempo_efetivo: tempoParaString(tempos.efetivo.h, tempos.efetivo.m),
    tempo_ocioso: tempoParaString(tempos.ociosidade.h, tempos.ociosidade.m),
    tempo_nao_sistemico: tempoParaString(tempos.naoSistemico.h, tempos.naoSistemico.m),
    tempo_nao_disponivel: tempoParaString(tempos.naoDisponivel.h, tempos.naoDisponivel.m),
    pct_efetivo: Number(pctEfetivo.toFixed(2)),
    pct_ocioso: Number(pctOcioso.toFixed(2)),
    pct_nao_sistemico: Number(pctNaoSistemico.toFixed(2)),
    pct_nao_disponivel: Number(pctNaoDisponivel.toFixed(2)),
    unidades_total: volume,
    net_geral_real: Number(net.toFixed(2)),
  };

  const podeRegistrarTurno = totalHoras > 0 && volume > 0;

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
    if (typeof window !== 'undefined' && (window as any).showToast) {
      (window as any).showToast('info', 'Calculadora limpa');
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
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', 'PNG baixado!');
      }
    } catch (e) {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('error', 'Erro ao gerar PNG');
      }
    } finally {
      setGerandoImagem(false);
    }
  }

  async function processarImagem(file: File) {
    setOcrLoading(true);
    setOcrProgresso(0);
    setOcrStatus('Iniciando...');
    setTextoExtraido('');

    try {
      const reader = new FileReader();
      reader.onload = (e) => setImagemPreview(e.target?.result as string);
      reader.readAsDataURL(file);

      const Tesseract = (await import('tesseract.js')).default;

      const worker = await Tesseract.createWorker('por', 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') {
            setOcrStatus('Lendo texto da imagem...');
            setOcrProgresso(Math.round(m.progress * 100));
          } else {
            setOcrStatus(m.status);
          }
        },
      });

      const { data } = await worker.recognize(file);
      await worker.terminate();

      const texto = data.text;
      setTextoExtraido(texto);
      console.log('📝 Texto OCR:', texto);

      const extraidos = extrairTemposDoTexto(texto);
      console.log('🎯 Tempos extraídos:', extraidos);

      if (Object.keys(extraidos).length === 0) {
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast(
            'warning',
            'Não consegui identificar os tempos. Confira o texto extraído e digite manualmente.'
          );
        }
      } else {
        setTempos((prev) => ({ ...prev, ...extraidos }));
        const encontrados = Object.keys(extraidos).length;
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast(
            'success',
            `${encontrados} tempo(s) preenchido(s)! Confira e ajuste se precisar.`
          );
        }
      }
    } catch (e: unknown) {
      console.error('Erro no OCR:', e);
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast(
          'error',
          'Erro ao processar imagem. Tente uma imagem com melhor qualidade.'
        );
      }
    } finally {
      setOcrLoading(false);
      setOcrProgresso(0);
      setOcrStatus('');
    }
  }

  function onArquivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processarImagem(file);
  }

  function fecharOcr() {
    setMostrarOcr(false);
    setImagemPreview(null);
    setTextoExtraido('');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-black mb-2">
          🧮 Calculadora <span className="text-[#FFD700]">NET</span>
        </h1>
        <p className="text-gray-400">
          Calcule a NET com base no volume produzido e no total de horas do período
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ESQUERDA — Inputs */}
        <div className="lg:col-span-2 space-y-4" ref={areaRef}>
          {/* Card de Tempos */}
          <div
            className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl overflow-hidden"
            style={{ boxShadow: '0 10px 30px -5px rgba(0,0,0,0.5)' }}
          >
            <div className="bg-[#0a0a0a] px-5 py-4 flex items-center justify-between border-b border-[#2a2a2a]">
              <div className="flex items-center gap-2">
                <span className="text-xl">🕐</span>
                <h2 className="text-lg font-bold text-white">Tempos do período</h2>
              </div>
              <div className="flex items-center gap-1.5 bg-green-500/10 text-green-300 text-xs px-3 py-1.5 rounded-full border border-green-500/30 font-bold">
                ⚡ Cálculo instantâneo
              </div>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-12 gap-3 mb-3 pb-2 border-b border-[#2a2a2a] text-xs font-bold text-gray-500 uppercase">
                <div className="col-span-5">TEMPOS</div>
                <div className="col-span-2 text-center">HORA</div>
                <div className="col-span-2 text-center">MINUTO</div>
                <div className="col-span-3 text-center">HORA DECIMAL</div>
              </div>

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
                      className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-center font-mono focus:border-[#FFD700] outline-none"
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
                      className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-center font-mono focus:border-[#FFD700] outline-none"
                    />
                  </div>
                  <div className="col-span-3 text-center text-lg font-bold font-mono text-[#FFD700]">
                    {decimaisPorTipo[tipo].toFixed(1).replace('.', ',')}
                  </div>
                </div>
              ))}

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
                className="flex-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white text-lg font-mono text-center focus:border-[#FFD700] outline-none"
              />
            </div>
          </div>

          {/* Botões */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setMostrarOcr(true)}
              className="bg-gradient-to-br from-orange-500 to-orange-600 text-white font-bold px-6 py-3 rounded-xl hover:from-orange-400 hover:to-orange-500 transition-all shadow-lg shadow-orange-500/30 hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2"
            >
              <span>📷</span> Importar de imagem
            </button>
            <button
              onClick={salvarPng}
              disabled={gerandoImagem}
              className="bg-gradient-to-br from-[#FFD700] to-yellow-500 text-black font-bold px-6 py-3 rounded-xl hover:from-yellow-300 hover:to-yellow-400 transition-all shadow-lg shadow-yellow-500/30 hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2 disabled:opacity-50"
            >
              <span>🖼️</span>
              {gerandoImagem ? 'Gerando...' : 'Salvar PNG'}
            </button>

            {/* ⭐ NOVO BOTÃO: Registrar Fim de Turno */}
            <button
              onClick={() => setMostrarRegistrarTurno(true)}
              disabled={!podeRegistrarTurno}
              title={!podeRegistrarTurno ? 'Preencha os tempos e o volume primeiro' : 'Salvar como registro oficial do dia'}
              className="bg-gradient-to-br from-green-500 to-emerald-600 text-white font-bold px-6 py-3 rounded-xl hover:from-green-400 hover:to-emerald-500 transition-all shadow-lg shadow-green-500/30 hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>📥</span> Registrar Fim de Turno
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
            <div className="flex justify-center mb-5">
              <div className="bg-gradient-to-r from-[#FFD700] to-yellow-500 text-black text-xs font-black px-4 py-2 rounded-full flex items-center gap-2 shadow-lg shadow-yellow-500/30">
                🚀 RESULTADO INSTANTÂNEO
              </div>
            </div>

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

            <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4 mb-3">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">
                Total de horas
              </p>
              <p className="text-3xl font-black text-white">
                {totalHoras.toFixed(1).replace('.', ',')} h
              </p>
            </div>

            <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4 mb-4">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">
                Volume produzido
              </p>
              <p className="text-3xl font-black text-white font-mono">
                {volume.toLocaleString('pt-BR')}
              </p>
            </div>

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

      {/* MODAL DE OCR */}
      {mostrarOcr && (
        <div
          className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={fecharOcr}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border-2 border-[#2a2a2a] rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            style={{
              boxShadow:
                '0 30px 80px -10px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05) inset',
            }}
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-2xl font-black text-white mb-1">
                  📷 Importar de imagem
                </h2>
                <p className="text-gray-400 text-sm">
                  Suba o print do painel do MELI — o app vai tentar ler os tempos
                  automaticamente
                </p>
              </div>
              <button
                onClick={fecharOcr}
                className="w-8 h-8 rounded-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white flex items-center justify-center text-xl"
              >
                ×
              </button>
            </div>

            {!ocrLoading && !imagemPreview && (
              <label className="block">
                <div className="border-2 border-dashed border-[#3a3a3a] hover:border-[#FFD700] rounded-2xl p-12 text-center cursor-pointer transition-colors bg-[#0a0a0a]/50">
                  <span className="text-6xl block mb-4">📁</span>
                  <p className="text-white font-bold mb-2">
                    Clica aqui pra escolher uma imagem
                  </p>
                  <p className="text-gray-500 text-xs">
                    PNG, JPG ou JPEG · idealmente sem rotação
                  </p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onArquivoChange}
                />
              </label>
            )}

            {ocrLoading && (
              <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl p-8 text-center space-y-4">
                <span className="text-5xl block soft-pulse">🔍</span>
                <p className="text-white font-bold">{ocrStatus || 'Processando...'}</p>
                <div className="bg-[#1a1a1a] rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-[#FFD700] to-yellow-500 h-full transition-all duration-300"
                    style={{ width: `${ocrProgresso}%` }}
                  ></div>
                </div>
                <p className="text-gray-400 text-xs">{ocrProgresso}%</p>
              </div>
            )}

            {imagemPreview && !ocrLoading && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-400 mb-2 font-bold uppercase">
                    Imagem
                  </p>
                  <img
                    src={imagemPreview}
                    alt="Preview"
                    className="w-full rounded-xl border border-[#2a2a2a]"
                  />
                </div>

                {textoExtraido && (
                  <details className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4">
                    <summary className="cursor-pointer text-xs font-bold text-gray-400 uppercase">
                      📝 Texto bruto extraído (clica pra ver)
                    </summary>
                    <pre className="text-xs text-gray-300 mt-3 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                      {textoExtraido}
                    </pre>
                  </details>
                )}

                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-xs text-blue-300">
                  💡 Confira os campos da calculadora — se algum não foi preenchido
                  ou ficou errado, ajuste manualmente.
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={fecharOcr}
                    className="flex-1 bg-[#FFD700] text-black font-bold py-3 rounded-xl hover:bg-yellow-300 transition-colors"
                  >
                    ✓ Pronto
                  </button>
                  <label className="flex-1 bg-[#2a2a2a] text-white font-bold py-3 rounded-xl hover:bg-[#3a3a3a] transition-colors cursor-pointer text-center">
                    📷 Outra imagem
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onArquivoChange}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ⭐ MODAL DE REGISTRAR FIM DE TURNO */}
      <RegistrarTurnoModal
        isOpen={mostrarRegistrarTurno}
        onClose={() => setMostrarRegistrarTurno(false)}
        tempos={dadosTurno}
      />
    </div>
  );
}
