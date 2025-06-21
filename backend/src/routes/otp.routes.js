const express = require('express');
const router = express.Router();

// Import dependencies
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const { formatPhoneNumber } = require('../utils/helper');

// Twilio Verify setup (UPDATED)
const twilio = require('twilio');
const verifyToken = require('../middleware/verifyToken');
const Account = require('../models/Account');
const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// Rate limiting middleware
const otpLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 phút
    max: 3, // 3 requests per phone
    keyGenerator: (req) => req.body.phone,
    message: {
        success: false,
        message: 'Quá nhiều request. Thử lại sau 5 phút.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// TWILIO VERIFY FUNCTIONS (NEW)
async function sendOTPWithVerify(phone) {
    try {
        const verification = await twilioClient.verify.v2
            .services(process.env.TWILIO_VERIFY_SERVICE_SID)
            .verifications
            .create({
                to: phone,
                channel: 'sms'
            });

        return {
            success: true,
            status: verification.status,
            sid: verification.sid
        };
    } catch (error) {
        console.error('Twilio Verify error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function verifyOTPWithVerify(phone, otp) {
    try {
        const verificationCheck = await twilioClient.verify.v2
            .services(process.env.TWILIO_VERIFY_SERVICE_SID)
            .verificationChecks
            .create({
                to: phone,
                code: otp
            });

        return {
            success: verificationCheck.status === 'approved',
            status: verificationCheck.status
        };
    } catch (error) {
        console.error('Twilio Verify check error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Route 1: Send OTP (UPDATED)
router.post('/send-otp', verifyToken, async (req, res) => {
    try {
        const account = await Account.findById(req.accountID);
        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'Account not found'
            });
        }

        const phone = account.phoneNumber;
        const formattedPhone = formatPhoneNumber(phone);

        // Use Twilio Verify instead of manual OTP
        const result = await sendOTPWithVerify(formattedPhone);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Không thể gửi mã OTP. Vui lòng thử lại.',
                error: result.error
            });
        }

        // No need to store OTP manually - Twilio Verify handles it
        res.json({
            success: true,
            message: 'Mã OTP đã được gửi đến số điện thoại của bạn!',
            expiresIn: 600, // 10 minutes (Twilio Verify default)
            status: result.status
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server. Vui lòng thử lại.'
        });
    }
});

// Route 2: Verify OTP (NEW)
router.post('/verify-otp', verifyToken, [
    body('otp')
        .isLength({ min: 6, max: 6 })
        .withMessage('OTP phải có 6 ký tự')
        .isNumeric()
        .withMessage('OTP chỉ chứa số')
], async (req, res) => {
    try {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu không hợp lệ',
                errors: errors.array()
            });
        }

        const { otp } = req.body;

        const account = await Account.findById(req.accountID);
        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'Account not found'
            });
        }

        const phone = account.phoneNumber;
        const formattedPhone = formatPhoneNumber(phone);

        // Use Twilio Verify to check OTP
        const verifyResult = await verifyOTPWithVerify(formattedPhone, otp);

        if (!verifyResult.success) {
            return res.status(400).json({
                success: false,
                message: 'Mã OTP không đúng hoặc đã hết hạn',
                status: verifyResult.status
            });
        }

        // Update account verification status
        account.isPhoneVerified = true;
        await account.save();

        res.json({
            success: true,
            message: 'Xác thực số điện thoại thành công!',
            data: {
                accountId: account._id,
                phoneNumber: account.phoneNumber,
                isVerified: true
            }
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server. Vui lòng thử lại.'
        });
    }
});

module.exports = router;