# Database Schema (MongoDB-ready)

## users
```js
{
  _id: ObjectId,
  name: String,
  email: { type: String, unique: true, index: true },
  collegeId: { type: String, unique: true, index: true },
  role: { type: String, enum: ['student', 'staff', 'admin'], index: true },
  canteenId: { type: ObjectId, ref: 'canteens', required: false },
  passwordHash: String,
  createdAt: Date,
  updatedAt: Date
}
```

## canteens
```js
{
  _id: ObjectId,
  name: String,
  location: String,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

## menu_items
```js
{
  _id: ObjectId,
  canteenId: { type: ObjectId, ref: 'canteens', index: true },
  name: String,
  description: String,
  price: Number,
  available: Boolean,
  imageUrl: String,
  category: String,
  createdAt: Date,
  updatedAt: Date
}
```

## orders
```js
{
  _id: ObjectId,
  studentId: { type: ObjectId, ref: 'users', index: true },
  canteenId: { type: ObjectId, ref: 'canteens', index: true },
  items: [
    {
      menuId: { type: ObjectId, ref: 'menu_items' },
      name: String,
      quantity: Number,
      price: Number
    }
  ],
  pickupSlot: Date,
  payment: {
    paymentId: String,
    gateway: String,
    method: String,
    status: String,
    verified: Boolean
  },
  total: Number,
  status: { type: String, enum: ['queued', 'preparing', 'ready', 'collected'], index: true },
  numericToken: { type: String, index: true },
  qrPayload: String,
  feedback: String,
  createdAt: Date,
  updatedAt: Date
}
```

## Suggested Indexes
- `orders: { canteenId: 1, pickupSlot: 1, status: 1 }`
- `orders: { studentId: 1, createdAt: -1 }`
- `menu_items: { canteenId: 1, available: 1 }`
