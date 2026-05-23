'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

// ============================================
// MAPEAMENTO DE STATUS — MELI → app
// ============================================

type ConfigStatus = {
  contaPresenca: boolean;
  contaAbs: boolean;
  categoria: 'presenca' | 'falta' | 'justificado' | 'descanso' | 'inativo';
  emoji: string;
  cor: string;
};

const MAPA_STATUS: Record<string, ConfigStatus> = {
  'P - Presente':                       { contaPresenca: true, contaAbs: false, categoria: 'presenca',    emoji: '✅', cor: 'green' },
  'DSR - Escala':                       { contaPresenca: false, contaAbs: false, categoria: 'descanso',   emoji: '🟦', cor: 'blue' },
  'FI - Falta Injustificada':           { contaPresenca: false, contaAbs: true, categoria: 'falta',       emoji: '🔴', cor: 'red' },
  'BH - Banco de Horas planejado':      { contaPresenca: false, contaAbs: false, categoria: 'justificado', emoji: '🟡', cor: 'yellow' },
  'BH - Banco de Horas não planejado':  { contaPresenca: false, contaAbs: true, categoria: 'falta',       emoji: '🟠', cor: 'orange' },
  'FJ - Atestado':                      { contaPresenca: false, contaAbs: false, categoria: 'justificado', emoji: '🩺', cor: 'green' },
  'FJ - Falecimento 1º grau':           { contaPresenca: false, contaAbs: false, categoria: 'justificado', emoji: '🕊️', cor: 'gray' },
  'FJ - Abono Fretado (falta)':         { contaPresenca: false, contaAbs: true, categoria: 'falta',       emoji: '🚌', cor: 'orange' },
  'DE - Desligado':                     { contaPresenca: false, contaAbs: false, categoria: 'inativo',    emoji: '🚪', cor: 'gray' },
  'HTF - HC Transferido para outro CAD':{ contaPresenca: false, contaAbs: false, categoria: 'inativo',    emoji: '🔄', cor: 'gray' },
  'SIE - Sinergia Externa':             { contaPresenca: true, contaAbs: false, categoria: 'presenca',    emoji: '🤝', cor: 'purple' },
  'FE - Férias':                        { contaPresenca: false, contaAbs: false, categoria: 'justificado', emoji: '🌴', cor: 'cyan' },
  'CE - Curso Externo':                 { contaPresenca: false, contaAbs: false, categoria: 'justificado', emoji: '🎓', cor: 'blue' },
  'AB - Abandono':                      { contaPresenca: false, contaAbs: true, categoria: 'falta',       emoji: '🚫', cor: 'red' },
  'AF - Afastamento':                   { contaPresenca: false, contaAbs: false, categoria: 'inativo',    emoji: '🏥', cor: 'gray' },
  'TR - Treinamento':                   { contaPresenca: false, contaAbs: false, categoria: 'justificado', emoji: '🎓', cor: 'cyan' },
};

function configStatus(status: string): ConfigStatus {
  // Match exato primeiro
  if (MAPA_STATUS[status]) return MAPA_STATUS[status];
  
  // Match parcial (caso tenha variações)
  const sUpper = status.toUpperCase();
  if (sUpper.includes('PRESENTE')) return MAPA_STATUS['P - Presente'];
  if (sUpper.includes('DSR')) return MAPA_STATUS['DSR - Escala'];
  if (sUpper.includes('FALTA INJUSTIF')) return MAPA_STATUS['FI - Falta Injustificada'];
  if (sUpper.includes('ATESTADO')) return MAPA_STATUS['FJ - Atestado'];
  if (sUpper.includes('FÉRIAS') || sUpper.includes('FERIAS')) return MAPA_STATUS['FE - Férias'];
  if (sUpper.includes('SINERGIA')) return MAPA_STATUS['SIE - Sinergia Externa'];
  if (sUpper.includes('BANCO DE HORAS')) {
    return sUpper.includes('NÃO PLAN') 
      ? MAPA_STATUS['BH - Banco de Horas não planejado']
      : MAPA_STATUS['BH - Banco de Horas planejado'];
  }
  
  // Fallback
  return { contaPresenca: false, contaAbs: false, categoria: 'justificado', emoji: '❓', cor: 'gray' };
}

