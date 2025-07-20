const mongoose = require('mongoose');
const Order = require('./src/models/Order');
const Seller = require('./src/models/Seller');

// Kết nối database
mongoose.connect('mongodb://localhost:27017/second-hand-market', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function debugOrderAPI() {
  try {
    console.log('🔍 Debugging Order API...\n');

    // 1. Kiểm tra tất cả orders
    const allOrders = await Order.find()
      .sort({ createdAt: -1 })
      .populate("buyerId", "fullName email phoneNumber")
      .populate("sellerId", "fullName email phoneNumber createdAt")
      .populate({
        path: "products.productId",
        select: "name price images avatar createdAt",
        populate: [
          {
            path: "categoryId",
            select: "name"
          },
          {
            path: "subcategoryId", 
            select: "name"
          },
          {
            path: "attributes",
            select: "key value"
          }
        ]
      })
      .populate("shippingAddress");

    console.log('📊 Total orders:', allOrders.length);
    
    if (allOrders.length > 0) {
      const firstOrder = allOrders[0];
      console.log('\n📦 First order data:');
      console.log('- Order ID:', firstOrder._id);
      console.log('- Status:', firstOrder.status);
      console.log('- Total Amount:', firstOrder.totalAmount);
      
      if (firstOrder.sellerId) {
        console.log('\n👤 Seller ID from order:');
        console.log('- Seller ID:', firstOrder.sellerId._id);
        console.log('- Full Name:', firstOrder.sellerId.fullName);
        console.log('- Email:', firstOrder.sellerId.email);
      } else {
        console.log('\n❌ No sellerId in order');
      }
    }

    // 2. Kiểm tra tất cả sellers
    const allSellers = await Seller.find({});
    console.log('\n👤 Total sellers in database:', allSellers.length);
    
    if (allSellers.length > 0) {
      console.log('\n👤 First seller data:');
      console.log(JSON.stringify(allSellers[0], null, 2));
    }

    // 3. Kiểm tra relationship
    if (allOrders.length > 0 && allSellers.length > 0) {
      const firstOrder = allOrders[0];
      const firstSeller = allSellers[0];
      
      console.log('\n🔗 Relationship check:');
      console.log('Order sellerId:', firstOrder.sellerId?._id);
      console.log('Seller accountId:', firstSeller.accountId);
      console.log('Are they equal?', firstOrder.sellerId?._id?.toString() === firstSeller.accountId?.toString());
    }

    // 4. Test logic mapping
    if (allOrders.length > 0) {
      console.log('\n🧪 Testing mapping logic:');
      
      const sellerIds = [...new Set(
        allOrders
          .filter(order => order.sellerId && order.sellerId._id)
          .map((order) => order.sellerId._id)
      )];
      
      console.log('Seller IDs from orders:', sellerIds);
      
      const sellers = await Seller.find({ accountId: { $in: sellerIds } });
      console.log('Found sellers:', sellers.length);
      
      const sellerMap = new Map();
      sellers.forEach((seller) => {
        sellerMap.set(seller.accountId.toString(), seller);
      });
      
      console.log('Seller map keys:', Array.from(sellerMap.keys()));
      
      // Test mapping cho order đầu tiên
      const firstOrder = allOrders[0];
      const seller = firstOrder.sellerId && firstOrder.sellerId._id 
        ? sellerMap.get(firstOrder.sellerId._id.toString())
        : null;
        
      console.log('\n✅ Mapping result for first order:');
      console.log('Found seller:', seller ? 'YES' : 'NO');
      if (seller) {
        console.log('Seller data:', {
          _id: seller._id,
          businessAddress: seller.businessAddress,
          province: seller.province,
          district: seller.district,
          ward: seller.ward,
          verificationStatus: seller.verificationStatus
        });
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.disconnect();
  }
}

debugOrderAPI(); 