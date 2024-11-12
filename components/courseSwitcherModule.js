// courseSwitcherModule.js
class CourseSwitcherModule {
  constructor() {
    this.visitedCourses = {};
    this.recentCourses = [];
    this.maxRecentCourses = 5;
    this.currentCourseId = new URLSearchParams(window.location.search).get("id");
    this.currentCourseName = null;
    this.commandModule = window.moodeskCommandModule;
  }

  async init() {
    await this.loadVisitedCourses();
    this.extractCurrentCourse();
    if (this.currentCourseId && this.currentCourseName) {
        console.log('Recording course visit...');
      await this.recordCourseVisit();
    }
    this.registerCommands();
  }

  registerCommands() {
    // 基础快速切换命令
    this.commandModule.addCommands({
      id: "quick-switch",
      name: "快速切换课程",
      shortcut: `${this.commandModule.modKey} + P`,
      category: "课程切换",
      handler: () => this.showQuickSwitcher(),
    });


    // 判断是否有最近访问的课程
    if (!this.recentCourses.length) return;

    if (this.recentCourses.length > 3) {
      this.recentCourses = this.recentCourses.slice(0, 3);
    }
    this.recentCourses.forEach((courseId, index) => {
    const course = this.visitedCourses[courseId];
      if (course) {
        this.commandModule.addCommands({
          id: `switch-recent-${index + 1}`,
          name: `切换到: ${course.name}`,
          shortcut: `${this.commandModule.modKey} + ${index + 1}`,
          category: "最近课程",
          handler: () => this.switchToCourse(course.id),
        });
      }
    });

    // 导航命令
    this.commandModule.addCommands([
      {
        id: "next-course",
        name: "切换到下一个课程",
        shortcut: `${this.commandModule.modKey} + ]`,
        category: "课程切换",
        handler: () => this.switchToAdjacentCourse(1),
      },
      {
        id: "prev-course",
        name: "切换到上一个课程",
        shortcut: `${this.commandModule.modKey} + [`,
        category: "课程切换",
        handler: () => this.switchToAdjacentCourse(-1),
      },
      {
        id: "recent-courses",
        name: "查看最近访问的课程",
        shortcut: `${this.commandModule.modKey} + B`,
        category: "课程切换",
        handler: () => this.showRecentCourses(),
      },
    ]);
  }


  /**
   * 提取当前课程信息
   */
  extractCurrentCourse() {
    // 从页面标题获取课程名称
    const courseHeader = document.querySelector('h1');
    this.currentCourseName = courseHeader ? courseHeader.textContent.trim() : null;
  }

  /**
   * 加载访问记录
   */
  async loadVisitedCourses() {
    try {
      const result = await chrome.storage.local.get(['moodeskVisitedCourses', 'moodeskRecentCourses']);
      this.visitedCourses = result.moodeskVisitedCourses || {};
      this.recentCourses = result.moodeskRecentCourses || [];
    } catch (error) {
      console.error('Error loading visited courses:', error);
      this.visitedCourses = {};
      this.recentCourses = [];
    }
  }

  /**
   * 记录课程访问
   */
  async recordCourseVisit() {
    if (!this.currentCourseId || !this.currentCourseName) return;

    try {
      const now = new Date().toISOString();
      
      // 如果是新课程，创建记录
      if (!this.visitedCourses[this.currentCourseId]) {
        this.visitedCourses[this.currentCourseId] = {
          id: this.currentCourseId,
          name: this.currentCourseName,
          visits: []
        };
      }

      // 更新课程名称
      this.visitedCourses[this.currentCourseId].name = this.currentCourseName;
      
      // 添加访问记录
      this.visitedCourses[this.currentCourseId].visits.push({
        timestamp: now,
        referrer: document.referrer || null
      });

      // 只保留最近100条访问记录
      if (this.visitedCourses[this.currentCourseId].visits.length > 100) {
        this.visitedCourses[this.currentCourseId].visits = 
          this.visitedCourses[this.currentCourseId].visits.slice(-100);
      }

      // 更新最近访问课程列表
      this.recentCourses = [
        this.currentCourseId,
        ...this.recentCourses.filter(id => id !== this.currentCourseId)
      ].slice(0, this.maxRecentCourses);

      // 保存到storage
      await chrome.storage.local.set({
        moodeskVisitedCourses: this.visitedCourses,
        moodeskRecentCourses: this.recentCourses
      });

    } catch (error) {
      console.error('Error recording course visit:', error);
    }
  }

  /**
   * 获取课程最后访问时间的格式化字符串
   */
  getLastVisitTime(courseId) {
    const course = this.visitedCourses[courseId];
    if (!course || !course.visits.length) return '从未访问';

    const lastVisit = new Date(course.visits[course.visits.length - 1].timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now - lastVisit) / (1000 * 60));

