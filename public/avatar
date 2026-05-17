// app/components/AstronautAvatar.tsx
'use client';

import Image from 'next/image';

type Props = {
  size?: number;
  alt?: string;
  className?: string;
  priority?: boolean;
};

export function AstronautAvatar({
  size = 48,
  alt = 'Avatar',
  className = '',
  priority = false,
}: Props) {
  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        display: 'inline-block',
        background: '#fff',
        border: '1px solid rgba(255,255,255,0.12)',
      }}
    >
      <Image
        src="/avatars/astronaut-vest.png"
        alt={alt}
        width={size}
        height={size}
        priority={priority}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    </span>
  );
}
