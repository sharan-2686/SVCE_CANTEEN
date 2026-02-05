import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { io } from 'socket.io-client'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const socket = io(API, { autoConnect: false })

const statusFlow = ['queued', 'preparing', 'ready', 'collected']

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '')
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'))
  const [identifier, setIdentifier] = useState('student@svce.edu')
  const [password, setPassword] = useState('student123')
  const [message, setMessage] = useState('')

  const api = useMemo(() => axios.create({
    baseURL: API,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  }), [token])

  useEffect(() => {
    if (!token) return
    socket.connect()
    return () => socket.disconnect()
  }, [token])

  const login = async () => {
    try {
      const { data } = await axios.post(`${API}/auth/login`, { identifier, password })
      setToken(data.token)
      setUser(data.user)
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      setMessage('Logged in successfully')
    } catch {
      setMessage('Login failed')
    }
  }

  const logout = () => {
    setToken('')
    setUser(null)
    localStorage.clear()
  }

  if (!user) {
    return (
      <div className="container auth-card">
        <h1>Smart Digital Canteen Ordering System</h1>
        <p>Use demo credentials: student@svce.edu / staff@svce.edu / admin@svce.edu</p>
        <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Email or College ID" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" />
        <button onClick={login}>Login</button>
        <p>{message}</p>
      </div>
    )
  }

  return (
    <div className="container">
      <header>
        <h2>Welcome, {user.name} ({user.role})</h2>
        <button onClick={logout}>Logout</button>
      </header>
      {user.role === 'student' && <StudentView api={api} user={user} />}
      {user.role === 'staff' && <StaffView api={api} user={user} />}
      {user.role === 'admin' && <AdminView api={api} />}
    </div>
  )
}

