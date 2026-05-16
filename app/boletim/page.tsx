'use client';

import { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';

type LinhaColab = {
  id: string;
  liquida: number;
  qtd: number;
};

type DadosBoletim = {
  checkin: LinhaColab[];
  p2m: LinhaColab[];
  sorter: LinhaColab[];
};

type Metas = {
  checkinLiq: number;
  checkinVol: number;
  p2mLiq: number;
  p2mVol: number;
  sorterUtil: number;
  netCT: number;
};

const METAS_KEY = 'lider360_boletim_metas_v2';

const METAS_PADRAO: Metas = {
  checkinLiq: 296,
  checkinVol: 2100,
  p2mLiq: 329,
  p2mVol: 2400,
  sorterUtil: 85,
  netCT: 135,
};

// Normaliza header de CSV pra busca flexível
function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Pega o valor de uma coluna usando MUITOS aliases
function pegarCol(row: Record<string, string>, aliases: string[]): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const aliasN = norm(alias);
    const k = keys.find((kk) => norm(kk) === aliasN);
    if (k && row[k] != null && String(row[k]).trim() !== '') return String(row[k]);
  }
  return '';
}

function parseNum(s: string): number {
  if (!s) return 0;
  const limpo = String(s).replace(/\./g, '').replace(',', '.').replace('%', '').trim();
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
}

function parseCsvBoletim(linhas: Record<string, string>[]): LinhaColab[] {
  const result: LinhaColab[] = [];
  linhas.forEach((row) => {
    const id = pegarCol(row, ['id', 'id_groot', 'id groot', 'groot']);
    if (!id) return;
    const liquida = parseNum(
      pegarCol(row, [
        'prod_liquida_sist',
        'prod liquida sist',
        'prod_liquida',
        'prod liquida',
        'liquida',
        'produtividade liquida',
      ])
    );
    const qtd = parseNum(
      pegarCol(row, [
        'unidades',
        'qtd',
        'qtd de pecas',
        'qtd de peças',
        'quantidade',
        'volume',
        'pecas',
        'peças',
      ])
    );
    if (qtd <= 0 && liquida <= 0) return;
    result.push({ id: String(id).trim(), liquida: Math.round(liquida), qtd: Math.round(qtd) });
  });
  // Ordena por volume desc
  result.sort((a, b) => b.qtd - a.qtd);
  return result;
}

