// Tailwind CSS v4 is wired through the dedicated PostCSS plugin — there is no
// tailwind.config.js, theme values live in src/app/globals.css via @theme.
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;