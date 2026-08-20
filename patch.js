const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const injection = `
  const [newCategory, setNewCategory] = useState('Tarot');
  const [shipCourier, setShipCourier] = useState('Royal Mail');
  const [shipCost, setShipCost] = useState('4.45');
  const [qrTrackingToggle, setQrTrackingToggle] = useState(false);
  const [extraInstructionType, setExtraInstructionType] = useState('none');
  const [extraInstructionText, setExtraInstructionText] = useState('');

  const handleCreateListingSubmit = (e) => {
    e.preventDefault();
    const itemPayload = {
      id: Date.now(),
      title: newTitle,
      category: newCategory,
      description: newDesc || "No description provided.",
      price: newPrice,
      condition: newCondition,
      location: newLoc || "UK Hub Collection Point",
      sellerEmail: newEmail,
      images: newImage || ["🔮"],
      courier: shipCourier,
      shippingCost: shipCost,
      qrTracking: qrTrackingToggle,
      collectionAddress: extraInstructionType === 'collection' ? extraInstructionText : undefined,
      customShippingRules: extraInstructionType === 'shipping' ? extraInstructionText : undefined
    };
    setListings([itemPayload, ...listings]);
    alert("Published successfully to " + newCategory + " Catalog Grid!");
    setNewTitle('');
    setNewPrice('');
    setNewEmail('');
    setNewLoc('');
    setNewDesc('');
    setExtraInstructionText('');
    setCurrentView('Listings');
  };
`;

if (!code.includes('handleCreateListingSubmit')) {
  code = code.replace('export default function App() {', 'export default function App() {\n' + injection);
  fs.writeFileSync('src/App.tsx', code);
  console.log('Successfully Injecting States!');
} else {
  console.log('Already injected!');
}
