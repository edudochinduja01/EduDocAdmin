require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CORS ---
// Allow requests from the frontend URL (Vercel in prod, localhost in dev)
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. Postman, curl, mobile apps)
    if (!origin) return callback(null, true);
    // Allow any vercel.app subdomain (covers preview deployments too)
    if (origin.endsWith('.vercel.app')) return callback(null, true);
    if (allowedOrigins.some(o => origin.startsWith(o))) {
      return callback(null, true);
    }
    console.warn(`CORS blocked: ${origin}`);
    // Return false (not an error) so preflight gets 204, not 500
    return callback(null, false);
  },
  credentials: true,
}));
app.use(express.json());

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseAdminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseAdminKey || supabaseKey);

// Multer for file uploads
const multer = require('multer');
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

/*
 * -------------------------------------------
 * Authentication Middleware
 * -------------------------------------------
 */
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided or invalid format.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) throw error;
    if (!user) return res.status(401).json({ error: 'Invalid token.' });
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    return res.status(401).json({ error: 'Authentication failed.' });
  }
};

// Rate Limiter for OTP
const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 attempts per 15 minutes
  message: { error: 'Too many OTP attempts from this IP. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Magic Link: send login email
app.post('/send-magic-link', otpRateLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  try {
    // Use FRONTEND_URL env var for redirect (Vercel URL in prod, localhost in dev)
    const frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${frontendUrl}/login.html`
      }
    });
    if (error) throw error;
    res.status(200).json({ message: 'Magic link sent. Check your email.' });
  } catch (err) {
    console.error('Magic link error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Verify admin after magic link callback
app.get('/verify-admin', authMiddleware, async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('users')
      .select('role')
      .eq('email', req.user.email)
      .single();
    if (error) throw error;
    if (profile.role !== 'Admin') {
      return res.status(403).json({ error: 'Access denied. Not an admin.' });
    }
    res.status(200).json({ message: 'Admin verified' });
  } catch (err) {
    console.error('Verify admin error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Verify OTP and check admin role
app.post('/verify-otp', otpRateLimiter, async (req, res) => {
  const { email, token } = req.body;
  if (!email || !token) {
    return res.status(400).json({ error: 'Email and token are required.' });
  }
  try {
    // Verify the OTP token with Supabase
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email'
    });
    if (error) throw error;
    if (!data.session) {
      return res.status(401).json({ error: 'Invalid OTP or session expired.' });
    }

    // Check if user has Admin role
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('email', email)
      .single();
    if (profileError) throw profileError;
    if (profile.role !== 'Admin') {
      return res.status(403).json({ error: 'Access denied. Not an admin.' });
    }

    // Return the session token
    res.status(200).json({
      message: 'OTP verified successfully',
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    });
  } catch (err) {
    console.error('OTP verification error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// File upload endpoint
app.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;
    const fileExt = path.extname(file.originalname);
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExt}`;
    
    // Determine bucket based on file type
    let bucket = 'files'; // default bucket
    if (file.mimetype.startsWith('image/')) {
      bucket = 'images';
    } else if (file.mimetype === 'application/pdf') {
      bucket = 'pdfs';
    }

    // FIX: Use supabaseAdmin to bypass RLS policies on buckets
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (error) throw error;

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from(bucket)
      .getPublicUrl(fileName);

    res.status(200).json({
      message: 'File uploaded successfully',
      url: urlData.publicUrl,
      fileName: fileName,
      bucket: bucket
    });
  } catch (error) {
    console.error('Upload error:', error.message);
    res.status(500).json({ error: error.message });
  }
});


