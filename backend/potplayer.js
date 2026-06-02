import { exec, spawn } from 'child_process';
import { platform } from 'os';
import fs from 'fs';

export class PotPlayer {
  constructor() {
    this.playerPath = this.findPotPlayer();
  }

  findPotPlayer() {
    const possiblePaths = [
      'D:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe',
      'D:\\Program Files\\PotPlayer\\PotPlayerMini64.exe',
      'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\PotPlayer\\PotPlayerMini64.exe',
      'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\PotPlayer\\PotPlayer.exe',
      'C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe',
      'C:\\Program Files (x86)\\DAUM\\PotPlayer\\PotPlayerMini.exe',
      'C:\\Program Files\\PotPlayer\\PotPlayerMini64.exe',
      'C:\\Program Files (x86)\\PotPlayer\\PotPlayerMini.exe'
    ];
    
    for (const path of possiblePaths) {
      try {
        if (fs.existsSync(path)) {
          console.log('找到 PotPlayer:', path);
          return path;
        }
      } catch (e) {
        console.log('检查路径失败:', path, e.message);
        continue;
      }
    }
    
    return this.findRunningPotPlayer();
  }

  findRunningPotPlayer() {
    try {
      const { execSync } = require('child_process');
      const output = execSync('wmic process where "name like \'%PotPlayer%\'" get ExecutablePath /value', { encoding: 'utf8' });
      console.log('WMIC 输出:', output);
      const match = output.match(/ExecutablePath=(.+)/);
      if (match && match[1]) {
        const path = match[1].trim();
        if (fs.existsSync(path)) {
          console.log('从进程找到 PotPlayer:', path);
          return path;
        }
      }
    } catch (e) {
      console.log('从进程查找失败:', e.message);
    }
    return null;
  }

  async play(url) {
    if (!this.playerPath) {
      throw new Error('未找到 PotPlayer，请先安装 PotPlayer');
    }

    return new Promise((resolve, reject) => {
      const escapedUrl = url.includes(' ') ? `"${url}"` : url;
      const command = `"${this.playerPath}" ${escapedUrl}`;
      
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ success: true, message: 'PotPlayer 已启动' });
        }
      });
    });
  }

  async playStream(streamInfo) {
    if (!this.playerPath) {
      throw new Error('未找到 PotPlayer，请先安装 PotPlayer');
    }

    const { url, title } = streamInfo;
    
    return new Promise((resolve, reject) => {
      const args = [url];
      if (title) {
        args.unshift('/title', title);
      }
      
      const child = spawn(this.playerPath, args, {
        detached: true,
        stdio: 'ignore'
      });
      
      child.unref();
      
      setTimeout(() => {
        resolve({ success: true, message: 'PotPlayer 已启动', title });
      }, 1000);
    });
  }

  getStatus() {
    return {
      installed: !!this.playerPath,
      path: this.playerPath || '未找到'
    };
  }

  setPlayerPath(path) {
    const fs = require('fs');
    if (fs.existsSync(path)) {
      this.playerPath = path;
      return true;
    }
    return false;
  }
}

export const potPlayer = new PotPlayer();