module.exports = {
  content: [
    './index.html',
    './src/**/*.{vue,js}'
  ],
  theme: {
    extend: {
      colors: {
        'vr-bg':    '#07020F',
        'vr-stage': 'rgb(24,10,46)',
        'vr-panel': 'rgb(14,4,32)',
        'vr-pink':  '#FF2F87',
        'vr-gold':  '#FFE066',
        'vr-teal':  '#3FD0C9',
        'vr-cream': '#FFF5DC',
        'vr-border':'rgb(58,27,92)',
      },
      fontFamily: {
        title:  ['"Monoton"', '"Bowlby One SC"', 'Impact', 'sans-serif'],
        ui:     ['"Bowlby One SC"', '"Bowlby One"', 'Impact', 'sans-serif'],
        body:   ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono:   ['"JetBrains Mono"', '"DM Mono"', 'ui-monospace', 'monospace'],
      },
      animation: {
        'vr-float':   'vr-float 4s ease-in-out infinite',
        'vr-spin':    'vr-spin 8s linear infinite',
        'vr-pulse':   'vr-pulse 2s ease-in-out infinite',
        'vr-glow':    'vr-glow 2s ease-in-out infinite',
      },
    }
  },
  plugins: []
};
