'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

// ============================================
// TIPOS
// ============================================
type Colaborador = {
  id: number;
  id_groot: string;
  nome: string;
  processo: string | null;
  status: string;
};

type Bancada = {
  id: number;
  zona: 'checkin' | 'p2m' | 'sorting';
  linha: 1 | 2;
  lado: 'esquerdo' | 'direito';
  posicao: number;
  tipo_principal: 'GM' | 'Categoria';
  subtipo?: string | null;
};

type Alocacao = {
  id: number;
  bancada_id: number;
  id_groot: string;
  tipo_alocacao: 'fixo' | 'temporario' | 'fantasma';
};

type Ritmo = {
  id_groot: string;
  ritmo_pct: number;
};

const SUBTIPOS_CATEGORIA = ['Pesca', 'Saneante', 'High Value', 'Cosméticos', 'Mapa', 'Saúde', 'Alimento'];

const ZONAS_ORDEM = ['checkin', 'p2m', 'sorting'] as const;

function ehUpstream(zonaAtual: string, setorPrincipal: string): boolean {
  return ZONAS_ORDEM.indexOf(zonaAtual as any) < ZONAS_ORDEM.indexOf(setorPrincipal as any);
}
function ehSetorPrincipal(zonaAtual: string, setorPrincipal: string): boolean {
  return zonaAtual.toLowerCase() === setorPrincipal.toLowerCase();
}
function ehDownstream(zonaAtual: string, setorPrincipal: string): boolean {
  return ZONAS_ORDEM.indexOf(zonaAtual as any) > ZONAS_ORDEM.indexOf(setorPrincipal as any);
}

