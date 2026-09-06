// server/index.js
// Express example with PayPal create-order + capture-order and Supabase admin client
// Added: helmet, cors, rate limiting, reCAPTCHA verification endpoint

const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default:fetch})=>fetch(...args));
const { createClient } = require('@supabase/supabase-js');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(express.json());
app.use(helmet());

// CORS: restrict by env OR allow all for local testing
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({ origin: ALLOWED_ORIGIN }));

// Basic rate limiting for sensitive endpoints
const createOrderLimiter = rateLimit({ windowMs: 60*1000, max: 30, message: 'Too many requests, try again later.' });
const authLimiter = rateLimit({ windowMs: 60*1000, max: 10, message: 'Too many auth attempts, slow down.' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE; // keep secret on server only
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_API = process.env.PAYPAL_API || 'https://api-m.sandbox.paypal.com';
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET; // Google reCAPTCHA secret

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

async function getPayPalAccessToken(){
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method:'POST', headers:{ 'Authorization':`Basic ${auth}`, 'Content-Type':'application/x-www-form-urlencoded' }, body:'grant_type=client_credentials'
  });
  const j = await res.json();
  return j.access_token;
}

// reCAPTCHA verify endpoint (called by client before critical actions)
app.post('/api/verify-recaptcha', authLimiter, async (req, res) => {
  try{
    const { token } = req.body;
    if (!RECAPTCHA_SECRET) return res.json({ ok:true, note: 'recaptcha not configured' });
    if (!token) return res.status(400).json({ ok:false, error: 'token required' });
    const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${encodeURIComponent(RECAPTCHA_SECRET)}&response=${encodeURIComponent(token)}`;
    const r = await fetch(verifyUrl, { method: 'POST' });
    const j = await r.json();
    // For reCAPTCHA v3 check score and action
    if (j.success && (typeof j.score === 'undefined' || j.score >= 0.5)){
      return res.json({ ok:true, score: j.score });
    }
    return res.status(403).json({ ok:false, result: j });
  }catch(err){ console.error(err); return res.status(500).json({ ok:false, error: err.message }); }
});

app.post('/api/create-order', createOrderLimiter, async (req,res)=>{
  try{
    const { items, total } = req.body;
    // create PayPal order
    const token = await getPayPalAccessToken();
    const orderBody = { intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: 'SAR', value: String(total) } }] };
    const createRes = await fetch(`${PAYPAL_API}/v2/checkout/orders`, { method:'POST', headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` }, body: JSON.stringify(orderBody) });
    const json = await createRes.json();
    // save pending order in Supabase using service role
    await supabaseAdmin.from('orders').insert([{ id: json.id, items: JSON.stringify(items), total, status:'pending', created_at: new Date().toISOString() }]);
    // Find approval_url
    const approval = json.links && json.links.find(l=>l.rel==='approve');
    res.json({ orderId: json.id, approvalUrl: approval ? approval.href : null });
  }catch(err){ console.error(err); res.status(500).json({ error: err.message }); }
});

app.post('/api/capture-order', createOrderLimiter, async (req,res)=>{
  try{
    const { orderId } = req.body;
    const token = await getPayPalAccessToken();
    const capRes = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, { method:'POST', headers:{ 'Content-Type':'application/json','Authorization':`Bearer ${token}` } });
    const capJson = await capRes.json();
    // verify and update supabase
    if (capJson.status === 'COMPLETED' || capJson.status === 'COMPLETED'){
      await supabaseAdmin.from('orders').update({ status:'paid', payment_info: capJson }).eq('id', orderId);
      return res.json({ ok:true, capture: capJson });
    }
    res.status(400).json({ ok:false, capture: capJson });
  }catch(err){ console.error(err); res.status(500).json({ error: err.message }); }
});

module.exports = app;
