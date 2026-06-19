const { calculateMatchScore } = require('../lib/matching');

const lostItem = {
  id: 'lost-1',
  itemName: 'Redmi Note 9 phone',
  category: 'Electronics',
  description: 'I lost my Redmi Note 9 phone',
  location: 'Library',
  color: 'black',
  brand: 'Redmi',
  type: 'lost',
  imageUrl: '/uploads/0e6a69bf-7458-4498-b397-b8e7d7b8eae8.jpeg',
  date: '2026-06-18'
};

const foundItem = {
  id: 'found-1',
  itemName: 'Redmi Note 9 phone',
  category: 'Electronics',
  description: 'Found a Redmi Note 9 phone near library',
  location: 'Library',
  color: 'black',
  brand: 'Redmi',
  type: 'found',
  imageUrl: '/uploads/3784ff29-d01a-4ffb-aa55-a21140336962.jpeg',
  date: '2026-06-18'
};

const result = calculateMatchScore(lostItem, foundItem);
console.log('Match result:', result);
