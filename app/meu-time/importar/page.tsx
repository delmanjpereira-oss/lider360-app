'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

// ============================================
// MAPEAMENTO de processos do CSV → app
// ============================================
const MAPA_PROCESSOS: Record<string, string> = {
  'pick to movable': 'P2M',
  'p2m': 'P2M',
  'check-in': 'Checkin',
  'checkin': 'Checkin',
  'check in': 'Checkin',
  'sorter': 'Sorter',
  'sh': 'Sorter',
};

type ColabExtraido = {
  id_groot: string;
  nome: string;
  processo: string | null;
  processoBruto: string;
  // Pra preview
  status: 'novo' | 'existente' | 'processo_diferente';
  processoAnterior?: string | null;
  nomeAnterior?: string | null;
};

type ColabBanco = {
  id: number;
  id_groot: string;
  nome: string;
  processo: string | null;
  status: string;
};

function normalizar(s: string): string {
  return s.trim().toLowerCase();
}

function mapearProcesso(bruto: string): string | null {
  const chave = normalizar(bruto);
  return MAPA_PROCESSOS[chave] || null;
}

function detectarDelimitador(texto: string): string {
  const primeiraLinha = texto.split('\n')[0] || '';
  const virgulas = (primeiraLinha.match(/,/g) || []).length;
  const pontosVirgula = (primeiraLinha.match(/;/g) || []).length;
  const tabs = (primeiraLinha.match(/\t/g) || []).length;
  
  if (tabs >= virgulas && tabs >= pontosVirgula) return '\t';
  if (pontosVirgula >= virgulas) return ';';
  return ',';
}

