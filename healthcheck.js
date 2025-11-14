#!/usr/bin/env node

/**
 * Health check script to verify bot configuration and dependencies
 * Run with: node healthcheck.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Running health checks...\n');

let allPassed = true;

// Check 1: Node version
console.log('✓ Node.js version:', process.version);
const nodeMajor = parseInt(process.version.slice(1).split('.')[0]);
if (nodeMajor < 18) {
  console.error('✗ Node.js version must be 18 or higher');
  allPassed = false;
}

// Check 2: Dependencies installed
try {
  const pkgJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  console.log('✓ package.json found');
  
  if (fs.existsSync('./node_modules')) {
    console.log('✓ node_modules exists');
    
    // Check critical dependencies
    const criticalDeps = ['discord.js', 'steam-user', 'better-sqlite3', 'dotenv'];
    for (const dep of criticalDeps) {
      if (fs.existsSync(`./node_modules/${dep}`)) {
        console.log(`✓ ${dep} installed`);
      } else {
        console.error(`✗ ${dep} not installed`);
        allPassed = false;
      }
    }
  } else {
    console.error('✗ node_modules not found - run npm install');
    allPassed = false;
  }
} catch (error) {
  console.error('✗ Error reading package.json:', error.message);
  allPassed = false;
}

// Check 3: Environment file
if (fs.existsSync('./.env')) {
  console.log('✓ .env file exists');
  
  // Check for required env vars
  const envContent = fs.readFileSync('./.env', 'utf8');
  const requiredVars = [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'STEAM_USERNAME',
    'STEAM_PASSWORD'
  ];
  
  for (const varName of requiredVars) {
    if (envContent.includes(`${varName}=`) && !envContent.includes(`${varName}=your_`)) {
      console.log(`✓ ${varName} is set`);
    } else {
      console.warn(`⚠ ${varName} needs to be configured`);
    }
  }
  
  if (envContent.includes('STEAM_SHARED_SECRET=') && !envContent.includes('STEAM_SHARED_SECRET=your_')) {
    console.log('✓ STEAM_SHARED_SECRET is set (recommended)');
  } else {
    console.warn('⚠ STEAM_SHARED_SECRET not set - bot will need STEAM_2FA_CODE');
  }
} else {
  console.warn('⚠ .env file not found - copy .env.example to .env and configure it');
}

// Check 4: Source files
const sourceFiles = [
  'src/index.js',
  'src/database.js',
  'src/steam-manager.js',
  'src/discord-manager.js',
  'src/logger.js',
  'src/commands/steam.js'
];

for (const file of sourceFiles) {
  if (fs.existsSync(file)) {
    console.log(`✓ ${file} exists`);
  } else {
    console.error(`✗ ${file} missing`);
    allPassed = false;
  }
}

// Check 5: Docker files (optional)
if (fs.existsSync('./Dockerfile')) {
  console.log('✓ Dockerfile exists');
}
if (fs.existsSync('./docker-compose.yml')) {
  console.log('✓ docker-compose.yml exists');
}

console.log('\n' + '='.repeat(50));
if (allPassed) {
  console.log('✅ All critical health checks passed!');
  console.log('📝 Next steps:');
  console.log('   1. Configure your .env file');
  console.log('   2. Add bot Steam account as friend on Steam');
  console.log('   3. Run: npm start');
  process.exit(0);
} else {
  console.error('❌ Some health checks failed. Please fix the issues above.');
  process.exit(1);
}
