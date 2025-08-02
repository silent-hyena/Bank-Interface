const express = require("express")
const router = express.Router()
const user = require("../models/userProfile")
const userData = require("../models/userData")
const jwt = require("jsonwebtoken")
const { getRateLimiter } = require("../rateLimiter")
require("dotenv").config();
const { RateLimiterMongo } = require('rate-limiter-flexible');
const mongoose = require('mongoose');
const bcrypt = require("bcrypt")







const { body, validationResult } = require('express-validator');
const { json } = require("body-parser")

const SECRET = process.env.JWT_SECRET;


// MongoDB connection must already be established

function paymentLimiter(req, res, next) {
    const rateLimiter = getRateLimiter();
    const key = req.user.userId;

    rateLimiter.consume(key)
        .then((res) => {
            next();
        })
        .catch((rejRes) => {
            const wait = Math.ceil(rejRes.msBeforeNext / 1000);

            return res.status(429).json({
                alert: `Too many login requests. Try again in ${wait} seconds.`,
            })

        })


}


// authentication middleware
async function authenticate(req, res, next) {
    console.log("inside authentication.")
    try {
        const token = req.cookies.token;
        if (!token) return res.json({ alert: "Authentication token is missing. Please login again." })

        const payload = jwt.verify(token, SECRET);

        // issue new token with new expiration duration 
        const newToken = jwt.sign({ userId: payload.userId }, SECRET, { expiresIn: '15m' })
        res.cookie("token", newToken, {
            httpOnly: true,
            secure: false,
            sameSite: "strict",
            // maxAge: 15 * 60 * 1000
        });
        req.user = await userData.findOne({ _id: payload.userId });
        req.user.userId = payload.userId;
        next();
    }

    catch (e) {
        console.log(e.message);
        res.clearCookie("token", {
            httpOnly: true,
            secure: false,
            sameSite: "strict"
        });
        return res.json({ alert: "Please login with your credentials" })
    }
}





router.post("/makepayment", authenticate, paymentLimiter, [body("amount").isFloat({ gt: 0 }).withMessage("please enter proper amount.")], async (req, res) => {
    try {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // If validation failed
            return res.status(400).json({ alert: errors.array()[0].msg });
        }

        let { amount = "", to = "" } = req.body;
        // check balance:

        amount = Number(amount);

        const client = await userData.findOne({ mobile: req.user.mobile })
        if (!client) { return res.send("no user found.") }
        if (client.balance < amount) { return res.send("insufficient balance.") }

        // get the receiver data:
        const receiver = await userData.findOne({ mobile: to })
        if (!receiver) { return res.send("cannot find the account of receiver.") }

        receiver.balance += amount;
        client.balance -= amount;

        // add transaction detail to sender and receiver:
        client.transactions.unshift({
            "amount": amount, type: "debit", to: receiver.accountNumber
        })
        await client.save();
        receiver.transactions.unshift({
            "amount": amount, type: "credit", from: client.accountNumber
        })
        await receiver.save();


        const time = new Date();
        const paymentInfo = {
            "message": "payment is successfull",
            "amount paid": amount,
            "current Balance": client.balance,
            "date": time.toLocaleString()
        }
        res.json(paymentInfo)

    }
    catch (e) {
        console.log(e.message)
        return res.status(500).send("internal error")
    }
})

router.get("/gettransactions", authenticate, async (req, res) => {
    try {
        // get transactions

        const user = await userData.findOne({ mobile: req.user.mobile })

        if (!user) { return res.json({ alert: "No transactions found." }) }
        res.send(user.transactions)

    }
    catch (e) {
        console.log(e.message)
        return res.status(500).json({ alert: "internal error" })
    }
})

router.post("/addbalance", authenticate, async (req, res) => {
    try {
        let amount = req.body.amount;
        amount = Number(amount)
        if (amount < 0) { return res.json({ alert: "amount should be a positive quantity." }) }
        const client = await userData.findOne({ mobile: req.user.mobile })
        if (!client) { return res.json({ alert: "cannot find your account." }) }
        client.balance += amount;
        client.save()
        res.json({ message: `balance added. Current balance:${client.balance}` })
    }
    catch (e) {
        console.log(e.message)
        return res.status(500).json({ alert: "Internal error." })
    }

})

router.post('/resetpassword',authenticate,[body("newpassword").escape().isLength({min:4})
    .withMessage("password should be minimum of four length.")],async(req,res)=>{
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // If validation failed
            return res.status(400).json({ alert: errors.array()[0].msg });
        }
        // check same password:
        let {newpassword, confirmnewpassword} = req.body;
        newpassword = newpassword.trim()
        confirmnewpassword = confirmnewpassword.trim();
        if(newpassword!= confirmnewpassword){
            return res.json({alert: "Both password enterd should be same."})
        }
        // get user:
        try{
            // hash pass:
            const newpasshash = await bcrypt.hash(newpassword,10);
            await user.findOneAndUpdate({mobile :req.body.mobile},{password: newpasshash})
            return res.status(200).json({alert: "password updated successfully."})
        }
        catch(e){
            console.log(e.message);
            return res.status(500).json({alert: "cannot update the password."})
        }

    })


router.get("/getprofile",authenticate,async (req,res)=>{
    try{console.log("inside getprofile.")
        const cliendData = await userData.findOne({mobile: req.user.mobile});
        const clientProfile = await  user.findOne({mobile: req.user.mobile});
        const resObj = {"Account Name": clientProfile.username,
            "Account Number": cliendData.accountNumber,
            "Account Type": cliendData.AccountType,
            "Balance": cliendData.balance,
            "Mobile Number": cliendData.mobile
        }
        res.status(200).json(resObj);
    }
    catch(e){
        console.log(e.message)
        return res.status(500).json({alert:"Cannot get the profile data."})
    }
})


module.exports = router