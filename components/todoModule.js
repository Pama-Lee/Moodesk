// todoModule.js
class TodoModule {
    constructor() {
      this.todos = {};
      this.currentCourseId = null;
      this.currentCourseName = null;
      this.container = null;
    }
  
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  
    formatDate(dateString) {
      const date = new Date(dateString);
      const now = new Date();
      const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
      
      if (diffInHours < 24) {
        if (diffInHours === 0) {
          const diffInMinutes = Math.floor((now - date) / (1000 * 60));
          return `${diffInMinutes} 分钟前`;
        }
        return `${diffInHours} 小时前`;
      } else if (diffInHours < 48) {
        return '昨天';
      } else {
        return date.toLocaleDateString('zh-CN', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric'
        });
      }
    }
  
    async init() {
      this.extractCourseInfo();
      await this.loadTodos();
      this.createContainer();
      this.renderTodos();
      this.setupEventListeners();
    }
  
    extractCourseInfo() {
      const urlParams = new URLSearchParams(window.location.search);
      this.currentCourseId = urlParams.get('id');
      const courseHeader = document.querySelector('h1');
      this.currentCourseName = courseHeader ? courseHeader.textContent.trim() : 'Unknown Course';
    }
  
    createContainer() {
      this.container = document.createElement('div');
      this.container.className = 'moodesk-container';
      this.container.innerHTML = `
        <div class="moodesk-header">
          <h3>
            <img src="${chrome.runtime.getURL('icons/moodesk.png')}" alt="Moodesk Icon">
            Moodesk
          </h3>
          <div class="moodesk-controls">
            <button class="moodesk-button collapse-button" title="收起/展开">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <button class="moodesk-button hide-button" title="隐藏">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="moodesk-content">
          <div class="course-info">
            <div class="course-name">${this.currentCourseName}</div>
            <div class="course-code">Course ID: ${this.currentCourseId}</div>
          </div>
          <div class="moodesk-input-container">
            <input type="text" class="moodesk-todo-input" placeholder="添加新的待办事项...">
          </div>
          <div class="moodesk-todo-list"></div>
        </div>
      `;
      document.body.appendChild(this.container);
      this.setupDraggable();
    }
  
    setupDraggable() {
      this.container.style.cursor = 'move';
      this.container.addEventListener('mousedown', this.startDragging.bind(this));
    }
  
    async loadTodos() {
      const result = await chrome.storage.local.get('moodeskTodos');
      this.todos = result.moodeskTodos || {};
      if (!this.todos[this.currentCourseId]) {
        this.todos[this.currentCourseId] = [];
      }
    }
  
    async saveTodos() {
      await chrome.storage.local.set({ moodeskTodos: this.todos });
    }
  
    renderTodos() {
      const todoList = this.container.querySelector('.moodesk-todo-list');
      const currentTodos = this.todos[this.currentCourseId];
      
      if (!currentTodos || currentTodos.length === 0) {
        todoList.innerHTML = `
          <div class="empty-state">
            还没有待办事项，开始添加吧！
          </div>
        `;
        return;
      }
  
      todoList.innerHTML = currentTodos.map((todo, index) => `
        <div class="todo-item" data-index="${index}">
          <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''}>
          <div class="todo-content">
            <div class="todo-text ${todo.completed ? 'completed' : ''}">${this.escapeHtml(todo.text)}</div>
            ${todo.createdAt ? `<div class="todo-meta">创建于 ${this.formatDate(todo.createdAt)}</div>` : ''}
          </div>
          <button class="todo-delete" title="删除" type="button">删除</button>
        </div>
      `).join('');
    }
  
    createShowButton() {
      const showButton = document.createElement('button');
      showButton.className = 'moodesk-show-button';
      showButton.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      `;
      showButton.title = "显示 Moodesk";
      document.body.appendChild(showButton);
  
      showButton.addEventListener('click', () => {
        this.container.classList.remove('hidden');
        showButton.remove();
      });
    }
  
    setupEventListeners() {
      const input = this.container.querySelector('.moodesk-todo-input');
      
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
          this.addTodo(input.value.trim());
          input.value = '';
        }
      });
  
      const header = this.container.querySelector('.moodesk-header h3');
      const collapseButton = this.container.querySelector('.collapse-button');
      const hideButton = this.container.querySelector('.hide-button');
  
      [header, collapseButton].forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.container.classList.toggle('collapsed');
          const svg = collapseButton.querySelector('svg path');
          if (this.container.classList.contains('collapsed')) {
            svg.setAttribute('d', 'M9 19l7-7-7-7');
          } else {
            svg.setAttribute('d', 'M15 19l-7-7 7-7');
          }
        });
      });
  
      hideButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.container.classList.add('hidden');
        this.createShowButton();
      });
  
      this.container.addEventListener('click', (e) => {
        const todoItem = e.target.closest('.todo-item');
        if (!todoItem) return;
  
        const index = parseInt(todoItem.dataset.index);
  
        if (e.target.classList.contains('todo-checkbox')) {
          this.toggleTodo(index);
        } else if (e.target.classList.contains('todo-delete')) {
          this.deleteTodo(index);
        }
      });
    }
  
    startDragging(e) {
      if (e.target.closest('.todo-item')) return;
      
      const initialX = e.clientX - this.container.offsetLeft;
      const initialY = e.clientY - this.container.offsetTop;
  
      const drag = (e) => {
        this.container.style.left = `${e.clientX - initialX}px`;
        this.container.style.top = `${e.clientY - initialY}px`;
      };
  
      const stopDragging = () => {
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', stopDragging);
      };
  
      document.addEventListener('mousemove', drag);
      document.addEventListener('mouseup', stopDragging);
    }
  
    async addTodo(text) {
      if (!this.todos[this.currentCourseId]) {
        this.todos[this.currentCourseId] = [];
      }
      
      this.todos[this.currentCourseId].push({
        text,
        completed: false,
        createdAt: new Date().toISOString()
      });
      
      await this.saveTodos();
      this.renderTodos();
    }
  
    async toggleTodo(index) {
      const currentTodos = this.todos[this.currentCourseId];
      if (currentTodos[index]) {
        currentTodos[index].completed = !currentTodos[index].completed;
        await this.saveTodos();
        this.renderTodos();
      }
    }
  
    async deleteTodo(index) {
      const currentTodos = this.todos[this.currentCourseId];
      if (currentTodos[index]) {
        currentTodos.splice(index, 1);
        await this.saveTodos();
        this.renderTodos();
      }
    }
}