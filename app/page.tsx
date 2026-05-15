export default function Home() {
  // Mock de dados — depois conectamos com banco real
  const stats = [
    { label: 'Colaboradores', value: '42', icon: '👥', color: 'text-[#FFD700]' },
    { label: 'Ofensores', value: '3', icon: '⚠️', color: 'text-red-400' },
    { label: 'Alinhados', value: '28', icon: '✅', color: 'text-green-400' },
    { label: 'Superas', value: '11', icon: '🏆', color: 'text-blue-400' },
  ];

  const features = [
    { icon: '📊', name: 'Mantra ABS', desc: 'Pendências e absenteísmo', status: 'ativo' },
    { icon: '⏱️', name: 'Available Time', desc: 'Disponibilidade do time', status: 'ativo' },
    { icon: '👥', name: 'MEU TIME', desc: 'Cards de colaboradores', status: 'em breve' },
    { icon: '📋', name: 'Calibração', desc: 'Calibração trimestral', status: 'em breve' },
    { icon: '🤖', name: 'Copiloto IA', desc: 'Análise inteligente', status: 'em breve' },
    { icon: '📰', name: 'Boletim Produção', desc: 'NET e DPMO do CT', status: 'em breve' },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black mb-2">
          Bem-vindo, <span className="text-[#FFD700]">Delman</span>
        </h1>
        <p className="text-gray-400">
          Sua visão completa da operação RC01 Perus
        </p>
      </div>

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 hover:border-[#FFD700] transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-3xl">{stat.icon}</span>
              <span className={`text-3xl font-black ${stat.color}`}>
                {stat.value}
              </span>
            </div>
            <p className="text-sm text-gray-400">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Banner de status */}
      <div className="bg-gradient-to-r from-[#FFD700]/10 to-transparent border border-[#FFD700]/30 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <span className="text-4xl">🚀</span>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-[#FFD700] mb-1">
              LÍDER 360 v2.0 — Em Construção
            </h2>
            <p className="text-gray-300 text-sm">
              Estamos construindo a nova versão do app. Em breve todas as features
              estarão disponíveis com banco de dados profissional, sem timeouts,
              instalável no celular como app nativo (PWA).
            </p>
          </div>
        </div>
      </div>

      {/* Features */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature) => (
            <div
              key={feature.name}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 hover:border-[#FFD700] transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl">{feature.icon}</span>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    feature.status === 'ativo'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {feature.status}
                </span>
              </div>
              <h3 className="text-lg font-bold mb-1 group-hover:text-[#FFD700] transition-colors">
                {feature.name}
              </h3>
              <p className="text-sm text-gray-400">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pt-8 border-t border-[#2a2a2a]">
        <p className="text-xs text-gray-600">
          LÍDER 360 v2.0 • Next.js + Vercel • Construído com ❤️ por Delman Pereira
        </p>
      </div>
    </div>
  );
}
