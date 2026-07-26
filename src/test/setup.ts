import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// The project doesn't set vitest's `globals: true` (existing tests import
// describe/it/expect explicitly), so @testing-library/react's auto-cleanup
// can't detect a global afterEach to hook into — without this, component
// trees from one test leak into the next.
afterEach(() => cleanup());
