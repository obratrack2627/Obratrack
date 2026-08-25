import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        kraft: {
          50: '#FAF8F5',
          100: '#F3F0E8', // Fondo general
          200: '#E5DFC9',
          300: '#D5CCAD',
          800: '#4A4333',
        },
        navy: {
          900: '#071D31',
          800: '#0B2E4D', // Sidebar azul marino oscuro
          700: '#10436E',
          600: '#175D99',
        },
        obra: {
          orange: '#E8630A', // Naranja construcción acento
          'orange-hover': '#CF5606',
          'orange-light': 'rgba(232, 99, 10, 0.12)',
          green: '#2F855A',  // Verde pagado/completado
          'green-light': 'rgba(47, 133, 90, 0.12)',
          red: '#B23A2E',    // Rojo atrasos/imprevistos
          'red-light': 'rgba(178, 58, 46, 0.12)',
          gray: '#6B7280',
        }
      },
      fontFamily: {
        heading: ['var(--font-space-grotesk)', 'Space Grotesk', 'sans-serif'],
        sans: ['var(--font-inter)', 'Inter', 'sans-serif'],
        mono: ['var(--font-ibm-plex-mono)', 'IBM Plex Mono', 'monospace'],
      },
      backgroundImage: {
        'blueprint-grid': "radial-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px)",
      },
      backgroundSize: {
        'blueprint-size': '20px 20px',
      }
    },
  },
  plugins: [],
};

export default config;
