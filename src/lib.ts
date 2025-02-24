import { Diff, DiffState, DiffType, JSONValue } from './diffTypes';

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

export class Differ {
  currentDiff = 0;
  diffs = new Array<Diff>();
  SEPARATOR = '/';
  requestCount = 0;
  container?: HTMLElement;

  constructor() {}

  generateDiff(
    config1: DiffState,
    path1: string,
    config2: DiffState,
    path2: string,
    msg: string,
    type: DiffType
  ): Diff {
    const normalizedPath1 =
      path1 !== this.SEPARATOR && path1.charAt(path1.length - 1) === this.SEPARATOR
        ? path1.substring(0, path1.length - 1)
        : path1;

    const normalizedPath2 =
      path2 !== this.SEPARATOR && path2.charAt(path2.length - 1) === this.SEPARATOR
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
  }

  /**
   * Generate a JSON path based on the specific configuration and an optional property.
   */
  generatePath(config: DiffState, prop?: string) {
    let s = '';
    config.currentPath.forEach((path) => {
      s += path;
    });

    if (prop) {
      s += this.SEPARATOR + prop.replace(this.SEPARATOR, '#');
    }

    if (s.length === 0) {
      return this.SEPARATOR;
    } else {
      return s;
    }
  }

  /**
   * Arrays are more complex because we need to recurse into them and handle different length
   * issues so we handle them specially in this function.
   */
  diffArray(val1: JSONValue[], config1: DiffState, val2: JSONValue[], config2: DiffState) {
    if (!Array.isArray(val2)) {
      this.diffs.push(
        this.generateDiff(
          config1,
          this.generatePath(config1),
          config2,
          this.generatePath(config2),
          'Both types should be arrays',
          DiffType.TYPE
        )
      );
      return;
    }

    if (val1.length < val2.length) {
      /*
       * Then there were more elements on the right side and we need to
       * generate those differences.
       */
      for (let i = val1.length; i < val2.length; i++) {
        this.diffs.push(
          this.generateDiff(
            config1,
            this.generatePath(config1),
            config2,
            this.generatePath(config2, '[' + i + ']'),
            'Missing element <code>' + i + '</code> from the array on the left side',
            DiffType.MISSING
          )
        );
      }
    }
    val1.forEach((_, index) => {
      if (val2.length <= index) {
        this.diffs.push(
          this.generateDiff(
            config1,
            this.generatePath(config1, '[' + index + ']'),
            config2,
            this.generatePath(config2),
            'Missing element <code>' + index + '</code> from the array on the right side',
            DiffType.MISSING
          )
        );
      } else {
        config1.currentPath.push(this.SEPARATOR + '[' + index + ']');
        config2.currentPath.push(this.SEPARATOR + '[' + index + ']');

        if (getType(val2) === 'array') {
          /*
           * If both sides are arrays then we want to diff them.
           */
          this.diffVal(val1[index], config1, val2[index], config2);
        }
        config1.currentPath.pop();
        config2.currentPath.pop();
      }
    });
  }

  /**
   * We handle boolean values specially because we can show a nicer message for them.
   */
  diffBool(val1: boolean, config1: DiffState, val2: JSONValue, config2: DiffState) {
    if (typeof val2 !== 'boolean') {
      this.diffs.push(
        this.generateDiff(
          config1,
          this.generatePath(config1),
          config2,
          this.generatePath(config2),
          'Both types should be booleans',
          DiffType.TYPE
        )
      );
    } else if (val1 !== val2) {
      if (val1) {
        this.diffs.push(
          this.generateDiff(
            config1,
            this.generatePath(config1),
            config2,
            this.generatePath(config2),
            'The left side is <code>true</code> and the right side is <code>false</code>',
            DiffType.EQUALITY
          )
        );
      } else {
        this.diffs.push(
          this.generateDiff(
            config1,
            this.generatePath(config1),
            config2,
            this.generatePath(config2),
            'The left side is <code>false</code> and the right side is <code>true</code>',
            DiffType.EQUALITY
          )
        );
      }
    }
  }

