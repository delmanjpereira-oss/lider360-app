'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Link from 'next/link';

type Colaborador = {
  id_groot: string;
  nome: string;
  processo: string;
  status: string;
};

type ImaManual = {
  id_groot: string;
  ima: number;
  observacao?: string;
  atualizado_em: string;
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

export default function ImaManualPage() {
  // 🎯 Inicializa com valores fixos pra evitar hydration mismatch
  // Os valores reais são setados no useEffect (só no cliente)
  const [mesSelecionado, setMesSelecionado] = useState(5);
  const [anoSelecionado, setAnoSelecionado] = useState(2026);
  const [processoSelecionado, setProcessoSelecionado] = useState<'Checkin' | 'P2M'>('Checkin');
  
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [imasSalvos, setImasSalvos] = useState<Record<string, ImaManual>>({});
  const [imasEditando, setImasEditando] = useState<Record<string, string>>({});
  
  const [montado, setMontado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');

  const mesAtual = MESES.find((m) => m.num === mesSelecionado);
  const trimestre = mesAtual?.trim || 'Q1';

  useEffect(() => {
    // 🎯 Só roda no cliente - evita hydration mismatch
    const hoje = new Date();
    setMesSelecionado(hoje.getMonth() + 1);
    setAnoSelecionado(hoje.getFullYear());
    setMontado(true);
  }, []);

  useEffect(() => {
    if (montado) {
      carregar();
    }
  }, [mesSelecionado, anoSelecionado, processoSelecionado, montado]);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      // 1. Busca colaboradores do processo
      const { data: colabs, error: errColab } = await supabase
        .from('colaboradores')
        .select('id_groot, nome, processo, status')
        .eq('status', 'Ativo')
        .eq('processo', processoSelecionado)
        .order('nome');

      if (errColab) throw new Error(errColab.message);
      setColaboradores(colabs || []);

      // 2. Busca IMAs já salvos pro mês/ano/processo
      const { data: imas, error: errImas } = await supabase
        .from('ima_manual')
        .select('id_groot, ima, observacao, atualizado_em')
        .eq('mes', mesSelecionado)
        .eq('ano', anoSelecionado)
        .eq('processo', processoSelecionado);

      if (errImas) {
        // Tabela pode não existir ainda
        console.warn('Tabela ima_manual pode não existir:', errImas);
        setImasSalvos({});
        return;
      }

      const mapa: Record<string, ImaManual> = {};
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

  function handleChangeIma(idGroot: string, valor: string) {
    setImasEditando({ ...imasEditando, [idGroot]: valor });
  }

  async function salvarTudo() {
    setSalvando(true);
    setMensagem(null);
    setErro(null);

    try {
      const registros: any[] = [];

      colaboradores.forEach((c) => {
        const valor = imasEditando[c.id_groot]?.trim();
        if (!valor) return;
        
        const imaNum = parseInt(valor.replace(/\D/g, ''));
        if (isNaN(imaNum) || imaNum < 0) return;

        registros.push({
          id_groot: c.id_groot,
          nome: c.nome,
          processo: processoSelecionado,
          mes: mesSelecionado,
          ano: anoSelecionado,
          trimestre,
          ima: imaNum,
          atualizado_em: new Date().toISOString(),
          atualizado_por: 'delman.jpereira@mercadolivre.com',
        });
      });

      if (registros.length === 0) {
        setMensagem('⚠️ Nenhum IMA preenchido pra salvar');
        setSalvando(false);
        return;
      }

      // Upsert - atualiza se existe, insere se não
      const { error } = await supabase
        .from('ima_manual')
        .upsert(registros, {
          onConflict: 'id_groot,mes,ano,processo',
          ignoreDuplicates: false,
        });

      if (error) throw new Error(error.message);

      setMensagem(`✅ ${registros.length} IMAs salvos com sucesso!`);
      carregar(); // recarrega pra mostrar atualizado
    } catch (e: any) {
      setErro('Erro ao salvar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function limparIma(idGroot: string) {
    if (!confirm('Apagar o IMA deste colaborador desse mês?')) return;
    
    try {
      await supabase
        .from('ima_manual')
        .delete()
        .eq('id_groot', idGroot)
        .eq('mes', mesSelecionado)
        .eq('ano', anoSelecionado)
        .eq('processo', processoSelecionado);
      
      setImasEditando({ ...imasEditando, [idGroot]: '' });
      carregar();
    } catch (e: any) {
      setErro('Erro ao limpar: ' + e.message);
    }
  }

  function formatarTempo(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  const colabsFiltrados = colaboradores.filter((c) =>
    !filtro || c.nome.toLowerCase().includes(filtro.toLowerCase())
  );

  const totalPreenchidos = Object.values(imasSalvos).length;
  const totalColabs = colaboradores.length;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/calibracao" className="text-yellow-400 hover:underline text-sm">
            ← Voltar pra Calibração
          </Link>
          <h1 className="text-3xl font-black mt-2 mb-1">
            ✏️ <span className="text-[#FFD700]">IMA Manual</span>
          </h1>
          <p className="text-gray-400 text-sm">
            Preencha o IMA dos colaboradores pra meses passados. Os valores refletem na Calibração.
          </p>
        </div>

        {/* Seletor de Mês/Ano/Processo */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            📅 Selecione o período
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 uppercase mb-1 block">Mês</label>
              <select
                value={mesSelecionado}
                onChange={(e) => setMesSelecionado(Number(e.target.value))}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white"
              >
                {MESES.map((m) => (
                  <option key={m.num} value={m.num}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase mb-1 block">Ano</label>
              <select
                value={anoSelecionado}
                onChange={(e) => setAnoSelecionado(Number(e.target.value))}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white"
              >
                {[2024, 2025, 2026, 2027].map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase mb-1 block">Processo</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setProcessoSelecionado('Checkin')}
                  className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${
                    processoSelecionado === 'Checkin'
                      ? 'bg-cyan-500 text-white'
                      : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a]'
                  }`}
                >
                  Checkin
                </button>
                <button
                  onClick={() => setProcessoSelecionado('P2M')}
                  className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${
                    processoSelecionado === 'P2M'
                      ? 'bg-orange-500 text-white'
                      : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a]'
                  }`}
                >
                  P2M
                </button>
              </div>
            </div>
          </div>

          {/* Info: trimestre detectado */}
          <div className="flex items-center gap-3 bg-purple-500/10 border border-purple-500/40 rounded-lg p-3">
            <span className="text-2xl">📊</span>
            <div className="flex-1">
              <p className="text-sm text-purple-300">
                Trimestre detectado: <strong className="text-white">{trimestre} de {anoSelecionado}</strong>
              </p>
              <p className="text-xs text-purple-200/80">
                {mesAtual?.label} de {anoSelecionado} pertence ao {trimestre}.
                Os IMAs preenchidos refletem na calibração deste trimestre.
              </p>
            </div>
          </div>
        </div>

        {/* Mensagens */}
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

        {/* Status / Filtro */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                👥 Colaboradores {processoSelecionado}
              </h2>
              <p className="text-xs text-gray-400">
                {totalPreenchidos} de {totalColabs} preenchidos · {mesAtual?.label}/{anoSelecionado}
              </p>
            </div>

            <input
              type="text"
              placeholder="🔍 Buscar colaborador..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white w-full md:w-64"
            />
          </div>

          {carregando ? (
            <div className="text-center py-8 text-gray-400">⏳ Carregando...</div>
          ) : colaboradores.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              Nenhum colaborador {processoSelecionado} cadastrado
            </div>
          ) : (
            <>
              {/* Lista de IMA por colab */}
              <div className="space-y-2">
                {colabsFiltrados.map((c) => {
                  const salvo = imasSalvos[c.id_groot];
                  const valorAtual = imasEditando[c.id_groot] || '';
                  const temValor = !!salvo;
                  const valorMudou = salvo && String(salvo.ima) !== valorAtual;
                  
                  return (
                    <div
                      key={c.id_groot}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                        temValor && !valorMudou
                          ? 'bg-green-500/5 border-green-500/30'
                          : valorMudou
                          ? 'bg-yellow-500/5 border-yellow-500/40'
                          : 'bg-[#0a0a0a] border-[#2a2a2a]'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm">{c.nome}</p>
                        <p className="text-xs text-gray-500 font-mono">ID: {c.id_groot}</p>
                        {salvo && (
                          <p className="text-[10px] text-green-400 mt-1">
                            ✅ Salvo: {salvo.ima.toLocaleString('pt-BR')} · {formatarTempo(salvo.atualizado_em)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="0"
                          value={valorAtual}
                          onChange={(e) => handleChangeIma(c.id_groot, e.target.value.replace(/\D/g, ''))}
                          className={`w-28 text-right font-mono font-bold rounded-lg px-3 py-2 ${
                            temValor && !valorMudou
                              ? 'bg-green-500/10 border border-green-500/40 text-green-300'
                              : valorMudou
                              ? 'bg-yellow-500/10 border border-yellow-500/40 text-yellow-300'
                              : 'bg-[#1a1a1a] border border-[#2a2a2a] text-white'
                          }`}
                        />

                        {salvo && (
                          <button
                            onClick={() => limparIma(c.id_groot)}
                            className="text-red-400 hover:text-red-300 text-lg px-2"
                            title="Apagar este IMA"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Botões */}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={salvarTudo}
                  disabled={salvando}
                  className="bg-[#FFD700] hover:bg-yellow-400 text-black font-bold py-3 px-6 rounded-lg transition-all disabled:opacity-50"
                >
                  {salvando ? '💾 Salvando...' : '💾 Salvar tudo'}
                </button>

                <button
                  onClick={() => carregar()}
                  className="bg-[#0a0a0a] hover:bg-[#2a2a2a] border border-[#2a2a2a] text-white font-bold py-3 px-6 rounded-lg transition-all"
                >
                  🔄 Recarregar
                </button>
              </div>
            </>
          )}
        </div>

        {/* Como funciona */}
        <div className="bg-blue-500/10 border border-blue-500/40 rounded-xl p-4">
          <h3 className="text-blue-300 font-black text-base mb-2">💡 Como funciona:</h3>
          <ul className="text-xs text-blue-200/80 space-y-1 list-disc pl-5">
            <li>Você preenche o IMA dos colaboradores pra um mês específico</li>
            <li>O app detecta automaticamente o trimestre (Q1, Q2, Q3, Q4)</li>
            <li>Os valores salvos refletem na <strong>Calibração</strong> e nos detalhes</li>
            <li>Pode voltar e editar quando quiser - cada salvar atualiza o registro</li>
            <li>Se o mês tem dados automáticos (DPMO completo), o manual sobrescreve</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
