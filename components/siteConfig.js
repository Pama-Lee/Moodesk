// siteConfig.js
// Moodesk 多站点配置文件
// 添加新站点只需在 SITE_CONFIGS 中添加配置即可

const SITE_CONFIGS = {
  // ============================================
  // 厦门大学马来西亚分校 - 标准 Moodle 认证
  // ============================================
  'l.xmu.edu.my': {
    name: 'XMUM Moodle',
    shortName: 'XMUM',
    type: 'standard',  // 标准 Moodle 用户名密码认证
    urls: {
      login: 'https://l.xmu.edu.my/login/index.php',
      token: 'https://l.xmu.edu.my/login/token.php',
      service: 'https://l.xmu.edu.my/webservice/rest/server.php',
      ajax: 'https://l.xmu.edu.my/lib/ajax/service.php',
      launch: 'https://l.xmu.edu.my/admin/tool/mobile/launch.php'
    },
    features: {
      mobileApp: true,
      webService: true
    }
  },

  // ============================================
  // UKM 系列站点 - SAML SSO 认证
  // ============================================
  'ukmfolio.ukm.my': {
    name: 'Pelantar e-Pembelajaran UKM',
    shortName: 'UKMFolio',
    type: 'saml_sso',  // SAML SSO 认证
    sso: {
      idpUrl: 'https://sso.ukm.my',
      idpHostname: 'sso.ukm.my',
      loginEndpoint: 'https://sso.ukm.my/module.php/core/loginuserpass.php',
      fields: {
        username: 'username',
        password: 'password',
        submit: 'submit',
        authState: 'AuthState'
      }
    },
    urls: {
      login: 'https://ukmfolio.ukm.my/login/index.php',
      service: 'https://ukmfolio.ukm.my/webservice/rest/server.php',
      ajax: 'https://ukmfolio.ukm.my/lib/ajax/service.php',
      launch: 'https://ukmfolio.ukm.my/admin/tool/mobile/launch.php'
    },
    features: {
      mobileApp: true,
      webService: true
    }
  },

  'cbet.ukm.my': {
    name: 'UKM CBET',
    shortName: 'CBET',
    type: 'saml_sso',
    sso: {
      idpUrl: 'https://sso.ukm.my',
      idpHostname: 'sso.ukm.my',
      loginEndpoint: 'https://sso.ukm.my/module.php/core/loginuserpass.php',
      fields: {
        username: 'username',
        password: 'password',
        submit: 'submit',
        authState: 'AuthState'
      }
    },
    urls: {
      login: 'https://cbet.ukm.my/login/index.php',
      service: 'https://cbet.ukm.my/webservice/rest/server.php',
      ajax: 'https://cbet.ukm.my/lib/ajax/service.php',
      launch: 'https://cbet.ukm.my/admin/tool/mobile/launch.php'
    },
    features: {
      mobileApp: true,
      webService: true
    }
  },

  // ============================================
  // SSO 提供商 - 登录页面
  // ============================================
  'sso.ukm.my': {
    name: 'UKM SSO Portal',
    shortName: 'UKM SSO',
    type: 'sso_provider',
    sso: {
      loginEndpoint: 'https://sso.ukm.my/module.php/core/loginuserpass.php',
      fields: {
        username: 'username',
        password: 'password',
        submit: 'submit',
        authState: 'AuthState'
      }
    },
    // 关联的 Moodle 站点
    associatedSites: ['ukmfolio.ukm.my', 'cbet.ukm.my']
  }

  // ============================================
  // 添加更多站点示例
  // ============================================
  // 'moodle.example.edu': {
  //   name: 'Example University Moodle',
  //   shortName: 'Example',
  //   type: 'standard',  // 或 'saml_sso', 'oauth2', 'cas'
  //   ...
  // }
};

/**
 * 站点配置管理器
 */
class SiteConfigManager {
  constructor() {
    this.configs = SITE_CONFIGS;
  }

  /**
   * 根据主机名获取站点配置
   */
  getConfig(hostname) {
    // 精确匹配
    if (this.configs[hostname]) {
      return { hostname, ...this.configs[hostname] };
    }

    // 尝试匹配子域名
    for (const [domain, config] of Object.entries(this.configs)) {
      if (hostname.endsWith(domain)) {
        return { hostname, ...config };
      }
    }

    // 返回默认配置（尝试作为标准 Moodle 站点）
    return this.createDefaultConfig(hostname);
  }

  /**
   * 创建默认站点配置
   */
  createDefaultConfig(hostname) {
    return {
      hostname,
      name: hostname,
      shortName: hostname.split('.')[0].toUpperCase(),
      type: 'auto_detect',
      urls: {
        login: `https://${hostname}/login/index.php`,
        token: `https://${hostname}/login/token.php`,
        service: `https://${hostname}/webservice/rest/server.php`,
        ajax: `https://${hostname}/lib/ajax/service.php`,
        launch: `https://${hostname}/admin/tool/mobile/launch.php`
      },
      features: {
        mobileApp: true,
        webService: true
      }
    };
  }

  /**
   * 检查是否是 SSO 提供商
   */
  isSsoProvider(hostname) {
    const config = this.configs[hostname];
    return config?.type === 'sso_provider';
  }

  /**
   * 检查站点是否使用 SSO
   */
  isSsoSite(hostname) {
    const config = this.getConfig(hostname);
    return config?.type === 'saml_sso' || config?.type === 'oauth2' || config?.type === 'cas';
  }

  /**
   * 从 SSO 提供商获取关联的 Moodle 站点
   */
  getAssociatedSites(ssoHostname) {
    const config = this.configs[ssoHostname];
    if (config?.type === 'sso_provider') {
      return config.associatedSites || [];
    }
    return [];
  }

  /**
   * 获取所有已配置的站点
   */
  getAllSites() {
    return Object.entries(this.configs).map(([hostname, config]) => ({
      hostname,
      ...config
    }));
  }

  /**
   * 获取所有 Moodle 站点（排除 SSO 提供商）
   */
  getMoodleSites() {
    return Object.entries(this.configs)
      .filter(([_, config]) => config.type !== 'sso_provider')
      .map(([hostname, config]) => ({ hostname, ...config }));
  }
}

// 导出单例
const siteConfigManager = new SiteConfigManager();

// 兼容浏览器和 Node.js 环境
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SITE_CONFIGS, SiteConfigManager, siteConfigManager };
}
