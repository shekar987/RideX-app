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
  plugins: [],
}