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

// ============================================================
// CONSTANTES
// ============================================================
const ZONA = 'p2m';
const LAYOUT = {
  L1_ESQ: 5,
  L1_DIR: 3,
  L2_ESQ: 3,
  L2_DIR: 5,
};
const ALTURA_COLUNA = 422;
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
  // UPLOAD CSV BOLETIM (VERSÃO MELHORADA)
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
      const header = linhas[0]
        .split(sep)
        .map((h) => h.trim().toLowerCase().replace(/"/g, '').replace(/^\uFEFF/, ''));

      console.log('📋 Header detectado:', header);
      console.log('📋 Separador:', sep === ';' ? 'ponto-e-vírgula' : 'vírgula');

      // 🎯 DETECÇÃO EXPANDIDA
      const idxGroot = header.findIndex((h) => 
        h.includes('groot') || 
        h === 'id' || 
        h === 'id_groot' || 
        h === 'usuario' ||
        h === 'usuário' ||
        h === 'matricula' ||
        h === 'matrícula' ||
        h.includes('id_colab') ||
        h.includes('colaborador_id')
      );

      const idxNome = header.findIndex((h) => 
        h === 'nome' || 
        h.includes('nome') || 
        h === 'colaborador' || 
        h.includes('colab')
      );

      const idxRitmo = header.findIndex((h) => 
        h.includes('ritmo') || 
        h.includes('pct') || 
        h === '%' ||
        h.includes('liquid') ||
        h.includes('líquid') ||
        h.includes('produtividade') ||
        h === 'prod' ||
        h === 'prod_liquida' ||
        h === 'prod liquida'
      );

      const idxUnid = header.findIndex((h) => 
        h.includes('unid') || 
        h.includes('qtd') ||
        h.includes('quantidade') ||
        h === 'pcs' ||
        h.includes('peca') ||
        h.includes('peça')
      );

      const idxHoras = header.findIndex((h) => 
        h.includes('hora') || 
        h === 'h' ||
        h === 'tempo'
      );

      console.log('📋 Índices encontrados:', {
        groot: idxGroot,
        nome: idxNome,
        ritmo: idxRitmo,
        unidades: idxUnid,
        horas: idxHoras,
      });

      if (idxGroot === -1 || idxRitmo === -1) {
        const colunasEncontradas = header.join(' | ');
        alert(
          `❌ CSV inválido!\n\n` +
          `Colunas encontradas:\n${colunasEncontradas}\n\n` +
          `Preciso de UMA coluna com:\n` +
          `• ID (id_groot, matricula, usuario...)\n` +
          `• PRODUTIVIDADE (ritmo, liquida, produtividade, pct...)\n\n` +
          `Veja o console (F12) pra detalhes.`
        );
        return;
      }

      const hoje = new Date().toISOString().split('T')[0];
      const registros: any[] = [];
      let pulou = 0;

      for (let i = 1; i < linhas.length; i++) {
        const cols = linhas[i].split(sep).map((c) => c.trim().replace(/"/g, ''));
        const id_groot = cols[idxGroot];
        if (!id_groot) {
          pulou++;
          continue;
        }

        const ritmoRaw = (cols[idxRitmo] || '')
          .replace('%', '')
          .replace(',', '.')
          .trim();
        const ritmo_pct = Math.round(parseFloat(ritmoRaw));
        if (isNaN(ritmo_pct) || ritmo_pct < 0) {
          pulou++;
          continue;
        }

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

      console.log(`📋 ${registros.length} registros válidos, ${pulou} pulados`);

      if (registros.length === 0) {
        alert('❌ Nenhum registro válido encontrado.\nVê o console (F12) pra debug.');
        return;
      }

      const { error } = await supabase
        .from('ritmo_atual')
        .upsert(registros, { onConflict: 'id_groot,data_referencia' });

      if (error) {
        console.error('Erro upsert:', error);
        alert('Erro ao salvar: ' + error.message);
        return;
      }

      const msgErros = pulou > 0 ? `\n⚠️ ${pulou} linhas pulada(s)` : '';
      alert(`✅ ${registros.length} colaborador(es) atualizado(s).${msgErros}`);
      await carregarRitmos();
    } catch (err: any) {
      console.error('Erro CSV:', err);
      alert('Erro ao processar CSV: ' + err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // ============================================================
  // CRIAR BANCADA LATERAL (sempre GM, sem modal)
  // ============================================================
  async function criarBancadaGM(linha: number, lado: string, posicao: number) {
    const hoje = new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('layout_bancadas').insert({
      zona: ZONA,
      linha,
      lado,
      posicao,
      tipo_principal: 'GM',
      subtipo: null,
      fixo_categoria: false,
      data_referencia: hoje,
    });
    if (error) {
      alert('Erro ao criar bancada: ' + error.message);
      return;
    }
    await carregarBancadas();
  }

  // ============================================================
  // MODAL EDITAR SUBTIPO DA CATEGORIA
  // ============================================================
  function abrirModalEditarSubtipo(b: Bancada) {
    setModal({ linha: b.linha, lado: b.lado, posicao: b.posicao, bancadaExistente: b });
    setModalSubtipo(b.subtipo || '');
  }

  function fecharModal() {
    setModal(null);
    setModalSubtipo('');
  }

  async function salvarModal() {
    if (!modal || !modal.bancadaExistente) return;
    if (!modalSubtipo) {
      alert('Escolha um sub-tipo de categoria.');
      return;
    }
    const { error } = await supabase
      .from('layout_bancadas')
      .update({ subtipo: modalSubtipo })
      .eq('id', modal.bancadaExistente.id);
    if (error) {
      alert('Erro: ' + error.message);
      return;
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
    const atuais = alocacoes.filter((a) => a.bancada_id === bancadaId);
    if (atuais.length >= MAX_COLABS_POR_BANCADA) {
      alert(`Bancada cheia (max ${MAX_COLABS_POR_BANCADA} colabs).`);
      return;
    }
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

  function CardColabBancada({ alocId, idGroot }: { alocId: number; idGroot: string }) {
    const c = getColab(idGroot);
    if (!c) return null;
    const ritmo = ritmos[idGroot];
    const cor = corRitmo(ritmo?.ritmo_pct);
    return (
      <div
        className={`
          relative group
          flex-1 h-full
          rounded
          border ${cor.borda} ${cor.bg}
          flex items-center justify-center
          cursor-default
          transition
        `}
        title={`${c.nome}${ritmo ? ` · ${ritmo.ritmo_pct}%` : ''}`}
      >
        {ritmo ? (
          <span className={`text-base font-black ${cor.texto} leading-none tracking-tight`}>
            {ritmo.ritmo_pct}
            <span className="text-[10px] font-bold ml-0.5 opacity-70">%</span>
          </span>
        ) : (
          <span className="text-gray-600 text-sm">—</span>
        )}
        <button
          onClick={() => removerColab(alocId)}
          className="
            absolute top-0 right-0.5
            opacity-0 group-hover:opacity-100
            transition
            text-gray-500 hover:text-red-400
            text-[10px] leading-none
          "
          title="Remover"
        >
          ×
        </button>
      </div>
    );
  }

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

    if (!b) {
      return (
        <div
          onClick={() => criarBancadaGM(linha, lado, posicao)}
          className="
            w-[140px] h-[78px]
            border-2 border-dashed border-[#2a2a2a]
            rounded-md
            flex items-center justify-center
            cursor-pointer
            hover:border-yellow-500/40 hover:bg-yellow-500/5
            transition
          "
          title="Criar bancada GM"
        >
          <span className="text-2xl text-[#3a3a3a]">+</span>
        </div>
      );
    }

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
          w-[140px] h-[78px]
          bg-[#0f0f0f]
          border rounded
          border-l-[3px]
          flex flex-col
          transition
          ${isHover ? 'ring-1 ring-green-500/60' : ''}
        `}
        style={{ borderColor: '#1f1f1f', borderLeftColor: cor.hex }}
      >
        <div className="flex items-center justify-between px-1.5 pt-0.5 pb-0">
          <div className="flex items-center gap-1 min-w-0">
            <span className={`text-[9px] font-bold ${cor.text} uppercase tracking-wider`}>
              {b.tipo_principal}
            </span>
            {b.subtipo && (
              <span className="text-[8px] text-purple-300/70 truncate">· {b.subtipo}</span>
            )}
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {b.tipo_principal === 'CATEGORIA' && (
              <button
                onClick={() => abrirModalEditarSubtipo(b)}
                className="text-gray-600 hover:text-white text-[9px] leading-none"
                title="Editar sub-tipo"
              >
                ✏️
              </button>
            )}
            {!b.fixo_categoria && (
              <button
                onClick={() => limparBancada(b)}
                className="text-gray-600 hover:text-red-400 text-[10px] leading-none"
                title="Limpar bancada"
              >
                ×
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 flex gap-1 px-1 pb-1 pt-0.5">
          {alocs.length === 0 ? (
            <div className="flex-1" />
          ) : (
            alocs.map((a) => <CardColabBancada key={a.id} alocId={a.id} idGroot={a.id_groot} />)
          )}
        </div>
      </div>
    );
  }

  function Esteira() {
    return (
      <div
        className="w-[44px] mx-1 rounded-sm border border-[#444]"
        style={{
          minHeight: `${ALTURA_COLUNA}px`,
          background:
            'repeating-linear-gradient(45deg, #2a2a2a, #2a2a2a 8px, #1a1a1a 8px, #1a1a1a 16px)',
        }}
        aria-hidden="true"
      />
    );
  }

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
        className={`flex flex-col gap-2 ${
          alinharFundo ? 'justify-end' : 'justify-start'
        }`}
        style={{ minHeight: `${ALTURA_COLUNA}px` }}
      >
        {Array.from({ length: qtd }, (_, i) => (
          <SlotBancada key={`${linha}-${lado}-${i + 1}`} linha={linha} lado={lado} posicao={i + 1} />
        ))}
      </div>
    );
  }

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
          <SlotBancada linha={2} lado="centro" posicao={1} />
          <SlotBancada linha={1} lado="centro" posicao={2} />
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

      {loading && (
        <div className="text-center text-gray-500 py-20 text-sm">Carregando linha...</div>
      )}

      {!loading && (
        <div className="flex gap-3 p-3">
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

          <main className="flex-1 flex gap-4 items-start justify-center overflow-x-auto">
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

            <section className="flex flex-col items-center mt-5">
              <ZonaCentral />
            </section>

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

      {modal && modal.bancadaExistente && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={fecharModal}
        >
          <div
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-5 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-white mb-1">Editar Categoria</h2>
            <p className="text-xs text-gray-500 mb-4">
              Linha {modal.linha} · Zona Central
            </p>
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
