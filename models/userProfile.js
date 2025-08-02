const mongoose = require("mongoose")
const { type } = require("os")

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        require: true
    },
    mobile: {
        type:Number,
        require: true,
        unique: true
    },
    password : {
        type: String,
        require: true
    }
})

const user = mongoose.model("userProfile", userSchema)

module.exports = user