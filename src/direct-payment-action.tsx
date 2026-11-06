import React from 'react';
import { isIosApp } from './lib/app-store-purchase';

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
            <span>{isIosApp() ? 'Keep chats inside Arkana and agree delivery and payment with the seller in chat.' : 'Keep chats inside Arkana and use “Goods & Services” for external payments to preserve protection pathways.'}</span>
        </div>
    );

    // App Store review (Guideline 4): the iOS app must not send buyers to the web to pay.
    if (directPaymentLink?.trim() && !isIosApp()) {
        return (
            <div className="direct-pay-wrap" onClick={(event) => event.stopPropagation()}>
                {safetyBanner}
                <button type="button" className="direct-pay-btn" onClick={() => window.open(directPaymentLink, '_blank', 'noopener,noreferrer')}>
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