export default function BoletimPage() {
  const [dados, setDados] = useState<DadosBoletim>({
    checkin: [],
    p2m: [],
    sorter: [],
  });
  const [metas, setMetas] = useState<Metas>(METAS_PADRAO);
  const [netRealizado, setNetRealizado] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerandoImagem, setGerandoImagem] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const areaRef = useRef<HTMLDivElement>(null);

  // Carrega metas do localStorage
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(METAS_KEY);
      if (salvo) {
        const parsed = JSON.parse(salvo);
        setMetas({ ...METAS_PADRAO, ...parsed });
      }
    } catch {}
  }, []);

  // Salva metas ao mudar
  function atualizarMeta<K extends keyof Metas>(chave: K, valor: number) {
    const novas = { ...metas, [chave]: valor };
    setMetas(novas);
    try {
      localStorage.setItem(METAS_KEY, JSON.stringify(novas));
    } catch {}
  }

  function uploadSetor(setor: keyof DadosBoletim, file: File) {
    setErro(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.errors.length > 0) {
          setErro('Erro ao ler CSV: ' + result.errors[0].message);
          return;
        }
        const parsed = parseCsvBoletim(result.data);
        if (parsed.length === 0) {
          setErro(`CSV de ${setor.toUpperCase()} sem dados válidos`);
          return;
        }
        setDados((prev) => ({ ...prev, [setor]: parsed }));
        setMensagem(`✓ CSV de ${setor.toUpperCase()} carregado (${parsed.length} linhas)`);
        setTimeout(() => setMensagem(null), 3000);
      },
    });
  }

  function limparTudo() {
    if (!window.confirm('Limpar todos os dados do boletim? (metas mantidas)')) return;
    setDados({ checkin: [], p2m: [], sorter: [] });
    setNetRealizado(null);
    setErro(null);
  }

  async function salvarPng() {
    if (!areaRef.current) return;
    setGerandoImagem(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(areaRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const link = document.createElement('a');
      const agora = new Date();
      const tag =
        agora.getFullYear().toString() +
        (agora.getMonth() + 1).toString().padStart(2, '0') +
        agora.getDate().toString().padStart(2, '0') +
        '-' +
        agora.getHours().toString().padStart(2, '0') +
        agora.getMinutes().toString().padStart(2, '0');
      link.download = `boletim-producao-${tag}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setMensagem('✓ PNG baixado!');
      setTimeout(() => setMensagem(null), 3000);
    } catch (e) {
      setErro('Erro ao gerar PNG: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally {
      setGerandoImagem(false);
    }
  }

  async function copiarImagem() {
    if (!areaRef.current) return;
    setGerandoImagem(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(areaRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
      });
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setErro('Erro ao gerar imagem');
          return;
        }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          setMensagem('✓ Imagem copiada! Cola no WhatsApp (Ctrl+V)');
          setTimeout(() => setMensagem(null), 4000);
        } catch (err) {
          setErro(
            'Erro ao copiar: navegador pode não permitir. Use "Salvar PNG" e arrasta no WhatsApp.'
          );
        }
      }, 'image/png');
    } catch (e) {
      setErro('Erro: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally {
      setGerandoImagem(false);
    }
  }

  // ━━━━ CÁLCULOS ━━━━
  const totalPecasP2M = dados.p2m.reduce((s, l) => s + l.qtd, 0);
  const diferencaNet =
    netRealizado !== null ? netRealizado - metas.netCT : null;
  const diferencaPecas = totalPecasP2M - metas.p2mVol * dados.p2m.length;
  const metaTotalPecas = metas.p2mVol * dados.p2m.length;

  const hoje = new Date();
  const dataFormatada = hoje.toLocaleDateString('pt-BR');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black mb-2">
          📈 Boletim de <span className="text-[#FFD700]">Produção</span>
        </h1>
        <p className="text-gray-400">
          Gere o boletim diário pra mandar pro time. Sem nomes — só ID, líquida e
          qtd de peças.
        </p>
      </div>

      {/* Mensagens */}
      {mensagem && (
        <div className="bg-green-500/20 border border-green-500/40 text-green-300 rounded-lg p-3 text-sm font-bold">
          {mensagem}
        </div>
      )}
      {erro && (
        <div className="bg-red-500/20 border border-red-500/40 text-red-300 rounded-lg p-3 text-sm">
          {erro}
        </div>
      )}

      {/* 3 cards de upload */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* CHECK-IN */}
        <div
          className={`rounded-2xl p-4 border-2 ${
            dados.checkin.length > 0
              ? 'bg-green-500/10 border-green-500/40'
              : 'bg-[#1a1a1a] border-[#2a2a2a]'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  dados.checkin.length > 0 ? 'bg-green-500' : 'bg-[#2a2a2a]'
                }`}
              >
                <span className="text-xl">📦</span>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-bold">
                  Check-in
                </p>
                <p className="text-white text-sm font-bold">
                  {dados.checkin.length > 0
                    ? `${dados.checkin.length} colaboradores ✓`
                    : 'Aguardando CSV'}
                </p>
              </div>
            </div>
            <label className="cursor-pointer bg-[#FFD700] hover:bg-yellow-300 text-black w-10 h-10 rounded-lg flex items-center justify-center transition-colors">
              <span className="text-xl">📤</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) uploadSetor('checkin', e.target.files[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="block">
              <span className="text-gray-400">Líq:</span>
              <input
                type="number"
                value={metas.checkinLiq}
                onChange={(e) =>
                  atualizarMeta('checkinLiq', parseInt(e.target.value) || 0)
                }
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-white font-mono text-sm mt-1"
              />
            </label>
            <label className="block">
              <span className="text-gray-400">Vol:</span>
              <input
                type="number"
                value={metas.checkinVol}
                onChange={(e) =>
                  atualizarMeta('checkinVol', parseInt(e.target.value) || 0)
                }
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-white font-mono text-sm mt-1"
              />
            </label>
          </div>
        </div>

        {/* P2M */}
        <div
          className={`rounded-2xl p-4 border-2 ${
            dados.p2m.length > 0
              ? 'bg-green-500/10 border-green-500/40'
              : 'bg-[#1a1a1a] border-[#2a2a2a]'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  dados.p2m.length > 0 ? 'bg-green-500' : 'bg-[#2a2a2a]'
                }`}
              >
                <span className="text-xl">🚚</span>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-bold">P2M</p>
                <p className="text-white text-sm font-bold">
                  {dados.p2m.length > 0
                    ? `${dados.p2m.length} colaboradores ✓`
                    : 'Aguardando CSV'}
                </p>
              </div>
            </div>
            <label className="cursor-pointer bg-[#FFD700] hover:bg-yellow-300 text-black w-10 h-10 rounded-lg flex items-center justify-center transition-colors">
              <span className="text-xl">📤</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) uploadSetor('p2m', e.target.files[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="block">
              <span className="text-gray-400">Líq:</span>
              <input
                type="number"
                value={metas.p2mLiq}
                onChange={(e) =>
                  atualizarMeta('p2mLiq', parseInt(e.target.value) || 0)
                }
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-white font-mono text-sm mt-1"
              />
            </label>
            <label className="block">
              <span className="text-gray-400">Vol:</span>
              <input
                type="number"
                value={metas.p2mVol}
                onChange={(e) =>
                  atualizarMeta('p2mVol', parseInt(e.target.value) || 0)
                }
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-white font-mono text-sm mt-1"
              />
            </label>
          </div>
        </div>

        {/* SORTER */}
        <div
          className={`rounded-2xl p-4 border-2 ${
            dados.sorter.length > 0
              ? 'bg-green-500/10 border-green-500/40'
              : 'bg-[#1a1a1a] border-[#2a2a2a]'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  dados.sorter.length > 0 ? 'bg-green-500' : 'bg-[#2a2a2a]'
                }`}
              >
                <span className="text-xl">📋</span>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-bold">
                  Sorter
                </p>
                <p className="text-white text-sm font-bold">
                  {dados.sorter.length > 0
                    ? `${dados.sorter.length} colaboradores ✓`
                    : 'Aguardando CSV'}
                </p>
              </div>
            </div>
            <label className="cursor-pointer bg-[#FFD700] hover:bg-yellow-300 text-black w-10 h-10 rounded-lg flex items-center justify-center transition-colors">
              <span className="text-xl">📤</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) uploadSetor('sorter', e.target.files[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <div className="text-xs">
            <label className="block">
              <span className="text-gray-400">Util %:</span>
              <input
                type="number"
                value={metas.sorterUtil}
                onChange={(e) =>
                  atualizarMeta('sorterUtil', parseInt(e.target.value) || 0)
                }
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-white font-mono text-sm mt-1"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Banner NET + Total Peças */}
      <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl p-4 flex flex-col md:flex-row items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <span className="text-2xl">⚡</span>
          <span className="text-white font-bold text-sm">NET do Time —</span>
          <span className="text-gray-400 text-sm">Meta:</span>
          <input
            type="number"
            value={metas.netCT}
            onChange={(e) =>
              atualizarMeta('netCT', parseInt(e.target.value) || 0)
            }
            className="w-20 bg-[#1a1a1a] border-2 border-[#FFD700] rounded px-2 py-1 text-[#FFD700] font-bold font-mono text-center"
          />
          <span className="text-white text-sm">und/h</span>
        </div>

        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <span className="text-2xl">📦</span>
          <span className="text-white font-bold text-sm">Total de Peças —</span>
          <span className="text-gray-400 text-sm">Meta:</span>
          <input
            type="number"
            value={metaTotalPecas}
            readOnly
            className="w-24 bg-[#1a1a1a] border-2 border-[#FFD700] rounded px-2 py-1 text-[#FFD700] font-bold font-mono text-center"
          />
          <span className="text-white text-sm">peças</span>
        </div>
      </div>

      {/* Botões de ação */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={salvarPng}
          disabled={gerandoImagem}
          className="bg-[#FFD700] hover:bg-yellow-300 text-black font-bold px-5 py-3 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          <span>🖼️</span> {gerandoImagem ? 'Gerando...' : 'Salvar PNG'}
        </button>
        <button
          onClick={copiarImagem}
          disabled={gerandoImagem}
          className="bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white font-bold px-5 py-3 rounded-xl flex items-center gap-2 transition-colors border border-[#2a2a2a] disabled:opacity-50"
        >
          <span>📋</span> Copiar imagem
        </button>
        <button
          onClick={limparTudo}
          className="bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold px-5 py-3 rounded-xl flex items-center gap-2 transition-colors border border-red-500/30"
        >
          <span>🔄</span> Limpar tudo
        </button>
      </div>

      {/* ÁREA QUE VIRA IMAGEM */}
      <div
        ref={areaRef}
        style={{ backgroundColor: '#ffffff', color: '#1a1a1a' }}
        className="rounded-2xl p-6 space-y-4"
      >
        {/* Título */}
        <div
          style={{
            backgroundColor: '#1a1a1a',
            color: '#ffffff',
            padding: '12px',
            borderRadius: '8px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>
            Produção: {dataFormatada}
          </h2>
        </div>

        {/* Banner NET / Realizado / Diferença */}
        <div
          style={{
            backgroundColor: '#fff8e1',
            border: '1px solid #ffe082',
            borderRadius: '8px',
            padding: '16px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '8px',
            textAlign: 'center',
          }}
        >
          <div>
            <p
              style={{
                fontSize: '11px',
                color: '#666',
                fontWeight: 700,
                margin: 0,
              }}
            >
              META NET
            </p>
            <p
              style={{
                fontSize: '32px',
                fontWeight: 900,
                margin: '4px 0',
                color: '#1a1a1a',
              }}
            >
              {metas.netCT}
            </p>
            <p style={{ fontSize: '10px', color: '#666', margin: 0 }}>und/h</p>
          </div>
          <div style={{ borderLeft: '1px solid #ffe082', borderRight: '1px solid #ffe082' }}>
            <p
              style={{
                fontSize: '11px',
                color: '#666',
                fontWeight: 700,
                margin: 0,
              }}
            >
              REALIZADO
            </p>
            <input
              type="number"
              value={netRealizado ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setNetRealizado(v === '' ? null : parseFloat(v));
              }}
              placeholder="—"
              style={{
                fontSize: '32px',
                fontWeight: 900,
                margin: '4px 0',
                color: netRealizado === null
                  ? '#999'
                  : netRealizado >= metas.netCT
                  ? '#15803d'
                  : '#b91c1c',
                background: 'transparent',
                border: 'none',
                textAlign: 'center',
                borderBottom: '2px solid #1a1a1a',
                width: '100%',
                outline: 'none',
              }}
            />
            <p style={{ fontSize: '10px', color: '#666', margin: 0 }}>und/h</p>
          </div>
          <div>
            <p
              style={{
                fontSize: '11px',
                color: '#666',
                fontWeight: 700,
                margin: 0,
              }}
            >
              DIFERENÇA
            </p>
            <p
              style={{
                fontSize: '32px',
                fontWeight: 900,
                margin: '4px 0',
                color: diferencaNet === null
                  ? '#999'
                  : diferencaNet >= 0
                  ? '#15803d'
                  : '#b91c1c',
              }}
            >
              {diferencaNet === null
                ? '—'
                : (diferencaNet >= 0 ? '+' : '') + diferencaNet}
            </p>
            <p style={{ fontSize: '10px', color: '#666', margin: 0 }}>
              {diferencaNet === null
                ? ''
                : diferencaNet >= 0
                ? 'acima da meta'
                : 'abaixo da meta'}
            </p>
          </div>
        </div>

        {/* Banner Total de Peças */}
        <div
          style={{
            backgroundColor: '#e3f2fd',
            border: '1px solid #90caf9',
            borderRadius: '8px',
            padding: '16px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '8px',
            textAlign: 'center',
          }}
        >
          <div>
            <p
              style={{
                fontSize: '11px',
                color: '#666',
                fontWeight: 700,
                margin: 0,
              }}
            >
              META PEÇAS
            </p>
            <p
              style={{
                fontSize: '32px',
                fontWeight: 900,
                margin: '4px 0',
                color: '#1a1a1a',
              }}
            >
              {metaTotalPecas.toLocaleString('pt-BR')}
            </p>
            <p style={{ fontSize: '10px', color: '#666', margin: 0 }}>
              peças (P2M)
            </p>
          </div>
          <div
            style={{
              borderLeft: '1px solid #90caf9',
              borderRight: '1px solid #90caf9',
            }}
          >
            <p
              style={{
                fontSize: '11px',
                color: '#666',
                fontWeight: 700,
                margin: 0,
              }}
            >
              REALIZADO
            </p>
            <p
              style={{
                fontSize: '32px',
                fontWeight: 900,
                margin: '4px 0',
                color:
                  totalPecasP2M >= metaTotalPecas && metaTotalPecas > 0
                    ? '#15803d'
                    : '#b91c1c',
              }}
            >
              {totalPecasP2M.toLocaleString('pt-BR')}
            </p>
            <p style={{ fontSize: '10px', color: '#666', margin: 0 }}>peças</p>
          </div>
          <div>
            <p
              style={{
                fontSize: '11px',
                color: '#666',
                fontWeight: 700,
                margin: 0,
              }}
            >
              DIFERENÇA
            </p>
            <p
              style={{
                fontSize: '32px',
                fontWeight: 900,
                margin: '4px 0',
                color: diferencaPecas >= 0 ? '#15803d' : '#b91c1c',
              }}
            >
              {(diferencaPecas >= 0 ? '+' : '') +
                diferencaPecas.toLocaleString('pt-BR')}
            </p>
            <p style={{ fontSize: '10px', color: '#666', margin: 0 }}>
              {metaTotalPecas === 0
                ? ''
                : diferencaPecas >= 0
                ? 'acima da meta'
                : 'abaixo da meta'}
            </p>
          </div>
        </div>

        {/* Faixa cabeçalho das 3 colunas */}
        <div
          style={{
            backgroundColor: '#1a1a1a',
            color: '#FFD700',
            padding: '8px',
            borderRadius: '8px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '12px',
            textAlign: 'center',
            fontSize: '12px',
            fontWeight: 800,
          }}
        >
          <div>
            CHECK-IN • LÍQ: {metas.checkinLiq} • VOL:{' '}
            {metas.checkinVol.toLocaleString('pt-BR')}
          </div>
          <div>
            P2M • LÍQ: {metas.p2mLiq} • VOL:{' '}
            {metas.p2mVol.toLocaleString('pt-BR')}
          </div>
          <div style={{ color: '#fff' }}>SORTER • UTIL: {metas.sorterUtil}%</div>
        </div>

        {/* 3 tabelas lado a lado */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '12px',
          }}
        >
          {/* CHECK-IN */}
          <TabelaSetor
            dados={dados.checkin}
            metaLiq={metas.checkinLiq}
            metaVol={metas.checkinVol}
            placeholder="Suba o CSV de Check-in"
          />
          {/* P2M */}
          <TabelaSetor
            dados={dados.p2m}
            metaLiq={metas.p2mLiq}
            metaVol={metas.p2mVol}
            placeholder="Suba o CSV de P2M"
          />
          {/* SORTER */}
          <TabelaSetor
            dados={dados.sorter}
            metaLiq={0}
            metaVol={0}
            placeholder="Suba o CSV de Sorter"
            isSorter
          />
        </div>
      </div>
    </div>
  );
}

// Componente da tabela de cada setor
function TabelaSetor({
  dados,
  metaLiq,
  metaVol,
  placeholder,
  isSorter = false,
}: {
  dados: LinhaColab[];
  metaLiq: number;
  metaVol: number;
  placeholder: string;
  isSorter?: boolean;
}) {
  if (dados.length === 0) {
    return (
      <div
        style={{
          backgroundColor: '#f5f5f5',
          border: '1px dashed #ccc',
          borderRadius: '8px',
          padding: '24px 12px',
          textAlign: 'center',
          color: '#999',
          fontSize: '12px',
          minHeight: '120px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {placeholder}
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '11px',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: '#fff8e1' }}>
            <th
              style={{
                padding: '6px 4px',
                borderBottom: '1px solid #e0e0e0',
                fontWeight: 700,
                color: '#666',
                textAlign: 'center',
              }}
            >
              ID
            </th>
            <th
              style={{
                padding: '6px 4px',
                borderBottom: '1px solid #e0e0e0',
                fontWeight: 700,
                color: '#666',
                textAlign: 'center',
              }}
            >
              LÍQUIDA
            </th>
            <th
              style={{
                padding: '6px 4px',
                borderBottom: '1px solid #e0e0e0',
                fontWeight: 700,
                color: '#666',
                textAlign: 'center',
              }}
            >
              QTD DE PEÇAS
            </th>
            {!isSorter && (
              <th
                style={{
                  padding: '6px 4px',
                  borderBottom: '1px solid #e0e0e0',
                  fontWeight: 700,
                  color: '#666',
                  textAlign: 'center',
                }}
              >
                FALTA
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {dados.map((d, i) => {
            const liqOk = metaLiq > 0 ? d.liquida >= metaLiq : true;
            const volOk = metaVol > 0 ? d.qtd >= metaVol : true;
            const falta = metaVol > 0 ? Math.max(0, metaVol - d.qtd) : 0;
            const corLinha = isSorter
              ? '#ffffff'
              : liqOk && volOk
              ? '#dcfce7'
              : '#fecaca';

            return (
              <tr key={i} style={{ backgroundColor: corLinha }}>
                <td
                  style={{
                    padding: '6px 4px',
                    borderBottom: '1px solid #f0f0f0',
                    textAlign: 'center',
                    fontFamily: 'monospace',
                  }}
                >
                  {d.id}
                </td>
                <td
                  style={{
                    padding: '6px 4px',
                    borderBottom: '1px solid #f0f0f0',
                    textAlign: 'center',
                    fontWeight: 700,
                    color: liqOk ? '#15803d' : '#b91c1c',
                  }}
                >
                  {d.liquida}
                </td>
                <td
                  style={{
                    padding: '6px 4px',
                    borderBottom: '1px solid #f0f0f0',
                    textAlign: 'center',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                  }}
                >
                  {d.qtd.toLocaleString('pt-BR')}
                </td>
                {!isSorter && (
                  <td
                    style={{
                      padding: '6px 4px',
                      borderBottom: '1px solid #f0f0f0',
                      textAlign: 'center',
                      fontFamily: 'monospace',
                      color: falta > 0 ? '#b91c1c' : '#15803d',
                      fontWeight: 700,
                    }}
                  >
                    {falta}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
