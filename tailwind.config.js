/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        background: {
          darkest: '#0B0D13',
          dark: '#11141D',
          card: '#181C27',
          surface: '#202636'
        },
        border: {
          subtle: '#282F42',
          strong: '#363E56'
        },
        brand: {
          primary: '#10B981',
          hover: '#059669',
          accent: '#06B6D4'
        },
        primary: {
          DEFAULT: '#10B981',
          hover: '#059669',
          accent: '#06B6D4',
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b'
        }
      },
      fontFamily: {
        sans: ['var(--font-sans, "Plus Jakarta Sans")', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    }
  },
  plugins: []
}
