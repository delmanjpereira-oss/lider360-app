'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { supabase } from '../../../lib/supabase';
import LoadingOverlay, { Fase } from '../../components/LoadingOverlay';
type Colaborador = {
  id_groot: string;
  nome: string;
};
type LinhaCSV = Record<string, string>;
type Registro = {
  userId: string;
  rep: string;
  teamLeader: string;
  supervisor: string;
  qtdTotes: number;
  ocupacaoPct: number;
  idGroot: string | null;
  nomeOficial: string | null;
  vinculado: boolean;
};
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
function parsePercent(s: string): number {
  if (!s) return 0;
  const clean = s.replace('%', '').replace(',', '.').trim();
  return parseFloat(clean) || 0;
}
// pega uma coluna do CSV tolerando variações de nome (acento, espaço, caixa)
function pegarColuna(linha: LinhaCSV, nomes: string[]): string {
  // 1) tenta o nome exato
  for (const n of nomes) {
    if (linha[n] !== undefined) return String(linha[n]);
  }
  // 2) tenta ignorando caixa/espaços/acentos
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const alvos = nomes.map(norm);
  for (const chave of Object.keys(linha)) {
    if (alvos.includes(norm(chave))) return String(linha[chave]);
  }
  return '';
}
export default function UploadOcupacaoPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carregandoCsv, setCarregandoCsv] = useState(false);
  const [fase, setFase] = useState<Fase>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  // mês/ano de referência (padrão = hoje). Editável caso precise corrigir.
  const hoje = new Date();
  const [mesRef, setMesRef] = useState<number>(hoje.getMonth() + 1);
  const [anoRef, setAnoRef] = useState<number>(hoje.getFullYear());
  // proteção contra duplicata: já existe ocupação desse mês?
  const [jaExisteMes, setJaExisteMes] = useState<boolean>(false);
  const [checandoDuplicata, setChecandoDuplicata] = useState(false);
  const [confirmouSobrescrever, setConfirmouSobrescrever] = useState(false);
  useEffect(() => {
    carregarColaboradores();
  }, []);
  useEffect(() => {
    // sempre que trocar o mês/ano, re-checa duplicata e reseta confirmação
    setConfirmouSobrescrever(false);
    if (registros.length > 0) checarDuplicata();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesRef, anoRef]);
  async function carregarColaboradores() {
    const { data } = await supabase
      .from('colaboradores')
      .select('id_groot, nome')
      .eq('status', 'Ativo');
    if (data) setColaboradores(data);
  }
  function vincular(userId: string): { idGroot: string | null; nomeOficial: string | null } {
    const colab = colaboradores.find((c) => c.id_groot === userId);
    if (colab) return { idGroot: colab.id_groot, nomeOficial: colab.nome };
    return { idGroot: null, nomeOficial: null };
  }
  function onArquivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    if (!arq) return;
    setNomeArquivo(arq.name);
    setCarregandoCsv(true);
    setFase('lendo');
    setErro(null);
    setSucesso(null);
    setJaExisteMes(false);
    setConfirmouSobrescrever(false);
    Papa.parse<LinhaCSV>(arq, {
      header: true,
      skipEmptyLines: true,
      complete: (resultado) => {
        const linhas = resultado.data;
        const novos: Registro[] = [];
        linhas.forEach((l) => {
          const userId = pegarColuna(l, ['USER_ID', 'user_id', 'User_Id']).trim();
          if (!userId) return; // só precisa do USER_ID (o CSV novo não tem mais Data)
          const rep = pegarColuna(l, ['Rep', 'REP']).trim();
          const teamLeader = pegarColuna(l, ['Team Leader', 'TeamLeader']).trim();
          const supervisor = pegarColuna(l, ['Supervisor']).trim();
          const qtdTotes = parseInt(pegarColuna(l, ['Qtd Totes', 'Qtd_Totes', 'Totes'])) || 0;
          const ocupacaoPct = parsePercent(pegarColuna(l, ['Ocupação (%)', 'Ocupacao (%)', 'Ocupação', 'Ocupacao', 'Ocupação(%)']));
          const { idGroot, nomeOficial } = vincular(userId);
          novos.push({
            userId,
            rep,
            teamLeader,
            supervisor,
            qtdTotes,
            ocupacaoPct,
            idGroot,
            nomeOficial,
            vinculado: !!idGroot,
          });
        });
        setRegistros(novos);
        setCarregandoCsv(false);
        setFase(null);
        if (novos.length === 0) {
          setErro('⚠️ Nenhuma linha lida. Verifique se o CSV tem a coluna USER_ID.');
        } else {
          // checa se o mês já foi importado
          setTimeout(() => checarDuplicata(), 0);
        }
      },
      error: (err) => {
        setCarregandoCsv(false);
        setFase(null);
        setErro('Erro lendo CSV: ' + err.message);
      },
    });
  }
  // checa se já existe ocupação do mês/ano de referência no banco
  async function checarDuplicata() {
    setChecandoDuplicata(true);
    try {
      const { count } = await supabase
        .from('ocupacao_p2m')
        .select('id', { count: 'exact', head: true })
        .eq('mes', mesRef)
        .eq('ano', anoRef);
      setJaExisteMes((count || 0) > 0);
    } catch (e) {
      setJaExisteMes(false);
    } finally {
      setChecandoDuplicata(false);
    }
  }
  function trimestreDoMes(m: number): string {
    if (m >= 1 && m <= 3) return 'Q1';
    if (m >= 4 && m <= 6) return 'Q2';
    if (m >= 7 && m <= 9) return 'Q3';
    return 'Q4';
  }
  async function enviar() {
    if (registros.length === 0) {
      setErro('⚠️ Nenhum registro pra enviar.');
      return;
    }
    if (jaExisteMes && !confirmouSobrescrever) {
      setErro(`⚠️ Já existe ocupação de ${MESES[mesRef - 1]}/${anoRef}. Marque a confirmação pra sobrescrever.`);
      return;
    }
    setEnviando(true);
    setFase('salvando');
    setErro(null);
    setSucesso(null);
    try {
      // mês/ano de referência → data_referencia = primeiro dia do mês
      const dataRef = `${anoRef}-${String(mesRef).padStart(2, '0')}-01`;
      const trimestre = trimestreDoMes(mesRef);
      const linhas = registros.map((r) => ({
        user_id: r.userId,
        id_groot: r.idGroot,
        data_referencia: dataRef,
        nome_rep: r.rep,
        team_leader: r.teamLeader,
        supervisor: r.supervisor,
        qtd_totes: r.qtdTotes,
        ocupacao_pct: r.ocupacaoPct,
        arquivo_origem: nomeArquivo,
        semana: 0,
        ano: anoRef,
        mes: mesRef,
        trimestre,
        // chave mensal (sobrepõe igual o IMA): mesma pessoa + mesmo mês = atualiza
        chave_unica: `${r.userId}|${anoRef}-${String(mesRef).padStart(2, '0')}`,
      }));
      const batchSize = 200;
      let totalEnviado = 0;
      for (let i = 0; i < linhas.length; i += batchSize) {
        const batch = linhas.slice(i, i + batchSize);
        const { error } = await supabase
          .from('ocupacao_p2m')
          .upsert(batch, { onConflict: 'chave_unica' });
        if (error) {
          setErro('Erro salvando: ' + error.message);
          if (typeof window !== 'undefined' && (window as any).showToast) {
            (window as any).showToast('error', 'Erro: ' + error.message);
          }
          setEnviando(false);
          setFase(null);
          return;
        }
        totalEnviado += batch.length;
      }
      setFase('sucesso');
      setSucesso(`✅ ${totalEnviado} registros salvos em ${MESES[mesRef - 1]}/${anoRef}!${jaExisteMes ? ' (mês atualizado)' : ''}`);
      setTimeout(() => setFase(null), 2200);
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', `✅ ${totalEnviado} registros salvos!`);
      }
      setTimeout(() => {
        setRegistros([]);
        setNomeArquivo('');
        setJaExisteMes(false);
        setConfirmouSobrescrever(false);
        setSucesso(null);
      }, 3000);
    } catch (e: any) {
      setErro('Erro: ' + e.message);
      setFase(null);
    } finally {
      setEnviando(false);
    }
  }
  const vinculados = registros.filter((r) => r.vinculado).length;
  const naoVinculados = registros.filter((r) => !r.vinculado).length;
  const anosDisponiveis = [anoRef - 1, anoRef, anoRef + 1].filter((v, i, arr) => arr.indexOf(v) === i);
  return (
    <div className="space-y-6">
      <LoadingOverlay
        fase={fase}
        lendoTitulo="Lendo arquivo..."
        lendoSub="Processando a ocupação P2M"
        salvandoTitulo="Salvando ocupação..."
        salvandoSub="Gravando no banco de dados"
        sucessoTitulo="Salvo!"
        sucessoSub="Ocupação P2M atualizada"
      />
      <Link href="/meu-time" className="text-gray-400 hover:text-white inline-flex items-center gap-2">
        ← Voltar para MEU TIME
      </Link>
      <div>
        <h1 className="text-4xl font-black mb-2">
          🎯 Upload <span className="text-[#FFD700]">Ocupação P2M</span>
        </h1>
        <p className="text-gray-400">Suba o CSV "Totefullness — Visão Gestão P2M"</p>
      </div>
      {sucesso && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl">✅</span>
          <p className="text-green-400 font-bold">{sucesso}</p>
        </div>
      )}
      {erro && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl">❌</span>
          <p className="text-red-300 text-sm">{erro}</p>
        </div>
      )}
      {/* SELEÇÃO DE ARQUIVO */}
      <label className="group block cursor-pointer">
        <div className="relative bg-gradient-to-br from-[#1a1a1a] to-[#141414] border-2 border-dashed border-[#FFD700]/30 rounded-2xl p-8 text-center overflow-hidden transition-all duration-300 group-hover:border-[#FFD700]/70 group-hover:from-[#1f1f1f] group-hover:to-[#161616] group-hover:shadow-[0_0_30px_rgba(255,215,0,0.15)] group-active:scale-[0.99]">
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-[#FFD700]/5 to-transparent pointer-events-none"></div>
          <span className="text-6xl block mb-3 transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-1">📊</span>
          <h3 className="text-xl font-bold text-white mb-2 transition-colors group-hover:text-[#FFD700]">CSV de Ocupação P2M</h3>
          <p className="text-gray-400 text-sm mb-4">
            Formato: USER_ID, Supervisor, Team Leader, Rep, Qtd Totes, Ocupação (%)
          </p>
          <span className="inline-block bg-[#FFD700] text-black font-bold px-6 py-3 rounded-lg group-hover:bg-yellow-300 transition-all group-hover:scale-105">
            📂 Escolher arquivo
          </span>
          {nomeArquivo && <p className="mt-3 text-sm text-gray-300">📄 {nomeArquivo}</p>}
          <input type="file" accept=".csv" onChange={onArquivoChange} className="hidden" />
        </div>
      </label>
      {/* MÊS/ANO DE REFERÊNCIA (a ocupação sobrepõe por mês, igual o IMA) */}
      {registros.length > 0 && !carregandoCsv && (
        <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/5 border-2 border-purple-500/40 rounded-2xl p-5">
          <h3 className="text-purple-300 font-black text-lg mb-1 flex items-center gap-2">
            📆 Mês de referência
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            A ocupação é salva por mês (sobrepõe igual o IMA). Se você subir de novo no mesmo mês, os valores são atualizados.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-purple-300 mb-2">Mês</label>
              <select
                value={mesRef}
                onChange={(e) => setMesRef(Number(e.target.value))}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white"
              >
                {MESES.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-purple-300 mb-2">Ano</label>
              <select
                value={anoRef}
                onChange={(e) => setAnoRef(Number(e.target.value))}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white"
              >
                {[2024, 2025, 2026, 2027].map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Trimestre: <strong className="text-purple-300">{trimestreDoMes(mesRef)} de {anoRef}</strong>
          </p>
        </div>
      )}
      {/* AVISO: mês já importado */}
      {jaExisteMes && !carregandoCsv && registros.length > 0 && (
        <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/5 border-2 border-amber-500/50 rounded-2xl p-5">
          <p className="text-amber-300 font-black flex items-center gap-2 mb-2 text-lg">
            ⚠️ Já existe ocupação de {MESES[mesRef - 1]}/{anoRef}
          </p>
          <p className="text-xs text-gray-400 mb-3">
            Se continuar, os valores desse mês serão <strong className="text-amber-200">substituídos</strong> pelos novos do CSV.
          </p>
          <label className="flex items-center gap-3 bg-[#0a0a0a] border border-amber-500/30 rounded-lg p-3 cursor-pointer hover:border-amber-500/50 transition-all">
            <input
              type="checkbox"
              checked={confirmouSobrescrever}
              onChange={(e) => setConfirmouSobrescrever(e.target.checked)}
              className="w-5 h-5 accent-amber-500"
            />
            <span className="text-sm font-bold text-amber-200">
              Sim, quero sobrescrever a ocupação de {MESES[mesRef - 1]}/{anoRef}
            </span>
          </label>
        </div>
      )}
      {checandoDuplicata && !carregandoCsv && (
        <p className="text-xs text-gray-500 flex items-center gap-2">
          <span className="animate-spin inline-block">⏳</span> Verificando se o mês já foi importado...
        </p>
      )}
      {/* STATS + PREVIEW */}
      {registros.length > 0 && !carregandoCsv && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
              <p className="text-3xl font-black text-white">{registros.length}</p>
              <p className="text-xs text-gray-400">Total registros</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
              <p className="text-3xl font-black text-green-400">{vinculados}</p>
              <p className="text-xs text-green-400">✅ Vinculados</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
              <p className="text-3xl font-black text-red-400">{naoVinculados}</p>
              <p className="text-xs text-red-400">❌ Não vinculados</p>
            </div>
          </div>
          {naoVinculados > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-300">
              ⚠️ <strong>{naoVinculados} registros não foram vinculados.</strong> O <code>USER_ID</code> do CSV precisa estar cadastrado como <code>id_groot</code> em MEU TIME.
            </div>
          )}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
            <div className="bg-[#0a0a0a] px-4 py-2 border-b border-[#2a2a2a] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#FFD700]">
                📋 Preview ({registros.length} {registros.length === 1 ? 'linha' : 'linhas'})
              </h3>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0a0a0a]">
                  <tr className="border-b border-[#2a2a2a] text-left text-xs text-gray-400">
                    <th className="py-2 px-3">USER_ID</th>
                    <th className="py-2 px-3">Rep (sistema)</th>
                    <th className="py-2 px-3">Vinculação</th>
                    <th className="py-2 px-3 text-right">Totes</th>
                    <th className="py-2 px-3 text-right">Ocupação</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-b border-[#2a2a2a] hover:bg-[#0a0a0a]">
                      <td className="py-2 px-3 text-white font-mono text-xs">{r.userId}</td>
                      <td className="py-2 px-3 text-gray-300 text-xs">{r.rep}</td>
                      <td className="py-2 px-3 text-xs">
                        {r.vinculado ? (
                          <span className="text-green-400">✅ {r.nomeOficial}</span>
                        ) : (
                          <span className="text-red-400">❌ não cadastrado</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right text-white font-mono">{r.qtdTotes}</td>
                      <td className={`py-2 px-3 text-right font-mono font-bold ${r.ocupacaoPct >= 80 ? 'text-green-400' : 'text-yellow-400'}`}>
                        {r.ocupacaoPct.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {registros.length > 50 && (
                <div className="text-center py-2 text-xs text-gray-500">
                  + {registros.length - 50} linhas...
                </div>
              )}
            </div>
          </div>
          <button
            onClick={enviar}
            disabled={enviando || registros.length === 0 || (jaExisteMes && !confirmouSobrescrever)}
            className="w-full bg-gradient-to-r from-[#FFD700] to-yellow-600 hover:from-yellow-300 hover:to-yellow-500 text-black font-black py-4 rounded-2xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-lg shadow-lg shadow-yellow-500/20 hover:shadow-yellow-500/40 hover:-translate-y-0.5 active:scale-[0.99] flex items-center justify-center gap-3"
          >
            {enviando ? (
              <>
                <span className="inline-block w-5 h-5 border-[3px] border-black/30 border-t-black rounded-full animate-spin"></span>
                Enviando...
              </>
            ) : jaExisteMes && !confirmouSobrescrever ? (
              '🔒 Confirme a sobrescrita acima pra continuar'
            ) : (
              `✅ Salvar ocupação de ${MESES[mesRef - 1]}/${anoRef} (${registros.length} ${registros.length === 1 ? 'registro' : 'registros'})`
            )}
          </button>
        </>
      )}
    </div>
  );
}
