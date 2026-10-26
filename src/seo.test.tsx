import { renderToStaticMarkup } from 'react-dom/server';
import { HelmetProvider, type HelmetServerState } from 'react-helmet-async';
import { describe, expect, it } from 'vitest';
import initialHtml from '../index.html?raw';
import config from '../vercel.json';
import { HomeIntro } from './home-intro';
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, Seo } from './seo';

describe('homepage indexing', () => {
    it('serves the same substantive introduction before and after React starts', () => {
        const introduction = renderToStaticMarkup(<HomeIntro />);
        const elements = introduction.match(/<(h1|p)\b[^>]*>[^<]+<\/\1>/g);

        expect(elements).toHaveLength(4);
        for (const element of elements ?? []) {
            expect(initialHtml).toContain(element);
        }
        expect(initialHtml.match(/<h1\b/g)).toHaveLength(1);
        expect(initialHtml).not.toContain('<div id="app"></div>');
    });

    it('ships accurate metadata and a single Helmet-managed canonical link', () => {
        expect(initialHtml).toContain(`<title>${DEFAULT_TITLE.replace(/&/g, '&amp;')}</title>`);
        expect(initialHtml).toContain(`<meta name="description" content="${DEFAULT_DESCRIPTION}" data-rh="true">`);
        expect(initialHtml.match(/rel="canonical"/g)).toHaveLength(1);
        expect(initialHtml).toContain('<link rel="canonical" href="https://arkcards.com/" data-rh="true">');
    });

    it('uses the same metadata after rendering and preserves listing canonicals', () => {
        for (const props of [{}, { title: 'A deck | ArkCards', description: 'A listed deck', path: '/decks/example' }]) {
            const context: { helmet?: HelmetServerState | null } = {};
            renderToStaticMarkup(<HelmetProvider context={context}><Seo {...props} /></HelmetProvider>);

            expect(context.helmet?.title.toString()).toContain((props.title ?? DEFAULT_TITLE).replace(/&/g, '&amp;'));
            expect(context.helmet?.meta.toString()).toContain(props.description ?? DEFAULT_DESCRIPTION);
            expect(context.helmet?.link.toString()).toContain(`href="https://arkcards.com${props.path ?? '/'}"`);
            expect(context.helmet?.script.toString()).not.toContain('community events');
        }
    });

    it('permanently redirects only the www host and retains the requested path', () => {
        expect(config.redirects).toContainEqual({
            source: '/:path*',
            has: [{ type: 'host', value: 'www.arkcards.com' }],
            destination: 'https://arkcards.com/:path*',
            permanent: true,
        });
    });
});
