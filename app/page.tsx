export default function Home() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-8">
      <div className="text-center max-w-2xl">
        <div className="mb-6 text-6xl">🚀</div>

        <h1 className="text-5xl font-black mb-3">
          LÍDER <span className="text-[#FFD700]">360</span>
        </h1>

        <p className="text-gray-400 text-lg mb-2">
          Painel do Líder Operacional
        </p>
        <p className="text-gray-500 text-sm mb-10">
          Versão 2.0 • Next.js + Vercel
        </p>

        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-8 shadow-2xl">
          <h2 className="text-2xl font-bold mb-4 text-[#FFD700]">
            🎉 Bem-vindo, Delman!
          </h2>
          <p className="text-gray-300 mb-6">
            Seu novo painel está em construção. Em breve:
          </p>
          <ul className="text-left space-y-2 text-gray-300">
            <li>✅ Mantra ABS</li>
            <li>✅ Available Time</li>
            <li>✅ Calculadora NET</li>
            <li>✅ Registro de Presença</li>
            <li>✅ MEU TIME</li>
            <li>✅ Calibração Trimestral</li>
            <li>✅ Copiloto IA</li>
            <li>✅ Boletim de Produção</li>
            <li>✅ Upload DPMO</li>
          </ul>
        </div>

        <p className="text-gray-600 text-xs mt-8">
          Dev: <strong className="text-gray-400">Delman Pereira</strong> • RC01 Perus
        </p>
      </div>
    </main>
  );
}
