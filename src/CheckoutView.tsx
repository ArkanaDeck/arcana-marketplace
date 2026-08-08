import React, { useState, useEffect } from 'react';

export default function CheckoutView() {
  const [basket, setBasket] = useState<{ id: string; name: string; price: number }[]>([
    { id: '1', name: 'Arkana Golden Tarot Deck (Example)', price: 25.00 }
  ]);
  const [shipping, setShipping] = useState<number>(2.99);
  const [postcode, setPostcode] = useState<string>('');
  const [isPostcodeValid, setIsPostcodeValid] = useState<boolean>(true);
  const [isOrdered, setIsOrdered] = useState<boolean>(false);

  // Validate UK Postcode format
  const handlePostcodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setPostcode(val);
    const ukPostcodeRegex = /^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/;
    setIsPostcodeValid(val === '' || ukPostcodeRegex.test(val));
  };

  const deckTotal = basket.reduce((sum, item) => sum + item.price, 0);
  const totalCost = deckTotal + shipping;

  if (isOrdered) {
    return (
      <div className="p-6 max-w-xl mx-auto bg-white rounded-lg border border-[#E5E7EB] text-center my-12 text-[#1F2937]">
        <h2 className="text-3xl font-bold text-[#D4AF37] mb-2">🎉 Order Placed!</h2>
        <p className="mb-6">Thank you for your guest checkout order. 100% of your funds went straight to the seller.</p>
        <div className="bg-[#FAFAFA] p-6 rounded border border-[#E5E7EB] mb-6">
          <p className="text-sm font-semibold mb-2">Save Your Details</p>
          <p className="text-xs text-gray-500 mb-4">Type a password below to turn this guest order into a free permanent account.</p>
          <input type="password" placeholder="Choose a password" className="p-2 border border-[#E5E7EB] rounded w-full mb-3" />
          <button className="w-full bg-[#D4AF37] text-white py-2 rounded font-semibold hover:bg-opacity-90">Create Free Account</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 text-[#1F2937]">
      <div className="md:col-span-2 bg-white p-6 rounded-lg border border-[#E5E7EB]">
        <h2 className="text-xl font-bold mb-4">🇬🇧 Secure UK Guest Checkout</h2>
        <form onSubmit={(e) => { e.preventDefault(); if(isPostcodeValid && postcode) setIsOrdered(true); }} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Full Name</label>
            <input type="text" required className="w-full p-2 border border-[#E5E7EB] rounded" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Email Address</label>
            <input type="email" required className="w-full p-2 border border-[#E5E7EB] rounded" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Country</label>
              <input type="text" value="United Kingdom" disabled className="w-full p-2 border border-[#E5E7EB] rounded bg-gray-100 cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">UK Postcode</label>
              <input type="text" value={postcode} onChange={handlePostcodeChange} required className={`w-full p-2 border rounded ${!isPostcodeValid ? 'border-red-500' : 'border-[#E5E7EB]'}`} />
              {!isPostcodeValid && <p className="text-red-500 text-xs mt-1">Invalid UK Postcode format</p>}
            </div>
          </div>
          <button type="submit" disabled={!isPostcodeValid || !postcode} className="w-full mt-4 bg-[#D4AF37] text-white py-3 rounded font-semibold disabled:opacity-50">Pay Now (£{totalCost.toFixed(2)})</button>
        </form>
      </div>

      <div className="bg-[#FAFAFA] p-6 rounded-lg border border-[#E5E7EB] h-fit">
        <h3 className="text-lg font-bold mb-4">Shopping Basket</h3>
        {basket.map(item => (
          <div key={item.id} className="flex justify-between text-sm py-2 border-b border-gray-200">
            <span>{item.name}</span>
            <span className="font-semibold">£{item.price.toFixed(2)}</span>
          </div>
        ))}
        <div className="mt-4 space-y-2">
          <label className="block text-xs font-semibold">Select Postage courier</label>
          <select value={shipping} onChange={(e) => setShipping(parseFloat(e.target.value))} className="w-full p-2 bg-white border border-[#E5E7EB] rounded text-sm">
            <option value={2.99}>Evri Standard Drop-off — £2.99</option>
            <option value={3.65}>Royal Mail Tracked 48 — £3.65</option>
            <option value={4.65}>Royal Mail Tracked 24 — £4.65</option>
          </select>
        </div>
        <div className="mt-6 pt-4 border-t border-gray-300 flex justify-between font-bold text-lg">
          <span>Total:</span>
          <span>£{totalCost.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
