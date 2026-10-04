import { Capacitor } from '@capacitor/core';

export const DRIVE_TRAFFIC_PRODUCT_ID = 'com.arkcards.app.drivetraffic';
const CREDIT_STORAGE_KEY = 'arkana-iap-drivetraffic-credits';

export const isIosApp = () => Capacitor.getPlatform() === 'ios';

export type PurchaseOutcome = { status: 'purchased'; signedTransaction: string } | { status: 'cancelled' } | { status: 'pending' };

type NativePurchaseResult = { signedTransaction?: string; deferred?: boolean; cancelled?: boolean; pending?: boolean; error?: string };
type PurchaseWindow = Window & {
    __arkcardsPurchaseResult?: (result: NativePurchaseResult) => void;
    webkit?: { messageHandlers?: { arkCardsPurchase?: { postMessage: (payload: Record<string, string>) => void } } };
};

let pendingPurchase: { resolve: (outcome: PurchaseOutcome) => void; reject: (error: Error) => void } | null = null;

function readCredits(): string[] {
    try {
        const stored = JSON.parse(localStorage.getItem(CREDIT_STORAGE_KEY) || '[]');
        return Array.isArray(stored) ? stored.filter((value) => typeof value === 'string') : [];
    } catch {
        return [];
    }
}

function writeCredits(credits: string[]) {
    try {
        localStorage.setItem(CREDIT_STORAGE_KEY, JSON.stringify(credits));
    } catch {
        // Storage can be unavailable; the in-flight purchase still resolves to the caller.
    }
}

function storeCredit(signedTransaction: string) {
    const credits = readCredits();
    if (!credits.includes(signedTransaction)) writeCredits([...credits, signedTransaction]);
}

// Paid but not yet used on a published listing; the server still re-verifies ownership.
export function getUnusedDriveTrafficCredit(): string | null {
    return readCredits()[0] ?? null;
}

export function consumeDriveTrafficCredit(signedTransaction: string) {
    writeCredits(readCredits().filter((credit) => credit !== signedTransaction));
}

export function acknowledgeDriveTrafficFulfillment(transactionId: string) {
    if (!isIosApp()) return;
    const handler = (window as PurchaseWindow).webkit?.messageHandlers?.arkCardsPurchase;
    handler?.postMessage({ action: 'fulfilled', transactionId });
}

export function initNativePurchaseBridge() {
    const purchaseWindow = window as PurchaseWindow;
    const handler = purchaseWindow.webkit?.messageHandlers?.arkCardsPurchase;
    if (!isIosApp() || !handler || purchaseWindow.__arkcardsPurchaseResult) return;

    purchaseWindow.__arkcardsPurchaseResult = (result) => {
        if (result.signedTransaction) storeCredit(result.signedTransaction);
        if (result.deferred || !pendingPurchase) return;

        const { resolve, reject } = pendingPurchase;
        pendingPurchase = null;
        if (result.signedTransaction) resolve({ status: 'purchased', signedTransaction: result.signedTransaction });
        else if (result.cancelled) resolve({ status: 'cancelled' });
        else if (result.pending) resolve({ status: 'pending' });
        else reject(new Error(result.error || 'The App Store purchase did not complete.'));
    };
    handler.postMessage({ action: 'ready' });
}

export function purchaseDriveTraffic(userId: string): Promise<PurchaseOutcome> {
    const handler = (window as PurchaseWindow).webkit?.messageHandlers?.arkCardsPurchase;
    if (!isIosApp() || !handler) return Promise.reject(new Error('In-app purchases are only available in the iOS app.'));
    if (pendingPurchase) return Promise.reject(new Error('A purchase is already in progress.'));
    initNativePurchaseBridge();
    return new Promise((resolve, reject) => {
        pendingPurchase = { resolve, reject };
        handler.postMessage({ productId: DRIVE_TRAFFIC_PRODUCT_ID, appAccountToken: userId });
    });
}
