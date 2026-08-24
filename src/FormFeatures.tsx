import React from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';


//  Eye-catching visibility rules listener component
export const CategoryRulesListener = ({ category }: { category: string }) => {
    if (category === 'Trading Cards') {
        return <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '6px', color: '#166534', marginBottom: '12px', fontSize: '0.85rem' }}>⚡ <strong>TCG Rule:</strong> List card conditions (PSA, BGS, or raw) inside descriptions.</div>;
    }
    if (category === 'Board Games') {
        return <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '6px', color: '#1e40af', marginBottom: '12px', fontSize: '0.85rem' }}>📦 <strong>Board Game Rule:</strong> Specify missing pieces or box tier shelf wear.</div>;
    }
    return null;
};

// Seamless browser event capturing submission block
export const submitNewListingPayload = (
    e: React.FormEvent,
    formVariables: any,
    listingsArray: any[],
    setListingsArray: Function,
    onFinish: Function
) => {
    e.preventDefault(); // Stop page refreshes instantly

    const itemPayload = {
        id: Date.now(),
        title: formVariables.title,
        category: formVariables.category,
        description: formVariables.desc || "No description.",
        price: formVariables.price,
        condition: formVariables.condition,
        location: formVariables.location || "UK Hub Collection Point",
        sellerEmail: formVariables.email,
        imagePreview: formVariables.images.length > 0 ? formVariables.images : ["🔮"],
        courier: formVariables.courier,
        shippingCost: formVariables.cost
    };

    setListingsArray([itemPayload, ...listingsArray]); // Re-render grid loop instantly
    alert("Published successfully!");
    onFinish();
};
