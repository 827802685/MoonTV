#!/usr/bin/env node
/**
 * MoonTV Cloudflare Pages 部署脚本
 * 使用方法: node deploy.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 配置
const config = {
  account_id: 'your_account_id',
  project_name: 'moon',
  branch: 'main',
  output_dir: '.vercel/output/static',
  build_command: 'pnpm pages:build',
};

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(cmd, options = {}) {
  try {
    const result = execSync(cmd, {
      stdio: 'inherit',
      encoding: 'utf8',
      ...options,
    });
    return result;
  } catch (error) {
    log(error.message, 'red');
    process.exit(1);
  }
}

async function main() {
  log('\n=== MoonTV Cloudflare Pages 部署脚本 ===', 'cyan');

  // 检查 Node.js
  log('\n[1/5] 检查环境...', 'blue');
  const nodeVersion = execSync('node --version').trim();
  const npmVersion = execSync('npm --version').trim();
  log(`Node.js: ${nodeVersion}`, 'green');
  log(`npm: ${npmVersion}`, 'green');

  // 检查 pnpm
  try {
    const pnpmVersion = execSync('pnpm --version').trim();
    log(`pnpm: ${pnpmVersion}`, 'green');
  } catch (e) {
    log('警告: pnpm 未安装，请运行: npm install -g pnpm', 'yellow');
  }

  // 检查构建输出
  log('\n[2/5] 检查构建输出...', 'blue');
  const indexPath = path.join(
    process.cwd(),
    config.output_dir,
    '_worker.js',
    'index.js'
  );
  if (!fs.existsSync(indexPath)) {
    log('未找到构建输出，正在构建...', 'yellow');
    runCommand(config.build_command);
  } else {
    const stats = fs.statSync(indexPath);
    log(`构建输出已存在 (${Math.round(stats.size / 1024)}KB)`, 'green');
  }

  // 检查 wrangler.toml
  log('\n[3/5] 检查配置...', 'blue');
  const wranglerPath = path.join(process.cwd(), 'wrangler.toml');
  if (!fs.existsSync(wranglerPath)) {
    log('错误: 未找到 wrangler.toml', 'red');
    log('请先创建 wrangler.toml 配置文件', 'red');
    process.exit(1);
  }

  // 读取配置
  const wranglerConfig = fs.readFileSync(wranglerPath, 'utf8');
  const dbIdMatch = wranglerConfig.match(/database_id\s*=\s*"([^"]*)"/);
  if (!dbIdMatch || dbIdMatch[1] === '') {
    log('警告: D1 数据库 ID 未设置', 'yellow');
    log('请在 Cloudflare 控制台创建 D1 数据库并更新 wrangler.toml', 'yellow');
    log('\n创建 D1 数据库步骤:', 'cyan');
    log('1. 访问 https://dash.cloudflare.com', 'reset');
    log('2. 进入 存储和数据库 -> D1 SQL 数据库', 'reset');
    log('3. 点击 创建数据库', 'reset');
    log('4. 名称: moon-tv-db', 'reset');
    log('5. 复制生成的数据库 ID', 'reset');
    log('6. 更新 wrangler.toml 中的 database_id', 'reset');

    const shouldContinue = await prompt('\n是否继续部署? (y/n): ');
    if (shouldContinue.toLowerCase() !== 'y') {
      log('部署已取消', 'yellow');
      process.exit(0);
    }
  } else {
    log(`D1 数据库 ID: ${dbIdMatch[1]}`, 'green');
  }

  // 部署
  log('\n[4/5] 部署到 Cloudflare Pages...', 'blue');

  const deployCommand = `wrangler pages deploy "${config.output_dir}" --project-name=${config.project_name} --branch=${config.branch} --no-bundle`;
  log(`执行命令: ${deployCommand}`, 'cyan');

  try {
    runCommand(deployCommand);
    log('部署成功!', 'green');
  } catch (error) {
    log('部署失败，请检查错误信息', 'red');
    process.exit(1);
  }

  // 完成
  log('\n[5/5] 部署完成!', 'green');
  log(`\n访问地址: https://${config.project_name}.pages.dev`, 'cyan');
  log(
    `Cloudflare 控制台: https://dash.cloudflare.com/pages/view/${config.project_name}`,
    'cyan'
  );
  log('\n请确保在 Pages 设置中:', 'yellow');
  log('- 已绑定 D1 数据库 (变量名: DB)', 'yellow');
  log(
    '- 已设置环境变量 PASSWORD, USERNAME, NEXT_PUBLIC_STORAGE_TYPE',
    'yellow'
  );
}

function prompt(question) {
  // 同步提示
  process.stdout.write(question);
  const answer = readlineSync.question();
  return answer;
}

// 需要 readline-sync，如果没有则使用简单方式
let readlineSync;
try {
  readlineSync = require('readline-sync');
} catch (e) {
  readlineSync = {
    question: (q) => {
      process.stdout.write(q);
      const chunks = [];
      process.stdin.on('data', (chunk) => {
        chunks.push(chunk);
        process.stdin.pause();
      });
      return new Promise((resolve) => {
        process.stdin.once('end', () => resolve(chunks.join('')));
      });
    },
  };
}

main().catch(console.error);
