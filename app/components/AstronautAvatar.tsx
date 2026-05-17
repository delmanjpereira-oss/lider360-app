// app/components/AstronautAvatar.tsx
'use client';

type Props = {
  size?: number;
  humor?: 'happy' | 'party' | 'surprised' | 'sad';
  className?: string;
};

export function AstronautAvatar({
  size = 70,
  humor = 'happy',
  className = '',
}: Props) {
  // Cores do colete (refletor) muda por humor
  const corColete =
    humor === 'sad'
      ? '#ef4444'      // vermelho — alerta
      : humor === 'surprised'
      ? '#f59e0b'      // laranja — atenção
      : humor === 'party'
      ? '#a855f7'      // roxo — festa
      : '#FFD700';     // amarelo MELI — feliz

  // Brilho do visor muda
  const brilhoVisor =
    humor === 'party' ? '#fff' : '#fff';

  // Reflexo no visor
  const reflexoVisor = '#fff';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block' }}
    >
      {/* Fundo branco arredondado */}
      <rect x="0" y="0" width="200" height="200" rx="20" fill="#fff" />

      {/* === CORPO/COLETE === */}
      {/* Macacão (corpo todo branco) */}
      <path
        d="M 60 110 Q 60 105 65 105 L 135 105 Q 140 105 140 110 L 140 175 L 60 175 Z"
        fill="#f8f8f8"
        stroke="#1a1a1a"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* COLETE refletivo (muda cor por humor) */}
      <path
        d="M 73 110 L 73 175 L 95 175 L 95 110 Z"
        fill={corColete}
        stroke="#1a1a1a"
        strokeWidth="2"
      />
      <path
        d="M 105 110 L 105 175 L 127 175 L 127 110 Z"
        fill={corColete}
        stroke="#1a1a1a"
        strokeWidth="2"
      />

      {/* Faixas brancas no colete */}
      <line x1="73" y1="125" x2="95" y2="125" stroke="#fff" strokeWidth="3" />
      <line x1="73" y1="155" x2="95" y2="155" stroke="#fff" strokeWidth="3" />
      <line x1="105" y1="125" x2="127" y2="125" stroke="#fff" strokeWidth="3" />
      <line x1="105" y1="155" x2="127" y2="155" stroke="#fff" strokeWidth="3" />

      {/* Zíper central */}
      <line
        x1="100"
        y1="110"
        x2="100"
        y2="175"
        stroke="#1a1a1a"
        strokeWidth="2"
      />

      {/* === BRAÇOS === */}
      {/* Braço esquerdo */}
      <path
        d="M 60 115 Q 45 130 48 160 Q 50 170 58 170 Q 65 170 65 162 L 65 130"
        fill="#f8f8f8"
        stroke="#1a1a1a"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Mão esquerda */}
      <circle cx="55" cy="172" r="8" fill="#f8f8f8" stroke="#1a1a1a" strokeWidth="2" />

      {/* Braço direito */}
      <path
        d="M 140 115 Q 155 130 152 160 Q 150 170 142 170 Q 135 170 135 162 L 135 130"
        fill="#f8f8f8"
        stroke="#1a1a1a"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Mão direita */}
      <circle cx="145" cy="172" r="8" fill="#f8f8f8" stroke="#1a1a1a" strokeWidth="2" />

      {/* === CAPACETE === */}
      {/* Pescoço (gola) */}
      <rect
        x="78"
        y="100"
        width="44"
        height="12"
        fill="#f8f8f8"
        stroke="#1a1a1a"
        strokeWidth="2.5"
        rx="2"
      />

      {/* Capacete (esfera) */}
      <circle
        cx="100"
        cy="65"
        r="42"
        fill="#fff"
        stroke="#1a1a1a"
        strokeWidth="3"
      />

      {/* Visor (vidro escuro) */}
      <ellipse
        cx="100"
        cy="68"
        rx="32"
        ry="28"
        fill="#1a1a1a"
        stroke="#1a1a1a"
        strokeWidth="2"
      />

      {/* Reflexo grande no visor (curva clara) */}
      <path
        d="M 80 55 Q 95 45 110 50 Q 115 55 110 60 Q 95 55 80 55 Z"
        fill={reflexoVisor}
        opacity="0.85"
      />

      {/* Reflexo pequeno embaixo */}
      <ellipse cx="115" cy="78" rx="6" ry="3" fill={brilhoVisor} opacity="0.7" />

      {/* Antenas/parafusos do capacete (laterais) */}
      <circle cx="58" cy="65" r="5" fill="#f8f8f8" stroke="#1a1a1a" strokeWidth="2" />
      <circle cx="142" cy="65" r="5" fill="#f8f8f8" stroke="#1a1a1a" strokeWidth="2" />

      {/* Sombra sutil embaixo */}
      <ellipse cx="100" cy="178" rx="40" ry="4" fill="#000" opacity="0.1" />
    </svg>
  );
}
