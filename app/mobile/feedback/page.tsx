'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

// ============================================
// ✍️ FEEDBACK COM VOZ - MOBILE
// ============================================

type Colab = {
  id: number;
  id_groot: string;
  nome: string;
  processo: string | null;
};

type TipoFeedback = 'reconhecimento' | 'construtivo' | 'ofensor';

const TIPOS: Record<TipoFeedback, { emoji: string; label: string; cor: string; classificacao: string }> = {
  reconhecimento: { emoji: '🌟', label: 'Reconhecimento', cor: 'green', classificacao: 'Supera' },
  construtivo: { emoji: '✓', label: 'Construtivo', cor: 'blue', classificacao: 'Alinhado' },
  ofensor: { emoji: '⚠️', label: 'Ofensor', cor: 'red', classificacao: 'Abaixo' },
};

export default function FeedbackMobilePage() {
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [colabSelecionado, setColabSelecionado] = useState<Colab | null>(null);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<TipoFeedback>('construtivo');
  const [texto, setTexto] = useState('');
  
  // Gravação de voz
  const [gravando, setGravando] = useState(false);
  const [transcricaoAtiva, setTranscricaoAtiva] = useState('');
  const [tempoGravacao, setTempoGravacao] = useState(0);
  const recognitionRef = useRef<any>(null);
  const tempoInterval = useRef<NodeJS.Timeout | null>(null);
  
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState('');

  // Carrega colabs
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('colaboradores')
        .select('id, id_groot, nome, processo')
        .eq('status', 'Ativo')
        .order('nome');
      setColabs(data || []);
    })();
  }, []);

  // Setup do reconhecimento de voz
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('Reconhecimento de voz não suportado neste navegador');
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'pt-BR';
    
    recognition.onresult = (event: any) => {
      let textoFinal = '';
      let textoInterim = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcricao = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          textoFinal += transcricao + ' ';
        } else {
          textoInterim += transcricao;
        }
      }
      
      if (textoFinal) {
        setTexto((prev) => prev + textoFinal);
      }
      setTranscricaoAtiva(textoInterim);
    };
    
    recognition.onerror = (event: any) => {
      console.error('Erro reconhecimento:', event.error);
      if (event.error === 'no-speech') {
        // Ignora - microfone sem áudio
      } else if (event.error === 'not-allowed') {
        setErro('Permissão de microfone negada. Habilite nas configurações.');
        pararGravacao();
      }
    };
    
    recognition.onend = () => {
      // Se ainda tá gravando, reinicia (continuous)
      if (gravando) {
        try {
          recognition.start();
        } catch (e) {}
      }
    };
    
    recognitionRef.current = recognition;
    
    return () => {
      try {
        recognition.stop();
      } catch (e) {}
    };
  }, []);

  function iniciarGravacao() {
    if (!recognitionRef.current) {
      setErro('Seu navegador não suporta reconhecimento de voz. Use Chrome.');
      return;
    }
    
    setErro('');
    setTempoGravacao(0);
    
    try {
      recognitionRef.current.start();
      setGravando(true);
      
      // Vibração ao iniciar
      if (navigator.vibrate) navigator.vibrate(50);
      
      // Timer
      tempoInterval.current = setInterval(() => {
        setTempoGravacao((t) => t + 1);
      }, 1000);
    } catch (e: any) {
      console.error(e);
      setErro('Erro ao iniciar gravação: ' + e.message);
    }
  }

  function pararGravacao() {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setGravando(false);
    setTranscricaoAtiva('');
    
    if (tempoInterval.current) {
      clearInterval(tempoInterval.current);
      tempoInterval.current = null;
    }
    
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
  }

  async function salvar() {
    if (!colabSelecionado) {
      setErro('Selecione um colaborador');
      return;
    }
    
    if (texto.trim().length < 10) {
      setErro('Feedback muito curto (mínimo 10 caracteres)');
      return;
    }
    
    setSalvando(true);
    setErro('');
    
    try {
      const config = TIPOS[tipo];
      const feedbackId = 'FB-MOB-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      
      const { error } = await supabase.from('feedbacks').insert({
        feedback_id: feedbackId,
        id_groot: colabSelecionado.id_groot,
        nome: colabSelecionado.nome,
        processo: colabSelecionado.processo,
        tipo: config.label,
        observacao: texto.trim(),
        responsavel: 'delman.jpereira@mercadolivre.com',
        classificacao: config.classificacao,
        registrado_em: new Date().toISOString(),
      });
      
      if (error) throw new Error(error.message);
      
      // Vibração de sucesso
      if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
      
      setSucesso(true);
      setTimeout(() => {
        setColabSelecionado(null);
        setTexto('');
        setBusca('');
        setSucesso(false);
        setTipo('construtivo');
      }, 2000);
      
    } catch (e: any) {
      console.error(e);
      setErro('Erro ao salvar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  }

  const colabsFiltrados = busca.length > 0
    ? colabs.filter(c => c.nome.toLowerCase().includes(busca.toLowerCase()))
    : [];

  // TELA DE SUCESSO
  if (sucesso) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <span className="text-8xl mb-4 animate-bounce">✅</span>
        <h2 className="text-2xl font-black text-green-400 mb-2">
          Feedback salvo!
        </h2>
        <p className="text-gray-400">
          {colabSelecionado?.nome} vai receber no perfil
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Título */}
      <div>
        <h2 className="text-2xl font-black text-white">✍️ Feedback</h2>
        <p className="text-xs text-gray-400">Registre na hora, salva no perfil</p>
      </div>

      {/* PASSO 1: Selecionar colab */}
      {!colabSelecionado && (
        <div className="space-y-3">
          <label className="block text-xs font-bold text-gray-400 uppercase">
            1. Quem?
          </label>
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="🔎 Buscar colaborador..."
            className="w-full bg-[#1a1a1a] border-2 border-[#2a2a2a] focus:border-[#FFD700] rounded-xl px-4 py-4 text-white text-base outline-none"
            autoFocus
          />
          
          {colabsFiltrados.length > 0 && (
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden">
              {colabsFiltrados.slice(0, 6).map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setColabSelecionado(c);
                    setBusca('');
                    if (navigator.vibrate) navigator.vibrate(30);
                  }}
                  className="w-full px-4 py-3 flex items-center gap-3 active:bg-[#2a2a2a] transition-all border-b border-[#2a2a2a] last:border-b-0 text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-[#FFD700]/20 flex items-center justify-center text-[#FFD700] font-black text-xs">
                    {c.nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm truncate">{c.nome}</p>
                    <p className="text-[10px] text-gray-500">{c.processo}</p>
                  </div>
                  <span className="text-gray-500">→</span>
                </button>
              ))}
            </div>
          )}
          
          {busca.length > 0 && colabsFiltrados.length === 0 && (
            <p className="text-center text-gray-500 text-sm py-4">
              Nenhum colab encontrado
            </p>
          )}
        </div>
      )}

      {/* PASSO 2: Tipo + Texto */}
      {colabSelecionado && (
        <>
          {/* Colab selecionado */}
          <div className="bg-gradient-to-br from-[#FFD700]/10 to-yellow-600/5 border border-[#FFD700]/30 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FFD700]/20 flex items-center justify-center text-[#FFD700] font-black text-xs">
              {colabSelecionado.nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="text-white font-bold text-sm">{colabSelecionado.nome}</p>
              <p className="text-[10px] text-gray-500">{colabSelecionado.processo}</p>
            </div>
            <button 
              onClick={() => { setColabSelecionado(null); setTexto(''); }}
              className="text-gray-400 text-sm font-bold"
            >
              Trocar
            </button>
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
              2. Tipo
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TIPOS) as TipoFeedback[]).map((t) => {
                const config = TIPOS[t];
                const ativo = tipo === t;
                return (
                  <button
                    key={t}
                    onClick={() => {
                      setTipo(t);
                      if (navigator.vibrate) navigator.vibrate(20);
                    }}
                    className={`p-3 rounded-xl text-center transition-all active:scale-95 ${
                      ativo
                        ? config.cor === 'green' ? 'bg-green-500/20 border-2 border-green-500/60'
                        : config.cor === 'blue' ? 'bg-blue-500/20 border-2 border-blue-500/60'
                        : 'bg-red-500/20 border-2 border-red-500/60'
                        : 'bg-[#1a1a1a] border-2 border-[#2a2a2a]'
                    }`}
                  >
                    <div className="text-2xl mb-1">{config.emoji}</div>
                    <p className={`text-[10px] font-bold ${ativo ? 'text-white' : 'text-gray-400'}`}>
                      {config.label}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Gravação de voz */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
              3. Mensagem
            </label>
            
            {/* Botão de gravar */}
            {!gravando ? (
              <button
                onClick={iniciarGravacao}
                className="w-full bg-gradient-to-br from-purple-500/20 to-pink-500/10 border-2 border-purple-500/40 rounded-xl py-4 mb-3 active:scale-95 transition-all"
              >
                <div className="text-4xl mb-1">🎤</div>
                <p className="text-purple-300 font-bold text-sm">Gravar voz</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Transcreve automaticamente</p>
              </button>
            ) : (
              <div className="w-full bg-gradient-to-br from-red-500/20 to-rose-600/10 border-2 border-red-500/60 rounded-xl py-4 mb-3 text-center animate-pulse">
                <div className="text-4xl mb-1">🔴</div>
                <p className="text-red-300 font-bold text-sm">Gravando...</p>
                <p className="text-xs font-mono text-white mt-1">
                  {String(Math.floor(tempoGravacao / 60)).padStart(2, '0')}:
                  {String(tempoGravacao % 60).padStart(2, '0')}
                </p>
                <button
                  onClick={pararGravacao}
                  className="mt-3 bg-red-500/30 hover:bg-red-500/40 border border-red-500/60 text-white font-bold px-6 py-2 rounded-lg text-sm"
                >
                  ⏹️ Parar
                </button>
              </div>
            )}
            
            {/* Texto + transcrição em tempo real */}
            <textarea
              value={texto + (transcricaoAtiva ? ' ' + transcricaoAtiva : '')}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Digite ou grave a mensagem..."
              rows={6}
              className="w-full bg-[#1a1a1a] border-2 border-[#2a2a2a] focus:border-[#FFD700] rounded-xl px-4 py-3 text-white text-sm outline-none resize-none"
            />
            
            <p className="text-[10px] text-gray-500 mt-1 text-right">
              {texto.length} caracteres
            </p>
          </div>

          {/* Erro */}
          {erro && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <p className="text-red-300 text-xs">{erro}</p>
            </div>
          )}

          {/* Salvar */}
          <button
            onClick={salvar}
            disabled={salvando || texto.trim().length < 10}
            className="w-full bg-gradient-to-br from-[#FFD700] to-yellow-500 hover:from-yellow-300 text-black font-black py-4 rounded-xl shadow-lg shadow-yellow-500/30 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {salvando ? (
              <><span className="animate-spin inline-block">⏳</span> Salvando...</>
            ) : (
              <>💾 SALVAR FEEDBACK</>
            )}
          </button>
        </>
      )}
    </div>
  );
}
