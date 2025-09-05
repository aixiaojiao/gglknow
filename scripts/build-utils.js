#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 递归删除目录
function rmdir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`Cleaned: ${dirPath}`);
  }
}

// 递归复制目录
function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`Source directory does not exist: ${src}`);
    return;
  }
  
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 复制单个文件
function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`Source file does not exist: ${src}`);
    return;
  }
  
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  fs.copyFileSync(src, dest);
  console.log(`Copied: ${src} -> ${dest}`);
}

// 获取版本号
function getVersion() {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}

// 处理命令行参数
const command = process.argv[2];

switch (command) {
  case 'clean':
    rmdir(path.join(projectRoot, 'dist'));
    console.log('Dist directory cleaned');
    break;
    
  case 'copy:assets':
    const distPath = path.join(projectRoot, 'dist');
    
    // 确保 dist 目录存在
    if (!fs.existsSync(distPath)) {
      fs.mkdirSync(distPath, { recursive: true });
    }
    
    // 复制文件
    copyFile(path.join(projectRoot, 'manifest.json'), path.join(distPath, 'manifest.json'));
    copyFile(path.join(projectRoot, 'styles.css'), path.join(distPath, 'styles.css'));
    copyFile(path.join(projectRoot, 'tweet-browser.html'), path.join(distPath, 'tweet-browser.html'));
    copyFile(path.join(projectRoot, 'tweet-browser.js'), path.join(distPath, 'tweet-browser.js'));
    copyFile(path.join(projectRoot, 'tweet-metadata-manager.js'), path.join(distPath, 'tweet-metadata-manager.js'));
    copyFile(path.join(projectRoot, 'help.html'), path.join(distPath, 'help.html'));
    
    // 复制目录
    copyDir(path.join(projectRoot, 'icons'), path.join(distPath, 'icons'));
    copyDir(path.join(projectRoot, 'src/_locales'), path.join(distPath, '_locales'));
    copyDir(path.join(projectRoot, 'src/popup'), path.join(distPath, 'src/popup'));
    
    console.log('Assets copied successfully');
    break;
    
  case 'zip':
    // 使用tar命令创建压缩包（跨平台兼容）
    const version = getVersion();
    const { execSync } = await import('child_process');
    const archiveName = `gglknow-v${version}-release.tar.gz`;
    
    try {
      execSync(`tar -czf ${archiveName} -C dist .`, { cwd: projectRoot });
      console.log(`Created archive: ${archiveName}`);
    } catch (error) {
      console.error('Failed to create archive:', error.message);
      process.exit(1);
    }
    break;
    
  default:
    console.log('Usage: node build-utils.js <command>');
    console.log('Commands: clean, copy:assets, zip');
    break;
}
