'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';

type Colaborador = {
  id_groot: string;
  nome: string;
  processo: string;
  status: string;
};

type ImaSalvo = {
  id_groot: string;
  ima: number;
  atualizado_em: string;
};

type LinhaOcr = {
  nomeOcr: string;
  imaOcr: number;
  cadastroVinculado?: Colaborador;
  metodo?: 'exato' | 'fuzzy' | 'nao_vinculou';
  scoreMatch?: number;
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

export default function ImaManualPage() {
  const [modo, setModo] = useState<'manual' | 'print'>('manual');
  const [mesSelecionado, setMesSelecionado] = useState(5);
  const [anoSelecionado, setAnoSelecionado] = useState(2026);
  const [processoSelecionado, setProcessoSelecionado] = useState<'Checkin' | 'P2M'>('Checkin');
  
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [imasSalvos, setImasSalvos] = useState<Record<string, ImaSalvo>>({});
  const [imasEditando, setImasEditando] = useState<Record<string, string>>({});
  
  const [imagem, setImagem] = useState<string | null>(null);
  const [linhasOcr, setLinhasOcr] = useState<LinhaOcr[]>([]);
  const [processandoOcr, setProcessandoOcr] = useState(false);
  const [progressoOcr, setProgressoOcr] = useState(0);
  const [statusOcr, setStatusOcr] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const [montado, setMontado] = useState(false);

  const mesAtual = MESES.find((m) => m.num === mesSelecionado);
  const trimestre = mesAtual?.trim || 'Q1';

  useEffect(() => {
    const hoje = new Date();
    setMesSelecionado(hoje.getMonth() + 1);
    setAnoSelecionado(hoje.getFullYear());
    setMontado(true);
  }, []);

  useEffect(() => {
    if (montado) carregar();
  }, [mesSelecionado, anoSelecionado, processoSelecionado, montado]);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const { data: colabs, error: errColab } = await supabase
        .from('colaboradores')
        .select('id_groot, nome, processo, status')
        .eq('status', 'Ativo')
        .eq('processo', processoSelecionado)
        .order('nome');

      if (errColab) throw new Error(errColab.message);

      const vistos = new Set<string>();
      const unicos: Colaborador[] = [];
      (colabs || []).forEach((c: any) => {
        const chave = c.id_groot || c.nome;
        if (!vistos.has(chave)) {
          vistos.add(chave);
          unicos.push(c);
        }
      });
      setColaboradores(unicos);

      const { data: imas } = await supabase
        .from('ima_manual')
        .select('id_groot, ima, atualizado_em')
        .eq('mes', mesSelecionado)
        .eq('ano', anoSelecionado)
        .eq('processo', processoSelecionado);

      const mapa: Record<string, ImaSalvo> = {};
      const editandoMapa: Record<string, string> = {};
      (imas || []).forEach((i: any) => {
        mapa[i.id_groot] = i;
        editandoMapa[i.id_groot] = String(i.ima);
      });
      setImasSalvos(mapa);
      setImasEditando(editandoMapa);
    } catch (e: any) {
      setErro('Erro: ' + e.message);
    } finally {
      setCarregando(false);
    }
  }

  function formatarMilhar(valor: string | number): string {
    if (!valor) return '';
    const num = typeof valor === 'string' ? parseInt(valor.replace(/\D/g, '')) : valor;
    if (isNaN(num)) return '';
    return num.toLocaleString('pt-BR');
  }

  function handleChangeIma(idGroot: string, valor: string) {
    const limpo = valor.replace(/\D/g, '');
    setImasEditando({ ...imasEditando, [idGroot]: limpo });
  }

  async function salvarIndividual(idGroot: string) {
    const valor = imasEditando[idGroot]?.trim();
    const colab = colaboradores.find((c) => c.id_groot === idGroot);
    if (!colab) return;
    
    if (!valor) {
      const salvo = imasSalvos[idGroot];
      if (salvo) {
        await supabase.from('ima_manual').delete()
          .eq('id_groot', idGroot).eq('mes', mesSelecionado)
          .eq('ano', anoSelecionado).eq('processo', processoSelecionado);
        const novoSalvos = { ...imasSalvos };
        delete novoSalvos[idGroot];
        setImasSalvos(novoSalvos);
      }
      return;
    }
    
    const imaNum = parseInt(valor.replace(/\D/g, ''));
    if (isNaN(imaNum) || imaNum < 0) return;
    
    const salvo = imasSalvos[idGroot];
    if (salvo && Number(salvo.ima) === imaNum) return;
    
    try {
      const { error } = await supabase.from('ima_manual').upsert({
        id_groot: idGroot, nome: colab.nome, processo: processoSelecionado,
        mes: mesSelecionado, ano: anoSelecionado, trimestre, ima: imaNum,
        atualizado_em: new Date().toISOString(),
        atualizado_por: 'delman.jpereira@mercadolivre.com',
      }, { onConflict: 'id_groot,mes,ano,processo', ignoreDuplicates: false });
      
      if (error) throw new Error(error.message);
      
      setImasSalvos({
        ...imasSalvos,
        [idGroot]: { id_groot: idGroot, ima: imaNum, atualizado_em: new Date().toISOString() },
      });
      
      setMensagem(`✅ ${colab.nome}: ${imaNum.toLocaleString('pt-BR')} salvo!`);
      setTimeout(() => setMensagem(null), 2000);
    } catch (e: any) {
      setErro(`Erro: ${e.message}`);
      setTimeout(() => setErro(null), 4000);
    }
  }

  async function limparIma(idGroot: string) {
    if (!confirm('Apagar o IMA deste colaborador?')) return;
    try {
      await supabase.from('ima_manual').delete()
        .eq('id_groot', idGroot).eq('mes', mesSelecionado)
        .eq('ano', anoSelecionado).eq('processo', processoSelecionado);
      setImasEditando({ ...imasEditando, [idGroot]: '' });
      carregar();
    } catch (e: any) {
      setErro('Erro: ' + e.message);
    }
  }

  async function processarImagem(file: File) {
    setErro(null);
    setMensagem(null);
    setLinhasOcr([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      const imgBase64 = e.target?.result as string;
      setImagem(imgBase64);
      iniciarOcr(imgBase64);
    };
    reader.readAsDataURL(file);
  }

  async function iniciarOcr(imgBase64: string) {
    setProcessandoOcr(true);
    setProgressoOcr(0);
    setStatusOcr('Carregando OCR...');

    try {
      const Tesseract = (await import('tesseract.js')).default;
      setStatusOcr('Reconhecendo texto...');
      
      const resultado = await Tesseract.recognize(imgBase64, 'por', {
        logger: (m: any) => {
          if (m.status === 'recognizing text') setProgressoOcr(Math.round(m.progress * 100));
          if (m.status) setStatusOcr(m.status);
        },
      });

      const texto = resultado.data.text;
      console.log('📝 OCR:', texto);
      
      const linhas = extrairLinhasOcr(texto);
      const vinculadas = vincularLinhasOcr(linhas);
      
      setLinhasOcr(vinculadas);
      setStatusOcr('');
      
      const vinc = vinculadas.filter((l) => l.cadastroVinculado).length;
      setMensagem(`✅ ${vinculadas.length} linhas detectadas, ${vinc} vinculadas`);
    } catch (e: any) {
      setErro('Erro no OCR: ' + e.message);
    } finally {
      setProcessandoOcr(false);
    }
  }

  function extrairLinhasOcr(texto: string): LinhaOcr[] {
    const linhas: LinhaOcr[] = [];
    const blocos = texto.split('\n');

    blocos.forEach((linha, idx) => {
      const limpa = linha.trim();
      if (!limpa || limpa.length < 5) return;

      // 🎯 Acha TODOS os números da linha
      // Padrão aceita: 1.567, 1567, 1,567.50, 12.345
      const numerosMatches = Array.from(limpa.matchAll(/[\d]{1,3}(?:[.,][\d]{3})*(?:[.,][\d]+)?|\d+/g));
      
      if (numerosMatches.length === 0) return;
      
      // 🎯 Pega o ÚLTIMO número (que tá no canto direito da linha)
      const ultimoMatch = numerosMatches[numerosMatches.length - 1];
      const numStr = ultimoMatch[0].replace(/[.,]/g, '');
      const num = parseInt(numStr);
      
      // Valida o número
      if (isNaN(num) || num < 1 || num > 100000) return;
      
      // 🎯 Tudo ANTES do último número é considerado o NOME
      const posicaoUltimo = ultimoMatch.index || 0;
      const nome = limpa.substring(0, posicaoUltimo).trim()
        // Remove números intermediários que sobraram (deixa só letras)
        .replace(/\s+\d[\d.,]*\s*$/g, '')
        .trim();
      
      // Valida o nome
      if (nome.length < 3) return;
      if (!/[a-zA-ZÀ-ú]/.test(nome)) return;
      
      // Logs pra debug
      if (idx < 5) {
        console.log(`📝 Linha "${limpa}" → Nome: "${nome}" | IMA: ${num}`);
      }
      
      linhas.push({ nomeOcr: nome, imaOcr: num });
    });

    return linhas;
  }

    return linhas;
  }

  function vincularLinhasOcr(linhas: LinhaOcr[]): LinhaOcr[] {
    return linhas.map((linha) => {
      let melhorMatch: Colaborador | undefined;
      let melhorScore = 0;
      let metodo: 'exato' | 'fuzzy' | 'nao_vinculou' = 'nao_vinculou';

      for (const colab of colaboradores) {
        const { igual, score } = nomesIguais(linha.nomeOcr, colab.nome);
        if (score > melhorScore) {
          melhorScore = score;
          if (score === 1) {
            melhorMatch = colab;
            metodo = 'exato';
            break;
          } else if (igual) {
            melhorMatch = colab;
            metodo = 'fuzzy';
          }
        }
      }

      return { ...linha, cadastroVinculado: melhorMatch, metodo: melhorMatch ? metodo : 'nao_vinculou', scoreMatch: melhorScore };
    });
  }

  function trocarVinculo(idx: number, idGroot: string) {
    const colab = colaboradores.find((c) => c.id_groot === idGroot);
    const novas = [...linhasOcr];
    novas[idx].cadastroVinculado = colab;
    novas[idx].metodo = colab ? 'fuzzy' : 'nao_vinculou';
    setLinhasOcr(novas);
  }

  function editarImaOcr(idx: number, valor: string) {
    const num = parseInt(valor.replace(/\D/g, ''));
    const novas = [...linhasOcr];
    novas[idx].imaOcr = isNaN(num) ? 0 : num;
    setLinhasOcr(novas);
  }

  function removerLinhaOcr(idx: number) {
    setLinhasOcr(linhasOcr.filter((_, i) => i !== idx));
  }

  async function salvarOcr() {
    const vinculadas = linhasOcr.filter((l) => l.cadastroVinculado && l.imaOcr > 0);
    if (vinculadas.length === 0) {
      setErro('Nenhuma linha vinculada pra salvar');
      return;
    }

    setSalvando(true);
    setErro(null);

    try {
      const registros = vinculadas.map((l) => ({
        id_groot: l.cadastroVinculado!.id_groot,
        nome: l.cadastroVinculado!.nome,
        processo: processoSelecionado,
        mes: mesSelecionado, ano: anoSelecionado, trimestre, ima: l.imaOcr,
        atualizado_em: new Date().toISOString(),
        atualizado_por: 'delman.jpereira@mercadolivre.com',
      }));

      const { error } = await supabase.from('ima_manual').upsert(registros, {
        onConflict: 'id_groot,mes,ano,processo', ignoreDuplicates: false,
      });

      if (error) throw new Error(error.message);

      setMensagem(`✅ ${vinculadas.length} IMAs salvos! Imagem descartada.`);
      setImagem(null);
      setLinhasOcr([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      carregar();
    } catch (e: any) {
      setErro('Erro: ' + e.message);
    } finally {
      setSalvando(false);
    }
  }

  function cancelarOcr() {
    setImagem(null);
    setLinhasOcr([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      if (modo !== 'print') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            processarImagem(file);
            e.preventDefault();
            return;
          }
        }
      }
    }
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [modo, colaboradores]);

  function formatarTempo(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  const colabsFiltrados = colaboradores.filter((c) => {
    if (!filtro) return true;
    const termo = filtro.toLowerCase().trim();
    if (!termo) return true;
    const primeiroNome = c.nome.toLowerCase().split(' ')[0] || '';
    return primeiroNome.startsWith(termo);
  });

  const totalPreenchidos = Object.values(imasSalvos).length;
  const totalSalvaveisOcr = linhasOcr.filter((l) => l.cadastroVinculado && l.imaOcr > 0).length;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/meu-time" className="text-yellow-400 hover:underline text-sm">← Voltar</Link>
          <h1 className="text-3xl font-black mt-2 mb-1">
            ✏️ <span className="text-[#FFD700]">IMA Manual</span>
          </h1>
          <p className="text-gray-400 text-sm">Preencha manualmente ou via print do Looker.</p>
        </div>

        {/* Tabs */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-3 mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setModo('manual')}
              className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${
                modo === 'manual' ? 'bg-[#FFD700] text-black' : 'bg-[#0a0a0a] text-gray-400 hover:bg-[#2a2a2a]'
              }`}
            >
              ✏️ Preencher Manualmente
            </button>
            <button
              onClick={() => setModo('print')}
              className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${
                modo === 'print' ? 'bg-pink-500 text-white' : 'bg-[#0a0a0a] text-gray-400 hover:bg-[#2a2a2a]'
              }`}
            >
              📸 Subir Print (OCR)
            </button>
          </div>
        </div>

        {/* Período */}
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
                  className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${
                    processoSelecionado === 'Checkin' ? 'bg-cyan-500 text-white' : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a]'
                  }`}>Checkin</button>
                <button onClick={() => setProcessoSelecionado('P2M')}
                  className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${
                    processoSelecionado === 'P2M' ? 'bg-orange-500 text-white' : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a]'
                  }`}>P2M</button>
              </div>
            </div>
          </div>
          <div className="text-xs text-purple-300 bg-purple-500/10 border border-purple-500/40 rounded-lg p-2">
            📊 Trimestre: <strong>{trimestre} de {anoSelecionado}</strong>
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

        {/* MODO MANUAL */}
        {modo === 'manual' && (
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold">👥 Colaboradores {processoSelecionado}</h2>
                <p className="text-xs text-gray-400">{totalPreenchidos} de {colaboradores.length} preenchidos · {mesAtual?.label}/{anoSelecionado}</p>
              </div>
              <input type="text" placeholder="🔍 Buscar..." value={filtro} onChange={(e) => setFiltro(e.target.value)}
                className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white w-full md:w-64" />
            </div>

            {carregando ? (
              <div className="text-center py-8 text-gray-400">⏳ Carregando...</div>
            ) : colaboradores.length === 0 ? (
              <div className="text-center py-8 text-gray-400">Nenhum colaborador cadastrado</div>
            ) : (
              <>
                <div className="space-y-2">
                  {colabsFiltrados.map((c) => {
                    const salvo = imasSalvos[c.id_groot];
                    const valorAtual = imasEditando[c.id_groot] || '';
                    const temValor = !!salvo;
                    const valorMudou = salvo && String(salvo.ima) !== valorAtual;
                    
                    return (
                      <div key={c.id_groot}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                          temValor && !valorMudou ? 'bg-green-500/5 border-green-500/30' :
                          valorMudou ? 'bg-yellow-500/5 border-yellow-500/40' :
                          'bg-[#0a0a0a] border-[#2a2a2a]'
                        }`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-bold text-sm">{c.nome}</p>
                          <p className="text-xs text-gray-500 font-mono">ID: {c.id_groot}</p>
                          {salvo && <p className="text-[10px] text-green-400 mt-1">✅ Salvo: {salvo.ima.toLocaleString('pt-BR')} · {formatarTempo(salvo.atualizado_em)}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="text" inputMode="numeric" placeholder="0"
                            value={formatarMilhar(valorAtual)}
                            onChange={(e) => handleChangeIma(c.id_groot, e.target.value)}
                            onBlur={() => salvarIndividual(c.id_groot)}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            className={`w-28 text-right font-mono font-bold rounded-lg px-3 py-2 ${
                              temValor && !valorMudou ? 'bg-green-500/10 border border-green-500/40 text-green-300' :
                              valorMudou ? 'bg-yellow-500/10 border border-yellow-500/40 text-yellow-300' :
                              'bg-[#1a1a1a] border border-[#2a2a2a] text-white'
                            }`} />
                          {salvo && (
                            <button onClick={() => limparIma(c.id_groot)} className="text-red-400 hover:text-red-300 text-lg px-2">🗑️</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-6 flex gap-3">
                  <button onClick={() => carregar()} className="bg-[#0a0a0a] hover:bg-[#2a2a2a] border border-[#2a2a2a] text-white font-bold py-3 px-6 rounded-lg">🔄 Recarregar</button>
                  <p className="text-xs text-gray-500 self-center">💡 Salva ao sair do campo ou pressionar Enter</p>
                </div>
              </>
            )}
          </div>
        )}

        {/* MODO PRINT */}
        {modo === 'print' && (
          <>
            <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-bold mb-3">📸 Subir Print do Looker</h2>
              {!imagem ? (
                <div onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file && file.type.startsWith('image/')) processarImagem(file);
                  }}
                  className="border-2 border-dashed border-[#2a2a2a] hover:border-pink-400/40 rounded-xl p-12 text-center cursor-pointer transition-all bg-[#0a0a0a]">
                  <div className="text-6xl mb-3">📸</div>
                  <p className="text-white font-bold mb-1">Clique ou arraste a imagem</p>
                  <p className="text-xs text-gray-500">Funciona com <kbd className="bg-[#2a2a2a] px-2 py-0.5 rounded font-mono">Ctrl+V</kbd></p>
                  <p className="text-xs text-pink-300 mt-2">🔒 A imagem não vai pro banco</p>
                  <input ref={fileInputRef} type="file" accept="image/*"
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) processarImagem(file); }}
                    className="hidden" />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative max-h-64 overflow-auto bg-[#0a0a0a] rounded-lg border border-[#2a2a2a]">
                    <img src={imagem} alt="Print" className="w-full" />
                  </div>
                  <button onClick={cancelarOcr} className="text-red-400 hover:text-red-300 text-sm">🗑️ Descartar e recomeçar</button>
                </div>
              )}
              {processandoOcr && (
                <div className="mt-4 bg-[#0a0a0a] rounded-lg p-3">
                  <p className="text-cyan-300 text-sm mb-2">⏳ {statusOcr} ({progressoOcr}%)</p>
                  <div className="w-full bg-[#1a1a1a] rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-all" style={{ width: `${progressoOcr}%` }} />
                  </div>
                </div>
              )}
            </div>

            {linhasOcr.length > 0 && !processandoOcr && (
              <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-4">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                  <h2 className="text-lg font-bold">🔍 Revisar antes de salvar</h2>
                  <div className="flex gap-3 text-xs flex-wrap">
                    <span className="text-green-400">✅ {linhasOcr.filter((l) => l.metodo === 'exato').length}</span>
                    <span className="text-yellow-400">🔶 {linhasOcr.filter((l) => l.metodo === 'fuzzy').length}</span>
                    <span className="text-red-400">❌ {linhasOcr.filter((l) => l.metodo === 'nao_vinculou').length}</span>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  {linhasOcr.map((linha, idx) => {
                    const cor = linha.metodo === 'exato' ? 'bg-green-500/5 border-green-500/30' :
                      linha.metodo === 'fuzzy' ? 'bg-yellow-500/5 border-yellow-500/40' :
                      'bg-red-500/5 border-red-500/40';
                    return (
                      <div key={idx} className={`p-3 rounded-lg border ${cor} flex items-center gap-3 flex-wrap`}>
                        <span className="text-xl">{linha.metodo === 'exato' ? '✅' : linha.metodo === 'fuzzy' ? '🔶' : '❌'}</span>
                        <div className="flex-1 min-w-[150px]">
                          <p className="text-xs text-gray-500">OCR detectou:</p>
                          <p className="text-white font-mono text-xs truncate">{linha.nomeOcr}</p>
                        </div>
                        <div className="flex-1 min-w-[200px]">
                          <p className="text-xs text-gray-500">Vinculado a:</p>
                          <select value={linha.cadastroVinculado?.id_groot || ''}
                            onChange={(e) => trocarVinculo(idx, e.target.value)}
                            className={`w-full text-sm bg-[#0a0a0a] border rounded px-2 py-1 ${
                              linha.cadastroVinculado ? 'border-[#2a2a2a] text-white' : 'border-red-500/40 text-red-300'
                            }`}>
                            <option value="">— Não vinculado —</option>
                            {colaboradores.map((c) => <option key={c.id_groot} value={c.id_groot}>{c.nome}</option>)}
                          </select>
                        </div>
                        <div className="w-24">
                          <p className="text-xs text-gray-500">IMA:</p>
                          <input type="text" inputMode="numeric"
                            value={linha.imaOcr ? linha.imaOcr.toLocaleString('pt-BR') : ''}
                            onChange={(e) => editarImaOcr(idx, e.target.value)}
                            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-right font-mono text-sm text-white" />
                        </div>
                        <button onClick={() => removerLinhaOcr(idx)} className="text-red-400 hover:text-red-300 text-lg">🗑️</button>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-3 flex-wrap">
                  <button onClick={salvarOcr} disabled={salvando || totalSalvaveisOcr === 0}
                    className="bg-[#FFD700] hover:bg-yellow-400 text-black font-bold py-3 px-6 rounded-lg disabled:opacity-40">
                    {salvando ? '💾 Salvando...' : `💾 Salvar ${totalSalvaveisOcr} IMAs`}
                  </button>
                  <button onClick={cancelarOcr} className="bg-[#0a0a0a] hover:bg-[#2a2a2a] border border-[#2a2a2a] text-white font-bold py-3 px-6 rounded-lg">❌ Cancelar</button>
                </div>
              </div>
            )}
          </>
        )}

        <div className="bg-blue-500/10 border border-blue-500/40 rounded-xl p-4">
          <h3 className="text-blue-300 font-black text-base mb-2">💡 Como funciona:</h3>
          <ul className="text-xs text-blue-200/80 space-y-1 list-disc pl-5">
            <li><strong>Manual:</strong> digite o IMA, Tab/Enter salva automático</li>
            <li><strong>Via Print:</strong> sobe imagem, OCR extrai, você revisa e salva</li>
            <li>Vinculação: ✅ exato · 🔶 parcial · ❌ você seleciona</li>
            <li>🔒 Imagem processada local, <strong>nunca vai pro banco</strong></li>
            <li>Valores refletem na Calibração imediatamente</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
