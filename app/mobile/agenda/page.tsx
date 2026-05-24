'use client';

import Link from 'next/link';

export default function AgendaMobilePage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black text-white">📅 Agenda</h2>
        <p className="text-xs text-gray-400">Tarefas e reuniões com alarme</p>
      </div>

      {/* Em construção */}
      <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border-2 border-dashed border-blue-500/30 rounded-2xl p-8 text-center">
        <span className="text-6xl block mb-3">🚧</span>
        <h3 className="text-xl font-bold text-white mb-2">Em construção</h3>
        <p className="text-gray-400 text-sm mb-4">
          A agenda com alarmes e sincronia Google Calendar tá quase pronta!
        </p>
        <p className="text-xs text-gray-500">
          Em breve:
        </p>
        <ul className="text-xs text-gray-400 mt-2 space-y-1 text-left max-w-xs mx-auto">
          <li>✅ Criar tarefas/reuniões</li>
          <li>✅ Alarme + vibração</li>
          <li>✅ Sincronia Google Calendar</li>
          <li>✅ Notificações push</li>
        </ul>
      </div>

      <Link
        href="/mobile"
        className="block text-center bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl py-3 text-gray-400 active:bg-[#222]"
      >
        ← Voltar pra Home
      </Link>
    </div>
  );
}
