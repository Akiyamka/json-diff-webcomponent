type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

type DiffState = {
  out: string;
  indent: number;
  currentPath: string[];
  paths: { path: string; line: number }[];
  line: number;
};

// utilites
//
/**
 * Fixing typeof
 * takes value and returns type of value
 * @param  value
 * return typeof value
 */
function getType(value: unknown): string {
  if (
    function () {
      return value && value !== this;
    }.call(value)
  ) {
    //fallback on 'typeof' for truthy primitive values
    return typeof value;
  }
  return {}.toString
    .call(value)
    .match(/\s([a-z|A-Z]+)/)[1]
    .toLowerCase();
}

/**
 * The jdd object handles all of the functions for the main page.  It finds the diffs and manages
 * the interactions of displaying them.
 */
/*global jdd:true */
const jdd = {
  currentDiff: 0,
  LEFT: 'left',
  RIGHT: 'right',

  EQUALITY: 'eq',
  TYPE: 'type',
  MISSING: 'missing',
  diffs: [],
  SEPARATOR: '/',
  requestCount: 0,

  /**
   * Find the differences between the two objects and recurse into their sub objects.
   */
  findDiffs: function (config1: DiffState, data1: JSON, config2: DiffState, data2: JSON) {
    config1.currentPath.push(jdd.SEPARATOR);
    config2.currentPath.push(jdd.SEPARATOR);

    var key;
    // no un-used vars
    // var val;

    if (data1.length < data2.length) {
      /*
       * This means the second data has more properties than the first.
       * We need to find the extra ones and create diffs for them.
       */
      for (key in data2) {
        if (data2.hasOwnProperty(key)) {
          // no un-used vars
          // val = data1[key];
          if (!data1.hasOwnProperty(key)) {
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
    }

    /*
     * Now we're going to look for all the properties in object one and
     * compare them to object two
     */
    for (key in data1) {
      if (data1.hasOwnProperty(key)) {
        // no un-used vars
        // val = data1[key];

        config1.currentPath.push(key.replace(jdd.SEPARATOR, '#'));
        if (!data2.hasOwnProperty(key)) {
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

          jdd.diffVal(data1[key], config1, data2[key], config2);
          config2.currentPath.pop();
        }
        config1.currentPath.pop();
      }
    }

    config1.currentPath.pop();
    config2.currentPath.pop();

    /*
     * Now we want to look at all the properties in object two that
     * weren't in object one and generate diffs for them.
     */
    for (key in data2) {
      if (data2.hasOwnProperty(key)) {
        // no un-used vars
        // val = data1[key];

        if (!data1.hasOwnProperty(key)) {
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
    }
  },

  /**
   * Generate the differences between two values.  This handles differences of object
   * types and actual values.
   */
  diffVal(left: JSON, leftConfig: DiffState, right: JSON, rightConfig: DiffState) {
    if (getType(left) === 'array') {
      jdd.diffArray(left, leftConfig, right, rightConfig);
    } else if (getType(left) === 'object') {
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
            jdd.EQUALITY
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
            jdd.EQUALITY
          )
        );
      }
    } else if (getType(left) === 'boolean') {
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
  diffArray: function (val1, config1, val2, config2) {
    if (getType(val2) !== 'array') {
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
    val1.forEach(function (arrayVal, index) {
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
  diffBool: function (val1, config1, val2, config2) {
    if (getType(val2) !== 'boolean') {
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
            jdd.EQUALITY
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
            jdd.EQUALITY
          )
        );
      }
    }
  },

  /**
   * Format the object into the output stream and decorate the data tree with
   * the data about this object.
   */
  formatAndDecorate(config: DiffState, data: JSON) {
    if (getType(data) === 'array') {
      jdd.formatAndDecorateArray(config, data);
      return;
    }

    jdd.startObject(config);
    config.currentPath.push(jdd.SEPARATOR);

    const props = jdd.getSortedProperties(data);

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
  formatVal: function (val, config) {
    if (getType(val) === 'array') {
      config.out += '[';

      config.indent++;
      val.forEach(function (arrayVal, index) {
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
    } else if (getType(val) === 'object') {
      jdd.formatAndDecorate(config, val);
    } else if (getType(val) === 'string') {
      config.out += '"' + jdd.unescapeString(val) + '",';
    } else if (getType(val) === 'number') {
      config.out += val + ',';
    } else if (getType(val) === 'boolean') {
      config.out += val + ',';
    } else if (getType(val) === 'null') {
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
  generateDiff: function (config1, path1, config2, path2, /*String*/ msg, type) {
    if (path1 !== jdd.SEPARATOR && path1.charAt(path1.length - 1) === jdd.SEPARATOR) {
      path1 = path1.substring(0, path1.length - 1);
    }

    if (path2 !== jdd.SEPARATOR && path2.charAt(path2.length - 1) === jdd.SEPARATOR) {
      path2 = path2.substring(0, path2.length - 1);
    }
    var pathObj1 = config1.paths.find(function (path) {
      return path.path === path1;
    });
    var pathObj2 = config2.paths.find(function (path) {
      return path.path === path2;
    });

    if (!pathObj1) {
      throw 'Unable to find line number for (' + msg + '): ' + path1;
    }

    if (!pathObj2) {
      throw 'Unable to find line number for (' + msg + '): ' + path2;
    }

    return {
      path1: pathObj1,
      path2: pathObj2,
      type: type,
      msg: msg,
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
      if (side === jdd.LEFT) {
        return line === diff.path1.line;
      } else if (side === jdd.RIGHT) {
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
      document
        .querySelector('pre.left div.line' + diff.path1.line + ' span.code')
        .classList.add('selected');
      document
        .querySelector('pre.right div.line' + diff.path2.line + ' span.code')
        .classList.add('selected');
    });

    if (side === jdd.LEFT || side === jdd.RIGHT) {
      jdd.currentDiff = jdd.diffs.findIndex(function (diff) {
        return diff.path1.line === line;
      });
    }

    if (jdd.currentDiff === -1) {
      jdd.currentDiff = jdd.diffs.findIndex(function (diff) {
        return diff.path2.line === line;
      });
    }


    jdd.showDiffDetails(diffs);
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
    jdd.handleDiffClick(jdd.diffs[index].path1.line, jdd.BOTH);
  },

  /**
   * Show the details of the specified diff
   */
  showDiffDetails: function (diffs) {
    diffs.forEach(function (diff, index) {
      var li = '<li>' + diff.msg + '</li>';
    });
  },

  /**
   * Scroll the specified diff to be visible
   */
  scrollToDiff: function (diff) {
    var elementOffsetTop =
      document
        .querySelector('pre.left div.line' + diff.path1.line + ' span.code')
        .getBoundingClientRect().top +
      window.scrollY -
      document.documentElement.clientTop;
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
    const left = [];
    const right = [];

    // Cache the lines for fast lookup
    const leftLineLookup = {};
    const rightLineLookup = {};

    // We can use the index to save lookup up the parents class
    document.querySelectorAll('pre.left span.code').forEach((val, index) => {
      leftLineLookup[index + 1] = val;
    });

    document.querySelectorAll('pre.right span.code').forEach((val, index) => {
      rightLineLookup[index + 1] = val;
    });

    jdd.diffs.forEach(function (diff) {
      leftLineLookup[diff.path1.line].classList.add(diff.type, 'diff');
      if (left.indexOf(diff.path1.line) === -1) {
        leftLineLookup[diff.path1.line].addEventListener('click', function () {
          jdd.handleDiffClick(diff.path1.line, jdd.LEFT);
        });
        left.push(diff.path1.line);
      }

      rightLineLookup[diff.path2.line].classList.add(diff.type, 'diff');
      if (right.indexOf(diff.path2.line) === -1) {
        rightLineLookup[diff.path2.line].addEventListener('click', function () {
          jdd.handleDiffClick(diff.path2.line, jdd.RIGHT);
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
  validateInput: function (json) {
    try {
      jsl.parser.parse(json);
      return true;
    } catch (parseException) {
      return false;
    }
  },

  /**
   * Handle the file uploads
   */
  handleFiles: function (files, side) {
    var reader = new FileReader();

    reader.onload = (function () {
      return function (event) {
        if (side === jdd.LEFT) {
          document.getElementById('textarealeft').value = event.target.result;
        } else {
          document.getElementById('textarearight').value = event.target.result;
        }
      };
    })(files[0]);

    reader.readAsText(files[0]);
  },

  setupNewDiff: function () {
    document.querySelector('.initContainer').style.display = 'block';
    document.querySelector('.diffcontainer').style.display = 'none';
    document.querySelectorAll('.diffcontainer pre').forEach(function (elem) {
      elem.replaceChildren();
    });
    document.querySelector('.toolbar').replaceChildren();
  },

  /**
   * Generate the report section with the diff
   */
  generateReport: function () {
    var report = document.getElementById('report');

    report.replaceChildren();

    report.insertAdjacentHTML('beforeend', '<button>Perform a new diff</button>');
    // TODO: add a class/id name to button and use that to select and add event
    report.querySelector('button').addEventListener('click', function () {
      jdd.setupNewDiff();
    });

    if (jdd.diffs.length === 0) {
      report.insertAdjacentHTML(
        'beforeend',
        '<span>The two files were semantically  identical.</span>'
      );
      return;
    }

    var typeCount = 0;
    var eqCount = 0;
    var missingCount = 0;
    jdd.diffs.forEach(function (diff) {
      if (diff.type === jdd.EQUALITY) {
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
      document.querySelector('#showMissing').addEventListener('change', function (event) {
        if (!event.target.checked) {
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
      document.querySelector('#showTypes').addEventListener('change', function (event) {
        if (!event.target.checked) {
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
      document.querySelector('#showEq').addEventListener('change', function (event) {
        if (!event.target.checked) {
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
    const leftData = JSON.parse(left) as JSON;
    jdd.formatAndDecorate(leftConfig, leftData);
    leftView.textContent = leftConfig.out;

    const rightView = document.createElement('pre');
    rightView.classList.add('codeBlock');
    rightView.classList.add('right');
    const rightConfig = jdd.createConfig();
    const rightData = JSON.parse(right) as JSON;

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
