'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

type TabelaInfo = {
  nome: string;
  label: string;
  icone: string;
  registros: number;
  tamanhoEstimadoMB: number;
  descricao: string;
  permiteApagar: boolean;
  temArquivoOrigem: boolean;
};

type UploadHistorico = {
  id: number;
  arquivo: string;
  tabela: string;
  linhas: number;
  data: string;
};

const BYTES_POR_REGISTRO: Record<string, number> = {
  colaboradores: 400,
  historico: 500,
  feedbacks: 350,
  tarefas: 280,
  dpmo_eventos: 400,
  dpmo_agregado: 200,
  ima_manual: 150,
  como_manual: 150,
  uploads: 250,
  config: 100,
};

const TABELAS_CONFIG: Array<{
  nome: string;
  label: string;
  icone: string;
  descricao: string;
  permiteApagar: boolean;
  temArquivoOrigem: boolean;
}> = [
  { nome: 'colaboradores', label: 'Colaboradores', icone: '👥', descricao: 'Cadastro do time (não apague sem cuidado)', permiteApagar: false, temArquivoOrigem: false },
  { nome: 'historico', label: 'Histórico de Produtividade', icone: '📊', descricao: 'Dados diários do CSV de produtividade', permiteApagar: true, temArquivoOrigem: true },
  { nome: 'feedbacks', label: 'Feedbacks', icone: '💬', descricao: 'Feedbacks dados aos colaboradores', permiteApagar: false, temArquivoOrigem: false },
  { nome: 'tarefas', label: 'Tarefas (Copiloto)', icone: '✅', descricao: 'Tarefas geradas pelo copiloto', permiteApagar: true, temArquivoOrigem: false },
  { nome: 'dpmo_eventos', label: 'DPMO Detalhado', icone: '📦', descricao: 'Eventos detalhados do inventário (com SKU)', permiteApagar: true, temArquivoOrigem: true },
  { nome: 'dpmo_agregado', label: 'DPMO Agregado', icone: '📋', descricao: 'DPMO já calculado por semana (Tabela Dinâmica)', permiteApagar: true, temArquivoOrigem: true },
  { nome: 'ima_manual', label: 'IMA Manual', icone: '✏️', descricao: 'IMAs editados manualmente na Calibração', permiteApagar: true, temArquivoOrigem: false },
  { nome: 'como_manual', label: 'COMO Manual', icone: '🎯', descricao: 'COMOs editados manualmente na Calibração', permiteApagar: true, temArquivoOrigem: false },
  { nome: 'uploads', label: 'Log de Uploads', icone: '📁', descricao: 'Histórico de uploads realizados', permiteApagar: true, temArquivoOrigem: false },
  { nome: 'config', label: 'Configurações/Metas', icone: '⚙️', descricao: 'Metas e parâmetros do app', permiteApagar: false, temArquivoOrigem: false },
];

const LIMITE_MB = 500;

