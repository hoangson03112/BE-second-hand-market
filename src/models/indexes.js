






const mongoose = require('mongoose');
const config = require('../config/env');


const Product = require('./Product');
const Account = require('./Account');
const Order = require('./Order');
const Category = require('./Category');
const SubCategory = require('./SubCategory');

const indexes = {
  Product: [

  { fields: { status: 1, createdAt: -1 }, options: { name: 'status_createdAt' } },
  { fields: { categoryId: 1, status: 1 }, options: { name: 'category_status' } },
  { fields: { subcategoryId: 1, status: 1 }, options: { name: 'subcategory_status' } },
  { fields: { sellerId: 1, status: 1 }, options: { name: 'seller_status' } },


  // Màn "Tin đăng của tôi": lọc theo seller (+ status) và sort createdAt desc.
  { fields: { sellerId: 1, status: 1, createdAt: -1 }, options: { name: 'seller_status_created' } },


  { fields: { status: 1, price: 1 }, options: { name: 'status_price' } },


  { fields: { status: 1, stock: 1 }, options: { name: 'status_stock' } },


  { fields: { name: 'text', description: 'text' }, options: { name: 'text_search' } },


  { fields: { categoryId: 1, status: 1, createdAt: -1 }, options: { name: 'category_status_created' } }],


  Account: [

  { fields: { username: 1 }, options: { unique: true, name: 'username_unique' } },
  { fields: { email: 1 }, options: { unique: true, sparse: true, name: 'email_unique' } },
  { fields: { googleId: 1 }, options: { unique: true, sparse: true, name: 'googleId_unique' } },


  { fields: { refreshToken: 1 }, options: { name: 'refreshToken' } },


  { fields: { status: 1, role: 1 }, options: { name: 'status_role' } }],


  Order: [

  { fields: { buyerId: 1, createdAt: -1 }, options: { name: 'buyer_created' } },
  { fields: { sellerId: 1, createdAt: -1 }, options: { name: 'seller_created' } },


  { fields: { status: 1, createdAt: -1 }, options: { name: 'status_created' } },
  { fields: { buyerId: 1, status: 1 }, options: { name: 'buyer_status' } },
  { fields: { sellerId: 1, status: 1 }, options: { name: 'seller_status' } },


  { fields: { statusPayment: 1, createdAt: -1 }, options: { name: 'statusPayment_created' } }],


  Category: [
  { fields: { slug: 1 }, options: { unique: true, name: 'slug_unique' } },
  { fields: { parentId: 1 }, options: { name: 'parentId' } }],


  SubCategory: [
  { fields: { slug: 1 }, options: { unique: true, name: 'slug_unique' } },
  { fields: { categoryId: 1 }, options: { name: 'categoryId' } }]

};

async function createIndexes() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(config.mongoURL);
    console.log('Connected to MongoDB');

    for (const [modelName, indexList] of Object.entries(indexes)) {
      console.log(`\nCreating indexes for ${modelName}...`);

      const Model = require(`./${modelName}`);

      for (const { fields, options } of indexList) {
        try {
          await Model.collection.createIndex(fields, options);
          console.log(`  ✓ Created index: ${options.name}`);
        } catch (error) {
          if (error.code === 85 || error.code === 86) {
            console.log(`  ⚠ Index ${options.name} already exists or conflicts, dropping and recreating...`);
            try {
              await Model.collection.dropIndex(options.name);
              await Model.collection.createIndex(fields, options);
              console.log(`  ✓ Recreated index: ${options.name}`);
            } catch (recreateError) {
              console.error(`  ✗ Failed to recreate index ${options.name}:`, recreateError.message);
            }
          } else {
            console.error(`  ✗ Failed to create index ${options.name}:`, error.message);
          }
        }
      }
    }

    console.log('\n✓ Index creation completed');


    console.log('\n📊 Current Indexes:');
    for (const modelName of Object.keys(indexes)) {
      const Model = require(`./${modelName}`);
      const currentIndexes = await Model.collection.indexes();
      console.log(`\n${modelName}:`);
      currentIndexes.forEach((idx) => {
        console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
      });
    }

    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error creating indexes:', error);
    process.exit(1);
  }
}


if (require.main === module) {
  createIndexes();
}

module.exports = { createIndexes, indexes };