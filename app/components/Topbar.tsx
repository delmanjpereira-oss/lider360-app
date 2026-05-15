'use client';

import { useState, useEffect } from 'react';

export default function Topbar() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setTime(`${hours}:${minutes}`);
    };

    updateTime();

    const now = new Date();
    const msAtePromoMinuto = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

    let interval: ReturnType<typeof setInterval>;

    const timeout = setTimeout(() => {
      updateTime();
      interval = setInterval(updateTime, 60000);
    }, msAtePromoMinuto);

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  return (
    <header className="h-16 bg-[#0f0f0f] border-b border-[#2a2a2a] px-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-2xl">😊</span>
        <div>
          <p className="text-sm text-gray-400">Olá,</p>
          <p className="text-white font-bold">Delman</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          className="relative p-2 rounded-lg hover:bg-[#1a1a1a] transition-colors"
          aria-label="Notificações"
        >
          <span className="text-xl">🔔</span>
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        <div className="px-4 py-2 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a]">
          <span className="text-[#FFD700] font-bold tabular-nums">
            {time || '--:--'}
          </span>
        </div>
      </div>
    </header>
  );
}
