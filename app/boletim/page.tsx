'use client';
import { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import LoadingOverlay, { Fase } from '../components/LoadingOverlay';
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
const LIMITE_2_COLUNAS = 15; // 🎯 Acima disso, divide em 2 colunas (só quando 1 setor)
// 🎨 PALETA MELI
const MELI = {
  amarelo: '#FFE600',
  amareloEscuro: '#FFD100',
  azul: '#2D3277',
  azulClaro: '#3483FA',
};
const LOGO_MELI = '/logos/pngwing.com.png'; // logo no /public do projeto
const METAS_PADRAO: Metas = {
  checkinLiq: 296,
  checkinVol: 2100,
  p2mLiq: 329,
  p2mVol: 2400,
  ocupMeta: 80,
  netCT: 135,
  totalPecas: 0,
};
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
  const [netRealizadoManual, setNetRealizadoManual] = useState<number | null>(null);
  const [pecasRealizadoManual, setPecasRealizadoManual] = useState<number | null>(null);
  // 🆕 overlay de carregamento (lendo CSV / gerando imagem / sucesso)
  const [fase, setFase] = useState<Fase>(null);
  const [overlayTxt, setOverlayTxt] = useState({ titulo: '', sub: '' });
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
    const nomeTipo = tipo === 'checkin' ? 'Check-in' : tipo === 'p2m' ? 'P2M' : 'Ocupação';
    setFase('lendo');
    setOverlayTxt({ titulo: `Lendo CSV de ${nomeTipo}...`, sub: 'Processando os dados do arquivo' });
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
            const id = pegarValor(row, ['user_id', 'User_Id', 'USER_ID', 'id_groot', 'id', 'Id_Groot']);
            const idLimpo = normalizarIdGroot(id);
            if (!idLimpo) return;
            const ocupTxt = pegarValor(row, ['ocupacao', 'ocupação', 'ocupacao_pct', 'ocupação (%)', 'occupation']);
            const ocup = parseNumber(ocupTxt);
            if (ocup > 0) linhas.push({ id: idLimpo, liquida: 0, qtd: 0, ocupacao: ocup });
          } else {
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
          setFase(null);
          alert(`❌ Nenhum dado encontrado no CSV!\n\nHeaders detectados:\n${Object.keys(result.data[0] || {}).join(', ')}\n\nVerifique no console (F12) os headers.`);
          return;
        }
        setDados((prev) => ({ ...prev, [tipo]: linhas }));
        // pisca sucesso rápido
        setFase('sucesso');
        setOverlayTxt({ titulo: `${nomeTipo} carregado!`, sub: `${linhas.length} registros lidos` });
        setTimeout(() => setFase(null), 1200);
      },
      error: () => {
        setFase(null);
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
    dados.ocupacao.forEach((o) => {
      const chaveP2M = `${o.id}_P2M`;
      if (mapa[chaveP2M]) {
        mapa[chaveP2M].ocupacao = o.ocupacao;
      } else {
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
  // 🎯 DETECÇÃO DE LAYOUT
  const checkins = linhasUnificadas.filter((l) => l.processo === 'CK');
  const p2ms = linhasUnificadas.filter((l) => l.processo === 'P2M');
  const temCheckin = checkins.length > 0;
  const temP2M = p2ms.length > 0;
  const setoresAtivos = [
    temCheckin && 'CK',
    temP2M && 'P2M',
  ].filter(Boolean);
  // 🎯 DIVIDIR EM 2 COLUNAS: só 1 setor + mais de 15 pessoas
  const apenas1Setor = setoresAtivos.length === 1;
  const dividirEm2Colunas = apenas1Setor && (
    (setoresAtivos[0] === 'CK' && checkins.length > LIMITE_2_COLUNAS) ||
    (setoresAtivos[0] === 'P2M' && p2ms.length > LIMITE_2_COLUNAS)
  );
  async function salvarPNG() {
    if (!boletimRef.current) return;
    setFase('salvando');
    setOverlayTxt({ titulo: 'Gerando imagem...', sub: 'Montando o PNG do boletim' });
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(boletimRef.current, {
        backgroundColor: '#0a0a0a',
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `Boletim_TimeDEL_${dataRef.replace(/\//g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setFase('sucesso');
      setOverlayTxt({ titulo: 'PNG gerado!', sub: 'Download iniciado' });
      setTimeout(() => setFase(null), 1400);
    } catch (e) {
      console.error(e);
      setFase(null);
    }
  }
  async function copiarImagem() {
    if (!boletimRef.current) return;
    setFase('salvando');
    setOverlayTxt({ titulo: 'Copiando imagem...', sub: 'Preparando pra colar no WhatsApp' });
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(boletimRef.current, {
        backgroundColor: '#0a0a0a',
        scale: 2,
        useCORS: true,
      });
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setFase(null);
          return;
        }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          setFase('sucesso');
          setOverlayTxt({ titulo: 'Imagem copiada!', sub: 'Cola no WhatsApp (Ctrl+V)' });
          setTimeout(() => setFase(null), 1600);
        } catch {
          setFase(null);
          alert('❌ Não foi possível copiar. Use "Salvar PNG"');
        }
      });
    } catch (e) {
      console.error(e);
      setFase(null);
    }
  }
  if (!montou) return null;
  // 🎯 Função pra dividir array em duas metades
  function dividirEmDuas<T>(arr: T[]): [T[], T[]] {
    const meio = Math.ceil(arr.length / 2);
    return [arr.slice(0, meio), arr.slice(meio)];
  }
  // 🎯 Componente que renderiza linha da tabela P2M
  function LinhaP2M({ l, idx }: { l: LinhaUnificada; idx: number }) {
    const corLiq = l.liquida === 0 ? 'bg-gray-100 text-gray-500' : l.liquida >= l.metaLiq ? 'bg-green-200 text-green-900' : 'bg-red-200 text-red-900';
    const corVol = l.qtd === 0 ? 'bg-gray-100 text-gray-500' : l.qtd >= l.metaVol ? 'bg-green-200 text-green-900' : 'bg-red-200 text-red-900';
    const corOcup = l.ocupacao === 0 ? 'bg-gray-100 text-gray-500' : l.ocupacao >= metas.ocupMeta ? 'bg-green-200 text-green-900' : 'bg-red-200 text-red-900';
    const falta = Math.max(0, l.metaVol - l.qtd);
    const corFalta = falta === 0 ? 'bg-green-200 text-green-900' : 'bg-red-200 text-red-900';
    return (
      <tr key={`p2m-${l.id}-${idx}`} className="border-b border-gray-300" style={{ height: '36px' }}>
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
  }
  // 🎯 Componente que renderiza linha da tabela Checkin
  function LinhaCK({ l, idx }: { l: LinhaUnificada; idx: number }) {
    const corLiq = l.liquida === 0 ? 'bg-gray-100 text-gray-500' : l.liquida >= l.metaLiq ? 'bg-green-200 text-green-900' : 'bg-red-200 text-red-900';
    const corVol = l.qtd === 0 ? 'bg-gray-100 text-gray-500' : l.qtd >= l.metaVol ? 'bg-green-200 text-green-900' : 'bg-red-200 text-red-900';
    const falta = Math.max(0, l.metaVol - l.qtd);
    const corFalta = falta === 0 ? 'bg-green-200 text-green-900' : 'bg-red-200 text-red-900';
    return (
      <tr key={`ck-${l.id}-${idx}`} className="border-b border-gray-300" style={{ height: '36px' }}>
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
  }
  // 🎯 Header da tabela P2M (azul MELI · compartilhado entre as 2 colunas)
  const HeaderP2M = () => (
    <thead>
      <tr style={{ height: '40px', backgroundColor: MELI.amarelo }}>
        <th className="px-4 text-center font-black uppercase text-xs" style={{ verticalAlign: 'middle', lineHeight: '1', color: MELI.azul }}>ID</th>
        <th className="px-4 text-center font-black uppercase text-xs" style={{ verticalAlign: 'middle', lineHeight: '1', color: MELI.azul }}>Líquida</th>
        <th className="px-4 text-center font-black uppercase text-xs" style={{ verticalAlign: 'middle', lineHeight: '1', color: MELI.azul }}>Qtd de Peças</th>
        <th className="px-4 text-center font-black uppercase text-xs" style={{ verticalAlign: 'middle', lineHeight: '1', color: MELI.azul }}>Falta</th>
        <th className="px-4 text-center font-black uppercase text-xs" style={{ verticalAlign: 'middle', lineHeight: '1', color: MELI.azul }}>Ocupação</th>
      </tr>
    </thead>
  );
  // 🎯 Header da tabela Checkin (azul MELI · compartilhado entre as 2 colunas)
  const HeaderCK = () => (
    <thead>
      <tr style={{ height: '40px', backgroundColor: MELI.amarelo }}>
        <th className="px-4 text-center font-black uppercase text-xs" style={{ verticalAlign: 'middle', lineHeight: '1', color: MELI.azul }}>ID</th>
        <th className="px-4 text-center font-black uppercase text-xs" style={{ verticalAlign: 'middle', lineHeight: '1', color: MELI.azul }}>Líquida</th>
        <th className="px-4 text-center font-black uppercase text-xs" style={{ verticalAlign: 'middle', lineHeight: '1', color: MELI.azul }}>Qtd de Peças</th>
        <th className="px-4 text-center font-black uppercase text-xs" style={{ verticalAlign: 'middle', lineHeight: '1', color: MELI.azul }}>Falta</th>
      </tr>
    </thead>
  );
  // 🎯 CARD VISUAL DE METAS (substitui as linhas de texto repetidas)
  // Mostra setor + nº de colaboradores + mini-cards de cada meta, tudo visual.
  function CardMetas({ tipo, qtd }: { tipo: 'CK' | 'P2M'; qtd: number }) {
    const isP2M = tipo === 'P2M';
    const icone = isP2M ? '🚚' : '📦';
    const nome = isP2M ? 'P2M' : 'CHECK-IN';
    const metaLiq = isP2M ? metas.p2mLiq : metas.checkinLiq;
    const metaVol = isP2M ? metas.p2mVol : metas.checkinVol;
    // MiniCard com alturas/lineHeight FIXOS (mesma técnica dos cards NET) → alinha certo no PNG (html2canvas)
    const MiniCard = ({ label, valor, cor }: { label: string; valor: string; cor: string }) => (
      <div className="flex-1 text-center rounded-lg" style={{ paddingTop: '10px', paddingBottom: '10px', paddingLeft: '8px', paddingRight: '8px', backgroundColor: 'rgba(255,255,255,0.04)', border: `1px solid ${cor}44` }}>
        <div className="uppercase font-bold" style={{ fontSize: '9px', color: '#9ca3af', letterSpacing: '0.05em', height: '14px', lineHeight: '14px', margin: '0', padding: '0', display: 'block' }}>{label}</div>
        <div className="font-black font-mono" style={{ fontSize: '22px', color: cor, height: '28px', lineHeight: '28px', margin: '0', marginTop: '4px', padding: '0', display: 'block' }}>{valor}</div>
      </div>
    );
    return (
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${MELI.azul}`, background: 'linear-gradient(135deg, rgba(45,50,119,0.18) 0%, rgba(15,15,26,0.4) 100%)' }}>
        <div className="flex items-center" style={{ paddingTop: '10px', paddingBottom: '10px', paddingLeft: '16px', paddingRight: '16px', backgroundColor: MELI.azul, gap: '10px' }}>
          <span style={{ fontSize: '22px', height: '26px', lineHeight: '26px', display: 'inline-block' }}>{icone}</span>
          <span className="font-black" style={{ fontSize: '18px', color: MELI.amarelo, letterSpacing: '0.03em', height: '26px', lineHeight: '26px', display: 'inline-block' }}>{nome}</span>
          <span className="rounded-full font-black" style={{ marginLeft: 'auto', backgroundColor: 'rgba(255,255,255,0.12)', paddingLeft: '14px', paddingRight: '14px', height: '26px', lineHeight: '26px', display: 'inline-block', whiteSpace: 'nowrap', fontSize: '13px', color: '#fff' }}>
            👥&nbsp;{qtd}<span style={{ color: 'rgba(255,255,255,0.65)', fontWeight: 700 }}>&nbsp;colabs</span>
          </span>
        </div>
        <div className="flex" style={{ padding: '12px', gap: '8px' }}>
          <MiniCard label="Meta Líquida" valor={String(metaLiq)} cor={MELI.amarelo} />
          <MiniCard label="Meta Volume" valor={metaVol.toLocaleString('pt-BR')} cor={MELI.azulClaro} />
          {isP2M && <MiniCard label="Meta Ocupação" valor={`${metas.ocupMeta}%`} cor="#34d399" />}
        </div>
      </div>
    );
  }
  return (
    <div className="p-6 space-y-6 min-h-screen bg-[#0a0a0a]">
      <LoadingOverlay
        fase={fase}
        lendoTitulo={overlayTxt.titulo || 'Lendo arquivo...'}
        lendoSub={overlayTxt.sub || 'Processando'}
        salvandoTitulo={overlayTxt.titulo || 'Gerando imagem...'}
        salvandoSub={overlayTxt.sub || 'Aguarde'}
        sucessoTitulo={overlayTxt.titulo || 'Pronto!'}
        sucessoSub={overlayTxt.sub || 'Concluído'}
      />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-black text-[#FFD700]">📊 Boletim Diário</h1>
        <input
          type="text"
          value={dataRef}
          onChange={(e) => setDataRef(e.target.value)}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-white text-sm font-mono focus:border-[#FFD700] focus:outline-none"
        />
      </div>
      {/* 🎯 ALERTA do layout adaptativo */}
      {dividirEm2Colunas && (
        <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/30 rounded-xl p-3 flex items-center gap-3">
          <span className="text-2xl">💡</span>
          <div className="flex-1 text-sm">
            <p className="text-blue-300 font-bold">Layout otimizado ativo</p>
            <p className="text-gray-400 text-xs">
              {setoresAtivos[0] === 'P2M' ? p2ms.length : checkins.length} pessoas em {setoresAtivos[0] === 'P2M' ? 'P2M' : 'Checkin'} — dividindo em 2 colunas pra melhor visualização
            </p>
          </div>
        </div>
      )}
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
            <label className="group cursor-pointer w-12 h-12 flex items-center justify-center bg-gradient-to-br from-blue-500/20 to-blue-600/10 hover:from-blue-500/40 hover:to-blue-600/30 text-blue-300 rounded-xl transition-all duration-200 text-2xl border border-blue-500/30 hover:border-blue-400 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/20 active:translate-y-0 active:scale-90" title="Upload CSV Check-in">
              <span className="group-hover:scale-110 transition-transform">📤</span>
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
        {/* P2M */}
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
              <label className="group cursor-pointer w-12 h-12 flex items-center justify-center bg-gradient-to-br from-orange-500/20 to-orange-600/10 hover:from-orange-500/40 hover:to-orange-600/30 text-orange-300 rounded-xl transition-all duration-200 text-2xl border border-orange-500/30 hover:border-orange-400 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-orange-500/20 active:translate-y-0 active:scale-90" title="Upload Produtividade P2M">
                <span className="group-hover:scale-110 transition-transform">📤</span>
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
              <label className="group cursor-pointer w-12 h-12 flex items-center justify-center bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 hover:from-emerald-500/40 hover:to-emerald-600/30 text-emerald-300 rounded-xl transition-all duration-200 text-2xl border border-emerald-500/30 hover:border-emerald-400 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/20 active:translate-y-0 active:scale-90" title="Upload Ocupação P2M (Totefullness)">
                <span className="group-hover:scale-110 transition-transform">📦</span>
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
          className="group bg-[#FFD700] hover:bg-yellow-400 disabled:opacity-30 disabled:cursor-not-allowed text-black font-black px-4 py-2 rounded-lg text-sm transition-all duration-150 shadow-lg shadow-yellow-500/20 hover:shadow-yellow-500/40 hover:-translate-y-0.5 active:scale-95 flex items-center gap-2"
        >
          <span className="group-hover:scale-110 transition-transform">🖼️</span> Salvar PNG
        </button>
        <button
          onClick={copiarImagem}
          disabled={linhasUnificadas.length === 0}
          className="group bg-[#1a1a1a] hover:bg-[#2a2a2a] disabled:opacity-30 disabled:cursor-not-allowed border border-[#2a2a2a] hover:border-[#3a3a3a] text-white font-bold px-4 py-2 rounded-lg text-sm transition-all duration-150 hover:-translate-y-0.5 active:scale-95 flex items-center gap-2"
        >
          <span className="group-hover:scale-110 transition-transform">📋</span> Copiar imagem
        </button>
        <button
          onClick={limpar}
          className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-bold px-4 py-2 rounded-lg text-sm transition-all duration-150 active:scale-95"
        >
          🗑️ Limpar tudo
        </button>
      </div>
      {/* ======================================================= */}
      {/* BOLETIM (o que vira PNG) — visual MELI profissional */}
      {/* ======================================================= */}
      <div ref={boletimRef} className="rounded-2xl p-6 shadow-2xl" style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #0a0a14 50%, #10122b 100%)', border: `2px solid ${MELI.amarelo}` }}>
        {/* HEADER PROFISSIONAL COM LOGO MELI + TIME DEL */}
        <div className="rounded-xl mb-6 overflow-hidden" style={{ border: `1px solid ${MELI.amarelo}55` }}>
          {/* faixa amarela superior */}
          <div className="flex items-center justify-between px-5 py-4 gap-4" style={{ background: `linear-gradient(90deg, ${MELI.amarelo} 0%, ${MELI.amareloEscuro} 100%)` }}>
            <div className="flex items-center gap-4">
              {/* logo MELI */}
              <div className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: '58px', height: '58px', backgroundColor: '#ffffff', padding: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={LOGO_MELI} alt="Mercado Livre" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <div>
                <h2 className="font-black tracking-wide" style={{ color: MELI.azul, fontSize: '26px', lineHeight: '1.1' }}>
                  BOLETIM DO DIA
                </h2>
                <p className="font-bold" style={{ color: '#1a1a2e', fontSize: '13px', opacity: 0.75 }}>
                  📅 {dataRef}
                </p>
              </div>
            </div>
            {/* selo TIME DEL */}
            <div className="flex flex-col items-center justify-center rounded-xl px-5 py-2 flex-shrink-0" style={{ backgroundColor: MELI.azul, boxShadow: '0 3px 10px rgba(45,50,119,0.4)' }}>
              <span className="font-black tracking-widest" style={{ color: MELI.amarelo, fontSize: '20px', lineHeight: '1' }}>TIME DEL</span>
              <span className="font-bold tracking-wide" style={{ color: '#ffffff', fontSize: '9px', opacity: 0.8, marginTop: '2px' }}>T1 · PRODUÇÃO</span>
            </div>
          </div>
        </div>
        {/* CARDS NET + TOTAL PEÇAS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {/* NET */}
          <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg, rgba(255,230,0,0.15) 0%, rgba(255,209,0,0.06) 100%)', border: `2px solid ${MELI.amarelo}66` }}>
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="text-xs font-black uppercase tracking-widest" style={{ color: MELI.amarelo }}>
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
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => salvarMetas({ ...metas, netCT: Number(e.currentTarget.textContent) || 0 })}
                  className="w-full bg-transparent text-2xl font-black font-mono text-center focus:outline-none focus:bg-[#0a0a0a]/50 rounded cursor-text"
                  style={{ height: '36px', lineHeight: '36px', padding: '0', display: 'block', margin: '0', color: MELI.amarelo }}
                >
                  {metas.netCT}
                </div>
              </div>
              <div className="text-center" style={{ borderLeft: `1px solid ${MELI.amarelo}33`, borderRight: `1px solid ${MELI.amarelo}33` }}>
                <div className="text-xs text-gray-400 uppercase font-bold" style={{ height: '18px', lineHeight: '18px' }}>
                  Realizado <span className="text-yellow-400" data-html2canvas-ignore="true">{netRealizadoManual !== null ? '✏️' : ''}</span>
                </div>
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    const v = e.currentTarget.textContent?.trim() || '';
                    setNetRealizadoManual(v === '' || v === '-' ? null : Number(v));
                  }}
                  className={`w-full bg-transparent text-2xl font-black font-mono text-center focus:outline-none focus:bg-[#0a0a0a]/50 rounded cursor-text ${
                    netRealizado >= metas.netCT && netRealizado > 0 ? 'text-green-400' : netRealizado > 0 ? 'text-red-400' : 'text-gray-500'
                  }`}
                  style={{ height: '36px', lineHeight: '36px', padding: '0', display: 'block', margin: '0' }}
                >
                  {netRealizado || '-'}
                </div>
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
          {/* TOTAL PEÇAS */}
          <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg, rgba(45,50,119,0.35) 0%, rgba(45,50,119,0.12) 100%)', border: `2px solid ${MELI.azul}` }}>
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="text-xs font-black uppercase tracking-widest" style={{ color: MELI.azulClaro }}>
                📦 Total de Peças (P2M)
              </span>
              {pecasRealizadoManual !== null && (
                <button
                  onClick={() => setPecasRealizadoManual(null)}
                  className="text-[10px] bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 px-2 py-0.5 rounded-full font-bold transition-colors"
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
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => salvarMetas({ ...metas, totalPecas: Number(e.currentTarget.textContent) || 0 })}
                  className="w-full bg-transparent text-2xl font-black font-mono text-center focus:outline-none focus:bg-[#0a0a0a]/50 rounded cursor-text"
                  style={{ height: '36px', lineHeight: '36px', padding: '0', display: 'block', margin: '0', color: MELI.azulClaro }}
                >
                  {metas.totalPecas}
                </div>
              </div>
              <div className="text-center" style={{ borderLeft: `1px solid ${MELI.azul}`, borderRight: `1px solid ${MELI.azul}` }}>
                <div className="text-xs text-gray-400 uppercase font-bold" style={{ height: '18px', lineHeight: '18px' }}>
                  Realizado <span className="text-blue-400" data-html2canvas-ignore="true">{pecasRealizadoManual !== null ? '✏️' : ''}</span>
                </div>
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    const v = e.currentTarget.textContent?.trim() || '';
                    setPecasRealizadoManual(v === '' || v === '-' ? null : Number(v.replace(/\./g, '')));
                  }}
                  className={`w-full bg-transparent text-2xl font-black font-mono text-center focus:outline-none focus:bg-[#0a0a0a]/50 rounded cursor-text ${
                    totalPecasRealizado >= metas.totalPecas && metas.totalPecas > 0 && totalPecasRealizado > 0 ? 'text-green-400' : totalPecasRealizado > 0 ? 'text-red-400' : 'text-gray-500'
                  }`}
                  style={{ height: '36px', lineHeight: '36px', padding: '0', display: 'block', margin: '0' }}
                >
                  {totalPecasRealizado > 0 ? totalPecasRealizado.toLocaleString('pt-BR') : '-'}
                </div>
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
        {/* RESUMO DE METAS — só mostra os setores COM dados */}
        {/* CARD(S) VISUAL(IS) DE METAS — substitui as linhas de texto repetidas */}
        {(temCheckin || temP2M) && (
          <div className={`grid grid-cols-1 ${temCheckin && temP2M ? 'md:grid-cols-2' : ''} gap-3 mb-5`}>
            {temCheckin && <CardMetas tipo="CK" qtd={checkins.length} />}
            {temP2M && <CardMetas tipo="P2M" qtd={p2ms.length} />}
          </div>
        )}
        {linhasUnificadas.length > 0 ? (
          <>
            {/* 🎯 LAYOUT ADAPTATIVO */}
            {dividirEm2Colunas && setoresAtivos[0] === 'P2M' ? (
              /* SÓ P2M COM 15+ → 2 COLUNAS */
              <div className="bg-white rounded-xl overflow-hidden" style={{ border: `1px solid ${MELI.azul}` }}>
                <div className="grid grid-cols-2 gap-0">
                  {(() => {
                    const [primeira, segunda] = dividirEmDuas(p2ms);
                    return (
                      <>
                        <table className="w-full text-sm border-r border-gray-300" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                          <HeaderP2M />
                          <tbody>
                            {primeira.map((l, idx) => <LinhaP2M key={`p2m-1-${l.id}-${idx}`} l={l} idx={idx} />)}
                          </tbody>
                        </table>
                        <table className="w-full text-sm" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                          <HeaderP2M />
                          <tbody>
                            {segunda.map((l, idx) => <LinhaP2M key={`p2m-2-${l.id}-${idx}`} l={l} idx={idx} />)}
                          </tbody>
                        </table>
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : dividirEm2Colunas && setoresAtivos[0] === 'CK' ? (
              /* SÓ CHECKIN COM 15+ → 2 COLUNAS */
              <div className="bg-white rounded-xl overflow-hidden" style={{ border: `1px solid ${MELI.azul}` }}>
                <div className="grid grid-cols-2 gap-0">
                  {(() => {
                    const [primeira, segunda] = dividirEmDuas(checkins);
                    return (
                      <>
                        <table className="w-full text-sm border-r border-gray-300" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                          <HeaderCK />
                          <tbody>
                            {primeira.map((l, idx) => <LinhaCK key={`ck-1-${l.id}-${idx}`} l={l} idx={idx} />)}
                          </tbody>
                        </table>
                        <table className="w-full text-sm" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                          <HeaderCK />
                          <tbody>
                            {segunda.map((l, idx) => <LinhaCK key={`ck-2-${l.id}-${idx}`} l={l} idx={idx} />)}
                          </tbody>
                        </table>
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : (
              /* LAYOUT NORMAL: 2 setores lado a lado OU 1 setor com poucas pessoas */
              <div className={`grid grid-cols-1 ${temCheckin && temP2M ? 'lg:grid-cols-2' : ''} gap-4`}>
                {temCheckin && (
                  <div className="bg-white rounded-xl overflow-hidden" style={{ border: `1px solid ${MELI.azul}` }}>
                    <table className="w-full text-sm" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                      <HeaderCK />
                      <tbody>
                        {checkins.map((l, idx) => <LinhaCK key={`ck-${l.id}-${idx}`} l={l} idx={idx} />)}
                      </tbody>
                    </table>
                  </div>
                )}
                {temP2M && (
                  <div className="bg-white rounded-xl overflow-hidden" style={{ border: `1px solid ${MELI.azul}` }}>
                    <table className="w-full text-sm" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                      <HeaderP2M />
                      <tbody>
                        {p2ms.map((l, idx) => <LinhaP2M key={`p2m-${l.id}-${idx}`} l={l} idx={idx} />)}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 bg-[#0a0a0a]/30 rounded-xl border-2 border-dashed border-[#2a2a2a]">
            <div className="text-5xl mb-3">📂</div>
            <p className="text-gray-400 text-sm">Faça upload dos CSVs acima pra começar</p>
            <p className="text-xs text-gray-500 mt-1">📦 Check-in · 🚚 P2M · 📈 Ocupação</p>
          </div>
        )}
        {/* rodapé com marca */}
        <div className="flex items-center justify-center gap-2 mt-4">
          <div className="rounded-full flex items-center justify-center" style={{ width: '18px', height: '18px', backgroundColor: '#fff', padding: '2px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_MELI} alt="ML" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <span className="text-[10px] text-gray-500">
            LIDER 360 · Time DEL · Boletim Diário · {new Date().toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
}
