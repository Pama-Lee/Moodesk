class SearchModule {
    constructor() {
      this.token = null;
      this.courseData = {};
      this.lastUpdateTime = null;
      this.isInitialized = false;
      this.searchIndex = null;
      // 动态获取当前站点的服务 URL
      this.serviceUrl = `${window.location.origin}/webservice/rest/server.php`;
      // 站点特定的存储键前缀
      this.siteKey = window.location.hostname.replace(/\./g, '_');
      this.storageKeys = {
        data: `moodeskSearchData_${this.siteKey}`,
        lastUpdate: `moodeskSearchLastUpdate_${this.siteKey}`
      };
    }
  
    async init() {
      try {
        this.token = await AuthModule.getToken();
        if (!this.token) return;
  
        await this.loadCachedData();
        
        // Check if we need to update the cache
        if (this.shouldUpdateCache()) {
          await this.fetchAndCacheData();
        }
  
        this.initializeSearchIndex();
        this.isInitialized = true;
  
      } catch (error) {
        console.error('Search module initialization failed:', error);
      }
    }
  
    async loadCachedData() {
      const result = await chrome.storage.local.get([this.storageKeys.data, this.storageKeys.lastUpdate]);
      this.courseData = result[this.storageKeys.data] || {};
      this.lastUpdateTime = result[this.storageKeys.lastUpdate];
    }
  
    shouldUpdateCache() {
      if (!this.lastUpdateTime) return true;
  
      const now = new Date();
      const lastUpdate = new Date(this.lastUpdateTime);
      
      return (
        now.getDate() !== lastUpdate.getDate() ||
        now - lastUpdate > 24 * 60 * 60 * 1000
      );
    }

    deleteCache() {
        chrome.storage.local.remove([this.storageKeys.data, this.storageKeys.lastUpdate]);
    }
  
    async fetchAndCacheData() {
      try {
        // Fetch courses first
        const courses = await this.fetchCourses();
        
        // Initialize course data structure
        this.courseData = {};
        
        // Fetch detailed data for each course in parallel
        await Promise.all(courses.map(course => this.fetchCourseData(course)));
  
        // Save to storage
        await this.saveToCache();
  
      } catch (error) {
        console.error('Failed to fetch and cache data:', error);
        throw error;
      }
    }
  
    async fetchCourses() {
      const response = await fetch(this.serviceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          wstoken: this.token,
          wsfunction: 'core_enrol_get_users_courses',
          userid: await this.getCurrentUserId(),
          moodlewsrestformat: 'json'
        })
      });
  
      const courses = await response.json();
      if (courses.exception) throw new Error(courses.message);
      return courses;
    }
  
    async getCurrentUserId() {
      const response = await fetch(this.serviceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          wstoken: this.token,
          wsfunction: 'core_webservice_get_site_info',
          moodlewsrestformat: 'json'
        })
      });
  
      const data = await response.json();
      if (data.exception) throw new Error(data.message);
      return data.userid;
    }
  
    async fetchCourseData(course) {
      try {
        // Fetch course contents
        const contents = await this.fetchCourseContents(course.id);
        
        // Fetch assignments
        const assignments = await this.fetchCourseAssignments(course.id);
        
        // Store in courseData
        this.courseData[course.id] = {
          id: course.id,
          name: course.fullname,
          shortname: course.shortname,
          contents: contents,
          assignments: assignments,
          lastUpdated: Date.now()
        };
      } catch (error) {
        console.error(`Failed to fetch data for course ${course.id}:`, error);
      }
    }
  
    async fetchCourseContents(courseId) {
      const response = await fetch(this.serviceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          wstoken: this.token,
          wsfunction: 'core_course_get_contents',
          courseid: courseId,
          moodlewsrestformat: 'json'
        })
      });
  
      const contents = await response.json();
      if (contents.exception) throw new Error(contents.message);
      return contents;
    }
  
    async fetchCourseAssignments(courseId) {
      const response = await fetch(this.serviceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          wstoken: this.token,
          wsfunction: 'mod_assign_get_assignments',
          "courseids[0]": [courseId],
          moodlewsrestformat: 'json'
        })
      });
  
      const data = await response.json();
      if (data.exception) throw new Error(data.message);
      return data.courses[0]?.assignments || [];
    }
  
    async saveToCache() {
      await chrome.storage.local.set({
        [this.storageKeys.data]: this.courseData,
        [this.storageKeys.lastUpdate]: Date.now()
      });
    }
  
    initializeSearchIndex() {
      // Create searchable documents from course data
      const documents = [];
  
      for (const courseId in this.courseData) {
        const course = this.courseData[courseId];
        
        // Index course information
        documents.push({
          id: `course_${courseId}`,
          type: 'course',
          courseId: courseId,
          content: course.name,
          url: `/course/view.php?id=${courseId}`
        });
  
        // Index course contents
        course.contents.forEach((section, sectionIndex) => {
          // Index section
          documents.push({
            id: `section_${courseId}_${sectionIndex}`,
            type: 'section',
            courseId: courseId,
            content: section.name,
            url: `/course/view.php?id=${courseId}#section-${sectionIndex}`
          });
  
          // Index modules
          section.modules?.forEach(module => {
            documents.push({
              id: `module_${module.id}`,
              type: module.modname,
              courseId: courseId,
              content: `${module.name} ${module.description || ''}`,
              url: module.url
            });
          });
        });
  
        // Index assignments
        course.assignments?.forEach(assignment => {
          documents.push({
            id: `assignment_${assignment.id}`,
            type: 'assignment',
            courseId: courseId,
            content: `${assignment.name} ${assignment.intro || ''}`,
            url: `/mod/assign/view.php?id=${assignment.cmid}`,
            dueDate: assignment.duedate
          });
        });
      }
  
      this.searchIndex = new Fuse(documents, {
        keys: ['content'],
        threshold: 0.3,
        includeMatches: true
      });
    }
  
    search(query, options = {}) {
      if (!this.isInitialized || !this.searchIndex) return [];
  
      const {
        types = ['course', 'section', 'assignment', 'resource', 'url'],
        limit = 10,
        courseId = null
      } = options;
  
      let results = this.searchIndex.search(query);
  
      // Filter by type and course if specified
      results = results.filter(result => {
        const item = result.item;
        return (
          types.includes(item.type) &&
          (!courseId || item.courseId === courseId)
        );
      });
  
      // Process and format results
      return results.slice(0, limit).map(result => {
        const item = result.item;
        const course = this.courseData[item.courseId];
  
        return {
          id: item.id,
          type: item.type,
          title: this.extractMatchedText(result.matches[0]) || item.content,
          url: item.url,
          courseName: course.name,
          courseId: item.courseId,
          dueDate: item.dueDate,
          matches: result.matches
        };
      });
    }
  
    extractMatchedText(match) {
      if (!match) return null;
  
      const { value, indices } = match;
      let result = '';
      let lastIndex = 0;
  
      indices.forEach(([start, end]) => {
        result += value.slice(lastIndex, start);
        result += `<mark>${value.slice(start, end + 1)}</mark>`;
        lastIndex = end + 1;
      });
  
      result += value.slice(lastIndex);
      return result;
    }
  }