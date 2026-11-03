import React, { useState, useEffect } from 'react';
import './style.css';
import { qrBase64 } from './qrData.js';

// Dynamic API Base URL: Works on localhost, Linux VM IP, or domain seamlessly
const API_BASE = `http://${window.location.hostname}:5000/api`;

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('user') || '');

  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [slipFile, setSlipFile] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [orders, setOrders] = useState([]);
  
  // Plugin: Shipping & Tracking state
  const [pluginActive, setPluginActive] = useState(false);
  const [algorithm, setAlgorithm] = useState('');
  const [shipments, setShipments] = useState({});

  // Fetch shipping info from Shipping Plugin (Handles fallback gracefully if plugin is off)
  const fetchShipping = () => {
    fetch(`${API_BASE}/shipping`)
      .then(res => res.json())
      .then(data => {
        if (data && data.pluginActive) {
          setPluginActive(true);
          setAlgorithm(data.algorithm || 'P1');
          const map = {};
          if (Array.isArray(data.shipments)) {
            data.shipments.forEach(s => { map[s.orderId] = s; });
          }
          setShipments(map);
        } else {
          setPluginActive(false);
          setAlgorithm('');
          setShipments({});
        }
      })
      .catch(() => {
        setPluginActive(false);
        setAlgorithm('');
        setShipments({});
      });
  };

  // Fetch orders from Order Service
  const fetchOrders = () => {
    if (token) {
      fetch(`${API_BASE}/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setOrders(data);
        })
        .catch(err => console.error(err));
      
      fetchShipping();
    }
  };

  // Initial load
  useEffect(() => {
    if (token) {
      fetch(`${API_BASE}/products`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setProducts(data);
        })
        .catch(err => console.error(err));

      fetchOrders();
    }
  }, [token]);

  // Handle Authentication (Login / Register)
  const handleAuth = async (e) => {
    e.preventDefault();
    const endpoint = isRegisterMode ? '/register' : '/login';

    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameInput, password: passwordInput })
    });
    const data = await res.json();

    if (res.ok) {
      if (isRegisterMode) {
        alert(data.message || 'Registration successful. Please log in.');
        setIsRegisterMode(false);
      } else {
        setToken(data.token);
        setCurrentUser(data.username);
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', data.username);
      }
    } else {
      alert(data.error || 'Authentication failed');
    }
  };

  const handleLogout = () => {
    setToken('');
    setCurrentUser('');
    setCart([]);
    setOrders([]);
    setShipments({});
    localStorage.clear();
  };

  // Add Item to Cart
  const addToCart = (product) => {
    setCart(prev => {
      const exist = prev.find(item => item._id === product._id || item.id === product.id);
      const idKey = product._id ? '_id' : 'id';
      if (exist) {
        return prev.map(item =>
          item[idKey] === product[idKey] ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  // Remove Item from Cart
  const removeFromCart = (productId) => {
    setCart(prev => {
      const exist = prev.find(item => (item._id || item.id) === productId);
      if (exist && exist.qty > 1) {
        return prev.map(item =>
          (item._id || item.id) === productId ? { ...item, qty: item.qty - 1 } : item
        );
      }
      return prev.filter(item => (item._id || item.id) !== productId);
    });
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

  // Handle Order Checkout
  const handleCheckout = async () => {
    if (!slipFile) {
      alert('Please upload a payment slip before submitting.');
      return;
    }

    const formData = new FormData();
    formData.append('cartItems', JSON.stringify(cart));
    formData.append('totalAmount', totalAmount);
    formData.append('slip', slipFile);

    try {
      const res = await fetch(`${API_BASE}/checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`Order Placed Successfully! (Order ID: ${data.orderId})`);
        setCart([]);
        setSlipFile(null);
        setTimeout(fetchOrders, 800);
        setTimeout(fetchOrders, 2500);
      } else {
        alert(data.error || 'Checkout failed');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 1. Auth Page
  if (!token) {
    return (
      <div className="auth-wrapper">
        <h2 style={{ marginBottom: '1.5rem', color: '#1B4332' }}>
          {isRegisterMode ? 'Create Account' : 'LOGIN'}
        </h2>
        <form onSubmit={handleAuth}>
          <div>
            <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>Username</label>
            <input 
              className="auth-input"
              type="text" 
              value={usernameInput} 
              onChange={e => setUsernameInput(e.target.value)} 
              required 
            />
          </div>
          <div>
            <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>Password</label>
            <input 
              className="auth-input"
              type="password" 
              value={passwordInput} 
              onChange={e => setPasswordInput(e.target.value)} 
              required 
            />
          </div>
          <button 
            type="submit" 
            className="btn-checkout"
            style={{ marginTop: '0.5rem' }}
          >
            {isRegisterMode ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <p style={{ marginTop: '1.2rem', textAlign: 'center', fontSize: '0.9rem', color: '#666' }}>
          {isRegisterMode ? 'Already have an account?' : "Don't have an account?"}{' '}
          <span 
            onClick={() => setIsRegisterMode(!isRegisterMode)} 
            style={{ color: '#2D6A4F', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
          >
            {isRegisterMode ? 'Sign In' : 'Sign Up'}
          </span>
        </p>
      </div>
    );
  }

  // 2. Shopping Mall Page
  return (
    <div>
      <header className="header">
        <div className="brand-title">MR.WASIN <span>SHOP</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Plugin Indicator with Algorithm Tag */}
          <span style={{
            fontSize: '0.78rem',
            padding: '4px 10px',
            borderRadius: '16px',
            backgroundColor: pluginActive ? (algorithm === 'P2' ? '#ede9fe' : '#dcfce7') : '#f3f4f6',
            color: pluginActive ? (algorithm === 'P2' ? '#6d28d9' : '#15803d') : '#6b7280',
            fontWeight: 700,
            border: `1px solid ${pluginActive ? (algorithm === 'P2' ? '#c4b5fd' : '#86efac') : '#d1d5db'}`,
            letterSpacing: '0.2px'
          }}>
            {pluginActive 
              ? `● Plugin: Shipping Tracker [Tag: ${algorithm || 'P1'}] (Active)` 
              : '○ Plugin: Offline (Standard Mode)'}
          </span>
          <span className="user-badge">User: <b>{currentUser}</b></span>
          <button className="btn-logout" onClick={handleLogout}>Log Out</button>
        </div>
      </header>

      <main className="main-container">
        {/* Products Section */}
        <div>
          {statusMessage && (
            <div className="alert-success">
              {statusMessage}
            </div>
          )}

          <h3 className="section-heading">Available Products</h3>
          <div className="product-grid">
            {products.map(prod => (
              <div key={prod._id || prod.id} className="product-card">
                <div className="product-img-box">
                  <img 
                    src={prod.image} 
                    alt={prod.name} 
                    className="product-img" 
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="product-details">
                  <div>
                    <h4 className="product-name">{prod.name}</h4>
                    <p className="product-price">฿{prod.price.toLocaleString()}</p>
                  </div>
                  <button className="btn-add-cart" onClick={() => addToCart(prod)}>
                    Add to Cart
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Orders History Section */}
          <div style={{ marginTop: '2.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 className="section-heading" style={{ marginBottom: 0 }}>
                My Orders &amp; Payment Status (RabbitMQ Processed)
              </h3>
              <button 
                onClick={fetchOrders}
                style={{
                  padding: '4px 10px',
                  background: '#e8f5e9',
                  border: '1px solid #a5d6a7',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: '#2e7d32'
                }}
              >
                ↻ Refresh Orders
              </button>
            </div>

            {orders.length === 0 ? (
              <p style={{ color: '#888', fontSize: '0.9rem' }}>No orders placed yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {orders.map(ord => {
                  const ship = shipments[ord._id];
                  return (
                    <div key={ord._id} style={{
                      background: '#ffffff',
                      border: '1px solid #d8e2dc',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#1B4332' }}>
                          Order #{ord._id}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '2px' }}>
                          Items: {ord.items ? ord.items.map(i => `${i.name} (x${i.qty})`).join(', ') : 'N/A'}
                        </div>
                        {ord.transactionRef && (
                          <div style={{ fontSize: '0.78rem', color: '#0077b6', marginTop: '3px' }}>
                            Payment Ref: <b>{ord.transactionRef}</b>
                          </div>
                        )}

                        {/* Plugin Shipping Badge with Algorithm details */}
                        {ship && (
                          <div style={{
                            marginTop: '6px',
                            padding: '4px 9px',
                            background: ship.algorithm === 'P2' ? '#f5f3ff' : '#f0f9ff',
                            border: `1px solid ${ship.algorithm === 'P2' ? '#ddd6fe' : '#bae6fd'}`,
                            borderRadius: '5px',
                            fontSize: '0.76rem',
                            color: ship.algorithm === 'P2' ? '#5b21b6' : '#0369a1',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <span>
                              {ship.algorithm === 'P2' ? '⚡ [Tag: P2 Smart Express]' : '🚚 [Tag: P1 Standard Post]'} <b>{ship.courier}</b>
                            </span>
                            <span>Tracking: <b>{ship.trackingNumber}</b></span>
                            <span style={{
                              background: ship.algorithm === 'P2' ? '#7c3aed' : '#0284c7',
                              color: '#ffffff',
                              padding: '1px 6px',
                              borderRadius: '3px',
                              fontSize: '0.68rem',
                              fontWeight: 700
                            }}>
                              {ship.shippingStatus}
                            </span>
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1B4332' }}>
                          ฿{ord.totalAmount?.toLocaleString()}
                        </div>
                        <span style={{
                          display: 'inline-block',
                          marginTop: '4px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          backgroundColor: ord.status === 'PAID' ? '#d8f3dc' : '#fef3c7',
                          color: ord.status === 'PAID' ? '#2d6a4f' : '#b45309'
                        }}>
                          {ord.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Shopping Cart Section */}
        <aside className="cart-panel">
          <h3 style={{ marginBottom: '1rem', color: '#1B4332' }}>
            Shopping Cart ({cart.reduce((sum, item) => sum + item.qty, 0)})
          </h3>
          
          {cart.length === 0 ? (
            <p style={{ color: '#888', fontSize: '0.95rem' }}>Your cart is empty.</p>
          ) : (
            <div>
              {/* รายการสินค้า + ปุ่มลบออก */}
              {cart.map(item => {
                const itemId = item._id || item.id;
                return (
                  <div key={itemId} className="cart-item">
                    <div style={{ flex: 1, paddingRight: '8px' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#121212' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#555', marginTop: '2px' }}>
                        ฿{item.price.toLocaleString()} × {item.qty}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#1B4332' }}>
                        ฿{(item.price * item.qty).toLocaleString()}
                      </span>
                      <button 
                        onClick={() => removeFromCart(itemId)}
                        style={{
                          background: '#fee2e2',
                          border: '1px solid #fca5a5',
                          color: '#dc2626',
                          borderRadius: '4px',
                          width: '24px',
                          height: '24px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          transition: '0.2s'
                        }}
                        title="Remove item"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="total-row">
                <span>Total</span>
                <span style={{ color: '#1B4332', fontSize: '1.25rem' }}>฿{totalAmount.toLocaleString()}</span>
              </div>

              {/* QR Code PromptPay */}
              <div style={{
                textAlign: 'center',
                padding: '14px',
                backgroundColor: '#f7f9f8',
                borderRadius: '8px',
                border: '1px solid #cce3de',
                marginBottom: '1.2rem'
              }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1B4332', marginBottom: '8px' }}>
                  Scan to Pay (PromptPay)
                </div>
                <img 
                  src={qrBase64} 
                  alt="PromptPay QR Code" 
                  style={{ 
                    width: '160px', 
                    height: 'auto', 
                    borderRadius: '8px', 
                    backgroundColor: '#ffffff', 
                    padding: '6px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                  }} 
                />
                <div style={{ fontSize: '0.85rem', color: '#2D6A4F', marginTop: '6px', fontWeight: 600 }}>
                  Amount to Pay: ฿{totalAmount.toLocaleString()}
                </div>
              </div>

              {/* ส่วนอัปโหลด Slip */}
              <div className="slip-box">
                <label className="slip-label">Upload Transfer Slip</label>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={e => setSlipFile(e.target.files[0])} 
                />
              </div>

              <button className="btn-checkout" onClick={handleCheckout}>
                Confirm Order
              </button>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
