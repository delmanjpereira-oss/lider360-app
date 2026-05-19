'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import Link from 'next/link';

type Colaborador = {
  id_groot: string;
  nome: string;
  processo: string;
  status: string;
};

type LinhaPrint = {
  nomeOcr: string;
  totalGeral: number;
  semanas: Record<number, number>;
  cadastroVinculado?: Colaborador;
  metodo?: 'exato' | 'fuzzy' | 'nao_vinculou';
  printNum: number;
};

type PrintInfo = {
  base64: string;
  textoBruto: string;
  processando: boolean;
  progresso: number;
  status: string;
};

const MESES = [
  { num: 1, label: 'Janeiro', trim: 'Q1' },
  { num: 2, label: 'Fevereiro', trim: 'Q1' },
  { num: 3, label: 'Março', trim: 'Q1' },
  { num: 4, label: 'Abril', trim: 'Q2' },
  { num: 5, label: 'Maio', trim: 'Q2' },
  { num: 6, label: 'Junho', trim: 'Q2' },
  { num: 7, label: 'Julho', trim: 'Q3' },
  { num: 8, label: 'Agosto', trim: 'Q3' },
  { num: 9, label: 'Setembro', trim: 'Q3' },
  { num: 10, label: 'Outubro', trim: 'Q4' },
  { num: 11, label: 'Novembro', trim: 'Q4' },
  { num: 12, label: 'Dezembro', trim: 'Q4' },
];

const PALAVRAS_CABECALHO = [
  'COMPLETO', 'NOVE', 'NUMERO',
  'CK', 'P2M', 'CHECK', 'NOME', 'REP', 'DPMO',
  'PROCESSO', 'COLUNA', 'LIN', 'PÁGINA', 'PAGINA',
];

