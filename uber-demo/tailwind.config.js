module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        slideDown: {
          '0%':   { transform: 'translateX(-50%) translateY(-110%)', opacity: '0' },
          '100%': { transform: 'translateX(-50%) translateY(0)',      opacity: '1' },
        },
      },
      animation: {
        slideDown: 'slideDown 0.3s ease-out',
      },
    },
  },
  plugins: [
    function({ addUtilities }) {
      addUtilities({
        '.pb-safe': { 'padding-bottom': 'env(safe-area-inset-bottom, 0px)' },
        '.pt-safe': { 'padding-top':    'env(safe-area-inset-top, 0px)' },
      });
    },
  ],
}