'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { supabase } from '../../../lib/supabase';

type ColaboradorMap = {
  id_groot: string;
  nome: string;
  processo: string | null;
};

type LinhaCSV = Record<string, string>;

type RegistroProcessado = {
  idGroot: string;
  nomeCsv: string;
  processo: string;
  prodLiquida: number;
  prodEfetiva: number;
  utilizacao: string;
  tempoProcesso: string;
  tempoEfetivo: string;
  tempoOcioso: string;
  unidades: number;
  ima: number;
  impactoNet: number;
  statusMeta: string;
};

// Converte HH:MM:SS pra segundos
function hmsToSeconds(value: string): number {
  if (!value) return 0;
  const s = String(value).trim();
  const parts = s.split(':');
  if (parts.length === 2) return Number(parts[0]) * 3600 + Number(parts[1]) * 60;
  if (parts.length === 3)
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  return 0;
}

// Parseia número flexível (vírgula, ponto, %)
function parseNumber(value: string): number {
  if (!value) return 0;
  let s = String(value).trim().replace(/\s/g, '').replace('%', '');
  if (!s) return 0;

  const hasComma = s.indexOf(',') !== -1;
  const hasDot = s.indexOf('.') !== -1;

  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    s = s.replace(',', '.');
  }

  s = s.replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

