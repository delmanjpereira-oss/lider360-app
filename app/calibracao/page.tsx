export default function CalibracaoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-black mb-2">
          📋 Calibração <span className="text-[#FFD700]">Trimestral</span>
        </h1>
        <p className="text-gray-400">
          IMA + QUE + COMO por processo
        </p>
      </div>

      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
        <span className="text-6xl block mb-4">🔧</span>
        <h2 className="text-2xl font-bold text-[#FFD700] mb-2">
          Em Construção
        </h2>
        <p className="text-gray-400">
          Calibração com cálculo automático de IMA a partir do DPMO.
        </p>
      </div>
    </div>
  );
}
