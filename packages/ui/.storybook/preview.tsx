import type { Preview } from '@storybook/react';
import '@luna/tokens/v3/tokens.css';
import '@luna/tokens/v3/fonts.css';
import '../src/v3/v3.css';
import { Tema, TEMAS, type TemaId } from '../src/v3/components';

/** Os quatro temas na barra do Storybook (data-tema="oceano|ouro|limao|esboco"). */
const preview: Preview = {
  globalTypes: {
    tema: {
      description: 'Tema da organização',
      toolbar: { title: 'Tema', icon: 'paintbrush', items: TEMAS, dynamicTitle: true },
    },
  },
  initialGlobals: { tema: 'oceano' },
  decorators: [
    (Story, ctx) => (
      <Tema tema={(ctx.globals.tema as TemaId) ?? 'oceano'}>
        <Story />
      </Tema>
    ),
  ],
};
export default preview;
