const express = require('express');
const router = express.Router();
const { analyzeImageWithGeminiVision, validateAPIKeys, testAPIKeys } = require('../services/aiModeration.service');

// Test endpoint for Google Gemini Vision
router.post('/test-gemini-vision', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: "imageUrl is required"
      });
    }

    // Validate Google API key
    const apiKeys = validateAPIKeys();
    if (!apiKeys.google) {
      return res.status(500).json({
        success: false,
        message: "Google Gemini API key not configured"
      });
    }

    console.log(`🔍 Testing Gemini Vision with image: ${imageUrl}`);
    
    // Test the image analysis
    const startTime = Date.now();
    const result = await analyzeImageWithGeminiVision(imageUrl);
    const processingTime = Date.now() - startTime;
    
    console.log(`✅ Gemini Vision test completed in ${processingTime}ms`);
    
    res.json({
      success: true,
      message: "Google Gemini Vision test successful",
      data: {
        imageUrl,
        analysis: result,
        processingTime,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error("❌ Gemini Vision test failed:", error.message);
    
    res.status(500).json({
      success: false,
      message: "Gemini Vision test failed",
      error: error.message,
      details: {
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data
      }
    });
  }
});

// Test endpoint for Google Gemini API key validation
router.get('/test-api-keys', async (req, res) => {
  try {
    const apiKeys = validateAPIKeys();
    
    res.json({
      success: true,
      message: "Google Gemini API key validation",
      data: {
        google: apiKeys.google,
        provider: "Google Gemini Only",
        status: apiKeys.google ? "✅ Ready" : "❌ Missing API Key"
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "API key validation failed",
      error: error.message
    });
  }
});

// Full API test including text and image analysis
router.get('/test-full-api', async (req, res) => {
  try {
    console.log("🧪 Running full Google Gemini API test...");
    
    const testResult = await testAPIKeys();
    
    if (!testResult.google) {
      return res.status(500).json({
        success: false,
        message: "Google Gemini API test failed",
        data: testResult
      });
    }

    res.json({
      success: true,
      message: "Google Gemini API working correctly",
      data: {
        apiTest: testResult,
        recommendation: "Ready for production use",
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Full API test failed",
      error: error.message
    });
  }
});

// Test with sample Cloudinary images (Google Gemini only)
router.get('/test-sample-images', async (req, res) => {
  try {
    const sampleImages = [
      'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg',
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&h=500&fit=crop',
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&h=500&fit=crop' // shoes
    ];
    
    const apiKeys = validateAPIKeys();
    if (!apiKeys.google) {
      return res.status(500).json({
        success: false,
        message: "Google Gemini API key not configured"
      });
    }

    const results = [];
    
    for (const imageUrl of sampleImages) {
      try {
        console.log(`🔍 Testing sample image with Google Gemini: ${imageUrl}`);
        const startTime = Date.now();
        const analysis = await analyzeImageWithGeminiVision(imageUrl);
        const processingTime = Date.now() - startTime;
        
        results.push({
          imageUrl,
          analysis,
          processingTime,
          success: true,
          apiUsed: "Google Gemini Vision"
        });
        
        // Add delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        results.push({
          imageUrl,
          success: false,
          error: error.message,
          apiUsed: "Google Gemini Vision"
        });
      }
    }
    
    res.json({
      success: true,
      message: "Sample images test completed with Google Gemini",
      data: {
        results,
        totalImages: sampleImages.length,
        successCount: results.filter(r => r.success).length,
        provider: "Google Gemini Only",
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Sample images test failed",
      error: error.message
    });
  }
});

module.exports = router; 