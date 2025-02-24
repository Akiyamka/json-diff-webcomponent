import styleSheet from './style.css?raw';
import { Differ } from './lib';

function isPlainObject(obj: unknown) {
  return Object.prototype.toString.call(obj) === '[object Object]';
}

function parsePlainObjectJson(jsonString: string): Record<string, JSON> {
  try {
    const data = JSON.parse(jsonString);
    if (isPlainObject(data)) return data;
    console.error('[JsonDiffComponent] Expected plain object');
    return {};
  } catch (error) {
    console.error(error);
    return {};
  }
}

export class JsonDiffComponent extends HTMLElement {
  differ;

  constructor() {
    super();
    this.differ = new Differ();
    this.attachShadow({ mode: 'open' });
  }

  private leftData?: Record<string, JSON>;
  private rightData?: Record<string, JSON>;
  private container?: HTMLDivElement;

  static get observedAttributes() {
    return ['left', 'right'];
  }

  set left(value: string) {
    this.setAttribute('left', value);
  }

  set right(value: string) {
    this.setAttribute('right', value);
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (newValue === oldValue) return;
    switch (name) {
      case 'left': {
        this.leftData = parsePlainObjectJson(newValue);
        break;
      }

      case 'right':
        this.rightData = parsePlainObjectJson(newValue);
        break;

      default:
        break;
    }
    this.render();
  }

  static createStyles() {
    const style = document.createElement('style');
    style.textContent = styleSheet;
    return style;
  }

  createContainer() {
    this.container = document.createElement('div');
    this.container.classList.add('json-diff-container');
    return this.container;
  }

  reset() {
    this.leftData = undefined;
    this.rightData = undefined;
  }

  render() {
    if (!this.shadowRoot) return;
    if (!this.leftData) return;
    if (!this.rightData) return;
    if (!this.shadowRoot.hasChildNodes()) {
      this.shadowRoot.appendChild(JsonDiffComponent.createStyles());
      this.shadowRoot.appendChild(this.createContainer());
    }
    if (!this.container) return;
    this.differ.compare(JSON.stringify(this.leftData), JSON.stringify(this.rightData), {
      container: this.container,
    });
  }
}
