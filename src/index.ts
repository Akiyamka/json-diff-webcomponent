import { JsonDiffComponent } from './web-component';

let name = 'json-diff';
export const registerComponent = (customName = name) => {
  name = customName;
  customElements.define(name, JsonDiffComponent);
  return getComponentInstance;
};

export const getComponentInstance = (id: string) => {
  const el = document.getElementById(id);
  if (el instanceof JsonDiffComponent) {
    return el;
  }
  return undefined;
};
