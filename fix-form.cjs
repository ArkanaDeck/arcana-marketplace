const fs = require('fs');
let src = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Remove misplaced shipping fields from old spots to prevent duplicates
src = src.replace(/<SafeShippingManager[\s\S]*?\/>\s*<ExtraShippingDetailsManager[\s\S]*?\/>/g, '');

// 2. Safely re-inject them directly below the Location input field with correct brackets
const targetField = `<div className="form-group" style={{ marginBottom: '16px' }}>\n          <label style={{ display: 'block', fontWeight: 600, color: '#114E60', marginBottom: '6px' }}>General Location City Address</label>\n          <input type="text" value={newLoc} onChange={e => setNewLoc(e.target.value)} placeholder="e.g. London, UK / Manchester Hub" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} />\n        </div>`;

const injectedFields = targetField + `\n\n        <SafeShippingManager selectedCourier={shipCourier} setSelectedCourier={setShipCourier} shippingPrice={shipCost} setShippingPrice={setShipCost} useQrCodeTracking={qrTrackingToggle} setUseQrCodeTracking={setQrTrackingToggle} />\n        <ExtraShippingDetailsManager rulesType={extraInstructionType} setRulesType={setExtraInstructionType} detailsText={extraInstructionText} setDetailsText={setExtraInstructionText} />`;

if (src.includes('value={newLoc}') && !src.includes('selectedCourier={shipCourier}')) {
  src = src.replace(targetField, injectedFields);
  fs.writeFileSync('src/App.tsx', src);
  console.log('Layout repaired perfectly!');
} else {
  console.log('Layout is already aligned!');
}
