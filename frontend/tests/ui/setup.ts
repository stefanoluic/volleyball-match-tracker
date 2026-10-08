import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { notifications } from '@mantine/notifications';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {},
    removeEventListener() {}, dispatchEvent: () => false,
  }),
});

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = TestResizeObserver;
HTMLElement.prototype.scrollIntoView = () => {};
const originalGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element) => originalGetComputedStyle(element);

afterEach(() => {
  cleanup();
  notifications.clean();
});
