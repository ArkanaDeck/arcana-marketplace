import React from 'react';
import { loadDeckListing, loadSimilarActiveListings, type MarketplaceListing } from './lib/listings';
import { Seo } from './seo';

type DeckDetailPageProps = { listingId: string; onBack: () => void };

const deckPath = (listingId: string) => `/decks/${encodeURIComponent(listingId)}`;

const listingPriceLabel = (listing: MarketplaceListing) =>
    listing.listingType === 'sale' ? `For sale - £${listing.price.toFixed(2)}` : listing.listingType === 'swap' ? 'Open to swap' : 'Free to a good home';

export type DeckMetadata = { title: string; description: string; path: string };

export function generateMetadata(listing: MarketplaceListing): DeckMetadata {
    return {
        title: `${listing.name} | ArkCards`,
        description: (listing.description || `${listing.name} - ${listing.condition} condition tarot and oracle deck on ArkCards.`).slice(0, 160),
        path: deckPath(listing.id),
    };
}

export const DeckDetailPage: React.FC<DeckDetailPageProps> = ({ listingId, onBack }) => {
    const [listing, setListing] = React.useState<MarketplaceListing | null>(null);
    const [similarListings, setSimilarListings] = React.useState<MarketplaceListing[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [status, setStatus] = React.useState<string | null>(null);

    React.useEffect(() => {
        let isCancelled = false;
        setLoading(true);
        loadDeckListing(listingId)
            .then(async (deck) => {
                if (isCancelled) return;
                setListing(deck);
                if (!deck) return;
                const alternatives = await loadSimilarActiveListings(deck.category || 'other', deck.id).catch(() => []);
                if (!isCancelled) setSimilarListings(alternatives);
            })
            .catch((error) => { if (!isCancelled) setStatus(error instanceof Error ? error.message : 'Unable to load this deck.'); })
            .finally(() => { if (!isCancelled) setLoading(false); });
        return () => { isCancelled = true; };
    }, [listingId]);

    if (loading) return <section className="seller-profile-page"><p>Loading deck...</p></section>;
    if (!listing) {
        return <section className="seller-profile-page">
            <p className="account-status" role="alert">{status || 'This deck could not be found.'}</p>
            <button type="button" className="secondary-btn" onClick={onBack}>Back to marketplace</button>
        </section>;
    }

    const isCompleted = listing.status === 'completed';

    return <section className="seller-profile-page deck-detail-page">
        <Seo {...generateMetadata(listing)} />
        <button type="button" className="account-text-btn" onClick={onBack}>Back to marketplace</button>

        {isCompleted && (
            <div className="deck-completed-banner" role="status">
                <span className="deck-completed-banner__icon" aria-hidden="true">🎉</span>
                <p>This deck has successfully found a new home! Browse alternative available items below.</p>
            </div>
        )}

        <article className="seller-profile-header deck-detail-header">
            {listing.images.length > 0 ? (
                <div className="listing-image-row deck-detail-images">
                    {listing.images.map((imageUrl, index) => (
                        <a key={imageUrl} href={imageUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open full-resolution image ${index + 1} of ${listing.name}`}>
                            <img src={imageUrl} alt={`${listing.name} photo ${index + 1}`} className="live-uploaded-img" />
                        </a>
                    ))}
                </div>
            ) : <span className="default-card-emoji">🎴</span>}
            <div>
                <h1>{listing.name}</h1>
                {isCompleted
                    ? <span className="listing-type-badge deck-detail-rehomed-badge">Rehomed</span>
                    : listing.status === 'sold'
                        ? <div className="listing-sold-badge">SOLD</div>
                        : <span className={`listing-type-badge listing-type-badge--${listing.listingType}`}>{listingPriceLabel(listing)}</span>}
                <p>Condition: {listing.condition}{listing.freeDelivery ? ' · Free delivery' : ''}</p>
                {listing.description && <p className="listing-description">{listing.description}</p>}
                <a className="seller-profile-link" href={`/app/profile/${encodeURIComponent(listing.sellerId)}`}>View seller profile</a>
            </div>
        </article>

        {similarListings.length > 0 && (
            <section className="similar-decks" aria-labelledby="similar-decks-heading">
                <div className="seller-profile-section-heading">
                    <div><p className="eyebrow">Still available</p><h2 id="similar-decks-heading">Similar Decks Available Now</h2></div>
                    <span>{similarListings.length} decks</span>
                </div>
                <div className="similar-decks__track">
                    {similarListings.map((similar) => (
                        <a key={similar.id} className="similar-deck-card" href={deckPath(similar.id)}>
                            <div className="similar-deck-card__image">
                                {similar.image ? <img src={similar.image} alt={similar.name} loading="lazy" /> : <span className="default-card-emoji">🎴</span>}
                            </div>
                            <div className="similar-deck-card__body">
                                <h3>{similar.name}</h3>
                                <span className={`listing-type-badge listing-type-badge--${similar.listingType}`}>{listingPriceLabel(similar)}</span>
                                <p>Condition: {similar.condition}</p>
                            </div>
                        </a>
                    ))}
                </div>
            </section>
        )}
    </section>;
};