// Analytics totals
app.get('/analytics/totals', authMiddleware, async (req, res) => {
  try {
    // --- Total counts ---
    const { count: userCount, error: userError } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'User');
    if (userError) throw userError;

    const { count: productCount, error: productError } = await supabaseAdmin
      .from('products')
      .select('*', { count: 'exact', head: true });
    if (productError) throw productError;

    // --- New users this month ---
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { count: newUsersThisMonth, error: newUserError } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'User')
      .gte('created_at', firstOfMonth);
    if (newUserError) throw newUserError;

    // --- Total downloads (transactions of type 'purchased') ---
    const { count: totalDownloads, error: dlError } = await supabaseAdmin
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .ilike('type', 'purchased');
    if (dlError) throw dlError;

    // --- Monthly breakdown for current year ---
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

    const { data: usersThisYear, error: uyError } = await supabaseAdmin
      .from('users')
      .select('created_at')
      .gte('created_at', yearStart);
    if (uyError) throw uyError;

    const { data: productsThisYear, error: pyError } = await supabaseAdmin
      .from('products')
      .select('created_at')
      .gte('created_at', yearStart);
    if (pyError) throw pyError;

    // Build monthly arrays [Jan(0)..Dec(11)]
    const monthlyUsers = new Array(12).fill(0);
    const monthlyProducts = new Array(12).fill(0);

    (usersThisYear || []).forEach(u => {
      const month = new Date(u.created_at).getMonth();
      monthlyUsers[month]++;
    });
    (productsThisYear || []).forEach(p => {
      const month = new Date(p.created_at).getMonth();
      monthlyProducts[month]++;
    });

    // --- Recent Transactions ---
    const { data: recentTransactions, error: rtError } = await supabaseAdmin
      .from('transactions')
      .select('*, users(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(5);
    
    // --- Recent Users ---
    const { data: recentUsers, error: ruError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('role', 'User')
      .order('created_at', { ascending: false })
      .limit(5);

    res.status(200).json({
      totalUsers: userCount,
      totalProducts: productCount,
      newUsersThisMonth: newUsersThisMonth || 0,
      totalDownloads: totalDownloads || 0,
      monthlyUsers,
      monthlyProducts,
      recentTransactions: recentTransactions || [],
      recentUsers: recentUsers || [],
      ip: req.ip || req.connection.remoteAddress
    });

  } catch (error) {
    console.error('Analytics endpoint error:', error.message);
    res.status(500).json({ error: 'Failed to fetch analytics data.' });
  }
});


/*
 * -------------------------------------------
 * PRODUCT CRUD ENDPOINTS
 * -------------------------------------------
 */
