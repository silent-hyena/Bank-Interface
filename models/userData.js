const mongoose = require("mongoose");



const transactionSchema = new mongoose.Schema({

  amount: { type: Number, required: true },
  type: { type: String, enum: ["credit", "debit"], required: true },
  from: { type: String, default: null }, // For 'credit' transactions
  to: { type: String, default: null },   // For 'debit' transactions
  date: { type: String, default: () => new Date().toLocaleString('en-US') }
});

const userDataSchema = new mongoose.Schema({
  mobile: { type: String, unique: true },
  accountNumber: { type: String, unique: true },
  accountType: { type: String },
  balance: { type: Number, default: 1000 },
  transactions: [transactionSchema]
});

userDataModel = mongoose.model("UserData", userDataSchema);
module.exports = userDataModel
