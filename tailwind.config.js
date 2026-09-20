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
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    }
  },
  plugins: []
}