app.get('/products', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching products:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/products', authMiddleware, async (req, res) => {
  const { 
    title, description, details, content, pdf_url, cover_image_url, 
    image_url, price, is_free, type, category, pages, status, author, rating
  } = req.body;
  
  if (!title || !type) {
    return res.status(400).json({ error: 'Title and type are required.' });
  }
  
  try {
    const productData = {
      title,
      description: description || null,
      details: details || null,
      content: content || null,
      pdf_url: pdf_url || null,
      cover_image_url: cover_image_url || null,
      image_url: image_url || null,
      price: price || 0,
      is_free: is_free || false,
      type,
      category: category || null,
      pages: pages || null,
      status: status || 'Draft',
      author: author || null,
      rating: rating || 0.0
    };

    // FIX: Use supabaseAdmin to bypass RLS
    const { data, error } = await supabaseAdmin
      .from('products')
      .insert([productData])
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating product:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.put('/products/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { 
    title, description, details, content, pdf_url, cover_image_url, 
    image_url, price, is_free, type, category, pages, status, author, rating
  } = req.body;
  
  try {
    const productData = {};
    if (title !== undefined) productData.title = title;
    if (description !== undefined) productData.description = description;
    if (details !== undefined) productData.details = details;
    if (content !== undefined) productData.content = content;
    if (pdf_url !== undefined) productData.pdf_url = pdf_url;
    if (cover_image_url !== undefined) productData.cover_image_url = cover_image_url;
    if (image_url !== undefined) productData.image_url = image_url;
    if (price !== undefined) productData.price = price;
    if (is_free !== undefined) productData.is_free = is_free;
    if (type !== undefined) productData.type = type;
    if (category !== undefined) productData.category = category;
    if (pages !== undefined) productData.pages = pages;
    if (status !== undefined) productData.status = status;
    if (author !== undefined) productData.author = author;
    if (rating !== undefined) productData.rating = rating;

    // FIX: Use supabaseAdmin to bypass RLS
    const { data, error } = await supabaseAdmin
      .from('products')
      .update(productData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Product not found.' });
    res.status(200).json(data);
  } catch (error) {
    console.error('Error updating product:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/products/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    // FIX: Use supabaseAdmin to bypass RLS
    const { error } = await supabaseAdmin.from('products').delete().eq('id', id); 
    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting product:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/*
 * -------------------------------------------
 * USER MANAGEMENT CRUD ENDPOINTS
 * -------------------------------------------
 */
app.get('/users', authMiddleware, async (req, res) => {
  try {
    // Join with wallets table
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*, wallets(balance)') 
      .order('created_at', { ascending: false });
      
    if (error) throw error;

    // Flatten data for frontend
    const users = data.map(user => {
      let balance = 0;
      if (Array.isArray(user.wallets)) {
          if (user.wallets.length > 0) balance = user.wallets[0].balance;
      } else if (user.wallets) {
          balance = user.wallets.balance;
      }
      
      const { wallets, ...userData } = user; 
      return { ...userData, wallet_balance: balance };
    });

    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/users', authMiddleware, async (req, res) => {
  const { email, password, role, full_name, phone_num, status, wallet_balance, profile_image_url } = req.body;
  
  if (!email || !password || !role || !full_name) {
    return res.status(400).json({ error: 'Email, password, role, and full name are required.' });
  }

  try {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, full_name }
    });

    if (authError) throw authError;

    // Insert user (excluding wallet_balance which is in a separate table)
    const { error: dbError } = await supabaseAdmin
      .from('users')
      .upsert({ 
        id: authData.user.id, 
        email: email, 
        role: role,
        full_name: full_name,
        phone_num: phone_num || null,
        status: status || 'Active',
        profile_image_url: profile_image_url || null
      });

    if (dbError) console.error('Error syncing user:', dbError.message);

    // Insert wallet balance
    if (wallet_balance !== undefined) {
      await supabaseAdmin.from('wallets').insert({
        user_id: authData.user.id,
        balance: wallet_balance || 0
      });
    }

    res.status(201).json({ message: 'User created successfully', user: authData.user });
  } catch (error) {
    console.error('Error creating user:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.put('/users/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { role, email, password, full_name, phone_num, status, wallet_balance, profile_image_url } = req.body;
  
  try {
    if (email || password) {
      const updates = {};
      if (email) updates.email = email;
      if (password) updates.password = password;
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, updates);
      if (authError) throw authError;
    }

    const publicUpdates = {};
    if (role !== undefined) publicUpdates.role = role;
    if (email !== undefined) publicUpdates.email = email;
    if (full_name !== undefined) publicUpdates.full_name = full_name;
    if (phone_num !== undefined) publicUpdates.phone_num = phone_num;
    if (status !== undefined) publicUpdates.status = status;
    if (profile_image_url !== undefined) publicUpdates.profile_image_url = profile_image_url;

    // Handle wallet update separately
    if (wallet_balance !== undefined) {
      const { data: wallet } = await supabaseAdmin.from('wallets').select('balance').eq('user_id', id).single();
      const oldBalance = wallet ? wallet.balance : 0;
      const difference = wallet_balance - oldBalance;

      if (wallet) {
        await supabaseAdmin.from('wallets').update({ balance: wallet_balance }).eq('user_id', id);
      } else {
        await supabaseAdmin.from('wallets').insert({ user_id: id, balance: wallet_balance });
      }

      // AUDIT TRAIL: Log this adjustment in transactions
      if (difference !== 0) {
        await supabaseAdmin.from('transactions').insert([{
           user_id: id,
           amount: Math.abs(difference),
           type: difference > 0 ? 'credit' : 'debit',
           description: `Manual adjustment by Admin (Initial balance: ₹${oldBalance})`
        }]);

        // Also log activity
        await supabaseAdmin.from('activity_logs').insert([{
           user_id: req.user.id,
           action: 'WALLET_ADJUSTMENT',
           entity_type: 'user',
           entity_id: id,
           description: `Adjusted user balance. Old: ₹${oldBalance}, New: ₹${wallet_balance}`,
           new_data: { oldBalance, wallet_balance, difference },
           ip_address: req.ip || req.connection.remoteAddress
        }]);
      }
    }

    if (Object.keys(publicUpdates).length > 0) {
      const { data, error } = await supabaseAdmin
        .from('users')
        .update(publicUpdates)
        .eq('id', id)
        .select('*')
        .single();
      
      if (error) throw error;
      res.status(200).json(data);
    } else {
      res.status(200).json({ message: 'User updated successfully' });
    }
  } catch (error) {
    console.error('Error updating user:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/users/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) throw error;
    await supabaseAdmin.from('users').delete().eq('id', id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting user:', error.message);
    res.status(500).json({ error: error.message });
  }
});


/*
 * -------------------------------------------
 * OFFER CRUD ENDPOINTS
 * -------------------------------------------
 */
app.get('/offers', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('offers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching offers:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/offers', authMiddleware, async (req, res) => {
  const { 
    title, discount_label, token_price, duration, valid_from, 
    valid_until, offer_type, max_usage, status, discount, product_ids ,cover_image_url
  } = req.body;

  if (!title || token_price === undefined) {
    return res.status(400).json({ error: 'Title and token price are required.' });
  }

  try {
    const offerData = {
        title,
        discount_label,
        token_price: token_price || 0,
        duration,
        valid_from: valid_from || null,
        valid_until: valid_until || null,
        offer_type,
        max_usage: max_usage || null,
        status: status || 'Active',
        discount: discount || null,
        product_ids: product_ids || [],
        cover_image_url: cover_image_url || null
    };

    const { data, error } = await supabaseAdmin
      .from('offers')
      .insert([offerData])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating offer:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.put('/offers/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { 
    title, discount_label, token_price, duration, valid_from, 
    valid_until, offer_type, max_usage, status, discount, product_ids ,cover_image_url
  } = req.body;

  try {
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (discount_label !== undefined) updates.discount_label = discount_label;
    if (token_price !== undefined) updates.token_price = token_price;
    if (duration !== undefined) updates.duration = duration;
    if (valid_from !== undefined) updates.valid_from = valid_from;
    if (valid_until !== undefined) updates.valid_until = valid_until;
    if (offer_type !== undefined) updates.offer_type = offer_type;
    if (max_usage !== undefined) updates.max_usage = max_usage;
    if (status !== undefined) updates.status = status;
    if (discount !== undefined) updates.discount = discount;
    if (product_ids !== undefined) updates.product_ids = product_ids;
    if (cover_image_url !== undefined) updates.cover_image_url = cover_image_url;

    const { data, error } = await supabaseAdmin
      .from('offers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    console.error('Error updating offer:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/offers/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabaseAdmin.from('offers').delete().eq('id', id);
    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting offer:', error.message);
    res.status(500).json({ error: error.message });
  }
});


/*
 * -------------------------------------------
 * ACTIVITY LOGS ENDPOINT
 * -------------------------------------------
 */
app.get('/activity-logs', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('activity_logs')
      .select('*, users(full_name, email)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching activity logs:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST — Write an activity log entry
app.post('/activity-logs', authMiddleware, async (req, res) => {
  const { action, entity_type, entity_id, description, old_data, new_data, role } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'action is required.' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('activity_logs')
      .insert([{
        user_id: req.user.id,
        role: role || 'Admin',
        action,
        entity_type: entity_type || null,
        entity_id: entity_id ? entity_id.toString() : null,
        description: description || null,
        old_data: old_data || null,
        new_data: new_data || null,
        ip_address: req.ip || req.connection.remoteAddress
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Error writing activity log:', error.message);
    res.status(500).json({ error: error.message });
  }
});


/*
 * -------------------------------------------
 * TRANSACTIONS ENDPOINT
 * -------------------------------------------
 */
app.get('/transactions', authMiddleware, async (req, res) => {
  try {
    // DEBUG: Check if we are actually using the admin key
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('WARNING: SUPABASE_SERVICE_ROLE_KEY is missing. RLS policies may block results.');
    }

    console.log('Fetching transactions...');
    
    // 1. Fetch all transactions
    const { data: transactions, error: txError } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (txError) throw txError;

    console.log(`Transactions fetched: ${transactions.length}`); // Should be > 0

    if (!transactions || transactions.length === 0) {
      return res.status(200).json([]);
    }

    // 2. Fetch users
    const userIds = [...new Set(transactions.map(t => t.user_id))];
    
    // NOTE: This joins with 'public.users'. 
    // If your transaction references 'auth.users' but the user isn't in 'public.users',
    // the name will show as 'Unknown'.
    const { data: users, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, full_name, email')
      .in('id', userIds);

    const userMap = {};
    if (users) {
      users.forEach(u => userMap[u.id] = u);
    }

    const joinedData = transactions.map(t => ({
      ...t,
      // Handle BigInt serialization if necessary (JS converts BigInt to string in JSON)
      id: t.id.toString(), 
      users: userMap[t.user_id] || { full_name: 'Unknown User', email: 'N/A' }
    }));

    res.status(200).json(joinedData);
  } catch (error) {
    console.error('Error in GET /transactions:', error.message);
    res.status(500).json({ error: error.message });
  }
});



/*
 * -------------------------------------------
 * UNIVERSAL SEARCH ENDPOINT
 * -------------------------------------------
 */
app.get('/search', authMiddleware, async (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.status(200).json({ users: [], products: [], offers: [] });
  }

  const query = `%${q}%`;

  try {
    // Search Users
    const { data: users, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, full_name, email, role')
      .or(`full_name.ilike.${query},email.ilike.${query}`)
      .limit(5);

    if (userError) throw userError;

    // Search Products
    const { data: products, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, title, type, price')
      .or(`title.ilike.${query},description.ilike.${query}`)
      .limit(5);

    if (productError) throw productError;

    // Search Offers
    const { data: offers, error: offerError } = await supabaseAdmin
      .from('offers')
      .select('id, title, discount, token_price')
      .ilike('title', query)
      .limit(5);

    if (offerError) throw offerError;

    res.status(200).json({
      users: users || [],
      products: products || [],
      offers: offers || []
    });

  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// 404 Handler - Must be the last route
app.use((req, res) => {
  console.log(`404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});