import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import { useUnsavedChangesWarning } from '../../src/hooks/useUnsavedChangesWarning';

function Draft({ dirty }: { dirty: boolean }) {
  useUnsavedChangesWarning(dirty);
  return null;
}
function warns() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

test('clean forms do not prevent normal page navigation', () => {
  render(<Draft dirty={false} />);
  expect(warns()).toBe(false);
});

test('a dirty form prevents unloading until it becomes clean', () => {
  const view = render(<Draft dirty={false} />);
  expect(warns()).toBe(false);
  view.rerender(<Draft dirty />);
  expect(warns()).toBe(true);
  view.rerender(<Draft dirty={false} />);
  expect(warns()).toBe(false);
});

test('unmount and StrictMode cleanup remove the warning handler', () => {
  const view = render(<StrictMode><Draft dirty /></StrictMode>);
  expect(warns()).toBe(true);
  view.unmount();
  expect(warns()).toBe(false);
});

test('independent forms do not overwrite each other’s protection', () => {
  const first = render(<Draft dirty />);
  const second = render(<Draft dirty />);
  expect(warns()).toBe(true);
  first.unmount();
  expect(warns()).toBe(true);
  second.unmount();
  expect(warns()).toBe(false);
});
