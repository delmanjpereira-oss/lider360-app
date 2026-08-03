'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { supabase } from '../../../lib/supabase';

type Colaborador = {
  id_groot: string;
  nome: string;
  processo: string | null;
  status: string;
};

type LinhaCSV = Record<string, string>;

type Registro = {
  idGroot: string;
  nomeCsv: string;
  data: string;          // ISO YYYY-MM-DD
  motivo: string;        // texto cru da Justificativa Checkpoint
  status: string;        // categorizado
  categoria: string;     // presenca | falta | atestado | neutro | inativo
  contaAbs: boolean;
  contaPresenca: boolean;
  idGrootCadastro: string | null;
  nomeOficial: string | null;
  vinculado: boolean;
};

// ============================================================
// Categorização dos status do Checkpoint (Justificativa Checkpoint)
// status/categoria seguem o padrão que a tabela presenca já usa.
// O 'motivo' guarda SEMPRE o texto cru (é o que o Copiloto IA lê).
// ============================================================
function categorizarStatus(motivo: string): {
  status: string;
  categoria: string;
  contaAbs: boolean;
  contaPresenca: boolean;
} {
  const m = (motivo || '').toLowerCase();

  // ✅ PRESENÇA
  if (m.includes('p - presente') || m.includes('sie') || m.includes('sinergia')) {
    return { status: 'presente', categoria: 'presenca', contaAbs: false, contaPresenca: true };
  }
  // 🔴 CONTA ABS
  if (m.includes('fi - falta') || m.includes('falta injustificada')) {
    return { status: 'falta', categoria: 'falta', contaAbs: true, contaPresenca: false };
  }
  if (m.includes('ab - abandono') || m.includes('abandono')) {
    return { status: 'abandono', categoria: 'falta', contaAbs: true, contaPresenca: false };
  }
  if (m.includes('não planejado') || m.includes('nao planejado')) {
    return { status: 'bh_nao_planejado', categoria: 'falta', contaAbs: true, contaPresenca: false };
  }
  if (m.includes('atestado')) {
    return { status: 'atestado', categoria: 'atestado', contaAbs: true, contaPresenca: false };
  }
  // ⚪ NEUTRO (não conta ABS nem presença)
  if (m.includes('dsr') || m.includes('escala')) {
    return { status: 'descanso', categoria: 'descanso', contaAbs: false, contaPresenca: false };
  }
  if (m.includes('férias') || m.includes('ferias') || m.startsWith('fe -')) {
    return { status: 'ferias', categoria: 'ferias', contaAbs: false, contaPresenca: false };
  }
  if (m.includes('banco de horas planejado')) {
    return { status: 'bh_planejado', categoria: 'bh_planejado', contaAbs: false, contaPresenca: false };
  }
  if (m.includes('acompanhamento filho')) {
    return { status: 'justificado', categoria: 'justificado', contaAbs: false, contaPresenca: false };
  }
  // ⚫ INATIVO (fora da operação)
  if (m.includes('afastado') || m.startsWith('af -')) {
    return { status: 'afastado', categoria: 'inativo', contaAbs: false, contaPresenca: false };
  }
  if (m.includes('desligado') || m.startsWith('de -')) {
    return { status: 'desligado', categoria: 'inativo', contaAbs: false, contaPresenca: false };
  }
  if (m.includes('hcd') || m.includes('divergente')) {
    return { status: 'hc_divergente', categoria: 'inativo', contaAbs: false, contaPresenca: false };
  }
  // fallback
  return { status: 'outro', categoria: 'neutro', contaAbs: false, contaPresenca: false };
}

function normalizarChave(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function pegarValor(linha: LinhaCSV, aliases: string[]): string {
  const chaves = Object.keys(linha);
  for (const alias of aliases) {
    const aliasNorm = normalizarChave(alias);
    for (const chave of chaves) {
      if (normalizarChave(chave) === aliasNorm) {
        return linha[chave] || '';
      }
    }
  }
  return '';
}

function normalizarIdGroot(v: string): string {
  return String(v || '').replace(/\D/g, '').trim();
}

// Converte data pra ISO. O Checkpoint já vem ISO (2026-07-31), mas aceita BR também.
function parsearData(valor: string): string | null {
  if (!valor) return null;
  const s = valor.trim();
  // já ISO?
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }
  // BR dd/mm/yyyy
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }
  return null;
}

function formatarDataBr(iso: string): string {
  const p = iso.split('-');
  if (p.length !== 3) return iso;
  return `${p[2]}/${p[1]}/${p[0]}`;
}

