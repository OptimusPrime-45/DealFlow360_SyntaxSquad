/**
 * High-Performance Client-Side B-Tree & Multi-Attribute Search Index
 * 
 * Implements a classic B-Tree data structure (order/degree t) for O(log N)
 * exact lookups, prefix searches, and numeric range filtering.
 */

export class BTreeNode {
  constructor(isLeaf = true) {
    this.keys = [];       // Array of comparable keys (string or number)
    this.values = [];     // Array of Sets containing item references/IDs for each key
    this.children = [];   // Array of child BTreeNode references
    this.isLeaf = isLeaf;
  }
}

export class BTree {
  /**
   * @param {number} t - Minimum degree (default t = 3, max keys = 2t - 1 = 5)
   */
  constructor(t = 3) {
    if (t < 2) throw new Error("B-Tree degree t must be >= 2");
    this.t = t;
    this.root = new BTreeNode(true);
  }

  /**
   * Insert a key and an associated item into the B-Tree.
   * If the key already exists, item is added to the key's value Set.
   */
  insert(key, item) {
    const root = this.root;
    // If root is full, tree grows in height
    if (root.keys.length === 2 * this.t - 1) {
      const newRoot = new BTreeNode(false);
      newRoot.children.push(this.root);
      this._splitChild(newRoot, 0);
      this.root = newRoot;
      this._insertNonFull(newRoot, key, item);
    } else {
      this._insertNonFull(root, key, item);
    }
  }

  _insertNonFull(node, key, item) {
    let i = node.keys.length - 1;

    // Check if key already exists in this node
    const existingIndex = node.keys.indexOf(key);
    if (existingIndex !== -1) {
      node.values[existingIndex].add(item);
      return;
    }

    if (node.isLeaf) {
      // Find position to insert key in sorted order
      while (i >= 0 && key < node.keys[i]) {
        i--;
      }
      node.keys.splice(i + 1, 0, key);
      node.values.splice(i + 1, 0, new Set([item]));
    } else {
      while (i >= 0 && key < node.keys[i]) {
        i--;
      }
      i++;
      if (node.children[i].keys.length === 2 * this.t - 1) {
        this._splitChild(node, i);
        if (key === node.keys[i]) {
          node.values[i].add(item);
          return;
        }
        if (key > node.keys[i]) {
          i++;
        }
      }
      this._insertNonFull(node.children[i], key, item);
    }
  }

  _splitChild(parent, index) {
    const t = this.t;
    const fullChild = parent.children[index];
    const newChild = new BTreeNode(fullChild.isLeaf);

    // Median key to be promoted to parent
    const medianKey = fullChild.keys[t - 1];
    const medianValues = fullChild.values[t - 1];

    // Give right half of keys and values to newChild
    newChild.keys = fullChild.keys.slice(t);
    newChild.values = fullChild.values.slice(t);

    if (!fullChild.isLeaf) {
      newChild.children = fullChild.children.slice(t);
      fullChild.children = fullChild.children.slice(0, t);
    }

    // Shrink fullChild to left half
    fullChild.keys = fullChild.keys.slice(0, t - 1);
    fullChild.values = fullChild.values.slice(0, t - 1);

    // Insert median key into parent
    parent.children.splice(index + 1, 0, newChild);
    parent.keys.splice(index, 0, medianKey);
    parent.values.splice(index, 0, medianValues);
  }

  /**
   * Exact search for a key. Returns array of matched items or empty array.
   */
  search(key) {
    return this._searchNode(this.root, key);
  }

  _searchNode(node, key) {
    let i = 0;
    while (i < node.keys.length && key > node.keys[i]) {
      i++;
    }
    if (i < node.keys.length && key === node.keys[i]) {
      return Array.from(node.values[i]);
    }
    if (node.isLeaf) {
      return [];
    }
    return this._searchNode(node.children[i], key);
  }

  /**
   * Prefix search: Returns all items whose keys start with `prefix`.
   * Useful for autocomplete & live incremental search.
   */
  searchPrefix(prefix) {
    const results = new Set();
    if (typeof prefix !== "string" || prefix.length === 0) return [];
    this._traversePrefix(this.root, prefix.toLowerCase(), results);
    return Array.from(results);
  }

