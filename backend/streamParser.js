import axios from 'axios';
import { load } from 'cheerio';
import { db } from './database.js';

export class StreamParser {
  constructor() {
    this.platforms = {
      bilibili: this.parseBilibili.bind(this),
      douyin: this.parseDouyin.bind(this),
      huya: this.parseHuya.bind(this),
      douyu: this.parseDouyu.bind(this),
      twitch: this.parseTwitch.bind(this),
      youtube: this.parseYoutube.bind(this)
    };
    this.authCache = {};
  }

  async getAuth(platform) {
    if (this.authCache[platform]) {
      return this.authCache[platform];
    }
    const auth = await db.get('SELECT * FROM platformAuth WHERE platform=?', [platform]);
    if (auth) {
      this.authCache[platform] = auth;
    }
    return auth || {};
  }

  async parse(url) {
    const platform = this.detectPlatform(url);
    if (!platform) {
      throw new Error('不支持的平台');
    }
    return await this.platforms[platform](url);
  }

  detectPlatform(url) {
    if (url.includes('bilibili.com') || url.includes('bilibili.tv')) return 'bilibili';
    if (url.includes('douyin.com') || url.includes('dyttlive.com')) return 'douyin';
    if (url.includes('huya.com')) return 'huya';
    if (url.includes('douyu.com')) return 'douyu';
    if (url.includes('twitch.tv')) return 'twitch';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    return null;
  }

