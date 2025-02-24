import { describe, expect, it } from 'vitest';
import { Differ } from '../src/lib';

describe('jdd', () => {
  it('Should export a valid object', () => {
    expect(new Differ()).is.a('object');
  });
});
