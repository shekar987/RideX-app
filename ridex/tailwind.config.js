module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  future: {
    // Only emit hover: styles inside @media (hover: hover) — on touch screens a
    // tapped button otherwise stays "hovered" until something else is tapped.
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      keyframes: {
        // Used by the driver ride-request popup (left-0 right-0, so no translateX)
        slideDown: {
          '0%':   { transform: 'translateY(-110%)', opacity: '0' },
          '100%': { transform: 'translateY(0)',      opacity: '1' },
        },
      },
      animation: {
        slideDown: 'slideDown 0.3s ease-out',
      },
    },
  },
  plugins: [
    // Safe-area utilities for notched phones / home indicator (viewport-fit=cover is set in index.html)
    function({ addUtilities }) {
      addUtilities({
        '.pb-safe': { 'padding-bottom': 'env(safe-area-inset-bottom, 0px)' },
        '.pt-safe': { 'padding-top':    'env(safe-area-inset-top, 0px)' },
        '.pl-safe': { 'padding-left':   'env(safe-area-inset-left, 0px)' },
        '.pr-safe': { 'padding-right':  'env(safe-area-inset-right, 0px)' },
      });
    },
  ],
}
