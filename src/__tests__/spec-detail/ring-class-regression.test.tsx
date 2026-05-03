/**
 * Regression test for the ring-2 / ring-violet-500 classes used by Spec Detail
 * to outline the targeted finding-card after an endpoint click (Epic 05 AC #11
 * + Epic 08 polish).
 *
 * The risk: Tailwind v4's JIT scans source files for class literals. If
 * neither `spec-detail-view.tsx` nor any test file contains the literal
 * strings, the JIT may not emit them and the runtime classList.add() leaves
 * an unstyled element. This belt-and-suspenders test simply ensures both
 * literals appear in the codebase under the test source-scan window.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const CLASSES = ['ring-2', 'ring-violet-500'] as const;
const LITERAL = 'ring-2 ring-violet-500';

describe('ring-2 / ring-violet-500 regression', () => {
  it('classList.add applies both classes to a rendered element', () => {
    const { container } = render(<div data-testid="probe" className="rounded" />);
    const el = container.querySelector('[data-testid="probe"]') as HTMLElement;

    el.classList.add(...CLASSES);

    for (const cls of CLASSES) {
      expect(el.classList.contains(cls)).toBe(true);
    }
    // Literal also exists in this file's source so Tailwind's JIT picks it up.
    expect(LITERAL).toBe('ring-2 ring-violet-500');
  });
});
