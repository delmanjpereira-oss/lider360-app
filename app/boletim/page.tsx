'use client';

import { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';

type LinhaColab = {
  id: string;
  liquida: number;
  qtd: number;
  ocupacao: number;
};

type DadosBoletim = {
  checkin: LinhaColab[];
  p2m: LinhaColab[];
  ocupacao: LinhaColab[];
};

type Metas = {
  checkinLiq: number;
  checkinVol: number;
  p2mLiq: number;
  p2mVol: number;
  ocupMeta: number;
  netCT: number;
  totalPecas: number;
};

const METAS_KEY = 'lider360_boletim_metas_v3';

const METAS_PADRAO: Metas = {
  checkinLiq: 296,
  checkinVol: 2100,
  p2mLiq: 329,
  p2mVol: 2400,
  ocupMeta: 80,
  netCT: 135,
  totalPecas: 0,
};

// 🎯 EXATAMENTE igual o upload-page.tsx
function parseNumber(value: string): number {
  if (!value) return 0;
  let s = String(value).trim().replace(/\s/g, '').replace('%', '');
  if (!s) return 0;

  const hasComma = s.indexOf(',') !== -1;
  const hasDot = s.indexOf('.') !== -1;

  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    s = s.replace(',', '.');
  }

  s = s.replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

function normalizarChave(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function pegarValor(linha: Record<string, string>, aliases: string[]): string {
  const chaves = Object.keys(linha);
  for (const alias of aliases) {
    const aliasNorm = normalizarChave(alias);
    for (const chave of chaves) {
      if (normalizarChave(chave) === aliasNorm) {
        return linha[chave] || '';
      }
    }
  }
  return '';
}

function normalizarIdGroot(v: string): string {
  return String(v || '').replace(/\D/g, '').trim();
}

export default function BoletimPage() {
  const [dados, setDados] = useState<DadosBoletim>({
    checkin: [],
    p2m: [],
    ocupacao: [],
  });

  const [metas, setMetas] = useState<Metas>(METAS_PADRAO);
  const [dataRef, setDataRef] = useState(new Date().toLocaleDateString('pt-BR'));
  const [montou, setMontou] = useState(false);
  
  // 🎯 Realizado editável manualmente (null = usa cálculo automático)
  const [netRealizadoManual, setNetRealizadoManual] = useState<number | null>(null);
  const [pecasRealizadoManual, setPecasRealizadoManual] = useState<number | null>(null);
  
  const boletimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const salvas = localStorage.getItem(METAS_KEY);
      if (salvas) setMetas({ ...METAS_PADRAO, ...JSON.parse(salvas) });
    } catch {}
    setMontou(true);
  }, []);

  function salvarMetas(novas: Metas) {
    setMetas(novas);
    try {
      localStorage.setItem(METAS_KEY, JSON.stringify(novas));
    } catch {}
  }

  function processarCSV(arquivo: File, tipo: 'checkin' | 'p2m' | 'ocupacao') {
    Papa.parse(arquivo, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const linhas: LinhaColab[] = [];

        if (result.data.length > 0) {
          console.log('📋 CSV Headers detectados:', Object.keys(result.data[0] as object));
        }

        (result.data as Record<string, string>[]).forEach((row) => {
          if (tipo === 'ocupacao') {
            // CSV Totefullness — formato diferente
            const id = pegarValor(row, ['user_id', 'User_Id', 'USER_ID', 'id_groot', 'id', 'Id_Groot']);
            const idLimpo = normalizarIdGroot(id);
            if (!idLimpo) return;

            const ocupTxt = pegarValor(row, ['ocupacao', 'ocupação', 'ocupacao_pct', 'ocupação (%)', 'occupation']);
            const ocup = parseNumber(ocupTxt);
            if (ocup > 0) linhas.push({ id: idLimpo, liquida: 0, qtd: 0, ocupacao: ocup });
          } else {
            // 🎯 EXATAMENTE igual ao upload-page.tsx do "Meu Time"
            const idGrootRaw = pegarValor(row, ['id_groot', 'id groot', 'groot', 'id']);
            const idGroot = normalizarIdGroot(idGrootRaw);
            if (!idGroot) return;

            const liquida = parseNumber(
              pegarValor(row, [
                'prod_liquida_sist',
                'prod liquida sist',
                'prod liquida sistemico',
                'prod_liquida',
                'liquida',
                'produtividade liquida',
              ])
            );

            const qtd = parseNumber(
              pegarValor(row, ['unidades', 'volume', 'quantidade'])
            );

            if (liquida > 0 || qtd > 0) {
              linhas.push({ id: idGroot, liquida, qtd, ocupacao: 0 });
            }
          }
        });

        if (linhas.length === 0) {
          alert(`❌ Nenhum dado encontrado no CSV!\n\nHeaders detectados:\n${Object.keys(result.data[0] || {}).join(', ')}\n\nVerifique no console (F12) os headers.`);
          return;
        }

        setDados((prev) => ({ ...prev, [tipo]: linhas }));
      },
    });
  }

  function limpar() {
    setDados({ checkin: [], p2m: [], ocupacao: [] });
  }

  const totalLiqCheckin = dados.checkin.reduce((s, l) => s + l.liquida, 0);
  const totalLiqP2M = dados.p2m.reduce((s, l) => s + l.liquida, 0);
  const totalVolP2M = dados.p2m.reduce((s, l) => s + l.qtd, 0);

  const totalColabs = dados.checkin.length + dados.p2m.length;
  const netCalculado = totalColabs > 0
    ? Math.round((totalLiqCheckin + totalLiqP2M) / totalColabs)
    : 0;

  // 🎯 Realizado FINAL: usa manual se setado, senão usa calculado
  const netRealizado = netRealizadoManual !== null ? netRealizadoManual : netCalculado;
  const pecasCalculado = totalVolP2M;
  const totalPecasRealizado = pecasRealizadoManual !== null ? pecasRealizadoManual : pecasCalculado;

  const difNet = netRealizado - metas.netCT;
  const difPecas = totalPecasRealizado - metas.totalPecas;

  type LinhaUnificada = {
    id: string;
    processo: 'CK' | 'P2M' | '?';
    liquida: number;
    qtd: number;
    ocupacao: number;
    metaLiq: number;
    metaVol: number;
  };

  const linhasUnificadas: LinhaUnificada[] = (() => {
    const mapa: Record<string, LinhaUnificada> = {};

    // 🎯 Cada chave do mapa = ID + Processo (assim Check-in e P2M coexistem)
    dados.checkin.forEach((l) => {
      const chave = `${l.id}_CK`;
      mapa[chave] = {
        id: l.id,
        processo: 'CK',
        liquida: l.liquida,
        qtd: l.qtd,
        ocupacao: 0,
        metaLiq: metas.checkinLiq,
        metaVol: metas.checkinVol,
      };
    });

    dados.p2m.forEach((l) => {
      const chave = `${l.id}_P2M`;
      mapa[chave] = {
        id: l.id,
        processo: 'P2M',
        liquida: l.liquida,
        qtd: l.qtd,
        ocupacao: 0,
        metaLiq: metas.p2mLiq,
        metaVol: metas.p2mVol,
      };
    });

    // Ocupação só pra P2M
    dados.ocupacao.forEach((o) => {
      const chaveP2M = `${o.id}_P2M`;
      if (mapa[chaveP2M]) {
        mapa[chaveP2M].ocupacao = o.ocupacao;
      } else {
        // Tem ocupação mas não tem produtividade P2M
        mapa[chaveP2M] = {
          id: o.id,
          processo: 'P2M',
          liquida: 0,
          qtd: 0,
          ocupacao: o.ocupacao,
          metaLiq: metas.p2mLiq,
          metaVol: metas.p2mVol,
        };
      }
    });

    return Object.values(mapa).sort((a, b) => b.liquida - a.liquida);
  })();

  function corCelula(valor: number, meta: number): string {
    if (valor === 0) return 'text-gray-500';
    return valor >= meta ? 'text-green-400' : 'text-red-400';
  }

  async function salvarPNG() {
    if (!boletimRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(boletimRef.current, {
        backgroundColor: '#0a0a0a',
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `Boletim_${dataRef.replace(/\//g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error(e);
    }
  }

  async function copiarImagem() {
    if (!boletimRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(boletimRef.current, {
        backgroundColor: '#0a0a0a',
        scale: 2,
        useCORS: true,
      });
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          alert('✅ Imagem copiada! Cola no WhatsApp (Ctrl+V)');
        } catch {
          alert('❌ Não foi possível copiar. Use "Salvar PNG"');
        }
      });
    } catch (e) {
      console.error(e);
    }
  }

  if (!montou) return null;

  return (
    <div className="p-6 space-y-6 min-h-screen bg-[#0a0a0a]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-black text-[#FFD700]">📊 Boletim Diário</h1>
        <input
          type="text"
          value={dataRef}
          onChange={(e) => setDataRef(e.target.value)}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-white text-sm font-mono focus:border-[#FFD700] focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CHECK-IN */}
        <div className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-cyan-500/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📦</span>
              <div>
                <div className="text-sm text-cyan-300 font-bold">CHECK-IN</div>
                <div className="text-xs text-gray-400">
                  {dados.checkin.length > 0 ? `${dados.checkin.length} colaboradores` : 'Aguardando CSV'}
                </div>
              </div>
            </div>
            <label className="cursor-pointer bg-[#FFD700] hover:bg-yellow-400 text-black px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors text-xs font-bold">
              <span>📂</span> CSV
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) processarCSV(f, 'checkin');
                }}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400">Meta Líq</label>
              <input
                type="number"
                value={metas.checkinLiq}
                onChange={(e) => salvarMetas({ ...metas, checkinLiq: Number(e.target.value) })}
                className="w-full bg-[#0a0a0a] border border-cyan-500/30 rounded px-2 py-1 text-white font-mono text-sm focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Meta Vol</label>
              <input
                type="number"
                value={metas.checkinVol}
                onChange={(e) => salvarMetas({ ...metas, checkinVol: Number(e.target.value) })}
                className="w-full bg-[#0a0a0a] border border-cyan-500/30 rounded px-2 py-1 text-white font-mono text-sm focus:border-cyan-400"
              />
            </div>
          </div>
        </div>

        {/* P2M (com Ocupação junto) */}
        <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border border-orange-500/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🚚</span>
              <div>
                <div className="text-sm text-orange-300 font-bold">P2M</div>
                <div className="text-xs text-gray-400">
                  {dados.p2m.length > 0 ? `${dados.p2m.length} colab.` : 'Aguardando CSV'}
                  {dados.ocupacao.length > 0 && ` · ${dados.ocupacao.length} ocup.`}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <label className="cursor-pointer bg-[#FFD700] hover:bg-yellow-400 text-black px-2 py-2 rounded-lg flex items-center gap-1 transition-colors text-xs font-bold" title="Upload Produtividade P2M">
                <span>📂</span> Prod.
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) processarCSV(f, 'p2m');
                  }}
                />
              </label>
              <label className="cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-black px-2 py-2 rounded-lg flex items-center gap-1 transition-colors text-xs font-bold" title="Upload Ocupação (Totefullness)">
                <span>📈</span> Ocup.
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) processarCSV(f, 'ocupacao');
                  }}
                />
              </label>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-400">Meta Líq</label>
              <input
                type="number"
                value={metas.p2mLiq}
                onChange={(e) => salvarMetas({ ...metas, p2mLiq: Number(e.target.value) })}
                className="w-full bg-[#0a0a0a] border border-orange-500/30 rounded px-2 py-1 text-white font-mono text-sm focus:border-orange-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Meta Vol</label>
              <input
                type="number"
                value={metas.p2mVol}
                onChange={(e) => salvarMetas({ ...metas, p2mVol: Number(e.target.value) })}
                className="w-full bg-[#0a0a0a] border border-orange-500/30 rounded px-2 py-1 text-white font-mono text-sm focus:border-orange-400"
              />
            </div>
            <div>
              <label className="text-xs text-emerald-400">Meta Ocup%</label>
              <input
                type="number"
                value={metas.ocupMeta}
                onChange={(e) => salvarMetas({ ...metas, ocupMeta: Number(e.target.value) })}
                className="w-full bg-[#0a0a0a] border border-emerald-500/30 rounded px-2 py-1 text-white font-mono text-sm focus:border-emerald-400"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
            <span className="text-2xl">⚡</span>
            <div className="flex-1">
              <div className="text-xs text-yellow-300 font-bold">NET DO TIME — Meta</div>
              <input
                type="number"
                value={metas.netCT}
                onChange={(e) => salvarMetas({ ...metas, netCT: Number(e.target.value) })}
                className="w-full bg-[#0a0a0a] border border-yellow-500/30 rounded px-2 py-1 text-white font-mono text-base font-bold focus:border-yellow-400 mt-1"
              />
            </div>
            <span className="text-xs text-gray-400">und/h</span>
          </div>

          <div className="flex items-center gap-3 bg-purple-500/5 border border-purple-500/20 rounded-lg p-3">
            <span className="text-2xl">📦</span>
            <div className="flex-1">
              <div className="text-xs text-purple-300 font-bold">TOTAL DE PEÇAS — Meta</div>
              <input
                type="number"
                value={metas.totalPecas}
                onChange={(e) => salvarMetas({ ...metas, totalPecas: Number(e.target.value) })}
                className="w-full bg-[#0a0a0a] border border-purple-500/30 rounded px-2 py-1 text-white font-mono text-base font-bold focus:border-purple-400 mt-1"
              />
            </div>
            <span className="text-xs text-gray-400">peças</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={salvarPNG}
          disabled={linhasUnificadas.length === 0}
          className="bg-[#FFD700] hover:bg-yellow-400 disabled:opacity-30 disabled:cursor-not-allowed text-black font-bold px-4 py-2 rounded-lg text-sm transition-colors"
        >
          🖼️ Salvar PNG
        </button>
        <button
          onClick={copiarImagem}
          disabled={linhasUnificadas.length === 0}
          className="bg-[#1a1a1a] hover:bg-[#2a2a2a] disabled:opacity-30 disabled:cursor-not-allowed border border-[#2a2a2a] text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors"
        >
          📋 Copiar imagem
        </button>
        <button
          onClick={limpar}
          className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-bold px-4 py-2 rounded-lg text-sm transition-colors"
        >
          🗑️ Limpar tudo
        </button>
      </div>

      <div ref={boletimRef} className="bg-gradient-to-br from-[#0f0f1a] via-[#0a0a14] to-[#0f0a1a] rounded-2xl p-6 border-2 border-[#FFD700]/30 shadow-2xl">
        <div className="bg-gradient-to-r from-[#FFD700] via-yellow-400 to-[#FFD700] p-3 rounded-xl mb-6 text-center">
          <h2 className="text-2xl font-black text-black tracking-wider">
            📊 BOLETIM DO DIA — {dataRef}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border-2 border-yellow-500/40 rounded-xl p-4">
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="text-xs font-bold text-yellow-300 uppercase tracking-widest">
                ⚡ NET do Time
              </span>
              {netRealizadoManual !== null && (
                <button
                  onClick={() => setNetRealizadoManual(null)}
                  className="text-[10px] bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 px-2 py-0.5 rounded-full font-bold transition-colors"
                  title="Voltar ao cálculo automático"
                  data-html2canvas-ignore="true"
                >
                  🔄 Auto
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <div className="text-xs text-gray-400 uppercase font-bold" style={{ height: '18px', lineHeight: '18px' }}>Meta</div>
                <input
                  type="number"
                  value={metas.netCT}
                  onChange={(e) => salvarMetas({ ...metas, netCT: Number(e.target.value) })}
                  className="w-full bg-transparent text-2xl font-black text-yellow-300 font-mono text-center focus:outline-none focus:bg-[#0a0a0a]/50 rounded"
                  style={{ height: '36px', lineHeight: '36px', padding: '0', display: 'block', margin: '0' }}
                />
              </div>
              <div className="text-center border-x border-yellow-500/20">
                <div className="text-xs text-gray-400 uppercase font-bold" style={{ height: '18px', lineHeight: '18px' }}>
                  Realizado <span className="text-yellow-400" data-html2canvas-ignore="true">{netRealizadoManual !== null ? '✏️' : ''}</span>
                </div>
                <input
                  type="number"
                  value={netRealizado || ''}
                  placeholder="-"
                  onChange={(e) => {
                    const v = e.target.value;
                    setNetRealizadoManual(v === '' ? null : Number(v));
                  }}
                  className={`w-full bg-transparent text-2xl font-black font-mono text-center focus:outline-none focus:bg-[#0a0a0a]/50 rounded ${
                    netRealizado >= metas.netCT && netRealizado > 0 ? 'text-green-400' : netRealizado > 0 ? 'text-red-400' : 'text-gray-500'
                  }`}
                  style={{ height: '36px', lineHeight: '36px', padding: '0', display: 'block', margin: '0' }}
                />
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-400 uppercase font-bold" style={{ height: '18px', lineHeight: '18px' }}>Diferença</div>
                <div className={`text-2xl font-black font-mono text-center ${difNet >= 0 ? 'text-green-400' : 'text-red-400'}`} style={{ height: '36px', lineHeight: '36px' }}>
                  {netRealizado > 0 ? (difNet >= 0 ? `+${difNet}` : difNet) : '-'}
                </div>
              </div>
            </div>
            <div className="text-center text-[10px] text-gray-500 mt-1">und/h</div>
          </div>

          <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-2 border-purple-500/40 rounded-xl p-4">
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="text-xs font-bold text-purple-300 uppercase tracking-widest">
                📦 Total de Peças (P2M)
              </span>
              {pecasRealizadoManual !== null && (
                <button
                  onClick={() => setPecasRealizadoManual(null)}
                  className="text-[10px] bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 px-2 py-0.5 rounded-full font-bold transition-colors"
                  title="Voltar ao cálculo automático"
                  data-html2canvas-ignore="true"
                >
                  🔄 Auto
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <div className="text-xs text-gray-400 uppercase font-bold" style={{ height: '18px', lineHeight: '18px' }}>Meta</div>
                <input
                  type="number"
                  value={metas.totalPecas}
                  onChange={(e) => salvarMetas({ ...metas, totalPecas: Number(e.target.value) })}
                  className="w-full bg-transparent text-2xl font-black text-purple-300 font-mono text-center focus:outline-none focus:bg-[#0a0a0a]/50 rounded"
                  style={{ height: '36px', lineHeight: '36px', padding: '0', display: 'block', margin: '0' }}
                />
              </div>
              <div className="text-center border-x border-purple-500/20">
                <div className="text-xs text-gray-400 uppercase font-bold" style={{ height: '18px', lineHeight: '18px' }}>
                  Realizado <span className="text-purple-400" data-html2canvas-ignore="true">{pecasRealizadoManual !== null ? '✏️' : ''}</span>
                </div>
                <input
                  type="number"
                  value={totalPecasRealizado || ''}
                  placeholder="-"
                  onChange={(e) => {
                    const v = e.target.value;
                    setPecasRealizadoManual(v === '' ? null : Number(v));
                  }}
                  className={`w-full bg-transparent text-2xl font-black font-mono text-center focus:outline-none focus:bg-[#0a0a0a]/50 rounded ${
                    totalPecasRealizado >= metas.totalPecas && metas.totalPecas > 0 && totalPecasRealizado > 0 ? 'text-green-400' : totalPecasRealizado > 0 ? 'text-red-400' : 'text-gray-500'
                  }`}
                  style={{ height: '36px', lineHeight: '36px', padding: '0', display: 'block', margin: '0' }}
                />
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-400 uppercase font-bold" style={{ height: '18px', lineHeight: '18px' }}>Diferença</div>
                <div className={`text-2xl font-black font-mono text-center ${difPecas >= 0 ? 'text-green-400' : 'text-red-400'}`} style={{ height: '36px', lineHeight: '36px' }}>
                  {totalPecasRealizado > 0 && metas.totalPecas > 0 ? (difPecas >= 0 ? `+${difPecas.toLocaleString('pt-BR')}` : difPecas.toLocaleString('pt-BR')) : '-'}
                </div>
              </div>
            </div>
            <div className="text-center text-[10px] text-gray-500 mt-1">peças P2M</div>
          </div>
        </div>

        <div className="bg-[#0a0a0a]/50 rounded-xl p-3 mb-4 border border-[#2a2a2a]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-center text-xs font-bold">
            <div className="flex items-center justify-center gap-2 text-cyan-300">
              <span>📦</span>
              <span>CHECK-IN · Líq: {metas.checkinLiq} · Vol: {metas.checkinVol.toLocaleString('pt-BR')}</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-orange-300">
              <span>🚚</span>
              <span>P2M · Líq: {metas.p2mLiq} · Vol: {metas.p2mVol.toLocaleString('pt-BR')}</span>
            </div>
          </div>
        </div>

        {linhasUnificadas.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* CHECK-IN TABLE */}
            {linhasUnificadas.filter((l) => l.processo === 'CK').length > 0 && (
              <div className="bg-white rounded-xl overflow-hidden border-2 border-cyan-500/40">
                <div className="bg-cyan-500 px-4 py-2">
                  <h3 className="text-black font-black text-sm uppercase flex items-center gap-2">
                    📦 CHECK-IN
                    <span className="text-xs font-normal opacity-80">
                      · {linhasUnificadas.filter((l) => l.processo === 'CK').length} colaboradores · Meta Líq: {metas.checkinLiq} · Meta Vol: {metas.checkinVol.toLocaleString('pt-BR')}
                    </span>
                  </h3>
                </div>
                <table className="w-full text-sm" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="bg-[#FFD700]" style={{ height: '40px' }}>
                      <th className="px-4 text-center text-black font-black uppercase text-xs" style={{ verticalAlign: 'middle', lineHeight: '1' }}>ID</th>
                      <th className="px-4 text-center text-black font-black uppercase text-xs" style={{ verticalAlign: 'middle', lineHeight: '1' }}>Líquida</th>
                      <th className="px-4 text-center text-black font-black uppercase text-xs" style={{ verticalAlign: 'middle', lineHeight: '1' }}>Qtd de Peças</th>
                      <th className="px-4 text-center text-black font-black uppercase text-xs" style={{ verticalAlign: 'middle', lineHeight: '1' }}>Falta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasUnificadas.filter((l) => l.processo === 'CK').map((l) => {
                      const corLiq = l.liquida === 0 ? 'bg-gray-100 text-gray-500' : l.liquida >= l.metaLiq ? 'bg-green-200 text-green-900' : 'bg-red-200 text-red-900';
                      const corVol = l.qtd === 0 ? 'bg-gray-100 text-gray-500' : l.qtd >= l.metaVol ? 'bg-green-200 text-green-900' : 'bg-red-200 text-red-900';
                      const falta = Math.max(0, l.metaVol - l.qtd);
                      const corFalta = falta === 0 ? 'bg-green-200 text-green-900' : 'bg-red-200 text-red-900';

                      return (
                        <tr key={`ck-${l.id}`} className="border-b border-gray-300" style={{ height: '36px' }}>
                          <td className="px-4 text-center text-gray-800 font-bold text-sm" style={{ verticalAlign: 'middle', lineHeight: '1' }}>{l.id}</td>
                          <td className={`px-4 text-center font-bold text-sm ${corLiq}`} style={{ verticalAlign: 'middle', lineHeight: '1' }}>
                            {l.liquida > 0 ? l.liquida : '-'}
                          </td>
                          <td className={`px-4 text-center font-bold text-sm ${corVol}`} style={{ verticalAlign: 'middle', lineHeight: '1' }}>
                            {l.qtd > 0 ? l.qtd.toLocaleString('pt-BR') : '-'}
                          </td>
                          <td className={`px-4 text-center font-bold text-sm ${corFalta}`} style={{ verticalAlign: 'middle', lineHeight: '1' }}>
                            {falta > 0 ? falta.toLocaleString('pt-BR') : '0'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* P2M TABLE */}
            {linhasUnificadas.filter((l) => l.processo === 'P2M').length > 0 && (
              <div className="bg-white rounded-xl overflow-hidden border-2 border-orange-500/40">
                <div className="bg-orange-500 px-4 py-2">
                  <h3 className="text-black font-black text-sm uppercase flex items-center gap-2">
                    🚚 P2M
                    <span className="text-xs font-normal opacity-80">
                      · {linhasUnificadas.filter((l) => l.processo === 'P2M').length} colaboradores · Meta Líq: {metas.p2mLiq} · Meta Vol: {metas.p2mVol.toLocaleString('pt-BR')} · Meta Oc: {metas.ocupMeta}%
                    </span>
                  </h3>
                </div>
                <table className="w-full text-sm" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="bg-[#FFD700]" style={{ height: '40px' }}>
                      <th className="px-4 text-center text-black font-black uppercase text-xs" style={{ verticalAlign: 'middle', lineHeight: '1' }}>ID</th>
                      <th className="px-4 text-center text-black font-black uppercase text-xs" style={{ verticalAlign: 'middle', lineHeight: '1' }}>Líquida</th>
                      <th className="px-4 text-center text-black font-black uppercase text-xs" style={{ verticalAlign: 'middle', lineHeight: '1' }}>Qtd de Peças</th>
                      <th className="px-4 text-center text-black font-black uppercase text-xs" style={{ verticalAlign: 'middle', lineHeight: '1' }}>Falta</th>
                      <th className="px-4 text-center text-black font-black uppercase text-xs" style={{ verticalAlign: 'middle', lineHeight: '1' }}>Ocupação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasUnificadas.filter((l) => l.processo === 'P2M').map((l) => {
                      const corLiq = l.liquida === 0 ? 'bg-gray-100 text-gray-500' : l.liquida >= l.metaLiq ? 'bg-green-200 text-green-900' : 'bg-red-200 text-red-900';
                      const corVol = l.qtd === 0 ? 'bg-gray-100 text-gray-500' : l.qtd >= l.metaVol ? 'bg-green-200 text-green-900' : 'bg-red-200 text-red-900';
                      const corOcup = l.ocupacao === 0 ? 'bg-gray-100 text-gray-500' : l.ocupacao >= metas.ocupMeta ? 'bg-green-200 text-green-900' : 'bg-red-200 text-red-900';
                      const falta = Math.max(0, l.metaVol - l.qtd);
                      const corFalta = falta === 0 ? 'bg-green-200 text-green-900' : 'bg-red-200 text-red-900';

                      return (
                        <tr key={`p2m-${l.id}`} className="border-b border-gray-300" style={{ height: '36px' }}>
                          <td className="px-4 text-center text-gray-800 font-bold text-sm" style={{ verticalAlign: 'middle', lineHeight: '1' }}>{l.id}</td>
                          <td className={`px-4 text-center font-bold text-sm ${corLiq}`} style={{ verticalAlign: 'middle', lineHeight: '1' }}>
                            {l.liquida > 0 ? l.liquida : '-'}
                          </td>
                          <td className={`px-4 text-center font-bold text-sm ${corVol}`} style={{ verticalAlign: 'middle', lineHeight: '1' }}>
                            {l.qtd > 0 ? l.qtd.toLocaleString('pt-BR') : '-'}
                          </td>
                          <td className={`px-4 text-center font-bold text-sm ${corFalta}`} style={{ verticalAlign: 'middle', lineHeight: '1' }}>
                            {falta > 0 ? falta.toLocaleString('pt-BR') : '0'}
                          </td>
                          <td className={`px-4 text-center font-bold text-sm ${corOcup}`} style={{ verticalAlign: 'middle', lineHeight: '1' }}>
                            {l.ocupacao > 0 ? `${l.ocupacao.toFixed(0)}%` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 bg-[#0a0a0a]/30 rounded-xl border-2 border-dashed border-[#2a2a2a]">
            <div className="text-5xl mb-3">📂</div>
            <p className="text-gray-400 text-sm">Faça upload dos CSVs acima pra começar</p>
            <p className="text-xs text-gray-500 mt-1">📦 Check-in · 🚚 P2M · 📈 Ocupação</p>
          </div>
        )}

        <div className="text-center text-[10px] text-gray-600 mt-4">
          📊 LIDER 360 · Boletim Diário · Gerado em {new Date().toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
