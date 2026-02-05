# Smart Digital Canteen Ordering System

Production-ready full-stack starter for SVCE campus canteens with three roles: **Student**, **Canteen Staff**, and **Admin**.

## Tech Stack
- **Frontend:** React + Vite (mobile responsive)
- **Backend:** Node.js + Express + Socket.IO
- **Auth:** JWT with role-based access
- **Database:** Designed for MongoDB (schema provided) with seeded in-memory data for local demo
- **Payment:** Mock verification flow (UPI/Card/Wallet), Razorpay/Stripe integration-ready
- **QR Token:** QR image + 6-digit numeric token generated per paid order

## Monorepo Structure
```
backend/
  server.js
frontend/
  src/
README.md
DATABASE_SCHEMA.md
```

## Demo Credentials
- Student: `student@svce.edu` / `student123`
- Staff: `staff@svce.edu` / `staff123`
- Admin: `admin@svce.edu` / `admin123`

## Run Locally
### 1) Backend
```bash
cd backend
npm install
npm run dev
```

### 2) Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`, backend at `http://localhost:5000`.

## Implemented Features
### Student Portal
- Login with email/college ID
- Browse canteens (Block 1, Block 5, OAT, Aavin)
- Live menus with availability and pricing
- Cart, pickup-slot selection, mock payment verification
- Place order with generated numeric token + QR
- Real-time status tracking (`Queued → Preparing → Ready → Collected`)
- Order history

### Canteen Staff Dashboard
- Secure role-based login
- Real-time incoming orders sorted by pickup time
- Status updates with enforced transition flow
- Token verification by numeric token
- Menu availability management (available/sold-out)
- Daily summary endpoint

### Admin Dashboard
- Global canteen and order visibility
- Analytics: total sales, peak hour, popular items
- User management endpoints
- Canteen + menu management endpoints

## Deployment Notes
- Replace in-memory arrays with MongoDB model persistence (schema included)
- Store JWT secret in environment variable
- Restrict CORS origins for production
- Integrate payment gateway signature verification for live transactions
