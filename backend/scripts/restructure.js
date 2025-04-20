/**
 * Script to restructure the project
 * 
 * This script helps migrate from the old structure to the new structure
 * Run with: node scripts/restructure.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Helper to create directory if not exists
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

// Helper to copy files
function copyFile(source, target) {
  try {
    fs.copyFileSync(source, target);
    console.log(`Copied: ${source} → ${target}`);
  } catch (err) {
    console.error(`Error copying ${source}: ${err.message}`);
  }
}

// Create directories
console.log('Creating directories...');
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const configDir = path.join(rootDir, 'config');

// Create main directories
ensureDirectoryExists(path.join(rootDir, 'config'));
ensureDirectoryExists(path.join(rootDir, 'scripts'));
ensureDirectoryExists(path.join(srcDir, 'services'));
ensureDirectoryExists(path.join(srcDir, 'utils'));
ensureDirectoryExists(path.join(srcDir, 'middleware'));

// Rename middlewave → middleware (if old structure still exists)
if (fs.existsSync(path.join(srcDir, 'middlewave'))) {
  try {
    fs.renameSync(
      path.join(srcDir, 'middlewave'),
      path.join(srcDir, 'middleware')
    );
    console.log('Renamed middlewave → middleware');
  } catch (err) {
    console.error(`Error renaming middlewave: ${err.message}`);
  }
}

// Move .env to root if it exists in src
if (fs.existsSync(path.join(srcDir, '.env'))) {
  try {
    fs.renameSync(
      path.join(srcDir, '.env'),
      path.join(rootDir, '.env')
    );
    console.log('Moved .env to root directory');
  } catch (err) {
    console.error(`Error moving .env: ${err.message}`);
  }
}

// Create .env.example if not exists
if (!fs.existsSync(path.join(rootDir, '.env.example'))) {
  try {
    // Copy from existing file if available
    if (fs.existsSync(path.join(rootDir, '.env'))) {
      let envContent = fs.readFileSync(path.join(rootDir, '.env'), 'utf8');
      
      // Replace any actual values with placeholders
      envContent = envContent
        .replace(/USERNAME_GMAIL=.*$/m, 'USERNAME_GMAIL=your-email@gmail.com')
        .replace(/PASSWORD_GMAIL=.*$/m, 'PASSWORD_GMAIL=your-email-password')
        .replace(/JWT_SECRET=.*$/m, 'JWT_SECRET=your-secret-key');
      
      // Add additional env vars
      envContent += '\n# Server configuration';
      envContent += '\nPORT=2000';
      envContent += '\nNODE_ENV=development';
      envContent += '\n# Logging';
      envContent += '\nLOG_LEVEL=2 # INFO level';
      envContent += '\n# CORS';
      envContent += '\nCORS_ORIGIN=*';
      
      fs.writeFileSync(path.join(rootDir, '.env.example'), envContent);
      console.log('Created .env.example from .env');
    }
  } catch (err) {
    console.error(`Error creating .env.example: ${err.message}`);
  }
}

console.log('\nRestructuring complete!');
console.log('\nNext steps:');
console.log('1. Update imports in controllers to use middleware instead of middlewave');
console.log('2. Update .env file with any new environment variables');
console.log('3. Restart your application'); 