function corRitmo(pct: number): { cor: string; bg: string; emoji: string } {
  if (pct >= 70) return { cor: 'text-green-400', bg: 'bg-green-500/20', emoji: '🟢' };
  if (pct >= 45) return { cor: 'text-yellow-400', bg: 'bg-yellow-500/20', emoji: '🟡' };
  return { cor: 'text-red-400', bg: 'bg-red-500/20', emoji: '🔴' };
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(' ');
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
export default function MapeamentoLinhaPage() {
  const [setorPrincipal, setSetorPrincipal] = useState<string>('p2m');
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [bancadas, setBancadas] = useState<Bancada[]>([]);
  const [alocacoes, setAlocacoes] = useState<Alocacao[]>([]);
  const [ritmos, setRitmos] = useState<Ritmo[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal de criar bancada
  const [criandoBancada, setCriandoBancada] = useState<{ linha: 1 | 2; lado: 'esquerdo' | 'direito' } | null>(null);
  const [tipoSelecionado, setTipoSelecionado] = useState<'GM' | 'Categoria' | null>(null);
  const [subtipoSelecionado, setSubtipoSelecionado] = useState<string>('');
  
  // Drag
  const [colabArrastando, setColabArrastando] = useState<string | null>(null);
  
  // ============================================
  // CARREGAR DADOS
  // ============================================
  
  const carregarDados = useCallback(async () => {
    try {
      const hoje = new Date().toISOString().split('T')[0];
      
      const [confResp, colabsResp, bancadasResp, alocacoesResp, ritmoResp] = await Promise.all([
        supabase.from('config').select('chave, valor').eq('chave', 'setor_principal'),
        supabase.from('colaboradores').select('*').eq('status', 'Ativo'),
        supabase.from('layout_bancadas').select('*').eq('data_referencia', hoje).order('posicao'),
        supabase.from('layout_alocacao').select('*').eq('data_referencia', hoje),
        supabase.from('ritmo_atual').select('id_groot, ritmo_pct').eq('data_referencia', hoje),
      ]);
      
      if (confResp.data && confResp.data[0]) {
        setSetorPrincipal(String(confResp.data[0].valor).toLowerCase());
      }
      
      if (colabsResp.data) setColaboradores(colabsResp.data as any);
      if (bancadasResp.data) setBancadas(bancadasResp.data as any);
      if (alocacoesResp.data) setAlocacoes(alocacoesResp.data as any);
      if (ritmoResp.data) setRitmos(ritmoResp.data as any);
    } catch (e) {
      console.error('Erro:', e);
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    carregarDados();
  }, [carregarDados]);
  
  // ============================================
  // HELPERS
  // ============================================
  
  // Colabs ALOCADOS (já estão em alguma bancada)
  const colabsAlocadosIds = new Set(alocacoes.filter(a => a.tipo_alocacao !== 'fantasma').map(a => a.id_groot));
  
  // Colabs LIVRES (na sidebar lateral)
  const colabsLivres = colaboradores.filter(c => 
    !colabsAlocadosIds.has(c.id_groot) && 
    (c.processo === 'P2M' || setorPrincipal !== 'p2m')
  );
  
  // Ritmo de um colab
  function ritmoDoColab(idGroot: string): number | null {
    const r = ritmos.find(r => r.id_groot === idGroot);
    return r ? r.ritmo_pct : null;
  }
  
  // Bancadas de uma zona/linha/lado
  function bancadasDe(zona: string, linha: 1 | 2, lado: 'esquerdo' | 'direito'): Bancada[] {
    return bancadas.filter(b => b.zona === zona && b.linha === linha && b.lado === lado);
  }
  
  // Colabs de uma bancada
  function alocacoesDe(bancadaId: number): Alocacao[] {
    return alocacoes.filter(a => a.bancada_id === bancadaId);
  }
  
  // ============================================
  // AÇÕES
  // ============================================
  
  async function criarBancada(zona: string, linha: 1 | 2, lado: 'esquerdo' | 'direito', tipoPrincipal: 'GM' | 'Categoria', subtipo?: string) {
    const novaPosicao = bancadasDe(zona, linha, lado).length;
    
    const { data, error } = await supabase
      .from('layout_bancadas')
      .insert({
        zona, linha, lado, posicao: novaPosicao,
        tipo_principal: tipoPrincipal,
        subtipo: subtipo || null,
      })
      .select()
      .single();
    
    if (error) {
      alert('Erro: ' + error.message);
      return;
    }
    
    setBancadas(prev => [...prev, data as Bancada]);
    setCriandoBancada(null);
    setTipoSelecionado(null);
    setSubtipoSelecionado('');
  }
  
  async function excluirBancada(bancadaId: number) {
    if (!confirm('Excluir essa bancada?')) return;
    
    await supabase.from('layout_alocacao').delete().eq('bancada_id', bancadaId);
    await supabase.from('layout_bancadas').delete().eq('id', bancadaId);
    
    setBancadas(prev => prev.filter(b => b.id !== bancadaId));
    setAlocacoes(prev => prev.filter(a => a.bancada_id !== bancadaId));
  }
  
  async function alocarColab(bancadaId: number, idGroot: string) {
    // Remove alocação anterior do colab (se houver)
    await supabase.from('layout_alocacao').delete().eq('id_groot', idGroot).eq('data_referencia', new Date().toISOString().split('T')[0]);
    
    const { data, error } = await supabase
      .from('layout_alocacao')
      .insert({
        bancada_id: bancadaId,
        id_groot: idGroot,
        tipo_alocacao: 'fixo',
      })
      .select()
      .single();
    
    if (error) {
      alert('Erro: ' + error.message);
      return;
    }
    
    setAlocacoes(prev => [...prev.filter(a => a.id_groot !== idGroot), data as Alocacao]);
  }
  
  async function removerColab(alocacaoId: number) {
    await supabase.from('layout_alocacao').delete().eq('id', alocacaoId);
    setAlocacoes(prev => prev.filter(a => a.id !== alocacaoId));
  }
  
  async function trocarTipoAlocacao(alocacaoId: number, novoTipo: 'fixo' | 'temporario') {
    await supabase.from('layout_alocacao').update({ tipo_alocacao: novoTipo }).eq('id', alocacaoId);
    setAlocacoes(prev => prev.map(a => a.id === alocacaoId ? { ...a, tipo_alocacao: novoTipo } : a));
  }
  
  async function trocarSetor(novoSetor: string) {
    await supabase.from('config').upsert({ chave: 'setor_principal', valor: novoSetor });
    setSetorPrincipal(novoSetor.toLowerCase());
  }
  
  // Upload CSV
  async function handleUploadCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const text = await file.text();
    const linhas = text.split('\n').filter(l => l.trim());
    if (linhas.length < 2) return alert('CSV vazio');
    
    const header = linhas[0].toLowerCase().split(/[,;]/);
    const idIdx = header.findIndex(h => h.includes('id_groot') || h.includes('id'));
    const nomeIdx = header.findIndex(h => h.includes('nome'));
    const ritmoIdx = header.findIndex(h => h.includes('ritmo') || h.includes('pct') || h.includes('%'));
    
    if (idIdx < 0 || ritmoIdx < 0) return alert('CSV precisa ter colunas: id_groot e ritmo (ou ritmo_pct)');
    
    const novosRitmos: any[] = [];
    for (let i = 1; i < linhas.length; i++) {
      const cols = linhas[i].split(/[,;]/);
      const idGroot = String(cols[idIdx] || '').trim().replace(/['"]/g, '');
      const nome = nomeIdx >= 0 ? String(cols[nomeIdx] || '').trim() : '';
      const ritmo = Math.round(Number(String(cols[ritmoIdx] || '').replace(',', '.').replace('%', '').trim()) || 0);
      
      if (idGroot && ritmo > 0) {
        novosRitmos.push({ id_groot: idGroot, nome, ritmo_pct: ritmo });
      }
    }
    
    if (novosRitmos.length === 0) return alert('Nenhum dado válido no CSV');
    
    // Upsert
    const { error } = await supabase.from('ritmo_atual').upsert(novosRitmos, {
      onConflict: 'id_groot,data_referencia',
    });
    
    if (error) {
      alert('Erro: ' + error.message);
      return;
    }
    
    alert(`✅ ${novosRitmos.length} ritmos atualizados!`);
    await carregarDados();
  }
  
  // Drag handlers
  function handleDragStart(idGroot: string) {
    setColabArrastando(idGroot);
  }
  
  async function handleDropNaBancada(bancadaId: number) {
    if (!colabArrastando) return;
    await alocarColab(bancadaId, colabArrastando);
    setColabArrastando(null);
  }
  
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  
  // ============================================
  // RENDER
  // ============================================
  
  if (loading) {
    return <div className="text-center py-12 text-gray-400">Carregando...</div>;
  }
  
  const zonasVisiveis = ZONAS_ORDEM.filter(z => !ehDownstream(z, setorPrincipal));
  
  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black">
            🏭 Mapeamento <span className="text-[#FFD700]">Linha</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Centro de comando operacional · {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          {/* Setor */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="text-xs text-gray-400">Setor:</span>
            <select 
              value={setorPrincipal}
              onChange={(e) => trocarSetor(e.target.value)}
              className="bg-transparent text-white font-bold text-sm outline-none cursor-pointer"
            >
              <option value="checkin">📦 Checkin</option>
              <option value="p2m">🚚 P2M</option>
              <option value="sorting">📋 Sorting</option>
            </select>
          </div>
          
          {/* Upload CSV */}
          <label className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg px-3 py-2 text-sm font-bold cursor-pointer transition-all">
            ↑ Upload Boletim
            <input type="file" accept=".csv,.txt" onChange={handleUploadCSV} className="hidden" />
          </label>
        </div>
      </div>
      
      {/* LAYOUT 2 COLUNAS */}
      <div className="grid grid-cols-12 gap-4">
        
        {/* COLUNA ESQUERDA: COLABS LIVRES */}
        <div className="col-span-12 md:col-span-3">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
            <div className="bg-[#0a0a0a] px-4 py-3 border-b border-[#2a2a2a]">
              <h3 className="font-black text-[#FFD700] text-sm flex items-center justify-between">
                <span>👥 Colabs Livres</span>
                <span className="text-xs bg-[#2a2a2a] text-gray-400 px-2 py-0.5 rounded-full">{colabsLivres.length}</span>
              </h3>
            </div>
            <div className="p-2 space-y-2 max-h-[600px] overflow-y-auto">
              {colabsLivres.length === 0 ? (
                <p className="text-center text-gray-500 text-xs py-4">Todos alocados 🎉</p>
              ) : (
                colabsLivres.map((c) => {
                  const r = ritmoDoColab(c.id_groot);
                  const cores = r !== null ? corRitmo(r) : null;
                  return (
                    <div
                      key={c.id_groot}
                      draggable
                      onDragStart={() => handleDragStart(c.id_groot)}
                      className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-2.5 cursor-move hover:border-[#FFD700]/40 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full ${cores?.bg || 'bg-gray-500/20'} flex items-center justify-center font-bold text-xs ${cores?.cor || 'text-gray-400'}`}>
                          {iniciais(c.nome)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{c.nome.split(' ').slice(0, 2).join(' ')}</p>
                          <p className="text-[10px] text-gray-500">
                            {c.processo} {r !== null ? `· ${r}%${cores?.emoji}` : '· ⚪ sem CSV'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        
        {/* COLUNA DIREITA: LINHA */}
        <div className="col-span-12 md:col-span-9 space-y-4">
          
          {zonasVisiveis.map((zona) => {
            const editavel = ehSetorPrincipal(zona, setorPrincipal);
            const labelZona = zona === 'p2m' ? '🚚 P2M' : zona === 'checkin' ? '📦 CHECKIN' : '📋 SORTING';
            const corBorda = editavel ? 'border-[#FFD700]' : 'border-[#2a2a2a]';
            const bgZona = editavel ? 'bg-gradient-to-br from-[#FFD700]/5 to-transparent' : 'bg-[#1a1a1a]/50';
            
            return (
              <div key={zona} className={`${bgZona} border-2 ${corBorda} rounded-2xl overflow-hidden`}>
                <div className={`${editavel ? 'bg-[#FFD700]/10' : 'bg-[#0a0a0a]'} px-4 py-3 border-b ${corBorda} flex items-center justify-between`}>
                  <h3 className={`font-black ${editavel ? 'text-[#FFD700]' : 'text-gray-400'} text-sm`}>
                    {labelZona}
                    {editavel ? <span className="ml-2 text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">EDITÁVEL</span>
                              : <span className="ml-2 text-xs bg-gray-500/20 text-gray-500 px-2 py-0.5 rounded-full">SÓ LEITURA</span>}
                  </h3>
                </div>
                
                {/* 2 LINHAS */}
                <div className="p-4 grid grid-cols-2 gap-6">
                  {[1, 2].map((linha) => (
                    <div key={linha} className="space-y-2">
                      <p className="text-center text-xs font-bold text-gray-500 uppercase">Linha {linha}</p>
                      
                      {/* Esteira visual + bancadas */}
                      <div className="flex gap-2 items-stretch">
                        
                        {/* Lado esquerdo */}
                        <div className="flex-1 space-y-2">
                          {bancadasDe(zona, linha as 1 | 2, 'esquerdo').map(b => (
                            <RenderBancada 
                              key={b.id}
                              bancada={b}
                              alocacoes={alocacoesDe(b.id)}
                              colaboradores={colaboradores}
                              ritmos={ritmos}
                              editavel={editavel}
                              onExcluir={() => excluirBancada(b.id)}
                              onRemoverColab={removerColab}
                              onTrocarTipo={trocarTipoAlocacao}
                              onDragOver={handleDragOver}
                              onDrop={() => handleDropNaBancada(b.id)}
                            />
                          ))}
                          {editavel && (
                            <button
                              onClick={() => setCriandoBancada({ linha: linha as 1 | 2, lado: 'esquerdo' })}
                              className="w-full bg-[#0a0a0a] border-2 border-dashed border-[#2a2a2a] hover:border-[#FFD700]/40 rounded-lg py-3 text-xs text-gray-500 hover:text-[#FFD700] transition-all"
                            >
                              + Nova Bancada
                            </button>
                          )}
                        </div>
                        
                        {/* Esteira preta */}
                        <div className="w-3 bg-gradient-to-b from-gray-700 to-gray-900 rounded-full self-stretch"></div>
                        
                        {/* Lado direito */}
                        <div className="flex-1 space-y-2">
                          {bancadasDe(zona, linha as 1 | 2, 'direito').map(b => (
                            <RenderBancada 
                              key={b.id}
                              bancada={b}
                              alocacoes={alocacoesDe(b.id)}
                              colaboradores={colaboradores}
                              ritmos={ritmos}
                              editavel={editavel}
                              onExcluir={() => excluirBancada(b.id)}
                              onRemoverColab={removerColab}
                              onTrocarTipo={trocarTipoAlocacao}
                              onDragOver={handleDragOver}
                              onDrop={() => handleDropNaBancada(b.id)}
                            />
                          ))}
                          {editavel && (
                            <button
                              onClick={() => setCriandoBancada({ linha: linha as 1 | 2, lado: 'direito' })}
                              className="w-full bg-[#0a0a0a] border-2 border-dashed border-[#2a2a2a] hover:border-[#FFD700]/40 rounded-lg py-3 text-xs text-gray-500 hover:text-[#FFD700] transition-all"
                            >
                              + Nova Bancada
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          
        </div>
      </div>
      
      {/* MODAL CRIAR BANCADA */}
      {criandoBancada && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setCriandoBancada(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#1a1a1a] border-2 border-[#FFD700]/30 rounded-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-black text-white mb-4">Nova Bancada</h3>
            <p className="text-xs text-gray-400 mb-4">Linha {criandoBancada.linha} · Lado {criandoBancada.lado}</p>
            
            {/* Tipo principal */}
            {!tipoSelecionado && (
              <>
                <p className="text-sm font-bold text-gray-300 mb-3">Tipo:</p>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      criarBancada(setorPrincipal, criandoBancada.linha, criandoBancada.lado, 'GM');
                    }}
                    className="w-full bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-lg p-3 text-left transition-all"
                  >
                    <p className="text-white font-bold">⭐ GM</p>
                    <p className="text-xs text-gray-400">Alocação fixa, GM sempre fixo</p>
                  </button>
                  <button
                    onClick={() => setTipoSelecionado('Categoria')}
                    className="w-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg p-3 text-left transition-all"
                  >
                    <p className="text-white font-bold">📦 Categoria</p>
                    <p className="text-xs text-gray-400">Escolher entre 7 sub-tipos</p>
                  </button>
                </div>
              </>
            )}
            
            {/* Sub-tipos de Categoria */}
            {tipoSelecionado === 'Categoria' && (
              <>
                <p className="text-sm font-bold text-gray-300 mb-3">Sub-tipo:</p>
                <div className="grid grid-cols-2 gap-2">
                  {SUBTIPOS_CATEGORIA.map(st => (
                    <button
                      key={st}
                      onClick={() => criarBancada(setorPrincipal, criandoBancada.linha, criandoBancada.lado, 'Categoria', st)}
                      className="bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg p-3 text-white font-bold text-sm transition-all"
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </>
            )}
            
            <button
              onClick={() => { setCriandoBancada(null); setTipoSelecionado(null); }}
              className="w-full mt-4 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white font-bold py-2 rounded-lg transition-all"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// BANCADA COMPONENT
// ============================================
function RenderBancada({
  bancada, alocacoes, colaboradores, ritmos,
  editavel, onExcluir, onRemoverColab, onTrocarTipo,
  onDragOver, onDrop,
}: any) {
  const titulo = bancada.tipo_principal === 'GM' ? '⭐ GM' : `📦 ${bancada.subtipo}`;
  
  function ritmoDoColab(idGroot: string): number | null {
    const r = ritmos.find((r: any) => r.id_groot === idGroot);
    return r ? r.ritmo_pct : null;
  }
  
  return (
    <div
      onDragOver={editavel ? onDragOver : undefined}
      onDrop={editavel ? onDrop : undefined}
      className={`bg-[#0a0a0a] border ${editavel ? 'border-[#2a2a2a] hover:border-[#FFD700]/40' : 'border-[#2a2a2a]'} rounded-lg p-2 transition-all`}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-black text-[#FFD700]">{titulo}</p>
        {editavel && (
          <button onClick={onExcluir} className="text-red-400 hover:text-red-300 text-lg leading-none w-5 h-5 flex items-center justify-center">
            ×
          </button>
        )}
      </div>
      
      <div className="space-y-1">
        {alocacoes.length === 0 ? (
          <div className="text-center text-[10px] text-gray-600 py-3 border border-dashed border-[#2a2a2a] rounded">
            {editavel ? 'Arraste um colab aqui' : 'Vazio'}
          </div>
        ) : (
          alocacoes.map((a: Alocacao) => {
            const colab = colaboradores.find((c: Colaborador) => c.id_groot === a.id_groot);
            if (!colab) return null;
            const r = ritmoDoColab(a.id_groot);
            const cores = r !== null ? corRitmo(r) : null;
            
            return (
              <div key={a.id} className={`bg-[#1a1a1a] border ${cores?.bg.replace('/20', '/40') || 'border-[#2a2a2a]'} rounded p-1.5`}>
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full ${cores?.bg || 'bg-gray-500/20'} flex items-center justify-center font-bold text-[10px] ${cores?.cor || 'text-gray-400'}`}>
                    {iniciais(colab.nome)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-white truncate">{colab.nome.split(' ')[0]}</p>
                    <p className="text-[9px] text-gray-500">
                      {r !== null ? `${r}%${cores?.emoji}` : '⚪'} · {a.tipo_alocacao === 'fixo' ? '📍fixo' : '🔄temp'}
                    </p>
                  </div>
                  {editavel && (
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => onTrocarTipo(a.id, a.tipo_alocacao === 'fixo' ? 'temporario' : 'fixo')}
                        className="text-[8px] text-blue-400 hover:text-blue-300"
                        title="Trocar fixo/temporário"
                      >
                        ⇄
                      </button>
                      <button
                        onClick={() => onRemoverColab(a.id)}
                        className="text-[8px] text-red-400 hover:text-red-300"
                        title="Remover"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