export default function ConfiguracoesAppPage() {
  const [tabelas, setTabelas] = useState<TabelaInfo[]>([]);
  const [uploads, setUploads] = useState<UploadHistorico[]>([]);
  const [loading, setLoading] = useState(true);
  const [apagandoTudo, setApagandoTudo] = useState(false);
  const [confirmacaoApagarTudo, setConfirmacaoApagarTudo] = useState('');
  
  // 🎯 States pra duplicatas
  const [duplicatas, setDuplicatas] = useState<any[]>([]);
  const [buscandoDup, setBuscandoDup] = useState(false);
  const [limpandoDup, setLimpandoDup] = useState(false);
  const [mensagemDup, setMensagemDup] = useState<string | null>(null);
  
  // 🎯 Limpeza de IMA/DPMO por mês
  const [mesLimpeza, setMesLimpeza] = useState(5);
  const [anoLimpeza, setAnoLimpeza] = useState(2026);
  const [processoLimpeza, setProcessoLimpeza] = useState<'Checkin' | 'P2M' | 'Ambos'>('Ambos');
  const [limpandoMes, setLimpandoMes] = useState(false);
  const [mensagemLimpeza, setMensagemLimpeza] = useState<string | null>(null);

  useEffect(() => {
    carregar();
  }, []);
  
  // 🎯 Procura duplicatas no histórico
  async function buscarDuplicatas() {
    setBuscandoDup(true);
    setMensagemDup(null);
    setDuplicatas([]);
    
    try {
      // Pagina pra pegar TODO o histórico
      const todos: any[] = [];
      const PAGE = 1000;
      let pagina = 0;
      
      while (true) {
        const { data, error } = await supabase
          .from('historico')
          .select('id, id_groot, data_referencia, processo, unidades, prod_liquida, arquivo_origem, criado_em')
          .range(pagina * PAGE, pagina * PAGE + PAGE - 1)
          .order('criado_em', { ascending: false });
        
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;
        
        todos.push(...data);
        if (data.length < PAGE) break;
        pagina++;
        if (pagina > 50) break;
      }
      
      // Agrupa por (id_groot + data + processo)
      const grupos: Record<string, any[]> = {};
      todos.forEach((h) => {
        if (!h.id_groot) return;
        const chave = `${h.id_groot}|${h.data_referencia}|${h.processo}`;
        if (!grupos[chave]) grupos[chave] = [];
        grupos[chave].push(h);
      });
      
      // Filtra só os que têm mais de 1
      const dups: any[] = [];
      Object.entries(grupos).forEach(([chave, registros]) => {
        if (registros.length > 1) {
          const [id_groot, data_referencia, processo] = chave.split('|');
          const totalSomado = registros.reduce((s, r) => s + (Number(r.unidades) || 0), 0);
          const valorCorreto = Number(registros[0].unidades) || 0;
          dups.push({
            id_groot,
            data_referencia,
            processo,
            duplicatas: registros.length,
            total_somado: totalSomado,
            valor_correto: valorCorreto,
            arquivos: Array.from(new Set(registros.map((r) => r.arquivo_origem))),
          });
        }
      });
      
      // Busca nomes
      if (dups.length > 0) {
        const ids = Array.from(new Set(dups.map((d) => d.id_groot)));
        const { data: colabs } = await supabase
          .from('colaboradores')
          .select('id_groot, nome')
          .in('id_groot', ids);
        
        if (colabs) {
          const nomeMap: Record<string, string> = {};
          colabs.forEach((c: any) => { nomeMap[c.id_groot] = c.nome; });
          dups.forEach((d) => { d.nome_colab = nomeMap[d.id_groot] || 'Desconhecido'; });
        }
      }
      
      dups.sort((a, b) => b.duplicatas - a.duplicatas);
      setDuplicatas(dups);
      
      if (dups.length === 0) {
        setMensagemDup('✅ Nenhuma duplicata! Banco limpo.');
      } else {
        setMensagemDup(`⚠️ ${dups.length} duplicatas detectadas no histórico.`);
      }
    } catch (e: any) {
      setMensagemDup('❌ Erro: ' + e.message);
    } finally {
      setBuscandoDup(false);
    }
  }
  
  // 🎯 Limpa duplicatas mantendo só o mais recente
  async function limparDuplicatas() {
    if (!confirm(`⚠️ Vai apagar duplicatas mantendo SÓ o registro mais recente.\n\n${duplicatas.length} grupos serão limpos.\n\nConfirma?`)) return;
    
    setLimpandoDup(true);
    let apagados = 0;
    let erros = 0;
    
    try {
      for (const d of duplicatas) {
        const { data: registros } = await supabase
          .from('historico')
          .select('id, criado_em')
          .eq('id_groot', d.id_groot)
          .eq('data_referencia', d.data_referencia)
          .eq('processo', d.processo)
          .order('criado_em', { ascending: false });
        
        if (!registros || registros.length <= 1) continue;
        
        const idsParaApagar = registros.slice(1).map((r: any) => r.id);
        const { error } = await supabase.from('historico').delete().in('id', idsParaApagar);
        
        if (error) erros++;
        else apagados += idsParaApagar.length;
      }
      
      setMensagemDup(`✅ ${apagados} registros duplicados apagados! ${erros} erros.`);
      setDuplicatas([]);
      carregar();
    } catch (e: any) {
      setMensagemDup('❌ Erro: ' + e.message);
    } finally {
      setLimpandoDup(false);
    }
  }

  // 🎯 Limpa IMA/DPMO de um mês específico
  async function limparMes() {
    const nomeProc = processoLimpeza === 'Ambos' ? 'AMBOS os processos' : processoLimpeza;
    if (!confirm(`Apagar TODOS dados IMA + DPMO de ${mesLimpeza}/${anoLimpeza} - ${nomeProc}?`)) return;
    
    setLimpandoMes(true);
    setMensagemLimpeza(null);
    
    try {
      let totalImaApagados = 0;
      let totalDpmoApagados = 0;
      
      // 1) Apaga ima_manual do mês/ano
      const processosIma = processoLimpeza === 'Ambos' ? ['Checkin', 'P2M'] : [processoLimpeza];
      for (const proc of processosIma) {
        const { count } = await supabase
          .from('ima_manual')
          .delete({ count: 'exact' })
          .eq('mes', mesLimpeza)
          .eq('ano', anoLimpeza)
          .eq('processo', proc);
        totalImaApagados += count || 0;
      }
      
      // 2) Apaga dpmo_agregado das semanas desse mês
      // Calcula quais semanas pertencem ao mês selecionado
      const semanasDoMes: number[] = [];
      for (let dia = 1; dia <= 31; dia++) {
        const data = new Date(anoLimpeza, mesLimpeza - 1, dia);
        if (data.getMonth() + 1 !== mesLimpeza) break;
        // Calcula semana ISO
        const utc = new Date(Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()));
        const dow = utc.getUTCDay() || 7;
        utc.setUTCDate(utc.getUTCDate() + 4 - dow);
        const inicio = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
        const semana = Math.ceil((((utc.getTime() - inicio.getTime()) / 86400000) + 1) / 7);
        if (!semanasDoMes.includes(semana)) semanasDoMes.push(semana);
      }
      
      const processosDpmo = processoLimpeza === 'Ambos' ? ['CK', 'P2M'] : [processoLimpeza === 'Checkin' ? 'CK' : 'P2M'];
      for (const proc of processosDpmo) {
        const { count } = await supabase
          .from('dpmo_agregado')
          .delete({ count: 'exact' })
          .in('semana', semanasDoMes)
          .eq('ano', anoLimpeza)
          .eq('processo', proc);
        totalDpmoApagados += count || 0;
      }
      
      setMensagemLimpeza(`✅ Apagados: ${totalImaApagados} IMAs + ${totalDpmoApagados} DPMOs (semanas ${semanasDoMes.join(', ')})`);
      carregar();
    } catch (e: any) {
      setMensagemLimpeza('❌ Erro: ' + e.message);
    } finally {
      setLimpandoMes(false);
    }
  }

  async function carregar() {
    setLoading(true);
    try {
      const promises = TABELAS_CONFIG.map(async (t) => {
        const { count } = await supabase
          .from(t.nome)
          .select('*', { count: 'exact', head: true });

        const registros = count || 0;
        const bytesEst = BYTES_POR_REGISTRO[t.nome] || 300;
        const tamanhoEstimadoMB = (registros * bytesEst) / (1024 * 1024);

        return {
          ...t,
          registros,
          tamanhoEstimadoMB,
        };
      });

      const resultados = await Promise.all(promises);
      setTabelas(resultados);

      const { data: uploadsData } = await supabase
        .from('uploads')
        .select('*')
        .order('data', { ascending: false })
        .limit(20);

      if (uploadsData) {
        setUploads(uploadsData as UploadHistorico[]);
      }
    } finally {
      setLoading(false);
    }
  }

  const totalRegistros = tabelas.reduce((s, t) => s + t.registros, 0);
  const totalMB = tabelas.reduce((s, t) => s + t.tamanhoEstimadoMB, 0);
  const pctUsado = (totalMB / LIMITE_MB) * 100;

  async function apagarTabela(tabela: TabelaInfo) {
    const ok = await window.showConfirm({
      title: `Apagar ${tabela.label}?`,
      message: `Vai apagar TODOS os ${tabela.registros.toLocaleString('pt-BR')} registros da tabela ${tabela.nome}. Essa ação NÃO pode ser desfeita!`,
      confirmText: `Apagar ${tabela.registros} registros`,
      cancelText: 'Cancelar',
      danger: true,
    });

    if (!ok) return;

    try {
      const { error } = await supabase.from(tabela.nome).delete().gte('id', 0);
      if (error) throw new Error(error.message);
      window.showToast('success', `${tabela.label} foi limpa!`);
      carregar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      window.showToast('error', 'Erro: ' + msg);
    }
  }

  async function apagarTudo() {
    if (confirmacaoApagarTudo !== 'APAGAR TUDO') {
      window.showToast('error', 'Digite "APAGAR TUDO" exatamente pra confirmar');
      return;
    }

    setApagandoTudo(true);
    try {
      const tabelasParaApagar = tabelas.filter((t) => t.permiteApagar);
      for (const t of tabelasParaApagar) {
        if (t.registros > 0) {
          await supabase.from(t.nome).delete().gte('id', 0);
        }
      }
      window.showToast('success', 'Banco limpo!');
      setConfirmacaoApagarTudo('');
      carregar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      window.showToast('error', 'Erro: ' + msg);
    } finally {
      setApagandoTudo(false);
    }
  }

  async function manterAtivo() {
    try {
      await supabase.from('config').select('chave').limit(1);
      window.showToast('success', 'Supabase pingado!');
    } catch {
      window.showToast('error', 'Erro ao pingar Supabase');
    }
  }

  function formatarData(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (loading) {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
        <span className="text-6xl block mb-4 animate-pulse">⏳</span>
        <p className="text-gray-400">Carregando informações do banco...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-black mb-2">
          ⚙️ Configurações <span className="text-[#FFD700]">do App</span>
        </h1>
        <p className="text-gray-400">Gerencie dados, banco e arquivos do sistema</p>
      </div>

      {/* Status do banco */}
      <div
        className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6"
        style={{ boxShadow: '0 10px 30px -5px rgba(0,0,0,0.5)' }}
      >
        <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
          <h2 className="text-lg font-bold text-[#FFD700] flex items-center gap-2">
            💾 Status do Banco de Dados
          </h2>
          <button
            onClick={manterAtivo}
            className="bg-gradient-to-br from-green-500 to-green-600 text-white font-bold px-4 py-2 rounded-xl hover:from-green-400 hover:to-green-500 transition-all text-sm shadow-lg shadow-green-500/30 hover:-translate-y-0.5"
          >
            ⚡ Manter Supabase ativo
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <div className="bg-[#0a0a0a] rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase mb-1">Registros</p>
            <p className="text-3xl font-black text-white">{totalRegistros.toLocaleString('pt-BR')}</p>
          </div>
          <div className="bg-[#0a0a0a] rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase mb-1">Espaço usado</p>
            <p className="text-3xl font-black text-white">{totalMB.toFixed(2)} MB</p>
          </div>
          <div className="bg-[#0a0a0a] rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase mb-1">Limite free</p>
            <p className="text-3xl font-black text-cyan-400">{LIMITE_MB} MB</p>
          </div>
          <div className="bg-[#0a0a0a] rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase mb-1">Uso</p>
            <p className={`text-3xl font-black ${pctUsado < 50 ? 'text-green-400' : pctUsado < 80 ? 'text-yellow-400' : 'text-red-400'}`}>
              {pctUsado.toFixed(2)}%
            </p>
          </div>
        </div>

        <div className="bg-[#0a0a0a] rounded-full h-4 overflow-hidden border border-[#2a2a2a]">
          <div
            className={`h-full transition-all duration-500 ${pctUsado < 50 ? 'bg-gradient-to-r from-green-500 to-green-400' : pctUsado < 80 ? 'bg-gradient-to-r from-yellow-500 to-orange-400' : 'bg-gradient-to-r from-red-500 to-red-400'}`}
            style={{ width: `${Math.min(100, pctUsado)}%` }}
          ></div>
        </div>
      </div>

      {/* Lista de tabelas */}
      <div
        className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6"
        style={{ boxShadow: '0 10px 30px -5px rgba(0,0,0,0.5)' }}
      >
        <h2 className="text-lg font-bold text-[#FFD700] mb-2 flex items-center gap-2">
          📊 Tabelas do Banco
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          💡 Clique nas tabelas <span className="text-[#FFD700]">com fundo dourado</span> pra ver e apagar uploads individuais
        </p>

        <div className="space-y-3">
          {tabelas.map((t) => {
            const Card = (
              <div
                className={`
                  ${t.temArquivoOrigem ? 'bg-[#0a0a0a] hover:bg-gradient-to-r hover:from-[#FFD700]/5 hover:to-transparent border-[#2a2a2a] hover:border-[#FFD700]/40 cursor-pointer' : 'bg-[#0a0a0a] border-[#2a2a2a]'}
                  border rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap transition-all
                `}
              >
                <div className="flex items-center gap-4 flex-1 min-w-[200px]">
                  <div className="text-3xl">{t.icone}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-bold text-base flex items-center gap-2">
                      {t.label}
                      {t.temArquivoOrigem && (
                        <span className="text-xs bg-[#FFD700]/20 text-[#FFD700] px-2 py-0.5 rounded-full">
                          🔍 Ver uploads
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-gray-500">{t.descricao}</p>
                    <p className="text-xs text-gray-600 font-mono mt-1">{t.nome}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-2xl font-black text-white">{t.registros.toLocaleString('pt-BR')}</p>
                    <p className="text-xs text-gray-500">registros</p>
                  </div>
                  <div className="text-right border-l border-[#2a2a2a] pl-3">
                    <p className="text-lg font-bold text-cyan-400 font-mono">
                      {t.tamanhoEstimadoMB < 0.01 ? '< 0,01' : t.tamanhoEstimadoMB.toFixed(2)} MB
                    </p>
                    <p className="text-xs text-gray-500">estimado</p>
                  </div>
                  {t.permiteApagar ? (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        apagarTabela(t);
                      }}
                      disabled={t.registros === 0}
                      className="bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold px-3 py-2 rounded-lg transition-all text-xs disabled:opacity-30 border border-red-500/30"
                      title="Apagar TODOS os registros desta tabela"
                    >
                      🗑️ Limpar tudo
                    </button>
                  ) : (
                    <span className="text-xs bg-yellow-500/10 text-yellow-400 px-3 py-2 rounded-lg border border-yellow-500/30">
                      🔒 Protegida
                    </span>
                  )}
                </div>
              </div>
            );

            if (t.temArquivoOrigem) {
              return (
                <Link key={t.nome} href={`/configuracoes-app/tabela/${t.nome}`}>
                  {Card}
                </Link>
              );
            }
            return <div key={t.nome}>{Card}</div>;
          })}
        </div>
      </div>

      {/* Histórico */}
      {uploads.length > 0 && (
        <div
          className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6"
          style={{ boxShadow: '0 10px 30px -5px rgba(0,0,0,0.5)' }}
        >
          <h2 className="text-lg font-bold text-[#FFD700] mb-4">📁 Últimos Uploads (log)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-left text-xs text-gray-400 uppercase">
                  <th className="py-2 pr-2">Arquivo</th>
                  <th className="py-2 pr-2">Tabela</th>
                  <th className="py-2 pr-2 text-right">Linhas</th>
                  <th className="py-2 pr-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((u) => (
                  <tr key={u.id} className="border-b border-[#2a2a2a] hover:bg-[#0a0a0a]">
                    <td className="py-2 pr-2 text-white text-xs font-mono">{u.arquivo}</td>
                    <td className="py-2 pr-2">
                      <span className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full font-bold">
                        {u.tabela}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-right text-gray-300 font-mono">
                      {u.linhas?.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-2 pr-2 text-gray-400 text-xs">{formatarData(u.data)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 🔧 Manutenção / Duplicatas */}
      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
          🔧 Manutenção do Banco
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          Detecta e limpa registros duplicados no histórico (mesmo colaborador, mesmo dia, mesmo processo).
          <br />Isso acontece quando você sobe o mesmo CSV mais de uma vez.
        </p>

        {mensagemDup && (
          <div className={`rounded-lg p-3 mb-4 text-sm font-bold ${
            mensagemDup.startsWith('✅') ? 'bg-green-500/10 border border-green-500/40 text-green-300' :
            mensagemDup.startsWith('⚠️') ? 'bg-yellow-500/10 border border-yellow-500/40 text-yellow-300' :
            'bg-red-500/10 border border-red-500/40 text-red-300'
          }`}>
            {mensagemDup}
          </div>
        )}

        <div className="flex gap-3 mb-4 flex-wrap">
          <button
            onClick={buscarDuplicatas}
            disabled={buscandoDup}
            className="bg-cyan-500 hover:bg-cyan-400 text-white font-bold py-2 px-4 rounded-lg transition-all disabled:opacity-50"
          >
            {buscandoDup ? '🔍 Procurando...' : '🔍 Procurar duplicatas'}
          </button>
          
          {duplicatas.length > 0 && (
            <button
              onClick={limparDuplicatas}
              disabled={limpandoDup}
              className="bg-red-500 hover:bg-red-400 text-white font-bold py-2 px-4 rounded-lg transition-all disabled:opacity-50"
            >
              {limpandoDup ? '🗑️ Apagando...' : `🗑️ Limpar ${duplicatas.length} duplicatas`}
            </button>
          )}
        </div>

        {duplicatas.length > 0 && (
          <div className="border border-red-500/30 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-red-500/10 text-red-300">
                  <tr>
                    <th className="p-2 text-left">Colab</th>
                    <th className="p-2 text-left">Data</th>
                    <th className="p-2 text-left">Processo</th>
                    <th className="p-2 text-center">Cópias</th>
                    <th className="p-2 text-right">Soma errada</th>
                    <th className="p-2 text-right">Valor correto</th>
                  </tr>
                </thead>
                <tbody>
                  {duplicatas.slice(0, 30).map((d, i) => (
                    <tr key={i} className="border-t border-[#2a2a2a] hover:bg-[#0a0a0a]">
                      <td className="p-2 text-white font-bold whitespace-nowrap">{d.nome_colab}</td>
                      <td className="p-2 text-gray-400 whitespace-nowrap">{d.data_referencia}</td>
                      <td className="p-2">
                        <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                          d.processo === 'Checkin' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-orange-500/20 text-orange-300'
                        }`}>
                          {d.processo}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <span className="bg-red-500/20 text-red-300 px-2 py-0.5 rounded font-bold">
                          {d.duplicatas}x
                        </span>
                      </td>
                      <td className="p-2 text-right text-red-400 font-mono">
                        {d.total_somado.toLocaleString('pt-BR')}
                      </td>
                      <td className="p-2 text-right text-green-400 font-mono">
                        {d.valor_correto.toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {duplicatas.length > 30 && (
              <p className="p-3 text-xs text-gray-500 text-center bg-[#0a0a0a]">
                Mostrando 30 de {duplicatas.length}. O botão "Limpar" resolve TODAS.
              </p>
            )}
          </div>
        )}
      </div>

      {/* 🧹 Limpar IMA/DPMO por mês */}
      <div className="bg-gradient-to-br from-orange-500/10 to-orange-700/5 border-2 border-orange-500/30 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-orange-300 mb-2 flex items-center gap-2">
          🧹 Limpar IMA + DPMO por Mês
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          Apaga tudo que foi salvo via print (IMA Manual + DPMO Agregado) de um mês específico. Útil se subiu print errado.
        </p>
        
        <div className="bg-[#0a0a0a] border border-orange-500/30 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 uppercase mb-1 block">Mês</label>
              <select 
                value={mesLimpeza} 
                onChange={(e) => setMesLimpeza(Number(e.target.value))}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white"
              >
                {[
                  { num: 1, label: 'Janeiro' }, { num: 2, label: 'Fevereiro' },
                  { num: 3, label: 'Março' }, { num: 4, label: 'Abril' },
                  { num: 5, label: 'Maio' }, { num: 6, label: 'Junho' },
                  { num: 7, label: 'Julho' }, { num: 8, label: 'Agosto' },
                  { num: 9, label: 'Setembro' }, { num: 10, label: 'Outubro' },
                  { num: 11, label: 'Novembro' }, { num: 12, label: 'Dezembro' },
                ].map((m) => <option key={m.num} value={m.num}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase mb-1 block">Ano</label>
              <select 
                value={anoLimpeza} 
                onChange={(e) => setAnoLimpeza(Number(e.target.value))}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white"
              >
                {[2024, 2025, 2026, 2027].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase mb-1 block">Processo</label>
              <select 
                value={processoLimpeza} 
                onChange={(e) => setProcessoLimpeza(e.target.value as any)}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white"
              >
                <option value="Ambos">Ambos (Checkin + P2M)</option>
                <option value="Checkin">Apenas Checkin</option>
                <option value="P2M">Apenas P2M</option>
              </select>
            </div>
          </div>
          
          <button
            onClick={limparMes}
            disabled={limpandoMes}
            className="bg-orange-500 hover:bg-orange-400 text-white font-bold py-3 px-6 rounded-lg transition-all disabled:opacity-50"
          >
            {limpandoMes ? '🗑️ Apagando...' : `🗑️ Apagar IMA + DPMO de ${mesLimpeza}/${anoLimpeza}`}
          </button>
          
          {mensagemLimpeza && (
            <div className={`p-3 rounded-lg text-sm font-bold ${
              mensagemLimpeza.startsWith('✅') 
                ? 'bg-green-500/10 text-green-300 border border-green-500/30' 
                : 'bg-red-500/10 text-red-300 border border-red-500/30'
            }`}>
              {mensagemLimpeza}
            </div>
          )}
        </div>
      </div>

      {/* Zona de Perigo */}
      <div
        className="bg-gradient-to-br from-red-500/10 to-red-700/5 border-2 border-red-500/30 rounded-2xl p-6"
        style={{ boxShadow: '0 10px 30px -5px rgba(0,0,0,0.5)' }}
      >
        <h2 className="text-lg font-bold text-red-400 mb-2 flex items-center gap-2">🚨 Zona de Perigo</h2>
        <p className="text-sm text-gray-400 mb-4">
          Apagar TODOS os dados das tabelas (exceto colaboradores, feedbacks e configurações).
        </p>
        <div className="bg-[#0a0a0a] border border-red-500/30 rounded-xl p-4 space-y-3">
          <p className="text-sm text-red-300">
            Digite exatamente <code className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded font-bold">APAGAR TUDO</code> pra confirmar:
          </p>
          <input
            type="text"
            value={confirmacaoApagarTudo}
            onChange={(e) => setConfirmacaoApagarTudo(e.target.value)}
            placeholder="APAGAR TUDO"
            className="w-full bg-[#1a1a1a] border-2 border-red-500/40 rounded-lg px-4 py-3 text-white font-mono focus:border-red-500 outline-none"
          />
          <button
            onClick={apagarTudo}
            disabled={apagandoTudo || confirmacaoApagarTudo !== 'APAGAR TUDO'}
            className="w-full bg-gradient-to-br from-red-500 to-red-600 text-white font-bold py-3 rounded-xl hover:from-red-400 hover:to-red-500 transition-all shadow-lg shadow-red-500/30 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {apagandoTudo ? '⏳ Apagando...' : '🗑️ APAGAR TODOS OS DADOS'}
          </button>
        </div>
      </div>

      {/* Links úteis */}
      <div
        className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6"
        style={{ boxShadow: '0 10px 30px -5px rgba(0,0,0,0.5)' }}
      >
        <h2 className="text-lg font-bold text-[#FFD700] mb-4">🔗 Links Úteis</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link
            href="/meu-time/configuracoes"
            className="bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#FFD700]/30 rounded-xl p-4 transition-all flex items-center gap-3"
          >
            <span className="text-3xl">🎯</span>
            <div>
              <h3 className="text-white font-bold text-sm">Metas Dinâmicas</h3>
              <p className="text-xs text-gray-400">Editar metas</p>
            </div>
          </Link>
          <a
            href="https://supabase.com/dashboard/project/teozygnlsqsciqbofgyz"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-green-500/30 rounded-xl p-4 transition-all flex items-center gap-3"
          >
            <span className="text-3xl">🛢️</span>
            <div>
              <h3 className="text-white font-bold text-sm">Dashboard Supabase</h3>
              <p className="text-xs text-gray-400">Painel oficial</p>
            </div>
          </a>
          <a
            href="https://supabase.com/dashboard/project/teozygnlsqsciqbofgyz/database/backups"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-blue-500/30 rounded-xl p-4 transition-all flex items-center gap-3"
          >
            <span className="text-3xl">💾</span>
            <div>
              <h3 className="text-white font-bold text-sm">Fazer Backup</h3>
              <p className="text-xs text-gray-400">Backup manual</p>
            </div>
          </a>
          <a
            href="https://github.com/delmanjpereira-oss/lider360-app"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-purple-500/30 rounded-xl p-4 transition-all flex items-center gap-3"
          >
            <span className="text-3xl">📦</span>
            <div>
              <h3 className="text-white font-bold text-sm">Código do App</h3>
              <p className="text-xs text-gray-400">GitHub</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