  findDiffs(
    leftConfig: DiffState,
    leftData: JSONValue,
    rightConfig: DiffState,
    rightData: JSONValue
  ) {
    leftConfig.currentPath.push(this.SEPARATOR);
    rightConfig.currentPath.push(this.SEPARATOR);
    if (
      typeof leftData !== 'object' ||
      leftData === null ||
      Array.isArray(leftData) ||
      typeof rightData !== 'object' ||
      rightData === null ||
      Array.isArray(rightData)
    ) {
      return;
    }

    const leftObj = leftData as { [key: string]: JSONValue };
    const rightObj = rightData as { [key: string]: JSONValue };

    const leftKeys = Object.keys(leftObj);
    const rightKeys = Object.keys(rightObj);

    if (leftKeys.length < rightKeys.length) {
      /*
       * This means the second data has more properties than the first.
       * We need to find the extra ones and create diffs for them.
       */
      for (const rightKey of rightKeys) {
        if (!(rightKey in leftObj)) {
          this.diffs.push(
            this.generateDiff(
              leftConfig,
              this.generatePath(leftConfig),
              rightConfig,
              this.generatePath(rightConfig, this.SEPARATOR + rightKey),
              'The right side of this object has more items than the left side',
              DiffType.MISSING
            )
          );
        }
      }
    }

    /*
     * Now we're going to look for all the properties in object one and
     * compare them to object two
     */
    for (const leftKey of leftKeys) {
      leftConfig.currentPath.push(leftKey.replace(this.SEPARATOR, '#'));
      if (!(leftKey in rightObj)) {
        /*
         * This means that the first data has a property which
         * isn't present in the second data
         */
        this.diffs.push(
          this.generateDiff(
            leftConfig,
            this.generatePath(leftConfig),
            rightConfig,
            this.generatePath(rightConfig),
            'Missing property <code>' + leftKey + '</code> from the object on the right side',
            DiffType.MISSING
          )
        );
      } else {
        rightConfig.currentPath.push(leftKey.replace(this.SEPARATOR, '#'));
        this.diffVal(leftObj[leftKey], leftConfig, rightObj[leftKey], rightConfig);
        rightConfig.currentPath.pop();
      }
      leftConfig.currentPath.pop();
    }

    leftConfig.currentPath.pop();
    rightConfig.currentPath.pop();

    /*
     * Now we want to look at all the properties in object two that
     * weren't in object one and generate diffs for them.
     */
    for (const rightKey of rightKeys) {
      if (!(rightKey in leftObj)) {
        this.diffs.push(
          this.generateDiff(
            leftConfig,
            this.generatePath(leftConfig),
            rightConfig,
            this.generatePath(rightConfig, rightKey),
            'Missing property <code>' + rightKey + '</code> from the object on the left side',
            DiffType.MISSING
          )
        );
      }
    }
  }

  /**
   * Generate the differences between two values.  This handles differences of object
   * types and actual values.
   */
  diffVal(left: JSONValue, leftConfig: DiffState, right: JSONValue, rightConfig: DiffState) {
    if (Array.isArray(left)) {
      if (Array.isArray(right)) {
        this.diffArray(left, leftConfig, right, rightConfig);
      } else {
        this.diffs.push(
          this.generateDiff(
            leftConfig,
            this.generatePath(leftConfig),
            rightConfig,
            this.generatePath(rightConfig),
            'Both types should be arrays',
            DiffType.TYPE
          )
        );
      }
    } else if (typeof left === 'object' && left !== null && !Array.isArray(left)) {
      if (['array', 'string', 'number', 'boolean', 'null'].indexOf(getType(right)) > -1) {
        this.diffs.push(
          this.generateDiff(
            leftConfig,
            this.generatePath(leftConfig),
            rightConfig,
            this.generatePath(rightConfig),
            'Both types should be objects',
            DiffType.TYPE
          )
        );
      } else {
        this.findDiffs(leftConfig, left, rightConfig, right);
      }
    } else if (getType(left) === 'string') {
      if (getType(right) !== 'string') {
        this.diffs.push(
          this.generateDiff(
            leftConfig,
            this.generatePath(leftConfig),
            rightConfig,
            this.generatePath(rightConfig),
            'Both types should be strings',
            DiffType.TYPE
          )
        );
      } else if (left !== right) {
        this.diffs.push(
          this.generateDiff(
            leftConfig,
            this.generatePath(leftConfig),
            rightConfig,
            this.generatePath(rightConfig),
            'Both sides should be equal strings',
            DiffType.EQUALITY
          )
        );
      }
    } else if (getType(left) === 'number') {
      if (getType(right) !== 'number') {
        this.diffs.push(
          this.generateDiff(
            leftConfig,
            this.generatePath(leftConfig),
            rightConfig,
            this.generatePath(rightConfig),
            'Both types should be numbers',
            DiffType.TYPE
          )
        );
      } else if (left !== right) {
        this.diffs.push(
          this.generateDiff(
            leftConfig,
            this.generatePath(leftConfig),
            rightConfig,
            this.generatePath(rightConfig),
            'Both sides should be equal numbers',
            DiffType.EQUALITY
          )
        );
      }
    } else if (typeof left === 'boolean') {
      this.diffBool(left, leftConfig, right, rightConfig);
    } else if (getType(left) === 'null' && getType(right) !== 'null') {
      this.diffs.push(
        this.generateDiff(
          leftConfig,
          this.generatePath(leftConfig),
          rightConfig,
          this.generatePath(rightConfig),
          'Both types should be nulls',
          DiffType.TYPE
        )
      );
    }
  }

