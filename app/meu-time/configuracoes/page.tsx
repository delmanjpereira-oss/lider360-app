'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

type ConfigItem = {
  chave: string;
  valor: string;
  descricao: string | null;
};

// Valores padrão MELI (fallback se a tabela estiver vazia)
const PADRAO_MELI: Record<string, string> = {
  meta_checkin_base: '296',
  meta_checkin_alinhado_max: '310',
  meta_p2m_base: '329',
  meta_p2m_alinhado_max: '350',
  meta_ocupacao_checkin: '75',
  meta_ocupacao_p2m: '80',
  meta_ima_checkin: '1567',
  meta_ima_p2m: '1567',
  offender_streak_min: '3',
  birthday_alert_days: '7',
  adaptacao_meses: '2',
  abs_max_promocao: '3',
};

const DESCRICOES: Record<string, string> = {
  meta_checkin_base: 'Líquida mínima Checkin (peças/hora)',
  meta_checkin_alinhado_max: 'Líquida máxima alinhado Checkin',
  meta_p2m_base: 'Líquida mínima P2M (peças/hora)',
  meta_p2m_alinhado_max: 'Líquida máxima alinhado P2M',
  meta_ocupacao_checkin: 'Ocupação mínima Checkin (%)',
  meta_ocupacao_p2m: 'Ocupação mínima P2M (%)',
  meta_ima_checkin: 'IMA máximo Checkin (PPM - menor é melhor)',
  meta_ima_p2m: 'IMA máximo P2M (PPM - menor é melhor)',
  offender_streak_min: 'Dias seguidos abaixo pra virar ofensor',
  birthday_alert_days: 'Dias antes do aniversário pra alertar',
  adaptacao_meses: 'Meses iniciais sem virar ofensor (adaptação)',
  abs_max_promocao: 'ABS máximo (%) pra ficar apto a promoção',
};

const GRUPOS = [
  {
    titulo: '🎯 Metas de Líquida (peças/hora)',
    cor: 'text-cyan-400',
    campos: [
      { chave: 'meta_checkin_base', label: 'Checkin Base', sufixo: 'pç/h' },
      { chave: 'meta_checkin_alinhado_max', label: 'Checkin Supera (>)', sufixo: 'pç/h' },
      { chave: 'meta_p2m_base', label: 'P2M Base', sufixo: 'pç/h' },
      { chave: 'meta_p2m_alinhado_max', label: 'P2M Supera (>)', sufixo: 'pç/h' },
    ],
  },
  {
    titulo: '⏱️ Metas de Ocupação',
    cor: 'text-emerald-400',
    campos: [
      { chave: 'meta_ocupacao_checkin', label: 'Ocupação Checkin', sufixo: '%' },
      { chave: 'meta_ocupacao_p2m', label: 'Ocupação P2M', sufixo: '%' },
    ],
  },
  {
    titulo: '✨ Metas de IMA (menor é melhor)',
    cor: 'text-purple-400',
    campos: [
      { chave: 'meta_ima_checkin', label: 'IMA Checkin (máx)', sufixo: 'PPM' },
      { chave: 'meta_ima_p2m', label: 'IMA P2M (máx)', sufixo: 'PPM' },
    ],
  },
  {
    titulo: '🔥 Regras do sistema',
    cor: 'text-orange-400',
    campos: [
      { chave: 'offender_streak_min', label: 'Streak Ofensor', sufixo: 'dias' },
      { chave: 'birthday_alert_days', label: 'Alerta Aniversário', sufixo: 'dias antes' },
      { chave: 'adaptacao_meses', label: 'Adaptação Novato', sufixo: 'meses' },
      { chave: 'abs_max_promocao', label: 'ABS Máx p/ Promoção', sufixo: '%' },
    ],
  },
];