// ============================================
// PARSER
// ============================================

function detectarDelimitador(texto: string): string {
  const primeiraLinha = texto.split('\n')[0] || '';
  const tabs = (primeiraLinha.match(/\t/g) || []).length;
  const pontosVirgula = (primeiraLinha.match(/;/g) || []).length;
  const virgulas = (primeiraLinha.match(/,/g) || []).length;
  
  if (tabs >= 10) return '\t';
  if (pontosVirgula > virgulas) return ';';
  return ',';
}

function parsearData(s: string): string | null {
  // DD/MM/YYYY → YYYY-MM-DD
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dia = m[1].padStart(2, '0');
  const mes = m[2].padStart(2, '0');
  return `${m[3]}-${mes}-${dia}`;
}

function parsearLinhaCSV(linha: string, delim: string): string[] {
  // Parser CSV simples que respeita aspas
  const cells: string[] = [];
  let atual = '';
  let dentroAspas = false;
  
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      dentroAspas = !dentroAspas;
    } else if (c === delim && !dentroAspas) {
      cells.push(atual);
      atual = '';
    } else {
      atual += c;
    }
  }
  cells.push(atual);
  return cells.map(c => c.trim());
}

// ============================================
// TIPOS
// ============================================

type RegistroPresenca = {
  id_groot: string;
  nome_colab: string;
  processo: string;
  data_entrada: string | null;
  data_referencia: string;
  status_meli: string;
  status_app: string;
  categoria: string;
  conta_presenca: boolean;
  conta_abs: boolean;
  emoji: string;
};

type ColabPreview = {
  id_groot: string;
  nome: string;
  processo: string;
  totalDias: number;
  presencas: number;
  faltas: number;
  justificados: number;
  descansos: number;
  pctAbs: number;
  registros: RegistroPresenca[];
  encontradoNoMeuTime: boolean;
};

// ============================================
// PÁGINA
// ============================================

