import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

app.use(cors());
app.use(express.json());

const canteens = [
  { id: "block1", name: "Block 1", location: "Academic Block 1" },
  { id: "block5", name: "Block 5", location: "Academic Block 5" },
  { id: "oat", name: "OAT", location: "Open Air Theatre" },
  { id: "aavin", name: "Aavin", location: "Dairy Counter" }
];

const users = [
  { id: "stu-1", name: "Anita", email: "student@svce.edu", collegeId: "22CSE001", role: "student", passwordHash: bcrypt.hashSync("student123", 10) },
  { id: "staff-1", name: "Chef Ravi", email: "staff@svce.edu", collegeId: "STAFF101", role: "staff", canteenId: "block1", passwordHash: bcrypt.hashSync("staff123", 10) },
  { id: "admin-1", name: "Admin", email: "admin@svce.edu", collegeId: "ADMIN1", role: "admin", passwordHash: bcrypt.hashSync("admin123", 10) }
];

const menus = [
  { id: "m1", canteenId: "block1", name: "Idli (2 pcs)", price: 30, available: true },
  { id: "m2", canteenId: "block1", name: "Masala Dosa", price: 55, available: true },
  { id: "m3", canteenId: "block5", name: "Veg Fried Rice", price: 70, available: true },
  { id: "m4", canteenId: "oat", name: "Samosa", price: 20, available: false },
  { id: "m5", canteenId: "aavin", name: "Milkshake", price: 40, available: true }
];

const orders = [];

const generateNumericToken = () => Math.floor(100000 + Math.random() * 900000).toString();
const validTransitions = {
  queued: ["preparing"],
  preparing: ["ready"],
  ready: ["collected"],
  collected: []
};

function sanitizeUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function auth(requiredRoles = []) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Missing token" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      if (requiredRoles.length && !requiredRoles.includes(decoded.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      next();
    } catch {
      return res.status(401).json({ message: "Invalid token" });
    }
  };
}

io.on("connection", () => {});

app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/auth/login", async (req, res) => {
  const { identifier, password } = req.body;
  const user = users.find((u) => u.email === identifier || u.collegeId === identifier);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  const token = jwt.sign({ id: user.id, role: user.role, canteenId: user.canteenId }, JWT_SECRET, { expiresIn: "12h" });
  return res.json({ token, user: sanitizeUser(user) });
});

app.get("/canteens", auth(["student", "staff", "admin"]), (_, res) => {
  res.json(canteens);
});

app.get("/menus", auth(["student", "staff", "admin"]), (req, res) => {
  const { canteenId } = req.query;
  const filtered = canteenId ? menus.filter((m) => m.canteenId === canteenId) : menus;
  res.json(filtered);
});

app.post("/orders/payment/verify", auth(["student"]), (req, res) => {
  const { paymentMethod } = req.body;
  if (!["UPI", "CARD", "WALLET"].includes(paymentMethod)) {
    return res.status(400).json({ message: "Unsupported payment method" });
  }
  return res.json({ verified: true, paymentId: `pay_${uuidv4()}` });
});

app.post("/orders", auth(["student"]), async (req, res) => {
  const { canteenId, items, pickupSlot, paymentId } = req.body;
  if (!canteenId || !Array.isArray(items) || !items.length || !pickupSlot || !paymentId) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const enrichedItems = items.map((item) => {
    const menuItem = menus.find((m) => m.id === item.menuId && m.canteenId === canteenId);
    return { ...item, menuItem };
  });

  const invalid = enrichedItems.find((i) => !i.menuItem || !i.menuItem.available);
  if (invalid) {
    return res.status(400).json({ message: "One or more items unavailable" });
  }

  const total = enrichedItems.reduce((sum, i) => sum + i.menuItem.price * i.quantity, 0);
  const numericToken = generateNumericToken();
  const orderId = uuidv4();
  const qrPayload = JSON.stringify({ orderId, numericToken, studentId: req.user.id });
  const qrCode = await QRCode.toDataURL(qrPayload);

  const order = {
    id: orderId,
    studentId: req.user.id,
    canteenId,
    items: enrichedItems.map((i) => ({ menuId: i.menuItem.id, name: i.menuItem.name, quantity: i.quantity, price: i.menuItem.price })),
    pickupSlot,
    paymentId,
    total,
    status: "queued",
    numericToken,
    qrCode,
    createdAt: new Date().toISOString(),
    feedback: ""
  };

  orders.push(order);
  io.emit("order:created", order);
  res.status(201).json(order);
});

app.get("/orders/my", auth(["student"]), (req, res) => {
  res.json(orders.filter((o) => o.studentId === req.user.id));
});