  createConfig(): DiffState {
    return {
      out: '',
      indent: -1,
      currentPath: [],
      paths: [],
      line: 1,
    };
  }

  startArray(config: DiffState) {
    config.indent++;
    config.out += '[';

    if (config.paths.length === 0) {
      /*
       * Then we are at the top of the array and we want to add
       * a path for it.
       */
      config.paths.push({
        path: this.generatePath(config),
        line: config.line,
      });
    }

    if (config.indent === 0) {
      config.indent++;
    }
  }

  newLine(config: DiffState) {
    config.line++;
    return '\n';
  }

  getTabs(indent: number) {
    let s = '';
    for (let i = 0; i < indent; i++) {
      s += '    ';
    }
    return s;
  }

  removeTrailingComma(config: DiffState) {
    if (config.out.charAt(config.out.length - 1) === ',') {
      config.out = config.out.substring(0, config.out.length - 1);
    }
  }

  finishArray(config: DiffState) {
    if (config.indent === 0) {
      config.indent--;
    }

    this.removeTrailingComma(config);

    config.indent--;
    config.out += this.newLine(config) + this.getTabs(config.indent) + ']';
    if (config.indent !== 0) {
      config.out += ',';
    } else {
      config.out += this.newLine(config);
    }
  }

  formatVal(val: JSONValue, config: DiffState) {
    if (Array.isArray(val)) {
      config.out += '[';

      config.indent++;
      val.forEach((arrayVal: JSONValue, index: number) => {
        config.out += this.newLine(config) + this.getTabs(config.indent);
        config.paths.push({
          path: this.generatePath(config, '[' + index + ']'),
          line: config.line,
        });

        config.currentPath.push(this.SEPARATOR + '[' + index + ']');
        this.formatVal(arrayVal, config);
        config.currentPath.pop();
      });
      this.removeTrailingComma(config);
      config.indent--;

      config.out += this.newLine(config) + this.getTabs(config.indent) + ']' + ',';
    } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      this.formatAndDecorate(config, val);
    } else if (typeof val === 'string') {
      config.out += '"' + this.unescapeString(val) + '",';
    } else if (typeof val === 'number') {
      config.out += val + ',';
    } else if (typeof val === 'boolean') {
      config.out += val + ',';
    } else if (val === null) {
      config.out += 'null,';
    }
  }

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
  unescapeString(val: string) {
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
  }

  formatAndDecorateArray(config: DiffState, data: JSONValue[]) {
    this.startArray(config);

    /*
     * If the first set has more than the second then we will catch it
     * when we compare values.  However, if the second has more then
     * we need to catch that here.
     */
    data.forEach((arrayVal, index) => {
      config.out += this.newLine(config) + this.getTabs(config.indent);
      config.paths.push({
        path: this.generatePath(config, '[' + index + ']'),
        line: config.line,
      });

      config.currentPath.push(this.SEPARATOR + '[' + index + ']');
      this.formatVal(arrayVal, config);
      config.currentPath.pop();
    });

    this.finishArray(config);
    config.currentPath.pop();
  }

  startObject(config: DiffState) {
    config.indent++;
    config.out += '{';

    if (config.paths.length === 0) {
      /*
       * Then we are at the top of the object and we want to add
       * a path for it.
       */
      config.paths.push({
        path: this.generatePath(config),
        line: config.line,
      });
    }

    if (config.indent === 0) {
      config.indent++;
    }
  }

  /**
   * Sort all the relevant properties and return them in an alphabetical sort by property key
   */
  getSortedProperties(obj: object) {
    const props = Object.keys(obj).sort((a, b) => a.localeCompare(b));
    return props;
  }

  finishObject(config: DiffState) {
    if (config.indent === 0) {
      config.indent--;
    }

    this.removeTrailingComma(config);

    config.indent--;
    config.out += this.newLine(config) + this.getTabs(config.indent) + '}';
    if (config.indent !== 0) {
      config.out += ',';
    } else {
      config.out += this.newLine(config);
    }
  }

  formatAndDecorate(config: DiffState, data: JSONValue) {
    if (Array.isArray(data)) {
      this.formatAndDecorateArray(config, data);
      return;
    }

    if (typeof data !== 'object' || data === null) {
      return;
    }

    this.startObject(config);
    config.currentPath.push(this.SEPARATOR);

    const props = this.getSortedProperties(data as Record<string, JSONValue>);

    /*
     * If the first set has more than the second then we will catch it
     * when we compare values.  However, if the second has more then
     * we need to catch that here.
     */
    props.forEach((key) => {
      config.out +=
        this.newLine(config) + this.getTabs(config.indent) + '"' + this.unescapeString(key) + '": ';
      config.currentPath.push(key.replace(this.SEPARATOR, '#'));
      config.paths.push({
        path: this.generatePath(config),
        line: config.line,
      });
      this.formatVal(data[key], config);
      config.currentPath.pop();
    });

    this.finishObject(config);
    config.currentPath.pop();
  }

  format(views: HTMLPreElement[]) {
    views.forEach((pre) => {
      let lineNumbers = '<div class="gutter">';
      let codeLines = '<div class="workspace">';
      // This is used to encode text as fast as possible
      const lineDiv = document.createElement('div');
      const lineText = document.createTextNode('');
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
        '" class="' +
        pre.classList.toString() +
        '">' +
        lineNumbers +
        codeLines +
        '</pre>';
    });
  }

  processDiffs() {
    const container = this.container;
    if (!container) throw new Error('Missing container');
    const left: number[] = [];
    const right: number[] = [];

    // Cache the lines for fast lookup
    const leftLineLookup: Record<number, Element> = {};
    const rightLineLookup: Record<number, Element> = {};

    // We can use the index to save lookup up the parents class

    container.querySelectorAll('pre.left span.code').forEach((val, index) => {
      leftLineLookup[index + 1] = val;
    });

    container.querySelectorAll('pre.right span.code').forEach((val, index) => {
      rightLineLookup[index + 1] = val;
    });

    if (!leftLineLookup || !rightLineLookup) {
      return;
    }

    this.diffs.forEach((diff) => {
      leftLineLookup[diff.path1.line].classList.add(diff.type, 'diff');
      if (left.indexOf(diff.path1.line) === -1) {
        left.push(diff.path1.line);
      }

      rightLineLookup[diff.path2.line].classList.add(diff.type, 'diff');
      if (right.indexOf(diff.path2.line) === -1) {
        right.push(diff.path2.line);
      }
    });

    this.diffs = this.diffs.sort((a, b) => {
      return a.path1.line - b.path1.line;
    });
  }
  public compare(left: string, right: string, { container }: { container: HTMLElement }) {
    const leftView = document.createElement('pre');
    leftView.classList.add('codeBlock');
    leftView.classList.add('left');
    const leftConfig = this.createConfig();
    const leftData = JSON.parse(left) as JSONValue;
    this.formatAndDecorate(leftConfig, leftData);
    leftView.textContent = leftConfig.out;

    const rightView = document.createElement('pre');
    rightView.classList.add('codeBlock');
    rightView.classList.add('right');
    const rightConfig = this.createConfig();
    const rightData = JSON.parse(right) as JSONValue;

    container.appendChild(leftView);
    container.appendChild(rightView);

    this.container = container;

    this.formatAndDecorate(rightConfig, rightData);
    rightView.textContent = rightConfig.out;

    this.format([leftView, rightView]);

    leftConfig.currentPath = [];
    rightConfig.currentPath = [];

    this.diffVal(leftData, leftConfig, rightData, rightConfig);
    this.processDiffs();

    if (this.diffs.length > 0) {
      this.currentDiff = 0;
    }
  }
}