export default function ImportarPresencaPage() {
  const router = useRouter();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [parseando, setParseando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [colabsPreview, setColabsPreview] = useState<ColabPreview[]>([]);
  const [totalLinhasIgnoradas, setTotalLinhasIgnoradas] = useState(0);
  const [periodo, setPeriodo] = useState<{ inicio: string; fim: string } | null>(null);
  const [erro, setErro] = useState('');

  async function selecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setArquivo(file);
    setColabsPreview([]);
    setErro('');
    setParseando(true);
    
    try {
      const texto = await file.text();
      const delim = detectarDelimitador(texto);
      const linhas = texto.split(/\r?\n/).filter(l => l.trim());
      
      if (linhas.length < 2) {
        throw new Error('CSV vazio ou sem dados');
      }
      
      // 1. Parser do header
      const header = parsearLinhaCSV(linhas[0], delim);
      console.log('📋 Header:', header);
      
      // 2. Identifica colunas fixas (por nome)
      const idxIdGroot = header.findIndex(h => 
        h.toUpperCase().replace(/[_ ]/g, '') === 'IDGROOT' || 
        h.toLowerCase() === 'id_groot'
      );
      const idxNome = header.findIndex(h => 
        h.toLowerCase().includes('nome completo') || h.toLowerCase() === 'nome'
      );
      const idxProcesso = header.findIndex(h => h.toLowerCase() === 'processo');
      const idxDataEntrada = header.findIndex(h => 
        h.toLowerCase().includes('data de entrada') || h.toLowerCase() === 'data_entrada'
      );
      const idxStatus = header.findIndex(h => h.toLowerCase() === 'status');
      
      if (idxIdGroot === -1 || idxNome === -1) {
        throw new Error(`Colunas necessárias não encontradas. Esperado: ID_GROOT e Nome Completo. Encontradas: ${header.slice(0, 18).join(', ')}`);
      }
      
      // 3. Identifica colunas de DATAS (DD/MM/YYYY)
      const colunasDatas: { idx: number; dataIso: string; dataBR: string }[] = [];
      for (let i = 0; i < header.length; i++) {
        const dataIso = parsearData(header[i]);
        if (dataIso) {
          colunasDatas.push({ idx: i, dataIso, dataBR: header[i] });
        }
      }
      
      if (colunasDatas.length === 0) {
        throw new Error('Nenhuma coluna de data encontrada no formato DD/MM/YYYY');
      }
      
      console.log(`📅 ${colunasDatas.length} dias detectados (${colunasDatas[0].dataBR} → ${colunasDatas[colunasDatas.length-1].dataBR})`);
      
      // Define período
      setPeriodo({
        inicio: colunasDatas[0].dataIso,
        fim: colunasDatas[colunasDatas.length - 1].dataIso,
      });
      
      // 4. Busca colabs do MEU TIME (filtragem)
      const { data: meuTime } = await supabase
        .from('colaboradores')
        .select('id_groot, nome, status')
        .eq('status', 'Ativo');
      
      const idsMeuTime = new Set((meuTime || []).map((c: any) => String(c.id_groot)));
      
      // 5. Processa cada linha (colab)
      const colabsMap: Record<string, ColabPreview> = {};
      let ignorados = 0;
      
      for (let i = 1; i < linhas.length; i++) {
        const cells = parsearLinhaCSV(linhas[i], delim);
        if (cells.length < Math.max(idxIdGroot, idxNome) + 1) continue;
        
        const idGroot = String(cells[idxIdGroot]).trim().replace(/\D/g, '');
        if (!idGroot) continue;
        
        const encontrado = idsMeuTime.has(idGroot);
        if (!encontrado) {
          ignorados++;
          continue;
        }
        
        const nome = cells[idxNome]?.trim() || 'Sem nome';
        const processo = idxProcesso >= 0 ? cells[idxProcesso]?.trim() || '' : '';
        const dataEntradaBR = idxDataEntrada >= 0 ? cells[idxDataEntrada]?.trim() : '';
        const dataEntrada = parsearData(dataEntradaBR);
        
        // Processa cada coluna de data
        const registros: RegistroPresenca[] = [];
        let presencas = 0, faltas = 0, justificados = 0, descansos = 0;
        
        for (const cd of colunasDatas) {
          const statusBruto = cells[cd.idx]?.trim();
          if (!statusBruto) continue;
          
          const config = configStatus(statusBruto);
          
          if (config.categoria === 'presenca') presencas++;
          else if (config.categoria === 'falta') faltas++;
          else if (config.categoria === 'justificado') justificados++;
          else if (config.categoria === 'descanso') descansos++;
          
          registros.push({
            id_groot: idGroot,
            nome_colab: nome,
            processo,
            data_entrada: dataEntrada,
            data_referencia: cd.dataIso,
            status_meli: statusBruto,
            status_app: config.categoria === 'presenca' ? 'presente' 
                      : config.categoria === 'falta' ? 'falta'
                      : config.categoria === 'justificado' ? 'justificado'
                      : config.categoria === 'descanso' ? 'descanso'
                      : 'inativo',
            categoria: config.categoria,
            conta_presenca: config.contaPresenca,
            conta_abs: config.contaAbs,
            emoji: config.emoji,
          });
        }
        
        const totalContabilizado = presencas + faltas + justificados; // exclui descansos
        const pctAbs = totalContabilizado > 0 ? (faltas / totalContabilizado) * 100 : 0;
        
        colabsMap[idGroot] = {
          id_groot: idGroot,
          nome,
          processo,
          totalDias: registros.length,
          presencas,
          faltas,
          justificados,
          descansos,
          pctAbs: Number(pctAbs.toFixed(1)),
          registros,
          encontradoNoMeuTime: true,
        };
      }
      
      const lista = Object.values(colabsMap).sort((a, b) => b.pctAbs - a.pctAbs);
      
      setColabsPreview(lista);
      setTotalLinhasIgnoradas(ignorados);
      
      if (lista.length === 0) {
        setErro('Nenhum colab do CSV bate com o "Meu Time" cadastrado. Verifique os IDs Groot.');
      }
      
    } catch (e: any) {
      console.error(e);
      setErro(e.message || 'Erro ao processar CSV');
    } finally {
      setParseando(false);
    }
  }

  async function confirmarImportacao() {
    if (colabsPreview.length === 0 || !periodo) return;
    
    setImportando(true);
    
    try {
      // 🗑️ Apaga registros antigos do período (substitui)
      await supabase
        .from('presenca')
        .delete()
        .gte('data_referencia', periodo.inicio)
        .lte('data_referencia', periodo.fim);
      
      // 💾 Insere todos os registros novos
      const todosRegistros = colabsPreview.flatMap(c => c.registros);
      
      const registrosParaInserir = todosRegistros.map(r => ({
        id_groot: r.id_groot,
        nome_colab: r.nome_colab,
        processo: r.processo,
        data_referencia: r.data_referencia,
        status: r.status_app,
        motivo: r.status_meli,
        categoria: r.categoria,
        conta_abs: r.conta_abs,
        conta_presenca: r.conta_presenca,
        registrado_por: 'csv_meli',
      }));
      
      // Insere em lotes de 500
      const LOTE = 500;
      for (let i = 0; i < registrosParaInserir.length; i += LOTE) {
        const lote = registrosParaInserir.slice(i, i + LOTE);
        const { error } = await supabase.from('presenca').insert(lote);
        if (error) throw new Error(error.message);
      }
      
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', `🎉 ${colabsPreview.length} colabs importados! ${todosRegistros.length} dias registrados`);
      }
      
      setTimeout(() => router.push('/presenca'), 1500);
      
    } catch (e: any) {
      console.error(e);
      setErro('Erro ao salvar: ' + e.message);
    } finally {
      setImportando(false);
    }
  }

  // Stats agregadas
  const stats = {
    total: colabsPreview.length,
    presencas: colabsPreview.reduce((s, c) => s + c.presencas, 0),
    faltas: colabsPreview.reduce((s, c) => s + c.faltas, 0),
    justificados: colabsPreview.reduce((s, c) => s + c.justificados, 0),
    altosAbs: colabsPreview.filter(c => c.pctAbs > 10).length,
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <Link href="/presenca" className="text-gray-400 hover:text-white transition-colors inline-flex items-center gap-2">
        ← Voltar para PRESENÇA
      </Link>

      <div>
        <h1 className="text-4xl font-black mb-2">
          📥 Importar <span className="text-[#FFD700]">Presença</span>
        </h1>
        <p className="text-gray-400">
          Sobe o CSV da plataforma MELI - o app filtra automaticamente só pelo seu time
        </p>
      </div>

      {/* Instruções */}
      <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/30 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-blue-300 mb-3 flex items-center gap-2">
          💡 Como funciona
        </h2>
        <ol className="space-y-2 text-sm text-gray-300 list-decimal pl-5">
          <li>Exporta da plataforma MELI o arquivo "<strong>BRRC01 | Pessoas - Lista de Presença</strong>"</li>
          <li>Sobe o CSV aqui (TAB-separated ou CSV padrão)</li>
          <li>O app detecta as colunas automaticamente: <code className="bg-[#0a0a0a] px-1.5 rounded text-blue-300">ID_GROOT</code>, <code className="bg-[#0a0a0a] px-1.5 rounded text-blue-300">Nome</code>, <code className="bg-[#0a0a0a] px-1.5 rounded text-blue-300">Datas</code></li>
          <li>Filtra <strong>SÓ</strong> os colabs do seu time (42 ativos)</li>
          <li>Calcula % de absenteísmo e estatísticas</li>
          <li>Você confirma e o app salva tudo no banco</li>
        </ol>
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
                : 'CSV da plataforma MELI (Pessoas - Lista de Presença)'}
            </p>
            <input
              type="file"
              accept=".csv,.txt,.tsv"
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

      {/* Preview */}
      {colabsPreview.length > 0 && !parseando && (
        <>
          {/* Período + ignorados */}
          {periodo && (
            <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/5 border border-purple-500/30 rounded-2xl p-4">
              <p className="text-purple-300 font-bold mb-1 flex items-center gap-2">
                📅 Período detectado
              </p>
              <p className="text-white text-lg font-mono">
                {periodo.inicio.split('-').reverse().join('/')} → {periodo.fim.split('-').reverse().join('/')}
              </p>
              {totalLinhasIgnoradas > 0 && (
                <p className="text-xs text-gray-400 mt-2">
                  ℹ️ {totalLinhasIgnoradas} colab(s) do CSV foram ignorados (não estão no seu time)
                </p>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4">
              <span className="text-2xl block mb-1">👥</span>
              <p className="text-2xl font-black text-white">{stats.total}</p>
              <p className="text-xs text-gray-400">Colabs do time</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
              <span className="text-2xl block mb-1">✅</span>
              <p className="text-2xl font-black text-green-400">{stats.presencas}</p>
              <p className="text-xs text-green-300">Presenças</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
              <span className="text-2xl block mb-1">🔴</span>
              <p className="text-2xl font-black text-red-400">{stats.faltas}</p>
              <p className="text-xs text-red-300">Faltas</p>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4">
              <span className="text-2xl block mb-1">🩺</span>
              <p className="text-2xl font-black text-yellow-400">{stats.justificados}</p>
              <p className="text-xs text-yellow-300">Justificados</p>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4">
              <span className="text-2xl block mb-1">⚠️</span>
              <p className="text-2xl font-black text-orange-400">{stats.altosAbs}</p>
              <p className="text-xs text-orange-300">ABS &gt; 10%</p>
            </div>
          </div>

          {/* Lista por colab */}
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              📋 Preview por Colaborador (ordenado por % ABS)
            </h3>
            
            <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
              {colabsPreview.map((c) => (
                <div 
                  key={c.id_groot}
                  className={`p-3 rounded-xl border ${
                    c.pctAbs > 10 
                      ? 'bg-red-500/5 border-red-500/30'
                      : c.pctAbs > 5
                      ? 'bg-yellow-500/5 border-yellow-500/30'
                      : 'bg-green-500/5 border-green-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold truncate">{c.nome}</p>
                      <p className="text-xs text-gray-500 font-mono">
                        ID: {c.id_groot} {c.processo && `· ${c.processo}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <div className="text-center">
                        <p className="text-green-400 font-mono font-bold">{c.presencas}</p>
                        <p className="text-[10px] text-gray-500">Presente</p>
                      </div>
                      <div className="text-center">
                        <p className="text-red-400 font-mono font-bold">{c.faltas}</p>
                        <p className="text-[10px] text-gray-500">Faltas</p>
                      </div>
                      <div className="text-center">
                        <p className="text-yellow-400 font-mono font-bold">{c.justificados}</p>
                        <p className="text-[10px] text-gray-500">Justif</p>
                      </div>
                      <div className="text-center">
                        <span className={`text-base font-mono font-black px-3 py-1 rounded-full ${
                          c.pctAbs > 10 ? 'bg-red-500/20 text-red-300'
                          : c.pctAbs > 5 ? 'bg-yellow-500/20 text-yellow-300'
                          : 'bg-green-500/20 text-green-300'
                        }`}>
                          {c.pctAbs.toFixed(1)}%
                        </span>
                        <p className="text-[10px] text-gray-500 mt-1">ABS</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Botões de ação */}
          <div className="flex gap-3 flex-wrap sticky bottom-4">
            <button
              onClick={() => {
                setArquivo(null);
                setColabsPreview([]);
                setErro('');
                setPeriodo(null);
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
                <>✅ Confirmar Importação ({stats.total} colabs)</>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
