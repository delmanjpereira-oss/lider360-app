'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

// ============================================================
// TIPOS
// ============================================================
interface Colaborador {
  id_groot: string;
  nome: string;
  processo: string;
  status: string;
}

interface Ritmo {
  id_groot: string;
  ritmo_pct: number;
  unidades?: number;
  horas?: number;
}

interface Bancada {
  id: number;
  zona: string;
  linha: number;
  lado: string;
  posicao: number;
  tipo_principal: string;
  subtipo: string | null;
  fixo_categoria: boolean;
  data_referencia: string;
}

interface Alocacao {
  id: number;
  bancada_id: number;
  id_groot: string;
  tipo_alocacao: string;
  data_referencia: string;
}

type TipoBancada = 'GM' | 'PESCA' | 'CATEGORIA';

// ============================================================
// CONSTANTES
// ============================================================
const ZONA = 'p2m';

const LAYOUT = {
  L1_ESQ: 5,
  L1_DIR: 3,
  L2_ESQ: 4,
  L2_DIR: 5,
};

const SUBTIPOS_CATEGORIA = [
  'Saneante',
  'High Value',
  'Cosméticos',
  'Mapa',
  'Saúde',
  'Alimento',
];

const MAX_COLABS_POR_BANCADA = 2;

// ============================================================
// HELPERS
// ============================================================
function corRitmo(pct: number | null | undefined) {
  if (pct == null) {
    return {
      texto: 'text-gray-400',
      borda: 'border-[#2a2a2a]',
      bg: 'bg-[#1a1a1a]',
      emoji: '⚪',
    };
  }
  if (pct >= 70) {
    return {
      texto: 'text-green-400',
      borda: 'border-green-500/50',
      bg: 'bg-green-500/10',
      emoji: '🟢',
    };
  }
  if (pct >= 45) {
    return {
      texto: 'text-yellow-400',
      borda: 'border-yellow-500/50',
      bg: 'bg-yellow-500/10',
      emoji: '🟡',
    };
  }
  return {
    texto: 'text-red-400',
    borda: 'border-red-500/50',
    bg: 'bg-red-500/10',
    emoji: '🔴',
  };
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function corTipo(tipo: string) {
  switch (tipo) {
    case 'GM':
      return { hex: '#FFD700', text: 'text-yellow-400', emoji: '⭐' };
    case 'PESCA':
      return { hex: '#3b82f6', text: 'text-blue-400', emoji: '🐟' };
    case 'CATEGORIA':
      return { hex: '#a855f7', text: 'text-purple-400', emoji: '📦' };
    default:
      return { hex: '#6b7280', text: 'text-gray-400', emoji: '❓' };
  }
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0];
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function LinhaPage() {
  const [colabs, setColabs] = useState<Colaborador[]>([]);
  const [ritmos, setRitmos] = useState<Record<string, Ritmo>>({});
  const [bancadas, setBancadas] = useState<Bancada[]>([]);
  const [alocacoes, setAlocacoes] = useState<Alocacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverBancada, setHoverBancada] = useState<number | null>(null);
  const [modal, setModal] = useState<{
    linha: number;
    lado: string;
    posicao: number;
    bancadaExistente?: Bancada;
  } | null>(null);
  const [modalTipo, setModalTipo] = useState<TipoBancada>('GM');
  const [modalSubtipo, setModalSubtipo] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============================================================
  // CARREGAR DADOS
  // ============================================================
  useEffect(() => {
    carregarTudo();
  }, []);

  async function carregarTudo() {
    setLoading(true);
    await garantirSlotsFixos();
    await Promise.all([carregarColabs(), carregarRitmos(), carregarBancadas(), carregarAlocacoes()]);
    setLoading(false);
  }

  async function carregarColabs() {
    const { data } = await supabase
      .from('colaboradores')
      .select('id_groot, nome, processo, status')
      .eq('status', 'Ativo')
      .eq('processo', 'P2M')
      .order('nome');
    setColabs(data || []);
  }

  async function carregarRitmos() {
    const hoje = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('ritmo_atual')
      .select('id_groot, ritmo_pct, unidades, horas')
      .eq('data_referencia', hoje);
    const map: Record<string, Ritmo> = {};
    (data || []).forEach((r) => {
      map[r.id_groot] = r;
    });
    setRitmos(map);
  }

  async function carregarBancadas() {
    const hoje = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('layout_bancadas')
      .select('*')
      .eq('zona', ZONA)
      .eq('data_referencia', hoje)
      .order('posicao');
    setBancadas(data || []);
  }

  async function carregarAlocacoes() {
    const hoje = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('layout_alocacao')
      .select('*')
      .eq('data_referencia', hoje);
    setAlocacoes(data || []);
  }

  // Garante que os 4 slots fixos da Zona Central existam pro dia atual
  async function garantirSlotsFixos() {
    const hoje = new Date().toISOString().split('T')[0];
    const { data: existentes } = await supabase
      .from('layout_bancadas')
      .select('id, linha, posicao')
      .eq('zona', ZONA)
      .eq('lado', 'centro')
      .eq('fixo_categoria', true)
      .eq('data_referencia', hoje);

    const jaTem = new Set((existentes || []).map((b) => `${b.linha}-${b.posicao}`));

    const slotsFixos = [
      { linha: 1, posicao: 1, tipo_principal: 'PESCA' },
      { linha: 1, posicao: 2, tipo_principal: 'CATEGORIA' },
      { linha: 2, posicao: 1, tipo_principal: 'PESCA' },
      { linha: 2, posicao: 2, tipo_principal: 'CATEGORIA' },
    ];

    const aCriar = slotsFixos.filter((s) => !jaTem.has(`${s.linha}-${s.posicao}`));
    if (aCriar.length === 0) return;

    await supabase.from('layout_bancadas').insert(
      aCriar.map((s) => ({
        zona: ZONA,
        linha: s.linha,
        lado: 'centro',
        posicao: s.posicao,
        tipo_principal: s.tipo_principal,
        subtipo: null,
        fixo_categoria: true,
        data_referencia: hoje,
      }))
    );
  }

  // ============================================================
  // UPLOAD CSV BOLETIM
  // ============================================================
  async function handleUploadCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const texto = await file.text();
      const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (linhas.length < 2) {
        alert('CSV vazio ou sem dados.');
        return;
      }

      const sep = linhas[0].includes(';') ? ';' : ',';
      const header = linhas[0].split(sep).map((h) => h.trim().toLowerCase().replace(/"/g, ''));
      const idxGroot = header.findIndex((h) => h.includes('groot') || h === 'id' || h === 'id_groot');
      const idxNome = header.findIndex((h) => h === 'nome');
      const idxRitmo = header.findIndex((h) => h.includes('ritmo') || h.includes('pct') || h === '%');
      const idxUnid = header.findIndex((h) => h.includes('unid') || h.includes('qtd'));
      const idxHoras = header.findIndex((h) => h.includes('hora') || h === 'h');

      if (idxGroot === -1 || idxRitmo === -1) {
        alert(
          'CSV inválido. Precisa ter colunas: id_groot, ritmo_pct (nome, unidades, horas são opcionais).'
        );
        return;
      }

      const hoje = new Date().toISOString().split('T')[0];
      const registros: any[] = [];

      for (let i = 1; i < linhas.length; i++) {
        const cols = linhas[i].split(sep).map((c) => c.trim().replace(/"/g, ''));
        const id_groot = cols[idxGroot];
        if (!id_groot) continue;
        const ritmoRaw = (cols[idxRitmo] || '').replace('%', '').replace(',', '.').trim();
        const ritmo_pct = parseInt(ritmoRaw, 10);
        if (isNaN(ritmo_pct)) continue;
        const reg: any = {
          id_groot,
          ritmo_pct,
          data_referencia: hoje,
          hora_atualizacao: new Date().toISOString(),
        };
        if (idxNome !== -1 && cols[idxNome]) reg.nome = cols[idxNome];
        if (idxUnid !== -1 && cols[idxUnid]) {
          const u = parseInt(cols[idxUnid].replace(/\./g, ''), 10);
          if (!isNaN(u)) reg.unidades = u;
        }
        if (idxHoras !== -1 && cols[idxHoras]) {
          const h = parseFloat(cols[idxHoras].replace(',', '.'));
          if (!isNaN(h)) reg.horas = h;
        }
        registros.push(reg);
      }

      if (registros.length === 0) {
        alert('Nenhum registro válido encontrado no CSV.');
        return;
      }

      const { error } = await supabase
        .from('ritmo_atual')
        .upsert(registros, { onConflict: 'id_groot,data_referencia' });

      if (error) {
        alert('Erro ao salvar: ' + error.message);
        return;
      }

      alert(`✅ ${registros.length} colaborador(es) atualizado(s).`);
      await carregarRitmos();
    } catch (err: any) {
      alert('Erro ao processar CSV: ' + err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // ============================================================
  // MODAL CONFIGURAR BANCADA
  // ============================================================
  function abrirModalConfigurar(linha: number, lado: string, posicao: number) {
    setModal({ linha, lado, posicao });
    setModalTipo('GM');
    setModalSubtipo('');
  }

  function abrirModalEditarSubtipo(b: Bancada) {
    setModal({ linha: b.linha, lado: b.lado, posicao: b.posicao, bancadaExistente: b });
    setModalTipo(b.tipo_principal as TipoBancada);
    setModalSubtipo(b.subtipo || '');
  }

  function fecharModal() {
    setModal(null);
    setModalSubtipo('');
  }

  async function salvarModal() {
    if (!modal) return;
    if (modalTipo === 'CATEGORIA' && !modalSubtipo) {
      alert('Escolha um sub-tipo de categoria.');
      return;
    }

    const hoje = new Date().toISOString().split('T')[0];

    // Editando bancada existente (só subtipo, em geral)
    if (modal.bancadaExistente) {
      const { error } = await supabase
        .from('layout_bancadas')
        .update({
          tipo_principal: modal.bancadaExistente.fixo_categoria
            ? modal.bancadaExistente.tipo_principal
            : modalTipo,
          subtipo: modalTipo === 'CATEGORIA' ? modalSubtipo : null,
        })
        .eq('id', modal.bancadaExistente.id);
      if (error) {
        alert('Erro: ' + error.message);
        return;
      }
    } else {
      // Criando bancada nova
      const { error } = await supabase.from('layout_bancadas').insert({
        zona: ZONA,
        linha: modal.linha,
        lado: modal.lado,
        posicao: modal.posicao,
        tipo_principal: modalTipo,
        subtipo: modalTipo === 'CATEGORIA' ? modalSubtipo : null,
        fixo_categoria: false,
        data_referencia: hoje,
      });
      if (error) {
        alert('Erro: ' + error.message);
        return;
      }
    }

    await carregarBancadas();
    fecharModal();
  }

  // ============================================================
  // LIMPAR BANCADA
  // ============================================================
  async function limparBancada(b: Bancada) {
    if (b.fixo_categoria) {
      alert('Esta bancada é fixa e não pode ser removida.');
      return;
    }
    if (!confirm('Limpar esta bancada? Todos os colaboradores alocados voltarão à lista de livres.')) {
      return;
    }
    const { error } = await supabase.from('layout_bancadas').delete().eq('id', b.id);
    if (error) {
      alert('Erro: ' + error.message);
      return;
    }
    await Promise.all([carregarBancadas(), carregarAlocacoes()]);
  }

  // ============================================================
  // ALOCAÇÃO DE COLABS (drag-and-drop)
  // ============================================================
  async function alocarColab(idGroot: string, bancadaId: number) {
    const hoje = new Date().toISOString().split('T')[0];

    // valida limite de colabs por bancada
    const atuais = alocacoes.filter((a) => a.bancada_id === bancadaId);
    if (atuais.length >= MAX_COLABS_POR_BANCADA) {
      alert(`Bancada cheia (max ${MAX_COLABS_POR_BANCADA} colabs).`);
      return;
    }

    // remove alocação anterior (se houver) e cria nova
    await supabase
      .from('layout_alocacao')
      .delete()
      .eq('id_groot', idGroot)
      .eq('data_referencia', hoje);

    const { error } = await supabase.from('layout_alocacao').insert({
      bancada_id: bancadaId,
      id_groot: idGroot,
      tipo_alocacao: 'fixo',
      data_referencia: hoje,
    });
    if (error) {
      alert('Erro ao alocar: ' + error.message);
      return;
    }
    await carregarAlocacoes();
  }

  async function removerColab(alocId: number) {
    const { error } = await supabase.from('layout_alocacao').delete().eq('id', alocId);
    if (error) {
      alert('Erro: ' + error.message);
      return;
    }
    await carregarAlocacoes();
  }

  // ============================================================
  // HELPERS DE LOOKUP
  // ============================================================
  function getBancada(linha: number, lado: string, posicao: number) {
    return bancadas.find(
      (b) =>
        b.zona === ZONA && b.linha === linha && b.lado === lado && b.posicao === posicao
    );
  }

  function getAlocacoesBancada(bancadaId: number) {
    return alocacoes.filter((a) => a.bancada_id === bancadaId);
  }

  function getColab(idGroot: string) {
    return colabs.find((c) => c.id_groot === idGroot);
  }

  function colabsLivres() {
    const alocadosIds = new Set(alocacoes.map((a) => a.id_groot));
    return colabs.filter((c) => !alocadosIds.has(c.id_groot));
  }

  // ============================================================
  // RENDERS
  // ============================================================

  // Card de colab na sidebar
  function CardColabSidebar({ c }: { c: Colaborador }) {
    const ritmo = ritmos[c.id_groot];
    const cor = corRitmo(ritmo?.ritmo_pct);
    return (
      <div
        draggable
        onDragStart={() => setDraggingId(c.id_groot)}
        onDragEnd={() => setDraggingId(null)}
        className={`
          ${cor.bg} ${cor.borda}
          border rounded-md px-2 py-1.5 mb-1.5
          cursor-move transition
          hover:bg-[#222] hover:scale-[1.02]
          ${draggingId === c.id_groot ? 'opacity-40' : ''}
        `}
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-[10px] font-bold ${cor.texto} flex-shrink-0`}>
              {iniciais(c.nome)}
            </span>
            <span className="text-[10px] text-white truncate">{primeiroNome(c.nome)}</span>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {ritmo && (
              <span className={`text-[9px] font-bold ${cor.texto}`}>{ritmo.ritmo_pct}%</span>
            )}
            <span className="text-[9px]">{cor.emoji}</span>
          </div>
        </div>
      </div>
    );
  }

  // Card de colab dentro de uma bancada
  function CardColabBancada({ alocId, idGroot }: { alocId: number; idGroot: string }) {
    const c = getColab(idGroot);
    if (!c) return null;
    const ritmo = ritmos[idGroot];
    const cor = corRitmo(ritmo?.ritmo_pct);
    return (
      <div className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded bg-[#0f0f0f]">
        <div className="flex items-center gap-1 min-w-0">
          <span className={`text-[9px] font-bold ${cor.texto}`}>{iniciais(c.nome)}</span>
          <span className="text-[9px] text-white truncate">{primeiroNome(c.nome)}</span>
        </div>
        <div className="flex items-center gap-0.5">
          {ritmo && <span className={`text-[9px] font-bold ${cor.texto}`}>{ritmo.ritmo_pct}%</span>}
          <span className="text-[8px]">{cor.emoji}</span>
          <button
            onClick={() => removerColab(alocId)}
            className="text-gray-500 hover:text-red-400 text-[10px] leading-none ml-0.5"
            title="Remover"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  // Slot/bancada (configurada ou vazia)
  function SlotBancada({
    linha,
    lado,
    posicao,
  }: {
    linha: number;
    lado: string;
    posicao: number;
  }) {
    const b = getBancada(linha, lado, posicao);

    // Slot vazio
    if (!b) {
      return (
        <div
          onClick={() => abrirModalConfigurar(linha, lado, posicao)}
          className="
            w-[140px] h-[78px]
            border-2 border-dashed border-[#2a2a2a]
            rounded-md
            flex items-center justify-center
            cursor-pointer
            hover:border-[#444] hover:bg-[#111]
            transition
          "
        >
          <span className="text-2xl text-[#3a3a3a]">+</span>
        </div>
      );
    }

    // Bancada configurada
    const cor = corTipo(b.tipo_principal);
    const alocs = getAlocacoesBancada(b.id);
    const isHover = hoverBancada === b.id;

    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setHoverBancada(b.id);
        }}
        onDragLeave={() => setHoverBancada(null)}
        onDrop={(e) => {
          e.preventDefault();
          setHoverBancada(null);
          if (draggingId) {
            alocarColab(draggingId, b.id);
            setDraggingId(null);
          }
        }}
        className={`
          w-[140px] min-h-[78px]
          bg-[#1a1a1a]
          border-2 rounded-md
          border-l-[6px]
          transition
          ${isHover ? 'ring-2 ring-green-500/60 scale-[1.03]' : ''}
        `}
        style={{ borderColor: cor.hex, borderLeftColor: cor.hex }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-1.5 py-0.5 border-b border-[#2a2a2a]">
          <div className={`flex items-center gap-1 ${cor.text}`}>
            <span className="text-[10px]">{cor.emoji}</span>
            <span className="text-[9px] font-bold uppercase tracking-wide">
              {b.tipo_principal}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {b.tipo_principal === 'CATEGORIA' && (
              <button
                onClick={() => abrirModalEditarSubtipo(b)}
                className="text-gray-500 hover:text-white text-[10px] leading-none"
                title="Editar sub-tipo"
              >
                ✏️
              </button>
            )}
            {!b.fixo_categoria && (
              <button
                onClick={() => limparBancada(b)}
                className="text-gray-500 hover:text-red-400 text-[11px] leading-none"
                title="Limpar bancada"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Sub-tipo (se categoria) */}
        {b.subtipo && (
          <div className="px-1.5 pt-0.5">
            <span className="text-[8px] text-purple-300 uppercase tracking-wide">
              {b.subtipo}
            </span>
          </div>
        )}

        {/* Colabs alocados */}
        <div className="px-1 py-1 space-y-0.5">
          {alocs.length === 0 ? (
            <div className="text-[8px] text-gray-600 italic text-center py-1">Arraste aqui</div>
          ) : (
            alocs.map((a) => (
              <CardColabBancada key={a.id} alocId={a.id} idGroot={a.id_groot} />
            ))
          )}
        </div>
      </div>
    );
  }

  // Esteira vertical
  function Esteira() {
    return (
      <div
        className="w-[44px] h-full min-h-[420px] mx-1 rounded-sm border border-[#444]"
        style={{
          background:
            'repeating-linear-gradient(45deg, #2a2a2a, #2a2a2a 8px, #1a1a1a 8px, #1a1a1a 16px)',
        }}
        aria-hidden="true"
      />
    );
  }

  // Coluna de bancadas (esquerda ou direita de uma linha)
  // alinharFundo=true → empurra as bancadas pra baixo (espaço vazio fica em cima,
  // pra deixar livre o espaço onde fica a Zona Central PESCA/CATEGORIA)
  function ColunaBancadas({
    linha,
    lado,
    qtd,
    alinharFundo = false,
  }: {
    linha: number;
    lado: string;
    qtd: number;
    alinharFundo?: boolean;
  }) {
    return (
      <div
        className={`flex flex-col gap-2 h-full ${
          alinharFundo ? 'justify-end' : 'justify-start'
        }`}
      >
        {Array.from({ length: qtd }, (_, i) => (
          <SlotBancada key={`${linha}-${lado}-${i + 1}`} linha={linha} lado={lado} posicao={i + 1} />
        ))}
      </div>
    );
  }

  // Zona Central (4 slots fixos)
  function ZonaCentral() {
    return (
      <div className="border-2 border-dashed border-[#3a3a2a] rounded-md p-3 self-start">
        <div className="text-center mb-2">
          <span className="text-[10px] text-yellow-500/80 font-bold tracking-widest uppercase">
            Zona Central
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SlotBancada linha={1} lado="centro" posicao={1} />
          <SlotBancada linha={1} lado="centro" posicao={2} />
          <SlotBancada linha={2} lado="centro" posicao={1} />
          <SlotBancada linha={2} lado="centro" posicao={2} />
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER PRINCIPAL
  // ============================================================
  const livres = colabsLivres();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* HEADER */}
      <header className="border-b border-[#1a1a1a] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">
            🏭 <span className="text-yellow-400">Mapeamento Linha</span>
            <span className="text-gray-500 text-sm font-normal ml-2">· P2M</span>
          </h1>
          <span className="text-[10px] text-gray-500">
            {new Date().toLocaleDateString('pt-BR')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleUploadCSV}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="
              bg-yellow-500/10 border border-yellow-500/50 text-yellow-400
              text-xs px-3 py-1.5 rounded
              hover:bg-yellow-500/20 transition
            "
          >
            ↑ Upload Boletim
          </button>
        </div>
      </header>

      {/* LOADING */}
      {loading && (
        <div className="text-center text-gray-500 py-20 text-sm">Carregando linha...</div>
      )}

      {/* BODY */}
      {!loading && (
        <div className="flex gap-3 p-3">
          {/* SIDEBAR COLABS LIVRES */}
          <aside className="w-[180px] flex-shrink-0">
            <div className="bg-[#0f0f0f] border border-[#1a1a1a] rounded-md p-2">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">
                  Livres
                </span>
                <span className="text-[10px] text-gray-500">{livres.length}</span>
              </div>
              <div className="max-h-[calc(100vh-140px)] overflow-y-auto pr-1">
                {livres.length === 0 ? (
                  <div className="text-[10px] text-gray-600 italic text-center py-4">
                    Todos alocados
                  </div>
                ) : (
                  livres.map((c) => <CardColabSidebar key={c.id_groot} c={c} />)
                )}
              </div>
            </div>
          </aside>

          {/* MAIN CANVAS */}
          <main className="flex-1 flex gap-4 items-start justify-center overflow-x-auto">
            {/* LINHA 1 */}
            <section className="flex flex-col items-center">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">
                Linha 1
              </div>
              <div className="flex gap-1 items-stretch">
                <ColunaBancadas linha={1} lado="esquerdo" qtd={LAYOUT.L1_ESQ} />
                <Esteira />
                <ColunaBancadas linha={1} lado="direito" qtd={LAYOUT.L1_DIR} alinharFundo />
              </div>
              <div className="text-gray-700 text-xs mt-2">↓</div>
            </section>

            {/* ZONA CENTRAL */}
            <section className="flex flex-col items-center mt-5">
              <ZonaCentral />
            </section>

            {/* LINHA 2 */}
            <section className="flex flex-col items-center">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">
                Linha 2
              </div>
              <div className="flex gap-1 items-stretch">
                <ColunaBancadas linha={2} lado="esquerdo" qtd={LAYOUT.L2_ESQ} alinharFundo />
                <Esteira />
                <ColunaBancadas linha={2} lado="direito" qtd={LAYOUT.L2_DIR} />
              </div>
              <div className="text-gray-700 text-xs mt-2">↓</div>
            </section>
          </main>
        </div>
      )}

      {/* MODAL CONFIGURAR BANCADA */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={fecharModal}
        >
          <div
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-5 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-white mb-1">
              {modal.bancadaExistente ? 'Editar Bancada' : 'Configurar Bancada'}
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Linha {modal.linha} ·{' '}
              <span className="capitalize">
                {modal.lado === 'centro' ? 'Zona Central' : modal.lado}
              </span>
            </p>

            {/* Tipo (oculto se é fixo da zona central) */}
            {!modal.bancadaExistente?.fixo_categoria && (
              <div className="mb-4">
                <label className="text-xs text-gray-400 mb-1.5 block">Tipo:</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['GM', 'PESCA', 'CATEGORIA'] as TipoBancada[]).map((t) => {
                    const c = corTipo(t);
                    const ativo = modalTipo === t;
                    return (
                      <button
                        key={t}
                        onClick={() => {
                          setModalTipo(t);
                          if (t !== 'CATEGORIA') setModalSubtipo('');
                        }}
                        className={`
                          py-2 px-2 rounded text-xs font-bold
                          border-2 transition
                          ${ativo ? 'bg-[#0f0f0f]' : 'bg-transparent opacity-60 hover:opacity-100'}
                        `}
                        style={{
                          borderColor: ativo ? c.hex : '#2a2a2a',
                          color: ativo ? c.hex : '#888',
                        }}
                      >
                        {c.emoji} {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sub-tipo (só CATEGORIA) */}
            {modalTipo === 'CATEGORIA' && (
              <div className="mb-4">
                <label className="text-xs text-gray-400 mb-1.5 block">Sub-tipo:</label>
                <div className="grid grid-cols-2 gap-2">
                  {SUBTIPOS_CATEGORIA.map((s) => (
                    <button
                      key={s}
                      onClick={() => setModalSubtipo(s)}
                      className={`
                        py-1.5 px-2 rounded text-xs font-medium
                        border transition
                        ${
                          modalSubtipo === s
                            ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                            : 'border-[#2a2a2a] text-gray-400 hover:border-[#3a3a3a]'
                        }
                      `}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Ações */}
            <div className="flex gap-2 justify-end pt-2 border-t border-[#2a2a2a]">
              <button
                onClick={fecharModal}
                className="px-4 py-1.5 text-xs text-gray-400 hover:text-white transition"
              >
                Cancelar
              </button>
              <button
                onClick={salvarModal}
                className="px-4 py-1.5 text-xs font-bold bg-yellow-500/20 border border-yellow-500/50 text-yellow-400 rounded hover:bg-yellow-500/30 transition"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