export default function ImportarTimePage() {
  const router = useRouter();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [parseando, setParseando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [colabsExtraidos, setColabsExtraidos] = useState<ColabExtraido[]>([]);
  const [naoEncontrados, setNaoEncontrados] = useState<ColabBanco[]>([]);
  const [acaoNaoEncontrados, setAcaoNaoEncontrados] = useState<'manter' | 'inativar'>('manter');
  const [erro, setErro] = useState<string>('');

  async function selecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setArquivo(file);
    setColabsExtraidos([]);
    setNaoEncontrados([]);
    setErro('');
    setParseando(true);
    
    try {
      const texto = await file.text();
      const delim = detectarDelimitador(texto);
      const linhas = texto.split(/\r?\n/).filter(l => l.trim());
      
      if (linhas.length < 2) {
        throw new Error('CSV vazio ou sem dados');
      }
      
      // Headers
      const headers = linhas[0].split(delim).map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
      
      // Procura colunas (flexível)
      const idxId = headers.findIndex(h => h === 'id' || h.includes('id'));
      const idxNome = headers.findIndex(h => 
        h.includes('representante') || h === 'nome' || h.includes('colaborador')
      );
      const idxProc = headers.findIndex(h => 
        h.includes('processo de estado') || h === 'processo' || h.includes('process')
      );
      
      if (idxId === -1 || idxNome === -1) {
        throw new Error(`Colunas não encontradas. Esperado: ID, Representantes. Encontrado: ${headers.join(', ')}`);
      }
      
      // Busca todos os colabs do banco
      const { data: colabsBanco } = await supabase
        .from('colaboradores')
        .select('id, id_groot, nome, processo, status');
      
      const mapaBanco = new Map<string, ColabBanco>();
      colabsBanco?.forEach((c: any) => mapaBanco.set(String(c.id_groot), c));
      
      // Processa linhas
      const idsNoCsv = new Set<string>();
      const extraidos: ColabExtraido[] = [];
      const vistosNoArquivo = new Set<string>();
      
      for (let i = 1; i < linhas.length; i++) {
        const cols = linhas[i].split(delim).map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < Math.max(idxId, idxNome) + 1) continue;
        
        const id_groot = cols[idxId]?.trim();
        const nome = cols[idxNome]?.trim();
        const processoBruto = idxProc >= 0 ? cols[idxProc]?.trim() : '';
        
        if (!id_groot || !nome) continue;
        if (vistosNoArquivo.has(id_groot)) continue;
        vistosNoArquivo.add(id_groot);
        idsNoCsv.add(id_groot);
        
        const processo = mapearProcesso(processoBruto);
        const existente = mapaBanco.get(id_groot);
        
        let status: 'novo' | 'existente' | 'processo_diferente' = 'novo';
        if (existente) {
          if (processo && existente.processo !== processo) {
            status = 'processo_diferente';
          } else {
            status = 'existente';
          }
        }
        
        extraidos.push({
          id_groot,
          nome,
          processo,
          processoBruto,
          status,
          processoAnterior: existente?.processo || null,
          nomeAnterior: existente?.nome || null,
        });
      }
      
      // Identifica não encontrados (tá no banco mas não no CSV)
      const semCsv: ColabBanco[] = [];
      colabsBanco?.forEach((c: any) => {
        if (!idsNoCsv.has(String(c.id_groot)) && c.status === 'Ativo') {
          semCsv.push(c);
        }
      });
      
      setColabsExtraidos(extraidos);
      setNaoEncontrados(semCsv);
      
      if (extraidos.length === 0) {
        setErro('Nenhum colaborador válido encontrado no CSV');
      }
      
    } catch (e: any) {
      console.error(e);
      setErro(e.message || 'Erro ao processar CSV');
    } finally {
      setParseando(false);
    }
  }

  async function confirmarImportacao() {
    if (colabsExtraidos.length === 0) return;
    
    setImportando(true);
    
    try {
      // UPSERT: cadastra novos, atualiza existentes
      const paraInserir = colabsExtraidos.map(c => ({
        id_groot: c.id_groot,
        nome: c.nome,
        processo: c.processo,
        status: 'Ativo',
      }));
      
      const { data: inserido, error } = await supabase
        .from('colaboradores')
        .upsert(paraInserir, { onConflict: 'id_groot' })
        .select();
      
      if (error) {
        throw new Error(error.message);
      }
      
      // Se escolheu inativar não encontrados
      if (acaoNaoEncontrados === 'inativar' && naoEncontrados.length > 0) {
        const idsParaInativar = naoEncontrados.map(c => c.id);
        await supabase
          .from('colaboradores')
          .update({ status: 'Inativo' })
          .in('id', idsParaInativar);
      }
      
      const novos = colabsExtraidos.filter(c => c.status === 'novo').length;
      const atualizados = colabsExtraidos.filter(c => c.status === 'existente' || c.status === 'processo_diferente').length;
      
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', `🎉 ${novos} novo(s) cadastrado(s), ${atualizados} atualizado(s)!`);
      }
      
      setTimeout(() => router.push('/meu-time'), 1500);
      
    } catch (e: any) {
      console.error(e);
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('error', 'Erro: ' + e.message);
      }
    } finally {
      setImportando(false);
    }
  }

  // Stats
  const stats = {
    total: colabsExtraidos.length,
    novos: colabsExtraidos.filter(c => c.status === 'novo').length,
    existentes: colabsExtraidos.filter(c => c.status === 'existente').length,
    processoDiferente: colabsExtraidos.filter(c => c.status === 'processo_diferente').length,
  };

  return (
    <div className="space-y-6">
      <Link href="/meu-time" className="text-gray-400 hover:text-white transition-colors inline-flex items-center gap-2">
        ← Voltar para MEU TIME
      </Link>

      <div>
        <h1 className="text-4xl font-black mb-2">
          📥 Importar <span className="text-[#FFD700]">Time</span>
        </h1>
        <p className="text-gray-400">
          Cadastra ou atualiza o time inteiro de uma vez via CSV de produtividade
        </p>
      </div>

      {/* Como funciona */}
      <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/30 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-blue-300 mb-3 flex items-center gap-2">
          💡 Como funciona
        </h2>
        <div className="space-y-2 text-sm text-gray-300">
          <p>
            <span className="text-blue-400 font-bold">1.</span> Sobe o mesmo CSV que você usa pra subir produtividade
          </p>
          <p>
            <span className="text-blue-400 font-bold">2.</span> O app lê <code className="bg-[#0a0a0a] px-1.5 py-0.5 rounded text-blue-300">ID</code>, <code className="bg-[#0a0a0a] px-1.5 py-0.5 rounded text-blue-300">Representantes</code> e <code className="bg-[#0a0a0a] px-1.5 py-0.5 rounded text-blue-300">Processo de estado</code>
          </p>
          <p>
            <span className="text-blue-400 font-bold">3.</span> Mostra pré-visualização (novos / atualizações)
          </p>
          <p>
            <span className="text-blue-400 font-bold">4.</span> Você confirma e pronto — time todo cadastrado/atualizado
          </p>
        </div>
      </div>

      {/* Upload */}
      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6">
        <label className="block">
          <div className="border-2 border-dashed border-[#2a2a2a] hover:border-[#FFD700]/40 rounded-2xl p-8 text-center cursor-pointer transition-all">
            <span className="text-6xl block mb-3">📂</span>
            <p className="text-white font-bold mb-1">
              {arquivo ? arquivo.name : 'Clique pra selecionar o CSV'}
            </p>
            <p className="text-xs text-gray-500">
              {arquivo 
                ? `${(arquivo.size / 1024).toFixed(1)} KB - clique pra trocar`
                : 'CSV de produtividade (formato padrão)'}
            </p>
            <input
              type="file"
              accept=".csv,.txt"
              onChange={selecionarArquivo}
              className="hidden"
              disabled={parseando || importando}
            />
          </div>
        </label>
      </div>

      {/* Loading */}
      {parseando && (
        <div className="text-center py-8">
          <span className="text-5xl block mb-3 animate-pulse">⏳</span>
          <p className="text-gray-400 font-bold">Processando CSV...</p>
        </div>
      )}

      {/* Erro */}
      {erro && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
          <p className="text-red-300 font-bold">❌ {erro}</p>
        </div>
      )}

      {/* Pré-visualização */}
      {colabsExtraidos.length > 0 && !parseando && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xl">📊</span>
                <span className="text-2xl font-black text-white">{stats.total}</span>
              </div>
              <p className="text-xs text-gray-400 font-bold uppercase">Total no CSV</p>
            </div>
            <div className="bg-gradient-to-br from-green-500/10 to-emerald-600/5 border border-green-500/30 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xl">✨</span>
                <span className="text-2xl font-black text-green-400">{stats.novos}</span>
              </div>
              <p className="text-xs text-green-300 font-bold uppercase">Novos</p>
            </div>
            <div className="bg-gradient-to-br from-blue-500/10 to-cyan-600/5 border border-blue-500/30 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xl">🔄</span>
                <span className="text-2xl font-black text-blue-400">{stats.existentes}</span>
              </div>
              <p className="text-xs text-blue-300 font-bold uppercase">Já existem</p>
            </div>
            <div className="bg-gradient-to-br from-yellow-500/10 to-amber-600/5 border border-yellow-500/30 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xl">⚠️</span>
                <span className="text-2xl font-black text-yellow-400">{stats.processoDiferente}</span>
              </div>
              <p className="text-xs text-yellow-300 font-bold uppercase">Proc. mudou</p>
            </div>
          </div>

          {/* Lista detalhada */}
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              📋 Detalhes da Importação
            </h3>
            
            <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
              {colabsExtraidos.map((c, idx) => (
                <div 
                  key={c.id_groot}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    c.status === 'novo' 
                      ? 'bg-green-500/5 border-green-500/20'
                      : c.status === 'processo_diferente'
                      ? 'bg-yellow-500/5 border-yellow-500/20'
                      : 'bg-[#0a0a0a] border-[#2a2a2a]'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {c.status === 'novo' && <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-300 rounded-full font-bold">✨ NOVO</span>}
                      {c.status === 'processo_diferente' && <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-300 rounded-full font-bold">🔄 PROC. MUDOU</span>}
                      {c.status === 'existente' && <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full font-bold">✓ ATUALIZAR</span>}
                      <span className="text-white font-bold text-sm">{c.nome}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      ID: <span className="font-mono">{c.id_groot}</span>
                      {c.status === 'processo_diferente' && (
                        <span className="text-yellow-400 ml-2">
                          • {c.processoAnterior || '—'} → <strong>{c.processo}</strong>
                        </span>
                      )}
                    </p>
                  </div>
                  {c.processo && (
                    <span className="text-xs px-2 py-1 rounded-full font-bold bg-cyan-500/20 text-cyan-400 flex-shrink-0 ml-3">
                      {c.processo}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Não encontrados */}
          {naoEncontrados.length > 0 && (
            <div className="bg-gradient-to-br from-orange-500/10 to-amber-600/5 border border-orange-500/30 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-orange-300 mb-3 flex items-center gap-2">
                ⚠️ {naoEncontrados.length} colab(s) Ativo(s) que NÃO estão no CSV
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                Talvez folga, atestado, férias, ou saíram do time. O que fazer?
              </p>
              
              <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                {naoEncontrados.map(c => (
                  <div key={c.id} className="flex items-center gap-2 p-2 bg-[#0a0a0a] rounded-lg">
                    <span className="text-orange-400">•</span>
                    <span className="text-white text-sm flex-1">{c.nome}</span>
                    <span className="text-xs text-gray-500 font-mono">{c.id_groot}</span>
                    {c.processo && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-cyan-500/20 text-cyan-400">
                        {c.processo}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setAcaoNaoEncontrados('manter')}
                  className={`p-3 rounded-lg text-sm font-bold transition-all ${
                    acaoNaoEncontrados === 'manter'
                      ? 'bg-green-500/20 border border-green-500/40 text-green-300'
                      : 'bg-[#0a0a0a] border border-[#2a2a2a] text-gray-400'
                  }`}
                >
                  ✓ Manter cadastrados
                </button>
                <button
                  onClick={() => setAcaoNaoEncontrados('inativar')}
                  className={`p-3 rounded-lg text-sm font-bold transition-all ${
                    acaoNaoEncontrados === 'inativar'
                      ? 'bg-red-500/20 border border-red-500/40 text-red-300'
                      : 'bg-[#0a0a0a] border border-[#2a2a2a] text-gray-400'
                  }`}
                >
                  🚪 Marcar como Inativo
                </button>
              </div>
            </div>
          )}

          {/* Ações finais */}
          <div className="flex gap-3 flex-wrap sticky bottom-4">
            <button
              onClick={() => {
                setArquivo(null);
                setColabsExtraidos([]);
                setNaoEncontrados([]);
                setErro('');
              }}
              disabled={importando}
              className="flex-1 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={confirmarImportacao}
              disabled={importando}
              className="flex-1 bg-gradient-to-br from-[#FFD700] to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 text-black font-black py-3 px-6 rounded-xl shadow-lg shadow-[#FFD700]/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {importando ? (
                <><span className="animate-spin">⏳</span> Importando...</>
              ) : (
                <>✅ Confirmar Importação ({stats.total})</>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
