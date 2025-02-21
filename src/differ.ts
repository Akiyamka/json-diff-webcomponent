const enum Side {
  LEFT = 'left',
  RIGHT = 'right',
  BOTH = 'both',
  EQUALITY = 'eq',
}

type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

type DiffPath = {
  path: string;
  line: number;
};

type Diff = {
  path1: DiffPath;
  path2: DiffPath;
  type: string;
  msg: string;
};

interface DiffState {
  out: string;
  indent: number;
  currentPath: string[];
  paths: { path: string; line: number }[];
  line: number;
}

function getType(value: unknown): string {
  if (
    function (this: unknown) {
      return value && value !== this;
    }.call(value)
  ) {
    //fallback on 'typeof' for truthy primitive values
    return typeof value;
  }
  const match = {}.toString.call(value).match(/\s([a-z|A-Z]+)/);
  if (!match || !match[1]) {
    return 'undefined';
  }
  return match[1].toLowerCase();
}

export interface JDD {
  currentDiff: number;
  TYPE: string;
  MISSING: string;
  diffs: Diff[];
  SEPARATOR: string;
  requestCount: number;
  findDiffs(config1: DiffState, data1: JSONValue, config2: DiffState, data2: JSONValue): void;
  diffVal(left: JSONValue, leftConfig: DiffState, right: JSONValue, rightConfig: DiffState): void;
  diffArray(val1: JSONValue[], config1: DiffState, val2: JSONValue[], config2: DiffState): void;
  diffBool(val1: boolean, config1: DiffState, val2: JSONValue, config2: DiffState): void;
  formatAndDecorate(config: DiffState, data: JSONValue): void;
  formatAndDecorateArray(config: DiffState, data: JSONValue[]): void;
  startArray(config: DiffState): void;
  finishArray(config: DiffState): void;
  startObject(config: DiffState): void;
  finishObject(config: DiffState): void;
  formatVal(val: JSONValue, config: DiffState): void;
  unescapeString(val: string): string;
  generatePath(config: DiffState, prop?: string): string;
  newLine(config: DiffState): string;
  getSortedProperties(obj: Record<string, JSONValue>): string[];
  generateDiff(
    config1: DiffState,
    path1: string,
    config2: DiffState,
    path2: string,
    msg: string,
    type: string
  ): Diff;
  getTabs(indent: number): string;
  removeTrailingComma(config: DiffState): void;
  createConfig(): DiffState;
  format(views: HTMLPreElement[]): void;
  handleDiffClick(line: number, side: string): void;
  highlightPrevDiff(): void;
  highlightNextDiff(): void;
  highlightDiff(index: number): void;
  scrollToDiff(diff: Diff): void;
  processDiffs(): void;
  validateInput(json: string): boolean;
  handleFiles(files: FileList, side: string): void;
  setupNewDiff(): void;
  generateReport(): void;
  compare(left: string, right: string, options: { container: HTMLElement }): void;
}

