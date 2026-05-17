// app/components/MascoteApollo.tsx
'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { AstronautAvatar } from './AstronautAvatar';

type Humor = 'happy' | 'party' | 'surprised' | 'sad';

type MensagemHumor = {
  titulo: string;
  texto: string;
};

const MENSAGENS: Record<Humor, MensagemHumor[]> = {
  happy: [
    { titulo: 'Tudo tranquilo', texto: 'Time alinhado, poucas pendências. Continue assim! 🚀' },
    { titulo: 'Tá fluindo', texto: 'Operação rodando bem. Mantém o ritmo!' },
    { titulo: 'Bom trabalho', texto: 'Equipe está no caminho certo. Parabéns pela liderança!' },
  ],
  party: [
    { titulo: '🎉 Tudo zerado!', texto: 'Sem pendências, sem ofensores! Hora de comemorar com o time!' },
    { titulo: '🏆 Time campeão', texto: 'Todos batendo a meta! Você é referência!' },
    { titulo: '🎊 Resultados excelentes', texto: 'O time está dando show! Continue inspirando!' },
  ],
  surprised: [
    { titulo: '⚠️ Atenção, líder!', texto: 'Algumas pendências precisam de olhar. Dá uma checada quando puder.' },
    { titulo: '👀 Olho aqui', texto: 'Alguns colaboradores merecem atenção essa semana.' },
    { titulo: '🔔 Tem pendência', texto: 'Não deixa acumular! Resolva os pontos rápido.' },
  ],
  sad: [
    { titulo: '🚨 Emergência', texto: 'Muita coisa acumulada! Hora de priorizar feedbacks urgentes.' },
    { titulo: '📉 Atenção máxima', texto: 'Time precisa de você agora. Vamos colocar a casa em ordem!' },
    { titulo: '🆘 Crítico', texto: 'Vários colaboradores com indicadores ruins. Bora resolver?' },
  ],
};