  _traversePrefix(node, prefix, results) {
    for (let i = 0; i < node.keys.length; i++) {
      const keyStr = String(node.keys[i]).toLowerCase();
      if (keyStr.startsWith(prefix) || keyStr.includes(prefix)) {
        node.values[i].forEach((item) => results.add(item));
      }
      if (!node.isLeaf) {
        this._traversePrefix(node.children[i], prefix, results);
      }
    }
    if (!node.isLeaf && node.children.length > node.keys.length) {
      this._traversePrefix(node.children[node.keys.length], prefix, results);
    }
  }

  /**
   * Range search: Returns all items whose keys are between min and max (inclusive).
   * O(log N + K) time complexity.
   */
  searchRange(min = -Infinity, max = Infinity) {
    const results = new Set();
    this._traverseRange(this.root, min, max, results);
    return Array.from(results);
  }

  _traverseRange(node, min, max, results) {
    let i = 0;
    while (i < node.keys.length) {
      if (!node.isLeaf && node.keys[i] >= min) {
        this._traverseRange(node.children[i], min, max, results);
      }
      if (node.keys[i] >= min && node.keys[i] <= max) {
        node.values[i].forEach((item) => results.add(item));
      }
      if (node.keys[i] > max) {
        break;
      }
      i++;
    }
    if (!node.isLeaf && i < node.children.length && (i === 0 || node.keys[i - 1] <= max)) {
      this._traverseRange(node.children[i], min, max, results);
    }
  }
}

/**
 * Multi-Attribute B-Tree Search Index
 * 
 * Tokenizes text across multiple record fields and indexes numbers into B-Trees
 * for instantaneous zero-latency client queries.
 */
export class BTreeSearchIndex {
  /**
   * @param {Object} options
   * @param {string[]} options.textFields - Fields to tokenize into text B-Tree
   * @param {string[]} options.numericFields - Fields to index into numeric range B-Trees
   */
  constructor({ textFields = [], numericFields = [] } = {}) {
    this.textFields = textFields;
    this.numericFields = numericFields;
    this.textTree = new BTree(4);
    this.numericTrees = new Map();
    this.numericFields.forEach((f) => this.numericTrees.set(f, new BTree(4)));
    this.items = [];
    this.itemMap = new Map();
  }

  /**
   * Ingest and index an array of records.
   */
  build(items = []) {
    this.items = items;
    this.textTree = new BTree(4);
    this.numericTrees.clear();
    this.numericFields.forEach((f) => this.numericTrees.set(f, new BTree(4)));
    this.itemMap.clear();

    items.forEach((item, index) => {
      const id = item.id || `item_${index}`;
      this.itemMap.set(id, item);

      // Index text tokens
      const tokens = new Set();
      this.textFields.forEach((field) => {
        const val = this._getNestedValue(item, field);
        if (val !== null && val !== undefined) {
          const str = String(val).toLowerCase();
          // Tokenize into words and sub-tokens
          str.split(/[\s,._\-/]+/).forEach((word) => {
            const cleaned = word.trim();
            if (cleaned.length >= 1) tokens.add(cleaned);
          });
          // Also index the full string for exact matches (e.g. "QT-2026-0001")
          tokens.add(str.trim());
        }
      });

      tokens.forEach((token) => {
        this.textTree.insert(token, id);
      });

      // Index numeric fields
      this.numericFields.forEach((field) => {
        const numVal = Number(this._getNestedValue(item, field));
        if (!isNaN(numVal)) {
          const tree = this.numericTrees.get(field);
          if (tree) tree.insert(numVal, id);
        }
      });
    });
  }

