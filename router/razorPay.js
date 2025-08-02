const express = require('express');
const userData = require("../models/userData")
const Razorpay = require('razorpay');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { validateWebhookSignature } = require('razorpay/dist/utils/razorpay-utils');
const jwt = require("jsonwebtoken")
require("dotenv").config();


const route = express.Router();
const SECRET = process.env.JWT_SECRET;


async function authenticate(req, res, next) {
  try {
    const token = req.cookies.token;
    if (!token) return res.json({ alert: "Authentication token is missing." })
    // console.log(`token: ${token}`)
    const payload = jwt.verify(token, SECRET);
    req.user = await userData.findOne({ _id: payload.userId });
    next();
  }
  catch (e) {
    console.log(e.message);
    return res.json({ alert: "not authorized" })
  }
}

// Serve static files
route.use(express.static(path.join(__dirname)));

// Replace with your Razorpay credentials
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY,
  key_secret: process.env.RAZORPAY_SECRET,
});

// Function to read data from JSON file
const readData = () => {
  if (fs.existsSync('orders.json')) {
    const data = fs.readFileSync('orders.json');
    return JSON.parse(data);
  }
  return [];
};

// Function to write data to JSON file
const writeData = (data) => {
  fs.writeFileSync('orders.json', JSON.stringify(data, null, 2));
};

// Initialize orders.json if it doesn't exist
if (!fs.existsSync('orders.json')) {
  writeData([]);
}

// Route to handle order creation
route.post('/create-order', authenticate, async (req, res) => {
  try {
    const { amount, currency, receipt, notes } = req.body;
    // if not sufficient balance sent alert:
    if (req.user.balance < amount) {
      res.json({ alert: "Not sufficient balance" })
      return;
    }
    const options = {
      amount: amount * 100, // Convert amount to paise
      currency,
      receipt,
      notes,
    };

    const order = await razorpay.orders.create(options);
    // console.log(options)
    // console.log(order)
    // Read current orders, add new order, and write back to the file
    const orders = readData();
    orders.push({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      status: 'created',
    });
    writeData(orders);

    res.json(order); // Send order details to frontend, including order ID
  } catch (error) {
    console.error(error);
    res.status(500).send('Error creating order');
  }
});

// Route to serve the success page
route.get('/payment-success', authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, "../view/userDashboard.html"));
});



// Route to handle payment verification
route.post('/verify-payment', authenticate, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const secret = razorpay.key_secret;
  const body = razorpay_order_id + '|' + razorpay_payment_id;

  try {
    const isValidSignature = validateWebhookSignature(body, razorpay_signature, secret);
    if (isValidSignature) {



      // Update the order with payment details in orders file
      const orders = readData();
      const order = orders.find(o => o.order_id === razorpay_order_id);
      if (order) {

        order.status = 'paid';
        order.payment_id = razorpay_payment_id;
        writeData(orders);

        // save info to database:
        const client = await userData.findOne({ mobile: req.user.mobile });
        client.balance -= (order.amount) / 100;
        client.transactions.unshift({ amount: (order.amount) / 100, type: "debit", to: order.payment_id })
        await client.save();
      }

      res.status(200).json({ status: 'ok', "order": order });
      console.log("Payment verification successful");
    } else {
      res.status(400).json({ status: 'verification_failed' });
      console.log("Payment verification failed");
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 'error', message: 'Error verifying payment' });
  }
});

module.exports = route