function normalizarNome(nome: string): string {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function nomesIguais(a: string, b: string): { igual: boolean; score: number } {
  const na = normalizarNome(a);
  const nb = normalizarNome(b);
  if (!na || !nb) return { igual: false, score: 0 };
  if (na === nb) return { igual: true, score: 1 };

  const limpar = (s: string) =>
    s.split(' ').filter((p) => p.length > 1 && !['DA', 'DE', 'DO', 'DOS', 'DAS', 'E'].includes(p));
  const partesA = limpar(na);
  const partesB = limpar(nb);
  if (partesA.length === 0 || partesB.length === 0) return { igual: false, score: 0 };

  let comuns = 0;
  partesA.forEach((p) => { if (partesB.includes(p)) comuns++; });
  const minTamanho = Math.min(partesA.length, partesB.length);
  const score = comuns / minTamanho;
  return { igual: score >= 0.6, score };
}

function partesNome(nome: string): string[] {
  return normalizarNome(nome)
    .split(' ')
    .filter((p) => p.length > 1 && !['DA', 'DE', 'DO', 'DOS', 'DAS', 'E'].includes(p));
}

function detectarSemanas(texto: string): number[] {
  const semanas: number[] = [];
  const linhas = texto.split('\n');
  for (const linha of linhas) {
    const matches = Array.from(linha.matchAll(/[Ss]emana\s*(\d{1,2})/g));
    if (matches.length >= 2) {
      matches.forEach((m) => {
        const num = parseInt(m[1]);
        if (num >= 1 && num <= 53 && !semanas.includes(num)) semanas.push(num);
      });
      if (semanas.length > 0) break;
    }
  }
  console.log(`📅 Semanas detectadas: ${semanas.join(', ')}`);
  return semanas;
}

function extrairLinhasOcr(texto: string, semanas: number[], printNum: number): LinhaPrint[] {
  const linhas: LinhaPrint[] = [];
  const blocos = texto.split('\n');

  blocos.forEach((linha, idx) => {
    let limpa = linha.trim();
    if (!limpa || limpa.length < 5) return;

    const limpaUpper = limpa.toUpperCase();
    const ehCabecalho = PALAVRAS_CABECALHO.some((p) => limpaUpper.includes(p));
    if (ehCabecalho) return;
    if (/SEMANA\s*\d/i.test(limpa) && limpa.length < 80) return;
    if (/TOTAL\s*GERAL/i.test(limpa)) return;

    const regexNumero = /\b\d{1,3}(?:[.,]\d{3})+\b|\b\d{2,6}\b/g;
    const matches = Array.from(limpa.matchAll(regexNumero));
    if (matches.length === 0) return;

    const numeros: number[] = [];
    const posicoes: number[] = [];
    matches.forEach((m) => {
      const numStr = m[0].replace(/[.,]/g, '');
      const num = parseInt(numStr);
      if (!isNaN(num) && num >= 10 && num <= 100000) {
        numeros.push(num);
        posicoes.push(m.index || 0);
      }
    });
    if (numeros.length === 0) return;

    const totalGeral = numeros[numeros.length - 1];
    const posicaoPrimeiro = posicoes[0];

    let nome = limpa.substring(0, posicaoPrimeiro).trim();
    nome = nome.replace(/\.+/g, ''); // remove "..." e ".."
    nome = nome.replace(/[^a-zA-ZÀ-ú\s]/g, ' ').replace(/\s+/g, ' ').trim();
    nome = nome.replace(/\b(sm|em|eos|amo|asso)\b/gi, '').replace(/\s+/g, ' ').trim();
    // 🎯 Remove letras soltas (1 caractere) que são lixo do OCR
    nome = nome.split(' ').filter((p) => p.length >= 2).join(' ').trim();

    if (nome.length < 3) return;
    if (!/[a-zA-ZÀ-ú]{3,}/.test(nome)) return;

    const valoresSemanas = numeros.slice(0, -1);
    const semanasMap: Record<number, number> = {};
    valoresSemanas.forEach((valor, i) => {
      const semanaNum = semanas[i];
      if (semanaNum) semanasMap[semanaNum] = valor;
    });

    console.log(`✅ Print ${printNum}: "${nome}" | Sem: ${JSON.stringify(semanasMap)} | Total: ${totalGeral}`);
    linhas.push({ nomeOcr: nome, totalGeral, semanas: semanasMap, printNum });
  });

  return linhas;
}

export default function DpmoPage() {
  const [montado, setMontado] = useState(false);
  const [mesSelecionado, setMesSelecionado] = useState(5);
  const [anoSelecionado, setAnoSelecionado] = useState(2026);
  const [processoSelecionado, setProcessoSelecionado] = useState<'Checkin' | 'P2M'>('Checkin');
  
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [prints, setPrints] = useState<PrintInfo[]>([]);
  const [linhas, setLinhas] = useState<LinhaPrint[]>([]);
  const [semanasDetectadas, setSemanasDetectadas] = useState<number[]>([]);
  
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mesAtual = MESES.find((m) => m.num === mesSelecionado);
  const trimestre = mesAtual?.trim || 'Q1';

  useEffect(() => {
    const hoje = new Date();
    setMesSelecionado(hoje.getMonth() + 1);
    setAnoSelecionado(hoje.getFullYear());
    setMontado(true);
  }, []);

  useEffect(() => {
    if (montado) carregarColabs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processoSelecionado, montado]);

  async function carregarColabs() {
    const { data } = await supabase
      .from('colaboradores')
      .select('id_groot, nome, processo, status')
      .eq('status', 'Ativo')
      .eq('processo', processoSelecionado)
      .order('nome');
    
    if (data) {
      const vistos = new Set<string>();
      const unicos: Colaborador[] = [];
      data.forEach((c: any) => {
        if (!vistos.has(c.id_groot)) {
          vistos.add(c.id_groot);
          unicos.push(c);
        }
      });
      setColaboradores(unicos);
      console.log(`👥 ${unicos.length} colabs ${processoSelecionado} carregados:`, unicos.map((c) => c.nome));
    }
  }

  function adicionarPrint(file: File) {
    if (prints.length >= 3) {
      setErro('Máximo 3 prints por upload');
      return;
    }
    setErro(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      const idx = prints.length;
      setPrints((prev) => [...prev, {
        base64, textoBruto: '', processando: true, progresso: 0, status: 'Iniciando...',
      }]);
      processarOcr(base64, idx);
    };
    reader.readAsDataURL(file);
  }

  async function processarOcr(base64: string, idx: number) {
    try {
      const Tesseract = (await import('tesseract.js')).default;
      const resultado = await Tesseract.recognize(base64, 'por', {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            setPrints((prev) => {
              const novo = [...prev];
              if (novo[idx]) {
                novo[idx].progresso = Math.round(m.progress * 100);
                novo[idx].status = m.status;
              }
              return novo;
            });
          }
        },
      });

      const texto = resultado.data.text;
      console.log(`📝 OCR Print ${idx + 1}:`, texto);

      setPrints((prev) => {
        const novo = [...prev];
        if (novo[idx]) {
          novo[idx].textoBruto = texto;
          novo[idx].processando = false;
          novo[idx].progresso = 100;
          novo[idx].status = 'concluído';
        }
        // Re-processa todos os prints
        setTimeout(() => processarTodos(novo), 100);
        return novo;
      });
    } catch (e: any) {
      setErro('Erro no OCR: ' + e.message);
      setPrints((prev) => {
        const novo = [...prev];
        if (novo[idx]) novo[idx].processando = false;
        return novo;
      });
    }
  }

  function processarTodos(printsAtuais: PrintInfo[]) {
    let semanas: number[] = [];
    for (const p of printsAtuais) {
      if (!p.textoBruto) continue;
      const s = detectarSemanas(p.textoBruto);
      if (s.length > 0) {
        semanas = s;
        break;
      }
    }
    setSemanasDetectadas(semanas);

    const todasLinhas: LinhaPrint[] = [];
    printsAtuais.forEach((p, i) => {
      if (!p.textoBruto) return;
      const semanasUsar = semanas.length > 0 ? semanas : detectarSemanas(p.textoBruto);
      const linhasPrint = extrairLinhasOcr(p.textoBruto, semanasUsar, i + 1);
      todasLinhas.push(...linhasPrint);
    });

    // Dedupe por nome
    const linhasUnicas: LinhaPrint[] = [];
    const nomesVistos = new Set<string>();
    todasLinhas.forEach((l) => {
      const chave = normalizarNome(l.nomeOcr);
      if (!nomesVistos.has(chave)) {
        nomesVistos.add(chave);
        linhasUnicas.push(l);
      }
    });

    const vinculadas = vincular(linhasUnicas);
    setLinhas(vinculadas);
    
    const vinc = vinculadas.filter((l) => l.cadastroVinculado).length;
    setMensagem(`✅ ${vinculadas.length} colabs detectados, ${vinc} vinculados`);
  }

  function vincular(linhasInput: LinhaPrint[]): LinhaPrint[] {
    return linhasInput.map((linha) => {
      // Remove reticências e pontos do final dos nomes
      const nomeLimpo = linha.nomeOcr.replace(/\.+/g, '').trim();
      const partesOcr = partesNome(nomeLimpo);
      
      if (partesOcr.length === 0) {
        return { ...linha, cadastroVinculado: undefined, metodo: 'nao_vinculou' as const };
      }

      // 🎯 Helper: parte do OCR "casa" com parte do cadastro (aceita prefixo)
      function parteCasa(ocr: string, cadastro: string): boolean {
        if (ocr === cadastro) return true;
        if (ocr.length >= 3 && cadastro.startsWith(ocr)) return true;
        if (cadastro.length >= 3 && ocr.startsWith(cadastro)) return true;
        return false;
      }

      // 🎯 REGRA OBRIGATÓRIA: PRIMEIRO NOME do OCR TEM que bater com o PRIMEIRO do cadastro
      // Isso evita que "GABRIEL HENRIQUE" match com "HENRIQUE SILVA"
      const primeiroOcr = partesOcr[0];

      // Filtra colabs cujo PRIMEIRO nome bate com o primeiro do OCR
      const colabsComPrimeiroIgual = colaboradores.filter((c) => {
        const partesColab = partesNome(c.nome);
        if (partesColab.length === 0) return false;
        return parteCasa(primeiroOcr, partesColab[0]);
      });

      if (colabsComPrimeiroIgual.length === 0) {
        console.log(`❌ Primeiro nome "${primeiroOcr}" não existe: "${linha.nomeOcr}"`);
        return { ...linha, cadastroVinculado: undefined, metodo: 'nao_vinculou' as const };
      }

      // 🎯 ETAPA 1: Match perfeito - todas as partes do OCR batem com alguma do cadastro
      const matchExato = colabsComPrimeiroIgual.find((c) => {
        const partesColab = partesNome(c.nome);
        const todasOcrCasam = partesOcr.every((po) =>
          partesColab.some((pc) => parteCasa(po, pc))
        );
        const todasCadastroCasam = partesColab.every((pc) =>
          partesOcr.some((po) => parteCasa(po, pc))
        );
        return todasOcrCasam && todasCadastroCasam;
      });
      
      if (matchExato) {
        console.log(`✅ EXATO: "${linha.nomeOcr}" → ${matchExato.nome}`);
        return { ...linha, cadastroVinculado: matchExato, metodo: 'exato' as const };
      }

      // 🎯 ETAPA 2: Nome+Sobrenome (2 primeiros batem)
      if (partesOcr.length < 2) {
        console.log(`❌ "${linha.nomeOcr}" só tem 1 nome - ambíguo`);
        return { ...linha, cadastroVinculado: undefined, metodo: 'nao_vinculou' as const };
      }

      const segundoOcr = partesOcr[1];
      const candidatos = colabsComPrimeiroIgual.filter((c) => {
        const partesColab = partesNome(c.nome);
        if (partesColab.length < 2) return false;
        return parteCasa(segundoOcr, partesColab[1]);
      });

      if (candidatos.length === 1) {
        console.log(`✅ NOME+SOB: "${linha.nomeOcr}" → ${candidatos[0].nome}`);
        return { ...linha, cadastroVinculado: candidatos[0], metodo: 'fuzzy' as const };
      }

      // 🎯 ETAPA 3: Desempate pelo 3º nome
      if (candidatos.length > 1 && partesOcr.length >= 3) {
        const terceiroOcr = partesOcr[2];
        const desempate = candidatos.find((c) => {
          const partesColab = partesNome(c.nome);
          const t = partesColab[2] || '';
          return parteCasa(terceiroOcr, t);
        });
        if (desempate) {
          console.log(`✅ DESEMPATE: "${linha.nomeOcr}" → ${desempate.nome}`);
          return { ...linha, cadastroVinculado: desempate, metodo: 'fuzzy' as const };
        }
      }

      if (candidatos.length > 1) {
        console.log(`⚠️ AMBÍGUO: "${linha.nomeOcr}" → ${candidatos.length} candidatos com nome+sob`);
      } else {
        console.log(`❌ NÃO VINCULOU: "${linha.nomeOcr}"`);
      }
      return { ...linha, cadastroVinculado: undefined, metodo: 'nao_vinculou' as const };
    });
  }

  function trocarVinculo(idx: number, idGroot: string) {
    const colab = colaboradores.find((c) => c.id_groot === idGroot);
    const novas = [...linhas];
    novas[idx].cadastroVinculado = colab;
    novas[idx].metodo = colab ? 'fuzzy' : 'nao_vinculou';
    setLinhas(novas);
  }

  function editarSemana(linhaIdx: number, semana: number, valor: string) {
    const num = parseInt(valor.replace(/\D/g, ''));
    const novas = [...linhas];
    if (isNaN(num) || num === 0) {
      delete novas[linhaIdx].semanas[semana];
    } else {
      novas[linhaIdx].semanas[semana] = num;
    }
    setLinhas(novas);
  }

  function editarTotal(linhaIdx: number, valor: string) {
    const num = parseInt(valor.replace(/\D/g, ''));
    const novas = [...linhas];
    novas[linhaIdx].totalGeral = isNaN(num) ? 0 : num;
    setLinhas(novas);
  }

  function removerLinha(idx: number) {
    setLinhas(linhas.filter((_, i) => i !== idx));
  }

  function removerPrint(idx: number) {
    const novos = prints.filter((_, i) => i !== idx);
    setPrints(novos);
    setTimeout(() => processarTodos(novos), 100);
  }

  function descartarTudo() {
    setPrints([]);
    setLinhas([]);
    setSemanasDetectadas([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function salvarTudo() {
    const vinculadas = linhas.filter((l) => l.cadastroVinculado && l.totalGeral > 0);
    if (vinculadas.length === 0) {
      setErro('Nenhuma linha vinculada com Total Geral');
      return;
    }

    setSalvando(true);
    setErro(null);

    try {
      const procDpmo = processoSelecionado === 'Checkin' ? 'CK' : 'P2M';

      // 1) ima_manual (Total Geral)
      const registrosIma = vinculadas.map((l) => ({
        id_groot: l.cadastroVinculado!.id_groot,
        nome: l.cadastroVinculado!.nome,
        processo: processoSelecionado,
        mes: mesSelecionado,
        ano: anoSelecionado,
        trimestre,
        ima: l.totalGeral,
        atualizado_em: new Date().toISOString(),
        atualizado_por: 'delman.jpereira@mercadolivre.com',
      }));

      const { error: errIma } = await supabase.from('ima_manual').upsert(registrosIma, {
        onConflict: 'id_groot,mes,ano,processo',
        ignoreDuplicates: false,
      });
      if (errIma) throw new Error('ima_manual: ' + errIma.message);

      // 2) dpmo_agregado (Semanas) - APAGA e RECRIA
      const idsColabs = vinculadas.map((l) => l.cadastroVinculado!.id_groot);
      const semanasUsadas = new Set<number>();
      vinculadas.forEach((l) => {
        Object.keys(l.semanas).forEach((s) => semanasUsadas.add(Number(s)));
      });

      if (semanasUsadas.size > 0) {
        const { error: errDel } = await supabase
          .from('dpmo_agregado')
          .delete()
          .in('id_groot', idsColabs)
          .in('semana', Array.from(semanasUsadas))
          .eq('ano', anoSelecionado)
          .eq('processo', procDpmo);
        if (errDel) console.warn('Erro apagando antigo:', errDel);
      }

      const registrosDpmo: any[] = [];
      vinculadas.forEach((l) => {
        Object.entries(l.semanas).forEach(([semStr, valor]) => {
          const semana = Number(semStr);
          if (valor > 0) {
            registrosDpmo.push({
              id_groot: l.cadastroVinculado!.id_groot,
              representante: l.cadastroVinculado!.nome,
              processo: procDpmo,
              semana,
              ano: anoSelecionado,
              trimestre,
              dpmo: valor,
            });
          }
        });
      });

      if (registrosDpmo.length > 0) {
        const { error: errDpmo } = await supabase.from('dpmo_agregado').insert(registrosDpmo);
        if (errDpmo) throw new Error('dpmo_agregado: ' + errDpmo.message);
      }

      setMensagem(`✅ Salvo! ${vinculadas.length} IMAs + ${registrosDpmo.length} semanais. Imagens descartadas.`);
      descartarTudo();
    } catch (e: any) {
      setErro('Erro ao salvar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            adicionarPrint(file);
            e.preventDefault();
            return;
          }
        }
      }
    }
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prints]);

  const totalSalvaveis = linhas.filter((l) => l.cadastroVinculado && l.totalGeral > 0).length;
  const todosProcessados = prints.length > 0 && prints.every((p) => !p.processando);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/meu-time" className="text-yellow-400 hover:underline text-sm">← Voltar</Link>
          <h1 className="text-3xl font-black mt-2 mb-1">
            📊 <span className="text-[#FFD700]">DPMO via Print</span>
          </h1>
          <p className="text-gray-400 text-sm">Sobe até 3 prints do Looker → app extrai Nome + Semanas + Total Geral.</p>
        </div>

        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-4">
          <h2 className="text-lg font-bold mb-3">📅 Período</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-500 uppercase mb-1 block">Mês</label>
              <select value={mesSelecionado} onChange={(e) => setMesSelecionado(Number(e.target.value))}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white">
                {MESES.map((m) => <option key={m.num} value={m.num}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase mb-1 block">Ano</label>
              <select value={anoSelecionado} onChange={(e) => setAnoSelecionado(Number(e.target.value))}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white">
                {[2024, 2025, 2026, 2027].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase mb-1 block">Processo</label>
              <div className="flex gap-2">
                <button onClick={() => setProcessoSelecionado('Checkin')}
                  className={`flex-1 py-2 rounded-lg font-bold text-sm ${
                    processoSelecionado === 'Checkin' ? 'bg-cyan-500 text-white' : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a]'
                  }`}>Checkin</button>
                <button onClick={() => setProcessoSelecionado('P2M')}
                  className={`flex-1 py-2 rounded-lg font-bold text-sm ${
                    processoSelecionado === 'P2M' ? 'bg-orange-500 text-white' : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a]'
                  }`}>P2M</button>
              </div>
            </div>
          </div>
          <div className="text-xs text-purple-300 bg-purple-500/10 border border-purple-500/40 rounded-lg p-2">
            📊 Trimestre: <strong>{trimestre} de {anoSelecionado}</strong>
            {semanasDetectadas.length > 0 && (
              <span className="ml-3">· Semanas: <strong>{semanasDetectadas.join(', ')}</strong></span>
            )}
          </div>
        </div>

        {mensagem && (
          <div className="bg-green-500/10 border border-green-500/40 rounded-xl p-4 mb-4">
            <p className="text-green-300 text-sm font-bold">{mensagem}</p>
          </div>
        )}
        {erro && (
          <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 mb-4">
            <p className="text-red-300 text-sm font-bold">{erro}</p>
          </div>
        )}

        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">📸 Prints ({prints.length}/3)</h2>
            {prints.length > 0 && (
              <button onClick={descartarTudo} className="text-red-400 hover:text-red-300 text-sm">🗑️ Descartar tudo</button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {prints.map((p, i) => (
              <div key={i} className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-400">📸 Print {i + 1}</span>
                  <button onClick={() => removerPrint(i)} className="text-red-400 hover:text-red-300 text-sm">🗑️</button>
                </div>
                <img src={p.base64} alt="" className="w-full h-32 object-cover rounded mb-2" />
                {p.processando ? (
                  <div>
                    <p className="text-xs text-cyan-400">⏳ {p.status} ({p.progresso}%)</p>
                    <div className="w-full bg-[#1a1a1a] rounded h-1 mt-1 overflow-hidden">
                      <div className="h-full bg-cyan-500 transition-all" style={{ width: `${p.progresso}%` }} />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-green-400">✅ Processado</p>
                )}
              </div>
            ))}
            
            {prints.length < 3 && (
              <div onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file?.type.startsWith('image/')) adicionarPrint(file);
                }}
                className="border-2 border-dashed border-[#2a2a2a] hover:border-pink-400/40 rounded-lg p-6 text-center cursor-pointer bg-[#0a0a0a] flex flex-col items-center justify-center min-h-[150px]">
                <div className="text-4xl mb-2">📸</div>
                <p className="text-sm text-white font-bold">Adicionar print</p>
                <p className="text-xs text-gray-500">ou Ctrl+V</p>
                <input ref={fileInputRef} type="file" accept="image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) adicionarPrint(f); }}
                  className="hidden" />
              </div>
            )}
          </div>

          <p className="text-xs text-pink-300 mt-3">🔒 As imagens não vão pro banco - são descartadas após salvar.</p>
        </div>

        {linhas.length > 0 && todosProcessados && (
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-4">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-lg font-bold">🔍 Revisar antes de salvar ({linhas.length})</h2>
              <div className="flex gap-3 text-xs">
                <span className="text-green-400">✅ {linhas.filter((l) => l.metodo === 'exato').length}</span>
                <span className="text-yellow-400">🔶 {linhas.filter((l) => l.metodo === 'fuzzy').length}</span>
                <span className="text-red-400">❌ {linhas.filter((l) => l.metodo === 'nao_vinculou').length}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-400 border-b border-[#2a2a2a]">
                  <tr>
                    <th className="text-center py-2 px-2">St</th>
                    <th className="text-left py-2 px-2">Vínculo</th>
                    {semanasDetectadas.map((s) => (
                      <th key={s} className="text-center py-2 px-1 min-w-[70px]">S{s}</th>
                    ))}
                    <th className="text-center py-2 px-2 bg-green-500/10 min-w-[80px]">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((linha, idx) => {
                    const cor = linha.metodo === 'exato' ? 'bg-green-500/5' :
                      linha.metodo === 'fuzzy' ? 'bg-yellow-500/5' :
                      'bg-red-500/5';
                    return (
                      <tr key={idx} className={`border-b border-[#2a2a2a] ${cor}`}>
                        <td className="py-2 px-2 text-center text-lg">
                          {linha.metodo === 'exato' ? '✅' : linha.metodo === 'fuzzy' ? '🔶' : '❌'}
                        </td>
                        <td className="py-2 px-2 min-w-[200px]">
                          <p className="text-gray-400 text-[10px] truncate">OCR: {linha.nomeOcr}</p>
                          <select value={linha.cadastroVinculado?.id_groot || ''}
                            onChange={(e) => trocarVinculo(idx, e.target.value)}
                            className={`w-full bg-[#0a0a0a] border rounded px-1 py-1 text-xs ${
                              linha.cadastroVinculado ? 'border-[#2a2a2a] text-white' : 'border-red-500/40 text-red-300'
                            }`}>
                            <option value="">— Não vinculado —</option>
                            {colaboradores.map((c) => <option key={c.id_groot} value={c.id_groot}>{c.nome}</option>)}
                          </select>
                        </td>
                        {semanasDetectadas.map((s) => (
                          <td key={s} className="py-2 px-1 text-center">
                            <input type="text" inputMode="numeric"
                              value={linha.semanas[s] ? linha.semanas[s].toLocaleString('pt-BR') : ''}
                              onChange={(e) => editarSemana(idx, s, e.target.value)}
                              className="w-16 bg-[#0a0a0a] border border-[#2a2a2a] rounded px-1 py-1 text-right font-mono text-xs text-white"
                              placeholder="-" />
                          </td>
                        ))}
                        <td className="py-2 px-2 text-center bg-green-500/10">
                          <input type="text" inputMode="numeric"
                            value={linha.totalGeral ? linha.totalGeral.toLocaleString('pt-BR') : ''}
                            onChange={(e) => editarTotal(idx, e.target.value)}
                            className="w-20 bg-[#0a0a0a] border border-green-500/30 rounded px-1 py-1 text-right font-mono text-xs text-green-300 font-bold" />
                        </td>
                        <td className="py-2 px-1">
                          <button onClick={() => removerLinha(idx)} className="text-red-400 hover:text-red-300">🗑️</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3 flex-wrap mt-4">
              <button onClick={salvarTudo} disabled={salvando || totalSalvaveis === 0}
                className="bg-[#FFD700] hover:bg-yellow-400 text-black font-bold py-3 px-6 rounded-lg disabled:opacity-40">
                {salvando ? '💾 Salvando...' : `💾 Salvar ${totalSalvaveis} colabs (Total + Semanas)`}
              </button>
              <button onClick={descartarTudo} className="bg-[#0a0a0a] hover:bg-[#2a2a2a] border border-[#2a2a2a] text-white font-bold py-3 px-6 rounded-lg">
                ❌ Cancelar
              </button>
            </div>
          </div>
        )}

        {prints.some((p) => p.textoBruto) && (
          <details className="bg-[#1a1a1a] border border-orange-500/30 rounded-xl p-4 mb-4">
            <summary className="cursor-pointer text-orange-300 font-bold text-sm">🐛 Debug — texto bruto dos prints</summary>
            <div className="mt-3 space-y-3">
              {prints.map((p, i) => p.textoBruto && (
                <div key={i}>
                  <p className="text-xs text-orange-300 mb-1">📸 Print {i + 1}:</p>
                  <pre className="bg-[#0a0a0a] p-2 rounded text-xs text-orange-100 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">{p.textoBruto}</pre>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="bg-blue-500/10 border border-blue-500/40 rounded-xl p-4">
          <h3 className="text-blue-300 font-black text-base mb-2">💡 Como funciona:</h3>
          <ul className="text-xs text-blue-200/80 space-y-1 list-disc pl-5">
            <li>Tira até <strong>3 prints</strong> do Looker cobrindo todos os colabs</li>
            <li>Sobe via clique, drag&drop ou Ctrl+V</li>
            <li>OCR detecta: nome, valores das semanas e total geral</li>
            <li>Você revisa, ajusta se necessário e salva</li>
            <li>Salva: <strong>Total → ima_manual</strong> · <strong>Semanas → dpmo_agregado</strong></li>
            <li>Novo upload <strong>substitui</strong> os valores existentes</li>
            <li>🔒 Imagens descartadas após salvar</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
