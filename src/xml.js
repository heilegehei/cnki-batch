/**
 * Minimal dependency-free XML parser.
 *
 * Why this exists: regex tag extraction is unsafe on PubMed XML because the
 * same tag name appears at several depths. <ArticleIdList> occurs both for the
 * article itself and inside every <Reference> entry, so a non-greedy regex for
 * it matched the reference list and harvested the DOIs of cited works instead
 * of the article's own DOI (98 hits across a 3-article response).
 *
 * Scope: elements, attributes, text, CDATA, comments, the XML declaration and
 * DOCTYPE. No namespace resolution, entity definitions or DTD handling beyond
 * the five predefined entities - which is everything E-utilities output needs.
 */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(s) {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x?[0-9A-Fa-f]+|[A-Za-z]+);/g, (m, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, body) ? ENTITIES[body] : m;
  });
}

function parseAttributes(text) {
  const attrs = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(text))) {
    attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? "");
  }
  return attrs;
}

/**
 * Parse an XML document into a lightweight node tree.
 *
 * Node shape: { name, attrs, children: Node[], text }
 * `text` is the concatenation of the element's own text and all descendant
 * text, so el.text returns the full textual content of a subtree.
 */
export function parseXml(input) {
  const src = String(input ?? "");
  const root = { name: "#document", attrs: {}, children: [], text: "" };
  const stack = [root];
  let i = 0;

  const appendText = (raw) => {
    if (!raw) return;
    const value = decodeEntities(raw);
    const top = stack[stack.length - 1];
    if (value.trim()) top.children.push({ name: "#text", attrs: {}, children: [], text: value });
  };

  while (i < src.length) {
    const lt = src.indexOf("<", i);

    if (lt < 0) {
      appendText(src.slice(i));
      break;
    }
    if (lt > i) appendText(src.slice(i, lt));

    // Comment
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    // CDATA
    if (src.startsWith("<![CDATA[", lt)) {
      const end = src.indexOf("]]>", lt + 9);
      const raw = src.slice(lt + 9, end < 0 ? src.length : end);
      const top = stack[stack.length - 1];
      if (raw.trim()) top.children.push({ name: "#text", attrs: {}, children: [], text: raw });
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    // Declaration, DOCTYPE, processing instruction
    if (src.startsWith("<?", lt) || src.startsWith("<!", lt)) {
      const end = src.indexOf(">", lt);
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    // Closing tag
    if (src.startsWith("</", lt)) {
      const end = src.indexOf(">", lt);
      if (end < 0) break;
      const name = src.slice(lt + 2, end).trim();
      // Pop to the matching element, tolerating stray closers.
      for (let d = stack.length - 1; d > 0; d--) {
        if (stack[d].name === name) {
          stack.length = d;
          break;
        }
      }
      i = end + 1;
      continue;
    }
    // Opening tag
    {
      const end = src.indexOf(">", lt);
      if (end < 0) break;
      let inner = src.slice(lt + 1, end);
      const selfClosing = inner.endsWith("/");
      if (selfClosing) inner = inner.slice(0, -1);

      const nameMatch = inner.match(/^([\w:.-]+)/);
      if (!nameMatch) {
        i = end + 1;
        continue;
      }
      const node = {
        name: nameMatch[1],
        attrs: parseAttributes(inner.slice(nameMatch[1].length)),
        children: [],
        text: "",
      };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
      i = end + 1;
    }
  }

  computeText(root);
  return root;
}

function computeText(node) {
  let acc = "";
  for (const child of node.children) {
    if (child.name === "#text") acc += child.text;
    else acc += computeText(child);
  }
  node.text = acc;
  return acc;
}

// ------------------------------------------------------------- query helpers

/** Direct child elements by name. */
export function children(el, name) {
  if (!el) return [];
  return el.children.filter((c) => c.name === name);
}

/** First direct child by name. */
export function child(el, name) {
  if (!el) return null;
  return el.children.find((c) => c.name === name) || null;
}

/** First direct child's text. */
export function childText(el, name) {
  const c = child(el, name);
  return c ? c.text.trim() : "";
}

/** Every matching element anywhere in the subtree. */
export function findAll(el, name, acc = []) {
  if (!el) return acc;
  for (const c of el.children) {
    if (c.name === name) acc.push(c);
    findAll(c, name, acc);
  }
  return acc;
}

/** First matching element anywhere in the subtree. */
export function find(el, name) {
  return findAll(el, name)[0] || null;
}
