const express = require("express")
const mongoose = require("mongoose")
const bcrypt = require("bcrypt")
const user = require("./models/userProfile")
const userData = require("./models/userData")
const jwt = require("jsonwebtoken")
const cookieParser = require("cookie-parser")
const path = require("path")
const bodyParser = require('body-parser');
const cors = require("cors")
const localRoute = require("./router/operations")
const razorRoute = require("./router/razorPay")
const { body, validationResult } = require('express-validator');
require('dotenv').config();
const { initRateLimiter} = require("./rateLimiter");

const dbURL = process.env.MONGO_URL;
const SECRET = process.env.JWT_SECRET;

const { RateLimiterMongo } = require('rate-limiter-flexible');
// const mongoose = require('mongoose');

// const mongoConn = mongoose.connection;
let rateLimiter


mongoose.connect(dbURL)
    .then(() => {
        console.log("database connected")

        const db = mongoose.connection.getClient().db(); 
        initRateLimiter(db);
        const mongoClient = mongoose.connection.getClient(); 
        // const db = mongoClient.db();
        process.env.RATE_LIMITER_FLAG = true;
        rateLimiter = new RateLimiterMongo({
            storeClient: db,
            points: 6, // 5 login
            duration: 5*60, // per 5 min
            keyPrefix: 'login_limit'
        });
    })
    .catch((err) => {
        console.log(err)
    })


// Login rate limitter Midlleware:
const loginRateLimiter = (req, res, next) => {
    const key = `${req.ip}_${req.body.username}`;
    // console.log(`[RATE] Checking key=${key}`);

    if (!rateLimiter) {
        console.error("Rate limiter not initialized");
        return res.status(500).json({ alert: "Rate limiter unavailable. Try again shortly." });
    }

    rateLimiter.consume(key)
        .then((info) => {
            
            next();
        })
        .catch((rejRes) => {
            if (rejRes && rejRes.msBeforeNext) {
                const wait = Math.ceil(rejRes.msBeforeNext / 1000);
                // console.warn(`[RATE] Blocked: ${key}, Retry after ${wait}s`);
                return res.status(429).json({
                    alert: `Too many login requests. Try again in ${wait} seconds.`,
                });
            } else {
                console.error(`[RATE] Unexpected limiter error for key: ${key}`, rejRes);
                return res.status(500).json({
                    alert: `Internal server error.`,
                });
            }
        });

};







const app = express()


app.use((req, res, next) => {
    // console.log(`[STATIC REQUEST] ${req.method} ${req.url}`);
    next();
});

app.use(express.json())
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser())
app.use(express.static(path.join(__dirname, "view")))
app.use(bodyParser.json());
app.use(cors())


// routes:
app.use("/operation/razor/", razorRoute)
app.use("/operation/", localRoute)



app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "view/homepage.html"))
})

app.post("/signup", [
    body('username').isLength({ min: 5 }).withMessage('Username must be at least 5 characters'),
    body('mobile').isNumeric().isLength({ min: 7 }).withMessage('Invalid mobile number')], async (req, res) => {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // If validation failed
            return res.status(400).json({ alert: errors.array()[0].msg });
        }

        try {
            // get username, mobile, pass,confirm pass:
            let { username = "", mobile = "", password = "", confirmPassword = "" } = req.body;
            // verify password:

            password = password.trim();
            confirmPassword = confirmPassword.trim();
            if (password != confirmPassword) {
                return res.status(401).json({ alert: "both password and confirm password  should be same" })
            }
            // check for mobile no in DB:

            const mobileCheck = await user.findOne({ "mobile": mobile })

            if (mobileCheck) {
                return res.status(401).json({ alert: "Account already registered for the mobile number given." })
            }



            // add new user to userprfiles model:
            const hashpass = await bcrypt.hash(password, 10)
            const newUser = await user.create({
                username,
                mobile,
                password: hashpass
            })

            // intialize userData model for new user:
            const accNum = "UPI" + Math.floor(100000000 + Math.random() * 900000000);
            const newUserData = await userData.create({ mobile, accountNumber: accNum, accountType: "Savings", balance: 1000 });
            const resObj = { "userName": username, "AccountNo": accNum, accountType: "Savings", balance: 1000, "MobileNo": mobile }
            return res.send(resObj)



        }
        catch (e) {
            console.log(e.message)
            res.status(500).send("internal error.")

        }
    })

app.post("/login", [
    body("username").isLength({ min: 5 }).withMessage('Username must be at least 5 characters'),
    body("password").notEmpty().withMessage("Password can not be empty.")
], loginRateLimiter, async (req, res) => {
    try {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // If validation failed
            return res.status(400).json({ alert: errors.array()[0].msg });
        }

        const { username, password } = req.body;
        // check username and password in database:
        const userProfile = await user.findOne({ "username": username })
        if (!userProfile) {
            return res.status(401).json({ alert: "cannot find any account with the given username." })
        }
        // verify password:
        const passCheck = await bcrypt.compare(password, userProfile.password);
        if (!passCheck) {
            return res.status(401).json({ alert: "wrong password provided, try again." })
        }
        // send object id from userData  as userid in token inside cookie:
        const userinfo = await userData.findOne({ mobile: userProfile.mobile })
        const token = jwt.sign({
            userId: userinfo._id
        }, SECRET, { expiresIn: "15m" });

        res.cookie("token", token, {
            httpOnly: true,
            secure: false,
            sameSite: "strict",
            // maxAge: 15 * 60 * 1000
        });

        return res.status(200).json({ redirect: "/userDashboard.html" });



    }
    catch (e) {
        console.log(e.message)
        res.status(500).json({ alert: "internal error." })
    }
})


app.post("/logout", (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: false,
        sameSite: "strict"
    });
    res.json({ alert: "Logged out successfully" });
});



app.listen(process.env.PORT, () => {
    console.log("server running.")
})



