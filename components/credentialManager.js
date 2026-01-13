// credentialManager.js
// 安全凭据管理模块 - 用于存储和管理用户登录凭据
// 使用 AES-GCM 加密存储敏感信息

class CredentialManager {
  constructor() {
    this.storagePrefix = 'moodesk_cred_';
    this.settingsKey = 'moodesk_autologin_settings';
    this.encryptionKey = null;
    this.isInitialized = false;
  }

  /**
   * 初始化凭据管理器
   */
  async init() {
    if (this.isInitialized) return;
    
    try {
      // 获取或生成加密密钥
      this.encryptionKey = await this.getOrCreateEncryptionKey();
      this.isInitialized = true;
      console.log('[Moodesk Credential] 凭据管理器已初始化');
    } catch (error) {
      console.error('[Moodesk Credential] 初始化失败:', error);
    }
  }

  /**
   * 获取或创建加密密钥
   * 使用浏览器的 Web Crypto API
   */
  async getOrCreateEncryptionKey() {
    try {
      const keyData = await chrome.storage.local.get('moodesk_encryption_key');
      
      if (keyData.moodesk_encryption_key) {
        // 从存储中恢复密钥
        const keyBuffer = this.base64ToArrayBuffer(keyData.moodesk_encryption_key);
        return await crypto.subtle.importKey(
          'raw',
          keyBuffer,
          { name: 'AES-GCM' },
          true,
          ['encrypt', 'decrypt']
        );
      }

      // 生成新密钥
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );

      // 导出并存储密钥
      const exportedKey = await crypto.subtle.exportKey('raw', key);
      await chrome.storage.local.set({
        moodesk_encryption_key: this.arrayBufferToBase64(exportedKey)
      });

      return key;
    } catch (error) {
      console.error('[Moodesk Credential] 密钥管理失败:', error);
      throw error;
    }
  }

  /**
   * 加密数据
   */
  async encrypt(data) {
    if (!this.encryptionKey) await this.init();

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(JSON.stringify(data));

    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      encodedData
    );

    return {
      iv: this.arrayBufferToBase64(iv),
      data: this.arrayBufferToBase64(encryptedData)
    };
  }

  /**
   * 解密数据
   */
  async decrypt(encryptedObj) {
    if (!this.encryptionKey) await this.init();

    try {
      const iv = this.base64ToArrayBuffer(encryptedObj.iv);
      const data = this.base64ToArrayBuffer(encryptedObj.data);

      const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        this.encryptionKey,
        data
      );

      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(decryptedData));
    } catch (error) {
      console.error('[Moodesk Credential] 解密失败:', error);
      return null;
    }
  }

  /**
   * 保存站点凭据
   */
  async saveCredentials(site, username, password) {
    await this.init();

    const encrypted = await this.encrypt({ username, password });
    const key = `${this.storagePrefix}${site}`;

    await chrome.storage.local.set({
      [key]: encrypted,
      [`${key}_time`]: Date.now(),
      [`${key}_username`]: username // 明文保存用户名用于显示
    });

    console.log(`[Moodesk Credential] 凭据已保存: ${site}`);
    return true;
  }

  /**
   * 获取站点凭据
   */
  async getCredentials(site) {
    await this.init();

    const key = `${this.storagePrefix}${site}`;
    const result = await chrome.storage.local.get([key, `${key}_time`]);

    if (!result[key]) {
      return null;
    }

    const credentials = await this.decrypt(result[key]);
    if (credentials) {
      credentials.savedAt = result[`${key}_time`];
    }

    return credentials;
  }

  /**
   * 删除站点凭据
   */
  async deleteCredentials(site) {
    const key = `${this.storagePrefix}${site}`;
    await chrome.storage.local.remove([key, `${key}_time`, `${key}_username`]);
    console.log(`[Moodesk Credential] 凭据已删除: ${site}`);
  }

  /**
   * 获取所有已保存凭据的站点
   */
  async getSavedSites() {
    const all = await chrome.storage.local.get(null);
    const sites = [];

    for (const key of Object.keys(all)) {
      if (key.startsWith(this.storagePrefix) && !key.includes('_time') && !key.includes('_username')) {
        const site = key.replace(this.storagePrefix, '');
        sites.push({
          site,
          username: all[`${key}_username`] || '未知用户',
          savedAt: all[`${key}_time`]
        });
      }
    }

    return sites;
  }

  /**
   * 清除所有凭据
   */
  async clearAllCredentials() {
    const all = await chrome.storage.local.get(null);
    const keysToRemove = Object.keys(all).filter(key => 
      key.startsWith(this.storagePrefix) || key === 'moodesk_encryption_key'
    );

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }

    this.encryptionKey = null;
    this.isInitialized = false;
    console.log('[Moodesk Credential] 所有凭据已清除');
  }

  // ============================================
  // 自动登录设置
  // ============================================

  /**
   * 获取自动登录设置
   */
  async getAutoLoginSettings() {
    const result = await chrome.storage.local.get(this.settingsKey);
    return result[this.settingsKey] || {
      enabled: false,
      sites: {} // { 'ukmfolio.ukm.my': { enabled: true, lastLogin: timestamp } }
    };
  }

  /**
   * 保存自动登录设置
   */
  async saveAutoLoginSettings(settings) {
    await chrome.storage.local.set({ [this.settingsKey]: settings });
  }

  /**
   * 启用/禁用站点的自动登录
   */
  async setAutoLoginForSite(site, enabled) {
    const settings = await this.getAutoLoginSettings();
    
    if (!settings.sites) settings.sites = {};
    settings.sites[site] = {
      ...settings.sites[site],
      enabled
    };

    await this.saveAutoLoginSettings(settings);
    console.log(`[Moodesk Credential] ${site} 自动登录: ${enabled ? '已启用' : '已禁用'}`);
  }

  /**
   * 检查站点是否启用自动登录
   */
  async isAutoLoginEnabled(site) {
    const settings = await this.getAutoLoginSettings();
    return settings.enabled && settings.sites?.[site]?.enabled;
  }

  /**
   * 启用/禁用全局自动登录
   */
  async setGlobalAutoLogin(enabled) {
    const settings = await this.getAutoLoginSettings();
    settings.enabled = enabled;
    await this.saveAutoLoginSettings(settings);
    console.log(`[Moodesk Credential] 全局自动登录: ${enabled ? '已启用' : '已禁用'}`);
  }

  /**
   * 记录最后登录时间
   */
  async updateLastLogin(site) {
    const settings = await this.getAutoLoginSettings();
    if (!settings.sites) settings.sites = {};
    if (!settings.sites[site]) settings.sites[site] = { enabled: false };
    settings.sites[site].lastLogin = Date.now();
    await this.saveAutoLoginSettings(settings);
  }

  // ============================================
  // 工具方法
  // ============================================

  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

// 导出单例
const credentialManager = new CredentialManager();

// 兼容浏览器和 Node.js 环境
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CredentialManager, credentialManager };
}

