const mongoose = require('mongoose');
const Seller = require('./src/models/Seller');
const Product = require('./src/models/Product');
const Account = require('./src/models/Account');

// Kết nối database
mongoose.connect('mongodb://localhost:27017/second-hand-market', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function debugSellerData() {
  try {
    console.log('🔍 Checking database data...\n');

    // 1. Kiểm tra tất cả sellers
    const allSellers = await Seller.find({});
    console.log('📊 Total sellers in database:', allSellers.length);
    
    if (allSellers.length > 0) {
      console.log('👤 First seller data:');
      console.log(JSON.stringify(allSellers[0], null, 2));
    }

    // 2. Kiểm tra tất cả products
    const allProducts = await Product.find({}).populate('sellerId', 'fullName username email');
    console.log('\n📦 Total products in database:', allProducts.length);
    
    if (allProducts.length > 0) {
      console.log('📦 First product data:');
      console.log(JSON.stringify(allProducts[0], null, 2));
    }

    // 3. Kiểm tra tất cả accounts
    const allAccounts = await Account.find({});
    console.log('\n👤 Total accounts in database:', allAccounts.length);
    
    if (allAccounts.length > 0) {
      console.log('👤 First account data:');
      console.log(JSON.stringify(allAccounts[0], null, 2));
    }

    // 4. Kiểm tra relationship
    if (allProducts.length > 0 && allSellers.length > 0) {
      const firstProduct = allProducts[0];
      const firstSeller = allSellers[0];
      
      console.log('\n🔗 Relationship check:');
      console.log('Product sellerId:', firstProduct.sellerId?._id);
      console.log('Seller accountId:', firstSeller.accountId);
      console.log('Are they equal?', firstProduct.sellerId?._id?.toString() === firstSeller.accountId?.toString());
    }

    // 5. Kiểm tra products có sellerId không
    const productsWithSellerId = allProducts.filter(p => p.sellerId);
    console.log('\n📊 Products with sellerId:', productsWithSellerId.length);
    console.log('📊 Products without sellerId:', allProducts.length - productsWithSellerId.length);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.disconnect();
  }
}

debugSellerData(); 