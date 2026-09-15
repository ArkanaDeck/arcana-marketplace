import React from 'react';

type DirectPaymentActionProps = {
    directPaymentLink: string | null | undefined;
    onChat: (initialMessage: string) => void;
    listingTitle: string;
    isStartingChat?: boolean;
};

export const DirectPaymentAction: React.FC<DirectPaymentActionProps> = ({ directPaymentLink, onChat, listingTitle, isStartingChat = false }) => {
    const initialMessage = `Hi!
Is "${listingTitle}" still available?
I have a question about it and wanted to discuss delivery options.`;

    const safetyBanner = (
        <div className="marketplace-safety-banner safety-banner-enter" role="note">
            <strong>Marketplace Safety Tip</strong>
            <span>Keep chats inside Arkana and use “Goods &amp; Services” for external payments to preserve protection pathways.</span>
        </div>
    );

    if (directPaymentLink?.trim()) {
        return (
            <div className="direct-pay-wrap" onClick={(event) => event.stopPropagation()}>
                {safetyBanner}
                <button type="button" className="direct-pay-btn" onClick={() => window.open(directPaymentLink, '_blank')}>
                    💳 Pay Direct to Seller
                </button>
                <button type="button" className="message-seller-btn" onClick={() => onChat(initialMessage)} disabled={isStartingChat}>
                    💬 {isStartingChat ? 'Starting chat...' : 'Chat with Seller'}
                </button>
            </div>
        );
    }

    return (
        <div className="direct-pay-wrap" onClick={(event) => event.stopPropagation()}>
            {safetyBanner}
            <button type="button" className="message-seller-btn" onClick={() => onChat(initialMessage)} disabled={isStartingChat}>
                💬 {isStartingChat ? 'Starting chat...' : 'Chat with Seller to Buy'}
            </button>
        </div>
    );
};
