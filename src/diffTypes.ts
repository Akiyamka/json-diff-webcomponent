export const enum DiffType {
  LEFT = 'left',
  RIGHT = 'right',
  BOTH = 'both',
  EQUALITY = 'eq',
  MISSING = 'missing',
  TYPE = 'type',
}

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export type DiffPath = {
  path: string;
  line: number;
};

export type Diff = {
  path1: DiffPath;
  path2: DiffPath;
  type: string;
  msg: string;
};

export interface DiffState {
  out: string;
  indent: number;
  currentPath: string[];
  paths: { path: string; line: number }[];
  line: number;
}
