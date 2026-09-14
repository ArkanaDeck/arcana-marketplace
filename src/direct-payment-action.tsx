import React from 'react';

type DirectPaymentActionProps = {
    directPaymentLink: string | null | undefined;
    onChat: (initialMessage: string) => void;
    listingTitle: string;
};

export const DirectPaymentAction: React.FC<DirectPaymentActionProps> = ({ directPaymentLink, onChat, listingTitle }) => {
    const initialMessage = `Hi! Is "${listingTitle}" still available? I have a question about it and wanted to discuss delivery options.`;

    const safetyBanner = (
        <div className="marketplace-safety-banner safety-banner-enter" role="note">
            <strong>Marketplace safety tip</strong>
            <span>Keep chats inside Arkana. If completing an external transaction, use “Goods &amp; Services” to preserve available protection pathways.</span>
        </div>
    );

    if (directPaymentLink?.trim()) {
        return (
            <div className="direct-pay-wrap" onClick={(event) => event.stopPropagation()}>
                {safetyBanner}
                <button type="button" className="direct-pay-btn" onClick={() => window.open(directPaymentLink, '_blank')}>
                    💳 Pay Direct to Seller
                </button>
                <button type="button" className="message-seller-btn" onClick={() => onChat(initialMessage)}>
                    💬 Chat with Seller
                </button>
                <p className="direct-pay-helper direct-pay-helper--secure">💳 Secure Checkout: Supports Card, Apple Pay, Google Pay, or PayPal</p>
                <p className="direct-pay-helper direct-pay-helper--notice">⚠️ You are transacting directly with the seller. Coordinate delivery arrangements via our chat system.</p>
            </div>
        );
    }

    return (
        <div className="direct-pay-wrap" onClick={(event) => event.stopPropagation()}>
            {safetyBanner}
            <button type="button" className="message-seller-btn" onClick={() => onChat(initialMessage)}>
                💬 Chat with Seller to Buy
            </button>
            <p className="direct-pay-helper direct-pay-helper--notice">Have a question about this tarot deck? Message the seller directly.</p>
        </div>
    );
};