export default function ConfiguracoesPage() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [vazioInicial, setVazioInicial] = useState(false);

  useEffect(() => {
    buscarConfig();
  }, []);

  async function buscarConfig() {
    try {
      setLoading(true);
      console.log('🔄 Buscando configurações...');

      const { data, error } = await supabase.from('config').select('*');

      if (error) {
        console.error('❌ Erro:', error);
        setErro(error.message);
        // Mesmo com erro, mostra os padrões pra evitar tela vazia
        setConfig({ ...PADRAO_MELI });
        return;
      }

      if (!data || data.length === 0) {
        console.warn('⚠️ Tabela config está vazia. Carregando padrões MELI.');
        setVazioInicial(true);
        setConfig({ ...PADRAO_MELI });
      } else {
        const map: Record<string, string> = { ...PADRAO_MELI };
        (data as ConfigItem[]).forEach((item) => {
          map[item.chave] = item.valor;
        });
        console.log('✅ Configurações carregadas:', Object.keys(map).length);
        setConfig(map);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      console.error('❌ Erro geral:', e);
      setErro(msg);
      setConfig({ ...PADRAO_MELI });
    } finally {
      setLoading(false);
    }
  }

  function handleChange(chave: string, valor: string) {
    setConfig({ ...config, [chave]: valor });
  }

  async function salvarTudo() {
    console.log('💾 Salvando configurações...');
    setSalvando(true);
    setErro(null);
    setSucesso(false);

    try {
      // Monta array com TODAS as chaves
      const linhas = Object.entries(config).map(([chave, valor]) => ({
        chave,
        valor: String(valor || '0'),
        descricao: DESCRICOES[chave] || null,
        atualizado_em: new Date().toISOString(),
      }));

      console.log('📦 Vai salvar:', linhas);

      // UPSERT: insere se não existe, atualiza se existe
      const { error } = await supabase
        .from('config')
        .upsert(linhas, { onConflict: 'chave' });

      if (error) {
        console.error('❌ Erro ao salvar:', error);
        setErro('Erro ao salvar: ' + error.message);
      } else {
        console.log('✅ Salvo com sucesso!');
        setSucesso(true);
        setVazioInicial(false);
        setTimeout(() => setSucesso(false), 3500);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      console.error('❌ Erro geral:', e);
      setErro(msg);
    } finally {
      setSalvando(false);
    }
  }

  function restaurarPadrao() {
    const confirma = window.confirm(
      'Deseja restaurar todas as metas pros valores padrão MELI?'
    );
    if (!confirma) return;
    setConfig({ ...PADRAO_MELI });
  }

  if (loading) {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
        <span className="text-6xl block mb-4">⏳</span>
        <p className="text-gray-400">Carregando metas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Link
        href="/meu-time"
        className="text-gray-400 hover:text-white transition-colors inline-flex items-center gap-2"
      >
        ← Voltar para MEU TIME
      </Link>

      <div>
        <h1 className="text-4xl font-black mb-2">
          ⚙️ Metas <span className="text-[#FFD700]">Dinâmicas</span>
        </h1>
        <p className="text-gray-400">
          Configurações do sistema — afetam classificação, alertas e calibração
        </p>
      </div>

      {/* Aviso se tabela tava vazia */}
      {vazioInicial && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="text-yellow-400 font-bold mb-1">
              Primeira configuração
            </p>
            <p className="text-yellow-300 text-sm">
              As metas estão com os valores padrão MELI. Clica em{' '}
              <strong>Salvar todas configurações</strong> abaixo pra registrar
              tudo no banco.
            </p>
          </div>
        </div>
      )}

      {sucesso && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <p className="text-green-400 font-bold">
            Configurações salvas! Vai persistir mesmo fechando o app.
          </p>
        </div>
      )}

      {erro && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl">❌</span>
          <div>
            <p className="text-red-400 font-bold mb-1">Erro:</p>
            <p className="text-red-300 text-sm">{erro}</p>
          </div>
        </div>
      )}

      {GRUPOS.map((grupo) => (
        <div
          key={grupo.titulo}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6"
        >
          <h2 className={`text-lg font-bold mb-4 ${grupo.cor}`}>
            {grupo.titulo}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {grupo.campos.map((campo) => (
              <div key={campo.chave}>
                <label className="block text-sm font-bold text-gray-300 mb-2">
                  {campo.label}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={config[campo.chave] || ''}
                    onChange={(e) => handleChange(campo.chave, e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white focus:border-[#FFD700] focus:outline-none transition-colors pr-16"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-bold">
                    {campo.sufixo}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 flex flex-wrap gap-3 sticky bottom-4">
        <button
          onClick={salvarTudo}
          disabled={salvando}
          className="flex-1 min-w-[200px] bg-[#FFD700] text-black font-bold py-3 rounded-lg hover:bg-yellow-300 transition-colors disabled:opacity-50"
        >
          {salvando ? '💾 Salvando...' : '💾 Salvar todas as configurações'}
        </button>

        <button
          onClick={restaurarPadrao}
          className="px-6 py-3 bg-[#2a2a2a] text-white rounded-lg hover:bg-[#3a3a3a] transition-colors"
        >
          🔄 Restaurar padrão MELI
        </button>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 text-sm text-blue-300">
        <p className="font-bold mb-2">ℹ️ Como o sistema usa essas metas:</p>
        <ul className="space-y-1 list-disc pl-5">
          <li>
            <strong>Líquida + Ocupação</strong> definem se o colaborador é Supera /
            Alinhado / Abaixo no dia
          </li>
          <li>
            <strong>IMA</strong> entra na Calibração Trimestral (menor é melhor —
            funciona como teto)
          </li>
          <li>
            <strong>Streak Ofensor</strong>: depois de X dias seguidos abaixo, o
            sistema gera tarefa automática de feedback
          </li>
          <li>
            <strong>Adaptação</strong>: colaboradores com menos de X meses de casa
            não viram ofensor automático (tag &quot;em adaptação&quot;)
          </li>
          <li>
            <strong>ABS Máx</strong>: filtro de aptidão pra promoção — quem tem
            faltas acima disso é bloqueado
          </li>
        </ul>
      </div>
    </div>
  );
}
