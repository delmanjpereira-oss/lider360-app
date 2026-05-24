'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

// ============================================
// 📅 AGENDA MOBILE - tarefas com alarme
// ============================================

type Agenda = {
  id: number;
  agenda_id: string;
  titulo: string;
  descricao: string | null;
  data_evento: string;
  hora_inicio: string;
  hora_fim: string | null;
  tipo: string;
  colab_id_groot: string | null;
  colab_nome: string | null;
  alarme_ativo: boolean;
  alarme_minutos_antes: number;
  alarme_vibrar: boolean;
  status: string;
};

type Colab = {
  id_groot: string;
  nome: string;
};

const TIPOS_EVENTO = {
  tarefa: { emoji: '📋', label: 'Tarefa', cor: 'blue' },
  reuniao: { emoji: '👥', label: 'Reunião', cor: 'purple' },
  feedback: { emoji: '✍️', label: 'Feedback', cor: 'green' },
  '1on1': { emoji: '☕', label: '1on1', cor: 'orange' },
};

function formatarData(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function ehHoje(iso: string): boolean {
  return iso === new Date().toISOString().split('T')[0];
}

function ehAmanha(iso: string): boolean {
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  return iso === amanha.toISOString().split('T')[0];
}

function calcularMinutosAte(data: string, hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  const dataEvento = new Date(data + 'T' + hora + ':00');
  dataEvento.setHours(h, m, 0, 0);
  const agora = new Date();
  return Math.floor((dataEvento.getTime() - agora.getTime()) / 60000);
}

export default function AgendaMobilePage() {
  const [agenda, setAgenda] = useState<Agenda[]>([]);
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  
  // Formulário
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataEvento, setDataEvento] = useState(new Date().toISOString().split('T')[0]);
  const [horaInicio, setHoraInicio] = useState('14:00');
  const [tipo, setTipo] = useState<keyof typeof TIPOS_EVENTO>('tarefa');
  const [colabSelecionado, setColabSelecionado] = useState<Colab | null>(null);
  const [buscaColab, setBuscaColab] = useState('');
  const [alarmeMinutos, setAlarmeMinutos] = useState(5);
  const [alarmeVibrar, setAlarmeVibrar] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregar();
    
    // Solicita permissão de notificação ao abrir
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  // Verifica alarmes a cada 30s
  useEffect(() => {
    const verificarAlarmes = () => {
      agenda.forEach((evt) => {
        if (evt.status !== 'pendente' || !evt.alarme_ativo) return;
        
        const minutosAte = calcularMinutosAte(evt.data_evento, evt.hora_inicio);
        
        // Se tá EXATAMENTE no momento do alarme (com 30s de tolerância)
        if (minutosAte === evt.alarme_minutos_antes) {
          dispararAlarme(evt);
        }
      });
    };
    
    const interval = setInterval(verificarAlarmes, 30000);
    return () => clearInterval(interval);
  }, [agenda]);

  function dispararAlarme(evt: Agenda) {
    // Vibração
    if (evt.alarme_vibrar && navigator.vibrate) {
      navigator.vibrate([500, 200, 500, 200, 500]);
    }
    
    // Notificação push
    if ('Notification' in window && Notification.permission === 'granted') {
      const config = TIPOS_EVENTO[evt.tipo as keyof typeof TIPOS_EVENTO] || TIPOS_EVENTO.tarefa;
      new Notification(`${config.emoji} ${evt.titulo}`, {
        body: `Em ${evt.alarme_minutos_antes}min: ${evt.colab_nome || evt.descricao || 'Hora de agir!'}`,
        icon: '/icon.svg',
        badge: '/icon.svg',
        tag: evt.agenda_id,
        requireInteraction: true,
      });
    }
  }

  async function carregar() {
    setLoading(true);
    
    const [{ data: agendaData }, { data: colabsData }] = await Promise.all([
      supabase
        .from('agenda')
        .select('*')
        .eq('status', 'pendente')
        .gte('data_evento', new Date().toISOString().split('T')[0])
        .order('data_evento')
        .order('hora_inicio'),
      supabase
        .from('colaboradores')
        .select('id_groot, nome')
        .eq('status', 'Ativo')
        .order('nome'),
    ]);
    
    setAgenda((agendaData || []) as Agenda[]);
    setColabs(colabsData || []);
    setLoading(false);
  }

  async function salvar() {
    if (!titulo.trim()) {
      alert('Digite um título');
      return;
    }
    
    setSalvando(true);
    
    try {
      const agendaId = 'AG-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      
      const { error } = await supabase.from('agenda').insert({
        agenda_id: agendaId,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        data_evento: dataEvento,
        hora_inicio: horaInicio,
        tipo,
        colab_id_groot: colabSelecionado?.id_groot || null,
        colab_nome: colabSelecionado?.nome || null,
        alarme_ativo: true,
        alarme_minutos_antes: alarmeMinutos,
        alarme_vibrar: alarmeVibrar,
        status: 'pendente',
      });
      
      if (error) throw new Error(error.message);
      
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      
      // Reset
      setTitulo('');
      setDescricao('');
      setColabSelecionado(null);
      setBuscaColab('');
      setModalAberto(false);
      await carregar();
      
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function concluir(id: number) {
    await supabase.from('agenda').update({
      status: 'concluida',
      concluida_em: new Date().toISOString(),
    }).eq('id', id);
    
    if (navigator.vibrate) navigator.vibrate(50);
    carregar();
  }

  async function deletar(id: number) {
    if (!confirm('Apagar essa tarefa?')) return;
    await supabase.from('agenda').delete().eq('id', id);
    carregar();
  }

  // Agrupa por data
  const agrupado: Record<string, Agenda[]> = {};
  agenda.forEach((a) => {
    if (!agrupado[a.data_evento]) agrupado[a.data_evento] = [];
    agrupado[a.data_evento].push(a);
  });

  const colabsFiltrados = buscaColab.length > 0
    ? colabs.filter(c => c.nome.toLowerCase().includes(buscaColab.toLowerCase()))
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">📅 Agenda</h2>
          <p className="text-xs text-gray-400">
            {agenda.length} {agenda.length === 1 ? 'tarefa pendente' : 'tarefas pendentes'}
          </p>
        </div>
        <button
          onClick={() => setModalAberto(true)}
          className="bg-gradient-to-br from-[#FFD700] to-yellow-500 text-black font-black w-12 h-12 rounded-full shadow-lg shadow-yellow-500/30 active:scale-95 transition-all flex items-center justify-center text-2xl"
        >
          +
        </button>
      </div>

      {/* Permissão de notificação */}
      {typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default' && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-center">
          <p className="text-yellow-300 text-xs font-bold mb-2">
            🔔 Habilita as notificações pra receber alarmes
          </p>
          <button
            onClick={() => Notification.requestPermission()}
            className="bg-yellow-500/30 text-white text-xs font-bold px-3 py-1.5 rounded-lg"
          >
            Habilitar
          </button>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="text-center py-8">
          <span className="text-4xl block mb-2 animate-pulse">⏳</span>
          <p className="text-gray-500 text-sm">Carregando...</p>
        </div>
      ) : agenda.length === 0 ? (
        <div className="bg-[#1a1a1a] border-2 border-dashed border-[#2a2a2a] rounded-2xl p-8 text-center">
          <span className="text-5xl block mb-2">📭</span>
          <p className="text-white font-bold mb-1">Nada agendado</p>
          <p className="text-xs text-gray-400 mb-4">
            Toque no <span className="text-[#FFD700] font-bold">+</span> pra criar uma tarefa
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(agrupado).map(([data, items]) => (
            <div key={data}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-bold uppercase ${
                  ehHoje(data) ? 'text-[#FFD700]' :
                  ehAmanha(data) ? 'text-blue-300' :
                  'text-gray-400'
                }`}>
                  {ehHoje(data) ? '📍 HOJE' : ehAmanha(data) ? '⏭️ AMANHÃ' : formatarData(data)}
                </span>
              </div>
              
              <div className="space-y-2">
                {items.map((evt) => {
                  const config = TIPOS_EVENTO[evt.tipo as keyof typeof TIPOS_EVENTO] || TIPOS_EVENTO.tarefa;
                  const minutosAte = calcularMinutosAte(evt.data_evento, evt.hora_inicio);
                  const eminente = minutosAte > 0 && minutosAte <= 30;
                  
                  return (
                    <div
                      key={evt.id}
                      className={`bg-[#1a1a1a] border rounded-xl p-3 ${
                        eminente ? 'border-[#FFD700]/60 shadow-lg shadow-yellow-500/10 animate-pulse' : 'border-[#2a2a2a]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-2xl flex-shrink-0">{config.emoji}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold text-gray-500">
                              {evt.hora_inicio}
                            </span>
                            {evt.alarme_ativo && (
                              <span className="text-[10px] text-purple-300">
                                🔔 -{evt.alarme_minutos_antes}m
                              </span>
                            )}
                            {eminente && (
                              <span className="text-[10px] text-[#FFD700] font-bold">
                                ⚡ em {minutosAte}m
                              </span>
                            )}
                          </div>
                          <p className="text-white font-bold text-sm">{evt.titulo}</p>
                          {evt.colab_nome && (
                            <p className="text-xs text-cyan-400 mt-0.5">👤 {evt.colab_nome}</p>
                          )}
                          {evt.descricao && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{evt.descricao}</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex gap-2 mt-3 pt-3 border-t border-[#2a2a2a]">
                        <button
                          onClick={() => concluir(evt.id)}
                          className="flex-1 bg-green-500/20 text-green-300 text-xs font-bold py-2 rounded-lg active:scale-95"
                        >
                          ✅ Concluir
                        </button>
                        <button
                          onClick={() => deletar(evt.id)}
                          className="bg-red-500/20 text-red-300 text-xs font-bold px-3 py-2 rounded-lg active:scale-95"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL CRIAR */}
      {modalAberto && (
        <div className="fixed inset-0 z-[9999] flex items-end bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] w-full max-h-[90vh] overflow-y-auto rounded-t-3xl border-t-2 border-[#FFD700]/30 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-white">➕ Nova tarefa</h3>
              <button
                onClick={() => setModalAberto(false)}
                className="w-8 h-8 rounded-full bg-[#2a2a2a] text-white"
              >
                ×
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Título</label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Feedback com João"
                className="w-full bg-[#0a0a0a] border-2 border-[#2a2a2a] focus:border-[#FFD700] rounded-xl px-4 py-3 text-white outline-none"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Tipo</label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(TIPOS_EVENTO) as (keyof typeof TIPOS_EVENTO)[]).map((t) => {
                  const config = TIPOS_EVENTO[t];
                  return (
                    <button
                      key={t}
                      onClick={() => setTipo(t)}
                      className={`p-2 rounded-xl text-center transition-all ${
                        tipo === t
                          ? 'bg-[#FFD700]/20 border-2 border-[#FFD700]'
                          : 'bg-[#0a0a0a] border-2 border-[#2a2a2a]'
                      }`}
                    >
                      <div className="text-xl">{config.emoji}</div>
                      <p className="text-[10px] font-bold text-white">{config.label}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Data</label>
                <input
                  type="date"
                  value={dataEvento}
                  onChange={(e) => setDataEvento(e.target.value)}
                  className="w-full bg-[#0a0a0a] border-2 border-[#2a2a2a] rounded-xl px-4 py-3 text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Hora</label>
                <input
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  className="w-full bg-[#0a0a0a] border-2 border-[#2a2a2a] rounded-xl px-4 py-3 text-white outline-none"
                />
              </div>
            </div>

            {/* Colab opcional */}
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                Colab (opcional)
              </label>
              {!colabSelecionado ? (
                <>
                  <input
                    type="text"
                    value={buscaColab}
                    onChange={(e) => setBuscaColab(e.target.value)}
                    placeholder="Buscar colab..."
                    className="w-full bg-[#0a0a0a] border-2 border-[#2a2a2a] rounded-xl px-4 py-3 text-white outline-none"
                  />
                  {colabsFiltrados.length > 0 && (
                    <div className="mt-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl max-h-40 overflow-y-auto">
                      {colabsFiltrados.slice(0, 5).map((c) => (
                        <button
                          key={c.id_groot}
                          onClick={() => { setColabSelecionado(c); setBuscaColab(''); }}
                          className="w-full px-3 py-2 text-left text-sm text-white active:bg-[#1a1a1a] border-b border-[#2a2a2a] last:border-0"
                        >
                          {c.nome}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-xl px-4 py-3 flex items-center justify-between">
                  <p className="text-white text-sm">👤 {colabSelecionado.nome}</p>
                  <button onClick={() => setColabSelecionado(null)} className="text-red-400 text-sm">
                    Remover
                  </button>
                </div>
              )}
            </div>

            {/* Alarme */}
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3">
              <p className="text-xs font-bold text-purple-300 uppercase mb-2">🔔 Alarme</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[5, 15, 30].map((min) => (
                  <button
                    key={min}
                    onClick={() => setAlarmeMinutos(min)}
                    className={`py-2 rounded-lg text-xs font-bold ${
                      alarmeMinutos === min
                        ? 'bg-purple-500/40 text-white'
                        : 'bg-[#0a0a0a] text-gray-400'
                    }`}
                  >
                    -{min}min
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-white">
                <input
                  type="checkbox"
                  checked={alarmeVibrar}
                  onChange={(e) => setAlarmeVibrar(e.target.checked)}
                  className="w-4 h-4"
                />
                📳 Vibrar quando disparar
              </label>
            </div>

            <button
              onClick={salvar}
              disabled={salvando}
              className="w-full bg-gradient-to-br from-[#FFD700] to-yellow-500 text-black font-black py-4 rounded-xl active:scale-95 disabled:opacity-50"
            >
              {salvando ? '⏳ Salvando...' : '💾 Criar tarefa'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
