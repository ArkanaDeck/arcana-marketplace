import { Helmet } from 'react-helmet-async';

const SITE_URL = 'https://arkcards.com';
const DEFAULT_TITLE = 'ArkCards Public Notice Board';
const DEFAULT_DESCRIPTION = 'ArkCards is a public notice board for local notices, community events, and community listings.';

const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
        {
            '@type': 'WebSite',
            '@id': `${SITE_URL}/#website`,
            url: SITE_URL,
            name: 'ArkCards',
            description: DEFAULT_DESCRIPTION,
            inLanguage: 'en',
        },
        {
            '@type': 'CollectionPage',
            '@id': `${SITE_URL}/#collectionpage`,
            url: SITE_URL,
            name: DEFAULT_TITLE,
            description: 'Browse local public notices, community events, and listings on ArkCards.',
            isPartOf: { '@id': `${SITE_URL}/#website` },
            inLanguage: 'en',
        },
    ],
};

type SeoProps = {
    title?: string;
    description?: string;
};

export function Seo({ title = DEFAULT_TITLE, description = DEFAULT_DESCRIPTION }: SeoProps) {
    return (
        <Helmet>
            <title>{title}</title>
            <meta name="description" content={description} />
            <link rel="canonical" href={SITE_URL} />
            <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
        </Helmet>
    );
}