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
  vinculado: boolean;
  nomeOficial: string;
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

// 🎯 Detecta data no nome do arquivo
// Formatos suportados: 2026-05-16, 2026_05_16, 16-05-2026, 16_05_2026, 2026.05.16
// 🎯 Detecta se o CSV é MENSAL (range de datas no nome)
// Ex: "Lista 2026-04-01 al 2026-04-30 de 00_00_00 a 00_00_00.csv"
function detectarCsvMensal(nomeArquivo: string): { mes: number; ano: number; trimestre: string } | null {
  const nome = nomeArquivo.replace(/\.csv$/i, '');
  
  // Padrão: YYYY-MM-DD al YYYY-MM-DD (com "al" no meio)
  const matchMensal = nome.match(/(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})\s+al\s+(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})/i);
  if (matchMensal) {
    const anoInicio = parseInt(matchMensal[1]);
    const mesInicio = parseInt(matchMensal[2]);
    const diaInicio = parseInt(matchMensal[3]);
    const mesFim = parseInt(matchMensal[5]);
    const diaFim = parseInt(matchMensal[6]);
    
    // Confirma que abrange o mês inteiro (dia 1 ao 28+)
    if (diaInicio === 1 && diaFim >= 28 && mesInicio === mesFim) {
      let trimestre = 'Q1';
      if (mesInicio >= 4 && mesInicio <= 6) trimestre = 'Q2';
      else if (mesInicio >= 7 && mesInicio <= 9) trimestre = 'Q3';
      else if (mesInicio >= 10) trimestre = 'Q4';
      
      return { mes: mesInicio, ano: anoInicio, trimestre };
    }
  }
  
  return null;
}