  /**
   * Insert a record directly into the B-Tree search index.
   * @param {string|number} id - Record identifier
   * @param {Object} fields - Field key-value pairs to index
   */
  insertRecord(id, fields = {}) {
    this.itemMap.set(id, { id, ...fields });
    if (!this.items.some((it) => it.id === id)) {
      this.items.push({ id, ...fields });
    }

    const tokens = new Set();
    Object.values(fields).forEach((val) => {
      if (val !== null && val !== undefined) {
        const str = String(val).toLowerCase();
        str.split(/[\s,._\-/]+/).forEach((word) => {
          const cleaned = word.trim();
          if (cleaned.length >= 1) tokens.add(cleaned);
        });
        tokens.add(str.trim());
      }
    });

    tokens.forEach((token) => {
      this.textTree.insert(token, id);
    });
  }

  _getNestedValue(obj, path) {
    if (!obj || !path) return undefined;
    const parts = path.split(".");
    let current = obj;
    for (const p of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[p];
    }
    return current;
  }

  /**
   * Query the index with text search, exact categorical filters, and numeric ranges.
   * Can be called with:
   * 1. A string: `index.query("search term")` -> returns Set<id>
   * 2. An options object: `index.query({ search, filters, ranges })` -> returns Array<item>
   * 
   * @param {string|Object} queryOptions
   * @returns {Set<string>|Array<Object>}
   */
  query(queryOptions = {}) {
    // If called with a string search term, return Set of matching IDs
    if (typeof queryOptions === "string") {
      const trimmed = queryOptions.trim().toLowerCase();
      if (!trimmed) return new Set(this.items.map((it) => it.id));

      let candidateIds = null;
      const searchTokens = trimmed.split(/\s+/).filter(Boolean);
      for (const token of searchTokens) {
        const matches = this.textTree.searchPrefix(token);
        const tokenMatchSet = new Set(matches);
        if (candidateIds === null) {
          candidateIds = tokenMatchSet;
        } else {
          candidateIds = new Set([...candidateIds].filter((id) => tokenMatchSet.has(id)));
        }
        if (candidateIds.size === 0) break;
      }
      return candidateIds || new Set();
    }

    const { search = "", filters = {}, ranges = {} } = queryOptions;
    if (!this.items.length) return [];

    let candidateIds = null;

    // 1. Text Search via B-Tree Prefix Lookups
    const trimmedSearch = (search || "").trim().toLowerCase();
    if (trimmedSearch) {
      const searchTokens = trimmedSearch.split(/\s+/).filter(Boolean);
      for (const token of searchTokens) {
        const matches = this.textTree.searchPrefix(token);
        const tokenMatchSet = new Set(matches);
        if (candidateIds === null) {
          candidateIds = tokenMatchSet;
        } else {
          // Set Intersection
          candidateIds = new Set([...candidateIds].filter((id) => tokenMatchSet.has(id)));
        }
        if (candidateIds.size === 0) break;
      }
    }

    // 2. Numeric Ranges via Numeric B-Trees
    for (const [field, range] of Object.entries(ranges || {})) {
      if (range && (range.min !== undefined || range.max !== undefined)) {
        const tree = this.numericTrees.get(field);
        if (tree) {
          const min = range.min !== undefined && range.min !== "" ? Number(range.min) : -Infinity;
          const max = range.max !== undefined && range.max !== "" ? Number(range.max) : Infinity;
          const rangeMatches = new Set(tree.searchRange(min, max));
          if (candidateIds === null) {
            candidateIds = rangeMatches;
          } else {
            candidateIds = new Set([...candidateIds].filter((id) => rangeMatches.has(id)));
          }
        }
      }
    }

    // Convert candidates to items (or use all items if no B-Tree filters were applied)
    let filteredItems = candidateIds !== null
      ? Array.from(candidateIds).map((id) => this.itemMap.get(id)).filter(Boolean)
      : [...this.items];

    // 3. Exact categorical filters
    for (const [key, val] of Object.entries(filters || {})) {
      if (val !== undefined && val !== null && val !== "" && val !== "ALL") {
        if (Array.isArray(val) && val.length > 0) {
          filteredItems = filteredItems.filter((item) => {
            const itemVal = this._getNestedValue(item, key);
            return val.includes(itemVal);
          });
        } else {
          filteredItems = filteredItems.filter((item) => {
            const itemVal = this._getNestedValue(item, key);
            return String(itemVal) === String(val);
          });
        }
      }
    }

    return filteredItems;
  }
}
