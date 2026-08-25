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
        // Paleta oficial ObraTrack
        brand: {
          orange: '#FF6A00', // Naranjo Obra
          'orange-hover': '#E55F00',
          'orange-light': 'rgba(255, 106, 0, 0.12)',
          carbon: '#1E1E1E', // Carbón
          'carbon-light': '#2A2A2A',
          cement: '#9A9A9A', // Gris Cemento
          'cement-light': '#E8E8E8',
          green: '#6B8F72',  // Verde Terreno
          'green-dark': '#55735B',
          'green-light': 'rgba(107, 143, 114, 0.15)',
        },
        kraft: {
          50: '#FAF8F5',
          100: '#F3F0E8', // Fondo general suave
          200: '#E5DFC9',
          300: '#D5CCAD',
          800: '#4A4333',
        },
        navy: {
          900: '#141414',
          800: '#1E1E1E', // Fondo Carbón para Sidebars y Headers
          700: '#2A2A2A',
          600: '#383838',
        },
        obra: {
          orange: '#FF6A00', // Naranjo Obra Oficial
          'orange-hover': '#E55F00',
          'orange-light': 'rgba(255, 106, 0, 0.12)',
          green: '#6B8F72',  // Verde Terreno Oficial
          'green-light': 'rgba(107, 143, 114, 0.15)',
          red: '#D94336',    // Alertas/Imprevistos
          'red-light': 'rgba(217, 67, 54, 0.12)',
          gray: '#9A9A9A',   // Gris Cemento Oficial
          carbon: '#1E1E1E', // Carbón Oficial
        }
      },
      fontFamily: {
        heading: ['var(--font-space-grotesk)', 'Space Grotesk', 'sans-serif'],
        sans: ['var(--font-inter)', 'Inter', 'sans-serif'],
        mono: ['var(--font-ibm-plex-mono)', 'IBM Plex Mono', 'monospace'],
      },
      backgroundImage: {
        'blueprint-grid': "radial-gradient(rgba(255, 106, 0, 0.15) 1px, transparent 1px)",
      },
      backgroundSize: {
        'blueprint-size': '20px 20px',
      }
    },
  },
  plugins: [],
};

export default config;
