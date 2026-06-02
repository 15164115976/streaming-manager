import express from 'express';
import cors from 'cors';
import { db } from './database.js';
import { streamParser } from './streamParser.js';
import { potPlayer } from './potplayer.js';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

let checkInterval = null;

app.get('/api/streamers', async (req, res) => {
  try {
    const streamers = await db.getStreamers();
    res.json(streamers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/streamers', async (req, res) => {
  try {
    const { platform, roomId, name, url, remark } = req.body;
    const id = await db.addStreamer({ platform, roomId, name, url, remark });
    res.json({ success: true, id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/streamers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { platform, roomId, name, url, remark } = req.body;
    await db.updateStreamer(id, { platform, roomId, name, url, remark });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/streamers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteStreamer(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/streamers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const streamer = await db.getStreamer(id);
    res.json(streamer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/streamers/:id/play', async (req, res) => {
  try {
    const { id } = req.params;
    const streamer = await db.getStreamer(id);
    
    if (!streamer) {
      return res.status(404).json({ error: '直播间不存在' });
    }
    
    const streamInfo = await streamParser.getStreamUrl(streamer.url);
    if (!streamInfo) {
      return res.status(400).json({ error: '无法获取直播流' });
    }
    
    const result = await potPlayer.playStream(streamInfo);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/streamers/:id/check', async (req, res) => {
  try {
    const { id } = req.params;
    const streamer = await db.getStreamer(id);
    
    if (!streamer) {
      return res.status(404).json({ error: '直播间不存在' });
    }
    
    const info = await streamParser.parse(streamer.url);
    if (info) {
      await db.updateLiveStatus(id, info.isLive ? 1 : 0, info.liveTitle);
    }
    
    res.json(info || { isLive: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/parse-url', async (req, res) => {
  try {
    const { url } = req.body;
    const info = await streamParser.parse(url);
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/light-task/:streamerId', async (req, res) => {
  try {
    const { streamerId } = req.params;
    const task = await db.getLightTask(streamerId);
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/light-task/:streamerId', async (req, res) => {
  try {
    const { streamerId } = req.params;
    const { currentExp, targetExp, taskProgress } = req.body;
    await db.updateLightTask(streamerId, { currentExp, targetExp, taskProgress });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/live-alert/:streamerId', async (req, res) => {
  try {
    const { streamerId } = req.params;
    const alert = await db.getLiveAlert(streamerId);
    res.json(alert);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/live-alert/:streamerId', async (req, res) => {
  try {
    const { streamerId } = req.params;
    const { enabled } = req.body;
    await db.updateLiveAlert(streamerId, enabled);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/potplayer/status', (req, res) => {
  res.json(potPlayer.getStatus());
});

app.post('/api/potplayer/path', (req, res) => {
  try {
    const { path } = req.body;
    const success = potPlayer.setPlayerPath(path);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/platform-auth', async (req, res) => {
  try {
    const platforms = ['bilibili', 'douyin', 'huya', 'douyu', 'twitch', 'youtube'];
    const auths = [];
    for (const platform of platforms) {
      const auth = await db.get('SELECT * FROM platformAuth WHERE platform=?', [platform]);
      auths.push({
        platform,
        cookie: auth?.cookie || '',
        token: auth?.token || '',
        enabled: auth?.enabled || 0
      });
    }
    res.json(auths);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/platform-auth/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const { cookie, token, enabled } = req.body;
    const existing = await db.get('SELECT * FROM platformAuth WHERE platform=?', [platform]);
    if (existing) {
      await db.run('UPDATE platformAuth SET cookie=?, token=?, enabled=?, updatedAt=CURRENT_TIMESTAMP WHERE platform=?', 
        [cookie, token, enabled, platform]);
    } else {
      await db.run('INSERT INTO platformAuth (platform, cookie, token, enabled) VALUES (?, ?, ?, ?)',
        [platform, cookie, token, enabled]);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/douyin-following', async (req, res) => {
  try {
    const auth = await db.get('SELECT * FROM platformAuth WHERE platform=?', ['douyin']);
    if (!auth || !auth.cookie) {
      return res.status(400).json({ error: '请先配置抖音的 Cookie' });
    }
    
    const liveList = await streamParser.getDouyinFollowingLive(auth.cookie);
    res.json(liveList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/add-douyin-following', async (req, res) => {
  try {
    const auth = await db.get('SELECT * FROM platformAuth WHERE platform=?', ['douyin']);
    if (!auth || !auth.cookie) {
      return res.status(400).json({ error: '请先配置抖音的 Cookie' });
    }
    
    const liveList = await streamParser.getDouyinFollowingLive(auth.cookie);
    const addedCount = 0;
    
    for (const live of liveList) {
      try {
        const existing = await db.get('SELECT id FROM streamers WHERE url=?', [live.url]);
        if (!existing) {
          await db.addStreamer({
            platform: live.platform,
            roomId: live.roomId,
            name: live.name,
            url: live.url,
            remark: ''
          });
          addedCount++;
        }
      } catch (e) {
        console.error('添加直播间失败:', e);
      }
    }
    
    res.json({ success: true, addedCount, totalCount: liveList.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/check-all', async (req, res) => {
  try {
    const streamers = await db.getStreamers();
    const results = [];
    
    for (const streamer of streamers) {
      try {
        const info = await streamParser.parse(streamer.url);
        if (info) {
          await db.updateLiveStatus(streamer.id, info.isLive ? 1 : 0, info.liveTitle);
          results.push({ id: streamer.id, isLive: info.isLive, title: info.liveTitle });
        }
      } catch (e) {
        results.push({ id: streamer.id, isLive: false, error: e.message });
      }
    }
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/start-monitor', (req, res) => {
  if (checkInterval) {
    clearInterval(checkInterval);
  }
  
  checkInterval = setInterval(async () => {
    try {
      const streamers = await db.getStreamers();
      for (const streamer of streamers) {
        const alert = await db.getLiveAlert(streamer.id);
        if (!alert || alert.enabled !== 1) continue;
        
        try {
          const info = await streamParser.parse(streamer.url);
          if (info && info.isLive && streamer.isLive === 0) {
            console.log(`直播提醒: ${streamer.name} 开播了! - ${info.liveTitle}`);
            await db.updateLiveStatus(streamer.id, 1, info.liveTitle);
            await db.addLiveHistory(streamer.id, info.liveTitle, new Date().toISOString());
          } else if (info && !info.isLive && streamer.isLive === 1) {
            await db.updateLiveStatus(streamer.id, 0, '');
            await db.updateLiveHistoryEndTime(streamer.id, new Date().toISOString());
          }
        } catch (e) {
          console.error(`检查 ${streamer.name} 失败:`, e);
        }
      }
    } catch (e) {
      console.error('监控任务失败:', e);
    }
  }, 30000);
  
  res.json({ success: true, message: '监控已启动，每30秒检查一次' });
});

app.post('/api/stop-monitor', (req, res) => {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    res.json({ success: true, message: '监控已停止' });
  } else {
    res.json({ success: false, message: '监控未运行' });
  }
});

app.use(express.static('../frontend'));

app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
});