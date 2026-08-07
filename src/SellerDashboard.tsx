import React from 'react';

export default function SellerDashboard() {
  return (
    <div className="p-6 max-w-4xl mx-auto bg-white rounded-lg border border-[#E5E7EB] shadow-sm my-6 text-[#1F2937]">
      <h2 className="text-2xl font-bold mb-4">📦 Seller Fulfillment Dashboard</h2>
      
      <div className="mb-6 p-4 bg-[#FAFAFA] border-l-4 border-[#D4AF37] rounded">
        <p className="text-sm font-semibold">Active Shipping Logistics Guidelines (UK Locked)</p>
      </div>

      <div className="space-y-4">
        <p><strong>Step 1:</strong> Pack the Tarot Deck securely (use bubble wrap to protect the card box corners!).</p>
        <p><strong>Step 2:</strong> Copy the buyer's UK shipping address displayed below.</p>
        
        <div className="p-4 bg-white border border-[#E5E7EB] rounded my-2 font-mono text-sm">
          [Buyer Delivery Address Block Manifests Here]
        </div>

        <p><strong>Step 3:</strong> Head to the official courier page to buy your label:</p>
        <ul class="list-disc pl-6 space-y-2">
          <li>If the buyer chose Evri: <a href="https://evri.com" target="_blank" rel="noreferrer" className="text-[#D4AF37] hover:underline font-semibold">Click here to open Evri Send (evri.com)</a></li>
          <li>If the buyer chose Royal Mail: <a href="https://royalmail.com" target="_blank" rel="noreferrer" className="text-[#D4AF37] hover:underline font-semibold">Click here to open Royal Mail Click & Drop (royalmail.com)</a></li>
        </ul>

        <p><strong>Step 4:</strong> Choose the 'Drop off at shop / No printer needed' option. The courier will email a digital QR Code to your phone.</p>
        <p><strong>Step 5:</strong> Take your parcel to your local Post Office or Evri ParcelShop. They will scan your phone's QR code and print the sticky shipping label for free!</p>
        <p><strong>Step 6:</strong> Once dropped off, paste your tracking reference number in the box below to notify the buyer.</p>
      </div>

      <div className="mt-6 pt-4 border-t border-[#E5E7EB]">
        <label className="block text-sm font-medium mb-2">Tracking Reference Number</label>
        <div className="flex gap-2">
          <input type="text" placeholder="e.g. 123456789012345" className="p-2 border border-[#E5E7EB] rounded w-full focus:outline-none focus:border-[#D4AF37]" />
          <button className="bg-[#D4AF37] text-white px-4 py-2 rounded font-semibold hover:bg-opacity-90 transition">Submit</button>
        </div>
      </div>
    </div>
  );
}