  async parseBilibili(url) {
    try {
      const roomId = url.match(/live\.bilibili\.com\/(\d+)/)?.[1];
      if (!roomId) {
        throw new Error('无法提取直播间 ID');
      }
      
      const auth = await this.getAuth('bilibili');
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };
      if (auth.cookie) {
        headers['Cookie'] = auth.cookie;
      }
      
      const apiUrl = `https://api.live.bilibili.com/room/v1/Room/get_info?id=${roomId}`;
      const response = await axios.get(apiUrl, { headers });
      const data = response.data.data;
      
      return {
        platform: 'bilibili',
        roomId: roomId,
        name: data.uname || '未知主播',
        url: `https://live.bilibili.com/${roomId}`,
        isLive: data.live_status === 1,
        liveTitle: data.title,
        viewerCount: data.online,
        cover: data.cover_from_user
      };
    } catch (error) {
      console.error('B 站解析失败:', error);
      return null;
    }
  }

  async parseDouyin(url) {
    try {
      const auth = await this.getAuth('douyin');
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };
      if (auth.cookie) {
        headers['Cookie'] = auth.cookie;
      }
      
      const response = await axios.get(url, { headers });
      
      const $ = load(response.data);
      const scriptContent = $('script').filter((i, el) => 
        $(el).html()?.includes('roomInfo')
      ).html();
      
      if (!scriptContent) {
        return {
          platform: 'douyin',
          roomId: url,
          name: '抖音主播',
          url: url,
          isLive: false,
          liveTitle: '未知',
          viewerCount: 0,
          cover: ''
        };
      }
      
      const match = scriptContent.match(/"roomName":"([^"]+)"/);
      const title = match ? match[1] : '未知';
      
      return {
        platform: 'douyin',
        roomId: url,
        name: '抖音主播',
        url: url,
        isLive: true,
        liveTitle: title,
        viewerCount: 0,
        cover: ''
      };
    } catch (error) {
      console.error('抖音解析失败:', error);
      return null;
    }
  }

  async getDouyinFollowingLive(cookie) {
    const result = [];
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': cookie
      };

      const response = await axios.get('https://live.douyin.com/webcast/reflow/homepage/', { headers });
      const $ = load(response.data);
      
      const scriptContent = $('script').filter((i, el) => 
        $(el).html()?.includes('webcastRoomList') || $(el).html()?.includes('roomList')
      ).html();
      
      if (!scriptContent) {
        return [];
      }

      const roomListMatch = scriptContent.match(/webcastRoomList:\s*(\[.*?\])/);
      if (roomListMatch) {
        try {
          const roomList = JSON.parse(roomListMatch[1]);
          for (const room of roomList) {
            result.push({
              platform: 'douyin',
              roomId: room.roomId || room.id || '',
              name: room.hostName || room.ownerName || '未知主播',
              url: `https://live.douyin.com/${room.roomId || room.id}`,
              isLive: room.liveStatus === 1 || room.isLive === true,
              liveTitle: room.roomName || room.title || '未知',
              viewerCount: room.onlineCount || room.viewerCount || 0,
              cover: room.coverUrl || room.cover || ''
            });
          }
        } catch (e) {
          console.error('解析抖音房间列表失败:', e);
        }
      }

      const shortRoomListMatch = scriptContent.match(/roomList:\s*(\[.*?\])/);
      if (shortRoomListMatch && result.length === 0) {
        try {
          const roomList = JSON.parse(shortRoomListMatch[1]);
          for (const room of roomList) {
            result.push({
              platform: 'douyin',
              roomId: room.roomId || room.id || '',
              name: room.hostName || room.ownerName || '未知主播',
              url: `https://live.douyin.com/${room.roomId || room.id}`,
              isLive: true,
              liveTitle: room.roomName || room.title || '未知',
              viewerCount: room.onlineCount || room.viewerCount || 0,
              cover: room.coverUrl || room.cover || ''
            });
          }
        } catch (e) {
          console.error('解析抖音房间列表失败:', e);
        }
      }

      return result;
    } catch (error) {
      console.error('获取抖音关注直播失败:', error);
      return [];
    }
  }

  async parseHuya(url) {
    try {
      const roomId = url.match(/huya\.com\/(\w+)/)?.[1];
      if (!roomId) {
        throw new Error('无法提取直播间ID');
      }
      
      const response = await axios.get(`https://www.huya.com/${roomId}`);
      const $ = load(response.data);
      
      const name = $('.host-name').text().trim() || $('.room-info-hostname').text().trim() || roomId;
      const title = $('.room-title').text().trim() || $('.live-title').text().trim();
      const isLive = $('i.live-icon').length > 0 || $('span.live').length > 0;
      
      return {
        platform: 'huya',
        roomId: roomId,
        name: name,
        url: `https://www.huya.com/${roomId}`,
        isLive: isLive,
        liveTitle: title,
        viewerCount: 0,
        cover: ''
      };
    } catch (error) {
      console.error('虎牙解析失败:', error);
      return null;
    }
  }

  async parseDouyu(url) {
    try {
      const roomId = url.match(/douyu\.com\/(\d+)/)?.[1];
      if (!roomId) {
        throw new Error('无法提取直播间ID');
      }
      
      const apiUrl = `https://www.douyu.com/lapi/live/getLiveById/${roomId}`;
      const response = await axios.get(apiUrl);
      const data = response.data.data;
      
      return {
        platform: 'douyu',
        roomId: roomId,
        name: data.nickname,
        url: `https://www.douyu.com/${roomId}`,
        isLive: data.is_living === 1,
        liveTitle: data.room_name,
        viewerCount: data.online,
        cover: data.room_src
      };
    } catch (error) {
      console.error('斗鱼解析失败:', error);
      return null;
    }
  }

  async parseTwitch(url) {
    try {
      const channel = url.match(/twitch\.tv\/(\w+)/)?.[1];
      if (!channel) {
        throw new Error('无法提取频道名');
      }
      
      const apiUrl = `https://api.twitch.tv/helix/streams?user_login=${channel}`;
      const response = await axios.get(apiUrl, {
        headers: {
          'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
          'Authorization': 'Bearer undefined'
        }
      });
      
      const data = response.data.data[0];
      
      return {
        platform: 'twitch',
        roomId: channel,
        name: channel,
        url: `https://twitch.tv/${channel}`,
        isLive: !!data,
        liveTitle: data?.title || '离线',
        viewerCount: data?.viewer_count || 0,
        cover: data?.thumbnail_url || ''
      };
    } catch (error) {
      console.error('Twitch解析失败:', error);
      return null;
    }
  }

  async parseYoutube(url) {
    try {
      const channelId = url.match(/channel\/([a-zA-Z0-9_-]+)/)?.[1];
      const videoId = url.match(/watch\?v=([a-zA-Z0-9_-]+)/)?.[1];
      
      return {
        platform: 'youtube',
        roomId: channelId || videoId || url,
        name: 'YouTube主播',
        url: url,
        isLive: true,
        liveTitle: '直播中',
        viewerCount: 0,
        cover: ''
      };
    } catch (error) {
      console.error('YouTube解析失败:', error);
      return null;
    }
  }

  async getStreamUrl(url) {
    const info = await this.parse(url);
    if (!info || !info.isLive) {
      return null;
    }
    
    return {
      url: info.url,
      platform: info.platform,
      title: info.liveTitle,
      playerUrl: this.getPlayerUrl(info.platform, info.roomId)
    };
  }

  getPlayerUrl(platform, roomId) {
    switch(platform) {
      case 'bilibili':
        return `https://live.bilibili.com/${roomId}`;
      case 'huya':
        return `https://www.huya.com/${roomId}`;
      case 'douyu':
        return `https://www.douyu.com/${roomId}`;
      case 'twitch':
        return `https://twitch.tv/${roomId}`;
      case 'youtube':
        return `https://www.youtube.com/channel/${roomId}/live`;
      default:
        return roomId;
    }
  }
}

export const streamParser = new StreamParser();