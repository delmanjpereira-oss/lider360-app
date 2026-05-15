import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        meli: {
          yellow: '#FFD700',
          dark: '#0a0a0a',
          card: '#1a1a1a',
          border: '#2a2a2a',
        },
      },
    },
  },
  plugins: [],
};

export default config;
