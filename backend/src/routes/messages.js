const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// GET /api/messages/:orderId — Fetch message history
router.get('/:orderId', authenticate, async (req, res) => {
  const { orderId } = req.params;
  const userId = req.user.id;

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('customer_id, driver_id')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) return res.status(404).json({ error: 'Order not found' });
  if (order.customer_id !== userId && order.driver_id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { data: messages, error } = await supabase
    .from('messages')
    .select('*, users(name)')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  // Mark messages sent by the other party as read
  await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('order_id', orderId)
    .neq('sender_id', userId)
    .eq('is_read', false);

  res.json({ messages: messages || [] });
});

// POST /api/messages — Send a message
router.post('/', authenticate, async (req, res) => {
  const { order_id, content, message_type = 'text', sender_role } = req.body;
  const userId = req.user.id;

  if (!order_id || !content || !sender_role) {
    return res.status(400).json({ error: 'Missing required fields: order_id, content, sender_role' });
  }

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('customer_id, driver_id')
    .eq('id', order_id)
    .single();

  if (orderErr || !order) return res.status(404).json({ error: 'Order not found' });
  if (order.customer_id !== userId && order.driver_id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      order_id,
      sender_id: userId,
      sender_role,
      content,
      message_type,
    })
    .select('*, users(name)')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Broadcast to other party via WebSocket
  const io = req.app.get('io');
  io.of('/chat').to(`order_${order_id}`).emit('new_message', message);

  res.json({ message });
});

module.exports = router;
