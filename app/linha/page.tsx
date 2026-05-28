'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';

// ============================================
// TIPOS
// ============================================
type SubtipoBancada = 'GM' | 'PESCA' | 'CATEGORIA' | null;
type CategoriaSubtipo = 'Saneante' | 'High Value' | 'Cosméticos' | 'Mapa' | 'Saúde' | 'Alimento' | null;

type Bancada = {
  id: string;
  posicao: string;           // identifica o slot fixo no layout
  subtipo: SubtipoBancada;
  categoria?: CategoriaSubtipo;
  linha: 1 | 2;
  fixo_categoria?: boolean;  // pros 4 slots centrais q tem tipo travado
};

type Colaborador = {
  id: number;
  id_groot: string;
  nome: string;
  processo: string | null;
  status: string;
};

type Ritmo = {
  id_groot: string;
  ritmo_pct: number;
};

type Alocacao = {
  id: number;
  bancada_id: string;
  id_groot: string;
  tipo_alocacao: 'fixo' | 'temporario';
};

const CATEGORIAS = ['Saneante', 'High Value', 'Cosméticos', 'Mapa', 'Saúde', 'Alimento'] as const;

// ============================================
// 🎯 LAYOUT FIXO (template definido por nós)
// ============================================
const LAYOUT_INICIAL: Bancada[] = [
  // LINHA 1 - lado esquerdo (5 slots verticais)
  { id: 'l1-s1', posicao: 'L1-slot-1', subtipo: null, linha: 1 },
  { id: 'l1-s2', posicao: 'L1-slot-2', subtipo: null, linha: 1 },
  { id: 'l1-s3', posicao: 'L1-slot-3', subtipo: null, linha: 1 },
  { id: 'l1-s4', posicao: 'L1-slot-4', subtipo: null, linha: 1 },
  { id: 'l1-s5', posicao: 'L1-slot-5', subtipo: null, linha: 1 },
  
  // ZONA CENTRO - 4 slots FIXOS (Pesca L1/L2, Cat L1/L2)
  { id: 'centro-pesca-l1', posicao: 'centro-pesca-l1', subtipo: 'PESCA', linha: 1, fixo_categoria: true },
  { id: 'centro-cat-l1',   posicao: 'centro-cat-l1',   subtipo: 'CATEGORIA', linha: 1, fixo_categoria: true },
  { id: 'centro-pesca-l2', posicao: 'centro-pesca-l2', subtipo: 'PESCA', linha: 2, fixo_categoria: true },
  { id: 'centro-cat-l2',   posicao: 'centro-cat-l2',   subtipo: 'CATEGORIA', linha: 2, fixo_categoria: true },
  
  // LINHA 2 - lado direito (5 slots verticais)
  { id: 'l2-s1', posicao: 'L2-slot-1', subtipo: null, linha: 2 },
  { id: 'l2-s2', posicao: 'L2-slot-2', subtipo: null, linha: 2 },
  { id: 'l2-s3', posicao: 'L2-slot-3', subtipo: null, linha: 2 },
  { id: 'l2-s4', posicao: 'L2-slot-4', subtipo: null, linha: 2 },
  { id: 'l2-s5', posicao: 'L2-slot-5', subtipo: null, linha: 2 },
];

// ============================================
// HELPERS
// ============================================
function corRitmo(pct: number) {
  if (pct >= 70) return { cor: 'text-green-400', borda: 'border-green-500/50', bg: 'bg-green-500/20', emoji: '🟢' };
  if (pct >= 45) return { cor: 'text-yellow-400', borda: 'border-yellow-500/50', bg: 'bg-yellow-500/20', emoji: '🟡' };
  return { cor: 'text-red-400', borda: 'border-red-500/50', bg: 'bg-red-500/20', emoji: '🔴' };
}

