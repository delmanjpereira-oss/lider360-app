'use client';

import { useState } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { supabase } from '../../../lib/supabase';

type Colaborador = {
  id_groot: string;
  nome: string;
};

type LinhaCSV = Record<string, string>;

type Registro = {
  userId: string;
  data: string;  // YYYY-MM-DD
  rep: string;
  teamLeader: string;
  supervisor: string;
  qtdTotes: number;
  ocupacaoPct: number;
  semana: number;
  ano: number;
  mes: number;
  trimestre: string;
  idGroot: string | null;  // mapeado
  nomeOficial: string | null;
  vinculado: boolean;
};

function parseDataBr(s: string): string | null {
  // 14/05/2026 → 2026-05-14
  if (!s) return null;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function parsePercent(s: string): number {
  if (!s) return 0;
  const clean = s.replace('%', '').replace(',', '.').trim();
  return parseFloat(clean) || 0;
}

function getSemanaIso(dataStr: string): { semana: number; ano: number; mes: number; trimestre: string } {
  const d = new Date(dataStr + 'T12:00:00');
  const mes = d.getMonth() + 1;
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const diaDaSemana = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - diaDaSemana);
  const inicioAno = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const semana = Math.ceil((((utc.getTime() - inicioAno.getTime()) / 86400000) + 1) / 7);
  let trimestre = 'Q1';
  if (mes >= 4 && mes <= 6) trimestre = 'Q2';
  else if (mes >= 7 && mes <= 9) trimestre = 'Q3';
  else if (mes >= 10) trimestre = 'Q4';
  return { semana, ano: utc.getUTCFullYear(), mes, trimestre };
}

