export default function CopilotoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-black mb-2">
          🤖 Copiloto <span className="text-[#FFD700]">IA</span>
        </h1>
        <p className="text-gray-400">
          Análise inteligente e prioridades do dia
        </p>
      </div>

      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
        <span className="text-6xl block mb-4">🔧</span>
        <h2 className="text-2xl font-bold text-[#FFD700] mb-2">
          Em Construção
        </h2>
        <p className="text-gray-400">
          Com IA generativa real (Claude ou Gemini) integrada.
        </p>
      </div>
    </div>
  );
}
