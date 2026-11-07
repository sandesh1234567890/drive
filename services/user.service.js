const userModel = require('../models/user.model');

module.exports.createUsers = async ({ firstname, lastname, email, password }) => {
    if (!firstname || !email || !password) {
        throw new Error('All fields are required');
    }
    try {
        const user = new userModel({ fullname: { firstname, lastname }, email, password });
        await user.save();
        return user;
    } catch (error) {
        // Rethrow as-is so controllers can detect ValidationError / duplicate key
        throw error;
    }
}

