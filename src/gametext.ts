// The game's own text from Wowhead's pages: its markup turned back into the
// game's (lines, $N $C $R, $gmale:female;), nothing else changed. Wowhead
// writes the reader's name, class and race in the page's language (<nom>,
// <Klasse>) and a gendered word as <male/female> ("der Überbringer/die
// Überbringerin"); any other <...> is the game's own aside (<texte
// illisible>, <Angela points to her head.>), kept.
const TOKENS: Record<string, string> = {
  nom: "$N", name: "$N", nombre: "$N",
  classe: "$C", class: "$C", klasse: "$C", clase: "$C",
  race: "$R", rasse: "$R", volk: "$R", raza: "$R",
};
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** A book's page: lines as new lines. */
export function gamePage(html: string): string {
  return html
    .replace(/&lt;([^&]{1,40})&gt;/g, (aside, t: string) => {
      const token = TOKENS[t.toLowerCase()];
      if (token) return token;
      const parts = t.split("/");
      return parts.length === 2 && !/[.!?]/.test(t) ? `$g${parts[0]}:${parts[1]};` : aside;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h\d)>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m),
    )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A quest's text: its lines as the game's $B, the reader's name and the
 * like as its tokens whether the page wrote them as markup or as text, and
 * Wowhead's own tip after it ("See if you've already completed this...") cut. */
export function gameQuestText(html: string): string {
  const cut = html.search(/See if you(?:'|&#39;|&#x27;|\u2019)ve already completed this/i);
  const text = (cut >= 0 ? html.slice(0, cut) : html)
    // (an aside or a token written as text, <name>, <lad/lass>, <Angela points
    // to her head.>, made the page's &lt;...&gt;; a tag stays a tag)
    .replace(/<([^<>]{1,120})>/g, (m, t: string) =>
      /^\/?(a|b|i|u|p|br|em|div|span|strong|small|ul|ol|li|pre|script|table|tr|td|img|h\d)(\s|\/|$)/i.test(t) ? m : `&lt;${t}&gt;`,
    )
    .replace(/<(script|pre)\b[\s\S]*?<\/\1>/gi, "");
  return gamePage(text)
    .replace(/\n/g, "$B")
    .replace(/(\$B){3,}/g, "$B$B")
    .replace(/^(\$B)+|(\$B)+$/g, "")
    .trim();
}