app.patch("/orders/:id/status", auth(["staff", "admin"]), (req, res) => {
  const order = orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (req.user.role === "staff" && req.user.canteenId !== order.canteenId) {
    return res.status(403).json({ message: "Cannot modify other canteen orders" });
  }

  const { status } = req.body;
  if (!validTransitions[order.status]?.includes(status)) {
    return res.status(400).json({ message: `Invalid transition from ${order.status} to ${status}` });
  }
  order.status = status;
  io.emit("order:updated", order);
  res.json(order);
});

app.post("/orders/:id/feedback", auth(["student"]), (req, res) => {
  const order = orders.find((o) => o.id === req.params.id && o.studentId === req.user.id);
  if (!order) return res.status(404).json({ message: "Order not found" });
  order.feedback = req.body.feedback || "";
  res.json(order);
});

app.post("/orders/verify-token", auth(["staff", "admin"]), (req, res) => {
  const { token } = req.body;
  const order = orders.find((o) => o.numericToken === token);
  if (!order) return res.status(404).json({ message: "Invalid token" });
  if (req.user.role === "staff" && req.user.canteenId !== order.canteenId) {
    return res.status(403).json({ message: "Cannot verify this order" });
  }
  return res.json({ valid: true, order });
});

app.get("/staff/orders", auth(["staff", "admin"]), (req, res) => {
  const scoped = req.user.role === "staff" ? orders.filter((o) => o.canteenId === req.user.canteenId) : orders;
  const sorted = [...scoped].sort((a, b) => new Date(a.pickupSlot) - new Date(b.pickupSlot));
  res.json(sorted);
});

app.get("/staff/summary", auth(["staff", "admin"]), (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const scoped = orders.filter((o) => o.createdAt.startsWith(today) && (req.user.role === "admin" || o.canteenId === req.user.canteenId));
  const sales = scoped.reduce((sum, o) => sum + o.total, 0);
  res.json({ orders: scoped.length, sales, collected: scoped.filter((o) => o.status === "collected").length });
});

app.post("/staff/menu", auth(["staff", "admin"]), (req, res) => {
  const { canteenId, name, price, available = true } = req.body;
  if (req.user.role === "staff" && req.user.canteenId !== canteenId) {
    return res.status(403).json({ message: "Cannot create menu in another canteen" });
  }
  const item = { id: uuidv4(), canteenId, name, price: Number(price), available: Boolean(available) };
  menus.push(item);
  res.status(201).json(item);
});

app.patch("/staff/menu/:id", auth(["staff", "admin"]), (req, res) => {
  const item = menus.find((m) => m.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Menu item not found" });
  if (req.user.role === "staff" && req.user.canteenId !== item.canteenId) {
    return res.status(403).json({ message: "Cannot edit this menu" });
  }
  Object.assign(item, req.body);
  res.json(item);
});

app.delete("/staff/menu/:id", auth(["staff", "admin"]), (req, res) => {
  const idx = menus.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: "Menu item not found" });
  if (req.user.role === "staff" && req.user.canteenId !== menus[idx].canteenId) {
    return res.status(403).json({ message: "Cannot delete this menu" });
  }
  menus.splice(idx, 1);
  res.status(204).send();
});

app.get("/admin/overview", auth(["admin"]), (_, res) => {
  const totalSales = orders.reduce((sum, o) => sum + o.total, 0);
  const byHour = {};
  const itemFrequency = {};

  orders.forEach((o) => {
    const hour = new Date(o.createdAt).getHours();
    byHour[hour] = (byHour[hour] || 0) + 1;
    o.items.forEach((i) => {
      itemFrequency[i.name] = (itemFrequency[i.name] || 0) + i.quantity;
    });
  });

  const peakTime = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "N/A";
  const popularItems = Object.entries(itemFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  res.json({
    canteens: canteens.length,
    totalOrders: orders.length,
    totalSales,
    peakTime,
    popularItems
  });
});

app.get("/admin/users", auth(["admin"]), (_, res) => {
  res.json(users.map(sanitizeUser));
});

app.post("/admin/users", auth(["admin"]), (req, res) => {
  const { name, email, collegeId, role, password, canteenId } = req.body;
  const user = {
    id: uuidv4(),
    name,
    email,
    collegeId,
    role,
    canteenId,
    passwordHash: bcrypt.hashSync(password, 10)
  };
  users.push(user);
  res.status(201).json(sanitizeUser(user));
});

app.get("/admin/canteens", auth(["admin"]), (_, res) => {
  res.json(canteens.map((c) => ({ ...c, menuCount: menus.filter((m) => m.canteenId === c.id).length })));
});

httpServer.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
