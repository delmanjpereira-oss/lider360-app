'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import Link from 'next/link';
import { useToast } from '../../components/ToastProvider';
import ApolloBadge from '../../components/ApolloBadge';
import LoadingOverlay, { Fase } from '../../components/LoadingOverlay';
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
  mimeType: string;
  processando: boolean;
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
function normalizarNome(nome: string): string {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}
function partesNome(nome: string): string[] {
  return normalizarNome(nome)
    .split(' ')
    .filter((p) => p.length > 1 && !['DA', 'DE', 'DO', 'DOS', 'DAS', 'E'].includes(p));
}
export default function DpmoPage() {
  const toast = useToast();
  const [montado, setMontado] = useState(false);
  const [mesSelecionado, setMesSelecionado] = useState(5);
  const [anoSelecionado, setAnoSelecionado] = useState(2026);
  const [processoSelecionado, setProcessoSelecionado] = useState<'Checkin' | 'P2M'>('Checkin');
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const colaboradoresRef = useRef<Colaborador[]>([]);
  useEffect(() => { colaboradoresRef.current = colaboradores; }, [colaboradores]);
  const [prints, setPrints] = useState<PrintInfo[]>([]);
  const [linhas, setLinhas] = useState<LinhaPrint[]>([]);
  const [semanasDetectadas, setSemanasDetectadas] = useState<number[]>([]);
  const [processandoIA, setProcessandoIA] = useState(false);
  const [tokensGastos, setTokensGastos] = useState<{ input: number; output: number } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [fase, setFase] = useState<Fase>(null);
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
  useEffect(() => {
    if (colaboradores.length === 0 || linhas.length === 0) return;
    const linhasSemVinculo = linhas.filter((l) => !l.cadastroVinculado).length;
    if (linhasSemVinculo === 0) return;
    const revinculadas = vincular(linhas);
    setLinhas(revinculadas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colaboradores.length]);
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
        if (!vistos.has(c.id_groot)) { vistos.add(c.id_groot); unicos.push(c); }
      });
      setColaboradores(unicos);
      console.log(`👥 ${unicos.length} colabs ${processoSelecionado} carregados`);
    }
  }
  function adicionarPrint(file: File) {
    if (prints.length >= 3) { toast.error('Limite atingido', 'Máximo 3 prints por upload'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      const mimeType = file.type || 'image/png';
      setPrints((prev) => [...prev, { base64, mimeType, processando: false, status: 'aguardando' }]);
    };
    reader.readAsDataURL(file);
  }
  async function lerComIA() {
    if (prints.length === 0) { toast.error('Sem prints', 'Adicione ao menos 1 print'); return; }
    setProcessandoIA(true);
    setFase('lendo');
    setLinhas([]);
    setSemanasDetectadas([]);
    setTokensGastos(null);
    try {
      const resp = await fetch('/api/ia/ler-dpmo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagens: prints.map((p) => ({ base64: p.base64, mimeType: p.mimeType })),
          mes: mesSelecionado,
          ano: anoSelecionado,
          processo: processoSelecionado,
        }),
      });
      const data = await resp.json();
      if (!data.sucesso) {
        toast.error('Erro na IA', data.erro || 'Falha desconhecida');
        return;
      }
      if (data.tokens) setTokensGastos(data.tokens);
      const semanas: number[] = data.semanas || [];
      const colabs: any[] = data.colaboradores || [];
      setSemanasDetectadas(semanas);
      const linhasBrutas: LinhaPrint[] = colabs.map((c) => {
        const semanasMap: Record<number, number> = {};
        Object.entries(c.semanas || {}).forEach(([sem, valor]) => {
          const semNum = parseInt(sem);
          const val = typeof valor === 'number' ? valor : null;
          if (val !== null && val > 0) semanasMap[semNum] = val;
        });
        return { nomeOcr: c.nome || '', totalGeral: c.total_geral || 0, semanas: semanasMap, printNum: 1 };
      });
      const linhasValidas = linhasBrutas.filter((l) => l.nomeOcr.length >= 3);
      const vinculadas = vincular(linhasValidas);
      setLinhas(vinculadas);
      const vinc = vinculadas.filter((l) => l.cadastroVinculado).length;
      toast.success(`${vinculadas.length} colabs lidos pela IA`, `${vinc} vinculados ao cadastro`);
    } catch (e: any) {
      console.error('❌ Erro chamando IA:', e);
      toast.error('Erro', e.message);
    } finally {
      setProcessandoIA(false);
      setFase(null);
    }
  }
  function vincular(linhasInput: LinhaPrint[]): LinhaPrint[] {
    const colabs = colaboradoresRef.current;
    if (colabs.length === 0) {
      return linhasInput.map((l) => ({ ...l, cadastroVinculado: undefined, metodo: 'nao_vinculou' as const }));
    }
    return linhasInput.map((linha) => {
      const nomeLimpo = linha.nomeOcr.replace(/\.+/g, '').trim();
      const partesOcr = partesNome(nomeLimpo);
      if (partesOcr.length === 0) return { ...linha, cadastroVinculado: undefined, metodo: 'nao_vinculou' as const };
      const normalOcr = normalizarNome(nomeLimpo);
      const matchTotal = colabs.find((c) => normalizarNome(c.nome) === normalOcr);
      if (matchTotal) return { ...linha, cadastroVinculado: matchTotal, metodo: 'exato' as const };
      function parteCasa(ocr: string, cadastro: string): boolean {
        const o = String(ocr || '').toUpperCase().trim();
        const c = String(cadastro || '').toUpperCase().trim();
        if (!o || !c) return false;
        if (o === c) return true;
        if (o.length >= 3 && c.startsWith(o)) return true;
        if (c.length >= 3 && o.startsWith(c)) return true;
        return false;
      }
      const primeiroOcr = partesOcr[0];
      const colabsComPrimeiroIgual = colabs.filter((c) => {
        const partesColab = partesNome(c.nome);
        if (partesColab.length === 0) return false;
        return parteCasa(primeiroOcr, partesColab[0]);
      });
      if (colabsComPrimeiroIgual.length === 0) return { ...linha, cadastroVinculado: undefined, metodo: 'nao_vinculou' as const };
      const matchExato = colabsComPrimeiroIgual.find((c) => {
        const partesColab = partesNome(c.nome);
        const todasOcrCasam = partesOcr.every((po) => partesColab.some((pc) => parteCasa(po, pc)));
        const todasCadastroCasam = partesColab.every((pc) => partesOcr.some((po) => parteCasa(po, pc)));
        return todasOcrCasam && todasCadastroCasam;
      });
      if (matchExato) return { ...linha, cadastroVinculado: matchExato, metodo: 'exato' as const };
      if (partesOcr.length < 2) return { ...linha, cadastroVinculado: undefined, metodo: 'nao_vinculou' as const };
      const segundoOcr = partesOcr[1];
      const candidatos = colabsComPrimeiroIgual.filter((c) => {
        const partesColab = partesNome(c.nome);
        if (partesColab.length < 2) return false;
        return parteCasa(segundoOcr, partesColab[1]);
      });
      if (candidatos.length === 1) return { ...linha, cadastroVinculado: candidatos[0], metodo: 'fuzzy' as const };
      if (candidatos.length > 1 && partesOcr.length >= 3) {
        const terceiroOcr = partesOcr[2];
        const desempate = candidatos.find((c) => {
          const partesColab = partesNome(c.nome);
          return parteCasa(terceiroOcr, partesColab[2] || '');
        });
        if (desempate) return { ...linha, cadastroVinculado: desempate, metodo: 'fuzzy' as const };
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
    if (isNaN(num) || num === 0) delete novas[linhaIdx].semanas[semana];
    else novas[linhaIdx].semanas[semana] = num;
    setLinhas(novas);
  }
  function editarTotal(linhaIdx: number, valor: string) {
    const num = parseInt(valor.replace(/\D/g, ''));
    const novas = [...linhas];
    novas[linhaIdx].totalGeral = isNaN(num) ? 0 : num;
    setLinhas(novas);
  }
  function removerLinha(idx: number) { setLinhas(linhas.filter((_, i) => i !== idx)); }
  function removerPrint(idx: number) {
    setPrints(prints.filter((_, i) => i !== idx));
    setLinhas([]);
    setSemanasDetectadas([]);
  }
  function descartarTudo() {
    setPrints([]);
    setLinhas([]);
    setSemanasDetectadas([]);
    setTokensGastos(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }
  // ============================================
  // SALVAR — com deduplicação pra evitar
  // "ON CONFLICT DO UPDATE command cannot affect row a second time"
  // (acontece quando a IA retorna o mesmo colab duplicado)
  // ============================================
  async function salvarTudo() {
    const vinculadas = linhas.filter((l) => l.cadastroVinculado && l.totalGeral > 0);
    if (vinculadas.length === 0) { toast.error('Nada pra salvar', 'Nenhum colab vinculado'); return; }
    setSalvando(true);
    setFase('salvando');
    console.log('💾 INICIANDO SALVAMENTO —', vinculadas.length, 'colabs');
    try {
      const procDpmo = processoSelecionado === 'Checkin' ? 'CK' : 'P2M';
      // 1) ima_manual — deduplicar pela chave do onConflict (id_groot+mes+ano+processo)
      const imaRaw = vinculadas.map((l) => ({
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
      const imaMap = new Map<string, typeof imaRaw[0]>();
      imaRaw.forEach((r) => imaMap.set(`${r.id_groot}|${r.mes}|${r.ano}|${r.processo}`, r));
      const registrosIma = Array.from(imaMap.values());
      console.log('📋 ima_manual:', registrosIma.length, 'registros (após dedup)');
      const { error: errIma } = await supabase
        .from('ima_manual')
        .upsert(registrosIma, { onConflict: 'id_groot,mes,ano,processo', ignoreDuplicates: false })
        .select();
      if (errIma) throw new Error('ima_manual: ' + errIma.message);
      // 2) dpmo_agregado — deduplicar pela chave_unica
      const dpmoRaw: any[] = [];
      vinculadas.forEach((l) => {
        Object.entries(l.semanas).forEach(([semStr, valor]) => {
          const semana = Number(semStr);
          if (valor > 0) {
            dpmoRaw.push({
              chave_unica: `${l.cadastroVinculado!.nome}|${procDpmo}|${semana}|${anoSelecionado}`,
              id_groot: l.cadastroVinculado!.id_groot,
              representante: l.cadastroVinculado!.nome,
              processo: procDpmo,
              semana,
              ano: anoSelecionado,
              mes: mesSelecionado,
              trimestre,
              dpmo: valor,
              arquivo_origem: 'print_ia',
            });
          }
        });
      });
      const dpmoMap = new Map<string, any>();
      dpmoRaw.forEach((r) => dpmoMap.set(r.chave_unica, r));
      const registrosDpmo = Array.from(dpmoMap.values());
      console.log('📋 dpmo_agregado:', registrosDpmo.length, 'registros (após dedup)');
      if (registrosDpmo.length > 0) {
        const { error: errDpmo } = await supabase
          .from('dpmo_agregado')
          .upsert(registrosDpmo, { onConflict: 'chave_unica', ignoreDuplicates: false })
          .select();
        if (errDpmo) throw new Error('dpmo_agregado: ' + errDpmo.message);
      }
      // 3) log de uploads (silencioso)
      try {
        await supabase.from('uploads').insert({
          arquivo: `Print IA (Claude Vision) - ${prints.length} imagem(ns) - ${mesAtual?.label}/${anoSelecionado}`,
          tabela: 'ima_manual + dpmo_agregado',
          linhas: registrosIma.length + registrosDpmo.length,
          data: new Date().toISOString(),
          modelo_csv: 'print_ia',
        });
      } catch {}
      // sucesso
      setFase('sucesso');
      toast.success(`${registrosIma.length} colabs salvos!`, `${registrosDpmo.length} registros semanais atualizados`);
      setTimeout(() => { setFase(null); descartarTudo(); }, 2200);
    } catch (e: any) {
      console.error('❌ Erro ao salvar:', e);
      // some o overlay ANTES de mostrar o toast (evita toast ficar atrás do overlay)
      setFase(null);
      await new Promise((r) => setTimeout(r, 150));
      toast.error('Erro ao salvar', e.message || String(e));
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
          if (file) { adicionarPrint(file); e.preventDefault(); return; }
        }
      }
    }
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prints]);
  const totalSalvaveis = linhas.filter((l) => l.cadastroVinculado && l.totalGeral > 0).length;
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <LoadingOverlay
        fase={fase}
        lendoTitulo="Claude Vision lendo os prints..."
        lendoSub="Extraindo nomes, semanas e IMA (uns 5-10s)"
        salvandoTitulo="Salvando DPMO..."
        salvandoSub="Gravando IMA e semanas no banco"
        sucessoTitulo="Salvo!"
        sucessoSub="DPMO e IMA atualizados"
      />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/meu-time" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            ← Voltar ao Meu Time
          </Link>
          <h1 className="text-3xl md:text-4xl font-black mt-2">
            Upload de <span className="text-[#FFD700]">DPMO</span>
            <span className="text-xs ml-3 bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full font-normal">🤖 IA Vision</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">Suba até 3 prints do Looker · Claude Vision lê e extrai os dados</p>
        </div>
        <ApolloBadge
          mood="info"
          message="Nova versão com IA"
          detail="Cole os prints (Ctrl+V) · Click em 'Ler com IA' · Claude extrai nomes, semanas e IMA · Você revisa e salva"
        />
        {/* PERÍODO */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-4">
          <h2 className="text-lg font-bold mb-3">📅 Período</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-500 uppercase mb-1 block">Mês</label>
              <select value={mesSelecionado} onChange={(e) => setMesSelecionado(Number(e.target.value))} className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white">
                {MESES.map((m) => <option key={m.num} value={m.num}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase mb-1 block">Ano</label>
              <select value={anoSelecionado} onChange={(e) => setAnoSelecionado(Number(e.target.value))} className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white">
                {[2024, 2025, 2026, 2027].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase mb-1 block">Processo</label>
              <div className="flex gap-2">
                <button onClick={() => setProcessoSelecionado('Checkin')} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all active:scale-95 ${processoSelecionado === 'Checkin' ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30' : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a] hover:border-cyan-500/40'}`}>Checkin</button>
                <button onClick={() => setProcessoSelecionado('P2M')} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all active:scale-95 ${processoSelecionado === 'P2M' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a] hover:border-orange-500/40'}`}>P2M</button>
              </div>
            </div>
          </div>
          <div className="text-xs text-purple-300 bg-purple-500/10 border border-purple-500/40 rounded-lg p-2">
            📊 Trimestre: <strong>{trimestre} de {anoSelecionado}</strong>
            {semanasDetectadas.length > 0 && <span className="ml-3">· Semanas: <strong>{semanasDetectadas.join(', ')}</strong></span>}
          </div>
        </div>
        {/* PRINTS */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-4">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-bold">📸 Prints ({prints.length}/3)</h2>
            <div className="flex gap-2">
              {prints.length > 0 && !processandoIA && (
                <>
                  <button onClick={lerComIA} disabled={processandoIA} className="group bg-gradient-to-br from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 text-white font-black py-2 px-4 rounded-lg text-sm shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all duration-150 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 flex items-center gap-2">
                    <span className="group-hover:scale-110 transition-transform">🧠</span> Ler com IA
                  </button>
                  <button onClick={descartarTudo} className="text-red-400 hover:text-red-300 text-sm transition-colors">🗑️ Descartar</button>
                </>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {prints.map((p, i) => (
              <div key={i} className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-400">📸 Print {i + 1}</span>
                  <button onClick={() => removerPrint(i)} disabled={processandoIA} className="text-red-400 hover:text-red-300 text-sm disabled:opacity-50">🗑️</button>
                </div>
                <img src={p.base64} alt="" className="w-full h-32 object-cover rounded" />
              </div>
            ))}
            {prints.length < 3 && !processandoIA && (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file?.type.startsWith('image/')) adicionarPrint(file); }}
                className="group border-2 border-dashed border-[#2a2a2a] hover:border-purple-400/60 rounded-lg p-6 text-center cursor-pointer bg-[#0a0a0a] flex flex-col items-center justify-center min-h-[150px] transition-all duration-300 hover:bg-purple-500/5 hover:shadow-[0_0_25px_rgba(168,85,247,0.15)] active:scale-[0.98]"
              >
                <div className="text-4xl mb-2 transition-transform duration-300 group-hover:scale-125 group-hover:-translate-y-1">📸</div>
                <p className="text-sm text-white font-bold group-hover:text-purple-300 transition-colors">Adicionar print</p>
                <p className="text-xs text-gray-500">ou Ctrl+V</p>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) adicionarPrint(f); }} className="hidden" />
              </div>
            )}
          </div>
          {tokensGastos && (
            <div className="mt-3 text-xs text-gray-500 flex items-center gap-3">
              <span>🧠 Tokens usados:</span>
              <span>📥 Input: {tokensGastos.input}</span>
              <span>📤 Output: {tokensGastos.output}</span>
              <span className="text-green-400">💰 ~R$ {((tokensGastos.input * 0.000001 + tokensGastos.output * 0.000005) * 5).toFixed(3)}</span>
            </div>
          )}
        </div>
        {/* TABELA DE REVISÃO */}
        {linhas.length > 0 && (
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
                    {semanasDetectadas.map((s) => <th key={s} className="text-center py-2 px-1 min-w-[70px]">S{s}</th>)}
                    <th className="text-center py-2 px-2 bg-green-500/10 min-w-[80px]">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((linha, idx) => {
                    const cor = linha.metodo === 'exato' ? 'bg-green-500/5' : linha.metodo === 'fuzzy' ? 'bg-yellow-500/5' : 'bg-red-500/5';
                    return (
                      <tr key={idx} className={`border-b border-[#2a2a2a] ${cor}`}>
                        <td className="py-2 px-2 text-center text-lg">
                          {linha.metodo === 'exato' ? '✅' : linha.metodo === 'fuzzy' ? '🔶' : '❌'}
                        </td>
                        <td className="py-2 px-2 min-w-[200px]">
                          <p className="text-gray-400 text-[10px] truncate">IA leu: {linha.nomeOcr}</p>
                          <select value={linha.cadastroVinculado?.id_groot || ''} onChange={(e) => trocarVinculo(idx, e.target.value)} className={`w-full bg-[#0a0a0a] border rounded px-1 py-1 text-xs ${linha.cadastroVinculado ? 'border-[#2a2a2a] text-white' : 'border-red-500/40 text-red-300'}`}>
                            <option value="">— Não vinculado —</option>
                            {colaboradores.map((c) => <option key={c.id_groot} value={c.id_groot}>{c.nome}</option>)}
                          </select>
                        </td>
                        {semanasDetectadas.map((s) => (
                          <td key={s} className="py-2 px-1 text-center">
                            <input type="text" inputMode="numeric" value={linha.semanas[s] ? linha.semanas[s].toLocaleString('pt-BR') : ''} onChange={(e) => editarSemana(idx, s, e.target.value)} className="w-16 bg-[#0a0a0a] border border-[#2a2a2a] rounded px-1 py-1 text-right font-mono text-xs text-white" placeholder="-" />
                          </td>
                        ))}
                        <td className="py-2 px-2 text-center bg-green-500/10">
                          <input type="text" inputMode="numeric" value={linha.totalGeral ? linha.totalGeral.toLocaleString('pt-BR') : ''} onChange={(e) => editarTotal(idx, e.target.value)} className="w-20 bg-[#0a0a0a] border border-green-500/30 rounded px-1 py-1 text-right font-mono text-xs text-green-300 font-bold" />
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
              <button onClick={salvarTudo} disabled={salvando || totalSalvaveis === 0} className="bg-[#FFD700] hover:bg-yellow-400 text-black font-black py-3 px-6 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 shadow-lg shadow-yellow-500/20 hover:shadow-yellow-500/40 hover:-translate-y-0.5 active:scale-[0.99] flex items-center justify-center gap-2">
                {salvando ? (
                  <><span className="inline-block w-5 h-5 border-[3px] border-black/30 border-t-black rounded-full animate-spin"></span>Salvando...</>
                ) : (
                  `💾 Salvar ${totalSalvaveis} colabs (Total + Semanas)`
                )}
              </button>
              <button onClick={descartarTudo} className="bg-[#0a0a0a] hover:bg-[#2a2a2a] border border-[#2a2a2a] text-white font-bold py-3 px-6 rounded-lg transition-all active:scale-[0.99]">❌ Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
