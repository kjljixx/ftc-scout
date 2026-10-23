const HOVER_MEDIA = "(hover: hover)";

const isInsideHoverMedia = (node) => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type !== "atrule") continue;
    if (parent.name === "media" && parent.params.includes("hover:")) return true;
    if (parent.name.endsWith("keyframes")) return true;
  }
  return false;
};

const wrapHoverSelectorsInHoverMedia = () => ({
  postcssPlugin: "wrap-hover-selectors-in-hover-media",
  Once(root, { AtRule }) {
    const rules = [];
    root.walkRules((rule) => {
      if (rule.selector.includes(":hover") && !isInsideHoverMedia(rule)) rules.push(rule);
    });

    for (const rule of rules) {
      const hoverSelectors = rule.selectors.filter((s) => s.includes(":hover"));
      const otherSelectors = rule.selectors.filter((s) => !s.includes(":hover"));
      const media = new AtRule({ name: "media", params: HOVER_MEDIA });

      if (otherSelectors.length === 0) {
        rule.replaceWith(media);
        media.append(rule);
      } else {
        const hoverRule = rule.clone({ selectors: hoverSelectors });
        rule.selectors = otherSelectors;
        media.append(hoverRule);
        rule.after(media);
      }
    }
  },
});
wrapHoverSelectorsInHoverMedia.postcss = true;

export default {
  plugins: [wrapHoverSelectorsInHoverMedia()],
};