export function MascoteApollo() {
  const [humor, setHumor] = useState<Humor>('happy');
  const [escondido, setEscondido] = useState(false);
  const [bolhaAberta, setBolhaAberta] = useState(false);
  const [mensagem, setMensagem] = useState<MensagemHumor>(MENSAGENS.happy[0]);
  const [montou, setMontou] = useState(false);
  const pathname = usePathname();

  // Carrega dados e determina humor
  useEffect(() => {
    async function calcularHumor() {
      try {
        // Busca pendências do mês
        const agora = new Date();
        const mesAtual = agora.getMonth() + 1;
        const anoAtual = agora.getFullYear();
        const primeiroDia = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-01`;

        // 1. Conta dias com produtividade abaixo da meta no mês atual
        const { data: hist } = await supabase
          .from('historico')
          .select('id_groot, status_meta, data_referencia')
          .gte('data_referencia', primeiroDia);

        const abaixoMeta = (hist || []).filter((h) => h.status_meta === 'Abaixo').length;
        const totalDias = (hist || []).length;
        const pctAbaixo = totalDias > 0 ? (abaixoMeta / totalDias) * 100 : 0;

        // 2. Verifica aniversariantes hoje
        const { data: colabs } = await supabase
          .from('colaboradores')
          .select('aniversario')
          .eq('status', 'Ativo');

        const hojeStr = `${String(agora.getDate()).padStart(2, '0')}/${String(mesAtual).padStart(2, '0')}`;
        const aniversariantes = (colabs || []).filter((c) => {
          if (!c.aniversario) return false;
          const partes = String(c.aniversario).split('-');
          if (partes.length === 3) {
            return `${partes[2]}/${partes[1]}` === hojeStr;
          }
          return false;
        });

        // 3. Determina humor
        let novoHumor: Humor = 'happy';

        if (aniversariantes.length > 0) {
          novoHumor = 'party';
        } else if (pctAbaixo === 0 && totalDias > 0) {
          novoHumor = 'party';
        } else if (pctAbaixo >= 50) {
          novoHumor = 'sad';
        } else if (pctAbaixo >= 25) {
          novoHumor = 'surprised';
        }

        setHumor(novoHumor);

        // Sorteia mensagem
        const opcoes = MENSAGENS[novoHumor];
        setMensagem(opcoes[Math.floor(Math.random() * opcoes.length)]);
      } catch (e) {
        console.error('Erro calculando humor:', e);
      } finally {
        setMontou(true);
      }
    }

    calcularHumor();
  }, [pathname]); // recalcula ao mudar de página

  // Esconde quando mouse perto (UX inteligente)
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const el = document.getElementById('mascoteApollo');
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const isNear =
        e.clientX >= rect.left - 70 &&
        e.clientX <= rect.right + 20 &&
        e.clientY >= rect.top - 70 &&
        e.clientY <= rect.bottom + 20;
      setEscondido(isNear && !bolhaAberta);
    }

    function handleFocusIn(e: FocusEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        setEscondido(true);
      }
    }

    function handleFocusOut() {
      setTimeout(() => setEscondido(false), 200);
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [bolhaAberta]);

  // Não renderiza no SSR
  if (!montou) return null;

  // Não mostra em rotas de auth/login
  if (pathname?.includes('/login')) return null;

  const corBorda =
    humor === 'sad'
      ? '#ef4444'
      : humor === 'surprised'
      ? '#f59e0b'
      : humor === 'party'
      ? '#a855f7'
      : '#FFD700';

  return (
    <div
      id="mascoteApollo"
      className={`fixed right-4 bottom-4 z-50 flex items-end gap-2 transition-all duration-200 ${
        escondido ? 'opacity-0 translate-y-4 pointer-events-none' : ''
      } ${humor === 'party' ? 'animate-party-float' : 'animate-mascot-float'}`}
    >
      {/* Bolha de mensagem */}
      {bolhaAberta && (
        <div
          className="bg-gradient-to-b from-[#fffef8] to-[#fff7db] rounded-2xl rounded-br-md p-3 border-2 shadow-2xl max-w-[280px] cursor-pointer"
          style={{ borderColor: `${corBorda}80` }}
          onClick={() => setBolhaAberta(false)}
        >
          <strong className="block text-[#8a6400] text-[10px] uppercase tracking-widest mb-1 font-black">
            🚀 Assistente Apollo
          </strong>
          <p className="text-[13px] font-bold text-[#1c1c1c] leading-snug">
            <strong className="block mb-1">{mensagem.titulo}</strong>
            {mensagem.texto}
          </p>
          <p className="text-[10px] text-gray-500 mt-2 text-right">clique pra fechar</p>
        </div>
      )}

      {/* Cabeça (astronauta) */}
      <button
        onClick={() => setBolhaAberta(!bolhaAberta)}
        className="relative cursor-pointer transition-transform hover:scale-110"
        style={{
          filter: `drop-shadow(0 8px 16px ${corBorda}40)`,
        }}
        title="Clique pra ver mensagem"
      >
        <div
          className="rounded-full overflow-hidden"
          style={{
            width: '70px',
            height: '70px',
            border: `3px solid ${corBorda}`,
            boxShadow: `0 0 20px ${corBorda}30`,
          }}
        >
          <AstronautAvatar size={70} priority />
        </div>

        {/* Badge de humor */}
        <div
          className="absolute -top-1 -right-1 w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-base font-bold shadow-lg"
          style={{ background: corBorda }}
        >
          {humor === 'sad' && '😢'}
          {humor === 'surprised' && '😲'}
          {humor === 'party' && '🎉'}
          {humor === 'happy' && '😊'}
        </div>

        {/* Pulso pra alertas */}
        {(humor === 'sad' || humor === 'party') && (
          <div
            className="absolute inset-0 rounded-full animate-ping"
            style={{
              background: corBorda,
              opacity: 0.2,
            }}
          />
        )}
      </button>
    </div>
  );
}
