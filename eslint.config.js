import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// Flat Config. Start bewusst mit dem SYNTAKTISCHEN recommended-Satz (schnell,
// ~keine False Positives) — der typgestuetzte Satz (recommendedTypeChecked)
// kommt spaeter als eigener Schritt. `prettier` zuletzt: schaltet stilistische
// Regeln ab, die sonst gegen Prettier kaempfen.
export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    rules: {
      // TypeScript prueft undefinierte Bezeichner selbst — no-undef wuerde nur
      // Browser-Globals (window/document/...) faelschlich melden.
      'no-undef': 'off',
      // noUnusedLocals/Parameters failen bereits hart im Build; hier nur Warnung,
      // damit `_`-Prefixe erlaubt sind und keine Doppel-Meldung entsteht.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended, prettier],
  },
);
