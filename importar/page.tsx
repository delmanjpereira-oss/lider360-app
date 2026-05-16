'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { supabase } from '../../../lib/supabase';

type LinhaCsv = {
  id_interno?: string;
  nome: string;
  id_groot: string;
  cargo: string;
  processo: string;
  aniversario: string;
  tempo_empresa: string;
  status: string;
  data_criacao: string;
  data_atualizacao: string;
  ferias_inicio?: string;
  ferias_fim?: string;
  data_promocao?: string;
};

type LinhaProcessada = {
  nome: string;
  id_groot: string;
  cargo: string;
  processo: string;
  aniversario: string | null;
  status: string;
  carreira: string | null;
  aniversarioOriginal: string;
  jaExiste: boolean;
  selecionado: boolean;
};

function normalizarCargo(cargo: string): string {
  const c = String(cargo || '').toUpperCase().trim();
  if (c.includes('MULTIPLI')) return 'MULTIPLICADOR';
  if (c.includes('REP 3')) return 'REP 3';
  if (c.includes('REP 2')) return 'REP 2';
  if (c.includes('REP 1')) return 'REP 1';
  return c;
}

function normalizarProcesso(p: string): string {
  const v = String(p || '').toUpperCase().trim();
  if (v.includes('CHECK')) return 'Checkin';
  if (v.includes('P2M')) return 'P2M';
  if (v.includes('SORT')) return 'Sorting';
  return p;
}

function normalizarStatus(s: string): string {
  const v = String(s || '').toUpperCase().trim();
  if (v.includes('FÉRIA') || v.includes('FERIA')) return 'Férias';
  if (v.includes('AFAST')) return 'Afastado';
  if (v.includes('INATIVO') || v.includes('DESLIG')) return 'Inativo';
  return 'Ativo';
}

// Tenta converter aniversário pra ISO (yyyy-mm-dd)
// Aceita: DD/MM/YYYY, YYYY-MM-DD, ou variações com ano "doido"
function parseAniversario(str: string): string | null {
  if (!str || !str.trim()) return null;
  const s = str.trim();

  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, ano, mes, dia] = m;
    return `${ano.padStart(4, '0')}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }

  // DD/MM/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{1,4})$/);
  if (m) {
    const [, dia, mes, ano] = m;
    const diaNum = parseInt(dia);
    const mesNum = parseInt(mes);
    if (diaNum < 1 || diaNum > 31 || mesNum < 1 || mesNum > 12) return null;
    // Pra aniversário só importa dia/mês (ano pode ser bagunçado)
    // Usa ano 2000 como placeholder se vier estranho
    const anoFinal = parseInt(ano) > 1900 && parseInt(ano) < 2030 ? ano.padStart(4, '0') : '2000';
    return `${anoFinal}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }

  return null;
}

