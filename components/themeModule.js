// themeModule.js
class ThemeModule {
  constructor(analyticsModule) {
    this.analyticsModule = analyticsModule;
    this.themes = {
      light: {
        name: "明亮",
        colors: {
          primary: "#1a73e8",
          background: "#ffffff",
          secondaryBg: "#f8f9fa",
          text: "#333333",
          secondaryText: "#666666",
          border: "#e0e0e0",
          hover: "#f0f0f0",
        },
      },
      dark: {
        name: "深色",
        colors: {
          primary: "#64B5F6",
          background: "#1a1a1a",
          secondaryBg: "#2d2d2d",
          text: "#ffffff",
          secondaryText: "#b0b0b0",
          border: "#404040",
          hover: "#404040",
        },
      },
      sepia: {
        name: "护眼",
        colors: {
          primary: "#9C6B3C",
          background: "#F4ECD8",
          secondaryBg: "#E8DCC6",
          text: "#4A4A4A",
          secondaryText: "#6F6F6F",
          border: "#D4C5A9",
          hover: "#E0D2B8",
        },
      },
    };

    this.currentTheme = "light";
  }

  init() {
    this.loadThemePreference();
    this.createThemeToggle();
    this.applyTheme(this.currentTheme);
  }

  async loadThemePreference() {
    const result = await chrome.storage.local.get("moodeskTheme");
    if (result.moodeskTheme) {
      this.currentTheme = result.moodeskTheme;
    }
  }

  createThemeToggle() {
    const moodeskControls = document.querySelector(".moodesk-controls");
    if (!moodeskControls) return;

    const themeButton = document.createElement("button");
    themeButton.className = "moodesk-button theme-button";
    themeButton.title = "切换主题";
    themeButton.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
      `;

    const themeMenu = document.createElement("div");
    themeMenu.className = "theme-menu";
    themeMenu.innerHTML = `
        ${Object.entries(this.themes)
          .map(
            ([key, theme]) => `
          <button class="theme-option ${
            key === this.currentTheme ? "active" : ""
          }" data-theme="${key}">
            <span class="theme-color" style="background: ${
              theme.colors.primary
            }"></span>
            ${theme.name}
          </button>
        `
          )
          .join("")}
      `;

    themeButton.addEventListener("click", (e) => {
      e.stopPropagation();
      themeMenu.classList.toggle("show");
    });

    document.addEventListener("click", () => {
      themeMenu.classList.remove("show");
    });

    themeMenu.addEventListener("click", (e) => {
      const themeOption = e.target.closest(".theme-option");
      if (themeOption) {
        const theme = themeOption.dataset.theme;
        this.applyTheme(theme);
        this.saveThemePreference(theme);

        // Update active state
        themeMenu.querySelectorAll(".theme-option").forEach((opt) => {
          opt.classList.toggle("active", opt.dataset.theme === theme);
        });
      }
    });

    moodeskControls.appendChild(themeButton);
    moodeskControls.appendChild(themeMenu);
  }


  applyTheme(themeName) {
    if (!this.themes[themeName]) return;

    const theme = this.themes[themeName];
    const container = document.querySelector(".moodesk-container");
    if (!container) return;

    // Update CSS variables
    container.style.setProperty("--md-primary", theme.colors.primary);
    container.style.setProperty("--md-background", theme.colors.background);
    container.style.setProperty("--md-secondary-bg", theme.colors.secondaryBg);
    container.style.setProperty("--md-text", theme.colors.text);
    container.style.setProperty(
      "--md-secondary-text",
      theme.colors.secondaryText
    );
    container.style.setProperty("--md-border", theme.colors.border);
    container.style.setProperty("--md-hover", theme.colors.hover);

    this.currentTheme = themeName;

    // 通知 AnalyticsModule 更新主题
    if (this.analyticsModule) {
        this.analyticsModule.updateTheme();
      }
  }

  async saveThemePreference(theme) {
    await chrome.storage.local.set({ moodeskTheme: theme });
  }
}