// Normaliza chave (cabeçalho) — remove acentos, espaços, deixa lowercase
function normalizarChave(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

// Tenta achar um valor numa linha procurando por aliases
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

// Detecta processo pelo cabeçalho ou nome do arquivo
function detectarProcesso(linha: LinhaCSV, nomeArquivo: string): string {
  const procDoCsv = pegarValor(linha, ['processo', 'process']).toLowerCase();
  if (procDoCsv.includes('check')) return 'Checkin';
  if (procDoCsv.includes('p2m')) return 'P2M';
  if (procDoCsv.includes('sort')) return 'Sorting';

  const arq = nomeArquivo.toLowerCase();
  if (arq.includes('check')) return 'Checkin';
  if (arq.includes('p2m')) return 'P2M';
  if (arq.includes('sort')) return 'Sorting';
  return '';
}

// Normaliza id_groot (só dígitos)
function normalizarIdGroot(v: string): string {
  return String(v || '').replace(/\D/g, '').trim();
}

// Classifica status_meta com base nas metas
function classificar(
  liquida: number,
  processo: string,
  metas: Record<string, number>
): string {
  if (liquida <= 0) return 'Sem dados';

  if (processo === 'Checkin') {
    if (liquida > metas.meta_checkin_alinhado_max) return 'Supera';
    if (liquida >= metas.meta_checkin_base) return 'Alinhado';
    return 'Abaixo';
  }

  if (processo === 'P2M') {
    if (liquida > metas.meta_p2m_alinhado_max) return 'Supera';
    if (liquida >= metas.meta_p2m_base) return 'Alinhado';
    return 'Abaixo';
  }

  if (processo === 'Sorting') {
    return liquida > 0 ? 'Alinhado' : 'Sem dados';
  }

  return 'Sem dados';
}

export default function UploadPage() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [dataRef, setDataRef] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [linhas, setLinhas] = useState<LinhaCSV[]>([]);
  const [cabecalhos, setCabecalhos] = useState<string[]>([]);
  const [processado, setProcessado] = useState<RegistroProcessado[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorMap[]>([]);
  const [metas, setMetas] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [naoVinculados, setNaoVinculados] = useState<string[]>([]);

  // Carrega colaboradores e metas no mount
  useEffect(() => {
    async function carregarBase() {
      const { data: colabs } = await supabase
        .from('colaboradores')
        .select('id_groot, nome, processo');
      if (colabs) setColaboradores(colabs as ColaboradorMap[]);

      const { data: conf } = await supabase.from('config').select('chave, valor');
      if (conf) {
        const map: Record<string, number> = {};
        (conf as { chave: string; valor: string }[]).forEach((c) => {
          map[c.chave] = Number(c.valor);
        });
        setMetas(map);
      }
    }
    carregarBase();
  }, []);

  function onArquivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    setArquivo(f);
    setErro(null);
    setSucesso(null);
    setProcessado([]);
    setLinhas([]);
    setNaoVinculados([]);
    setCarregando(true);

    Papa.parse<LinhaCSV>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setCarregando(false);
        if (result.errors.length > 0) {
          setErro('Erro ao ler CSV: ' + result.errors[0].message);
          return;
        }
        setLinhas(result.data);
        setCabecalhos(result.meta.fields || []);
      },
      error: (err) => {
        setCarregando(false);
        setErro('Erro: ' + err.message);
      },
    });
  }

  function processar() {
    if (!linhas.length) return;
    setErro(null);
    setSucesso(null);

    // Mapa nome → id_groot (case insensitive)
    const mapaCadastro: Record<string, ColaboradorMap> = {};
    colaboradores.forEach((c) => {
      mapaCadastro[normalizarIdGroot(c.id_groot)] = c;
    });

    const naoVinc: string[] = [];
    const registrosBrutos: Array<{
      idGroot: string;
      nomeCsv: string;
      processo: string;
      prodLiquida: number;
      prodEfetiva: number;
      utilizacao: string;
      tempoProcesso: string;
      tempoEfetivo: string;
      tempoOcioso: string;
      unidades: number;
      ima: number;
    }> = [];

    linhas.forEach((linha) => {
      const idGrootRaw = pegarValor(linha, ['id_groot', 'id groot', 'groot', 'id']);
      const idGroot = normalizarIdGroot(idGrootRaw);
      const nomeCsv = pegarValor(linha, ['nome', 'agente', 'representante']);

      if (!idGroot || !mapaCadastro[idGroot]) {
        if (nomeCsv) naoVinc.push(nomeCsv + ' (ID: ' + idGrootRaw + ')');
        return;
      }

      const cadastro = mapaCadastro[idGroot];
      const processo =
        cadastro.processo ||
        detectarProcesso(linha, arquivo?.name || '') ||
        'Checkin';

      const prodLiquida = parseNumber(
        pegarValor(linha, [
          'prod_liquida_sist',
          'prod liquida sist',
          'prod_liquida',
          'liquida',
          'produtividade liquida',
        ])
      );
      const prodEfetiva = parseNumber(
        pegarValor(linha, ['prod_efetiva', 'prod efetiva', 'efetiva'])
      );
      const utilizacao = pegarValor(linha, ['utilizacao', 'utilização']);
      const tempoProcesso = pegarValor(linha, [
        'tempo_em_processo',
        'tempo em processo',
        'tempo_processo',
        'tempo processo',
      ]);
      const tempoEfetivo = pegarValor(linha, ['tempo_efetivo', 'tempo efetivo']);
      const tempoOcioso = pegarValor(linha, [
        'tempo_ocioso',
        'tempo ocioso',
        'ociosidade',
      ]);
      const unidades = parseNumber(
        pegarValor(linha, ['unidades', 'volume', 'quantidade'])
      );
      const ima = parseNumber(pegarValor(linha, ['ima']));

      registrosBrutos.push({
        idGroot,
        nomeCsv,
        processo,
        prodLiquida,
        prodEfetiva,
        utilizacao,
        tempoProcesso,
        tempoEfetivo,
        tempoOcioso,
        unidades,
        ima,
      });
    });

    // Calcula NET média por processo
    const netPorProc: Record<string, { volume: number; horas: number }> = {};
    registrosBrutos.forEach((r) => {
      const horas = hmsToSeconds(r.tempoProcesso) / 3600;
      if (horas <= 0 || r.unidades <= 0) return;
      if (!netPorProc[r.processo]) netPorProc[r.processo] = { volume: 0, horas: 0 };
      netPorProc[r.processo].volume += r.unidades;
      netPorProc[r.processo].horas += horas;
    });

    const netMedia: Record<string, number> = {};
    Object.keys(netPorProc).forEach((proc) => {
      const a = netPorProc[proc];
      netMedia[proc] = a.horas > 0 ? a.volume / a.horas : 0;
    });

    // Calcula Impacto NET e classifica
    const finais: RegistroProcessado[] = registrosBrutos.map((r) => {
      const horas = hmsToSeconds(r.tempoProcesso) / 3600;
      const netInd = horas > 0 ? r.unidades / horas : 0;
      const netTime = netMedia[r.processo] || 0;
      let impacto = 0;
      if (netTime > 0 && netInd > 0) {
        impacto = ((netInd - netTime) / netTime) * 100;
        impacto = Math.max(-100, Math.min(200, impacto));
        impacto = Number(impacto.toFixed(2));
      }

      const statusMeta = classificar(r.prodLiquida, r.processo, metas);

      return {
        ...r,
        impactoNet: impacto,
        statusMeta,
      };
    });

    setProcessado(finais);
    setNaoVinculados(naoVinc);
  }

  async function salvarTudo() {
    if (!processado.length || !arquivo) return;
    setSalvando(true);
    setErro(null);
    setSucesso(null);

    try {
      // Remove registros antigos do mesmo dia + mesmo arquivo (substituição)
      await supabase
        .from('historico')
        .delete()
        .eq('data_referencia', dataRef)
        .eq('arquivo_origem', arquivo.name);

      // Determina trimestre
      const dataObj = new Date(dataRef + 'T12:00:00');
      const mes = dataObj.getMonth() + 1;
      let quarter = 'Q1';
      if (mes >= 4 && mes <= 6) quarter = 'Q2';
      else if (mes >= 7 && mes <= 9) quarter = 'Q3';
      else if (mes >= 10) quarter = 'Q4';

      // Insere todos
      const linhasInsert = processado.map((r) => ({
        data_referencia: dataRef,
        id_groot: r.idGroot,
        nome_csv: r.nomeCsv,
        processo: r.processo,
        prod_liquida: r.prodLiquida,
        prod_efetiva: r.prodEfetiva,
        utilizacao: r.utilizacao,
        tempo_processo: r.tempoProcesso,
        tempo_efetivo: r.tempoEfetivo,
        tempo_ocioso: r.tempoOcioso,
        unidades: r.unidades,
        impacto_net: r.impactoNet,
        status_meta: r.statusMeta,
        ima: r.ima,
        arquivo_origem: arquivo.name,
        tipo_origem: 'Produtividade',
        trimestre: quarter,
        ano_referencia: dataObj.getFullYear(),
      }));

      const { error: errInsert } = await supabase
        .from('historico')
        .insert(linhasInsert);
      if (errInsert) throw new Error(errInsert.message);

      // Registra no uploads
      const uploadId = 'UP-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      await supabase.from('uploads').insert({
        upload_id: uploadId,
        data_referencia: dataRef,
        tipo_base: processado[0]?.processo || 'Misto',
        arquivo: arquivo.name,
        linhas_processadas: linhas.length,
        linhas_vinculadas: processado.length,
        usuario: 'delman.jpereira@mercadolivre.com',
        modelo_csv: 'produtividade',
      });

      setSucesso(
        `✅ ${processado.length} registros salvos! ${naoVinculados.length} não vinculados (não cadastrados).`
      );

      // Limpa pro próximo
      setTimeout(() => {
        setArquivo(null);
        setLinhas([]);
        setProcessado([]);
        setNaoVinculados([]);
        const input = document.getElementById('input-csv') as HTMLInputElement;
        if (input) input.value = '';
      }, 2000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      setErro(msg);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <Link
        href="/meu-time"
        className="text-gray-400 hover:text-white transition-colors inline-flex items-center gap-2"
      >
        ← Voltar para MEU TIME
      </Link>

      <div>
        <h1 className="text-4xl font-black mb-2">
          📤 Upload <span className="text-[#FFD700]">CSV</span>
        </h1>
        <p className="text-gray-400">
          Envio diário de dados de produtividade — Líquida, Ocupação, IMA
        </p>
      </div>

      {/* Mensagens */}
      {sucesso && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3">
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

      {/* Upload */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-[#FFD700]">1️⃣ Selecionar arquivo</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2">
              Data de referência <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={dataRef}
              onChange={(e) => setDataRef(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white focus:border-[#FFD700] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2">
              Arquivo CSV <span className="text-red-400">*</span>
            </label>
            <input
              id="input-csv"
              type="file"
              accept=".csv"
              onChange={onArquivoChange}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white file:bg-[#FFD700] file:text-black file:font-bold file:border-0 file:px-4 file:py-1 file:rounded file:mr-3"
            />
          </div>
        </div>

        {carregando && (
          <p className="text-gray-400 text-sm">⏳ Lendo arquivo...</p>
        )}

        {arquivo && !carregando && linhas.length > 0 && (
          <div className="bg-[#0a0a0a] rounded-lg p-3 text-sm space-y-1">
            <p className="text-green-400">
              ✅ Arquivo: <strong>{arquivo.name}</strong>
            </p>
            <p className="text-gray-400">
              📊 {linhas.length} linhas detectadas | {cabecalhos.length} colunas
            </p>
            <p className="text-gray-500 text-xs">
              Cabeçalhos: {cabecalhos.join(', ')}
            </p>
          </div>
        )}
      </div>

      {/* Processar */}
      {linhas.length > 0 && processado.length === 0 && (
        <button
          onClick={processar}
          className="w-full bg-[#FFD700] text-black font-bold py-4 rounded-lg hover:bg-yellow-300 transition-colors text-lg"
        >
          🔧 Processar e calcular Impacto NET
        </button>
      )}

      {/* Preview do processamento */}
      {processado.length > 0 && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-[#FFD700]">
            2️⃣ Preview ({processado.length} vinculados)
          </h2>

          {naoVinculados.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm">
              <p className="text-yellow-400 font-bold mb-2">
                ⚠️ {naoVinculados.length} colaborador(es) não vinculado(s):
              </p>
              <ul className="text-yellow-300 text-xs space-y-0.5">
                {naoVinculados.slice(0, 5).map((n, i) => (
                  <li key={i}>• {n}</li>
                ))}
                {naoVinculados.length > 5 && (
                  <li>... e mais {naoVinculados.length - 5}</li>
                )}
              </ul>
              <p className="text-yellow-200 text-xs mt-2">
                💡 Cadastre eles em MEU TIME pra aparecerem no histórico
              </p>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-left text-xs text-gray-400">
                  <th className="py-2 pr-2">Nome</th>
                  <th className="py-2 pr-2">Proc.</th>
                  <th className="py-2 pr-2 text-right">Líquida</th>
                  <th className="py-2 pr-2 text-right">Imp.NET</th>
                  <th className="py-2 pr-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {processado.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-b border-[#2a2a2a]">
                    <td className="py-2 pr-2 text-white">{r.nomeCsv}</td>
                    <td className="py-2 pr-2 text-gray-400">{r.processo}</td>
                    <td className="py-2 pr-2 text-right text-white font-mono">
                      {r.prodLiquida.toFixed(0)}
                    </td>
                    <td
                      className={`py-2 pr-2 text-right font-mono ${
                        r.impactoNet > 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {r.impactoNet > 0 ? '+' : ''}
                      {r.impactoNet.toFixed(1)}%
                    </td>
                    <td className="py-2 pr-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          r.statusMeta === 'Supera'
                            ? 'bg-green-500/20 text-green-400'
                            : r.statusMeta === 'Alinhado'
                            ? 'bg-blue-500/20 text-blue-400'
                            : r.statusMeta === 'Abaixo'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {r.statusMeta}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {processado.length > 10 && (
              <p className="text-gray-500 text-xs mt-2 text-center">
                ... e mais {processado.length - 10} colaboradores
              </p>
            )}
          </div>

          <button
            onClick={salvarTudo}
            disabled={salvando}
            className="w-full bg-green-500 text-white font-bold py-4 rounded-lg hover:bg-green-400 transition-colors text-lg disabled:opacity-50"
          >
            {salvando ? '💾 Salvando...' : `💾 Salvar ${processado.length} registros no banco`}
          </button>
        </div>
      )}

      {/* Documentação */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 text-sm text-blue-300">
        <p className="font-bold mb-2">📋 Cabeçalhos aceitos no CSV:</p>
        <ul className="space-y-1 list-disc pl-5 text-xs">
          <li><strong>ID GROOT</strong> (obrigatório) — vincula ao colaborador</li>
          <li><strong>NOME</strong> — pra referência visual</li>
          <li><strong>PROCESSO</strong> — Checkin / P2M / Sorting (ou detecta pelo nome do arquivo)</li>
          <li><strong>LIQUIDA / PROD_LIQUIDA</strong> — peças/hora líquida</li>
          <li><strong>UNIDADES / VOLUME</strong> — quantidade de peças</li>
          <li><strong>TEMPO_PROCESSO</strong> — HH:MM:SS</li>
          <li><strong>TEMPO_EFETIVO</strong> — HH:MM:SS</li>
          <li><strong>TEMPO_OCIOSO</strong> — HH:MM:SS</li>
          <li><strong>UTILIZACAO</strong> — Ex: 85%</li>
          <li><strong>IMA</strong> — opcional</li>
        </ul>
      </div>
    </div>
  );
}