export default function UploadOcupacaoPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carregandoCsv, setCarregandoCsv] = useState(false);

  async function carregarColaboradores() {
    const { data } = await supabase
      .from('colaboradores')
      .select('id_groot, nome')
      .eq('status', 'Ativo');
    if (data) setColaboradores(data);
  }

  useState(() => {
    carregarColaboradores();
  });

  function vincular(userId: string): { idGroot: string | null; nomeOficial: string | null } {
    // 🎯 USER_ID do CSV = id_groot do colaborador (chave universal MELI)
    const colab = colaboradores.find((c) => c.id_groot === userId);
    if (colab) return { idGroot: colab.id_groot, nomeOficial: colab.nome };
    return { idGroot: null, nomeOficial: null };
  }

  function onArquivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    if (!arq) return;
    setNomeArquivo(arq.name);
    setCarregandoCsv(true);

    Papa.parse<LinhaCSV>(arq, {
      header: true,
      skipEmptyLines: true,
      complete: (resultado) => {
        const linhas = resultado.data;
        const novos: Registro[] = [];

        linhas.forEach((l) => {
          const userId = l['USER_ID']?.trim();
          const dataStr = parseDataBr(l['Data']);
          if (!userId || !dataStr) return;

          const rep = l['Rep']?.trim() || '';
          const teamLeader = l['Team Leader']?.trim() || '';
          const supervisor = l['Supervisor']?.trim() || '';
          const qtdTotes = parseInt(l['Qtd Totes']) || 0;
          const ocupacaoPct = parsePercent(l['Ocupação (%)']);

          const { semana, ano, mes, trimestre } = getSemanaIso(dataStr);
          const { idGroot, nomeOficial } = vincular(userId);

          novos.push({
            userId,
            data: dataStr,
            rep,
            teamLeader,
            supervisor,
            qtdTotes,
            ocupacaoPct,
            semana,
            ano,
            mes,
            trimestre,
            idGroot,
            nomeOficial,
            vinculado: !!idGroot,
          });
        });

        setRegistros(novos);
        setCarregandoCsv(false);
      },
    });
  }

  async function enviar() {
    if (registros.length === 0) return;
    setEnviando(true);
    try {
      const linhas = registros.map((r) => ({
        user_id: r.userId,
        id_groot: r.idGroot,
        data_referencia: r.data,
        nome_rep: r.rep,
        team_leader: r.teamLeader,
        supervisor: r.supervisor,
        qtd_totes: r.qtdTotes,
        ocupacao_pct: r.ocupacaoPct,
        arquivo_origem: nomeArquivo,
        semana: r.semana,
        ano: r.ano,
        mes: r.mes,
        trimestre: r.trimestre,
        chave_unica: `${r.userId}|${r.data}`,
      }));

      // Upsert em lotes
      const batchSize = 200;
      let totalEnviado = 0;
      for (let i = 0; i < linhas.length; i += batchSize) {
        const batch = linhas.slice(i, i + batchSize);
        const { error } = await supabase.from('ocupacao_p2m').upsert(batch, { onConflict: 'chave_unica' });
        if (error) {
          window.showToast('error', 'Erro: ' + error.message);
          setEnviando(false);
          return;
        }
        totalEnviado += batch.length;
      }

      window.showToast('success', `✅ ${totalEnviado} registros enviados!`);
      setRegistros([]);
      setNomeArquivo('');
    } finally {
      setEnviando(false);
    }
  }

  const vinculados = registros.filter((r) => r.vinculado).length;
  const naoVinculados = registros.filter((r) => !r.vinculado).length;

  return (
    <div className="space-y-6">
      <Link href="/meu-time" className="text-gray-400 hover:text-white inline-flex items-center gap-2">
        ← Voltar para MEU TIME
      </Link>

      <div>
        <h1 className="text-4xl font-black mb-2">
          🎯 Upload <span className="text-[#FFD700]">Ocupação P2M</span>
        </h1>
        <p className="text-gray-400">Suba o CSV "Totefullness — Visão Gestão P2M"</p>
      </div>

      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border-2 border-dashed border-[#FFD700]/30 rounded-2xl p-8">
        <div className="text-center">
          <span className="text-6xl block mb-3">📊</span>
          <h3 className="text-xl font-bold text-white mb-2">CSV de Ocupação P2M</h3>
          <p className="text-gray-400 text-sm mb-4">
            Formato esperado: USER_ID, Data, Supervisor, Team Leader, Rep, Qtd Totes, Ocupação (%)
          </p>
          <label className="inline-block bg-[#FFD700] text-black font-bold px-6 py-3 rounded-lg hover:bg-yellow-300 cursor-pointer transition-colors">
            📂 Escolher arquivo
            <input type="file" accept=".csv" onChange={onArquivoChange} className="hidden" />
          </label>
          {nomeArquivo && <p className="mt-3 text-sm text-gray-300">📄 {nomeArquivo}</p>}
        </div>
      </div>

      {carregandoCsv && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 text-center">
          <span className="text-4xl block mb-2">⏳</span>
          <p className="text-gray-400">Lendo CSV...</p>
        </div>
      )}

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
            <div className="bg-[#0a0a0a] px-4 py-2 border-b border-[#2a2a2a]">
              <h3 className="text-sm font-bold text-[#FFD700]">📋 Preview ({registros.length} linhas)</h3>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0a0a0a]">
                  <tr className="border-b border-[#2a2a2a] text-left text-xs text-gray-400">
                    <th className="py-2 px-3">USER_ID</th>
                    <th className="py-2 px-3">Data</th>
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
                      <td className="py-2 px-3 text-gray-300 text-xs">{r.data}</td>
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
                <div className="text-center py-2 text-xs text-gray-500">+ {registros.length - 50} linhas...</div>
              )}
            </div>
          </div>

          <button
            onClick={enviar}
            disabled={enviando}
            className="w-full bg-gradient-to-r from-[#FFD700] to-yellow-600 hover:from-yellow-300 hover:to-yellow-500 text-black font-bold py-4 rounded-2xl transition-colors disabled:opacity-50 text-lg"
          >
            {enviando ? '⏳ Enviando...' : `✅ Enviar ${registros.length} registros`}
          </button>
        </>
      )}
    </div>
  );
}