    if (diffInMinutes < 1) return '刚刚';
    if (diffInMinutes < 60) return `${diffInMinutes} 分钟前`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} 小时前`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays} 天前`;
    
    return lastVisit.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    });
  }

  // 修改 renderCourseList 方法来使用访问记录
  renderCourseList(query) {
    const list = document.querySelector('.quick-switcher-list');
    if (!list) return;

    // 获取所有访问过的课程
    const visitedCoursesList = Object.values(this.visitedCourses);

    // 根据搜索词过滤课程
    const filteredCourses = visitedCoursesList.filter(course =>
      course.name.toLowerCase().includes(query.toLowerCase())
    );

    // 分组课程
    const recentCourses = filteredCourses.filter(course =>
      this.recentCourses.includes(course.id)
    );
    const otherCourses = filteredCourses.filter(course =>
      !this.recentCourses.includes(course.id)
    );

    list.innerHTML = `
      ${recentCourses.length ? `
        <div class="course-group">
          <div class="group-title">最近访问</div>
          ${this.renderCourseGroup(recentCourses)}
        </div>
      ` : ''}
      ${otherCourses.length ? `
        <div class="course-group">
          <div class="group-title">其他课程</div>
          ${this.renderCourseGroup(otherCourses)}
        </div>
      ` : ''}
      ${!filteredCourses.length ? `
        <div class="empty-state">未找到匹配的课程</div>
      ` : ''}
    `;

    const firstItem = list.querySelector('.course-item');
    if (firstItem) {
      firstItem.classList.add('active');
    }
  }

  /**
   * 切换到相邻课程
   * @param {number} direction - 1 表示下一个，-1 表示上一个
   */
  switchToAdjacentCourse(direction) {
    const currentIndex = this.courses.findIndex(
      (c) => c.id === this.currentCourseId
    );
    if (currentIndex === -1) return;

    const nextIndex =
      (currentIndex + direction + this.courses.length) % this.courses.length;
    this.switchToCourse(this.courses[nextIndex].id);
  }

  /**
   * 显示最近访问的课程列表
   */
  showRecentCourses() {
    const recentCoursesDialog = document.createElement("div");
    recentCoursesDialog.className = "moodesk-recent-courses";
    recentCoursesDialog.innerHTML = `
      <div class="recent-courses-overlay"></div>
      <div class="recent-courses-container">
        <div class="recent-courses-header">
          <h3>最近访问的课程</h3>
          <button class="close-button">×</button>
        </div>
        <div class="recent-courses-list">
          ${this.recentCourses
            .map((courseId) => {
              const course = this.courses.find((c) => c.id === courseId);
              if (!course) return "";
              const shortcutIndex = this.recentCourses.indexOf(courseId);
              const shortcut =
                shortcutIndex < 3
                  ? `<span class="course-shortcut">${
                      this.commandModule.modKey
                    } + ${shortcutIndex + 1}</span>`
                  : "";

              return `
              <div class="course-item" data-id="${course.id}">
                <div class="course-info">
                  <div class="course-name">${course.name}</div>
                  <div class="course-meta">最后访问: ${this.getLastVisitTime(
                    courseId
                  )}</div>
                </div>
                ${shortcut}
              </div>
            `;
            })
            .join("")}
        </div>
      </div>
    `;

    document.body.appendChild(recentCoursesDialog);
    this.setupRecentCoursesEvents(recentCoursesDialog);
  }

  setupRecentCoursesEvents(dialog) {
    const closeButton = dialog.querySelector(".close-button");
    const overlay = dialog.querySelector(".recent-courses-overlay");
    const courseItems = dialog.querySelectorAll(".course-item");

    const closeDialog = () => {
      dialog.classList.add("closing");
      setTimeout(() => dialog.remove(), 200);
    };

    closeButton.addEventListener("click", closeDialog);
    overlay.addEventListener("click", closeDialog);

    courseItems.forEach((item) => {
      item.addEventListener("click", () => {
        const courseId = item.dataset.id;
        this.switchToCourse(courseId);
        closeDialog();
      });
    });

    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") closeDialog();
      },
      { once: true }
    );
  }

  async loadRecentCourses() {
    const result = await chrome.storage.local.get("moodeskRecentCourses");
    this.recentCourses = result.moodeskRecentCourses || [];
  }

  async saveRecentCourses() {
    await chrome.storage.local.set({
      moodeskRecentCourses: this.recentCourses,
    });
  }


  async switchToCourse(courseId) {
    // 获取课程 URL
    const course = this.visitedCourses[courseId];
    if (!course) return;

    // 更新最近访问的课程列表
    this.recentCourses = [
      courseId,
      ...this.recentCourses.filter(id => id !== courseId)
    ].slice(0, this.maxRecentCourses);

    // 保存更新
    await chrome.storage.local.set({
      moodeskRecentCourses: this.recentCourses
    });

    // 课程切换动画
    this.showTransition(() => {
      window.location.href = `/course/view.php?id=${courseId}`;
    });
  }

  showTransition(callback) {
    const transition = document.createElement("div");
    transition.className = "moodesk-transition";
    document.body.appendChild(transition);

    setTimeout(() => {
      transition.classList.add("active");
      setTimeout(callback, 300);
    }, 50);

  }

  showQuickSwitcher() {
    const switcher = document.createElement("div");
    switcher.className = "moodesk-quick-switcher";
    switcher.innerHTML = `
        <div class="quick-switcher-overlay"></div>
        <div class="quick-switcher-container">
          <div class="quick-switcher-header">
            <input type="text" class="quick-switcher-search" placeholder="搜索课程..." autofocus>
          </div>
          <div class="quick-switcher-list"></div>
        </div>
      `;

    document.body.appendChild(switcher);
    this.setupQuickSwitcherEvents(switcher);
    this.renderCourseList("");
  }

  setupQuickSwitcherEvents(switcher) {
    const overlay = switcher.querySelector(".quick-switcher-overlay");
    const input = switcher.querySelector(".quick-switcher-search");
    const list = switcher.querySelector(".quick-switcher-list");

    overlay.addEventListener("click", () => this.closeQuickSwitcher());

    input.addEventListener("input", (e) => {
      this.renderCourseList(e.target.value.trim().toLowerCase());
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeQuickSwitcher();
      } else if (e.key === "Enter") {
        const activeItem = list.querySelector(".course-item.active");
        if (activeItem) {
          const courseId = activeItem.dataset.id;
          this.switchToCourse(courseId);
        }
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        this.navigateCourseList(e.key === "ArrowDown" ? 1 : -1);
      }
    });

    list.addEventListener("click", (e) => {
      const item = e.target.closest(".course-item");
      if (item) {
        const courseId = item.dataset.id;
        this.switchToCourse(courseId);
      }
    });

    // 鼠标悬停事件
    list.addEventListener("mousemove", (e) => {
      const item = e.target.closest(".course-item");
      if (item) {
        list
          .querySelectorAll(".course-item")
          .forEach((i) => i.classList.remove("active"));
        item.classList.add("active");
      }
    });
  }

  renderCourseList(query) {
    const list = document.querySelector(".quick-switcher-list");
    if (!list) return;

    // 过滤课程
    const filteredCourses = this.courses.filter((course) =>
      course.name.toLowerCase().includes(query)
    );

    // 分组课程
    const recentCourses = filteredCourses.filter((course) =>
      this.recentCourses.includes(course.id)
    );
    const otherCourses = filteredCourses.filter(
      (course) => !this.recentCourses.includes(course.id)
    );

    list.innerHTML = `
        ${
          recentCourses.length
            ? `
          <div class="course-group">
            <div class="group-title">最近访问</div>
            ${this.renderCourseGroup(recentCourses)}
          </div>
        `
            : ""
        }
        ${
          otherCourses.length
            ? `
          <div class="course-group">
            <div class="group-title">所有课程</div>
            ${this.renderCourseGroup(otherCourses)}
          </div>
        `
            : ""
        }
        ${
          !filteredCourses.length
            ? `
          <div class="empty-state">未找到匹配的课程</div>
        `
            : ""
        }
      `;

    // 默认选中第一项
    const firstItem = list.querySelector(".course-item");
    if (firstItem) {
      firstItem.classList.add("active");
    }
  }

  renderCourseGroup(courses) {
    return courses.map(course => `
      <div class="course-item" data-id="${course.id}">
        <div class="course-info">
          <div class="course-name">${course.name}</div>
          <div class="course-meta">最后访问: ${this.getLastVisitTime(course.id)}</div>
        </div>
        ${this.recentCourses.indexOf(course.id) < 3 ? `
          <div class="course-shortcut">
            ${this.commandModule.modKey} + ${this.recentCourses.indexOf(course.id) + 1}
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  navigateCourseList(direction) {
    const items = [...document.querySelectorAll(".course-item")];
    const currentIndex = items.findIndex((item) =>
      item.classList.contains("active")
    );

    items.forEach((item) => item.classList.remove("active"));

    let nextIndex;
    if (currentIndex === -1) {
      nextIndex = 0;
    } else {
      nextIndex = (currentIndex + direction + items.length) % items.length;
    }

    items[nextIndex]?.classList.add("active");
    items[nextIndex]?.scrollIntoView({ block: "nearest" });
  }

  closeQuickSwitcher() {
    const switcher = document.querySelector(".moodesk-quick-switcher");
    if (switcher) {
      switcher.classList.add("closing");
      setTimeout(() => switcher.remove(), 200);
    }
  }
}
