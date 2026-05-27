/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand accent: deep clinical teal (desaturated, not the AI sky-blue).
        primary: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        // Glass: top edge refraction highlight + wide low-opacity diffusion tinted to slate.
        card: 'inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px 0 rgb(15 23 42 / 0.04), 0 16px 40px -18px rgb(15 23 42 / 0.18)',
        'card-hover': 'inset 0 1px 0 0 rgb(255 255 255 / 0.8), 0 2px 6px 0 rgb(15 23 42 / 0.06), 0 26px 50px -20px rgb(15 23 42 / 0.24)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        // Slow organic drift for the mesh-gradient blobs (GPU-friendly: transform only).
        'blob-a': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(6%, 8%) scale(1.12)' },
        },
        'blob-b': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(-7%, 5%) scale(1.08)' },
        },
        'blob-c': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(5%, -7%) scale(1.14)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 1.6s infinite',
        'blob-a': 'blob-a 20s ease-in-out infinite',
        'blob-b': 'blob-b 26s ease-in-out infinite',
        'blob-c': 'blob-c 32s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
