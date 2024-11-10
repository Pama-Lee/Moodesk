
class Moodesk {
  constructor() {
    this.todoModule = new TodoModule();
    this.pdfModule = new PDFModule();
    this.init();
  }

  async init() {
    await this.todoModule.init();
  }
}

// Initialize Moodesk when the page is loaded
window.addEventListener('load', () => {
  new Moodesk();
});