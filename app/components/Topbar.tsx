'use client';

import { useState, useEffect } from 'react';

export default function Topbar() {
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    // Função pra atualizar o relógio
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setTime(`${hours}:${minutes}`);
    };

    // Atualiza imediatamente
    updateTime();

    // Calcula quanto falta pro próximo minuto cheio
    const now = new Date();
    const segundosFaltam = 60 - now.getSeconds();
    const msFaltam = segundosFaltam * 1000 - now.getMilliseconds();

    // Aguarda até virar o minuto e aí começa a atualizar a cada 60s
    const timeout = setTimeout(() => {
      updateTime();
      const interval = setInterval(updateTime, 60000);
      // Salva o interval pra limpar depois
      (window as any).__clockInterval = interval;
    }, msFaltam);

    return () => {
      clearTimeout(timeout);
      if ((window as any).__clockInterval) {
        clearInterval((window as any).__clockInterval);
      }
    };
  }, []);

  return (
    <header className="h-16 bg-[#0f0f0f] border-b border-[#2a2a2a] px-6 flex items-center justify-between">
      {/* Esquerda: saudação */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">😊</span>
        <div>
          <p className="text-sm text-gray-400">Olá,</p>
          <p className="text-white font-bold">Delman</p>
        </div>
      </div>

      {/* Direita: notificações