const LABELS_STATUS: Record<string, { label: string; cor: string }> = {
  presente: { label: '✅ Presente', cor: 'text-green-400' },
  falta: { label: '🔴 Falta', cor: 'text-red-400' },
  abandono: { label: '🔴 Abandono', cor: 'text-red-400' },
  bh_nao_planejado: { label: '🔴 BH não planej.', cor: 'text-red-400' },
  atestado: { label: '🟡 Atestado', cor: 'text-yellow-400' },
  descanso: { label: '⚪ Folga (DSR)', cor: 'text-gray-400' },
  ferias: { label: '🏖️ Férias', cor: 'text-blue-400' },
  bh_planejado: { label: '⚪ BH planej.', cor: 'text-gray-400' },
  justificado: { label: '🟡 Justificado', cor: 'text-yellow-400' },
  afastado: { label: '⚫ Afastado', cor: 'text-gray-500' },
  desligado: { label: '⚫ Desligado', cor: 'text-gray-500' },
  hc_divergente: { label: '⚫ HC Diverg.', cor: 'text-gray-500' },
  outro: { label: '❔ Outro', cor: 'text-gray-400' },
};

export default function ImportarPresencaPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [carregandoCsv, setCarregandoCsv] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  // 🆕 fase do overlay: null | 'lendo' | 'salvando' | 'sucesso'
  const [fase, setFase] = useState<null | 'lendo' | 'salvando' | 'sucesso'>(null);

  useEffect(() => {
    carregarColaboradores();
  }, []);

  async function carregarColaboradores() {
    const { data } = await supabase
      .from('colaboradores')
      .select('id_groot, nome, processo, status');
    if (data) setColaboradores(data as Colaborador[]);
  }

  function onArquivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    if (!arq) return;
    setNomeArquivo(arq.name);
    setCarregandoCsv(true);
    setFase('lendo');
    setErro(null);
    setSucesso(null);
    setRegistros([]);

    Papa.parse<LinhaCSV>(arq, {
      header: true,
      skipEmptyLines: true,
      complete: (resultado) => {
        const linhas = resultado.data;
        const colsDetectadas = resultado.meta.fields || [];

        // valida se tem as colunas mínimas do Checkpoint
        const temIdGroot = colsDetectadas.some((c) =>
          ['idgroot', 'id_groot', 'id groot'].includes(normalizarChave(c))
        );
        const temData = colsDetectadas.some((c) => normalizarChave(c) === 'data');
        const temJustificativa = colsDetectadas.some((c) =>
          normalizarChave(c).includes('justificativa_checkpoint')
        );

        if (!temIdGroot || !temData || !temJustificativa) {
          setCarregandoCsv(false);
          setFase(null);
          setErro(
            `❌ Esse não parece o CSV Checkpoint. Precisa ter as colunas IDGroot, Data e Justificativa Checkpoint. Encontradas: ${colsDetectadas.join(', ')}`
          );
          return;
        }

        const mapaCadastro: Record<string, Colaborador> = {};
        colaboradores.forEach((c) => {
          mapaCadastro[normalizarIdGroot(c.id_groot)] = c;
        });

        const novos: Registro[] = [];
        linhas.forEach((l) => {
          const idGrootRaw = pegarValor(l, ['IDGroot', 'ID_GROOT', 'ID Groot']);
          const idGroot = normalizarIdGroot(idGrootRaw);
          const dataIso = parsearData(pegarValor(l, ['Data']));
          if (!idGroot || !dataIso) return;

          const nomeCsv = pegarValor(l, ['Colaborador', 'Nome', 'Representante']);
          // usa "Justificativa Checkpoint" (não a Miscellany)
          const motivo = pegarValor(l, ['Justificativa Checkpoint']).trim();
          const cat = categorizarStatus(motivo);

          const cadastro = mapaCadastro[idGroot];
          novos.push({
            idGroot,
            nomeCsv,
            data: dataIso,
            motivo,
            status: cat.status,
            categoria: cat.categoria,
            contaAbs: cat.contaAbs,
            contaPresenca: cat.contaPresenca,
            idGrootCadastro: cadastro ? cadastro.id_groot : null,
            nomeOficial: cadastro ? cadastro.nome : null,
            vinculado: !!cadastro,
          });
        });

        setRegistros(novos);
        setCarregandoCsv(false);
        setFase(null);
      },
      error: (err) => {
        setCarregandoCsv(false);
        setFase(null);
        setErro('Erro lendo CSV: ' + err.message);
      },
    });
  }

  // Só entram no banco os que estão no MEU TIME (vinculados)
  const registrosDoTime = registros.filter((r) => r.vinculado);
  const registrosForaDoTime = registros.filter((r) => !r.vinculado);

  // 🆕 quem do time (ativo) NÃO apareceu no CSV
  const idsNoCsv = new Set(registros.map((r) => r.idGroot));
  const doTimeForaDoCsv = colaboradores.filter(
    (c) => c.status === 'Ativo' && !idsNoCsv.has(normalizarIdGroot(c.id_groot))
  );

  // período detectado
  const datas = Array.from(new Set(registros.map((r) => r.data))).sort();
  const periodoInicio = datas[0];
  const periodoFim = datas[datas.length - 1];

  // resumo por categoria (só do time)
  const resumo = {
    presencas: registrosDoTime.filter((r) => r.contaPresenca).length,
    faltas: registrosDoTime.filter((r) => r.status === 'falta').length,
    atestados: registrosDoTime.filter((r) => r.status === 'atestado').length,
    afastados: registrosDoTime.filter((r) => r.status === 'afastado').length,
    ferias: registrosDoTime.filter((r) => r.status === 'ferias').length,
    absTotal: registrosDoTime.filter((r) => r.contaAbs).length,
  };

  async function enviar() {
    if (registrosDoTime.length === 0) {
      setErro('⚠️ Nenhum registro do seu time pra enviar.');
      return;
    }
    setEnviando(true);
    setFase('salvando');
    setErro(null);
    setSucesso(null);

    try {
      // Só as colunas que existem na tabela presenca
      const linhas = registrosDoTime.map((r) => {
        const cadastro = colaboradores.find(
          (c) => normalizarIdGroot(c.id_groot) === r.idGroot
        );
        return {
          id_groot: r.idGroot,
          nome_colab: r.nomeOficial || r.nomeCsv,
          processo: cadastro?.processo || null, // processo vem do cadastro (não do CSV)
          data_referencia: r.data,
          status: r.status,
          motivo: r.motivo,
          categoria: r.categoria,
          conta_abs: r.contaAbs,
          conta_presenca: r.contaPresenca,
          registrado_por: 'csv_meli',
        };
      });

      // 🛡️ Proteção contra duplicata SEM depender de chave única:
      // apaga os registros desses colaboradores nesse período antes de inserir.
      const idsDoTime = Array.from(new Set(registrosDoTime.map((r) => r.idGroot)));
      const datasDoArquivo = Array.from(new Set(registrosDoTime.map((r) => r.data))).sort();
      const dataMin = datasDoArquivo[0];
      const dataMax = datasDoArquivo[datasDoArquivo.length - 1];

      if (dataMin && dataMax && idsDoTime.length > 0) {
        const { error: errDel } = await supabase
          .from('presenca')
          .delete()
          .in('id_groot', idsDoTime)
          .gte('data_referencia', dataMin)
          .lte('data_referencia', dataMax);
        if (errDel) {
          console.error('Erro limpando presença anterior:', errDel);
        }
      }

      const batchSize = 200;
      let total = 0;
      for (let i = 0; i < linhas.length; i += batchSize) {
        const batch = linhas.slice(i, i + batchSize);
        const { error } = await supabase.from('presenca').insert(batch);
        if (error) {
          setErro('Erro salvando: ' + error.message);
          setEnviando(false);
          setFase(null);
          return;
        }
        total += batch.length;
      }

      // ✅ mostra a animação de sucesso antes de limpar
      setFase('sucesso');
      setSucesso(`✅ ${total} registros de presença salvos! (${resumo.absTotal} contam como ABS)`);
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', `✅ ${total} registros salvos!`);
      }
      setTimeout(() => {
        setRegistros([]);
        setNomeArquivo('');
        setSucesso(null);
        setFase(null);
      }, 2200);
    } catch (e: any) {
      setErro('Erro: ' + e.message);
      setFase(null);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 🆕 OVERLAY PROFISSIONAL — lendo / salvando / sucesso */}
      {fase && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md animate-[presFadeIn_0.2s_ease-out]">
          <div className="bg-gradient-to-br from-[#141b2e] to-[#0a0f1c] border border-[#FFD700]/20 rounded-3xl px-10 py-9 text-center shadow-2xl shadow-black/50 max-w-sm mx-4">
            {fase === 'sucesso' ? (
              <>
                {/* círculo de sucesso animado */}
                <div className="relative mx-auto mb-5 w-20 h-20">
                  <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping"></div>
                  <div className="relative w-20 h-20 rounded-full bg-green-500/15 border-2 border-green-400 flex items-center justify-center">
                    <span className="text-4xl animate-[presPopIn_0.4s_ease-out]">✅</span>
                  </div>
                </div>
                <p className="text-2xl font-black text-green-400 mb-1">Salvo!</p>
                <p className="text-sm text-gray-400">Dados de presença atualizados</p>
              </>
            ) : (
              <>
                {/* spinner duplo dark MELI */}
                <div className="relative mx-auto mb-6 w-20 h-20">
                  <div className="absolute inset-0 rounded-full border-4 border-[#FFD700]/10"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#FFD700] animate-spin"></div>
                  <div className="absolute inset-2 rounded-full border-4 border-transparent border-b-cyan-400 animate-spin [animation-duration:1.5s] [animation-direction:reverse]"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl">{fase === 'lendo' ? '📄' : '💾'}</span>
                  </div>
                </div>
                <p className="text-xl font-black text-white mb-1">
                  {fase === 'lendo' ? 'Lendo arquivo...' : 'Salvando no banco...'}
                </p>
                <p className="text-sm text-gray-400">
                  {fase === 'lendo'
                    ? 'Processando os registros do CSV'
                    : `Gravando ${registrosDoTime.length} registros`}
                </p>
                {/* barrinha indeterminada */}
                <div className="mt-5 h-1 w-full bg-[#0a0a0a] rounded-full overflow-hidden">
                  <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-[#FFD700] to-transparent animate-[presSlide_1.2s_ease-in-out_infinite]"></div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* animações do overlay (style normal, sem depender de styled-jsx) */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes presFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes presPopIn { 0% { transform: scale(0); } 70% { transform: scale(1.2); } 100% { transform: scale(1); } }
        @keyframes presSlide { 0% { transform: translateX(-120%); } 100% { transform: translateX(420%); } }
      ` }} />

      <Link href="/presenca" className="text-gray-400 hover:text-white inline-flex items-center gap-2">
        ← Voltar para PRESENÇA
      </Link>

      <div>
        <h1 className="text-4xl font-black mb-2">
          📥 Importar <span className="text-[#FFD700]">Presença</span>
        </h1>
        <p className="text-gray-400">Sobe o CSV Checkpoint (Absenteísmo) — o app filtra só o seu time</p>
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

      {/* CARD EXPLICATIVO */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-5">
        <h3 className="text-blue-300 font-bold mb-3 flex items-center gap-2">💡 O que o app vai fazer</h3>
        <ul className="space-y-2 text-sm text-gray-300">
          <li>1. Identifica os colabs do seu time pelo <code className="bg-blue-500/10 px-1 rounded">IDGroot</code></li>
          <li>2. Salva presença/falta/atestado de cada dia (coluna <strong>Justificativa Checkpoint</strong>)</li>
          <li>3. Calcula quem <strong>conta como ABS</strong> (falta, abandono, atestado, BH não planejado)</li>
          <li>4. Copiloto IA usa esses dados pra análise de absenteísmo</li>
        </ul>
      </div>

      {/* UPLOAD */}
      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border-2 border-dashed border-[#FFD700]/30 rounded-2xl p-8">
        <label className="block text-center cursor-pointer">
          <span className="text-6xl block mb-3">📂</span>
          {nomeArquivo ? (
            <>
              <p className="text-lg font-bold text-white">{nomeArquivo}</p>
              <p className="text-xs text-gray-500 mt-1">clique pra trocar</p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-white">Escolher CSV Checkpoint</p>
              <p className="text-xs text-gray-500 mt-1">Absenteísmo — Painel de Gestão RC</p>
            </>
          )}
          <input type="file" accept=".csv" onChange={onArquivoChange} className="hidden" />
        </label>
      </div>

      {/* PERÍODO + RESUMO */}
      {registros.length > 0 && !carregandoCsv && (
        <>
          <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/5 border-2 border-purple-500/40 rounded-2xl p-5">
            <h3 className="text-purple-300 font-black text-lg mb-3">📆 Período detectado</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-[#0a0a0a] rounded-lg p-3">
                <p className="text-[10px] text-gray-500 uppercase font-bold">Período</p>
                <p className="text-sm font-mono font-bold text-purple-300">
                  {periodoInicio ? formatarDataBr(periodoInicio) : '—'}
                </p>
                <p className="text-xs text-gray-400">até {periodoFim ? formatarDataBr(periodoFim) : '—'}</p>
              </div>
              <div className="bg-[#0a0a0a] rounded-lg p-3">
                <p className="text-[10px] text-gray-500 uppercase font-bold">Dias</p>
                <p className="text-2xl font-black text-purple-300">{datas.length}</p>
              </div>
              <div className="bg-[#0a0a0a] rounded-lg p-3">
                <p className="text-[10px] text-gray-500 uppercase font-bold">Do seu time</p>
                <p className="text-2xl font-black text-green-400">{registrosDoTime.length}</p>
              </div>
              <div className="bg-[#0a0a0a] rounded-lg p-3">
                <p className="text-[10px] text-gray-500 uppercase font-bold">Fora do time</p>
                <p className="text-2xl font-black text-gray-500">{registrosForaDoTime.length}</p>
              </div>
            </div>
          </div>

          {/* RESUMO POR CATEGORIA */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-green-400">{resumo.presencas}</p>
              <p className="text-[10px] text-gray-400">Presenças</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-red-400">{resumo.faltas}</p>
              <p className="text-[10px] text-gray-400">Faltas</p>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-yellow-400">{resumo.atestados}</p>
              <p className="text-[10px] text-gray-400">Atestados</p>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-blue-400">{resumo.ferias}</p>
              <p className="text-[10px] text-gray-400">Férias</p>
            </div>
            <div className="bg-gray-500/10 border border-gray-500/30 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-gray-400">{resumo.afastados}</p>
              <p className="text-[10px] text-gray-400">Afastados</p>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-orange-400">{resumo.absTotal}</p>
              <p className="text-[10px] text-gray-400">Contam ABS</p>
            </div>
          </div>

          {/* 🆕 AVISO: quem do time NÃO está no CSV */}
          {doTimeForaDoCsv.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
              <p className="text-amber-300 font-bold mb-2 flex items-center gap-2">
                ⚠️ {doTimeForaDoCsv.length} colaborador(es) do seu time NÃO estão no CSV
              </p>
              <p className="text-xs text-gray-400 mb-2">
                Esses ativos não têm registro de presença nesse arquivo. Confira se ficaram de fora:
              </p>
              <div className="flex flex-wrap gap-2">
                {doTimeForaDoCsv.slice(0, 20).map((c) => (
                  <span key={c.id_groot} className="text-xs bg-[#0a0a0a] border border-amber-500/20 rounded-full px-3 py-1 text-amber-200">
                    {c.nome}
                  </span>
                ))}
                {doTimeForaDoCsv.length > 20 && (
                  <span className="text-xs text-gray-500 px-2 py-1">+ {doTimeForaDoCsv.length - 20}...</span>
                )}
              </div>
            </div>
          )}

          {/* PREVIEW */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
            <div className="bg-[#0a0a0a] px-4 py-2 border-b border-[#2a2a2a]">
              <h3 className="text-sm font-bold text-[#FFD700]">
                📋 Preview do seu time ({registrosDoTime.length} registros)
              </h3>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0a0a0a]">
                  <tr className="border-b border-[#2a2a2a] text-left text-xs text-gray-400">
                    <th className="py-2 px-3">Colaborador</th>
                    <th className="py-2 px-3">Data</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-center">ABS?</th>
                  </tr>
                </thead>
                <tbody>
                  {registrosDoTime.slice(0, 60).map((r, i) => {
                    const lbl = LABELS_STATUS[r.status] || LABELS_STATUS.outro;
                    return (
                      <tr key={i} className="border-b border-[#2a2a2a] hover:bg-[#0a0a0a]">
                        <td className="py-2 px-3 text-white text-xs">{r.nomeOficial || r.nomeCsv}</td>
                        <td className="py-2 px-3 text-gray-300 text-xs font-mono">{formatarDataBr(r.data)}</td>
                        <td className={`py-2 px-3 text-xs font-bold ${lbl.cor}`}>{lbl.label}</td>
                        <td className="py-2 px-3 text-center">
                          {r.contaAbs ? <span className="text-red-400 font-bold">SIM</span> : <span className="text-gray-600">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {registrosDoTime.length > 60 && (
                <div className="text-center py-2 text-xs text-gray-500">+ {registrosDoTime.length - 60} linhas...</div>
              )}
            </div>
          </div>

          <button
            onClick={enviar}
            disabled={enviando || registrosDoTime.length === 0}
            className="group w-full bg-gradient-to-r from-[#FFD700] to-yellow-600 hover:from-yellow-300 hover:to-yellow-500 text-black font-black py-4 rounded-2xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-lg shadow-lg shadow-yellow-500/20 hover:shadow-yellow-500/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] flex items-center justify-center gap-3"
          >
            {enviando ? (
              <>
                <span className="inline-block w-5 h-5 border-[3px] border-black/30 border-t-black rounded-full animate-spin"></span>
                Salvando...
              </>
            ) : (
              <>
                <span className="group-hover:scale-110 transition-transform">✅</span>
                Salvar {registrosDoTime.length} registros do seu time
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}
