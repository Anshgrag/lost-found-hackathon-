class TrieNode {
  children: { [key: string]: TrieNode } = {};
  isEndOfWord: boolean = false;
  itemIds: string[] = [];
}

export class Trie {
  root: TrieNode;

  constructor() {
    this.root = new TrieNode();
  }

  insert(word: string, itemId: string): void {
    let node = this.root;
    const normalizedWord = word.toLowerCase();
    for (const char of normalizedWord) {
      if (!node.children[char]) {
        node.children[char] = new TrieNode();
      }
      node = node.children[char];
    }
    node.isEndOfWord = true;
    if (!node.itemIds.includes(itemId)) {
      node.itemIds.push(itemId);
    }
  }

  search(prefix: string): string[] {
    let node = this.root;
    const normalizedPrefix = prefix.toLowerCase();
    for (const char of normalizedPrefix) {
      if (!node.children[char]) {
        return [];
      }
      node = node.children[char];
    }
    return this.collectAllIds(node);
  }

  private collectAllIds(node: TrieNode): string[] {
    let results: string[] = [...node.itemIds];
    for (const child in node.children) {
      results = results.concat(this.collectAllIds(node.children[child]));
    }
    return Array.from(new Set(results));
  }
}