function StudentView({ api }) {
  const [canteens, setCanteens] = useState([])
  const [selectedCanteen, setSelectedCanteen] = useState('')
  const [menu, setMenu] = useState([])
  const [cart, setCart] = useState([])
  const [pickupSlot, setPickupSlot] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('UPI')
  const [myOrders, setMyOrders] = useState([])

  const load = async () => {
    const c = await api.get('/canteens')
    setCanteens(c.data)
    const o = await api.get('/orders/my')
    setMyOrders(o.data)
  }

  useEffect(() => {
    load()
    socket.on('order:updated', load)
    return () => socket.off('order:updated', load)
  }, [])

  useEffect(() => {
    if (!selectedCanteen) return
    api.get(`/menus?canteenId=${selectedCanteen}`).then((res) => setMenu(res.data))
    setCart([])
  }, [selectedCanteen])

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((x) => x.menuId === item.id)
      if (existing) return prev.map((x) => x.menuId === item.id ? { ...x, quantity: x.quantity + 1 } : x)
      return [...prev, { menuId: item.id, name: item.name, quantity: 1, price: item.price }]
    })
  }

  const placeOrder = async () => {
    const payment = await api.post('/orders/payment/verify', { paymentMethod })
    await api.post('/orders', { canteenId: selectedCanteen, items: cart.map(({ menuId, quantity }) => ({ menuId, quantity })), pickupSlot, paymentId: payment.data.paymentId })
    setCart([])
    setPickupSlot('')
    load()
  }

  const total = cart.reduce((sum, x) => sum + x.price * x.quantity, 0)

  return (
    <section>
      <h3>Student Ordering Portal</h3>
      <div className="grid-2">
        <div className="card">
          <h4>Select Canteen</h4>
          <select value={selectedCanteen} onChange={(e) => setSelectedCanteen(e.target.value)}>
            <option value="">Choose</option>
            {canteens.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ul>
            {menu.map((item) => (
              <li key={item.id}>
                {item.name} - ₹{item.price} - {item.available ? 'Available' : 'Sold Out'}
                <button disabled={!item.available} onClick={() => addToCart(item)}>Add</button>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h4>Cart</h4>
          {cart.map((x) => <p key={x.menuId}>{x.name} x {x.quantity}</p>)}
          <p>Total: ₹{total}</p>
          <input type="datetime-local" value={pickupSlot} onChange={(e) => setPickupSlot(e.target.value)} />
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option>UPI</option><option>CARD</option><option>WALLET</option>
          </select>
          <button disabled={!cart.length || !pickupSlot} onClick={placeOrder}>Pay & Place Order</button>
        </div>
      </div>
      <div className="card">
        <h4>Order History & Tracking</h4>
        {myOrders.map((o) => (
          <div key={o.id} className="order-item">
            <p><strong>Token:</strong> {o.numericToken} | <strong>Status:</strong> {o.status}</p>
            <p><strong>Pickup:</strong> {new Date(o.pickupSlot).toLocaleString()} | <strong>Total:</strong> ₹{o.total}</p>
            <img src={o.qrCode} alt="order qr" width="70" />
          </div>
        ))}
      </div>
    </section>
  )
}

function StaffView({ api, user }) {
  const [orders, setOrders] = useState([])
  const [menu, setMenu] = useState([])
  const [token, setToken] = useState('')
  const [verification, setVerification] = useState('')

  const load = async () => {
    const [o, m] = await Promise.all([api.get('/staff/orders'), api.get(`/menus?canteenId=${user.canteenId}`)])
    setOrders(o.data)
    setMenu(m.data)
  }

  useEffect(() => {
    load()
    socket.on('order:created', load)
    socket.on('order:updated', load)
    return () => {
      socket.off('order:created', load)
      socket.off('order:updated', load)
    }
  }, [])

  const advance = async (order) => {
    const next = statusFlow[statusFlow.indexOf(order.status) + 1]
    if (!next) return
    await api.patch(`/orders/${order.id}/status`, { status: next })
    load()
  }

  const toggleAvailability = async (item) => {
    await api.patch(`/staff/menu/${item.id}`, { available: !item.available })
    load()
  }

  const verifyToken = async () => {
    try {
      const { data } = await api.post('/orders/verify-token', { token })
      setVerification(`Verified: ${data.order.id} (${data.order.status})`)
    } catch {
      setVerification('Invalid token')
    }
  }

  return (
    <section>
      <h3>Canteen Staff Dashboard</h3>
      <div className="grid-2">
        <div className="card">
          <h4>Incoming Orders</h4>
          {orders.map((o) => (
            <div key={o.id} className="order-item">
              <p>{o.numericToken} - {new Date(o.pickupSlot).toLocaleTimeString()} - {o.status}</p>
              <button disabled={o.status === 'collected'} onClick={() => advance(o)}>Advance Status</button>
            </div>
          ))}
        </div>
        <div className="card">
          <h4>Token Verification</h4>
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Enter token" />
          <button onClick={verifyToken}>Verify</button>
          <p>{verification}</p>
        </div>
      </div>
      <div className="card">
        <h4>Menu Availability</h4>
        {menu.map((m) => (
          <p key={m.id}>{m.name} - {m.available ? 'Available' : 'Sold Out'} <button onClick={() => toggleAvailability(m)}>Toggle</button></p>
        ))}
      </div>
    </section>
  )
}

function AdminView({ api }) {
  const [overview, setOverview] = useState(null)
  const [users, setUsers] = useState([])
  const [canteens, setCanteens] = useState([])

  useEffect(() => {
    Promise.all([api.get('/admin/overview'), api.get('/admin/users'), api.get('/admin/canteens')]).then(([o, u, c]) => {
      setOverview(o.data)
      setUsers(u.data)
      setCanteens(c.data)
    })
  }, [])

  if (!overview) return <p>Loading...</p>

  return (
    <section>
      <h3>Admin Dashboard</h3>
      <div className="grid-3">
        <div className="card"><h4>Total Orders</h4><p>{overview.totalOrders}</p></div>
        <div className="card"><h4>Total Sales</h4><p>₹{overview.totalSales}</p></div>
        <div className="card"><h4>Peak Time</h4><p>{overview.peakTime}:00 hrs</p></div>
      </div>
      <div className="card">
        <h4>Popular Items</h4>
        {overview.popularItems.map((item) => <p key={item.name}>{item.name} ({item.qty})</p>)}
      </div>
      <div className="grid-2">
        <div className="card">
          <h4>Users</h4>
          {users.map((u) => <p key={u.id}>{u.name} - {u.role}</p>)}
        </div>
        <div className="card">
          <h4>Canteens</h4>
          {canteens.map((c) => <p key={c.id}>{c.name} - Menu Items: {c.menuCount}</p>)}
        </div>
      </div>
    </section>
  )
}

export default App
