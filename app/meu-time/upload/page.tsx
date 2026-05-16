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

function hmsToSeconds(value: string): number {
  if (!value) return 0;
  const s = String(value).trim();
  const parts = s.split(':');
  if (parts.length === 2) return Number(parts[0]) * 3600 + Number(parts[1]) * 60;
  if (parts.length === 3)
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  return 0;
}

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
  const [processoSelecionado, setProcessoSelecionado] = useState<string>('');
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

  useEffect(() => {
    async function carregarBase() {
      console.log('🔄 Carregando colaboradores e metas...');
      const { data: colabs, error: errColabs } = await supabase
        .from('colaboradores')
        .select('id_groot, nome, processo');

      if (errColabs) {
        console.error('❌ Erro ao buscar colaboradores:', errColabs);
        setErro('Erro ao buscar colaboradores: ' + errColabs.message);
        return;
      }

      if (colabs) {
        console.log('✅ Colaboradores carregados:', colabs.length);
        setColaboradores(colabs as ColaboradorMap[]);
      }

      const { data: conf, error: errConf } = await supabase.from('config').select('chave, valor');

      if (errConf) {
        console.error('❌ Erro ao buscar config:', errConf);
        setErro('Erro ao buscar configurações: ' + errConf.message);
        return;
      }

      if (conf) {
        const map: Record<string, number> = {};
        (conf as { chave: string; valor: string }[]).forEach((c) => {
          map[c.chave] = Number(c.valor);
        });
        console.log('✅ Metas carregadas:', map);
        setMetas(map);
      }
    }
    carregarBase();
  }, []);

  function onArquivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    console.log('📂 Arquivo selecionado:', f.name);

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
        console.log('📊 CSV lido:', result.data.length, 'linhas');
        console.log('📋 Cabeçalhos:', result.meta.fields);

        if (result.errors.length > 0) {
          console.error('❌ Erros do papaparse:', result.errors);
          setErro('Erro ao ler CSV: ' + result.errors[0].message);
          return;
        }
        setLinhas(result.data);
        setCabecalhos(result.meta.fields || []);
      },
      error: (err) => {
        setCarregando(false);
        console.error('❌ Erro papaparse:', err);
        setErro('Erro: ' + err.message);
      },
    });
  }

  function enviar() {
    console.log('🚀 Botão ENVIAR clicado!');
    console.log('   - Processo selecionado:', processoSelecionado);
    console.log('   - Linhas:', linhas.length);
    console.log('   - Colaboradores cadastrados:', colaboradores.length);
    console.log('   - Metas:', Object.keys(metas).length);

    if (!linhas.length) {
      setErro('⚠️ Nenhum arquivo carregado ainda. Selecione um CSV antes.');
      return;
    }

    if (!processoSelecionado) {
      setErro('⚠️ Selecione o processo (Checkin / P2M / Sorting) antes de enviar.');
      return;
    }

    if (colaboradores.length === 0) {
      setErro('⚠️ Nenhum colaborador cadastrado. Cadastre primeiro em MEU TIME.');
      return;
    }

    if (Object.keys(metas).length === 0) {
      setErro('⚠️ Configurações de metas não carregadas. Volte para Configurações e salve as metas.');
      return;
    }

    setErro(null);
    setSucesso(null);

    const mapaCadastro: Record<string, ColaboradorMap> = {};
    colaboradores.forEach((c) => {
      mapaCadastro[normalizarIdGroot(c.id_groot)] = c;
    });

    console.log('🗺️  Mapa de cadastro montado com', Object.keys(mapaCadastro).length, 'IDs');

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

    linhas.forEach((linha, idx) => {
      const idGrootRaw = pegarValor(linha, ['id_groot', 'id groot', 'groot', 'id']);
      const idGroot = normalizarIdGroot(idGrootRaw);
      const nomeCsv = pegarValor(linha, ['nome', 'agente', 'representante']);

      console.log(`Linha ${idx + 1}: ID="${idGrootRaw}" → "${idGroot}" | Nome="${nomeCsv}"`);

      if (!idGroot || !mapaCadastro[idGroot]) {
        console.log(`   ⚠️  Não vinculado`);
        if (nomeCsv) naoVinc.push(nomeCsv + ' (ID: ' + idGrootRaw + ')');
        return;
      }

      console.log(`   ✅ Vinculado a ${mapaCadastro[idGroot].nome}`);

      const processo = processoSelecionado;

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

    console.log('✅ Total vinculados:', registrosBrutos.length);
    console.log('⚠️  Não vinculados:', naoVinc.length);

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

    console.log('📈 NET média por processo:', netMedia);

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

    console.log('✅ Processamento concluído. Mostrando preview de', finais.length, 'registros');

    setProcessado(finais);
    setNaoVinculados(naoVinc);

    // Mensagem amigável se ninguém foi vinculado
    if (finais.length === 0 && naoVinc.length > 0) {
      setErro(
        `⚠️ Nenhum colaborador do CSV foi vinculado. Verifique se os IDs do CSV batem com os IDs do cadastro. Total não vinculados: ${naoVinc.length}`
      );
    }
  }

  async function confirmarEnvio() {
    if (!processado.length || !arquivo) return;
    console.log('💾 Confirmar envio clicado!');
    setSalvando(true);
    setErro(null);
    setSucesso(null);

    try {
      // Apaga registros antigos do mesmo dia + arquivo
      const { error: errDel } = await supabase
        .from('historico')
        .delete()
        .eq('data_referencia', dataRef)
        .eq('arquivo_origem', arquivo.name);

      if (errDel) {
        console.error('❌ Erro no delete:', errDel);
        // não interrompe, pode ser primeira vez
      }

      const dataObj = new Date(dataRef + 'T12:00:00');
      const mes = dataObj.getMonth() + 1;
      let quarter = 'Q1';
      if (mes >= 4 && mes <= 6) quarter = 'Q2';
      else if (mes >= 7 && mes <= 9) quarter = 'Q3';
      else if (mes >= 10) quarter = 'Q4';

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

      console.log('💾 Inserindo', linhasInsert.length, 'registros...');

      const { error: errInsert } = await supabase
        .from('historico')
        .insert(linhasInsert);

      if (errInsert) {
        console.error('❌ Erro ao inserir:', errInsert);
        throw new Error(errInsert.message);
      }

      const uploadId = 'UP-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      await supabase.from('uploads').insert({
        upload_id: uploadId,
        data_referencia: dataRef,
        tipo_base: processoSelecionado,
        arquivo: arquivo.name,
        linhas_processadas: linhas.length,
        linhas_vinculadas: processado.length,
        usuario: 'delman.jpereira@mercadolivre.com',
        modelo_csv: 'produtividade',
      });

      console.log('✅ Tudo salvo com sucesso!');

      setSucesso(
        `✅ ${processado.length} registros salvos! ${naoVinculados.length} não vinculados.`
      );

      setTimeout(() => {
        setArquivo(null);
        setLinhas([]);
        setProcessado([]);
        setNaoVinculados([]);
        setProcessoSelecionado('');
        const input = document.getElementById('input-csv') as HTMLInputElement;
        if (input) input.value = '';
      }, 2500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      console.error('❌ Erro geral:', e);
      setErro(msg);
    } finally {
      setSalvando(false);
    }
  }

  // Mostra status dos requisitos pra debug visual
  const podeEnviar =
    linhas.length > 0 &&
    processoSelecionado !== '' &&
    colaboradores.length > 0 &&
    Object.keys(metas).length > 0;

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

      {/* SELEÇÃO DE PROCESSO */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-[#FFD700]">
          1️⃣ Qual processo desse CSV?
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={() => setProcessoSelecionado('Checkin')}
            className={`p-4 rounded-lg border-2 transition-all font-bold ${
              processoSelecionado === 'Checkin'
                ? 'bg-cyan-500/30 border-cyan-400 text-cyan-300'
                : 'bg-[#0a0a0a] border-[#2a2a2a] text-gray-400 hover:border-cyan-500/50'
            }`}
          >
            📦 Checkin
          </button>

          <button
            onClick={() => setProcessoSelecionado('P2M')}
            className={`p-4 rounded-lg border-2 transition-all font-bold ${
              processoSelecionado === 'P2M'
                ? 'bg-orange-500/30 border-orange-400 text-orange-300'
                : 'bg-[#0a0a0a] border-[#2a2a2a] text-gray-400 hover:border-orange-500/50'
            }`}
          >
            🚚 P2M
          </button>

          <button
            onClick={() => setProcessoSelecionado('Sorting')}
            className={`p-4 rounded-lg border-2 transition-all font-bold ${
              processoSelecionado === 'Sorting'
                ? 'bg-emerald-500/30 border-emerald-400 text-emerald-300'
                : 'bg-[#0a0a0a] border-[#2a2a2a] text-gray-400 hover:border-emerald-500/50'
            }`}
          >
            📋 Sorting
          </button>
        </div>

        {processoSelecionado && (
          <p className="text-sm text-green-400">
            ✓ Processo selecionado: <strong>{processoSelecionado}</strong>
          </p>
        )}
      </div>

      {/* SELEÇÃO DE ARQUIVO */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-[#FFD700]">2️⃣ Selecionar arquivo</h2>

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

      {/* BOTÃO ENVIAR (sempre clicável — mostra erro se algo faltar) */}
      {processado.length === 0 && (
        <button
          onClick={enviar}
          className={`w-full font-bold py-4 rounded-lg transition-colors text-lg ${
            podeEnviar
              ? 'bg-[#FFD700] text-black hover:bg-yellow-300'
              : 'bg-[#FFD700]/50 text-black/70 hover:bg-[#FFD700]/70'
          }`}
        >
          📤 Enviar
        </button>
      )}

      {/* Checklist visual (debug amigável) */}
      {processado.length === 0 && (
        <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-3 text-xs space-y-1">
          <p className="text-gray-400 font-bold mb-2">Status do envio:</p>
          <p className={processoSelecionado ? 'text-green-400' : 'text-gray-500'}>
            {processoSelecionado ? '✅' : '⬜'} Processo selecionado{' '}
            {processoSelecionado && `(${processoSelecionado})`}
          </p>
          <p className={linhas.length > 0 ? 'text-green-400' : 'text-gray-500'}>
            {linhas.length > 0 ? '✅' : '⬜'} Arquivo CSV carregado{' '}
            {linhas.length > 0 && `(${linhas.length} linhas)`}
          </p>
          <p
            className={
              colaboradores.length > 0 ? 'text-green-400' : 'text-red-400'
            }
          >
            {colaboradores.length > 0 ? '✅' : '❌'} Colaboradores cadastrados{' '}
            ({colaboradores.length})
          </p>
          <p
            className={
              Object.keys(metas).length > 0 ? 'text-green-400' : 'text-red-400'
            }
          >
            {Object.keys(metas).length > 0 ? '✅' : '❌'} Metas configuradas (
            {Object.keys(metas).length})
          </p>
        </div>
      )}

      {/* PREVIEW */}
      {processado.length > 0 && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#FFD700]">
              3️⃣ Preview ({processado.length} vinculados)
            </h2>
            <span className={`text-xs px-3 py-1 rounded-full font-bold ${
              processoSelecionado === 'Checkin' ? 'bg-cyan-500/20 text-cyan-400' :
              processoSelecionado === 'P2M' ? 'bg-orange-500/20 text-orange-400' :
              'bg-emerald-500/20 text-emerald-400'
            }`}>
              {processoSelecionado}
            </span>
          </div>

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
                  <th className="py-2 pr-2 text-right">Líquida</th>
                  <th className="py-2 pr-2 text-right">Imp.NET</th>
                  <th className="py-2 pr-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {processado.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-b border-[#2a2a2a]">
                    <td className="py-2 pr-2 text-white">{r.nomeCsv}</td>
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
            onClick={confirmarEnvio}
            disabled={salvando}
            className="w-full bg-green-500 text-white font-bold py-4 rounded-lg hover:bg-green-400 transition-colors text-lg disabled:opacity-50"
          >
            {salvando ? '💾 Salvando...' : `✅ Confirmar envio`}
          </button>
        </div>
      )}
    </div>
  );
}
