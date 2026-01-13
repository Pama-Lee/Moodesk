class ResourceManagerModule {
  constructor() {
    this.resources = [];
    this.courseId = new URLSearchParams(window.location.search).get("id");
    this.container = null;
    this.loading = false;
    this.categories = new Set();
    this.currentFilter = "all";
    this.searchQuery = "";
    this.token = null;
    this.isVisible = false;
    this.isDownloading = false;
    this.downloadProgress = {
      total: 0,
      current: 0,
      failed: 0,
    };
    // 动态获取当前站点 URL
    this.serviceUrl = `${window.location.origin}/webservice/rest/server.php`;
  }

  async init() {
    this.token = window.moodesk.token;
    if (!this.courseId || !this.token) {
      console.error("Missing required parameters");
      return;
    }

    await this.fetchResources();
    this.addTriggerButton();
    this.createContainer();
    this.setupEventListeners();

    await this.loadJSZip();
  }

  async loadJSZip() {
    if (window.JSZip) return;

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // 获取课程资源
  async fetchResources() {
    this.loading = true;
    this.updateUI();

    try {
      // 获取课程内容
      const response = await fetch(
        this.serviceUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            wstoken: this.token,
            wsfunction: "core_course_get_contents",
            moodlewsrestformat: "json",
            courseid: this.courseId,
          }),
        }
      );

      const sections = await response.json();

      // 检查是否有错误响应
      if (sections.exception) {
        throw new Error(sections.message || "获取资源失败");
      }

      // 解析资源
      this.resources = [];

      for (const section of sections) {
        const sectionName = section.name || "未命名章节";
        this.categories.add(sectionName);

        if (section.modules) {
          for (const module of section.modules) {
            // 检查是否是资源类型模块
            if (module.modname === "resource" || module.modname === "url") {
              // 获取文件详细信息
              let fileDetails = null;
              if (module.contents && module.contents.length > 0) {
                fileDetails = module.contents[0];
              }

              let downloadUrl = fileDetails?.fileurl;
              if (downloadUrl) {
                // 如果包含?, 则添加token
                downloadUrl += downloadUrl.includes("?")
                  ? `&token=${this.token}`
                  : `?token=${this.token}`;
              }

              this.resources.push({
                id: module.id,
                name: module.name,
                type: this.getResourceType(module),
                category: sectionName,
                url: module.url,
                modicon: module.modicon,
                filesize: fileDetails?.filesize,
                mimetype: fileDetails?.mimetype,
                timemodified: module.timemodified,
                description: module.description,
                visible: module.visible === 1,
                downloadUrl: downloadUrl,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch resources:", error);
      this.showError("获取资源失败: " + error.message);
    }

    this.loading = false;
    this.updateUI();
  }

  getResourceType(module) {
    // 首先检查是否是URL类型
    if (module.modname === "url") {
      return "url";
    }

    // 如果是resource类型，进一步判断文件类型
    if (
      module.modname === "resource" &&
      module.contents &&
      module.contents.length > 0
    ) {
      const mimetype = module.contents[0].mimetype;

      // 根据MIME类型判断
      if (mimetype.includes("pdf")) return "pdf";
      if (mimetype.includes("msword") || mimetype.includes("wordprocessingml"))
        return "doc";
      if (
        mimetype.includes("powerpoint") ||
        mimetype.includes("presentationml")
      )
        return "ppt";
      if (mimetype.includes("video")) return "video";
      if (mimetype.includes("audio")) return "audio";
      if (mimetype.includes("image")) return "image";
      if (mimetype.includes("zip") || mimetype.includes("rar"))
        return "archive";
      if (mimetype.includes("excel") || mimetype.includes("spreadsheetml"))
        return "excel";
    }

    // 默认返回文件类型
    return "file";
  }

  // 解析课程资源
  parseResources(sections) {
    const resources = [];

    sections.forEach((section) => {
      if (section.modules) {
        section.modules.forEach((module) => {
          if (module.modname === "resource" || module.modname === "url") {
            resources.push({
              id: module.id,
              name: module.name,
              type: module.modname,
              category: section.name,
              url: module.url,
              modicon: module.modicon,
              filesize: module.contents?.[0]?.filesize,
              mimetype: module.contents?.[0]?.mimetype,
              timemodified: module.contents?.[0]?.timemodified,
            });
          }
        });
      }
    });

    return resources;
  }

  renderResourceItem(resource) {
    const filesize = resource.filesize
      ? this.formatFileSize(resource.filesize)
      : "";
    const modified = resource.timemodified
      ? this.formatDate(resource.timemodified)
      : "";

    return `
      <div class="resource-item ${
        !resource.visible ? "hidden-resource" : ""
      }" draggable="true">
        <img src="${resource.modicon}" alt="${
      resource.type
    }" class="resource-icon">
        <div class="resource-info">
          <div class="resource-name">
            ${this.renderTypeBadge(resource.type)}
            ${resource.name}
          </div>
          <div class="resource-meta">
            ${filesize ? `<span class="resource-size">${filesize}</span>` : ""}
            ${
              modified
                ? `<span class="resource-modified">修改于 ${modified}</span>`
                : ""
            }
            <span class="resource-category">${resource.category}</span>
          </div>
          ${
            resource.description
              ? `
            <div class="resource-description">
              ${resource.description}
            </div>
          `
              : ""
          }
        </div>
        <div class="resource-actions">
          ${this.renderActionButtons(resource)}
        </div>
      </div>
    `;
  }

  renderActionButtons(resource) {
    const buttons = [];

    // 预览按钮（仅对特定类型显示）
    if (["pdf", "image", "video", "audio"].includes(resource.type)) {
      buttons.push(`
        <button class="preview-btn" data-id="${resource.id}" title="预览">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span class="tooltip">预览</span>
        </button>
      `);
    }

    // 下载按钮
    if (resource.downloadUrl) {
      buttons.push(`
        <a href="${resource.downloadUrl}" class="download-btn" title="下载" target="_blank" download>
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span class="tooltip">下载</span>
        </a>
      `);
    }

    // 对于URL类型，添加访问链接按钮
    if (resource.type === "url") {
      buttons.push(`
        <a href="${resource.url}" class="visit-btn" title="访问链接" target="_blank">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          <span class="tooltip">访问链接</span>
        </a>
      `);
    }

    return buttons.join("");
  }

  setupEventListeners() {
    // 过滤器改变事件
    this.container.addEventListener("change", (e) => {
      if (e.target.classList.contains("category-filter")) {
        this.currentFilter = e.target.value;
        this.updateUI();
      }
    });

    // 搜索输入事件
    this.container.addEventListener("input", (e) => {
      if (e.target.classList.contains("resource-search")) {
        this.searchQuery = e.target.value.toLowerCase();
        this.updateUI();
      }
    });

    // 资源预览事件
    this.container.addEventListener("click", (e) => {
      const previewBtn = e.target.closest(".preview-btn");
      if (previewBtn) {
        const resourceId = previewBtn.dataset.id;
        const resource = this.resources.find(
          (r) => r.id === parseInt(resourceId)
        );
        if (resource) {
          this.previewResource(resource);
        }
      }
    });

    // 关闭按钮事件
    this.container.addEventListener("click", (e) => {
      if (e.target.closest(".close-button")) {
        this.toggleVisibility();
      }
    });

    // 添加拖拽功能
    this.setupDraggable();

    const downloadAllBtn = this.container.querySelector(".download-all-button");
    if (downloadAllBtn) {
      downloadAllBtn.addEventListener("click", () =>
        this.downloadAllResources()
      );
    }
  }

  setupDraggable() {
    const header = this.container.querySelector(".resource-manager-header");
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    const dragStart = (e) => {
      if (e.target.closest(".moodesk-button")) return;

      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;

      if (e.target === header || e.target.parentNode === header) {
        isDragging = true;
      }
    };

    const dragEnd = () => {
      initialX = currentX;
      initialY = currentY;
      isDragging = false;
    };

    const drag = (e) => {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        xOffset = currentX;
        yOffset = currentY;

        setTranslate(currentX, currentY, this.container);
      }
    };

    const setTranslate = (xPos, yPos, el) => {
      el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    };

    header.addEventListener("mousedown", dragStart);
    document.addEventListener("mousemove", drag);
    document.addEventListener("mouseup", dragEnd);
  }

  // 获取过滤后的资源
  getFilteredResources() {
    return this.resources.filter((resource) => {
      const matchesFilter =
        this.currentFilter === "all" ||
        resource.category === this.currentFilter;
      const matchesSearch = resource.name
        .toLowerCase()
        .includes(this.searchQuery);
      return matchesFilter && matchesSearch;
    });
  }

  // 渲染单个资源项
  renderResourceItem(resource) {
    const filesize = resource.filesize
      ? this.formatFileSize(resource.filesize)
      : "";
    const modified = resource.timemodified
      ? this.formatDate(resource.timemodified)
      : "";

    return `
        <div class="resource-item">
          <img src="${resource.modicon}" alt="${
      resource.type
    }" class="resource-icon">
          <div class="resource-info">
            <div class="resource-name">${resource.name}</div>
            <div class="resource-meta">
              ${
                filesize ? `<span class="resource-size">${filesize}</span>` : ""
              }
              ${
                modified
                  ? `<span class="resource-modified">修改于 ${modified}</span>`
                  : ""
              }
              <span class="resource-category">${resource.category}</span>
            </div>
          </div>
          <div class="resource-actions">
            <button class="preview-btn" data-id="${resource.id}" title="预览">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
            <a href="${
              resource.url
            }" class="download-btn" title="下载" target="_blank">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </a>
          </div>
        </div>
      `;
  }

  // 格式化文件大小
  formatFileSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // 格式化日期
  formatDate(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
  }

  // 预览资源
  previewResource(resource) {
    // 如果是PDF，使用内置的PDF查看器
    if (resource.mimetype === "application/pdf") {
      const pdfModule = window.moodeskPDFModule;
      if (pdfModule) {
        pdfModule.setupPDFViewer(resource.url);
        return;
      }
    }

    // 其他类型的文件则在新窗口打开
    window.open(resource.url, "_blank");
  }

  // 显示错误消息
  showError(message) {
    const error = document.createElement("div");
    error.className = "resource-error";
    error.textContent = message;
    this.container.appendChild(error);

    setTimeout(() => error.remove(), 3000);
  }

  addTriggerButton() {
    const moodeskHeader = document.querySelector(
      ".moodesk-header .moodesk-controls"
    );
    if (!moodeskHeader) return;

    const button = document.createElement("button");
    button.className = "moodesk-button resource-manager-trigger";
    button.title = "资源管理器";
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    `;

    button.addEventListener("click", () => this.toggleVisibility());
    moodeskHeader.insertBefore(button, moodeskHeader.firstChild);
  }

  toggleVisibility() {
    this.isVisible = !this.isVisible;
    if (this.container) {
      this.container.classList.toggle("visible", this.isVisible);
    }
  }

  createContainer() {
    this.container = document.createElement("div");
    this.container.className = "moodesk-resource-manager";
    document.body.appendChild(this.container);
    this.updateUI();
  }

  updateUI() {
    if (!this.container) return;

    this.container.innerHTML = this.renderManagerUI();
  }

  renderManagerUI() {
    return `
      ${this.renderHeader()}
      ${this.renderContent()}
      ${this.isDownloading ? this.renderDownloadStatus() : ""}
    `;
  }

  renderHeader() {
    return `
      <div class="resource-manager-header">
        <h3>
          <img src="${chrome.runtime.getURL(
            "icons/moodesk.png"
          )}" alt="Resource Manager">
          资源管理器
        </h3>
        <div class="resource-manager-controls">
          ${this.renderHeaderControls()}
        </div>
      </div>
    `;
  }

  renderHeaderControls() {
    const downloadButton = `
      <button class="moodesk-button download-all-button" title="打包下载">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
    `;

    const closeButton = `
      <button class="moodesk-button close-button" title="关闭">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    `;

    return `
      ${this.isDownloading ? this.renderDownloadProgress() : downloadButton}
      ${closeButton}
    `;
  }

  renderContent() {
    return `
      <div class="resource-manager-content">
        ${this.renderFilters()}
        ${this.loading ? this.renderLoading() : this.renderResourceList()}
      </div>
    `;
  }

  renderFilters() {
    return `
      <div class="resource-manager-filters">
        <input type="text" class="resource-search" placeholder="搜索资源...">
        <select class="category-filter">
          <option value="all">全部章节</option>
          ${Array.from(this.categories)
            .map(
              (category) => `<option value="${category}">${category}</option>`
            )
            .join("")}
        </select>
      </div>
    `;
  }

  renderLoading() {
    return `
      <div class="resource-loading">
        <div class="loading-spinner"></div>
        <p>正在加载资源...</p>
      </div>
    `;
  }

  renderResourceList() {
    return `
      <div class="resource-list">
        ${this.getFilteredResources()
          .map((resource) => this.renderResourceItem(resource))
          .join("")}
      </div>
    `;
  }

  // 重新组织的下载进度显示方法
  renderDownloadProgress() {
    const progress =
      (this.downloadProgress.current / this.downloadProgress.total) * 100;
    return `
      <div class="download-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        <span class="progress-text">
          ${this.downloadProgress.current}/${this.downloadProgress.total}
        </span>
      </div>
    `;
  }

  // 重新组织的下载状态显示方法
  renderDownloadStatus() {
    const progress =
      (this.downloadProgress.current / this.downloadProgress.total) * 100;
    return `
      <div class="download-status">
        <div class="download-status-content">
          <h4>正在下载资源</h4>
          <p>已完成: ${this.downloadProgress.current}/${
      this.downloadProgress.total
    }</p>
          ${
            this.downloadProgress.failed > 0
              ? `<p class="download-failed">失败: ${this.downloadProgress.failed}</p>`
              : ""
          }
          <div class="download-progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
        </div>
      </div>
    `;
  }

  async downloadAllResources() {
    if (!window.JSZip) {
      this.showError("正在加载必要组件，请稍后重试...");
      await this.loadJSZip();
    }

    try {
      this.isDownloading = true;
      this.downloadProgress = {
        total: this.getFilteredResources().length,
        current: 0,
        failed: 0,
      };
      this.updateUI();

      const zip = new JSZip();
      const resources = this.getFilteredResources();
      
      // 用于追踪文件名，避免重名
      const usedFilenames = new Set();

      for (const resource of resources) {
        try {
          if (!resource.downloadUrl) {
            console.warn(`Resource ${resource.name} has no download URL, skipping`);
            this.downloadProgress.failed++;
            this.updateUI();
            continue;
          }

          // 下载文件
          const response = await fetch(resource.downloadUrl);
          if (!response.ok)
            throw new Error(`HTTP error! status: ${response.status}`);
          const blob = await response.blob();

          // 从URL或mimetype中提取文件扩展名
          const extension = this.getFileExtension(resource.downloadUrl, resource.mimetype, blob.type);
          
          // 生成文件名（铺平到根目录）
          let filename = this.sanitizeFileName(resource.name);
          
          // 如果文件名没有扩展名，添加扩展名
          if (extension && !filename.toLowerCase().endsWith(extension.toLowerCase())) {
            filename = `${filename}${extension}`;
          }
          
          // 处理重名文件
          let finalFilename = filename;
          let counter = 1;
          while (usedFilenames.has(finalFilename)) {
            const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
            const ext = filename.substring(filename.lastIndexOf('.')) || '';
            finalFilename = `${nameWithoutExt}_${counter}${ext}`;
            counter++;
          }
          usedFilenames.add(finalFilename);

          // 直接添加到ZIP根目录（不使用文件夹）
          zip.file(finalFilename, blob);

          this.downloadProgress.current++;
          this.updateUI();
        } catch (error) {
          console.error(`Failed to download ${resource.name}:`, error);
          this.downloadProgress.failed++;
          this.updateUI();
        }
      }

      // 生成并下载ZIP文件
      const courseName =
        document.querySelector("h1")?.textContent.trim() || "course";
      const zipBlob = await zip.generateAsync(
        {
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: {
            level: 5,
          },
        },
        (metadata) => {
          const progress = metadata.percent.toFixed(1);
          this.showGeneratingProgress(progress);
        }
      );

      // 创建下载链接
      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${this.sanitizeFileName(courseName)}_resources.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error("Download failed:", error);
      this.showError("下载失败: " + error.message);
    } finally {
      this.isDownloading = false;
      this.updateUI();
    }
  }

  showGeneratingProgress(progress) {
    const statusElement = this.container.querySelector(
      ".download-status-content"
    );
    if (statusElement) {
      statusElement.innerHTML = `
        <h4>正在生成ZIP文件</h4>
        <p>进度: ${progress}%</p>
        <div class="download-progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
      `;
    }
  }

  sanitizeFileName(name) {
    return name.replace(/[<>:"/\\|?*]/g, "_");
  }
  
  /**
   * 从URL、mimetype或blob type中提取文件扩展名
   */
  getFileExtension(url, mimetype, blobType) {
    // 首先尝试从URL中提取扩展名
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const match = pathname.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
      if (match && match[1]) {
        return `.${match[1]}`;
      }
    } catch (e) {
      console.warn('Failed to parse URL:', url);
    }
    
    // 如果URL中没有扩展名，根据mimetype推断
    const type = mimetype || blobType;
    if (type) {
      const mimeToExt = {
        'application/pdf': '.pdf',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.ms-powerpoint': '.ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
        'application/vnd.ms-excel': '.xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/svg+xml': '.svg',
        'text/plain': '.txt',
        'text/html': '.html',
        'application/zip': '.zip',
        'application/x-rar-compressed': '.rar',
        'video/mp4': '.mp4',
        'video/x-msvideo': '.avi',
        'audio/mpeg': '.mp3',
        'audio/wav': '.wav',
      };
      
      if (mimeToExt[type]) {
        return mimeToExt[type];
      }
      
      // 尝试从mimetype中提取后缀
      const parts = type.split('/');
      if (parts.length === 2) {
        const subtype = parts[1].split('+')[0].split('.')[0];
        return `.${subtype}`;
      }
    }
    
    return '';
  }

  setupDragAndDrop() {
    let draggingElement = null;

    this.container.addEventListener("dragstart", (e) => {
      const item = e.target.closest(".resource-item");
      if (!item) return;

      draggingElement = item;
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    this.container.addEventListener("dragend", (e) => {
      if (draggingElement) {
        draggingElement.classList.remove("dragging");
        draggingElement = null;
      }
    });

    this.container.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!draggingElement) return;

      const item = e.target.closest(".resource-item");
      if (!item || item === draggingElement) return;

      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const insertAfter = e.clientY > midY;

      if (insertAfter) {
        item.parentNode.insertBefore(draggingElement, item.nextSibling);
      } else {
        item.parentNode.insertBefore(draggingElement, item);
      }
    });
  }
}