function iniciais(nome: string) {
  const partes = nome.trim().split(' ');
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
export default function MapeamentoLinhaPage() {
  const [bancadas, setBancadas] = useState<Bancada[]>(LAYOUT_INICIAL);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [ritmos, setRitmos] = useState<Ritmo[]>([]);
  const [alocacoes, setAlocacoes] = useState<Alocacao[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [colabArrastando, setColabArrastando] = useState<string | null>(null);
  const [bancadaConfig, setBancadaConfig] = useState<string | null>(null);
  const [hoverBancada, setHoverBancada] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const hoje = new Date().toISOString().split('T')[0];
      const [colabsResp, ritmoResp, alocResp] = await Promise.all([
        supabase.from('colaboradores').select('*').eq('status', 'Ativo'),
        supabase.from('ritmo_atual').select('id_groot, ritmo_pct').eq('data_referencia', hoje),
        supabase.from('layout_alocacao').select('*').eq('data_referencia', hoje),
      ]);
      if (colabsResp.data) setColaboradores(colabsResp.data as any);
      if (ritmoResp.data) setRitmos(ritmoResp.data as any);
      if (alocResp.data) setAlocacoes(alocResp.data.map((a: any) => ({ ...a, bancada_id: String(a.bancada_id) })) as any);
    } catch (e) {
      console.error('Erro:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // ============================================
  // HELPERS
  // ============================================
  const colabsAlocadosIds = new Set(alocacoes.map(a => a.id_groot));
  const colabsLivres = colaboradores.filter(c => !colabsAlocadosIds.has(c.id_groot) && c.processo === 'P2M');

  function ritmoDoColab(idGroot: string): number | null {
    const r = ritmos.find(r => r.id_groot === idGroot);
    return r ? r.ritmo_pct : null;
  }

  function alocacoesDe(bancadaId: string): Alocacao[] {
    return alocacoes.filter(a => a.bancada_id === bancadaId);
  }

  function getBancada(id: string) {
    return bancadas.find(b => b.id === id);
  }

  // ============================================
  // AÇÕES
  // ============================================
  async function configurarBancada(bancadaId: string, subtipo: SubtipoBancada, categoria?: CategoriaSubtipo) {
    setBancadas(prev => prev.map(b => b.id === bancadaId ? { ...b, subtipo, categoria: categoria || null } : b));
    setBancadaConfig(null);
  }

  async function limparBancada(bancadaId: string) {
    const b = getBancada(bancadaId);
    if (!b) return;
    
    // Se for slot fixo do centro, não pode limpar tipo
    if (b.fixo_categoria) {
      // Só limpa os colabs
      const alocsRemove = alocacoesDe(bancadaId);
      for (const a of alocsRemove) {
        await supabase.from('layout_alocacao').delete().eq('id', a.id);
      }
      setAlocacoes(prev => prev.filter(a => a.bancada_id !== bancadaId));
      return;
    }
    
    // Senão limpa tudo
    setBancadas(prev => prev.map(b => b.id === bancadaId ? { ...b, subtipo: null, categoria: null } : b));
    const alocsRemove = alocacoesDe(bancadaId);
    for (const a of alocsRemove) {
      await supabase.from('layout_alocacao').delete().eq('id', a.id);
    }
    setAlocacoes(prev => prev.filter(a => a.bancada_id !== bancadaId));
  }

  function handleColabDragStart(idGroot: string) {
    setColabArrastando(idGroot);
  }

  async function handleDropNaBancada(bancadaId: string) {
    if (!colabArrastando) return;
    const b = getBancada(bancadaId);
    if (!b || !b.subtipo) {
      setColabArrastando(null);
      setHoverBancada(null);
      return;
    }
    
    await supabase.from('layout_alocacao').delete().eq('id_groot', colabArrastando).eq('data_referencia', new Date().toISOString().split('T')[0]);
    
    const { data, error } = await supabase.from('layout_alocacao').insert({
      bancada_id: 0,
      id_groot: colabArrastando,
      tipo_alocacao: 'fixo',
    }).select().single();
    
    if (!error && data) {
      setAlocacoes(prev => [...prev.filter(a => a.id_groot !== colabArrastando), { ...data, bancada_id: bancadaId } as any]);
    }
    
    setColabArrastando(null);
    setHoverBancada(null);
  }

  async function removerColab(alocacaoId: number) {
    await supabase.from('layout_alocacao').delete().eq('id', alocacaoId);
    setAlocacoes(prev => prev.filter(a => a.id !== alocacaoId));
  }

  async function handleUploadCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const linhas = text.split('\n').filter(l => l.trim());
    if (linhas.length < 2) return alert('CSV vazio');
    const header = linhas[0].toLowerCase().split(/[,;]/);
    const idIdx = header.findIndex(h => h.includes('id_groot') || h.includes('id'));
    const ritmoIdx = header.findIndex(h => h.includes('ritmo') || h.includes('pct') || h.includes('%'));
    if (idIdx < 0 || ritmoIdx < 0) return alert('CSV precisa ter: id_groot e ritmo_pct');
    const novos: any[] = [];
    for (let i = 1; i < linhas.length; i++) {
      const cols = linhas[i].split(/[,;]/);
      const idGroot = String(cols[idIdx] || '').trim().replace(/['"]/g, '');
      const ritmo = Math.round(Number(String(cols[ritmoIdx] || '').replace(',', '.').replace('%', '').trim()) || 0);
      if (idGroot && ritmo > 0) novos.push({ id_groot: idGroot, ritmo_pct: ritmo });
    }
    if (novos.length === 0) return alert('Nenhum dado válido');
    const { error } = await supabase.from('ritmo_atual').upsert(novos, { onConflict: 'id_groot,data_referencia' });
    if (error) return alert('Erro: ' + error.message);
    alert(`✅ ${novos.length} ritmos atualizados!`);
    await carregar();
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-400">⏳ Carregando...</div>;
  }

  // Filtra bancadas por zona
  const bancadasL1 = bancadas.filter(b => b.linha === 1 && !b.fixo_categoria).slice(0, 5);
  const bancadasL2 = bancadas.filter(b => b.linha === 2 && !b.fixo_categoria).slice(0, 5);
  const bancadasCentro = bancadas.filter(b => b.fixo_categoria);

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] gap-2">
      {/* TOOLBAR */}
      <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-black text-white">🏭 Mapeamento Linha</h1>
          <span className="text-xs text-gray-500">· P2M</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded text-xs px-3 py-1.5 font-bold cursor-pointer">
            ↑ Upload Boletim
            <input type="file" accept=".csv,.txt" onChange={handleUploadCSV} className="hidden" />
          </label>
        </div>
      </div>

      {/* ÁREA PRINCIPAL */}
      <div className="flex gap-2 flex-1 min-h-0">
        
        {/* SIDEBAR COLABS LIVRES */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden flex flex-col" style={{ width: '160px' }}>
          <div className="bg-[#0a0a0a] px-3 py-2 border-b border-[#2a2a2a] flex items-center justify-between">
            <h3 className="text-xs font-black text-[#FFD700]">👥 Livres</h3>
            <span className="text-xs bg-[#2a2a2a] text-gray-400 px-1.5 py-0.5 rounded-full">{colabsLivres.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {colabsLivres.length === 0 ? (
              <p className="text-center text-gray-500 text-[10px] py-3">Todos alocados</p>
            ) : (
              colabsLivres.map((c) => {
                const r = ritmoDoColab(c.id_groot);
                const cores = r !== null ? corRitmo(r) : null;
                return (
                  <div
                    key={c.id_groot}
                    draggable
                    onDragStart={() => handleColabDragStart(c.id_groot)}
                    className={`bg-[#0a0a0a] border ${cores?.borda || 'border-[#2a2a2a]'} rounded p-1.5 cursor-move hover:scale-105 transition-all`}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className={`w-6 h-6 rounded ${cores?.bg || 'bg-gray-500/20'} flex items-center justify-center font-bold text-[9px] ${cores?.cor || 'text-gray-400'}`}>
                        {iniciais(c.nome)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-white truncate">{c.nome.split(' ')[0]}</p>
                        <p className="text-[9px] text-gray-500">{r !== null ? `${r}%` : '⚪'}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* CANVAS DA LINHA */}
        <div className="flex-1 bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg overflow-auto p-6">
          
          {/* GRID PRINCIPAL: 3 COLUNAS */}
          <div className="grid gap-4 h-full" style={{ gridTemplateColumns: '1fr auto 1fr', minHeight: '600px' }}>
            
            {/* ============================ */}
            {/* COLUNA ESQUERDA - LINHA 1 */}
            {/* ============================ */}
            <div className="flex flex-col items-center gap-3">
              {/* Header L1 */}
              <div className="text-center">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">LINHA 1</p>
                <div className="w-1 h-4 bg-gray-700 mx-auto mt-1"></div>
              </div>
              
              {/* Esteira L1 (faixa vertical) */}
              <div className="relative w-full max-w-[280px] flex flex-col items-center gap-2">
                {/* Esteira de fundo */}
                <div 
                  className="absolute left-1/2 -translate-x-1/2 w-12 h-full -z-10"
                  style={{
                    background: 'repeating-linear-gradient(45deg, #2a2a2a, #2a2a2a 6px, #1a1a1a 6px, #1a1a1a 12px)',
                    border: '1px solid #444',
                  }}
                />
                
                {/* Bancadas L1 */}
                {bancadasL1.map((b) => (
                  <BancadaSlot
                    key={b.id}
                    bancada={b}
                    alocacoes={alocacoesDe(b.id)}
                    colaboradores={colaboradores}
                    ritmos={ritmos}
                    hover={hoverBancada === b.id}
                    onConfigurar={() => setBancadaConfig(b.id)}
                    onLimpar={() => limparBancada(b.id)}
                    onDragOver={(e) => { e.preventDefault(); setHoverBancada(b.id); }}
                    onDragLeave={() => setHoverBancada(null)}
                    onDrop={() => handleDropNaBancada(b.id)}
                    onRemoverColab={removerColab}
                  />
                ))}
              </div>
              
              {/* Seta saída */}
              <div className="text-blue-400 text-2xl">↓</div>
            </div>

            {/* ============================ */}
            {/* COLUNA CENTRO - 4 SLOTS FIXOS */}
            {/* ============================ */}
            <div className="flex flex-col justify-start pt-12">
              <div className="bg-[#1a1a1a]/50 border-2 border-dashed border-[#FFD700]/30 rounded-lg p-3" style={{ width: '280px' }}>
                <p className="text-[10px] text-[#FFD700] font-black uppercase tracking-widest text-center mb-3">
                  ZONA CENTRAL
                </p>
                
                {/* Grid 2x2 */}
                <div className="grid grid-cols-2 gap-2">
                  {bancadasCentro.map((b) => (
                    <BancadaSlot
                      key={b.id}
                      bancada={b}
                      alocacoes={alocacoesDe(b.id)}
                      colaboradores={colaboradores}
                      ritmos={ritmos}
                      hover={hoverBancada === b.id}
                      onConfigurar={() => b.subtipo === 'CATEGORIA' ? setBancadaConfig(b.id) : null}
                      onLimpar={() => limparBancada(b.id)}
                      onDragOver={(e) => { e.preventDefault(); setHoverBancada(b.id); }}
                      onDragLeave={() => setHoverBancada(null)}
                      onDrop={() => handleDropNaBancada(b.id)}
                      onRemoverColab={removerColab}
                      compacto
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* ============================ */}
            {/* COLUNA DIREITA - LINHA 2 */}
            {/* ============================ */}
            <div className="flex flex-col items-center gap-3">
              <div className="text-center">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">LINHA 2</p>
                <div className="w-1 h-4 bg-gray-700 mx-auto mt-1"></div>
              </div>
              
              <div className="relative w-full max-w-[280px] flex flex-col items-center gap-2">
                <div 
                  className="absolute left-1/2 -translate-x-1/2 w-12 h-full -z-10"
                  style={{
                    background: 'repeating-linear-gradient(45deg, #2a2a2a, #2a2a2a 6px, #1a1a1a 6px, #1a1a1a 12px)',
                    border: '1px solid #444',
                  }}
                />
                
                {bancadasL2.map((b) => (
                  <BancadaSlot
                    key={b.id}
                    bancada={b}
                    alocacoes={alocacoesDe(b.id)}
                    colaboradores={colaboradores}
                    ritmos={ritmos}
                    hover={hoverBancada === b.id}
                    onConfigurar={() => setBancadaConfig(b.id)}
                    onLimpar={() => limparBancada(b.id)}
                    onDragOver={(e) => { e.preventDefault(); setHoverBancada(b.id); }}
                    onDragLeave={() => setHoverBancada(null)}
                    onDrop={() => handleDropNaBancada(b.id)}
                    onRemoverColab={removerColab}
                  />
                ))}
              </div>
              
              <div className="text-blue-400 text-2xl">↓</div>
            </div>
            
          </div>
        </div>
      </div>

      {/* MODAL CONFIGURAR BANCADA */}
      {bancadaConfig && (
        <ModalConfig
          bancada={getBancada(bancadaConfig)!}
          onClose={() => setBancadaConfig(null)}
          onSalvar={(subtipo, categoria) => configurarBancada(bancadaConfig, subtipo, categoria)}
        />
      )}
    </div>
  );
}

// ============================================
// BANCADA SLOT
// ============================================
function BancadaSlot({ bancada, alocacoes, colaboradores, ritmos, hover, onConfigurar, onLimpar, onDragOver, onDragLeave, onDrop, onRemoverColab, compacto }: any) {
  const isVazia = !bancada.subtipo;
  
  const corBorda = bancada.subtipo === 'GM' ? '#FFD700' :
                   bancada.subtipo === 'PESCA' ? '#3b82f6' :
                   bancada.subtipo === 'CATEGORIA' ? '#a855f7' : '#333';
  
  const titulo = bancada.subtipo === 'CATEGORIA' && bancada.categoria ? `📦 ${bancada.categoria}` :
                 bancada.subtipo === 'CATEGORIA' ? '📦 Categoria' :
                 bancada.subtipo === 'GM' ? '⭐ GM' :
                 bancada.subtipo === 'PESCA' ? '🐟 PESCA' :
                 '+ Configurar';

  function ritmoColab(idGroot: string) {
    const r = ritmos.find((r: any) => r.id_groot === idGroot);
    return r ? r.ritmo_pct : null;
  }

  const widthClass = compacto ? 'w-full' : 'w-[140px]';
  const heightClass = compacto ? 'min-h-[70px]' : 'min-h-[80px]';

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`${widthClass} ${heightClass} relative rounded transition-all ${
        hover && !isVazia ? 'scale-105 ring-2 ring-green-400' : ''
      }`}
      style={{
        background: isVazia ? 'transparent' : '#1a1a1a',
        border: isVazia ? '2px dashed #333' : `2px solid ${corBorda}`,
        borderLeftWidth: isVazia ? '2px' : '4px',
      }}
    >
      {/* Botão configurar quando vazia */}
      {isVazia && (
        <button
          onClick={onConfigurar}
          className="w-full h-full flex items-center justify-center text-gray-500 hover:text-yellow-400 text-xl font-bold transition-colors"
        >
          +
        </button>
      )}
      
      {/* Bancada configurada */}
      {!isVazia && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-2 pt-1.5">
            <p className="text-[10px] font-black truncate" style={{ color: corBorda }}>{titulo}</p>
            <div className="flex gap-1">
              {bancada.subtipo === 'CATEGORIA' && onConfigurar && (
                <button onClick={onConfigurar} className="text-gray-500 hover:text-yellow-400 text-[10px]">✏️</button>
              )}
              {!bancada.fixo_categoria && (
                <button onClick={onLimpar} className="text-red-400 hover:text-red-300 text-xs leading-none">×</button>
              )}
              {bancada.fixo_categoria && alocacoes.length > 0 && (
                <button onClick={onLimpar} className="text-gray-500 hover:text-red-400 text-[10px]" title="Limpar pessoas">🗑</button>
              )}
            </div>
          </div>
          
          {/* Colabs */}
          <div className="px-1.5 pb-1.5 pt-1 space-y-1">
            {alocacoes.length === 0 && (
              <div className="text-center text-[9px] text-gray-600 italic py-1">
                Arraste aqui
              </div>
            )}
            {alocacoes.slice(0, 2).map((a: any) => {
              const colab = colaboradores.find((c: any) => c.id_groot === a.id_groot);
              if (!colab) return null;
              const r = ritmoColab(a.id_groot);
              const cores = r !== null ? corRitmo(r) : null;
              return (
                <div key={a.id} className={`flex items-center gap-1 bg-[#0a0a0a] rounded px-1.5 py-1 border ${cores?.borda || 'border-[#2a2a2a]'}`}>
                  <span className={`text-[9px] font-bold w-4 ${cores?.cor || 'text-gray-400'}`}>{iniciais(colab.nome)}</span>
                  <span className="text-[9px] text-gray-300 truncate flex-1">{colab.nome.split(' ')[0]}</span>
                  <span className="text-[9px] font-mono">{r !== null ? `${r}%` : '⚪'}</span>
                  <button onClick={(e) => { e.stopPropagation(); onRemoverColab(a.id); }} className="text-red-400 text-[10px] leading-none">×</button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// MODAL CONFIG
// ============================================
function ModalConfig({ bancada, onClose, onSalvar }: any) {
  // Se já é fixo (centro), só permite mudar categoria
  const apenasCategoria = bancada.fixo_categoria && bancada.subtipo === 'CATEGORIA';
  
  const [subtipo, setSubtipo] = useState<SubtipoBancada>(bancada.subtipo || null);
  const [categoria, setCategoria] = useState<CategoriaSubtipo>(bancada.categoria || null);

  function salvar() {
    if (!subtipo) return alert('Escolha um tipo');
    if (subtipo === 'CATEGORIA' && !categoria) return alert('Escolha a categoria');
    onSalvar(subtipo, subtipo === 'CATEGORIA' ? categoria : null);
  }

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/80" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-[#1a1a1a] border-2 border-[#FFD700]/30 rounded-2xl max-w-md w-full p-5">
        <h3 className="text-lg font-black text-white mb-1">Configurar Bancada</h3>
        <p className="text-xs text-gray-400 mb-4">Linha {bancada.linha}</p>
        
        {!apenasCategoria && (
          <>
            <p className="text-xs text-gray-400 mb-2">Tipo:</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <button onClick={() => setSubtipo('GM')} className={`p-3 rounded border-2 text-xs font-bold transition-all ${subtipo === 'GM' ? 'border-yellow-400 bg-yellow-400/10 text-yellow-300' : 'border-[#2a2a2a] text-gray-400'}`}>⭐<br/>GM</button>
              <button onClick={() => setSubtipo('PESCA')} className={`p-3 rounded border-2 text-xs font-bold transition-all ${subtipo === 'PESCA' ? 'border-blue-400 bg-blue-400/10 text-blue-300' : 'border-[#2a2a2a] text-gray-400'}`}>🐟<br/>PESCA</button>
              <button onClick={() => setSubtipo('CATEGORIA')} className={`p-3 rounded border-2 text-xs font-bold transition-all ${subtipo === 'CATEGORIA' ? 'border-purple-400 bg-purple-400/10 text-purple-300' : 'border-[#2a2a2a] text-gray-400'}`}>📦<br/>CATEGORIA</button>
            </div>
          </>
        )}
        
        {subtipo === 'CATEGORIA' && (
          <>
            <p className="text-xs text-gray-400 mb-2">Sub-tipo:</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {CATEGORIAS.map(cat => (
                <button key={cat} onClick={() => setCategoria(cat)} className={`p-2 rounded border-2 text-xs font-bold transition-all ${categoria === cat ? 'border-purple-400 bg-purple-400/10 text-purple-300' : 'border-[#2a2a2a] text-gray-400'}`}>{cat}</button>
              ))}
            </div>
          </>
        )}
        
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 bg-[#2a2a2a] text-white py-2 rounded font-bold text-sm">Cancelar</button>
          <button onClick={salvar} className="flex-1 bg-[#FFD700] text-black py-2 rounded font-bold text-sm">Salvar</button>
        </div>
      </div>
    </div>
  );
}
