// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://mcp-tool-shop-org.github.io',
  base: '/runforge-vscode',
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    starlight({
      title: 'RunForge',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/mcp-tool-shop-org/runforge-vscode' },
      ],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Overview', slug: 'handbook' },
            { label: 'For beginners', slug: 'handbook/beginners' },
            { label: 'Getting started', slug: 'handbook/getting-started' },
          ],
        },
        {
          label: 'Operations',
          items: [
            { label: 'Cancel & recovery', slug: 'handbook/cancel-and-recovery' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Commands & settings', slug: 'handbook/reference' },
          ],
        },
        {
          label: 'Contracts',
          items: [
            { label: 'CONTRACTS.md (architecture rules)', link: 'https://github.com/mcp-tool-shop-org/runforge-vscode/blob/main/docs/CONTRACTS.md' },
            { label: 'Phase 4 contract', link: 'https://github.com/mcp-tool-shop-org/runforge-vscode/blob/main/CONTRACT-PHASE-4.md' },
            { label: 'Trust model', link: 'https://github.com/mcp-tool-shop-org/runforge-vscode/blob/main/docs/TRUST_MODEL.md' },
          ],
        },
      ],
      customCss: ['./src/styles/starlight-custom.css'],
      disable404Route: true,
    }),
  ],
});
