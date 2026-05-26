'use client';

import { useState } from 'react';

// ============================================
// 🧠 MODAL: Finalizar Tarefa com APRENDIZADO
// ============================================
// Quando TL clica em "Finalizar" numa tarefa do Copiloto,
// esse modal abre pedindo:
// - O que rolou? (ação tomada)
// - Como foi? (resultado)
// - Observação livre (opcional)
//
// Esses dados ALIMENTAM a IA pra ela aprender o que funciona
// com TEU time específico.
// ============================================

type Props = {
  tarefa: {
    id_tarefa: string;
    nome: string;
    tipo: string;
    diagnostico?: string | null;
  };
  onClose: () => void;
  onFinalizar: () => void;
};

type AcaoTomada = 'feedback_dado' | 'observacao_apenas' | 'ignorado' | 'reagendado';
type Resultado = 'sucesso' | 'neutro' | 'falha' | 'pendente';

const ACOES: { value: AcaoTomada; label: string; icon: string; descricao: string }[] = [
  {
    value: 'feedback_dado',
    label: 'Conversei e dei o feedback',
    icon: '💬',
    descricao: 'Tive a conversa sugerida e abordei o ponto',
  },
  {
    value: 'observacao_apenas',
    label: 'Só observei, sem conversar ainda',
    icon: '👀',
    descricao: 'Vou acompanhar antes de agir',
  },
  {
    value: 'reagendado',
    label: 'Decidi adiar pra outro momento',
    icon: '⏰',
    descricao: 'Momento não tava adequado',
  },
  {
    value: 'ignorado',
    label: 'Não fez sentido pra esse caso',
    icon: '🚫',
    descricao: 'Sugestão não se aplicava na minha visão',
  },
];

const RESULTADOS: { value: Resultado; label: string; icon: string; cor: string }[] = [
  { value: 'sucesso', label: 'Funcionou bem', icon: '✅', cor: 'green' },
  { value: 'neutro', label: 'Ainda cedo pra avaliar', icon: '⏳', cor: 'yellow' },
  { value: 'falha', label: 'Não funcionou', icon: '❌', cor: 'red' },
];

export default function FinalizarTarefaModal({ tarefa, onClose, onFinalizar }: Props) {
  const [acaoTomada, setAcaoTomada] = useState<AcaoTomada | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // Determina automaticamente quais resultados fazem sentido baseado na ação
  const precisaResultado = acaoTomada === 'feedback_dado';

  async function salvar() {
    if (!acaoTomada) {
      setErro('Diz o que você fez com a sugestão');
      return;
    }
    
    if (precisaResultado && !resultado) {
      setErro('Conta como foi o resultado da conversa');
      return;
    }

    setSalvando(true);
    setErro('');

    try {
      const resp = await fetch('/api/tarefa-finalizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_tarefa: tarefa.id_tarefa,
          acao_tomada: acaoTomada,
          resultado_efetivo: resultado || 'pendente',
          observacao_tl: observacao || null,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.erro || 'Erro ao salvar');
      }

      onFinalizar();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/70"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-gradient-to-br from-[#1a1a1a] to-[#0f0f0f] border border-[#2a2a2a] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#1a1a1a] border-b border-[#2a2a2a] p-5 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl font-black text-white">🧠 Finalizar tarefa</h2>
            <p className="text-xs text-gray-400 mt-1">{tarefa.nome} · {tarefa.tipo}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-3xl leading-none px-3"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-6">
          {/* Mensagem motivadora */}
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
            <p className="text-purple-200 text-sm">
              💡 <strong>Cada feedback seu deixa a IA mais inteligente.</strong>
              <br />
              Ao marcar resultado, ela aprende o que funciona com seu time específico.
            </p>
          </div>

          {/* PERGUNTA 1: O que você fez */}
          <div>
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">
              1. O que você fez com a sugestão?
            </h3>
            <div className="grid gap-2">
              {ACOES.map((acao) => (
                <button
                  key={acao.value}
                  onClick={() => setAcaoTomada(acao.value)}
                  className={`flex items-start gap-3 p-3 rounded-xl text-left transition-all border-2 ${
                    acaoTomada === acao.value
                      ? 'bg-purple-500/10 border-purple-500/60'
                      : 'bg-[#0a0a0a] border-[#2a2a2a] hover:border-[#3a3a3a]'
                  }`}
                >
                  <span className="text-2xl flex-shrink-0">{acao.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm">{acao.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{acao.descricao}</p>
                  </div>
                  {acaoTomada === acao.value && (
                    <span className="text-purple-400 text-lg">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* PERGUNTA 2: Como foi (só se aplicável) */}
          {precisaResultado && (
            <div>
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">
                2. Como foi a conversa?
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {RESULTADOS.map((res) => {
                  const ativo = resultado === res.value;
                  const corBorda = res.cor === 'green' ? 'border-green-500/60 bg-green-500/10' :
                                   res.cor === 'red' ? 'border-red-500/60 bg-red-500/10' :
                                   'border-yellow-500/60 bg-yellow-500/10';
                  
                  return (
                    <button
                      key={res.value}
                      onClick={() => setResultado(res.value)}
                      className={`flex flex-col items-center p-3 rounded-xl transition-all border-2 ${
                        ativo
                          ? corBorda
                          : 'bg-[#0a0a0a] border-[#2a2a2a] hover:border-[#3a3a3a]'
                      }`}
                    >
                      <span className="text-3xl mb-1">{res.icon}</span>
                      <p className="text-white font-bold text-xs">{res.label}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* OBSERVAÇÃO */}
          <div>
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">
              {precisaResultado ? '3. ' : '2. '}
              Observação <span className="font-normal text-gray-500">(opcional, mas ajuda a IA)</span>
            </h3>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: Conversa foi tranquila, ela tava aberta. Mencionei o ponto sobre velocidade. Vai acompanhar..."
              rows={4}
              className="w-full bg-[#0a0a0a] border-2 border-[#2a2a2a] focus:border-purple-500/60 rounded-xl px-4 py-3 text-white text-sm outline-none resize-none"
            />
            <p className="text-[10px] text-gray-600 mt-1">
              Quanto mais detalhe, mais a IA aprende
            </p>
          </div>

          {/* Erro */}
          {erro && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <p className="text-red-300 text-sm">{erro}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[#1a1a1a] border-t border-[#2a2a2a] p-4 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            disabled={salvando}
            className="text-gray-400 hover:text-white font-bold text-sm px-4 py-2 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          
          <button
            onClick={salvar}
            disabled={salvando || !acaoTomada}
            className="bg-gradient-to-br from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 text-white font-black px-6 py-3 rounded-xl shadow-lg shadow-purple-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {salvando ? '⏳ Salvando...' : '🧠 Finalizar e Ensinar a IA'}
          </button>
        </div>
      </div>
    </div>
  );
}
