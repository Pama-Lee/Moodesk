class AnalyticsModule {
    constructor() {
      this.studyData = {};
      this.currentCourseId = null;
      this.pdfReadingStartTime = null;
      this.analyticsContainer = null;
    }
  
    async init() {
      this.currentCourseId = new URLSearchParams(window.location.search).get('id');
      await this.loadStudyData();
      this.setupTracking();
      this.createAnalyticsView();
    }
  
    async loadStudyData() {
      const result = await chrome.storage.local.get('moodeskAnalytics');
      this.studyData = result.moodeskAnalytics || {};
      if (!this.studyData[this.currentCourseId]) {
        this.studyData[this.currentCourseId] = {
          totalStudyTime: 0,
          pdfReadingTime: 0,
          lastVisit: new Date().toISOString(),
          completedTasks: 0,
          visitCount: 0
        };
      }
    }
  
    setupTracking() {
      // Track page visit
      this.studyData[this.currentCourseId].visitCount++;
      
      // Track PDF reading time
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            const pdfViewer = document.getElementById('moodesk-pdf-viewer');
            if (pdfViewer) {
              this.pdfReadingStartTime = Date.now();
              // Start tracking PDF reading time
              this.trackPDFReadingTime();
              observer.disconnect();
            }
          }
        });
      });
  
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
  
      // Track completed tasks
      document.addEventListener('todoCompleted', () => {
        this.studyData[this.currentCourseId].completedTasks++;
        this.saveStudyData();
        this.updateAnalyticsView();
      });
  
      // Track total study time
      setInterval(() => {
        if (document.visibilityState === 'visible') {
          this.studyData[this.currentCourseId].totalStudyTime += 1;
          this.saveStudyData();
          this.updateAnalyticsView();
        }
      }, 1000);
  
      // Track visibility changes
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && this.pdfReadingStartTime) {
          this.updatePDFReadingTime();
        }
      });
    }
  
    trackPDFReadingTime() {
      const pdfViewer = document.getElementById('moodesk-pdf-viewer');
      if (!pdfViewer) return;
  
      pdfViewer.addEventListener('mouseenter', () => {
        if (!this.pdfReadingStartTime) {
          this.pdfReadingStartTime = Date.now();
        }
      });
  
      pdfViewer.addEventListener('mouseleave', () => {
        this.updatePDFReadingTime();
      });
    }
  
    updatePDFReadingTime() {
      if (this.pdfReadingStartTime) {
        const readingTime = Math.floor((Date.now() - this.pdfReadingStartTime) / 1000);
        this.studyData[this.currentCourseId].pdfReadingTime += readingTime;
        this.pdfReadingStartTime = null;
        this.saveStudyData();
        this.updateAnalyticsView();
      }
    }
  
    createAnalyticsView() {
        this.analyticsContainer = document.createElement('div');
        this.analyticsContainer.className = 'moodesk-analytics';
        this.analyticsContainer.innerHTML = `
          <div class="analytics-header">
            <h4>
              <span class="analytics-toggle">
                <svg class="toggle-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </span>
              学习统计
            </h4>
          </div>
          <div class="analytics-content">
            <div class="analytics-grid">
              <div class="analytics-item">
                <span class="analytics-label">总学习时间</span>
                <span class="analytics-value" id="total-study-time">
                  ${this.formatTime(this.studyData[this.currentCourseId].totalStudyTime)}
                </span>
              </div>
              <div class="analytics-item">
                <span class="analytics-label">PDF阅读时间</span>
                <span class="analytics-value" id="pdf-reading-time">
                  ${this.formatTime(this.studyData[this.currentCourseId].pdfReadingTime)}
                </span>
              </div>
              <div class="analytics-item">
                <span class="analytics-label">完成的任务</span>
                <span class="analytics-value" id="completed-tasks">
                  ${this.studyData[this.currentCourseId].completedTasks}
                </span>
              </div>
              <div class="analytics-item">
                <span class="analytics-label">访问次数</span>
                <span class="analytics-value" id="visit-count">
                  ${this.studyData[this.currentCourseId].visitCount}
                </span>
              </div>
            </div>
          </div>
        `;
    
        // 插入到Moodesk容器中
        const moodeskContent = document.querySelector('.moodesk-content');
        if (moodeskContent) {
          moodeskContent.insertBefore(this.analyticsContainer, moodeskContent.firstChild);
        }
    
        // 添加折叠功能
        const header = this.analyticsContainer.querySelector('.analytics-header');
        const content = this.analyticsContainer.querySelector('.analytics-content');
        const toggleIcon = this.analyticsContainer.querySelector('.toggle-icon');
    
        header.addEventListener('click', () => {
          content.classList.toggle('collapsed');
          toggleIcon.classList.toggle('rotated');
        });

      }
  
    formatTime(seconds) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}小时${minutes}分钟`;
    }
  
    async saveStudyData() {
      await chrome.storage.local.set({ moodeskAnalytics: this.studyData });
    }
  
    updateAnalyticsView() {
      const data = this.studyData[this.currentCourseId];
      document.getElementById('total-study-time').textContent = this.formatTime(data.totalStudyTime);
      document.getElementById('pdf-reading-time').textContent = this.formatTime(data.pdfReadingTime);
      document.getElementById('completed-tasks').textContent = data.completedTasks;
      document.getElementById('visit-count').textContent = data.visitCount;
    }

    updateTheme() {
        // 强制重新应用样式
        if (this.analyticsContainer) {
          // 触发重排以应用新样式
          this.analyticsContainer.style.display = 'none';
          this.analyticsContainer.offsetHeight; // 强制重排
          this.analyticsContainer.style.display = '';
        }
      }
  }