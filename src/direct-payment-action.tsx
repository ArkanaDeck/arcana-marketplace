import React from 'react';

type DirectPaymentActionProps = {
    directPaymentLink: string | null | undefined;
    onChat: () => void;
};

export const DirectPaymentAction: React.FC<DirectPaymentActionProps> = ({ directPaymentLink, onChat }) => {
    if (directPaymentLink?.trim()) {
        return (
            <div className="direct-pay-wrap" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="direct-pay-btn" onClick={() => window.open(directPaymentLink, '_blank')}>
                    💳 Pay Direct to Seller
                </button>
                <p className="direct-pay-helper direct-pay-helper--secure">💳 Secure Checkout: Supports Card, Apple Pay, Google Pay, or PayPal</p>
                <p className="direct-pay-helper direct-pay-helper--notice">⚠️ You are transacting directly with the seller. Coordinate delivery arrangements via our chat system.</p>
            </div>
        );
    }

    return (
        <div className="direct-pay-wrap" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="message-seller-btn" onClick={onChat}>
                💬 Chat with Seller
            </button>
            <p className="direct-pay-helper direct-pay-helper--notice">Have a question about this tarot deck? Message the seller directly.</p>
        </div>
    );
};
