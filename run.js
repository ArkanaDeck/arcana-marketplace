const fs = require('fs');
let src = fs.readFileSync('src/App.tsx', 'utf8');
const patch = `  const [newCategory, setNewCategory] = useState('Tarot');
  const [shipCourier, setShipCourier] = useState('Royal Mail');
  const [shipCost, setShipCost] = useState('4.45');
  const [qrTrackingToggle, setQrTrackingToggle] = useState(false);
  const [extraInstructionType, setExtraInstructionType] = useState('none');
  const [extraInstructionText, setExtraInstructionText] = useState('');
  const handleCreateListingSubmit = (e) => {
    e.preventDefault();
    setListings([{ id: Date.now(), title: newTitle, category: newCategory, description: newDesc, price: newPrice, condition: newCondition, location: newLoc, sellerEmail: newEmail, images: newImage || ["🔮"], courier: shipCourier, shippingCost: shipCost, qrTracking: qrTrackingToggle, collectionAddress: extraInstructionType === 'collection' ? extraInstructionText : undefined, customShippingRules: extraInstructionType === 'shipping' ? extraInstructionText : undefined }, ...listings]);
    alert("Published successfully!");
    setCurrentView('Listings');
  };`;

if (!src.includes('handleCreateListingSubmit')) {
  src = src.replace('export default function App() {', 'export default function App() {\n' + patch);
  fs.writeFileSync('src/App.tsx', src);
  console.log('Done!');
} else {
  console.log('Already injected!');
}