const jdd: JDD = {
  currentDiff: 0,
  TYPE: 'type',
  MISSING: 'missing',
  diffs: [],
  SEPARATOR: '/',
  requestCount: 0,

  /**
   * Find the differences between the two objects and recurse into their sub objects.
   */
  findDiffs: function (config1: DiffState, data1: JSONValue, config2: DiffState, data2: JSONValue) {
    config1.currentPath.push(jdd.SEPARATOR);
    config2.currentPath.push(jdd.SEPARATOR);
    if (
      typeof data1 !== 'object' ||
      data1 === null ||
      Array.isArray(data1) ||
      typeof data2 !== 'object' ||
      data2 === null ||
      Array.isArray(data2)
    ) {
      return;
    }

    const obj1 = data1 as { [key: string]: JSONValue };
    const obj2 = data2 as { [key: string]: JSONValue };

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length < keys2.length) {
      /*
       * This means the second data has more properties than the first.
       * We need to find the extra ones and create diffs for them.
       */
      for (const key of keys2) {
        if (!obj1.hasOwnProperty(key)) {
          jdd.diffs.push(
            jdd.generateDiff(
              config1,
              jdd.generatePath(config1),
              config2,
              jdd.generatePath(config2, jdd.SEPARATOR + key),
              'The right side of this object has more items than the left side',
              jdd.MISSING
            )
          );
        }
      }
    }

    /*
     * Now we're going to look for all the properties in object one and
     * compare them to object two
     */
    for (const key of keys1) {
      config1.currentPath.push(key.replace(jdd.SEPARATOR, '#'));
      if (!obj2.hasOwnProperty(key)) {
        /*
         * This means that the first data has a property which
         * isn't present in the second data
         */
        jdd.diffs.push(
          jdd.generateDiff(
            config1,
            jdd.generatePath(config1),
            config2,
            jdd.generatePath(config2),
            'Missing property <code>' + key + '</code> from the object on the right side',
            jdd.MISSING
          )
        );
      } else {
        config2.currentPath.push(key.replace(jdd.SEPARATOR, '#'));
        jdd.diffVal(obj1[key], config1, obj2[key], config2);
        config2.currentPath.pop();
      }
      config1.currentPath.pop();
    }

    config1.currentPath.pop();
    config2.currentPath.pop();

    /*
     * Now we want to look at all the properties in object two that
     * weren't in object one and generate diffs for them.
     */
    for (const key of keys2) {
      if (!obj1.hasOwnProperty(key)) {
        jdd.diffs.push(
          jdd.generateDiff(
            config1,
            jdd.generatePath(config1),
            config2,
            jdd.generatePath(config2, key),
            'Missing property <code>' + key + '</code> from the object on the left side',
            jdd.MISSING
          )
        );
      }
    }
  },

  /**
   * Generate the differences between two values.  This handles differences of object
   * types and actual values.
   */
  diffVal(left: JSONValue, leftConfig: DiffState, right: JSONValue, rightConfig: DiffState) {
    if (Array.isArray(left)) {
      if (Array.isArray(right)) {
        jdd.diffArray(left, leftConfig, right, rightConfig);
      } else {
        jdd.diffs.push(
          jdd.generateDiff(
            leftConfig,
            jdd.generatePath(leftConfig),
            rightConfig,
            jdd.generatePath(rightConfig),
            'Both types should be arrays',
            jdd.TYPE
          )
        );
      }
    } else if (typeof left === 'object' && left !== null && !Array.isArray(left)) {
      if (['array', 'string', 'number', 'boolean', 'null'].indexOf(getType(right)) > -1) {
        jdd.diffs.push(
          jdd.generateDiff(
            leftConfig,
            jdd.generatePath(leftConfig),
            rightConfig,
            jdd.generatePath(rightConfig),
            'Both types should be objects',
            jdd.TYPE
          )
        );
      } else {
        jdd.findDiffs(leftConfig, left, rightConfig, right);
      }
    } else if (getType(left) === 'string') {
      if (getType(right) !== 'string') {
        jdd.diffs.push(
          jdd.generateDiff(
            leftConfig,
            jdd.generatePath(leftConfig),
            rightConfig,
            jdd.generatePath(rightConfig),
            'Both types should be strings',
            jdd.TYPE
          )
        );
      } else if (left !== right) {
        jdd.diffs.push(
          jdd.generateDiff(
            leftConfig,
            jdd.generatePath(leftConfig),
            rightConfig,
            jdd.generatePath(rightConfig),
            'Both sides should be equal strings',
            Side.EQUALITY
          )
        );
      }
    } else if (getType(left) === 'number') {
      if (getType(right) !== 'number') {
        jdd.diffs.push(
          jdd.generateDiff(
            leftConfig,
            jdd.generatePath(leftConfig),
            rightConfig,
            jdd.generatePath(rightConfig),
            'Both types should be numbers',
            jdd.TYPE
          )
        );
      } else if (left !== right) {
        jdd.diffs.push(
          jdd.generateDiff(
            leftConfig,
            jdd.generatePath(leftConfig),
            rightConfig,
            jdd.generatePath(rightConfig),
            'Both sides should be equal numbers',
            Side.EQUALITY
          )
        );
      }
    } else if (typeof left === 'boolean') {
      jdd.diffBool(left, leftConfig, right, rightConfig);
    } else if (getType(left) === 'null' && getType(right) !== 'null') {
      jdd.diffs.push(
        jdd.generateDiff(
          leftConfig,
          jdd.generatePath(leftConfig),
          rightConfig,
          jdd.generatePath(rightConfig),
          'Both types should be nulls',
          jdd.TYPE
        )
      );
    }
  },

  /**
   * Arrays are more complex because we need to recurse into them and handle different length
   * issues so we handle them specially in this function.
   */
  diffArray: function (
    val1: JSONValue[],
    config1: DiffState,
    val2: JSONValue[],
    config2: DiffState
  ) {
    if (!Array.isArray(val2)) {
      jdd.diffs.push(
        jdd.generateDiff(
          config1,
          jdd.generatePath(config1),
          config2,
          jdd.generatePath(config2),
          'Both types should be arrays',
          jdd.TYPE
        )
      );
      return;
    }

    if (val1.length < val2.length) {
      /*
       * Then there were more elements on the right side and we need to
       * generate those differences.
       */
      for (var i = val1.length; i < val2.length; i++) {
        jdd.diffs.push(
          jdd.generateDiff(
            config1,
            jdd.generatePath(config1),
            config2,
            jdd.generatePath(config2, '[' + i + ']'),
            'Missing element <code>' + i + '</code> from the array on the left side',
            jdd.MISSING
          )
        );
      }
    }
    val1.forEach(function (_, index) {
      if (val2.length <= index) {
        jdd.diffs.push(
          jdd.generateDiff(
            config1,
            jdd.generatePath(config1, '[' + index + ']'),
            config2,
            jdd.generatePath(config2),
            'Missing element <code>' + index + '</code> from the array on the right side',
            jdd.MISSING
          )
        );
      } else {
        config1.currentPath.push(jdd.SEPARATOR + '[' + index + ']');
        config2.currentPath.push(jdd.SEPARATOR + '[' + index + ']');

        if (getType(val2) === 'array') {
          /*
           * If both sides are arrays then we want to diff them.
           */
          jdd.diffVal(val1[index], config1, val2[index], config2);
        }
        config1.currentPath.pop();
        config2.currentPath.pop();
      }
    });
  },

  /**
   * We handle boolean values specially because we can show a nicer message for them.
   */
  diffBool: function (val1: boolean, config1: DiffState, val2: JSONValue, config2: DiffState) {
    if (typeof val2 !== 'boolean') {
      jdd.diffs.push(
        jdd.generateDiff(
          config1,
          jdd.generatePath(config1),
          config2,
          jdd.generatePath(config2),
          'Both types should be booleans',
          jdd.TYPE
        )
      );
    } else if (val1 !== val2) {
      if (val1) {
        jdd.diffs.push(
          jdd.generateDiff(
            config1,
            jdd.generatePath(config1),
            config2,
            jdd.generatePath(config2),
            'The left side is <code>true</code> and the right side is <code>false</code>',
            Side.EQUALITY
          )
        );
      } else {
        jdd.diffs.push(
          jdd.generateDiff(
            config1,
            jdd.generatePath(config1),
            config2,
            jdd.generatePath(config2),
            'The left side is <code>false</code> and the right side is <code>true</code>',
            Side.EQUALITY
          )
        );
      }
    }
  },

  /**
   * Format the object into the output stream and decorate the data tree with
   * the data about this object.
   */
  formatAndDecorate(config: DiffState, data: JSONValue) {
    if (Array.isArray(data)) {
      jdd.formatAndDecorateArray(config, data);
      return;
    }

    if (typeof data !== 'object' || data === null) {
      return;
    }

    jdd.startObject(config);
    config.currentPath.push(jdd.SEPARATOR);

    const props = jdd.getSortedProperties(data as Record<string, JSONValue>);

    /*
     * If the first set has more than the second then we will catch it
     * when we compare values.  However, if the second has more then
     * we need to catch that here.
     */
    props.forEach((key) => {
      config.out +=
        jdd.newLine(config) + jdd.getTabs(config.indent) + '"' + jdd.unescapeString(key) + '": ';
      config.currentPath.push(key.replace(jdd.SEPARATOR, '#'));
      config.paths.push({
        path: jdd.generatePath(config),
        line: config.line,
      });
      jdd.formatVal(data[key], config);
      config.currentPath.pop();
    });

    jdd.finishObject(config);
    config.currentPath.pop();
  },

  /**
   * Format the array into the output stream and decorate the data tree with
   * the data about this object.
   */
  formatAndDecorateArray: function (/*Object*/ config, /*Array*/ data) {
    jdd.startArray(config);

    /*
     * If the first set has more than the second then we will catch it
     * when we compare values.  However, if the second has more then
     * we need to catch that here.
     */
    data.forEach(function (arrayVal, index) {
      config.out += jdd.newLine(config) + jdd.getTabs(config.indent);
      config.paths.push({
        path: jdd.generatePath(config, '[' + index + ']'),
        line: config.line,
      });

      config.currentPath.push(jdd.SEPARATOR + '[' + index + ']');
      jdd.formatVal(arrayVal, config);
      config.currentPath.pop();
    });

    jdd.finishArray(config);
    config.currentPath.pop();
  },

  /**
   * Generate the start of the an array in the output stream and push in the new path
   */
  startArray: function (config) {
    config.indent++;
    config.out += '[';

    if (config.paths.length === 0) {
      /*
       * Then we are at the top of the array and we want to add
       * a path for it.
       */
      config.paths.push({
        path: jdd.generatePath(config),
        line: config.line,
      });
    }

    if (config.indent === 0) {
      config.indent++;
    }
  },

  /**
   * Finish the array, outdent, and pop off all the path
   */
  finishArray: function (config) {
    if (config.indent === 0) {
      config.indent--;
    }

    jdd.removeTrailingComma(config);

    config.indent--;
    config.out += jdd.newLine(config) + jdd.getTabs(config.indent) + ']';
    if (config.indent !== 0) {
      config.out += ',';
    } else {
      config.out += jdd.newLine(config);
    }
  },

  /**
   * Generate the start of the an object in the output stream and push in the new path
   */
  startObject: function (config) {
    config.indent++;
    config.out += '{';

    if (config.paths.length === 0) {
      /*
       * Then we are at the top of the object and we want to add
       * a path for it.
       */
      config.paths.push({
        path: jdd.generatePath(config),
        line: config.line,
      });
    }

    if (config.indent === 0) {
      config.indent++;
    }
  },

  /**
   * Finish the object, outdent, and pop off all the path
   */
  finishObject: function (config) {
    if (config.indent === 0) {
      config.indent--;
    }

    jdd.removeTrailingComma(config);

    config.indent--;
    config.out += jdd.newLine(config) + jdd.getTabs(config.indent) + '}';
    if (config.indent !== 0) {
      config.out += ',';
    } else {
      config.out += jdd.newLine(config);
    }
  },

  /**
   * Format a specific value into the output stream.
   */
  formatVal: function (val: JSONValue, config: DiffState) {
    if (Array.isArray(val)) {
      config.out += '[';

      config.indent++;
      val.forEach(function (arrayVal: JSONValue, index: number) {
        config.out += jdd.newLine(config) + jdd.getTabs(config.indent);
        config.paths.push({
          path: jdd.generatePath(config, '[' + index + ']'),
          line: config.line,
        });

        config.currentPath.push(jdd.SEPARATOR + '[' + index + ']');
        jdd.formatVal(arrayVal, config);
        config.currentPath.pop();
      });
      jdd.removeTrailingComma(config);
      config.indent--;

      config.out += jdd.newLine(config) + jdd.getTabs(config.indent) + ']' + ',';
    } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      jdd.formatAndDecorate(config, val);
    } else if (typeof val === 'string') {
      config.out += '"' + jdd.unescapeString(val) + '",';
    } else if (typeof val === 'number') {
      config.out += val + ',';
    } else if (typeof val === 'boolean') {
      config.out += val + ',';
    } else if (val === null) {
      config.out += 'null,';
    }
  },

  /**
   * When we parse the JSON string we end up removing the escape strings when we parse it
   * into objects.  This results in invalid JSON if we insert those strings back into the
   * generated JSON.  We also need to look out for characters that change the line count
   * like new lines and carriage returns.
   *
   * This function puts those escaped values back when we generate the JSON output for the
   * well known escape strings in JSON.  It handles properties and values.
   *
   * This function does not handle unicode escapes.  Unicode escapes are optional in JSON
   * and the JSON output is still valid with a unicode character in it.
   */
  unescapeString: function (val) {
    if (val) {
      return val
        .replace('\\', '\\\\') // Single slashes need to be replaced first
        .replace(/\"/g, '\\"') // Then double quotes
        .replace(/\n/g, '\\n') // New lines
        .replace('\b', '\\b') // Backspace
        .replace(/\f/g, '\\f') // Formfeed
        .replace(/\r/g, '\\r') // Carriage return
        .replace(/\t/g, '\\t'); // Horizontal tabs
    } else {
      return val;
    }
  },

  /**
   * Generate a JSON path based on the specific configuration and an optional property.
   */
  generatePath(config, prop) {
    var s = '';
    config.currentPath.forEach((path) => {
      s += path;
    });

    if (prop) {
      s += jdd.SEPARATOR + prop.replace(jdd.SEPARATOR, '#');
    }

    if (s.length === 0) {
      return jdd.SEPARATOR;
    } else {
      return s;
    }
  },

  /**
   * Add a new line to the output stream
   */
  newLine: function (config) {
    config.line++;
    return '\n';
  },

  /**
   * Sort all the relevant properties and return them in an alphabetical sort by property key
   */
  getSortedProperties: function (/*Object*/ obj) {
    var props = [];

    for (var prop in obj) {
      if (obj.hasOwnProperty(prop)) {
        props.push(prop);
      }
    }

    props = props.sort(function (a, b) {
      return a.localeCompare(b);
    });

    return props;
  },

  /**
   * Generate the diff and verify that it matches a JSON path
   */
  generateDiff: function (
    config1: DiffState,
    path1: string,
    config2: DiffState,
    path2: string,
    msg: string,
    type: string
  ): Diff {
    const normalizedPath1 =
      path1 !== jdd.SEPARATOR && path1.charAt(path1.length - 1) === jdd.SEPARATOR
        ? path1.substring(0, path1.length - 1)
        : path1;

    const normalizedPath2 =
      path2 !== jdd.SEPARATOR && path2.charAt(path2.length - 1) === jdd.SEPARATOR
        ? path2.substring(0, path2.length - 1)
        : path2;

    let pathObj1 = config1.paths.find((path) => path.path === normalizedPath1);
    let pathObj2 = config2.paths.find((path) => path.path === normalizedPath2);

    if (!pathObj1) {
      pathObj1 = {
        path: normalizedPath1,
        line: config1.line,
      };
      config1.paths.push(pathObj1);
    }

    if (!pathObj2) {
      pathObj2 = {
        path: normalizedPath2,
        line: config2.line,
      };
      config2.paths.push(pathObj2);
    }

    return {
      path1: pathObj1,
      path2: pathObj2,
      type,
      msg,
    };
  },

  /**
   * Get the current indent level
   */
  getTabs: function (/*int*/ indent) {
    var s = '';
    for (var i = 0; i < indent; i++) {
      s += '    ';
    }

    return s;
  },

  /**
   * Remove the trailing comma from the output.
   */
  removeTrailingComma: function (config) {
    /*
     * Remove the trailing comma
     */
    if (config.out.charAt(config.out.length - 1) === ',') {
      config.out = config.out.substring(0, config.out.length - 1);
    }
  },

  /**
   * Create a config object for holding differences
   */
  createConfig(): DiffState {
    return {
      out: '',
      indent: -1,
      currentPath: [],
      paths: [],
      line: 1,
    };
  },

  /**
   * Format the output pre tags.
   */
  format(views: HTMLPreElement[]) {
    views.forEach((pre) => {
      let lineNumbers = '<div class="gutter">';
      let codeLines = '<div>';
      // This is used to encode text as fast as possible
      let lineDiv = document.createElement('div');
      let lineText = document.createTextNode('');
      lineDiv.appendChild(lineText);
      const addLine = (line: string, index: number) => {
        lineNumbers += '<span class="line-number">' + (index + 1) + '</span>';
        lineText.nodeValue = line;
        codeLines +=
          '<div class="codeLine line' +
          (index + 1) +
          '"><span class="code">' +
          lineDiv.innerHTML +
          '</span></div>';
      };

      const lines = pre.textContent?.split('\n') ?? [];
      lines.forEach(addLine);

      // Combine it all together
      codeLines += '</div>';
      lineNumbers += '</div>';
      pre.outerHTML =
        '<pre id="' +
        pre.id +
        '" class="codeBlock ' +
        pre.classList.toString() +
        '">' +
        lineNumbers +
        codeLines +
        '</pre>';
    });
  },

  handleDiffClick: function (line, side) {
    var diffs = jdd.diffs.filter(function (diff) {
      if (side === Side.LEFT) {
        return line === diff.path1.line;
      } else if (side === Side.RIGHT) {
        return line === diff.path2.line;
      } else {
        return line === diff.path1.line || line === diff.path2.line;
      }
    });

    document.querySelectorAll('pre.left span.code').forEach(function (val) {
      val.classList.remove('selected');
    });

    document.querySelectorAll('pre.right span.code').forEach(function (val) {
      val.classList.remove('selected');
    });

    diffs.forEach(function (diff) {
      const leftElement = document.querySelector(
        'pre.left div.line' + diff.path1.line + ' span.code'
      );
      const rightElement = document.querySelector(
        'pre.right div.line' + diff.path2.line + ' span.code'
      );

      leftElement?.classList.add('selected');
      rightElement?.classList.add('selected');
    });

    if (side === Side.LEFT || side === Side.RIGHT) {
      jdd.currentDiff = jdd.diffs.findIndex(function (diff) {
        return diff.path1.line === line;
      });
    }

    if (jdd.currentDiff === -1) {
      jdd.currentDiff = jdd.diffs.findIndex(function (diff) {
        return diff.path2.line === line;
      });
    }
  },

  highlightPrevDiff: function () {
    if (jdd.currentDiff > 0) {
      jdd.currentDiff--;
      jdd.highlightDiff(jdd.currentDiff);
      jdd.scrollToDiff(jdd.diffs[jdd.currentDiff]);
    }
  },

  highlightNextDiff: function () {
    if (jdd.currentDiff < jdd.diffs.length - 1) {
      jdd.currentDiff++;
      jdd.highlightDiff(jdd.currentDiff);
      jdd.scrollToDiff(jdd.diffs[jdd.currentDiff]);
    }
  },

  /**
   * Highlight the diff at the specified index
   */
  highlightDiff: function (index) {
    jdd.handleDiffClick(jdd.diffs[index].path1.line, Side.BOTH);
  },

  /**
   * Scroll the specified diff to be visible
   */
  scrollToDiff: function (diff) {
    const element = document.querySelector('pre.left div.line' + diff.path1.line + ' span.code');
    if (!element) return;

    const elementOffsetTop =
      element.getBoundingClientRect().top +
      window.scrollY -
      (document.documentElement?.clientTop || 0);

    window.scrollTo({
      behavior: 'smooth',
      left: 0,
      top: elementOffsetTop,
    });
  },

  /**
   * Process the specified diff
   */
  processDiffs: function () {
    const left: number[] = [];
    const right: number[] = [];

    // Cache the lines for fast lookup
    const leftLineLookup: Record<number, Element> = {};
    const rightLineLookup: Record<number, Element> = {};

    // We can use the index to save lookup up the parents class
    document.querySelectorAll('pre.left span.code').forEach((val, index) => {
      leftLineLookup[index + 1] = val;
    });

    document.querySelectorAll('pre.right span.code').forEach((val, index) => {
      rightLineLookup[index + 1] = val;
    });

    if (!leftLineLookup || !rightLineLookup) {
      return;
    }

    jdd.diffs.forEach(function (diff) {
      leftLineLookup[diff.path1.line].classList.add(diff.type, 'diff');
      if (left.indexOf(diff.path1.line) === -1) {
        leftLineLookup[diff.path1.line].addEventListener('click', function () {
          jdd.handleDiffClick(diff.path1.line, Side.LEFT);
        });
        left.push(diff.path1.line);
      }

      rightLineLookup[diff.path2.line].classList.add(diff.type, 'diff');
      if (right.indexOf(diff.path2.line) === -1) {
        rightLineLookup[diff.path2.line].addEventListener('click', function () {
          jdd.handleDiffClick(diff.path2.line, Side.RIGHT);
        });
        right.push(diff.path2.line);
      }
    });

    jdd.diffs = jdd.diffs.sort(function (a, b) {
      return a.path1.line - b.path1.line;
    });
  },

  /**
   * Validate the input against the JSON parser
   */
  validateInput: function (json: string): boolean {
    try {
      JSON.parse(json);
      return true;
    } catch (parseException) {
      return false;
    }
  },

  /**
   * Handle the file uploads
   */
  handleFiles: function (files: FileList, side: string) {
    const reader = new FileReader();

    reader.onload = function (event: ProgressEvent<FileReader>) {
      const target = event.target as FileReader;
      if (!target) return;

      const textArea = document.getElementById(
        side === Side.LEFT ? 'textarealeft' : 'textarearight'
      ) as HTMLTextAreaElement;
      if (!textArea) return;

      textArea.value = target.result as string;
    };

    if (files.length > 0) {
      reader.readAsText(files[0]);
    }
  },

  setupNewDiff: function () {
    const initContainer = document.querySelector('.initContainer') as HTMLElement;
    const diffContainer = document.querySelector('.diffcontainer') as HTMLElement;
    const toolbar = document.querySelector('.toolbar');

    if (initContainer) {
      initContainer.style.display = 'block';
    }
    if (diffContainer) {
      diffContainer.style.display = 'none';
      diffContainer.querySelectorAll('pre').forEach(function (elem) {
        while (elem.firstChild) {
          elem.removeChild(elem.firstChild);
        }
      });
    }
    if (toolbar) {
      while (toolbar.firstChild) {
        toolbar.removeChild(toolbar.firstChild);
      }
    }
  },

  /**
   * Generate the report section with the diff
   */
  generateReport: function () {
    const report = document.getElementById('report');
    if (!report) return;

    while (report.firstChild) {
      report.removeChild(report.firstChild);
    }

    report.insertAdjacentHTML('beforeend', '<button>Perform a new diff</button>');
    const newDiffButton = report.querySelector('button');
    newDiffButton?.addEventListener('click', function () {
      jdd.setupNewDiff();
    });

    if (jdd.diffs.length === 0) {
      report.insertAdjacentHTML(
        'beforeend',
        '<span>The two files were semantically identical.</span>'
      );
      return;
    }

    var typeCount = 0;
    var eqCount = 0;
    var missingCount = 0;
    jdd.diffs.forEach(function (diff) {
      if (diff.type === Side.EQUALITY) {
        eqCount++;
      } else if (diff.type === jdd.MISSING) {
        missingCount++;
      } else if (diff.type === jdd.TYPE) {
        typeCount++;
      }
    });

    var title = '<div class="reportTitle">Found ' + jdd.diffs.length + ' difference';
    if (jdd.diffs.length > 1) {
      title += 's';
    }
    title += '</div>';

    report.insertAdjacentHTML('afterbegin', title);

    var filterBlock = '<span class="filterBlock">Show:';

    /*
     * The missing checkbox
     */
    if (missingCount > 0) {
      var missing =
        '<label><input id="showMissing" type="checkbox" name="checkbox" value="value" checked="true">' +
        missingCount;
      if (missingCount === 1) {
        missing += ' missing property';
      } else {
        missing += ' missing properties';
      }
      filterBlock += missing + '</label>';
    }

    /*
     * The types checkbox
     */
    if (typeCount > 0) {
      var types =
        '<label><input id="showTypes" type="checkbox" name="checkbox" value="value" checked="true">' +
        typeCount +
        ' incorrect type';
      if (typeCount > 1) {
        types += 's';
      }
      filterBlock += types + '</label>';
    }

    /*
     * The equals checkbox
     */
    if (eqCount > 0) {
      var eq =
        '<label><input id="showEq" type="checkbox" name="checkbox" value="value" checked="true">' +
        eqCount +
        ' unequal value';
      if (eqCount > 1) {
        eq += 's';
      }
      filterBlock += eq + '</label>';
    }
    filterBlock += '</span>';
    report.insertAdjacentHTML('beforeend', filterBlock);

    // The missing checkbox event
    if (missingCount > 0) {
      const showMissingCheckbox = document.querySelector('#showMissing');
      showMissingCheckbox?.addEventListener('change', function (event: Event) {
        const target = event.target as HTMLInputElement;
        if (!target?.checked) {
          document.querySelectorAll('span.code.diff.missing').forEach(function (element) {
            element.classList.toggle('missing_off');
            element.classList.toggle('missing');
          });
        } else {
          document.querySelectorAll('span.code.diff.missing_off').forEach(function (element) {
            element.classList.toggle('missing');
            element.classList.toggle('missing_off');
          });
        }
      });
    }

    // The types checkbox event
    if (typeCount > 0) {
      const showTypesCheckbox = document.querySelector('#showTypes');
      showTypesCheckbox?.addEventListener('change', function (event: Event) {
        const target = event.target as HTMLInputElement;
        if (!target?.checked) {
          document.querySelectorAll('span.code.diff.type').forEach(function (element) {
            element.classList.toggle('type_off');
            element.classList.toggle('type');
          });
        } else {
          document.querySelectorAll('span.code.diff.type_off').forEach(function (element) {
            element.classList.toggle('type');
            element.classList.toggle('type_off');
          });
        }
      });
    }

    // The equals checkbox event
    if (eqCount > 0) {
      const showEqCheckbox = document.querySelector('#showEq');
      showEqCheckbox?.addEventListener('change', function (event: Event) {
        const target = event.target as HTMLInputElement;
        if (!target?.checked) {
          document.querySelectorAll('span.code.diff.eq').forEach(function (element) {
            element.classList.toggle('eq_off');
            element.classList.toggle('eq');
          });
        } else {
          document.querySelectorAll('span.code.diff.eq_off').forEach(function (element) {
            element.classList.toggle('eq');
            element.classList.toggle('eq_off');
          });
        }
      });
    }
  },

  /**
   * Implement the compare button and complete the compare process
   */
  compare(left: string, right: string, { container }: { container: HTMLElement }) {
    const leftView = document.createElement('pre');
    leftView.classList.add('codeBlock');
    leftView.classList.add('left');
    const leftConfig = jdd.createConfig();
    const leftData = JSON.parse(left) as JSONValue;
    jdd.formatAndDecorate(leftConfig, leftData);
    leftView.textContent = leftConfig.out;

    const rightView = document.createElement('pre');
    rightView.classList.add('codeBlock');
    rightView.classList.add('right');
    const rightConfig = jdd.createConfig();
    const rightData = JSON.parse(right) as JSONValue;

    container.appendChild(leftView);
    container.appendChild(rightView);

    jdd.formatAndDecorate(rightConfig, rightData);
    rightView.textContent = rightConfig.out;

    jdd.format([leftView, rightView]);

    leftConfig.currentPath = [];
    rightConfig.currentPath = [];

    jdd.diffVal(leftData, leftConfig, rightData, rightConfig);
    jdd.processDiffs();
    // jdd.generateReport();

    if (jdd.diffs.length > 0) {
      jdd.highlightDiff(0);
      jdd.currentDiff = 0;
    }
  },
};

export default jdd;
