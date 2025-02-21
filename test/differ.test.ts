import { describe, expect, it } from 'vitest';
import jdd from '../src/differ';

describe('jdd', () => {
  it('Should export a valid object', () => {
    expect(jdd).is.a('object');
  });
});
