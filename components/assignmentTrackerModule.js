class AssignmentTrackerModule {
  constructor() {
    this.assignments = [];
    this.token = null;
    this.loading = false;
    this.initialized = false;
    this.submissionStatusQueue = [];
    // 动态获取当前站点 URL
    this.baseUrl = window.location.origin;
    this.serviceUrl = `${this.baseUrl}/webservice/rest/server.php`;
    // 布局相关配置（按站点配置覆盖）
    this.layout = 'list'; // 'list' | 'horizontal'
    this.insertMode = 'prepend'; // 'prepend' | 'append' | 'before' | 'after'
  }

  async init() {
    this.token = await AuthModule.getToken();
    if (!this.token) return;

    const validPaths = ["/my/", "/my/courses.php"];
    if (!validPaths.some((path) => window.location.pathname.endsWith(path)))
      return;

    // 根据远程站点配置决定插入位置和布局
    let container = document.getElementById("page-content");
    try {
      if (typeof remoteConfigManager !== 'undefined') {
        // 确保配置已加载
        await remoteConfigManager.init();
        const siteConfig = remoteConfigManager.getSiteConfig(window.location.hostname);

        const trackerFeature = siteConfig?.features?.assignmentTracker;

        // 支持布尔或对象配置
        const enabled = trackerFeature === undefined
          ? true
          : (typeof trackerFeature === 'boolean' ? trackerFeature : trackerFeature.enabled !== false);

        if (!enabled) {
          console.log('[AssignmentTracker] 当前站点禁用 assignmentTracker');
          return;
        }

        const trackerConfig = typeof trackerFeature === 'object' ? trackerFeature : {};

        // 插入位置优先使用 assignmentInsertPoint，其次 todoInsertPoint，再次 pageContent
        const selectors = [
          trackerConfig.positionSelector,
          siteConfig?.selectors?.assignmentInsertPoint,
          siteConfig?.selectors?.todoInsertPoint,
          siteConfig?.selectors?.pageContent,
          '#page-content'
        ].filter(Boolean).join(', ');

        const customContainer = document.querySelector(selectors);
        if (customContainer) {
          container = customContainer;
        }

        // 插入方式
        this.insertMode = trackerConfig.insertMode || 'prepend';

        // 布局：list（默认）或 horizontal（横向滚动）
        this.layout = trackerConfig.layout === 'horizontal' ? 'horizontal' : 'list';
      }
    } catch (e) {
      console.warn('[AssignmentTracker] 加载远程站点配置失败，使用默认布局:', e);
    }

    if (!container) return;

    // 仅在使用 page-content 作为容器时才调整为 flex 布局，避免影响其它区域
    if (container.id === 'page-content') {
      container.style.display = "flex";
      // 此处ukm 站点会有问题
      // container.style.gap = "20px";
    }

    await this.fetchAssignments();
    this.createAssignmentCard(container);

    // After UI is rendered, start fetching submission statuses
    this.updateSubmissionStatuses();
  }

  async fetchAssignments() {
    this.loading = true;
    try {
      const response = await fetch(
        this.serviceUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            wstoken: this.token,
            wsfunction: "mod_assign_get_assignments",
            moodlewsrestformat: "json",
          }),
        }
      );

      const data = await response.json();
      if (data.exception) throw new Error(data.message);

      this.assignments = [];

      for (const course of Object.values(data.courses)) {
        for (const assignment of course.assignments) {
          if (assignment.duedate > Date.now() / 1000) {
            this.assignments.push({
              id: assignment.id,
              name: assignment.name,
              course: course.shortname,
              courseId: course.id,
              duedate: assignment.duedate,
              intro: assignment.intro,
              introattachments: assignment.introattachments || [],
              allowsubmissionsfromdate: assignment.allowsubmissionsfromdate,
              grade: assignment.grade,
              cmid: assignment.cmid,
              configs: assignment.configs,
              cutoffdate: assignment.cutoffdate,
              submitted: false, // Default to false, will be updated later
            });
          }
        }
      }

      this.assignments.sort((a, b) => a.duedate - b.duedate);
    } catch (error) {
      console.error("Failed to fetch assignments:", error);
    } finally {
      this.loading = false;
      this.initialized = true;
    }
  }

  async updateSubmissionStatuses() {
    const updateStatus = async (assignment) => {
      const status = await this.checkSubmissionStatus(assignment.id);
      assignment.submitted = status;
      this.updateAssignmentUI(assignment);
    };

    // Process assignments in parallel, but limit concurrent requests
    const batchSize = 3;
    for (let i = 0; i < this.assignments.length; i += batchSize) {
      const batch = this.assignments.slice(i, i + batchSize);
      await Promise.all(batch.map(updateStatus));
    }
  }

  updateAssignmentUI(assignment) {
    const assignmentElement = document.querySelector(
      `.assignment-item[data-id="${assignment.id}"]`
    );
    if (!assignmentElement) return;

    const statusElement = assignmentElement.querySelector(".assignment-status");
    if (statusElement) {
      statusElement.outerHTML = assignment.submitted
        ? `
            <div class="assignment-status submitted">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              已提交
            </div>
          `
        : `
            <div class="assignment-status pending">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              待提交
            </div>
          `;
    }
  }

  async checkSubmissionStatus(assignmentId) {
    try {
      const response = await fetch(
        this.serviceUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            wstoken: this.token,
            wsfunction: "mod_assign_get_submission_status",
            assignid: assignmentId,
            moodlewsrestformat: "json",
          }),
        }
      );

      const data = await response.json();
      if (data.exception) return false;

      return data.lastattempt?.submission?.status === "submitted";
    } catch (error) {
      console.error("Failed to check submission status:", error);
      return false;
    }
  }

  createAssignmentCard(pageContent) {
    const card = document.createElement("div");
    const layoutClass = this.layout === 'horizontal' ? 'horizontal' : 'vertical';
    card.className = `assignment-tracker-card ${layoutClass}`;
    card.innerHTML = this.renderCard();

    // 根据 insertMode 决定插入方式
    try {
      const mode = this.insertMode || 'prepend';
      const container = pageContent;

      if (mode === 'append') {
        container.appendChild(card);
      } else if (mode === 'before' && container.parentNode) {
        container.parentNode.insertBefore(card, container);
      } else if (mode === 'after' && container.parentNode) {
        if (container.nextSibling) {
          container.parentNode.insertBefore(card, container.nextSibling);
        } else {
          container.parentNode.appendChild(card);
        }
      } else {
        // 默认 prepend：插入到容器第一个子元素之前
        container.insertBefore(card, container.firstChild);
      }
    } catch (e) {
      console.warn('[AssignmentTracker] 插入卡片时出错，使用默认方式:', e);
      pageContent.insertBefore(card, pageContent.firstChild);
    }

    // Add click event listeners
    card.addEventListener("click", (e) => {
      const assignmentItem = e.target.closest(".assignment-item");
      if (assignmentItem) {
        const assignmentId = assignmentItem.dataset.id;
        const assignment = this.assignments.find(
          (a) => a.id.toString() === assignmentId
        );
        if (assignment) {
          window.location.href = `${this.baseUrl}/mod/assign/view.php?id=${assignment.cmid}`;
        }
      }
    });
  }

  renderCard() {
    if (this.loading) {
      return `
          <div class="assignment-loading">
            <div class="loading-spinner"></div>
            <p>正在从Moodle获取作业信息...</p>
            <span class="loading-hint">这可能需要几秒钟的时间</span>
          </div>
        `;
    }

    if (this.assignments.length === 0) {
      return `
          <div class="assignment-empty">
            <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" stroke-width="1">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012 2h2a2 2 0 012-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
            </svg>
            <p>暂无待完成的作业</p>
            <span>好好享受这段时光吧！</span>
          </div>
        `;
    }

    const listLayoutClass = this.layout === 'horizontal'
      ? 'assignment-list-horizontal'
      : 'assignment-list-vertical';

    return `
        <div class="assignment-header">
          <h3>
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012 2h2a2 2 0 012-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
            待完成作业 <span class="assignment-count">${
              this.assignments.length
            }</span>
          </h3>
        </div>
        <div class="assignment-list ${listLayoutClass}">
          ${this.assignments
            .map((assignment) => this.renderAssignmentItem(assignment))
            .join("")}
        </div>
      `;
  }

  renderAssignmentItem(assignment) {
    const dueDate = new Date(assignment.duedate * 1000);
    const now = new Date();
    const diffDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

    let urgencyClass = "";
    let urgencyLabel = "";
    if (diffDays <= 1) {
      urgencyClass = "urgent";
      urgencyLabel = "紧急";
    } else if (diffDays <= 3) {
      urgencyClass = "warning";
      urgencyLabel = "临近";
    }

    return `
        <div class="assignment-item ${urgencyClass}" data-id="${assignment.id}">
          <div class="assignment-content">
            <div class="assignment-name-row">
              ${
                urgencyLabel
                  ? `<span class="urgency-badge ${urgencyClass}">${urgencyLabel}</span>`
                  : ""
              }
              <div class="assignment-name">${assignment.name}</div>
            </div>
            <div class="assignment-course">
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
              ${assignment.course}
            </div>
            <div class="assignment-due">
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              ${this.formatDate(dueDate)}
              <span class="due-countdown">(还剩 ${this.formatCountdown(
                diffDays
              )})</span>
            </div>
          </div>
          ${
            assignment.submitted
              ? `
            <div class="assignment-status submitted">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              已提交
            </div>
          `
              : `
            <div class="assignment-status pending">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              待提交
            </div>
          `
          }
        </div>
      `;
  }

  formatDate(date) {
    return date.toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
  }

  formatCountdown(days) {
    if (days < 0) return "已过期";
    if (days === 0) return "今天";
    if (days === 1) return "1天";
    return `${days}天`;
  }

}