export default function ImportarPage() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [linhasCsv, setLinhasCsv] = useState<LinhaCsv[]>([]);
  const [linhasProc, setLinhasProc] = useState<LinhaProcessada[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [filtroCargo, setFiltroCargo] = useState('todos');
  const [filtroProcesso, setFiltroProcesso] = useState('todos');

  // ━━━ Carrega arquivo ━━━
  function onArquivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setArquivo(f);
    setErro(null);
    setSucesso(null);
    setLinhasProc([]);
    setCarregando(true);

    Papa.parse<LinhaCsv>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setCarregando(false);
        if (result.errors.length > 0) {
          setErro('Erro ao ler CSV: ' + result.errors[0].message);
          return;
        }
        const linhas = result.data.filter((l) => l.nome && l.id_groot);
        setLinhasCsv(linhas);
      },
      error: (err) => {
        setCarregando(false);
        setErro('Erro: ' + err.message);
      },
    });
  }

  // ━━━ Processa linhas + checa duplicados ━━━
  useEffect(() => {
    async function processar() {
      if (linhasCsv.length === 0) return;

      const ids = linhasCsv.map((l) => String(l.id_groot).trim());
      const { data: existentes } = await supabase
        .from('colaboradores')
        .select('id_groot')
        .in('id_groot', ids);

      const setExistentes = new Set(
        (existentes || []).map((e) => String(e.id_groot))
      );

      const processadas: LinhaProcessada[] = linhasCsv.map((l) => {
        const id_groot = String(l.id_groot).trim();
        const aniversario = parseAniversario(l.aniversario);
        const cargo = normalizarCargo(l.cargo);
        const jaExiste = setExistentes.has(id_groot);

        return {
          nome: l.nome.trim(),
          id_groot,
          cargo,
          processo: normalizarProcesso(l.processo),
          aniversario,
          aniversarioOriginal: l.aniversario || '',
          status: normalizarStatus(l.status),
          carreira: cargo, // copia o cargo pra carreira
          jaExiste,
          selecionado: !jaExiste, // só marca os NOVOS por padrão
        };
      });

      setLinhasProc(processadas);
    }
    processar();
  }, [linhasCsv]);

  // ━━━ Importar selecionados ━━━
  async function importar() {
    const selecionados = linhasProc.filter((l) => l.selecionado);
    if (selecionados.length === 0) {
      setErro('Nenhum colaborador selecionado!');
      return;
    }

    setImportando(true);
    setErro(null);
    setSucesso(null);

    try {
      const inserts = selecionados
        .filter((l) => !l.jaExiste)
        .map((l) => ({
          nome: l.nome,
          id_groot: l.id_groot,
          cargo: l.cargo,
          processo: l.processo,
          aniversario: l.aniversario,
          status: l.status,
          carreira: l.carreira,
        }));

      // Atualizações (já existem mas o usuário marcou)
      const atualizacoes = selecionados.filter((l) => l.jaExiste);

      if (inserts.length > 0) {
        const { error } = await supabase.from('colaboradores').insert(inserts);
        if (error) throw new Error(error.message);
      }

      for (const l of atualizacoes) {
        await supabase
          .from('colaboradores')
          .update({
            nome: l.nome,
            cargo: l.cargo,
            processo: l.processo,
            aniversario: l.aniversario,
            status: l.status,
            carreira: l.carreira,
          })
          .eq('id_groot', l.id_groot);
      }

      setSucesso(
        `✅ Sucesso! ${inserts.length} novos cadastrados${
          atualizacoes.length > 0 ? `, ${atualizacoes.length} atualizados` : ''
        }.`
      );

      // Limpa após 4s
      setTimeout(() => {
        setLinhasCsv([]);
        setLinhasProc([]);
        setArquivo(null);
        const input = document.getElementById('input-csv') as HTMLInputElement;
        if (input) input.value = '';
      }, 4000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      setErro(msg);
    } finally {
      setImportando(false);
    }
  }

  // Filtros
  const linhasFiltradas = linhasProc.filter((l) => {
    if (filtroCargo !== 'todos' && l.cargo !== filtroCargo) return false;
    if (filtroProcesso !== 'todos' && l.processo !== filtroProcesso) return false;
    return true;
  });

  function toggleSelecao(id_groot: string) {
    setLinhasProc((prev) =>
      prev.map((l) =>
        l.id_groot === id_groot ? { ...l, selecionado: !l.selecionado } : l
      )
    );
  }

  function selecionarTodos() {
    setLinhasProc((prev) => prev.map((l) => ({ ...l, selecionado: true })));
  }

  function desselecionarTodos() {
    setLinhasProc((prev) => prev.map((l) => ({ ...l, selecionado: false })));
  }

  function selecionarApenasNovos() {
    setLinhasProc((prev) =>
      prev.map((l) => ({ ...l, selecionado: !l.jaExiste }))
    );
  }

  const totalSelecionados = linhasProc.filter((l) => l.selecionado).length;
  const totalNovos = linhasProc.filter((l) => !l.jaExiste).length;
  const totalExistentes = linhasProc.filter((l) => l.jaExiste).length;

  const cargosUnicos = Array.from(new Set(linhasProc.map((l) => l.cargo))).filter(Boolean);
  const processosUnicos = Array.from(new Set(linhasProc.map((l) => l.processo))).filter(Boolean);

  return (
    <div className="space-y-6 max-w-7xl">
      <Link
        href="/meu-time"
        className="text-gray-400 hover:text-white inline-flex items-center gap-2"
      >
        ← Voltar para MEU TIME
      </Link>

      <div>
        <h1 className="text-4xl font-black mb-2">
          📥 Importar <span className="text-[#FFD700]">Colaboradores</span>
        </h1>
        <p className="text-gray-400">
          Upload em massa via CSV — detecta duplicados automaticamente
        </p>
      </div>

      {sucesso && (
        <div className="bg-green-500/20 border border-green-500/40 text-green-300 rounded-lg p-4 font-bold">
          {sucesso}
        </div>
      )}
      {erro && (
        <div className="bg-red-500/20 border border-red-500/40 text-red-300 rounded-lg p-4">
          {erro}
        </div>
      )}

      {/* Instruções */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 text-sm text-blue-300">
        <p className="font-bold mb-2">💡 Como funciona:</p>
        <ul className="space-y-1 list-disc pl-5 text-xs">
          <li>O CSV deve ter as colunas: <code>nome</code>, <code>id_groot</code>, <code>cargo</code>, <code>processo</code>, <code>aniversario</code>, <code>status</code></li>
          <li>Colaboradores que <strong>já existem</strong> (pelo id_groot) são marcados em amarelo</li>
          <li>Marca os que quer importar e clica em <strong>Importar selecionados</strong></li>
          <li>Os já existentes podem ser <strong>atualizados</strong> (se você marcar)</li>
        </ul>
      </div>

      {/* Upload */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6">
        <h2 className="text-lg font-bold text-[#FFD700] mb-4">
          1️⃣ Selecionar arquivo CSV
        </h2>
        <input
          id="input-csv"
          type="file"
          accept=".csv"
          onChange={onArquivoChange}
          className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white file:bg-[#FFD700] file:text-black file:font-bold file:border-0 file:px-4 file:py-1 file:rounded file:mr-3"
        />

        {carregando && (
          <p className="text-gray-400 text-sm mt-3">⏳ Lendo arquivo...</p>
        )}
        {arquivo && !carregando && linhasCsv.length > 0 && (
          <p className="text-green-400 text-sm mt-3">
            ✅ {linhasCsv.length} linhas detectadas
          </p>
        )}
      </div>

      {linhasProc.length > 0 && (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
              <p className="text-2xl font-black text-white">{linhasProc.length}</p>
              <p className="text-xs text-gray-400">Total no CSV</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
              <p className="text-2xl font-black text-green-400">{totalNovos}</p>
              <p className="text-xs text-green-300">Novos</p>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4">
              <p className="text-2xl font-black text-yellow-400">{totalExistentes}</p>
              <p className="text-xs text-yellow-300">Já cadastrados</p>
            </div>
            <div className="bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-2xl p-4">
              <p className="text-2xl font-black text-[#FFD700]">{totalSelecionados}</p>
              <p className="text-xs text-yellow-300">Selecionados</p>
            </div>
          </div>

          {/* Filtros + Ações */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <select
              value={filtroCargo}
              onChange={(e) => setFiltroCargo(e.target.value)}
              className="bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-1.5 text-white text-sm"
            >
              <option value="todos">Todos os cargos</option>
              {cargosUnicos.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <select
              value={filtroProcesso}
              onChange={(e) => setFiltroProcesso(e.target.value)}
              className="bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-1.5 text-white text-sm"
            >
              <option value="todos">Todos os processos</option>
              {processosUnicos.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <div className="flex-1"></div>

            <button
              onClick={selecionarApenasNovos}
              className="text-xs px-3 py-1.5 bg-green-500/20 text-green-300 rounded-lg hover:bg-green-500/30"
            >
              ✓ Só os novos
            </button>
            <button
              onClick={selecionarTodos}
              className="text-xs px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30"
            >
              Marcar todos
            </button>
            <button
              onClick={desselecionarTodos}
              className="text-xs px-3 py-1.5 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30"
            >
              Desmarcar
            </button>
          </div>

          {/* Tabela de preview */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0a0a0a]">
                  <tr className="border-b border-[#2a2a2a] text-left text-xs text-gray-400 uppercase">
                    <th className="py-3 px-3 w-12 text-center">✓</th>
                    <th className="py-3 px-2">Status</th>
                    <th className="py-3 px-2">ID Groot</th>
                    <th className="py-3 px-2">Nome</th>
                    <th className="py-3 px-2">Cargo</th>
                    <th className="py-3 px-2">Processo</th>
                    <th className="py-3 px-2">Aniversário</th>
                    <th className="py-3 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.map((l) => (
                    <tr
                      key={l.id_groot}
                      className={`border-b border-[#2a2a2a] hover:bg-[#0a0a0a] ${
                        l.jaExiste ? 'bg-yellow-500/5' : ''
                      }`}
                    >
                      <td className="py-2 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={l.selecionado}
                          onChange={() => toggleSelecao(l.id_groot)}
                          className="w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="py-2 px-2">
                        {l.jaExiste ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-bold">
                            🔄 Existe
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-bold">
                            ✨ Novo
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-white font-mono text-xs">{l.id_groot}</td>
                      <td className="py-2 px-2 text-white">{l.nome}</td>
                      <td className="py-2 px-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#FFD700]/20 text-[#FFD700] font-bold">
                          {l.cargo}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold">
                          {l.processo}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-gray-300 text-xs">
                        {l.aniversario ? (
                          <span>
                            {l.aniversario.substring(8, 10)}/{l.aniversario.substring(5, 7)}
                          </span>
                        ) : (
                          <span className="text-gray-600">
                            {l.aniversarioOriginal || '—'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          l.status === 'Ativo'
                            ? 'bg-green-500/20 text-green-400'
                            : l.status === 'Férias'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {linhasFiltradas.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                Nenhum colaborador no filtro
              </div>
            )}
          </div>

          {/* Botão de importação */}
          <button
            onClick={importar}
            disabled={importando || totalSelecionados === 0}
            className="w-full bg-[#FFD700] text-black font-black py-4 rounded-xl hover:bg-yellow-300 transition-colors text-lg disabled:opacity-50"
          >
            {importando
              ? '⏳ Importando...'
              : `📥 Importar ${totalSelecionados} colaboradores`}
          </button>
        </>
      )}
    </div>
  );
}