function detectarDataNoNome(nomeArquivo: string): string | null {
  // Limpa o nome (remove extensão e caracteres especiais)
  const nome = nomeArquivo.replace(/\.csv$/i, '');

  // Padrão 1: YYYY-MM-DD ou YYYY_MM_DD ou YYYY.MM.DD (ano primeiro)
  const padraoAno = nome.match(/(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})/);
  if (padraoAno) {
    const ano = padraoAno[1];
    const mes = padraoAno[2].padStart(2, '0');
    const dia = padraoAno[3].padStart(2, '0');
    // Valida
    const mesNum = parseInt(mes);
    const diaNum = parseInt(dia);
    if (mesNum >= 1 && mesNum <= 12 && diaNum >= 1 && diaNum <= 31) {
      return `${ano}-${mes}-${dia}`;
    }
  }

  // Padrão 2: DD-MM-YYYY ou DD_MM_YYYY (dia primeiro)
  const padraoDia = nome.match(/(\d{1,2})[-_.](\d{1,2})[-_.](20\d{2})/);
  if (padraoDia) {
    const dia = padraoDia[1].padStart(2, '0');
    const mes = padraoDia[2].padStart(2, '0');
    const ano = padraoDia[3];
    const mesNum = parseInt(mes);
    const diaNum = parseInt(dia);
    if (mesNum >= 1 && mesNum <= 12 && diaNum >= 1 && diaNum <= 31) {
      return `${ano}-${mes}-${dia}`;
    }
  }

  return null;
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
  
  // 🎯 Modo MENSAL (CSV consolidado de um mês inteiro)
  const [csvMensal, setCsvMensal] = useState<{ mes: number; ano: number; trimestre: string; nomeArquivo: string } | null>(null);

  useEffect(() => {
    async function carregarBase() {
      console.log('🔄 Carregando colaboradores e metas...');
      const { data: colabs } = await supabase
        .from('colaboradores')
        .select('id_groot, nome, processo');
      if (colabs) {
        console.log('✅ Colaboradores carregados:', colabs.length);
        setColaboradores(colabs as ColaboradorMap[]);
      }

      const { data: conf } = await supabase.from('config').select('chave, valor');
      if (conf) {
        const map: Record<string, number> = {};
        (conf as { chave: string; valor: string }[]).forEach((c) => {
          map[c.chave] = Number(c.valor);
        });
        console.log('✅ Metas carregadas:', Object.keys(map).length);
        setMetas(map);
      }
    }
    carregarBase();
  }, []);

  function onArquivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    console.log('📂 Arquivo selecionado:', f.name);

    // 🎯 Tenta detectar se é CSV MENSAL (range de datas)
    const mensal = detectarCsvMensal(f.name);
    if (mensal) {
      setCsvMensal({ ...mensal, nomeArquivo: f.name });
      console.log('📆 CSV MENSAL detectado:', mensal);
      if (typeof window !== 'undefined' && window.showToast) {
        window.showToast('info', `📆 CSV Mensal detectado: ${String(mensal.mes).padStart(2, '0')}/${mensal.ano}`);
      }
    } else {
      setCsvMensal(null);
      
      // Tenta detectar a data no nome (modo diário)
      const dataDetectada = detectarDataNoNome(f.name);
      if (dataDetectada) {
        setDataRef(dataDetectada);
        console.log('📅 Data detectada automaticamente:', dataDetectada);
        if (typeof window !== 'undefined' && window.showToast) {
          window.showToast('info', `Data detectada: ${dataDetectada.split('-').reverse().join('/')}`);
        }
      }
    }

    setArquivo(f);
    setErro(null);
    setSucesso(null);
    setProcessado([]);
    setLinhas([]);
    setCarregando(true);

    Papa.parse<LinhaCSV>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setCarregando(false);
        console.log('📊 CSV lido:', result.data.length, 'linhas');
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
        setErro('Erro: ' + err.message);
      },
    });
  }

  function enviar() {
    console.log('🚀 Botão ENVIAR clicado!');

    if (!linhas.length) {
      setErro('⚠️ Nenhum arquivo carregado.');
      return;
    }
    if (!processoSelecionado) {
      setErro('⚠️ Selecione o processo antes de enviar.');
      return;
    }

    setErro(null);
    setSucesso(null);

    // Mapa do cadastro pra detectar vinculados
    const mapaCadastro: Record<string, ColaboradorMap> = {};
    colaboradores.forEach((c) => {
      mapaCadastro[normalizarIdGroot(c.id_groot)] = c;
    });

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
      vinculado: boolean;
      nomeOficial: string;
    }> = [];

    linhas.forEach((linha, idx) => {
      const idGrootRaw = pegarValor(linha, ['id_groot', 'id groot', 'groot', 'id']);
      const idGroot = normalizarIdGroot(idGrootRaw);
      const nomeCsv = pegarValor(linha, ['nome', 'agente', 'representante', 'representantes']);

      // PULA linha sem ID Groot (não tem como salvar nada útil)
      if (!idGroot) {
        console.warn(`Linha ${idx + 1}: sem ID Groot, pulando.`);
        return;
      }

      const cadastro = mapaCadastro[idGroot];
      const vinculado = !!cadastro;
      const nomeOficial = cadastro?.nome || nomeCsv || 'Sem nome';

      console.log(
        `Linha ${idx + 1}: ID=${idGroot} | ${vinculado ? '✅ Vinculado a ' + cadastro!.nome : '⏳ Aguardando cadastro'}`
      );

      const processo = processoSelecionado;

      const prodLiquida = parseNumber(
        pegarValor(linha, [
          'prod_liquida_sist',
          'prod liquida sist',
          'prod liquida sistemico',
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
        'tempo em processo sistemico',
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
        vinculado,
        nomeOficial,
      });
    });

    console.log('✅ Total de registros pra salvar:', registrosBrutos.length);

    // Calcula NET média do time (TODOS, vinculados ou não)
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

    console.log('✅ Processamento concluído:', finais.length, 'registros');
    setProcessado(finais);

    if (finais.length === 0) {
      setErro('⚠️ Nenhuma linha do CSV tem ID Groot válido. Verifique o arquivo.');
    }
  }

  // 🎯 Salva CSV MENSAL com subtração inteligente
  // Lógica: pega o total do mês, subtrai o que já tem no histórico diário,
  // e salva o RESTANTE como "fonte mensal" pra calibração
  async function salvarMensal() {
    if (!processado.length || !arquivo || !csvMensal) return;
    console.log('📆 Salvando CSV MENSAL...');
    setSalvando(true);
    setErro(null);
    setSucesso(null);

    try {
      const { mes, ano, trimestre } = csvMensal;
      const primeiroDia = `${ano}-${String(mes).padStart(2, '0')}-01`;
      const ultimoDia = `${ano}-${String(mes).padStart(2, '0')}-31`;

      // 🔍 Busca o que JÁ existe no histórico daquele mês/processo
      const { data: historicoExistente } = await supabase
        .from('historico')
        .select('id_groot, prod_liquida, unidades, data_referencia')
        .eq('processo', processoSelecionado)
        .gte('data_referencia', primeiroDia)
        .lte('data_referencia', ultimoDia);

      console.log(`📊 Histórico existente: ${historicoExistente?.length || 0} registros em ${mes}/${ano}`);

      // Agrupa histórico por id_groot
      const histPorColab: Record<string, { unidades: number; dias: number; somaLiquida: number }> = {};
      (historicoExistente || []).forEach((h) => {
        if (!h.id_groot) return;
        if (!histPorColab[h.id_groot]) {
          histPorColab[h.id_groot] = { unidades: 0, dias: 0, somaLiquida: 0 };
        }
        histPorColab[h.id_groot].unidades += Number(h.unidades) || 0;
        histPorColab[h.id_groot].dias++;
        histPorColab[h.id_groot].somaLiquida += Number(h.prod_liquida) || 0;
      });

      // 🎯 Processa cada colaborador do CSV mensal
      const registrosParaSalvar: any[] = [];
      let complementados = 0;
      let novos = 0;
      let ignorados = 0;

      processado.forEach((r) => {
        if (!r.idGroot) {
          ignorados++;
          return;
        }

        const existente = histPorColab[r.idGroot];

        if (existente && existente.unidades >= r.unidades) {
          // Já tem MAIS no histórico do que o CSV mensal mostra → ignora
          console.log(`⏭️ ${r.nomeOficial}: histórico (${existente.unidades}) >= CSV (${r.unidades}), ignora`);
          ignorados++;
          return;
        }

        // Calcula o RESTANTE (CSV - já tem)
        const unidadesRestantes = existente
          ? Math.max(0, r.unidades - existente.unidades)
          : r.unidades;

        // Dias estimados ainda não cobertos (assume 22 dias úteis no mês)
        const diasUteisEstimados = 22;
        const diasComplementares = existente
          ? Math.max(0, diasUteisEstimados - existente.dias)
          : diasUteisEstimados;

        // Líquida média do restante (mantém a do CSV se não souber)
        const liquidaRestante = r.prodLiquida;

        registrosParaSalvar.push({
          id_groot: r.idGroot,
          nome: r.nomeOficial || r.nomeCsv,
          nome_csv: r.nomeCsv,
          mes,
          ano,
          trimestre,
          processo: processoSelecionado,
          prod_liquida_media: liquidaRestante,
          unidades_total: unidadesRestantes,
          dias_trabalhados: diasComplementares,
          arquivo_origem: arquivo.name,
        });

        if (existente) {
          complementados++;
          console.log(`🔀 ${r.nomeOficial}: já tinha ${existente.unidades}, complementando com ${unidadesRestantes}`);
        } else {
          novos++;
        }
      });

      if (registrosParaSalvar.length === 0) {
        setErro('Nenhum registro pra salvar — o histórico diário já cobre todo o mês.');
        setSalvando(false);
        return;
      }

      // 🗑️ Apaga registros mensais antigos do mesmo mês/processo (evita duplicatas)
      await supabase
        .from('produtividade_mensal')
        .delete()
        .eq('mes', mes)
        .eq('ano', ano)
        .eq('processo', processoSelecionado);

      // 💾 Insere os novos
      const { error: errInsert } = await supabase
        .from('produtividade_mensal')
        .insert(registrosParaSalvar);

      if (errInsert) throw new Error(errInsert.message);

      // Registra o upload
      const uploadId = 'UP-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      await supabase.from('uploads').insert({
        upload_id: uploadId,
        data_referencia: primeiroDia,
        tipo_base: processoSelecionado,
        arquivo: arquivo.name,
        linhas_processadas: linhas.length,
        linhas_vinculadas: processado.filter((r) => r.vinculado).length,
        usuario: 'delman.jpereira@mercadolivre.com',
        modelo_csv: 'mensal_consolidado',
      });

      setSucesso(
        `✅ CSV MENSAL salvo! ${registrosParaSalvar.length} registros: ${novos} novos, ${complementados} complementaram histórico, ${ignorados} ignorados (já tinha tudo).`
      );
      
      console.log('📆 RESUMO MENSAL:', { novos, complementados, ignorados, total: registrosParaSalvar.length });
    } catch (e: any) {
      setErro('Erro ao salvar: ' + e.message);
      console.error('❌ Erro mensal:', e);
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarEnvio() {
    if (!processado.length || !arquivo) return;
    console.log('💾 Confirmar envio clicado!');
    setSalvando(true);
    setErro(null);
    setSucesso(null);

    try {
      // 🎯 Apaga registros antigos do MESMO DIA + MESMO PROCESSO + MESMOS IDS
      // Isso evita duplicatas quando você sobe o CSV 2x do mesmo dia/processo
      const idsParaApagar = processado
        .filter((r) => r.idGroot)
        .map((r) => r.idGroot);
      
      if (idsParaApagar.length > 0) {
        const { error: errDelete } = await supabase
          .from('historico')
          .delete()
          .eq('data_referencia', dataRef)
          .eq('processo', processoSelecionado)
          .in('id_groot', idsParaApagar);
        
        if (errDelete) {
          console.error('Erro deletando duplicatas:', errDelete);
        } else {
          console.log(`🗑️ Limpou registros antigos: ${dataRef} + ${processoSelecionado} (${idsParaApagar.length} IDs)`);
        }
      }

      // Também apaga registros sem id_groot do mesmo dia/processo/arquivo
      await supabase
        .from('historico')
        .delete()
        .eq('data_referencia', dataRef)
        .eq('processo', processoSelecionado)
        .is('id_groot', null)
        .eq('arquivo_origem', arquivo.name);

      const dataObj = new Date(dataRef + 'T12:00:00');
      const mes = dataObj.getMonth() + 1;
      let quarter = 'Q1';
      if (mes >= 4 && mes <= 6) quarter = 'Q2';
      else if (mes >= 7 && mes <= 9) quarter = 'Q3';
      else if (mes >= 10) quarter = 'Q4';

      // Insere TODOS os registros (vinculados ou não)
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
      if (errInsert) throw new Error(errInsert.message);

      const uploadId = 'UP-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      await supabase.from('uploads').insert({
        upload_id: uploadId,
        data_referencia: dataRef,
        tipo_base: processoSelecionado,
        arquivo: arquivo.name,
        linhas_processadas: linhas.length,
        linhas_vinculadas: processado.filter((r) => r.vinculado).length,
        usuario: 'delman.jpereira@mercadolivre.com',
        modelo_csv: 'produtividade',
      });

      const vinc = processado.filter((r) => r.vinculado).length;
      const naoVinc = processado.length - vinc;

      let mensagem = `✅ ${processado.length} registros salvos no banco!`;
      if (vinc > 0) mensagem += ` (${vinc} já vinculados ao cadastro)`;
      if (naoVinc > 0)
        mensagem += ` ${naoVinc} aguardando cadastro — vincularão automaticamente quando você cadastrar essas pessoas.`;

      setSucesso(mensagem);

      setTimeout(() => {
        setArquivo(null);
        setLinhas([]);
        setProcessado([]);
        setProcessoSelecionado('');
        const input = document.getElementById('input-csv') as HTMLInputElement;
        if (input) input.value = '';
      }, 4000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      setErro(msg);
    } finally {
      setSalvando(false);
    }
  }

  const podeEnviar =
    linhas.length > 0 && processoSelecionado !== '' && Object.keys(metas).length > 0;

  const totalVinculados = processado.filter((r) => r.vinculado).length;
  const totalAguardando = processado.length - totalVinculados;

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
            <p className="text-xs text-gray-500 mt-1">
              ✨ Detectada automaticamente pelo nome do arquivo (se tiver data)
            </p>
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

      {/* BOTÃO ENVIAR */}
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
          <p className={colaboradores.length > 0 ? 'text-green-400' : 'text-yellow-400'}>
            {colaboradores.length > 0 ? '✅' : '⚠️'} Colaboradores cadastrados ({colaboradores.length})
            {colaboradores.length === 0 && ' — OK, vai salvar mesmo assim'}
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
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-bold text-[#FFD700]">
              3️⃣ Preview ({processado.length} registros)
            </h2>
            <span className={`text-xs px-3 py-1 rounded-full font-bold ${
              processoSelecionado === 'Checkin' ? 'bg-cyan-500/20 text-cyan-400' :
              processoSelecionado === 'P2M' ? 'bg-orange-500/20 text-orange-400' :
              'bg-emerald-500/20 text-emerald-400'
            }`}>
              {processoSelecionado}
            </span>
          </div>

          {/* Resumo vinculação */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
              <p className="text-xs text-green-400 font-bold mb-1">
                ✅ Já vinculados ao cadastro
              </p>
              <p className="text-2xl font-black text-white">{totalVinculados}</p>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <p className="text-xs text-blue-400 font-bold mb-1">
                ⏳ Aguardando cadastro
              </p>
              <p className="text-2xl font-black text-white">{totalAguardando}</p>
              {totalAguardando > 0 && (
                <p className="text-xs text-blue-300 mt-1">
                  Vão vincular automaticamente quando você cadastrar
                </p>
              )}
            </div>
          </div>

          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#1a1a1a]">
                <tr className="border-b border-[#2a2a2a] text-left text-xs text-gray-400">
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Nome</th>
                  <th className="py-2 pr-2">ID Groot</th>
                  <th className="py-2 pr-2 text-right">Líquida</th>
                  <th className="py-2 pr-2 text-right">Imp.NET</th>
                  <th className="py-2 pr-2">Meta</th>
                </tr>
              </thead>
              <tbody>
                {processado.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-b border-[#2a2a2a]">
                    <td className="py-2 pr-2">
                      {r.vinculado ? (
                        <span title="Vinculado" className="text-green-400">✅</span>
                      ) : (
                        <span title="Aguardando cadastro" className="text-blue-400">⏳</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-white">{r.nomeOficial}</td>
                    <td className="py-2 pr-2 text-gray-500 font-mono text-xs">{r.idGroot}</td>
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
            {processado.length > 20 && (
              <p className="text-gray-500 text-xs mt-2 text-center">
                ... e mais {processado.length - 20} registros
              </p>
            )}
          </div>

          {csvMensal ? (
            <button
              onClick={salvarMensal}
              disabled={salvando}
              className="w-full bg-purple-500 text-white font-bold py-4 rounded-lg hover:bg-purple-400 transition-colors text-lg disabled:opacity-50"
            >
              {salvando ? '💾 Salvando...' : `📆 Salvar CSV MENSAL (${csvMensal.mes}/${csvMensal.ano}) - ${processado.length} colabs`}
            </button>
          ) : (
            <button
              onClick={confirmarEnvio}
              disabled={salvando}
              className="w-full bg-green-500 text-white font-bold py-4 rounded-lg hover:bg-green-400 transition-colors text-lg disabled:opacity-50"
            >
              {salvando ? '💾 Salvando...' : `✅ Confirmar envio (${processado.length} registros)`}
            </button>
          )}
        </div>
      )}

      {/* Aviso CSV MENSAL detectado */}
      {csvMensal && (
        <div className="bg-purple-500/10 border-2 border-purple-500/40 rounded-2xl p-4 mb-4">
          <h3 className="text-purple-300 font-black text-base mb-2 flex items-center gap-2">
            📆 CSV MENSAL detectado!
          </h3>
          <p className="text-sm text-purple-200 mb-2">
            Esse CSV é do mês <strong>{String(csvMensal.mes).padStart(2, '0')}/{csvMensal.ano}</strong> ({csvMensal.trimestre}).
          </p>
          <ul className="text-xs text-purple-200/80 space-y-1 list-disc pl-5">
            <li>Os dados vão pra tabela <code className="bg-purple-500/20 px-1 rounded">produtividade_mensal</code> (não duplica o histórico diário)</li>
            <li>Se já tem dados diários do mês, o app <strong>subtrai</strong> e salva só o restante</li>
            <li>Usado apenas pra <strong>calibração</strong>, não aparece no detalhe diário do colaborador</li>
          </ul>
        </div>
      )}

      {/* Como funciona */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 text-sm text-blue-300">
        <p className="font-bold mb-2">💡 Como funciona a vinculação:</p>
        <ul className="space-y-1 list-disc pl-5 text-xs">
          <li>
            <strong>Todos</strong> os registros do CSV são salvos no banco, com nome
            e ID Groot do CSV.
          </li>
          <li>
            Se o colaborador <strong>já tá cadastrado</strong> em MEU TIME → aparece ✅
            (vinculado automaticamente).
          </li>
          <li>
            Se <strong>ainda não tá cadastrado</strong> → aparece ⏳ (aguardando). Os
            dados ficam guardados.
          </li>
          <li>
            Quando você <strong>cadastrar</strong> o colaborador com o mesmo ID
            Groot, o histórico antigo aparece automaticamente no perfil dele.
          </li>
        </ul>
      </div>
    </div>
  );
}
